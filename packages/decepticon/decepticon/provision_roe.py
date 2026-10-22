"""Operator-only import of a reviewed RoE into an existing engagement."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Annotated

import typer

from decepticon.authorization import OperatorRoEError, validate_operator_roe
from decepticon_core.types.engagement import RoE

app = typer.Typer(add_completion=False)


@app.command()
def main(
    workspace: Annotated[Path | None, typer.Option(help="Existing engagement directory.")] = None,
    file: Annotated[Path | None, typer.Option(help="Operator-reviewed RoE JSON file.")] = None,
    confirm: Annotated[
        bool, typer.Option(help="Attest that you are authorized to provision this RoE.")
    ] = False,
    schema: Annotated[
        bool, typer.Option(help="Print the canonical planning RoE JSON Schema.")
    ] = False,
) -> None:
    """Create-only import: the installed scope is what the middleware enforces."""
    if schema:
        typer.echo(json.dumps(RoE.model_json_schema(), indent=2))
        return
    if workspace is None or file is None or not confirm:
        raise typer.BadParameter("Provide --workspace, --file, and explicit operator --confirm.")
    try:
        payload = file.read_bytes()
        validate_operator_roe(payload)
        plan = workspace / "plan"
        if not workspace.is_dir() or not plan.is_dir() or plan.is_symlink():
            raise typer.BadParameter("Select an existing engagement with a real plan directory.")
        destination = plan / "roe.json"
        if destination.is_symlink():
            raise typer.BadParameter("plan/roe.json must not be a symlink.")
        if destination.exists():
            raise typer.BadParameter(
                "plan/roe.json already exists; provisioning never overwrites authorization."
            )
        # Link a complete, private file exclusively: readers never see partial JSON,
        # and an existing authorization (including a symlink) cannot be replaced.
        with tempfile.NamedTemporaryFile(dir=plan, prefix=".roe-", delete=True) as staged:
            staged.write(payload)
            staged.flush()
            os.fsync(staged.fileno())
            os.link(staged.name, destination)
    except (OSError, OperatorRoEError) as exc:
        raise typer.BadParameter(str(exc)) from exc
    typer.echo(f"Provisioned {destination}. The middleware enforces this scope.")


if __name__ == "__main__":
    app()
