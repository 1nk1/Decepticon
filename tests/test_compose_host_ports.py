"""Host publications must not change container listeners or browser origins."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_remapped_web_ports_preserve_internal_listener_and_browser_routes(tmp_path: Path) -> None:
    if shutil.which("docker") is None:
        pytest.skip("Docker Compose is required")
    env_file = tmp_path / ".env"
    # env_file is injected into the web service as well as used for Compose
    # interpolation. This reproduces the inherited host TERMINAL_PORT defect.
    env_file.write_text("WEB_PORT=13091\nTERMINAL_PORT=13094\nLANGGRAPH_PORT=12091\n")
    compose = (ROOT / "docker-compose.yml").read_text()
    compose = compose.replace("env_file: .env", f"env_file: {env_file}")
    fixture = tmp_path / "compose.yml"
    fixture.write_text(compose)
    env = {
        **os.environ,
        "WEB_PORT": "13091",
        "TERMINAL_PORT": "13094",
        "LANGGRAPH_PORT": "12091",
        "DECEPTICON_HOME": str(tmp_path),
    }
    rendered = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(fixture),
            "--env-file",
            str(env_file),
            "--profile",
            "web",
            "config",
            "--format",
            "json",
        ],
        env=env,
        text=True,
        capture_output=True,
        check=True,
        timeout=30,
    )
    web = json.loads(rendered.stdout)["services"]["web"]
    settings = web["environment"]
    assert settings["TERMINAL_PORT"] == "3003"
    assert settings["WEB_PORT"] == "13091"
    assert settings["NEXT_PUBLIC_TERMINAL_WS_URL"] == "ws://localhost:13094"
    assert settings["NEXT_PUBLIC_LANGGRAPH_API_URL"] == "http://localhost:12091"
    assert settings["LANGGRAPH_API_URL"] == "http://langgraph:2024"
    publications = {p["target"]: p["published"] for p in web["ports"]}
    assert publications == {3000: "13091", 3003: "13094"}
    assert all(p["host_ip"] == "127.0.0.1" for p in web["ports"])
