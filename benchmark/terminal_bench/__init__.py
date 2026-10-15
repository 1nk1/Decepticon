"""Canonical Harbor entry point for the Terminal-Bench adapter."""

import os

# Set the single-component guard before importing the Decepticon agent.
os.environ.setdefault("DECEPTICON_SKIP_BOOT", "1")

from benchmark.terminal_bench.agent import DecepticonTerminalBenchAgent  # noqa: E402

__all__ = ["DecepticonTerminalBenchAgent"]
