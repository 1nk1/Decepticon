"""Pure registry transitions; callers serialize writes through the parent runtime."""
from hashlib import sha256
from typing import Final
from uuid import UUID, uuid4

from .models import (
    ActorContext,
    Artifact,
    ArtifactDraft,
    ArtifactError,
    ArtifactKind,
    ArtifactRegistry,
    ArtifactRevision,
    CommitRequest,
    DraftUpdate,
    OperationReceipt,
)
from .render import canonical_content, render_artifact

_PREFIXES: Final = {
    ArtifactKind.FINDING: "FIND", ArtifactKind.HYPOTHESIS: "HYP",
    ArtifactKind.ATTACK_PLAN: "AP", ArtifactKind.ATTACK_PATH: "PATH",
    ArtifactKind.INFO_ENTRY: "INFO", ArtifactKind.ASSESSMENT_REPORT: "REPORT",
}
_VERDICT_FIELDS: Final = frozenset({"verification_status", "verification", "verdict", "verified_by", "verified_revision", "verified_content_hash"})


def get_artifact(registry: ArtifactRegistry, document_uuid: UUID) -> Artifact:
    try:
        return registry.artifacts[str(document_uuid)]
    except KeyError as error:
        raise ArtifactError(f"Unknown document UUID: {document_uuid}") from error


def list_artifacts(registry: ArtifactRegistry, kind: ArtifactKind | None = None) -> tuple[Artifact, ...]:
    return tuple(artifact for artifact in registry.artifacts.values() if kind is None or artifact.draft.kind == kind)


def _replace(registry: ArtifactRegistry, artifact: Artifact) -> ArtifactRegistry:
    return registry.model_copy(update={"artifacts": {**registry.artifacts, str(artifact.document_uuid): artifact}, "materialized": False}, deep=True)


def _check_links(registry: ArtifactRegistry, draft: ArtifactDraft) -> None:
    for link in draft.links:
        if link.document_uuid == registry.information_log_uuid:
            projection = registry.information_log
            if projection is None:
                raise ArtifactError("Information log has no committed projection")
            historical = (*registry.information_log_history, projection)
            if link.revision is not None and not any(
                link.revision == item.revision and link.content_hash == item.markdown_sha256
                for item in historical
            ):
                raise ArtifactError("Pinned information log reference does not match the committed projection")
            continue
        target = get_artifact(registry, link.document_uuid)
        if link.revision is not None and (
            link.revision > target.revision
            or target.revisions[link.revision - 1].content_hash != link.content_hash
        ):
            raise ArtifactError("Pinned reference does not match a committed revision")


def create(registry: ArtifactRegistry, draft: ArtifactDraft, operation_key: str) -> ArtifactRegistry:
    if not operation_key:
        raise ArtifactError("Creation requires an idempotency key")
    fingerprint = "create:" + sha256(canonical_content(draft)).hexdigest()
    prior = registry.operations.get(operation_key)
    if prior is not None:
        if prior.fingerprint != fingerprint:
            raise ArtifactError("Idempotency key reused with different input")
        return registry
    _check_links(registry, draft)
    if draft.kind == ArtifactKind.ASSESSMENT_REPORT and list_artifacts(registry, draft.kind):
        raise ArtifactError("Only one assessment report is allowed")
    number = registry.next_numbers.get(draft.kind, 1)
    artifact = Artifact(document_uuid=uuid4(), label=f"{_PREFIXES[draft.kind]}-{number:02}", number=number, draft=draft)
    result = _replace(registry, artifact)
    return result.model_copy(update={
        "next_numbers": {**registry.next_numbers, draft.kind: number + 1},
        "operations": {**registry.operations, operation_key: OperationReceipt(fingerprint=fingerprint, document_uuid=artifact.document_uuid)},
    }, deep=True)


def update_draft(registry: ArtifactRegistry, update: DraftUpdate, context: ActorContext) -> ArtifactRegistry:
    artifact = get_artifact(registry, update.document_uuid)
    if artifact.draft_version != update.expected_draft_version:
        raise ArtifactError("Stale draft version")
    if artifact.draft.kind != update.draft.kind:
        raise ArtifactError("Document kind cannot change")
    _check_links(registry, update.draft)
    draft = update.draft
    if context.role in {"reporter", "report_generator", "finding_reporter"}:
        previous = artifact.revisions[-1].draft if artifact.revisions else artifact.draft
        metadata = {key: value for key, value in draft.metadata.items() if key not in _VERDICT_FIELDS}
        metadata.update({key: value for key, value in previous.metadata.items() if key in _VERDICT_FIELDS})
        draft = draft.model_copy(update={"metadata": metadata}, deep=True)
    if draft == artifact.draft:
        return registry
    return _replace(registry, artifact.model_copy(update={"draft": draft, "draft_version": artifact.draft_version + 1}, deep=True))


def commit(registry: ArtifactRegistry, request: CommitRequest, context: ActorContext) -> ArtifactRegistry:
    artifact = get_artifact(registry, request.document_uuid)
    fingerprint = "commit:" + sha256((request.model_dump_json() + context.model_dump_json()).encode()).hexdigest()
    prior = registry.operations.get(request.operation_key)
    if prior is not None:
        if prior.fingerprint != fingerprint:
            raise ArtifactError("Idempotency key reused with different input")
        return registry
    if artifact.revision != request.expected_revision:
        raise ArtifactError("Stale committed revision")
    content_hash = sha256(canonical_content(artifact.draft)).hexdigest()
    if context.role in {"reporter", "report_generator", "finding_reporter"} and artifact.revisions:
        previous = artifact.revisions[-1].draft.metadata
        if any(artifact.draft.metadata.get(key) != previous.get(key) for key in _VERDICT_FIELDS):
            raise ArtifactError("Reporter cannot overwrite an independent verdict")
    if content_hash != artifact.content_hash:
        markdown = render_artifact(artifact, artifact.revision + 1, content_hash)
        revision = ArtifactRevision(
            document_uuid=artifact.document_uuid, revision=artifact.revision + 1,
            content_hash=content_hash, draft=artifact.draft, relative_path=artifact.current_path,
            markdown=markdown, markdown_sha256=sha256(markdown.encode()).hexdigest(),
            previous_hash=artifact.content_hash, author=context, reason=request.reason,
        )
        aliases = artifact.aliases
        if artifact.revisions and artifact.revisions[-1].relative_path != artifact.current_path:
            aliases = tuple(path for path in dict.fromkeys((*aliases, artifact.revisions[-1].relative_path)) if path != artifact.current_path)
        artifact = artifact.model_copy(update={"revisions": (*artifact.revisions, revision), "aliases": aliases}, deep=True)
    result = _replace(registry, artifact)
    return result.model_copy(update={"operations": {**registry.operations, request.operation_key: OperationReceipt(fingerprint=fingerprint, document_uuid=artifact.document_uuid)}}, deep=True)
