"""Security regressions that import production Python modules, without camera/network services."""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import Mock

import pytest
import requests

from parking_monitor.communication import ApiClient, Communicator
from parking_monitor.config import SpotConfig, load_env, load_spots


@pytest.mark.parametrize("payload", ["' OR 1=1 --", "A; DROP TABLE parking_spots;--", "<script>alert(1)</script>", "$(echo probe)", "../../etc/passwd"])
def test_injection_in_config_identifier_is_rejected(tmp_path, payload):
    item = {"spotCode": payload, "sector": "A", "accessible": False, "layoutOrder": 0,
            "polygon": [{"x": .1, "y": .1}, {"x": .2, "y": .1}, {"x": .2, "y": .2}]}
    config = tmp_path / "spots.json"
    config.write_text(json.dumps({"spots": [item]}), encoding="utf-8")
    with pytest.raises(ValueError, match="Código"):
        load_spots(str(config))


def test_env_loader_does_not_execute_shell_or_override_existing_secret(tmp_path, monkeypatch):
    sentinel = tmp_path / "must-not-be-created"
    # A harmless canary command would create only this temporary test file if evaluated.
    payload = f'$(echo probe > "{sentinel}")'
    env_file = tmp_path / ".env"
    env_file.write_text(f"SECURITY_PROBE={payload}\nINGEST_API_KEY=replaced-by-file\n", encoding="utf-8")
    monkeypatch.delenv("SECURITY_PROBE", raising=False)
    monkeypatch.setenv("INGEST_API_KEY", "existing-test-secret")
    load_env(env_file)
    assert os.environ["SECURITY_PROBE"] == payload
    assert os.environ["INGEST_API_KEY"] == "existing-test-secret"
    assert not sentinel.exists()


def test_api_client_serializes_injection_as_json_and_keeps_key_in_header():
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            received.append((self.path, dict(self.headers), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"applied":1,"ignored":0}')

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    payload = "${7*7}; DROP TABLE parking_spots;--"
    try:
        client = ApiClient(f"http://127.0.0.1:{server.server_port}", "synthetic-test-key", timeout=2)
        assert client.post("logs", {"message": payload})["applied"] == 1
        path, headers, body = received[0]
        assert path == "/api/v1/logs"
        assert headers["X-API-Key"] == "synthetic-test-key"
        assert body == {"message": payload}
        assert "synthetic-test-key" not in path and "synthetic-test-key" not in json.dumps(body)
        client.session.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def test_retry_bounds_requests_during_automated_failure_burst():
    client = Mock(timeout=1)
    client.post.side_effect = requests.ConnectionError("synthetic offline failure")
    spot = SpotConfig("SEC-A", "A", False, 0, ((.1, .1), (.2, .1), (.2, .2)))
    worker = Communicator(client, [spot], "security-test", sync_seconds=15, retry_max=30)
    worker.publish({"SEC-A": "FREE"}, {}, "2026-10-28T12:00:00Z")
    for tick in range(1000):
        worker.flush(100 + tick / 1000)
    assert client.post.call_count == 1
    worker.flush(101)
    assert client.post.call_count == 2
    # Source-side backoff only; not a server anti-bot defense.


def test_log_queue_is_bounded_under_event_flood():
    worker = Communicator(Mock(timeout=1), [], "security-test")
    for i in range(1001):
        worker.event("INFO", f"synthetic-event-{i}")
    assert len(worker.logs) == 1000
    assert worker.logs[0]["message"] == "synthetic-event-1"
    assert worker.logs[-1]["message"] == "synthetic-event-1000"
