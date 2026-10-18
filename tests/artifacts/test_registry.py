from hashlib import sha256
from pathlib import Path
from uuid import uuid4

import pytest
from deepagents.backends import FilesystemBackend
from pydantic import ValidationError

from decepticon.artifacts import (
    ActorContext,
    ArtifactDraft,
    ArtifactError,
    ArtifactKind,
    ArtifactLink,
    ArtifactRegistry,
    CommitRequest,
    DraftUpdate,
    MaterializationError,
    commit,
    create,
    get_artifact,
    list_artifacts,
    materialize,
    update_draft,
)

ACTOR = ActorContext(actor="parent", role="orchestrator")


def draft() -> ArtifactDraft:
    return ArtifactDraft(kind=ArtifactKind.FINDING, title="테넌트 문서 읽기", slug="cross-tenant-document-read", severity="high", body="# Finding", metadata={"cvss_score": 8.1, "verification_status": "verified", "evidence": ["evidence/response.http"]})


def initial() -> ArtifactRegistry:
    return create(ArtifactRegistry(), draft(), "create")


def committed(registry: ArtifactRegistry) -> ArtifactRegistry:
    artifact = list_artifacts(registry)[0]
    return commit(registry, CommitRequest(document_uuid=artifact.document_uuid, expected_revision=artifact.revision, operation_key=f"commit-{artifact.revision}", reason="handoff"), ACTOR)


def test_multiple_draft_edits_make_one_snapshot_when_committed(tmp_path: Path) -> None:
    # Given a stable identity edited repeatedly without a commit.
    registry = initial()
    identity = list_artifacts(registry)[0].document_uuid
    for number in range(5):
        artifact = get_artifact(registry, identity)
        registry = update_draft(registry, DraftUpdate(document_uuid=identity, expected_draft_version=artifact.draft_version, draft=artifact.draft.model_copy(update={"body": f"revision body {number}"})), ACTOR)
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    # When one semantic milestone is committed and materialized.
    result = materialize(committed(registry), backend)
    # Then only one permanent snapshot exists and the rich Markdown is published.
    artifact = get_artifact(result, identity)
    assert artifact.revision == 1
    assert artifact.draft_version == 6
    assert len(list(tmp_path.glob("plan/artifacts/*/*.json"))) == 1
    content = (tmp_path / artifact.current_path).read_text()
    assert "테넌트 문서 읽기" in content and '"cvss_score": 8.1' in content
    assert artifact.current_path == "findings/high_01_cross-tenant-document-read.md"
    assert sha256(content.encode()).hexdigest() == artifact.revisions[-1].markdown_sha256
    assert ArtifactRegistry.model_validate_json((tmp_path / "plan/artifact-registry.json").read_text()) == result


def test_noop_and_idempotent_commit_when_retried() -> None:
    # Given an already committed request.
    registry = committed(initial())
    artifact = list_artifacts(registry)[0]
    # When the original commit and then unchanged content are committed.
    retry = commit(registry, CommitRequest(document_uuid=artifact.document_uuid, expected_revision=0, operation_key="commit-0", reason="handoff"), ACTOR)
    result = committed(retry)
    # Then no extra semantic revisions or UUIDs are allocated.
    assert list_artifacts(result)[0].revision == 1
    assert create(result, draft(), "create") == result
    with pytest.raises(ArtifactError, match="different input"):
        create(result, draft().model_copy(update={"body": "different"}), "create")


def test_stale_requests_are_rejected_when_revision_advanced() -> None:
    # Given an existing committed artifact.
    registry = committed(initial())
    artifact = list_artifacts(registry)[0]
    # When outdated revision or draft counters are submitted.
    with pytest.raises(ArtifactError, match="Stale committed"):
        commit(registry, CommitRequest(document_uuid=artifact.document_uuid, expected_revision=0, operation_key="stale", reason="handoff"), ACTOR)
    with pytest.raises(ArtifactError, match="Stale draft"):
        update_draft(registry, DraftUpdate(document_uuid=artifact.document_uuid, expected_draft_version=2, draft=draft()), ACTOR)
    # Then the original remains unchanged.
    assert list_artifacts(registry)[0].revision == 1


def test_rename_preserves_prior_snapshot_when_new_revision_committed(tmp_path: Path) -> None:
    # Given one published snapshot.
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    registry = materialize(committed(initial()), backend)
    artifact = list_artifacts(registry)[0]
    snapshot = tmp_path / f"plan/artifacts/{artifact.document_uuid}/000001.json"
    original = snapshot.read_bytes()
    changed = artifact.draft.model_copy(update={"severity": "medium", "slug": "tenant-document-disclosure"})
    registry = update_draft(registry, DraftUpdate(document_uuid=artifact.document_uuid, expected_draft_version=1, draft=changed), ACTOR)
    # When renamed and committed.
    result = materialize(committed(registry), backend)
    # Then identity/history remain stable and old view is an alias.
    current = list_artifacts(result)[0]
    assert current.document_uuid == artifact.document_uuid
    assert current.revision == 2 and current.label == "FIND-01"
    assert snapshot.read_bytes() == original
    assert current.revisions[-1].previous_hash == artifact.content_hash
    assert (tmp_path / artifact.current_path).read_text() == "Moved to [FIND-01](medium_01_tenant-document-disclosure.md).\n"


