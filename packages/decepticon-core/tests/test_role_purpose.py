import pytest

from decepticon_core.registry import RoleRegistry


def test_undeclared_plugin_requires_execution_authorization() -> None:
    RoleRegistry.register("fixture-execution-purpose", slots=frozenset())
    try:
        spec = RoleRegistry.get("fixture-execution-purpose")
        assert spec is not None
        assert spec.purpose == "execution"
    finally:
        RoleRegistry.unregister("fixture-execution-purpose")


def test_explicit_planning_purpose_is_idempotent_and_cannot_silently_change() -> None:
    name = "fixture-planning-purpose"
    RoleRegistry.register(name, slots=frozenset(), purpose="planning")
    try:
        RoleRegistry.register(name, slots=frozenset(), purpose="planning")
        with pytest.raises(ValueError, match="different parameters"):
            RoleRegistry.register(name, slots=frozenset(), purpose="execution")
        spec = RoleRegistry.get(name)
        assert spec is not None
        assert spec.purpose == "planning"
    finally:
        RoleRegistry.unregister(name)
