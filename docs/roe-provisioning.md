# Provision an RoE for an existing engagement

An authorized operator provisions `plan/roe.json`. Soundwave can draft a
candidate such as `plan/roe-authorized.json`, but its filesystem tools cannot
create or modify the operator-confirmed `plan/roe.json`. New CLI engagements generate and approve their RoE from the entered target URL
and open Red immediately. This import procedure is for legacy or externally
created workspaces with missing scope, not a prerequisite for normal creation.
The web creation form provisions a direct
RoE only for new engagements. Neither recreating the engagement nor restarting
its services is required to import a missing RoE.

The original importer was introduced in PR #1000. The explicit direct-approval
option and portable CLI commands below belong to this proposed source revision;
older installed images may not include them. Merging a change does not update an
installed container.

## Portable terminal procedure

Pause active work, review the candidate against the signed authorization, then
use the operator commands inside the engagement's CLI session:

```text
/scope import plan/roe-authorized.json --confirm
/mode red approve
```

The source path can be relative to the engagement workspace or an absolute path
readable by the CLI process. Import canonically validates the candidate, creates
only a missing `plan/roe.json` with mode `0600`, clears stale approval markers and
does not grant Red approval. `/mode red approve` separately validates and approves
the current RoE bytes. It requires none of the seven optional Plan documents; if
a complete validated Plan bundle exists, its bundle digest is preserved.
`/mode red` selects execution after approval. `/mode plan` remains optional.

The CLI uses `POST /_decepticon/roe/validate` for canonical validation only. That
endpoint receives the selected file bytes at `DECEPTICON_API_URL` (default
`http://localhost:2024`). Redirects are refused; configure the final server URL
directly. It does not write files or grant authority; the operator CLI owns import
and approval writes. It is not an agent capability.

## Operator procedure

1. Pause active work. Review the candidate against the signed
   authorization: targets, exclusions, dates, permitted actions, contacts, and
   machine enforcement. The command's confirmation is your attestation; it
   cannot establish legal authorization from an arbitrary reference string.
2. On the host, place the reviewed JSON at
   `${DECEPTICON_HOME:-$HOME/.decepticon}/workspace/itps/plan/roe-authorized.json`.
   Use the actual engagement directory instead of `itps`.
3. In a second host terminal, run the command in the **running LangGraph
   container**. For an installed launcher stack:

   ```bash
   cd "${DECEPTICON_HOME:-$HOME/.decepticon}"
   docker compose exec -T -e DECEPTICON_SKIP_BOOT=1 langgraph \
     python -m decepticon.provision_roe \
     --workspace /workspace \
     --file /workspace/plan/roe-authorized.json --confirm
   ```

   The launcher mounts the selected engagement at `/workspace`. With a raw
   development Compose stack that mounts the entire workspace tree, use
   `--workspace /workspace/itps --file /workspace/itps/plan/roe-authorized.json`.
   Check the running container's mount before choosing the path; do not create a
   second engagement to work around a path error. Use the same Compose project
   options as your installation if you override its project name or files.

   From a source checkout with dependencies installed, the equivalent is:

   ```bash
   DECEPTICON_SKIP_BOOT=1 uv run python -m decepticon.provision_roe \
     --workspace /absolute/path/to/existing/itps \
     --file /absolute/path/to/reviewed-roe.json --confirm
   ```

4. For direct execution, approve the current scope with `/mode red approve`.
   If you chose optional Plan, continue that conversation and ask Soundwave to
   read the provisioned RoE. The seven planning documents and conversation are
   preserved; their `engagement_name` must agree with the RoE. Publishing them
   leaves the operator in Plan and does not approve execution.

To explicitly approve direct Red scope in the Python operator command, add
`--approve-red` together with `--confirm`:

```bash
DECEPTICON_SKIP_BOOT=1 uv run python -m decepticon.provision_roe \
  --workspace /absolute/path/to/existing/itps \
  --file /absolute/path/to/reviewed-roe.json --confirm --approve-red
```

Without `--approve-red`, import never grants Red approval. The explicit option
can approve an existing canonical RoE only if the reviewed source bytes match
exactly; it does not overwrite existing scope. A different existing RoE is
rejected. Existing scope revisions remain a separate operator task.

The importer validates before writing, preserves reviewed bytes and refuses
symlinked planning paths. Before publishing a restored document it clears stale
`.planning-draft-ready` and `.red-approved` markers. Invalid input exits with
status 2; successful provisioning exits with status 0. The command is not an
agent tool and exposes no HTTP mutation endpoint.

## Required JSON and validation boundary

The importer uses the same canonical `RoE` model as planning completion.
Required fields are `engagement_name`, `client`, `start_date`, `end_date`,
`engagement_type`, and `testing_window`. Provisioning additionally requires a
nonblank `authorization_reference`, a nonblank `engagement_name`, and at least
one `in_scope` entry with a nonblank `target`. Each scope entry requires a
`target` and a `type`; `notes` is optional. `engagement_type` is `external`,
`internal`, `hybrid`, `assumed-breach`, or `physical`.

For example, adapt this local-only scope to your actual signed authorization:

```json
{
  "engagement_name": "itps",
  "client": "Local test operator",
  "start_date": "2026-10-17",
  "end_date": "2026-10-17",
  "engagement_type": "external",
  "testing_window": "09:00-17:00 UTC",
  "in_scope": [{"target": "127.0.0.1", "type": "ip-range"}],
  "out_of_scope": [],
  "authorization_reference": "Signed authorization reference",
  "machine_enforcement": {"mode": "enforce", "in_scope": ["127.0.0.1"]}
}
```

Export all canonical fields, defaults, and nested schemas with:

```bash
docker compose exec -T -e DECEPTICON_SKIP_BOOT=1 langgraph \
  python -m decepticon.provision_roe --schema > roe.schema.json
```

The canonical model treats dates and scope kinds as strings and ignores
extensions during validation. Import preserves the **original bytes**, including
`machine_enforcement`; it does not normalize or silently discard extensions.
The command validates the planning schema, not the semantics of signed
contracts, dates, scope patterns, or machine enforcement. Review the
[machine enforcement schema and behavior](security/roe-machine-enforcement.md)
separately: without that block the runtime defaults to audit-only, and an invalid
mode also falls back to audit. Provisioning does not change those runtime rules.
