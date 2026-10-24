from __future__ import annotations

import json
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from types import TracebackType
from typing import TypedDict

from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter


class HTTPReceipt(TypedDict):
    path: str
    payload: dict[str, JsonValue]


class FixtureMessage(BaseModel):
    model_config = ConfigDict(frozen=True)
    role: str


class FixtureModelRequest(BaseModel):
    model_config = ConfigDict(frozen=True)
    model: str
    messages: list[FixtureMessage]


class FixtureCleanupError(RuntimeError):
    pass


class DesktopFixture:
    """Owned HTTP fixture; mutable receipts capture actual requests."""

    def __init__(self) -> None:
        self.receipts: list[HTTPReceipt] = []
        self.on_tool: Callable[[], None] | None = None
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                payload = TypeAdapter(dict[str, JsonValue]).validate_json(
                    self.rfile.read(int(self.headers["Content-Length"]))
                )
                owner.receipts.append({"path": self.path, "payload": payload})
                code = 200
                if self.path == "/tools/echo":
                    if owner.on_tool is not None:
                        owner.on_tool()
                    body = json.dumps({"echo": payload["arguments"]})
                elif self.headers.get("Authorization") != "Bearer fixture-only":
                    code = 401
                    body = json.dumps(
                        {
                            "error": {
                                "message": "Fixture credential rejected",
                                "type": "authentication_error",
                                "code": "invalid_api_key",
                            }
                        }
                    )
                elif payload.get("model") == "openai/unavailable":
                    code = 404
                    body = json.dumps(
                        {
                            "error": {
                                "message": "Fixture model unavailable",
                                "type": "invalid_request_error",
                                "code": "model_not_found",
                            }
                        }
                    )
                else:
                    model_request = FixtureModelRequest.model_validate(payload)
                    final = any(message.role == "tool" for message in model_request.messages)
                    message = (
                        {"role": "assistant", "content": "Fixture completed"}
                        if final
                        else {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "fixture-call",
                                    "type": "function",
                                    "function": {
                                        "name": "desktop_fixture_echo",
                                        "arguments": json.dumps(
                                            {
                                                "arguments_json": '{"text":"owned fixture"}',
                                            }
                                        ),
                                    },
                                }
                            ],
                        }
                    )
                    body = json.dumps(
                        {
                            "id": "fixture-response",
                            "object": "chat.completion",
                            "created": 0,
                            "model": payload["model"],
                            "choices": [
                                {
                                    "index": 0,
                                    "message": message,
                                    "finish_reason": "stop" if final else "tool_calls",
                                }
                            ],
                            "usage": {
                                "prompt_tokens": 1,
                                "completion_tokens": 1,
                                "total_tokens": 2,
                            },
                        }
                    )
                raw = body.encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, format: str, *args: str) -> None:
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> DesktopFixture:
        self.thread.start()
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        if self.thread.is_alive():
            raise FixtureCleanupError()
