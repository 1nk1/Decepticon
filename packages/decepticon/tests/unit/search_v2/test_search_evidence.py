from pathlib import Path

from deepagents.backends import FilesystemBackend
from deepagents.backends.protocol import BackendProtocol

from decepticon.artifacts import (
    ActorContext,
    ArtifactDraft,
    ArtifactKind,
    ArtifactRegistry,
    CommitRequest,
    commit,
    create,
    list_artifacts,
)
from decepticon.middleware.artifact_tools import persist_artifacts
from decepticon.middleware.search_evidence import (
    ProofContext,
    SpecialistHandoff,
    import_specialist_edits,
    qualifying_findings,
    scoped_backend,
)

SCOPE = "a" * 64


def candidate(tmp_path: Path) -> tuple[ArtifactRegistry, BackendProtocol]:
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    draft = ArtifactDraft(
        kind=ArtifactKind.FINDING, title="Cross-tenant document read", slug="cross-tenant-document-read", severity="high",
        body="## Summary\nCross-tenant read.\n## Verification\nPending.\n## Impact\nPrivate document disclosed.\n## Remediation\nEnforce tenant scope.",
        metadata={
            "result_kind": "vulnerability", "verification_status": "unverified", "verification_rationale": "pending", "report_status": "complete",
            "cvss_score": 7.5, "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", "cvss_version": "3.1",
            "affected_target": "fixture.invalid", "evidence_pointer": "findings/evidence/proof.http",
            "evidence_manifest": [{"path": "findings/evidence/control.http", "role": "control"}],
        },
    )
    registry = create(ArtifactRegistry(), draft, "candidate")
    artifact = list_artifacts(registry)[0]
    registry = commit(registry, CommitRequest(document_uuid=artifact.document_uuid, expected_revision=0, operation_key="commit", reason="candidate handoff"), ActorContext(actor="producer", role="decepticon"))
    registry = persist_artifacts(registry, backend, "/workspace/engagement")
    scoped = scoped_backend(backend, "/workspace/engagement")
    scoped.write("/workspace/findings/evidence/proof.http", "HTTP/1.1 200 OK\nOther test tenant document")
    scoped.write("/workspace/findings/evidence/control.http", "HTTP/1.1 403 Forbidden")
    return registry, scoped


def verify(registry: ArtifactRegistry, backend: BackendProtocol) -> ArtifactRegistry:
    artifact = list_artifacts(registry)[0]
    backend.edit("/workspace/" + artifact.current_path, '"verification_status": "unverified"', '"verification_status": "verified"')
    backend.edit("/workspace/" + artifact.current_path, '"verification_rationale": "pending"', '"verification_rationale": "Positive and matched negative control reproduced"')
    return import_specialist_edits(registry, backend, SpecialistHandoff(
        context=ActorContext(actor="run:verifier-task", role="finding_verifier"),
        assignment=artifact.current_path, scope_digest=SCOPE,
    ))


def test_high_goal_when_independent_verifier_returns_unchanged_evidence(tmp_path: Path) -> None:
    registry, backend = candidate(tmp_path)
    verified = verify(registry, backend)
    assert qualifying_findings(verified, backend, ProofContext(scope_digest=SCOPE, run_id="run")) == (str(list_artifacts(verified)[0].document_uuid),)
    assert list_artifacts(verified)[0].revisions[-1].author.role == "finding_verifier"


def test_high_goal_when_only_producer_claim_exists(tmp_path: Path) -> None:
    registry, backend = candidate(tmp_path)
    assert qualifying_findings(registry, backend, ProofContext(scope_digest=SCOPE)) == ()


def test_high_goal_when_evidence_changes_after_verification(tmp_path: Path) -> None:
    registry, backend = candidate(tmp_path)
    verified = verify(registry, backend)
    backend.edit("/workspace/findings/evidence/proof.http", "Other test tenant document", "New response without proof")
    assert qualifying_findings(verified, backend, ProofContext(scope_digest=SCOPE)) == ()


def test_high_goal_when_authorized_scope_changes(tmp_path: Path) -> None:
    registry, backend = candidate(tmp_path)
    verified = verify(registry, backend)
    assert qualifying_findings(verified, backend, ProofContext(scope_digest="b" * 64)) == ()


def test_verifier_import_when_edit_is_outside_assignment(tmp_path: Path) -> None:
    registry, backend = candidate(tmp_path)
    artifact = list_artifacts(registry)[0]
    backend.edit("/workspace/" + artifact.current_path, '"verification_status": "unverified"', '"verification_status": "verified"')
    result = import_specialist_edits(registry, backend, SpecialistHandoff(context=ActorContext(actor="other-task", role="finding_verifier"), assignment="findings/another-finding.md"))
    assert list_artifacts(result)[0].revision == 1
