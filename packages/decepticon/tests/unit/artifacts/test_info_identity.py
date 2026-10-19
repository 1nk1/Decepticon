from hashlib import sha256
from pathlib import Path

import pytest
from deepagents.backends import FilesystemBackend

from decepticon.artifacts import (
    ActorContext,
    ArtifactDraft,
    ArtifactError,
    ArtifactKind,
    ArtifactLink,
    ArtifactRegistry,
    CommitRequest,
    DraftUpdate,
    commit,
    create,
    list_artifacts,
    materialize,
    update_draft,
)


def test_info_log_identity_survives_edits_and_checkpoint_reload(tmp_path: Path) -> None:
    # Given two committed entries and a pending edit after checkpoint reload.
    actor = ActorContext(actor="parent", role="orchestrator")
    registry = ArtifactRegistry()
    log_uuid = registry.information_log_uuid
    for number in range(2):
        draft = ArtifactDraft(kind=ArtifactKind.INFO_ENTRY, title=f"Control {number}", slug=f"control-result-{number}", body="Initial observation")
        registry = create(registry, draft, f"create-{number}")
        entry = list_artifacts(registry)[-1]
        registry = commit(registry, CommitRequest(document_uuid=entry.document_uuid, expected_revision=0, operation_key=f"commit-{number}", reason="observation"), actor)
    registry = ArtifactRegistry.model_validate_json(registry.model_dump_json())
    entry = list_artifacts(registry)[0]
    registry = update_draft(registry, DraftUpdate(document_uuid=entry.document_uuid, expected_draft_version=entry.draft_version, draft=entry.draft.model_copy(update={"body": "Updated observation"})), actor)
    # When the edit is committed and the restored registry materializes the file.
    registry = commit(registry, CommitRequest(document_uuid=entry.document_uuid, expected_revision=1, operation_key="edit-commit", reason="new observation"), actor)
    result = materialize(registry, FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
    # Then aggregate identity is stable, distinct from entries, and revision sums commits.
    rendered = (tmp_path / "findings/info_observations-and-negative-results.md").read_text()
    header = dict(line.split(": ", 1) for line in rendered.split("---", 2)[1].strip().splitlines())
    assert result.information_log is not None
    assert result.information_log.markdown == rendered
    assert result.information_log.markdown_sha256 == sha256(rendered.encode()).hexdigest()
    assert result.information_log.revision == 3
    assert len(result.information_log.entries) == 2
    assert result.information_log_uuid == log_uuid
    assert header["document_uuid"] == str(log_uuid)
    assert header["revision"] == "3"
    assert all(artifact.document_uuid != log_uuid for artifact in list_artifacts(result))
    assert list_artifacts(result)[0].document_uuid == entry.document_uuid
    assert ArtifactRegistry.model_validate_json(result.model_dump_json()).information_log_uuid == log_uuid


def initial_info() -> ArtifactRegistry:
    actor = ActorContext(actor="parent", role="orchestrator")
    draft = ArtifactDraft(kind=ArtifactKind.INFO_ENTRY, title="Control", slug="control-result", body="Observation")
    registry = create(ArtifactRegistry(), draft, "create")
    entry = list_artifacts(registry)[0]
    return commit(registry, CommitRequest(document_uuid=entry.document_uuid, expected_revision=0, operation_key="commit", reason="observation"), actor)


def test_info_snapshot_remains_identical_when_draft_edit_is_materialized(tmp_path: Path) -> None:
    # Given a published Info log and an uncommitted entry edit.
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    original = materialize(initial_info(), backend)
    path = tmp_path / f"plan/artifacts/{original.information_log_uuid}/000001.json"
    snapshot = path.read_bytes()
    entry = list_artifacts(original)[0]
    actor = ActorContext(actor="parent", role="orchestrator")
    pending = update_draft(original, DraftUpdate(document_uuid=entry.document_uuid, expected_draft_version=1, draft=entry.draft.model_copy(update={"body": "Uncommitted"})), actor)
    # When rematerialized and retried after checkpoint parsing.
    result = materialize(ArtifactRegistry.model_validate_json(pending.model_dump_json()), backend)
    # Then committed aggregate bytes and revision remain unchanged.
    assert result.information_log == original.information_log
    assert path.read_bytes() == snapshot
    assert len(list(path.parent.glob("*.json"))) == 1


def test_info_snapshot_remains_identical_when_noop_commit_is_retried(tmp_path: Path) -> None:
    # Given a published aggregate and an explicit unchanged commit.
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    original = materialize(initial_info(), backend)
    entry = list_artifacts(original)[0]
    actor = ActorContext(actor="parent", role="orchestrator")
    request = CommitRequest(document_uuid=entry.document_uuid, expected_revision=1, operation_key="noop", reason="handoff")
    registry = commit(original, request, actor)
    registry = commit(registry, request, actor)
    # When the unchanged commit is materialized.
    result = materialize(registry, backend)
    # Then no new aggregate snapshot or revision is produced.
    assert result.information_log == original.information_log
    assert len(list((tmp_path / f"plan/artifacts/{result.information_log_uuid}").glob("*.json"))) == 1


def test_report_can_pin_committed_information_log(tmp_path: Path) -> None:
    # Given the published aggregate revision and exact Markdown hash.
    registry = materialize(initial_info(), FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
    projection = registry.information_log
    assert projection is not None
    link = ArtifactLink(relation="reports", document_uuid=projection.document_uuid, revision=projection.revision, content_hash=projection.markdown_sha256)
    draft = ArtifactDraft(kind=ArtifactKind.ASSESSMENT_REPORT, title="Assessment", slug="security-assessment", body="Report", links=(link,))
    # When the report is created with a pinned container reference.
    result = create(registry, draft, "report")
    # Then the stable aggregate UUID reference is retained.
    assert list_artifacts(result)[-1].draft.links == (link,)


@pytest.mark.parametrize("revision, content_hash", [(1, None), (2, "0" * 64)])
def test_report_rejects_mismatched_information_log_pin(tmp_path: Path, revision: int, content_hash: str | None) -> None:
    # Given aggregate revision two and a stale revision or mismatched hash.
    registry = initial_info()
    entry = list_artifacts(registry)[0]
    actor = ActorContext(actor="parent", role="orchestrator")
    registry = update_draft(registry, DraftUpdate(document_uuid=entry.document_uuid, expected_draft_version=1, draft=entry.draft.model_copy(update={"body": "New observation"})), actor)
    registry = commit(registry, CommitRequest(document_uuid=entry.document_uuid, expected_revision=1, operation_key="second", reason="new observation"), actor)
    registry = materialize(registry, FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
    projection = registry.information_log
    assert projection is not None
    link = ArtifactLink(relation="reports", document_uuid=projection.document_uuid, revision=revision, content_hash=content_hash or projection.markdown_sha256)
    draft = ArtifactDraft(kind=ArtifactKind.ASSESSMENT_REPORT, title="Assessment", slug="security-assessment", body="Report", links=(link,))
    # When creating the report, then the incorrect pin is rejected.
    with pytest.raises(ArtifactError, match="Pinned information log reference"):
        create(registry, draft, "report")


def test_report_rejects_unpublished_information_log() -> None:
    # Given committed entries whose aggregate has not been published yet.
    registry = initial_info()
    link = ArtifactLink(relation="reports", document_uuid=registry.information_log_uuid, revision=1, content_hash="0" * 64)
    draft = ArtifactDraft(kind=ArtifactKind.ASSESSMENT_REPORT, title="Assessment", slug="security-assessment", body="Report", links=(link,))
    # When creating the report, then the missing aggregate projection is rejected.
    with pytest.raises(ArtifactError, match="no committed projection"):
        create(registry, draft, "report")
