"""Tests for decepticon.cli.scan (parsing + target validation; live LangGraph not invoked)."""

from __future__ import annotations

from pathlib import Path

import pytest

from decepticon.cli.scan import (
    EXIT_CONFIG,
    EXIT_OK,
    _build_parser,
    _instruction_text,
    _resolve_engagement_name,
    _validate_targets,
)


def test_parser_accepts_headless_dast_flags():
    parser = _build_parser()
    args = parser.parse_args(
        [
            "--target",
            "https://app.example.com",
            "--scan-mode",
            "deep",
            "--non-interactive",
        ]
    )
    assert args.target == ["https://app.example.com"]
    assert args.scan_mode == "deep"
    assert args.non_interactive is True


def test_parser_rejects_removed_quick_mode():
    parser = _build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["--target", "https://example.com", "--scan-mode", "quick"])


def test_parser_has_no_sarif_or_diff_flags():
    parser = _build_parser()
    for flag in ("--sarif-output", "--fail-on", "--scope-mode", "--diff-base"):
        with pytest.raises(SystemExit):
            parser.parse_args(["--target", "https://example.com", flag, "x"])


def test_parser_multiple_targets_repeat_flag():
    parser = _build_parser()
    args = parser.parse_args(["--target", "https://a.example.com", "-t", "10.0.0.0/24"])
    assert args.target == ["https://a.example.com", "10.0.0.0/24"]


def test_validate_targets_rejects_empty():
    assert _validate_targets([]) is not None


def test_validate_targets_accepts_http_urls():
    assert _validate_targets(["https://example.com"]) is None


def test_validate_targets_accepts_git_urls():
    assert _validate_targets(["git@github.com:org/repo.git"]) is None
    assert _validate_targets(["git+https://x/y.git"]) is None


def test_validate_targets_rejects_existing_path(tmp_path: Path):
    # The standalone SAST entry was removed (issue #1059): a filesystem path
    # is no longer a valid target, and the error names the migration.
    err = _validate_targets([str(tmp_path)])
    assert err is not None and "issue #1059" in err


def test_validate_targets_rejects_missing_path(tmp_path: Path):
    bogus = str(tmp_path / "absolutely-not-here")
    assert _validate_targets([bogus]) is None  # network-shaped unknown host is allowed


def test_resolve_engagement_name_uses_supplied():
    assert _resolve_engagement_name("custom") == "custom"


def test_resolve_engagement_name_timestamped_default():
    name = _resolve_engagement_name(None)
    assert name.startswith("scan-")
    assert len(name) > len("scan-")


def test_instruction_text_combines_flag_and_file(tmp_path: Path):
    file_path = tmp_path / "roe.md"
    file_path.write_text("Out of scope: production database servers.\n")

    parser = _build_parser()
    args = parser.parse_args(
        [
            "--target",
            "https://app.example.com",
            "--instruction",
            "Focus on auth flows.",
            "--instruction-file",
            str(file_path),
        ]
    )
    text = _instruction_text(args)
    assert "Focus on auth flows." in text
    assert "Out of scope: production database servers." in text


def test_instruction_text_missing_file_raises(tmp_path: Path):
    parser = _build_parser()
    args = parser.parse_args(
        [
            "--target",
            "https://app.example.com",
            "--instruction-file",
            str(tmp_path / "nope.md"),
        ]
    )
    with pytest.raises(RuntimeError):
        _instruction_text(args)


def test_exit_codes_are_disjoint():
    from decepticon.cli.scan import EXIT_INTERNAL

    assert len({EXIT_OK, EXIT_CONFIG, EXIT_INTERNAL}) == 3
