"""Commit-time rejection of OPPLANs that declare no edge into prerequisite stages."""

from __future__ import annotations

from decepticon.middleware.workflow_opplan import validate_workflow_plan
from decepticon.workflows import WorkflowSnapshot
from decepticon_core.types.engagement import (
    Objective,
    ObjectivePhase,
    ObjectiveStatus,
    PlanFact,
)


def workflow() -> WorkflowSnapshot:
    return WorkflowSnapshot.from_source("""---
id: research
version: '1'
description: Proof-gated research
stages:
  - id: analyze
    specialist: reverser
    required_artifacts: [evidence/proof.md]
  - id: verify
    specialist: finding_verifier
    depends_on: [analyze]
    required_artifacts: [evidence/verification.md]
---
## Common
Use supplied source or PoC directly for analysis.
""")


def workflow_without_dependencies() -> WorkflowSnapshot:
    return WorkflowSnapshot.from_source("""---
id: sweep
version: '1'
description: Independent stages
stages:
  - id: analyze
    specialist: reverser
  - id: verify
    specialist: finding_verifier
---
## Common
Use supplied source or PoC directly for analysis.
""")


def objective(
    identifier: str,
    stage: str,
    owner: str,
    status: ObjectiveStatus,
    *,
    blocked_by: list[str] | None = None,
    any_of: list[list[str]] | None = None,
    evidence_refs: list[str] | None = None,
    required_fact_ids: list[str] | None = None,
) -> Objective:
    return Objective(
        id=identifier,
        phase=ObjectivePhase.RECON,
        title=identifier,
        description="Inspect authorized input",
        acceptance_criteria=["proof"],
        priority=1,
        workflow_stage=stage,
        blocked_by=blocked_by or [],
        any_of=any_of or [],
        owner=owner,
        status=status,
        evidence_refs=evidence_refs or [],
        required_fact_ids=required_fact_ids or [],
    )


def _pass(_: list[str]) -> str | None:
    return None


def _producer():
    return objective(
        "producer",
        "analyze",
        "reverser",
        ObjectiveStatus.PENDING,
        evidence_refs=["/workspace/evidence/proof.md"],
    )


def _target(**kwargs):
    return objective("target", "verify", "finding_verifier", ObjectiveStatus.PENDING, **kwargs)


def _fact(producer_id: str = "producer") -> PlanFact:
    return PlanFact(
        id="f1",
        producer_id=producer_id,
        summary="Analyzed supplied source",
        evidence_refs=["/workspace/evidence/proof.md"],
        verified=True,
    )


def test_flat_plan_rejected_at_commit_with_actionable_error() -> None:
    producer = _producer()
    target = _target()
    error = validate_workflow_plan(
        workflow(),
        [producer, target],
        _pass,
        facts=[],
    )
    assert error is not None
    assert "declares no dependency edge" in error
    assert "analyze" in error


def test_blocked_by_edge_accepted() -> None:
    producer = _producer()
    target = _target(blocked_by=["producer"])
    assert validate_workflow_plan(workflow(), [producer, target], _pass) is None


def test_any_of_edge_accepted() -> None:
    producer = _producer()
    target = _target(any_of=[["producer"]])
    assert validate_workflow_plan(workflow(), [producer, target], _pass) is None


def test_fact_edge_accepted() -> None:
    producer = _producer()
    target = _target(required_fact_ids=["f1"])
    assert validate_workflow_plan(workflow(), [producer, target], _pass, facts=[_fact()]) is None


def test_multi_hop_edges_cover_transitive_dependency() -> None:
    mid = objective("mid", "analyze", "reverser", ObjectiveStatus.PENDING)
    target = _target(blocked_by=["mid"])
    assert validate_workflow_plan(workflow(), [mid, target], _pass) is None


def test_workflow_without_depends_on_accepts_flat_plan() -> None:
    producer = _producer()
    target = _target()
    assert (
        validate_workflow_plan(workflow_without_dependencies(), [producer, target], _pass) is None
    )


def test_unbound_stage_objectives_still_reported_by_bindings() -> None:
    producer = objective("producer", "ghost-stage", "reverser", ObjectiveStatus.PENDING)
    target = _target(blocked_by=["producer"])
    error = validate_workflow_plan(workflow(), [producer, target], _pass)
    assert error is not None
    assert "unregistered workflow_stage" in error
