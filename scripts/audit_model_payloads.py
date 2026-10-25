"""Serialize every configured concrete chat route without provider inference.

Run with ``uv run python scripts/audit_model_payloads.py`` from the repo root.
Only aggregate counts are printed, so managed route identities stay private.
This checks local construction, not upstream acceptance or live tool execution.
"""

from __future__ import annotations

import json
import os
import runpy
from pathlib import Path

import yaml
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI

from decepticon.llm.factory import LLMFactory
from decepticon_core.types.llm import METHOD_MODELS, LLMModelMapping, ProxyConfig


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    catalog = json.loads((root / "model-catalog/catalog.json").read_text())["models"]
    identities = {row["id"] for row in catalog}
    embeddings = {row["id"] for row in catalog if row.get("info", {}).get("mode") == "embedding"}
    identities.update(
        row["model_name"]
        for row in yaml.safe_load((root / "config/litellm.yaml").read_text())["model_list"]
    )
    identities.update(
        row["model_name"]
        for row in json.loads((root / "config/litellm_prod_catalog.json").read_text())["routes"]
    )
    identities.update(model for tiers in METHOD_MODELS.values() for model in tiers.values())
    dynamic = runpy.run_path(str(root / "config/litellm_dynamic_config.py"))
    identities.update(
        row["model_name"] for routes in dynamic["_SUBSCRIPTION_ROUTES"].values() for row in routes
    )
    for name in (
        "DECEPTICON_LLM_MAX_TOKENS",
        "DECEPTICON_LLM_EXTRA_HEADERS",
        "DECEPTICON_LLM_DISABLE_STREAMING",
    ):
        os.environ.pop(name, None)
    factory = LLMFactory(
        ProxyConfig(url="http://127.0.0.1:9/v1", api_key="audit-placeholder"), LLMModelMapping()
    )
    tool = {
        "type": "function",
        "function": {
            "name": "audit_tool",
            "description": "Audit fixture",
            "parameters": {"type": "object", "properties": {}},
        },
    }
    messages = [
        HumanMessage(content="check"),
        AIMessage(
            content="",
            tool_calls=[{"name": "audit_tool", "args": {}, "id": "audit-call"}],
        ),
        ToolMessage(content="ok", tool_call_id="audit-call"),
        HumanMessage(content="continue"),
    ]
    concrete = identities - embeddings - {name for name in identities if "*" in name}
    for identity in sorted(concrete):
        client = factory._create_chat_model(identity, 0.7)
        assert isinstance(client, ChatOpenAI)
        payload = client._get_request_payload(messages, tools=[tool])
        assert payload["model"] == identity
        json.dumps(payload)
    print(
        json.dumps(
            {
                "unique_routes": len(identities),
                "concrete_chat_payloads_passed": len(concrete),
                "embedding_records": len(embeddings),
                "wildcards": sum("*" in name for name in identities),
                "provider_inference_performed": False,
            }
        )
    )


if __name__ == "__main__":
    main()
