"""Audit every locked registry dependency, including optional extras and dev groups.

Editable/virtual workspace entries are our source, not published 0.0.0 packages.
Their real release versions are stamped from the immutable tag; do not send those
sentinels to a registry vulnerability service or suppress their advisory IDs.
"""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path


def registry_requirements(path: Path) -> list[str]:
    lock = tomllib.loads(path.read_text(encoding="utf-8"))
    return sorted(
        {
            f"{package['name']}=={package['version']}"
            for package in lock["package"]
            if "registry" in package.get("source", {})
        }
    )


if __name__ == "__main__":
    print("\n".join(registry_requirements(Path(sys.argv[1] if len(sys.argv) > 1 else "uv.lock"))))