def test_uuid_links_validate_when_pinned() -> None:
    # Given a committed reference target.
    registry = committed(initial())
    target = list_artifacts(registry)[0]
    link = ArtifactLink(relation="supports", document_uuid=target.document_uuid, revision=1, content_hash=target.content_hash)
    hypothesis = ArtifactDraft(kind=ArtifactKind.HYPOTHESIS, title="Tenant boundary", slug="tenant-boundary-check", body="Evidence", links=(link,))
    # When linking by immutable revision/hash.
    result = create(registry, hypothesis, "hypothesis")
    # Then the system allocates a separate UUID and rejects dangling/corrupt links.
    assert list_artifacts(result)[1].current_path == "plan/hypotheses/HYP_01_tenant-boundary-check.md"
    assert list_artifacts(result)[1].document_uuid != target.document_uuid
    for bad_link in (link.model_copy(update={"document_uuid": uuid4()}), link.model_copy(update={"content_hash": "0" * 64})):
        with pytest.raises(ArtifactError):
            create(registry, hypothesis.model_copy(update={"links": (bad_link,)}), "bad")


@pytest.mark.parametrize("slug", ["../escape", "bad/name", "UPPER-case", "bad--slug", "a" * 81])
def test_malformed_slug_rejected_when_parsed(slug: str) -> None:
    # Given an untrusted filename slug.
    payload = draft().model_dump()
    payload["slug"] = slug
    # When parsing, then path traversal and malformed names fail.
    with pytest.raises(ValidationError):
        ArtifactDraft.model_validate(payload)


def test_reporter_preserves_verdict_when_updating_content() -> None:
    # Given an independent verification verdict.
    registry = committed(initial())
    artifact = list_artifacts(registry)[0]
    replacement = draft().model_copy(update={"body": "Report presentation", "metadata": {"verification_status": "unverified"}})
    reporter = ActorContext(actor="report", role="finding_reporter")
    # When the reporter updates the document.
    result = update_draft(registry, DraftUpdate(document_uuid=artifact.document_uuid, expected_draft_version=1, draft=replacement), reporter)
    # Then the independent verdict remains intact.
    assert list_artifacts(result)[0].draft.metadata["verification_status"] == "verified"


def test_info_entries_share_one_view_when_materialized(tmp_path: Path) -> None:
    # Given two structured info entries with distinct identities.
    registry = ArtifactRegistry()
    for number in range(2):
        entry = ArtifactDraft(kind=ArtifactKind.INFO_ENTRY, title=f"Control {number}", slug=f"control-result-{number}", body="Blocked", metadata={"kind": "negative_result", "target": "tenant"})
        registry = create(registry, entry, f"info-{number}")
        artifact = list_artifacts(registry)[-1]
        registry = commit(registry, CommitRequest(document_uuid=artifact.document_uuid, expected_revision=0, operation_key=f"info-commit-{number}", reason="result"), ACTOR)
    # When materialized.
    materialize(registry, FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
    # Then one log retains structured entries and stable labels.
    files = list((tmp_path / "findings").glob("*.md"))
    assert len(files) == 1
    assert "INFO-01" in files[0].read_text() and "INFO-02" in files[0].read_text()


def test_failed_materialization_is_retryable_when_view_parent_is_file(tmp_path: Path) -> None:
    # Given a filesystem obstruction after immutable snapshots can be written.
    registry = committed(initial())
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    obstruction = tmp_path / "findings"
    obstruction.write_text("obstruction")
    # When publication fails then the checkpoint stays unpublished.
    with pytest.raises((MaterializationError, FileExistsError, NotADirectoryError)):
        materialize(registry, backend)
    assert not registry.materialized
    assert not (tmp_path / "plan/artifact-registry.json").exists()
    obstruction.unlink()
    assert materialize(registry, backend).materialized


def test_snapshot_collision_rejected_when_existing_bytes_differ(tmp_path: Path) -> None:
    # Given a previously materialized immutable snapshot changed externally.
    registry = committed(initial())
    backend = FilesystemBackend(root_dir=tmp_path, virtual_mode=True)
    materialize(registry, backend)
    snapshot = next(tmp_path.glob("plan/artifacts/*/*.json"))
    snapshot.write_text("corrupted")
    # When retrying, then the collision is surfaced and never overwritten.
    with pytest.raises(MaterializationError, match="Immutable snapshot differs"):
        materialize(registry, backend)
    assert snapshot.read_text() == "corrupted"


def test_numbering_exceeds_two_digits_without_reset_when_severity_changes() -> None:
    # Given a durable reserved counter.
    registry = ArtifactRegistry(next_numbers={ArtifactKind.FINDING: 100})
    # When a finding is created at a new severity.
    result = create(registry, draft().model_copy(update={"severity": "low"}), "hundred")
    # Then minimum width expands naturally and the counter is never reset.
    artifact = list_artifacts(result)[0]
    assert artifact.label == "FIND-100"
    assert artifact.current_path == "findings/low_100_cross-tenant-document-read.md"
    assert result.next_numbers[ArtifactKind.FINDING] == 101


def test_renaming_back_preserves_current_view_when_alias_matches(tmp_path: Path) -> None:
    # Given a finding renamed once and then restored to its original path.
    registry = committed(initial())
    artifact = list_artifacts(registry)[0]
    for severity in ("medium", "high"):
        current = list_artifacts(registry)[0]
        replacement = ArtifactDraft.model_validate({**current.draft.model_dump(), "severity": severity})
        registry = update_draft(registry, DraftUpdate(document_uuid=current.document_uuid, expected_draft_version=current.draft_version, draft=replacement), ACTOR)
        registry = committed(registry)
    # When all views and aliases are materialized.
    materialize(registry, FilesystemBackend(root_dir=tmp_path, virtual_mode=True))
    # Then the live view is Markdown rather than a redirect to itself.
    assert (tmp_path / artifact.current_path).read_text().startswith("---\n")
    assert artifact.current_path not in list_artifacts(registry)[0].aliases
