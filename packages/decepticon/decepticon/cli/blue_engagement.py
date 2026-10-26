"""Headless Blue engagement configuration surface (``decepticon-cli blue-engagement``).

``create`` validates and materializes ``blue.json`` into the Blue-owned
workspace root (fail-closed, reviewed configuration is never overwritten);
``env`` loads the reviewed configuration and emits the sensor compose
environment as JSON for client adapters (the TUI's ``/blue up``) so the
validation and mapping stay single-sourced in this package.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from decepticon.blue_cell.engagement_config import (
    blue_workspace,
    build_local_target_config,
    compose_env,
    config_path,
    load_blue_config,
    materialize_blue_config,
    resolve_target,
)

CREATE_HELP = (
    "create --label LABEL --target 127.0.0.1:3000 [--logs /abs/dir] "
    "[--rules web-rules.jsonl] [--watch-interval 15] [--watch-batch 25] [--dry-run]"
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="blue-engagement", description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)

    create = sub.add_parser("create", help="materialize blue.json (fail-closed, never overwrites)")
    create.add_argument("--label", required=True)
    create.add_argument("--target", required=True, help="local upstream, e.g. 127.0.0.1:3000")
    create.add_argument("--logs", help="absolute host log directory to tail")
    create.add_argument("--rules", help="rule file relative to the Blue workspace")
    create.add_argument("--watch-interval", type=float)
    create.add_argument("--watch-batch", type=int)
    create.add_argument(
        "--dry-run", action="store_true", help="print the resolved config without writing"
    )

    env = sub.add_parser("env", help="emit the sensor compose environment as JSON")
    env.add_argument(
        "target_id", nargs="?", help="target id from blue.json (default: the enabled one)"
    )

    return parser


def _build_config(args: argparse.Namespace) -> dict:
    watch: dict = {}
    if args.watch_interval is not None:
        watch["interval_seconds"] = args.watch_interval
    if args.watch_batch is not None:
        watch["batch_size"] = args.watch_batch
    return build_local_target_config(
        args.target,
        logs=[args.logs] if args.logs else None,
        rules_file=args.rules,
        watch=watch or None,
    )


def _print_env(args: argparse.Namespace) -> int:
    label = os.environ.get("DECEPTICON_ENGAGEMENT", "").strip()
    if not label:
        print("blue-engagement env requires DECEPTICON_ENGAGEMENT or --label", file=sys.stderr)
        return 2
    try:
        config, destination = load_blue_config(label)
        root = blue_workspace(label)
        target = resolve_target(config, args.target_id)
        payload = {
            "label": label,
            "workspace": str(root),
            "config_path": str(destination),
            "target_id": str(target["id"]),
            "env": compose_env(config, target, root),
        }
    except (ValueError, FileNotFoundError, OSError) as error:
        print(f"blue-engagement env: {error}", file=sys.stderr)
        return 1
    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if args.action == "env":
        return _print_env(args)
    label = args.label
    if not label:
        print("blue-engagement create requires --label", file=sys.stderr)
        return 2
    config = _build_config(args)
    if args.dry_run:
        from decepticon.blue_cell.engagement_config import validate_blue_config

        try:
            validate_blue_config(config, root=blue_workspace(label))
        except ValueError as error:
            print(f"blue-engagement create: {error}", file=sys.stderr)
            return 1
        print(json.dumps(config, indent=2))
        return 0
    try:
        already = config_path(label).exists()
        destination = materialize_blue_config(label, config)
    except (ValueError, OSError) as error:
        print(f"blue-engagement create: {error}", file=sys.stderr)
        return 1
    print(f"blue workspace: {blue_workspace(label)}")
    if already:
        print(f"{destination} already exists — the reviewed configuration wins, nothing written.")
    else:
        print(f"wrote {destination}")
    rules = getattr(args, "rules", None)
    if rules:
        rules_path = blue_workspace(label) / rules
        if rules_path.is_file():
            # Detection patterns are not secret and the sensor container
            # (uid 10001) reads them through the read-only engagement mount.
            # codeql[py/overly-permissive-file]
            rules_path.chmod(0o644)
    return 0
