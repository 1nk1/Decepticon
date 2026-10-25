"""Policy refusals retain their meaning through LiteLLM fallback wrappers."""

import pytest

from decepticon.llm.factory import (
    _classify_provider_error,
    _reraise_with_actionable_message,
)


@pytest.mark.parametrize(
    "body",
    [
        "This content was flagged for possible cybersecurity risk.",
        '{"error": {"code": "cyber_policy"}}',
        "litellm.ContentPolicyViolationError: content_policy_violation",
    ],
)
def test_policy_cause_wins_over_500_and_fallback_noise(body):
    error = RuntimeError(
        "Error code: 500 - litellm.MidStreamFallbackError: "
        + body
        + " No fallback model group found for origin auth/gpt-6-astra "
        + "fallbacks=[secret-router-configuration] Authorization: Bearer sk-TESTSECRET123456789"
    )
    assert _classify_provider_error(error) == "fatal"
    with pytest.raises(RuntimeError) as raised:
        _reraise_with_actionable_message(error, "auth/gpt-6-astra")
    message = str(raised.value)
    assert "provider policy rejection" in message
    assert "subscription/OAuth" in message
    assert "does not establish access" in message
    assert "DECEPTICON_AUTH_PRIORITY" not in message
    assert "no provider fallback" not in message
    assert "secret-router-configuration" not in message
    assert "TESTSECRET" not in message
    assert len(message) < 1000
    assert raised.value.__cause__ is error


def test_api_policy_rejection_has_project_guidance_without_oauth_assumption():
    with pytest.raises(RuntimeError) as raised:
        _reraise_with_actionable_message(RuntimeError("cyber_policy"), "openai/gpt-6-astra")
    assert "verify the exact project and model" in str(raised.value)
    assert "subscription/OAuth" not in str(raised.value)


@pytest.mark.parametrize(
    "message",
    [
        "Error code: 500 - upstream unavailable",
        "Error code: 500 - rate limit policy service is unavailable",
        "Error code: 500 - No fallback model group found",
    ],
)
def test_other_500_errors_remain_retryable(message):
    assert _classify_provider_error(RuntimeError(message)) == "retryable"
