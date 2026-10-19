"""Checkpoint-serializable artifact identities, drafts and immutable revisions."""
from enum import StrEnum
from typing import Annotated, ClassVar, Literal, assert_never
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator


class ArtifactError(ValueError):
    """Invalid artifact operation, including stale or incompatible writes."""


class FrozenModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")


class ArtifactKind(StrEnum):
    FINDING = "finding"
    HYPOTHESIS = "hypothesis"
    ATTACK_PLAN = "attack_plan"
    ATTACK_PATH = "attack_path"
    INFO_ENTRY = "info_entry"
    ASSESSMENT_REPORT = "assessment_report"


class ArtifactLink(FrozenModel):
    relation: Literal["derives_from", "supports", "refutes", "verifies", "reports", "promoted_to", "related_to"]
    document_uuid: UUID
    revision: int | None = Field(default=None, ge=1)
    content_hash: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None = None

    @model_validator(mode="after")
    def pinned_pair(self) -> "ArtifactLink":
        if (self.revision is None) != (self.content_hash is None):
            raise ArtifactError("Pinned references require revision and content_hash together")
        return self


class ArtifactDraft(FrozenModel):
    kind: ArtifactKind
    title: str = Field(min_length=1)
    slug: str = Field(min_length=3, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    body: str
    severity: Literal["critical", "high", "medium", "low"] | None = None
    metadata: dict[str, JsonValue] = Field(default_factory=dict)
    links: tuple[ArtifactLink, ...] = ()

    @model_validator(mode="after")
    def finding_severity(self) -> "ArtifactDraft":
        if self.kind == ArtifactKind.FINDING and self.severity is None:
            raise ArtifactError("Findings require a non-informational severity")
        return self


class ActorContext(FrozenModel):
    actor: str = Field(min_length=1)
    role: str = Field(min_length=1)
    objective_id: str | None = None


class ArtifactRevision(FrozenModel):
    schema_version: Literal[2] = 2
    previous_hash: str | None = None
    markdown_sha256: str
    document_uuid: UUID
    revision: int = Field(ge=1)
    content_hash: str
    draft: ArtifactDraft
    relative_path: str
    markdown: str
    author: ActorContext
    reason: str


class Artifact(FrozenModel):
    document_uuid: UUID
    label: str
    number: int = Field(ge=1)
    draft: ArtifactDraft
    draft_version: int = Field(default=1, ge=1)
    revisions: tuple[ArtifactRevision, ...] = ()
    aliases: tuple[str, ...] = ()

    @property
    def revision(self) -> int:
        return len(self.revisions)

    @property
    def content_hash(self) -> str | None:
        return self.revisions[-1].content_hash if self.revisions else None

    @property
    def current_path(self) -> str:
        draft = self.draft
        suffix = f"{self.number:02}_{draft.slug}.md"
        match draft.kind:
            case ArtifactKind.FINDING:
                return f"findings/{draft.severity}_{suffix}"
            case ArtifactKind.HYPOTHESIS:
                return f"plan/hypotheses/HYP_{suffix}"
            case ArtifactKind.ATTACK_PLAN:
                return f"plan/attack-plans/AP_{suffix}"
            case ArtifactKind.ATTACK_PATH:
                return f"findings/attack-paths/PATH_{suffix}"
            case ArtifactKind.INFO_ENTRY:
                return "findings/info_observations-and-negative-results.md"
            case ArtifactKind.ASSESSMENT_REPORT:
                return "report/security-assessment-report.md"
            case _ as unreachable:
                assert_never(unreachable)


class OperationReceipt(FrozenModel):
    fingerprint: str
    document_uuid: UUID


class InformationLogEntry(FrozenModel):
    document_uuid: UUID
    revision: int = Field(ge=1)
    content_hash: str


class InformationLogProjection(FrozenModel):
    schema_version: Literal[2] = 2
    document_type: Literal["information_log"] = "information_log"
    document_uuid: UUID
    revision: int = Field(ge=1)
    markdown: str
    markdown_sha256: str
    entries: tuple[InformationLogEntry, ...]


class ArtifactRegistry(FrozenModel):
    schema_version: Literal[2] = 2
    information_log_uuid: UUID = Field(default_factory=uuid4)
    information_log: InformationLogProjection | None = None
    information_log_history: tuple[InformationLogProjection, ...] = ()
    artifacts: dict[str, Artifact] = Field(default_factory=dict)
    next_numbers: dict[ArtifactKind, int] = Field(default_factory=dict)
    operations: dict[str, OperationReceipt] = Field(default_factory=dict)
    materialized: bool = False


class DraftUpdate(FrozenModel):
    document_uuid: UUID
    expected_draft_version: int = Field(ge=1)
    draft: ArtifactDraft


class CommitRequest(FrozenModel):
    document_uuid: UUID
    expected_revision: int = Field(ge=0)
    operation_key: str = Field(min_length=1)
    reason: str = Field(min_length=1)
