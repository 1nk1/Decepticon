"""Real installed OSS tool/agent paths with checkpoint-only workflow bindings."""

import re
from typing import Self

from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatResult
from pydantic import Field, JsonValue


class ToolModel(FakeMessagesListChatModel):
    issued_ids: dict[int, str] = Field(default_factory=dict)

    def bind_tools(self, tools, **kwargs) -> Self:
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: JsonValue,
    ) -> ChatResult:
        for message in messages:
            if isinstance(message, ToolMessage) and message.status == "success":
                issued = re.search(
                    r"Issued IDs by submitted position: \{([^}]*)\}", message.text
                )
                if issued:
                    self.issued_ids.update(
                        (int(position), identifier)
                        for position, identifier in re.findall(
                            r"(\d+): '([^']+)'", issued[1]
                        )
                    )
        result = super()._generate(messages, stop, run_manager, **kwargs)
        for generation in result.generations:
            if isinstance(generation.message, AIMessage):
                generation.message = generation.message.model_copy(deep=True)
                for tool_call in generation.message.tool_calls:
                    for field in ("task_id", "objective_id"):
                        reference = tool_call["args"].get(field)
                        if reference == "@objective:0":
                            tool_call["args"][field] = self.issued_ids[0]
        return result
