import json
from uuid import UUID

from deepagents.backends.protocol import BackendProtocol
from langchain.tools import ToolRuntime, tool
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langgraph.types import Command
from pydantic import ValidationError

from decepticon.artifacts import (
    ActorContext,
    ArtifactDraft,
    ArtifactError,
    ArtifactRegistry,
    CommitRequest,
    DraftUpdate,
    MaterializationError,
    commit,
    create,
    get_artifact,
    materialize,
    update_draft,
)
from decepticon.middleware.artifact_backend import ArtifactFilesystemBackend
from decepticon.middleware.filesystem import _rebind_sandbox_per_run


def registry_from_state(raw: str | None) -> ArtifactRegistry:
    return ArtifactRegistry.model_validate_json(raw) if raw else ArtifactRegistry()


def artifact_context(runtime: ToolRuntime) -> ActorContext:
    return ActorContext(actor="decepticon", role="decepticon")


def persist_artifacts(
    registry: ArtifactRegistry, backend: BackendProtocol, workspace: str | None
) -> ArtifactRegistry:
    return materialize(registry, ArtifactFilesystemBackend(_rebind_sandbox_per_run(backend), workspace))


def artifact_tool_error(error: ArtifactError | ValidationError, runtime: ToolRuntime) -> Command[str]:
    return Command(update={"messages": [ToolMessage(
        content=str(error), status="error", tool_call_id=runtime.tool_call_id or ""
    )]})


def publish_artifact(registry: ArtifactRegistry, runtime: ToolRuntime, backend: BackendProtocol) -> Command[str]:
    try:
        published = persist_artifacts(registry, backend, runtime.state.get("workspace_path"))
    except MaterializationError as error:
        return Command(update={"artifact_registry": registry.model_dump_json(), "messages": [ToolMessage(
            content=f"Publication pending; retry publish_artifacts without recreating the document: {error}",
            status="error", tool_call_id=runtime.tool_call_id or "",
        )]})
    return Command(update={"artifact_registry": published.model_dump_json(), "messages": [ToolMessage(
        content=json.dumps({"materialized": True, "documents": [{"document_uuid": str(item.document_uuid), "label": item.label, "path": item.current_path, "revision": item.revision, "draft_version": item.draft_version} for item in published.artifacts.values()]}), tool_call_id=runtime.tool_call_id or "",
    )]})


def build_artifact_tools(backend: BackendProtocol) -> list[BaseTool]:
    @tool(description="Create a UUID document draft. Kinds: finding, hypothesis, attack_plan, attack_path, info_entry, assessment_report. Names and numbers are system assigned. Commit separately at a handoff; do not create a file per informational result.")
    def create_artifact(draft: ArtifactDraft, operation_key: str, runtime: ToolRuntime) -> Command[str]:
        try:
            registry = create(registry_from_state(runtime.state.get("artifact_registry")), draft, operation_key)
            return publish_artifact(registry, runtime, backend)
        except (ArtifactError, ValidationError) as error:
            return artifact_tool_error(error, runtime)

    @tool(description="Edit a working draft by UUID and expected_draft_version. Many edits remain one draft. Preserve evidence and use links with UUIDs; a pinned link needs revision and content_hash.")
    def edit_artifact(update: DraftUpdate, runtime: ToolRuntime) -> Command[str]:
        try:
            registry = update_draft(registry_from_state(runtime.state.get("artifact_registry")), update, artifact_context(runtime))
            return publish_artifact(registry, runtime, backend)
        except (ArtifactError, ValidationError) as error:
            return artifact_tool_error(error, runtime)

    @tool(description="Commit a document at a semantic milestone: plan ready, experiment result, independent verdict or report publication. Pass UUID, expected_revision, unique operation_key and reason. Unchanged content creates no revision; snapshots preserve earlier content.")
    def commit_artifact(request: CommitRequest, runtime: ToolRuntime) -> Command[str]:
        try:
            registry = commit(registry_from_state(runtime.state.get("artifact_registry")), request, artifact_context(runtime))
            return publish_artifact(registry, runtime, backend)
        except (ArtifactError, ValidationError) as error:
            return artifact_tool_error(error, runtime)

    @tool(description="Read the system registry: UUID, human label, filename, latest draft, committed revisions, hashes, links and prior paths. Optionally select one UUID. Use before reuse or updates rather than recounting files.")
    def inspect_artifacts(runtime: ToolRuntime, document_uuid: UUID | None = None) -> str:
        registry = registry_from_state(runtime.state.get("artifact_registry"))
        if document_uuid == registry.information_log_uuid and registry.information_log is not None:
            return registry.information_log.model_dump_json()
        if document_uuid is not None:
            return get_artifact(registry, document_uuid).model_dump_json()
        return json.dumps({
            "information_log": registry.information_log.model_dump(mode="json") if registry.information_log else None,
            "documents": [{
                "document_uuid": str(artifact.document_uuid), "label": artifact.label,
                "kind": artifact.draft.kind.value, "title": artifact.draft.title,
                "relative_path": artifact.current_path, "revision": artifact.revision,
                "draft_version": artifact.draft_version,
                "metadata": artifact.draft.metadata,
                "links": [link.model_dump(mode="json") for link in artifact.draft.links],
            } for artifact in registry.artifacts.values()]
        }, ensure_ascii=False)

    @tool(description="Retry materialization of the current checkpoint registry after a storage failure. Reuses all reserved UUIDs, numbers and revisions; never recreates documents.")
    def publish_artifacts(runtime: ToolRuntime) -> Command[str]:
        return publish_artifact(registry_from_state(runtime.state.get("artifact_registry")), runtime, backend)

    return [create_artifact, edit_artifact, commit_artifact, inspect_artifacts, publish_artifacts]
