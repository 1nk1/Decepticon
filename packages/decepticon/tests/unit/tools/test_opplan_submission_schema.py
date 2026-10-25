"""Models see the actual OPPLAN contract before submitting objective rows."""

from langchain_core.utils.function_calling import convert_to_openai_tool

from decepticon.tools.opplan import build_opplan_tools


def test_wire_tool_schema_describes_enum_priority_and_server_issued_ids():
    tool = next(tool for tool in build_opplan_tools() if tool.name == "commit_opplan")
    schema = convert_to_openai_tool(tool)["function"]["parameters"]
    objective = schema["properties"]["objectives"]["items"]
    assert objective["properties"]["priority"]["type"] == "integer"
    assert "recon" in objective["properties"]["phase"]["enum"]
    assert "scope" not in objective["properties"]["phase"]["enum"]
    assert "id" not in objective["required"]
    assert objective["properties"]["blocked_by"]["items"]["anyOf"][1]["type"] == "integer"
    assert "$ref" not in str(objective)
