"""Regression against the shipped video, with the user's annotation: A-01 is empty.

No claim is made about an occupied A-01: this video contains no such ground truth.
"""
from pathlib import Path

import cv2
import numpy as np

from parking_monitor.config import load_spots
from parking_monitor.detection import StateStabilizer, TextureDetector


def test_tree_shadow_does_not_change_empty_accessible_spot():
    video = Path("video/estacionamento.mp4")
    assert video.exists(), "O vídeo de regressão deve estar disponível também na CI"
    spots = load_spots("config/spots.json")
    detector = TextureDetector(spots)
    # Original calibration, for a regression comparison of every other spot.
    from dataclasses import replace
    old = TextureDetector([replace(s, free_max=.12, occupied_min=.15) if s.code == "A-01" else s for s in spots])
    stabilizer = StateStabilizer([s.code for s in spots], 3)
    capture = cv2.VideoCapture(str(video))
    count = 0
    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        for sample in range(121):
            capture.set(cv2.CAP_PROP_POS_FRAMES, round(sample * fps / 2))
            ok, frame = capture.read()
            assert ok
            actual, previous = detector.detect(frame), old.detect(frame)
            assert actual["A-01"] == "FREE", f"Sombra em {sample / 2}s"
            assert {k: v for k, v in actual.items() if k != "A-01"} == {k: v for k, v in previous.items() if k != "A-01"}
            stabilizer.observe(actual)
            if sample >= 2:
                assert stabilizer.states["A-01"] == "FREE"
            count += 1
        assert count == 121
        spot = next(s for s in spots if s.code == "A-01")
        assert spot.accessible
        # High texture remains detectable; this is synthetic, not an occupied-video accuracy claim.
        textured = np.random.default_rng(1).integers(0, 256, frame.shape, dtype=np.uint8)
        assert detector.detect(textured)["A-01"] == "OCCUPIED"
    finally:
        capture.release()
