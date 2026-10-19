"""Deterministic rich Markdown projections for committed documents."""

import json
from typing import Final

from .models import Artifact, ArtifactDraft, ArtifactKind, ArtifactRegistry

INFO_PATH: Final = "findings/info_observations-and-negative-results.md"


def artifact_path(artifact: Artifact) -> str:
    return artifact.current_path


def canonical_content(draft: ArtifactDraft) -> bytes:
    return json.dumps(
        draft.model_dump(mode="json"), sort_keys=True, ensure_ascii=False, separators=(",", ":")
    ).encode()


def render_artifact(artifact: Artifact, revision: int, content_hash: str) -> str:
    draft = artifact.draft
    metadata = dict(draft.metadata)
    metadata.update(
        {
            "schema_version": 2,
            "document_type": draft.kind.value,
            "document_uuid": str(artifact.document_uuid),
            "id": artifact.label,
            "revision": revision,
            "content_hash": content_hash,
            "title": draft.title,
            "slug": draft.slug,
            "links": [link.model_dump(mode="json") for link in draft.links],
        }
    )
    if draft.severity is not None:
        metadata["severity"] = draft.severity
    # JSON values are also valid YAML and preserve multiline/nested metadata safely.
    frontmatter = "\n".join(
        f"{json.dumps(key)}: {json.dumps(value, ensure_ascii=False)}"
        for key, value in metadata.items()
    )
    return f"---\n{frontmatter}\n---\n\n{draft.body.rstrip()}\n"


def render_info_log(registry: ArtifactRegistry) -> str:
    entries = [
        artifact
        for artifact in registry.artifacts.values()
        if artifact.draft.kind == ArtifactKind.INFO_ENTRY and artifact.revisions
    ]
    sections: list[str] = []
    for artifact in sorted(entries, key=lambda entry: entry.number):
        revision = artifact.revisions[-1]
        sections.append(f"## {artifact.label} — {revision.draft.title}\n\n{revision.markdown}")
    log_revision = sum(artifact.revision for artifact in entries)
    header = (
        "---\nschema_version: 2\ndocument_type: information_log\n"
        f"document_uuid: {registry.information_log_uuid}\nrevision: {log_revision}\n---\n\n"
    )
    return header + "\n".join(sections)
