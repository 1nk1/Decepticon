import { terminalText } from "../utils/terminalText.js";
import React from "react";
import { Box } from "ink";
import type { AgentEvent } from "../types.js";
import { BashResult } from "./BashResult.js";
import { UserMessage } from "./messages/UserMessage.js";
import { AIMessage } from "./messages/AIMessage.js";
import { ToolCallMessage } from "./messages/ToolCallMessage.js";
import { ErrorMessage, parseStructured } from "./messages/ErrorMessage.js";
import { DelegateMessage } from "./messages/DelegateMessage.js";
import { SystemMessage } from "./messages/SystemMessage.js";
import { QAQuestionMessage, QAAnswerMessage } from "./messages/QAMessage.js";
import { BackgroundCompleteMessage } from "./messages/BackgroundCompleteMessage.js";

interface EventItemProps {
  event: AgentEvent;
}

/** Routes an AgentEvent to the appropriate visual renderer. */
export const EventItem = React.memo(function EventItem({
  event: original,
}: EventItemProps) {
  const event = { ...original, content: terminalText(original.content) };
  switch (event.type) {
    case "user":
      return <UserMessage content={event.content} />;

    case "bash_result":
      return (
        <Box marginTop={1}>
          <BashResult
            command={(event.toolArgs?.command as string) ?? ""}
            output={event.content}
            status={event.status}
          />
        </Box>
      );

    case "tool_result":
      // Tools signal failure with a structured error envelope (tools/errors.py);
      // those render as cause + recovery instead of a raw tool result.
      if (parseStructured(event.content)) {
        return <ErrorMessage content={event.content} />;
      }
      return <ToolCallMessage event={event} />;

    case "delegate":
      return (
        <DelegateMessage
          agent={event.subagent ?? "unknown"}
          content={event.content}
        />
      );

    case "ai_message":
      return <AIMessage content={event.content} />;

    case "system":
      return <SystemMessage content={event.content} />;

    case "ask_user_question":
      return (
        <QAQuestionMessage
          header={event.header ?? ""}
          question={event.question ?? event.content}
        />
      );

    case "ask_user_answer":
      return <QAAnswerMessage answer={event.content} />;

    case "background_complete":
      return (
        <BackgroundCompleteMessage
          command={event.command}
          session={event.session}
          exitCode={event.exitCode}
          elapsed={event.elapsed}
          output={event.content}
        />
      );

    default:
      return null;
  }
});
