"""Regression for optional dependencies omitted from the previous audit export."""

from pathlib import Path
from runpy import run_path

REPO = Path(__file__).resolve().parents[4]
registry_requirements = run_path(str(REPO / "scripts/export_audit_requirements.py"))[
    "registry_requirements"
]


def test_audit_includes_optional_registry_versions_without_publishing_local_sentinels(tmp_path):
    lock = tmp_path / "uv.lock"
    lock.write_text(
        """[[package]]
name = "optional-provider"
version = "1.2.3"
source = { registry = "https://pypi.org/simple" }
[[package]]
name = "optional-provider"
version = "1.3.0"
source = { registry = "https://pypi.org/simple" }
[[package]]
name = "decepticon"
version = "0.0.0"
source = { editable = "packages/decepticon" }
[[package]]
name = "decepticon-workspace"
version = "0.0.0"
source = { virtual = "." }
"""
    )
    assert registry_requirements(lock) == ["optional-provider==1.2.3", "optional-provider==1.3.0"]


def test_real_lock_audits_the_previously_omitted_optional_packages():
    lines = registry_requirements(REPO / "uv.lock")
    for name in ("aiohttp", "filelock", "mcp"):
        assert any(line.startswith(f"{name}==") for line in lines)
    assert not any(line.startswith("decepticon") for line in lines)
