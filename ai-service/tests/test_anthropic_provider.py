"""Checks the request the Anthropic SDK sends and how its reply is parsed — offline,
through a fake HTTP transport. (The anthropic 1.x SDK uses httpx2, a fork of httpx.)"""

import json

import anthropic
import httpx2

from app.triage import AnthropicProvider


def test_anthropic_provider_uses_structured_outputs_and_parses_reply():
    seen = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen["body"] = json.loads(request.content)
        return httpx2.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": "claude-haiku-4-5",
                "content": [{"type": "text", "text": '{"labels": ["auth", "bug"], "priority": "HIGH"}'}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 120, "output_tokens": 20},
            },
        )

    provider = AnthropicProvider("sk-test")
    provider._client = anthropic.Anthropic(
        api_key="sk-test", http_client=anthropic.DefaultHttpxClient(transport=httpx2.MockTransport(handler))
    )

    result = provider.triage("Login fails with 500", None)

    assert result.labels == ["auth", "bug"]
    assert result.priority == "HIGH"
    body = seen["body"]
    assert body["model"] == "claude-haiku-4-5"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert "<ticket>" in body["messages"][0]["content"]
