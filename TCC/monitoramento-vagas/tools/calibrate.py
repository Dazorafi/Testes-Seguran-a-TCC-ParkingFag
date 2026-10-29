"""Inspect real video regions and texture densities; does not invent parking spots."""

import argparse
from pathlib import Path
import cv2
import numpy as np
from parking_monitor.config import load_spots
from parking_monitor.main import overlay
from parking_monitor.detection import TextureDetector

parser = argparse.ArgumentParser()
parser.add_argument("video")
parser.add_argument("--config", default="config/spots.json")
parser.add_argument("--second", type=float, default=0)
parser.add_argument("--output", default="runtime/calibration.png")
args = parser.parse_args()
capture = cv2.VideoCapture(args.video)
capture.set(cv2.CAP_PROP_POS_MSEC, args.second * 1000)
success, frame = capture.read()
capture.release()
if not success:
    raise SystemExit("Não foi possível ler o vídeo")
spots = load_spots(args.config)
detector = TextureDetector(spots)
states = detector.detect(frame)
gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 40, 100)
for spot in spots:
    pixels = edges[detector.regions[spot.code]]
    print(
        f"{spot.code}: {states[spot.code]} density={np.count_nonzero(pixels) / pixels.size:.4f} "
        f"freeMax={spot.free_max} occupiedMin={spot.occupied_min}"
    )
Path(args.output).parent.mkdir(parents=True, exist_ok=True)
cv2.imwrite(args.output, overlay(frame, spots, states))
