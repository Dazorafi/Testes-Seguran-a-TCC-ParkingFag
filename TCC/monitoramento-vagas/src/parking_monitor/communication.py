from collections import deque
from datetime import datetime, timezone
import logging
import threading
import time
import requests
from .config import SpotConfig


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


class ApiClient:
    def __init__(self, base_url: str, api_key: str = "", timeout: float = 3):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        if api_key:
            self.session.headers["X-API-Key"] = api_key

    def post(self, endpoint: str, payload: dict):
        response = self.session.post(f"{self.base_url}/api/v1/{endpoint}", json=payload, timeout=self.timeout)
        response.raise_for_status()
        return response.json()


class Communicator:
    """Coalesce changes to the latest observed state; network work never blocks capture."""

    def __init__(
        self,
        client: ApiClient,
        spots: list[SpotConfig],
        source: str,
        sync_seconds: float = 15,
        retry_max: float = 30,
    ):
        self.client, self.spots, self.source = client, spots, source
        self.sync_seconds, self.retry_max = sync_seconds, retry_max
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.latest: tuple[dict[str, str], str] | None = None
        self.pending: dict[str, dict] = {}
        self.logs = deque(maxlen=1000)
        self.full_sync = True
        self.last_sync = 0.0
        self.retry_at = 0.0
        self.retry_delay = 1.0
        self.unavailable = False
        self.thread = threading.Thread(target=self.run, name="java-communication", daemon=True)

    def publish(self, states: dict[str, str], changes: dict[str, str], observed: str):
        with self.lock:
            self.latest = (states.copy(), observed)
            for code, status in changes.items():
                self.pending[code] = {"spotCode": code, "status": status, "observedAt": observed}

    def event(self, level: str, message: str):
        logging.log({"INFO": logging.INFO, "WARN": logging.WARNING, "ERROR": logging.ERROR}[level], message)
        with self.lock:
            if len(self.logs) == self.logs.maxlen:
                logging.warning("Fila de logs cheia; evento mais antigo permanece no arquivo local")
            self.logs.append(
                {"source": self.source, "level": level, "message": message, "createdAt": utc_now()}
            )

    def flush(self, now: float):
        if now < self.retry_at:
            return
        with self.lock:
            latest = self.latest
            events = list(self.pending.values())
            logs = list(self.logs)[:100]
        try:
            if latest:
                states, observed = latest
                if self.full_sync or now - self.last_sync >= self.sync_seconds:
                    self.client.post(
                        "parking-spots/sync",
                        {
                            "source": self.source,
                            "observedAt": observed,
                            "spots": [spot.payload(states[spot.code]) for spot in self.spots],
                        },
                    )
                    self.full_sync = False
                    self.last_sync = now
                elif events:
                    self.client.post("parking-spots/events", {"source": self.source, "events": events})
                with self.lock:
                    # Preserve changes that arrived while the request was in flight.
                    for event in events:
                        if self.pending.get(event["spotCode"]) == event:
                            self.pending.pop(event["spotCode"])
            if logs:
                self.client.post("logs", {"logs": logs})
                with self.lock:
                    for entry in logs:
                        if entry in self.logs:
                            self.logs.remove(entry)
            if self.unavailable:
                self.unavailable = False
                self.event("INFO", "Conexão com Java recuperada")
            self.retry_delay = 1
        except (requests.RequestException, ValueError):
            self.full_sync = True
            if not self.unavailable:
                self.unavailable = True
                self.event("WARN", "Java indisponível; estados recentes serão sincronizados na recuperação")
            self.retry_at = now + self.retry_delay
            self.retry_delay = min(self.retry_delay * 2, self.retry_max)

    def run(self):
        while not self.stop.is_set():
            self.flush(time.monotonic())
            self.stop.wait(0.25)

    def start(self):
        self.thread.start()

    def close(self):
        self.stop.set()
        self.thread.join(timeout=self.client.timeout + 1)
        if not self.thread.is_alive() and not self.unavailable:
            self.flush(time.monotonic())
