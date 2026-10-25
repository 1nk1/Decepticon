# Terminal interaction audit and implementation

Investigated on 2026-10-26 KST against merged OSS source and the actually installed 1.6.1 launcher. The installed binary checksum matched the published launcher, so an outdated executable did not explain the reported appearance.

## Evidence and comparison

The existing Decepticon Ink application already provided a keyboard-driven text UI. Its main chat used append-only `Static` output plus a moving composer, without mouse packet decoding or hit testing. Calling that a TUI did not establish the direct manipulation and stable layout the operator expected.

| Primary reference | Observed contract | Decision |
| --- | --- | --- |
| [Codex CLI reference](https://learn.chatgpt.com/docs/cli/reference) | Interactive TUI with an explicit `--no-alt-screen` escape hatch; saved-session selection is a distinct resume workflow. | Provide fullscreen controls with inline/native scrollback compatibility. `/resume` selects saved conversations. |
| [Codex advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced) | Alternate-screen use is configurable, rather than an intrinsic requirement for every terminal session. | Respect explicit mode choice and noninteractive/dumb-terminal fallback. These documents do not establish a complete Codex mouse feature contract; no mouse-parity claim is made. |
| [Claude Code fullscreen rendering](https://code.claude.com/docs/en/fullscreen) | Its documented research-preview renderer fixes the composer, handles mouse menu selection/cursor placement and internal scrolling, and offers capture opt-out. It renders visible messages; its memory claims apply to its implementation. | Adopt fixed layout, wheel/keyboard scrolling, explicit follow-latest and actionable controls. Do not claim constant memory or copy every feature. |
| [Claude Code interactive mode](https://code.claude.com/docs/en/interactive-mode) | Command/file suggestions have mouse interaction in fullscreen; keyboard operation remains documented. | Keep slash/arrow/Enter operation while adding click acceptance. |
| [Ink's maintained implementation/documentation](https://github.com/vadimdemedes/ink) | React terminal components and input hooks. The installed 6.8.0 exports DOM measurements and synchronous `renderToString`; its local keyboard parser does not provide this application's mouse routing. | Reuse locked Ink/React rather than migrate frameworks. Cache event rendering and mount visible rows. |
| [XTerm control sequence specification](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) | Distinct mouse tracking/SGR coordinate protocols and alternate-screen modes require matching cleanup. | Decode reports before Ink keyboard input; restore tracking/screen on exit and signals. |

No decompiled proprietary implementation was used. Public documentation describes reference behavior; installed dependency source and actual terminal experiments determine this project's implementation.

## Root causes in this application

1. Startup star/update/consent prompts and removal confirmations bypassed the custom form theme and retained Huh's default accent colors. Other plain text, inherited form/card text and child output also used the terminal's default foreground. A colored terminal theme could therefore dominate the UI. All owned Ink text now has explicit neutral ink, including Markdown body and tool results. Go forms/cards/cursor text and human-readable output share the same ramp. Output adapts through the existing color-profile dependency, respecting `NO_COLOR`/redirection. The dependency's existing locked version is retained.
2. Native scrollback held completed output outside the React tree. Those historical lines could not be hit-tested as application controls, and the composer moved with new output. Fullscreen now has a fixed frame, bounded visible history and fixed input/status regions.
3. Raw mouse reports could be interpreted as typed escape-sequence text. The input transport separates reports, preserves fragmented UTF-8 and bracketed paste, and retains keyboard/click order within a single OS read. Clicking and typing must not corrupt the draft. It preserves raw-mode state for external-editor return.
4. `/resume` conflated saved-thread restoration with a paused run's internal `Command(resume=...)`. It now opens a searchable saved-session picker. Selecting a thread restores messages without initiating a model run; a subsequent user message continues it. A paused run's ID cannot receive the selected thread ID as feedback. `/answer` returns to a pending structured question.
5. The prior footer presented a selected model, last routing/effort and context checks as several dim repeated lines. The new band groups mode, agent, engagement, selected model/connection, observed route, requested effort, context and compaction-check state. A route is labelled served only when runtime evidence provides a served model. Approximate tokens and requested effort retain their qualifiers.

## Interaction boundaries

- Mouse: click model/session controls, choose menu rows, place the composer caret, toggle question choices/submit, expand tool output and scroll history. Keyboard equivalents remain available. Wheel scrolling away from latest freezes the historical page; the latest control or Ctrl+End resumes following.
- Wrapped and multiline composition is limited to a cursor-centered visual viewport; CJK and composed emoji remain intact. Long input cannot grow the whole screen and bury the status band.
- The engagement picker accepts clicks to select and wheel navigation; Enter remains the explicit open action. Deletion retains its existing confirmation.
- Fullscreen mounts visible text rows; its rendered-history cache and agent state still grow with retained conversation history. It does not claim the reference product's constant-memory behavior.
- In-app drag selection, clipboard ownership, scrollbar dragging and automatic URL/file opening are not implemented. `/mouse off` restores native terminal selection; `/tui inline` restores normal scrollback and `/export` remains available. Modifier-click is not interpreted as an application action.
- Mouse clicks use the same existing local commands and scope/run gates. They do not confer approval, start a model turn merely by restoring a conversation, or bypass a pending question's contract.

## Use

On interactive terminals the conversation opens fullscreen. `decepticon --no-alt-screen` selects native scrollback, and `--no-mouse` disables capture. Installation environment options are `DECEPTICON_TUI=inline|fullscreen` and `DECEPTICON_MOUSE=0|1`; explicit launcher flags take priority. In-session `/tui inline|fullscreen` and `/mouse on|off` change the current presentation without discarding conversation state.

`/resume` opens saved sessions for the current engagement. Search and click/Enter to restore, then send a message to continue. `/sessions all` and `/sessions legacy` retain their explicit broader views; workspace validation still applies. For a paused current conversation, send a follow-up. `/answer` reopens its pending question. Changing terminal mode is independent of Red/Plan/Blue mode.

Verification results are recorded in the task's verification record. A terminal protocol fixture, unit tests and real product acceptance are separate evidence categories; none alone establishes native Windows/macOS product verification.
