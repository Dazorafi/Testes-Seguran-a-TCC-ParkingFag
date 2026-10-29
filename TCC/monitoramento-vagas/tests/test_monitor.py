from unittest.mock import Mock, patch
import numpy as np
import pytest
import requests
from parking_monitor.communication import ApiClient, Communicator
from parking_monitor.config import SpotConfig, load_spots
from parking_monitor.detection import StateStabilizer, TextureDetector
from parking_monitor.video import LoopingVideo


@pytest.fixture
def spot():
    return SpotConfig("A-01", "A", True, 0, ((0.1, 0.1), (0.5, 0.1), (0.5, 0.5), (0.1, 0.5)))


def test_transition_requires_consistent_observations():
    states = StateStabilizer(["A-01"], 3)
    assert states.observe({"A-01": "FREE"}) == {}
    assert states.observe({"A-01": "OCCUPIED"}) == {}
    assert states.observe({"A-01": "FREE"}) == {}
    states.observe({"A-01": "FREE"})
    assert states.observe({"A-01": "FREE"}) == {"A-01": "FREE"}
    assert states.states["A-01"] == "FREE"
    with pytest.raises(ValueError):
        states.observe({"A-01": "BAD"})


def test_detects_free_occupied_and_ambiguous_spots(spot):
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    detector = TextureDetector([spot])
    assert detector.detect(frame) == {"A-01": "FREE"}
    frame = np.random.default_rng(10).integers(0, 255, (100, 100, 3), dtype=np.uint8)
    assert detector.detect(frame) == {"A-01": "OCCUPIED"}
    ambiguous = SpotConfig(spot.code, spot.sector, spot.accessible, spot.order, spot.polygon, 0, 0.9)
    assert TextureDetector([ambiguous]).detect(frame) == {"A-01": "UNKNOWN"}
    with pytest.raises(ValueError):
        detector.detect(None)


def test_payload_preserves_geometry_and_accessibility(spot):
    payload = spot.payload("FREE")
    assert payload["spotCode"] == "A-01"
    assert payload["accessible"] is True
    assert payload["polygon"][0] == {"x": 0.1, "y": 0.1}


def test_retry_does_not_block_publication_and_recovers_latest_state(spot):
    client = Mock(timeout=1)
    client.post.side_effect = requests.ConnectionError()
    worker = Communicator(client, [spot], "parking-video")
    worker.publish({"A-01": "FREE"}, {"A-01": "FREE"}, "2026-10-07T10:00:00.000000Z")
    worker.flush(100)
    calls = client.post.call_count
    worker.publish({"A-01": "OCCUPIED"}, {"A-01": "OCCUPIED"}, "2026-10-07T10:00:01.000000Z")
    worker.flush(100.5)
    assert client.post.call_count == calls
    client.post.side_effect = None
    worker.flush(101)
    payload = client.post.call_args_list[calls].args[1]
    assert payload["spots"][0]["status"] == "OCCUPIED"
    assert worker.pending == {}
    assert worker.unavailable is False


def test_periodic_sync_and_change_events_avoid_requests_per_frame(spot):
    client = Mock(timeout=1)
    worker = Communicator(client, [spot], "parking-video", sync_seconds=15)
    worker.publish({"A-01": "FREE"}, {}, "2026-10-07T10:00:00.000000Z")
    worker.flush(100)
    worker.flush(101)
    assert client.post.call_count == 1
    worker.publish({"A-01": "OCCUPIED"}, {"A-01": "OCCUPIED"}, "2026-10-07T10:00:02.000000Z")
    worker.flush(102)
    assert client.post.call_args.args[0] == "parking-spots/events"
    worker.flush(115)
    assert client.post.call_args.args[0] == "parking-spots/sync"


def test_changes_arriving_during_request_are_preserved(spot):
    client = Mock(timeout=1)
    worker = Communicator(client, [spot], "parking-video")
    worker.publish({"A-01": "FREE"}, {"A-01": "FREE"}, "2026-10-07T10:00:00Z")
    client.post.side_effect = lambda *_: worker.publish(
        {"A-01": "OCCUPIED"}, {"A-01": "OCCUPIED"}, "2026-10-07T10:00:01Z"
    )
    worker.flush(100)
    assert worker.pending["A-01"]["status"] == "OCCUPIED"


def test_client_sets_timeout_and_raises_http_errors():
    client = ApiClient("http://localhost:8080", "key", timeout=2)
    client.session = Mock()
    client.session.post.return_value.raise_for_status.side_effect = requests.HTTPError()
    with pytest.raises(requests.HTTPError):
        client.post("parking-spots/events", {})
    assert client.session.post.call_args.kwargs["timeout"] == 2


def test_video_eof_loops_and_read_failure_is_not_eof():
    capture = Mock()
    capture.isOpened.return_value = True
    capture.get.side_effect = [24, 10, 10]
    capture.read.side_effect = [(False, None), (True, np.ones((2, 2, 3), dtype=np.uint8))]
    with patch("parking_monitor.video.cv2.VideoCapture", return_value=capture):
        video = LoopingVideo("fixture.mp4")
        assert video.read().size == 12
        assert video.loops == 1
        capture.set.assert_called_once()
    capture.get.side_effect = [24, 10, 3]
    capture.read.side_effect = [(False, None)]
    with patch("parking_monitor.video.cv2.VideoCapture", return_value=capture):
        video = LoopingVideo("fixture.mp4")
        with pytest.raises(OSError):
            video.read()


def test_real_configuration_has_unique_codes_and_accessible_spots():
    spots = load_spots("config/spots.json")
    assert len({s.code for s in spots}) == len(spots)
    assert any(s.accessible for s in spots)
