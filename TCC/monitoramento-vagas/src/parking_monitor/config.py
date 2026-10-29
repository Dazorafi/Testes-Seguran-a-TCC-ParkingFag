from dataclasses import dataclass
import json
import math
import os
from pathlib import Path
import re


def load_env(path: Path = Path(".env")) -> None:
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class SpotConfig:
    code: str
    sector: str
    accessible: bool
    order: int
    polygon: tuple[tuple[float, float], ...]
    free_max: float = 0.025
    occupied_min: float = 0.045

    def payload(self, status: str) -> dict:
        return {
            "spotCode": self.code,
            "status": status,
            "sector": self.sector,
            "accessible": self.accessible,
            "layoutOrder": self.order,
            "polygon": [{"x": x, "y": y} for x, y in self.polygon],
        }


def load_spots(path: str) -> list[SpotConfig]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    spots, codes = [], set()
    for item in data["spots"]:
        code = item["spotCode"]
        polygon = tuple((float(p["x"]), float(p["y"])) for p in item["polygon"])
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", code) or code in codes:
            raise ValueError("Código de vaga inválido ou duplicado")
        if (
            len(polygon) < 3
            or len(polygon) > 12
            or any(not math.isfinite(v) or not 0 <= v <= 1 for point in polygon for v in point)
        ):
            raise ValueError("Polígono deve ter coordenadas normalizadas entre 0 e 1")
        area = (
            abs(
                sum(
                    polygon[i][0] * polygon[(i + 1) % len(polygon)][1]
                    - polygon[(i + 1) % len(polygon)][0] * polygon[i][1]
                    for i in range(len(polygon))
                )
            )
            / 2
        )
        if area <= 0:
            raise ValueError("Polígono sem área")
        if not item["sector"] or len(item["sector"]) > 32 or item["layoutOrder"] < 0:
            raise ValueError("Setor ou ordem inválidos")
        codes.add(code)
        band = item.get("calibration", data.get("calibration", {}).get(item["sector"], {}))
        free_max, occupied_min = float(band.get("freeMax", 0.025)), float(band.get("occupiedMin", 0.045))
        if not 0 <= free_max < occupied_min <= 1:
            raise ValueError("Limiares de calibração inválidos")
        spots.append(
            SpotConfig(
                code,
                item["sector"],
                bool(item["accessible"]),
                item["layoutOrder"],
                polygon,
                free_max,
                occupied_min,
            )
        )
    if not spots:
        raise ValueError("Configure ao menos uma vaga real antes de iniciar")
    return spots
