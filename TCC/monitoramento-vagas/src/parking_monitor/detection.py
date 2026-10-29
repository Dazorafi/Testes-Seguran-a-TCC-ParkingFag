import cv2
import numpy as np
from .config import SpotConfig


class TextureDetector:
    """Texture density calibrated from real frames of a fixed camera.

    The inset region excludes white boundaries. The uncertainty band avoids
    forcing a binary answer when shadows, occlusion or movement affect texture.
    """

    def __init__(self, spots: list[SpotConfig]):
        self.spots = spots
        self.shape = None
        self.regions: dict[str, np.ndarray] = {}

    def detect(self, frame: np.ndarray) -> dict[str, str]:
        if frame is None or frame.size == 0:
            raise ValueError("Frame inválido")
        height, width = frame.shape[:2]
        if self.shape != (height, width):
            self.regions = {}
            for spot in self.spots:
                points = np.float32([(x * width, y * height) for x, y in spot.polygon])
                center = points.mean(axis=0)
                inset = ((points - center) * 0.65 + center).astype(np.int32)
                mask = np.zeros((height, width), dtype=np.uint8)
                cv2.fillConvexPoly(mask, inset, 255)
                self.regions[spot.code] = mask > 0
            self.shape = (height, width)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(cv2.GaussianBlur(gray, (3, 3), 0), 40, 100)
        states = {}
        for spot in self.spots:
            pixels = edges[self.regions[spot.code]]
            if not pixels.size:
                states[spot.code] = "UNKNOWN"
                continue
            density = float(np.count_nonzero(pixels) / pixels.size)
            if density <= spot.free_max:
                states[spot.code] = "FREE"
            elif density >= spot.occupied_min:
                states[spot.code] = "OCCUPIED"
            else:
                states[spot.code] = "UNKNOWN"
        return states


class StateStabilizer:
    def __init__(self, codes: list[str], confirmation_frames: int = 3):
        if confirmation_frames < 1:
            raise ValueError("Número de confirmações deve ser positivo")
        self.required = confirmation_frames
        self.states = dict.fromkeys(codes, "UNKNOWN")
        self.candidates: dict[str, tuple[str, int]] = {}

    def observe(self, statuses: dict[str, str]) -> dict[str, str]:
        changes = {}
        for code, status in statuses.items():
            if code not in self.states or status not in {"FREE", "OCCUPIED", "UNKNOWN"}:
                raise ValueError("Estado ou vaga inválidos")
            candidate, count = self.candidates.get(code, (status, 0))
            count = count + 1 if candidate == status else 1
            self.candidates[code] = (status, count)
            if count >= self.required and self.states[code] != status:
                self.states[code] = status
                changes[code] = status
        return changes
