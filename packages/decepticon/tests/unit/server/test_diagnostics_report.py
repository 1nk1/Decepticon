from types import SimpleNamespace

from decepticon import diagnostics
from decepticon_core.contracts.slots import MiddlewareSlot


def test_fallback_matrix_reports_each_role_chain_independently(monkeypatch):
    monkeypatch.setattr(diagnostics, "_hitl_status", lambda: {"ok": False, "detail": "disabled"})
    monkeypatch.setattr(
        diagnostics,
        "_model_fallback_status",
        lambda: {
            "ok": True,
            "detail": "one role has a chain",
            "roles": {"decepticon": 1, "recon": 0},
        },
    )
    matrix = diagnostics.slot_matrix({"ok": True, "detail": "reachable"})
    assert str(MiddlewareSlot.MODEL_FALLBACK) in matrix["decepticon"]["resolved"]
    assert str(MiddlewareSlot.MODEL_FALLBACK) in matrix["recon"]["absent"]


def test_kg_diagnostics_reads_requested_engagement_revision_without_writes(monkeypatch):
    from decepticon.middleware.kg_internal import store

    reads = []

    class ReadOnlyStore:
        def execute_read(self, cypher, *, engagement):
            reads.append((cypher, engagement))
            assert "RETURN count(n)" in cypher
            return [{"nodes": 3}]

        def revision(self, *, engagement):
            assert engagement == "test-engagement"
            return "rev-test-engagement-42"

    monkeypatch.setattr(
        store.KGStoreConfig,
        "from_env",
        lambda: SimpleNamespace(uri="bolt://fixture", database="fixture"),
    )
    monkeypatch.setattr(store, "KGStore", lambda _config: ReadOnlyStore())
    result = diagnostics._kg_status("test-engagement")
    assert result["ok"] is True
    assert result["scope_nodes"] == 3
    assert "rev-test-engagement-42" in result["detail"]
    assert reads[0][1] == "test-engagement"


def test_sandbox_probe_only_reads_health_and_advertised_apis(monkeypatch):
    import json
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            body = (
                {"status": "ok"}
                if self.path == "/healthz"
                else {
                    "paths": {
                        name: {} for name in ("/execute_tmux", "/upload_files", "/download_files")
                    }
                }
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    monkeypatch.setenv("SANDBOX_URL", f"http://127.0.0.1:{server.server_port}")
    try:
        assert diagnostics._sandbox_status()["ok"] is True
        assert requests == ["/healthz", "/openapi.json"]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
