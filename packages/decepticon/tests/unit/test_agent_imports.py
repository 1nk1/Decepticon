from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from textwrap import dedent


def _run_import(code: str) -> subprocess.CompletedProcess[str]:
    root = Path(__file__).resolve().parents[4]
    env = dict(os.environ)
    env.pop("DECEPTICON_SKIP_BOOT", None)
    env["PYTHONPATH"] = os.pathsep.join(
        str(root / "packages" / package)
        for package in ("decepticon", "decepticon-core", "decepticon-sdk")
    )
    return subprocess.run(
        [sys.executable, "-c", dedent(code)],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def test_boot_and_factory_import_do_not_construct_agent_graphs() -> None:
    result = _run_import(
        """
        import importlib.abc
        import sys

        class RejectGraphImports(importlib.abc.MetaPathFinder):
            def find_spec(self, fullname, path=None, target=None):
                if fullname.startswith(("decepticon.agents.standard.", "decepticon.agents.plugins.")):
                    raise AssertionError("Unrequested graph module: " + fullname)
                return None

        sys.meta_path.insert(0, RejectGraphImports())
        import decepticon
        from decepticon.llm.factory import LLMFactory
        from decepticon_core.registry import RoleRegistry
        assert RoleRegistry.get("decepticon") is not None
        assert RoleRegistry.get("recon") is not None
        assert LLMFactory is not None
        """
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_requested_factory_preserves_identity_signature_and_discovery() -> None:
    result = _run_import(
        """
        import inspect
        import decepticon.agents as agents
        assert set(agents.__all__) <= set(dir(agents))
        from decepticon.agents import create_recon_agent
        from decepticon.agents.standard.recon import create_recon_agent as original
        assert create_recon_agent is original
        assert inspect.signature(create_recon_agent) == inspect.signature(original)
        assert agents.create_recon_agent is original
        try:
            agents.not_a_factory
        except AttributeError:
            pass
        else:
            raise AssertionError("Unknown attributes must retain Python module behavior")
        """
    )
    assert result.returncode == 0, result.stdout + result.stderr
