import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from decepticon.authorization import MAX_ROE_BYTES
from decepticon.server.plugins_api import app
from decepticon_core.registry import RoleRegistry


@pytest.fixture
def reviewed_roe() -> bytes:
    return json.dumps(
        {
            "engagement_name": "local-review",
            "client": "Local operator",
            "start_date": "2026-10-17",
            "end_date": "2026-10-17",
            "engagement_type": "external",
            "testing_window": "09:00-17:00 UTC",
            "in_scope": [{"target": "127.0.0.1", "type": "ip-range"}],
            "authorization_reference": "Synthetic local fixture",
            "extension": {"retain_original_bytes": True},
        },
        indent=2,
    ).encode("utf-8")


def test_validation_reports_original_byte_identity_without_provisioning(
    reviewed_roe: bytes, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DECEPTICON_WORKSPACE_PATH", str(tmp_path))
    response = TestClient(app).post(
        "/_decepticon/roe/validate",
        content=reviewed_roe,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "sha256": hashlib.sha256(reviewed_roe).hexdigest(),
        "engagement_name": "local-review",
    }
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("field", ["client", "testing_window", "engagement_type"])
def test_validation_rejects_missing_canonical_fields(reviewed_roe: bytes, field: str) -> None:
    document = json.loads(reviewed_roe)
    del document[field]
    response = TestClient(app).post("/_decepticon/roe/validate", json=document)
    assert response.status_code == 422


@pytest.mark.parametrize("field", ["engagement_name", "authorization_reference"])
def test_validation_rejects_blank_operator_declarations(reviewed_roe: bytes, field: str) -> None:
    document = json.loads(reviewed_roe)
    document[field] = " "
    response = TestClient(app).post("/_decepticon/roe/validate", json=document)
    assert response.status_code == 422


def test_validation_rejects_empty_scope(reviewed_roe: bytes) -> None:
    document = json.loads(reviewed_roe)
    document["in_scope"] = []
    response = TestClient(app).post("/_decepticon/roe/validate", json=document)
    assert response.status_code == 422


def test_validation_limits_the_actual_streamed_body() -> None:
    response = TestClient(app).post("/_decepticon/roe/validate", content=b" " * (MAX_ROE_BYTES + 1))
    assert response.status_code == 413


def test_validation_does_not_echo_invalid_sensitive_values(reviewed_roe: bytes) -> None:
    document = json.loads(reviewed_roe)
    document["client"] = {"sensitive": "do-not-reflect-this-value"}
    response = TestClient(app).post("/_decepticon/roe/validate", json=document)
    assert response.status_code == 422
    assert "do-not-reflect-this-value" not in response.text


@pytest.mark.parametrize(
    ("role", "purpose"),
    [
        ("soundwave", "planning"),
        ("blue_cell", "observation"),
        ("recon", "execution"),
        ("unknown-execution-plugin", "execution"),
    ],
)
def test_role_metadata_defaults_unknown_roles_to_execution(role: str, purpose: str) -> None:
    response = TestClient(app).get(f"/_decepticon/roles/{role}/purpose")
    assert response.status_code == 200
    assert response.json() == {"role": role, "purpose": purpose}


def test_plugin_role_can_explicitly_declare_planning_purpose() -> None:
    RoleRegistry.register("fixture-planner", slots=frozenset(), purpose="planning")
    try:
        response = TestClient(app).get("/_decepticon/roles/fixture-planner/purpose")
        assert response.json() == {"role": "fixture-planner", "purpose": "planning"}
    finally:
        RoleRegistry.unregister("fixture-planner")
