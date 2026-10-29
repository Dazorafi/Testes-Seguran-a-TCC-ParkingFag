import argparse
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import signal
import threading
import time
import cv2
import numpy as np
from .communication import ApiClient, Communicator, utc_now
from .config import load_env, load_spots
from .detection import StateStabilizer, TextureDetector
from .video import LoopingVideo


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps(
            {
                "createdAt": utc_now(),
                "source": "python",
                "level": record.levelname,
                "message": record.getMessage(),
            },
            ensure_ascii=False,
        )


def setup_logging():
    Path("runtime").mkdir(exist_ok=True)
    handler = RotatingFileHandler("runtime/monitor.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    console = logging.StreamHandler()
    for sink in (handler, console):
        sink.setFormatter(JsonFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler, console], force=True)


def overlay(frame, spots, states):
    height, width = frame.shape[:2]
    for spot in spots:
        points = np.array([(int(x * width), int(y * height)) for x, y in spot.polygon])
        color = {"FREE": (80, 210, 30), "OCCUPIED": (50, 60, 230), "UNKNOWN": (160, 160, 160)}[
            states[spot.code]
        ]
        cv2.polylines(frame, [points], True, color, 2)
        center = points.mean(axis=0).astype(int)
        state_label = {"FREE": "LIVRE", "OCCUPIED": "OCUPADA", "UNKNOWN": "INCERTA"}[states[spot.code]]
        label = spot.code + (" PCD" if spot.accessible else "") + " " + state_label
        cv2.putText(frame, label, tuple(center), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 4)
        cv2.putText(frame, label, tuple(center), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    return frame


def main():
    parser = argparse.ArgumentParser(description="Monitoramento de vagas reais por vídeo em loop")
    parser.add_argument("--max-seconds", type=float, default=0, help="Limite opcional para validação")
    parser.add_argument("--validate-config", action="store_true")
    display = parser.add_mutually_exclusive_group()
    display.add_argument("--preview", action="store_true", help="Exibir o vídeo com as vagas detectadas")
    display.add_argument("--headless", action="store_true", help="Executar sem janela de vídeo")
    args = parser.parse_args()
    load_env()
    preview = not args.headless and (args.preview or os.getenv("PREVIEW", "true").lower() == "true")
    spots = load_spots(os.getenv("SPOTS_CONFIG", "config/spots.json"))
    if args.validate_config:
        print(f"Configuração válida: {len(spots)} vagas, {sum(s.accessible for s in spots)} acessíveis")
        return
    setup_logging()
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    video_path = os.getenv("VIDEO_PATH", "video/estacionamento.mp4")
    fps = float(os.getenv("PROCESS_FPS", "2"))
    if not 0 < fps <= 24:
        raise ValueError("PROCESS_FPS deve ser maior que zero e no máximo 24")
    client = ApiClient(
        os.getenv("JAVA_API_URL", "http://localhost:8080"),
        os.getenv("INGEST_API_KEY", ""),
        float(os.getenv("HTTP_TIMEOUT_SECONDS", "3")),
    )
    communicator = Communicator(
        client,
        spots,
        os.getenv("MONITOR_SOURCE", "parking-video"),
        float(os.getenv("SYNC_SECONDS", "15")),
        float(os.getenv("RETRY_MAX_SECONDS", "30")),
    )
    stabilizer = StateStabilizer([s.code for s in spots], int(os.getenv("CONFIRM_FRAMES", "3")))
    communicator.start()
    communicator.event("INFO", "Monitoramento iniciado; vídeo em loop")
    video = None
    started = time.monotonic()
    failed = False
    samples = 0
    next_detection = 0.0
    loops_seen = 0
    try:
        detector = TextureDetector(spots)
        if preview:
            cv2.namedWindow("Parking FAG", cv2.WINDOW_NORMAL)
            cv2.resizeWindow("Parking FAG", 1280, 720)
            communicator.event("INFO", "Janela de vídeo com detecção iniciada")
        while not stop.is_set() and (not args.max_seconds or time.monotonic() - started < args.max_seconds):
            tick = time.monotonic()
            try:
                if video is None:
                    video = LoopingVideo(video_path)
                    loops_seen = 0
                frame = video.read()
                if video.loops > loops_seen:
                    communicator.event("INFO", "Vídeo reiniciado em loop")
                    loops_seen = video.loops
                if tick >= next_detection:
                    statuses = detector.detect(frame)
                    changes = stabilizer.observe(statuses)
                    samples += 1
                    # Confirm initial observations before replacing persisted states after restart.
                    if samples >= stabilizer.required:
                        communicator.publish(stabilizer.states, changes, utc_now())
                    next_detection = tick + 1 / fps
                if failed:
                    failed = False
                    communicator.event("INFO", "Captura de vídeo recuperada")
                if preview:
                    cv2.imshow("Parking FAG", overlay(frame.copy(), spots, stabilizer.states))
                    if (
                        cv2.waitKey(1) & 0xFF == ord("q")
                        or cv2.getWindowProperty("Parking FAG", cv2.WND_PROP_VISIBLE) < 1
                    ):
                        stop.set()
            except (OSError, ValueError, cv2.error):
                if not failed:
                    communicator.event("ERROR", "Falha de captura ou análise; último estado preservado")
                    failed = True
                if video:
                    video.close()
                video = None
                stop.wait(2)
            playback_fps = video.fps if video else fps
            stop.wait(max(0, 1 / playback_fps - (time.monotonic() - tick)))
    except Exception:
        communicator.event("ERROR", "Erro inesperado; monitoramento interrompido")
        raise
    finally:
        communicator.event("INFO", "Monitoramento encerrado")
        communicator.close()
        if video:
            video.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
