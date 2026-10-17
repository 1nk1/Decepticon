# CLI experience and compatibility

The terminal has four distinct concepts: the engagement workspace, the selected
Plan/Red/Blue conversation, the current run state, and independent Blue monitoring.
Red is the default conversation; scope readiness and approval remain execution
requirements. Switching conversation does not turn off Blue collection.

## Interaction design references

The command picker, composer, session and monitoring changes use the following
public interaction references:

- [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode):
  input editing, command discovery, queued input and transcript expansion.
- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli): visible session state and
  explicit session restoration.
- [Gemini session management](https://geminicli.com/docs/cli/session-management/):
  project-scoped conversations and restoration.
- [OpenCode TUI](https://docs.opencode.ai/docs/tui/): searchable actions and external
  editor integration.

The implementation retains React/Ink and the Go Charm launcher. React Bits was
evaluated as a web component reference; it is not a terminal renderer dependency.
No browser animation library is required for the CLI.

## Upgrade behavior

These changes are proposed under Unreleased. They require a launcher/CLI image and
Compose configuration containing this PR; existing released images do not acquire
the features simply because the source branch has changed. No release version is
assigned here.

The CLI Compose service mounts the selected engagement at `/workspace`, consistent
with the agent workspace. Drafts, prompt history and Blue cursors prefer the
persisted `DECEPTICON_HOME` mount, with `DECEPTICON_STATE_DIR` as an explicit
override. Existing database and engagement volumes do not need resetting.

Old conversations without engagement metadata are kept and discoverable using
`/sessions legacy`. Explicitly link them to the correct engagement before resuming;
checkpoint scope conflicts are rejected. The new metadata does not move files or
change the underlying target authorization.

Blue summaries are compact by default. `/alerts` opens recent structured notices,
and `/alerts <incident-id>` shows the complete retained investigation. Up to 500
notices are retained in the current UI process. The monitor remains the durable
incident store. The persisted cursor avoids replaying every previously seen alert
on re-entry. It is distinct from whether the user has reviewed an incident.

Leaving the CLI keeps services running. `decepticon stop` is the explicit host
command for shutdown. `/status` and read-only `decepticon doctor --json` expose
connection state without changing it.

See the [CLI reference](cli-reference.md) for commands and keyboard controls.
