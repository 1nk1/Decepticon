# Conversation and assessment search boundary

The actual WSL launcher/CLI/model acceptance run reproduced a deeper cause after
trusted approval was corrected: `auth/gpt-5.6-sol` answered a greeting with
“Hi! How can I help?”, then SearchRuntimeMiddleware appended an internal human
message demanding OPPLAN/review_search and resumed generation. The injected
message, rather than the operator, initiated plan and document work. The
synthetic QA run was interrupted and its checkpoint/workspace preserved.

Interactive turn completion must not mean terminal assessment completion.
A greeting, explanation, operator question/answer or local context/status read can end its turn while the
search remains pending. Such an answer creates no validated completion receipt.
Unknown/custom operation tools conservatively count as assessment work. Once
assessment work starts, the existing continuation, receipt, review and dispatch
budget rules apply. Explicit server-selected search requests and Autohunt keep
their obligation from the start. A resumed tool checkpoint retains that obligation.
No chat keyword list selects intent or grants authorization.

The optional `search_turn_active` checkpoint field is omitted from graph input,
set by the runtime, reset for a new operator turn and retained across tool pause
and resume. Specialist return commands cannot overwrite it. Ordinary conversation
preserves an existing terminal receipt; a subsequent new interactive assessment
starts a distinct search. Explicit search-run IDs remain authoritative. Scope,
approval, OPPLAN revision checks and immutable workflow pins are unchanged.

Focused graph tests exercise sync/async greetings without injected directives,
read-only status against pending work, assessment closure rejection after actual
tool work, pause/resume, explicit search and Autohunt, protected input schema and
preservation/rollover of completed search receipts. The default parent assembly
still registers and enforces the search gate when assessment work starts.
The affected search suite passes 40 tests; full Ruff and type checking report
zero errors and the existing 820-warning audit baseline. The rebuilt local
LangGraph image's middleware SHA-256 exactly matches this source.

Actual WSL product acceptance now passes through Go launcher → engagement picker
→ service startup → compiled Ink CLI → real `auth/gpt-5.6-sol` route: the two
greetings receive “Hi! How can I help?” and “Hi again! What would you like to work
on?” with no tool calls or OPPLAN creation. Between them, the fixture seeds stale
`authorization_confirmed=false` into its private checkpoint; the next trusted
launch/run refreshes approval to true. `/resume` opens the saved-session picker
and restoration creates no model turn. Subsequent input returns the real
`INTERACTIVE-RESUME-OK` response. Normal exit is zero. The failed attempt's
checkpoint/workspace are preserved separately; only disposable QA state was
changed. The full fast suite and immutable candidate gates are tracked separately;
local source acceptance is not candidate-distribution evidence.
