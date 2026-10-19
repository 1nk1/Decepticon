"""Retryable filesystem projections; checkpoint remains the single-writer authority."""
from dataclasses import dataclass
from hashlib import sha256
from posixpath import dirname, relpath
from typing import Final, override

from deepagents.backends.protocol import BackendProtocol

from .models import (
    ArtifactKind,
    ArtifactRegistry,
    InformationLogEntry,
    InformationLogProjection,
)
from .render import INFO_PATH, render_info_log

REGISTRY_PATH: Final = "plan/artifact-registry.json"


@dataclass(frozen=True, slots=True)
class MaterializationError(RuntimeError):
    path: str
    detail: str

    @override
    def __str__(self) -> str:
        return f"Cannot materialize {self.path}: {self.detail}"


def _upload(backend: BackendProtocol, path: str, content: bytes) -> None:
    try:
        responses = backend.upload_files([(path, content)])
    except Exception as error:
        raise MaterializationError(path, str(error)) from error
    if len(responses) != 1 or responses[0].error is not None:
        raise MaterializationError(path, str(responses))


def _snapshot(backend: BackendProtocol, path: str, content: bytes) -> None:
    try:
        responses = backend.download_files([path])
    except Exception as error:
        raise MaterializationError(path, str(error)) from error
    if len(responses) != 1:
        raise MaterializationError(path, "Missing download response")
    response = responses[0]
    if response.error == "file_not_found":
        _upload(backend, path, content)
    elif response.error is not None:
        raise MaterializationError(path, response.error)
    elif response.content != content:
        raise MaterializationError(path, "Immutable snapshot differs")


def materialize(registry: ArtifactRegistry, backend: BackendProtocol) -> ArtifactRegistry:
    """Write snapshots, views, then publication envelope; never claim atomic CAS."""
    for artifact in registry.artifacts.values():
        for revision in artifact.revisions:
            path = f"plan/artifacts/{artifact.document_uuid}/{revision.revision:06}.json"
            content = revision.model_dump_json(indent=2).encode()
            _snapshot(backend, path, content)
        if artifact.revisions and artifact.draft.kind != ArtifactKind.INFO_ENTRY:
            revision = artifact.revisions[-1]
            _upload(backend, revision.relative_path, revision.markdown.encode())
            for alias in artifact.aliases:
                # Aliases are redirects, never another collectable finding.
                target = relpath(revision.relative_path, dirname(alias))
                _upload(backend, alias, f"Moved to [{artifact.label}]({target}).\n".encode())
    entries = tuple(
        InformationLogEntry(document_uuid=artifact.document_uuid, revision=artifact.revision, content_hash=artifact.revisions[-1].content_hash)
        for artifact in sorted(registry.artifacts.values(), key=lambda item: item.number)
        if artifact.draft.kind == ArtifactKind.INFO_ENTRY and artifact.revisions
    )
    projection = None
    if entries:
        markdown = render_info_log(registry)
        projection = InformationLogProjection(
            document_uuid=registry.information_log_uuid, revision=sum(entry.revision for entry in entries),
            markdown=markdown, markdown_sha256=sha256(markdown.encode()).hexdigest(), entries=entries,
        )
        path = f"plan/artifacts/{projection.document_uuid}/{projection.revision:06}.json"
        _snapshot(backend, path, projection.model_dump_json(indent=2).encode())
        _upload(backend, INFO_PATH, markdown.encode())
    history = registry.information_log_history
    if registry.information_log is not None and all(
        prior.revision != registry.information_log.revision for prior in history
    ):
        history = (*history, registry.information_log)
    if projection is not None and all(prior.revision != projection.revision for prior in history):
        history = (*history, projection)
    result = registry.model_copy(update={
        "materialized": True, "information_log": projection,
        "information_log_history": history,
    }, deep=True)
    _upload(backend, REGISTRY_PATH, result.model_dump_json(indent=2).encode())
    return result
