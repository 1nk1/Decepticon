from pathlib import Path


def test_role_prompts_leave_skill_tool_routing_to_middleware() -> None:
    prompt_root = Path(__file__).resolve().parents[3] / "decepticon" / "agents" / "prompts"
    for folder in ("standard", "workflows"):
        for path in (prompt_root / folder).glob("*.md"):
            content = path.read_text(encoding="utf-8")
            assert "find_skill" not in content, path
            assert "load_skill" not in content, path
