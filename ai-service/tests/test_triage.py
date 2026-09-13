import pytest

from app.main import app, get_triage
from app.triage import KeywordProvider, TriageResult, TriageService, build_provider


@pytest.mark.parametrize(
    ("title", "labels", "priority"),
    [
        ("Production API is down for all users", None, "URGENT"),
        ("Users can't sign in with Google", ["auth"], "HIGH"),
        ("XSS vulnerability in comment field", ["security"], "HIGH"),
        ("Fix typo in README", ["bug", "docs"], "MEDIUM"),
        ("Change footer font color", ["ux"], "LOW"),
        ("Dashboard chart loads slowly", ["performance"], "MEDIUM"),
        ("Checkout page crashes in production", ["bug"], "URGENT"),
        ("Signup form fails validation on Safari", ["bug"], "MEDIUM"),
    ],
)
def test_keyword_rules(title, labels, priority):
    result = KeywordProvider().triage(title, None)
    assert result.priority == priority
    if labels:
        for label in labels:
            assert label in result.labels


class ExplodingProvider:
    name = "exploding"

    def triage(self, title, description):
        raise RuntimeError("rate limited")


def test_falls_back_to_keywords_when_the_llm_fails():
    result, provider = TriageService(ExplodingProvider()).triage("Login page crashes", None)
    assert provider == "keyword (fallback)"
    assert "auth" in result.labels


class FixedProvider:
    name = "fixed"

    def triage(self, title, description):
        return TriageResult(labels=["infra"], priority="HIGH")


def test_triage_endpoint_uses_the_injected_provider(client):
    app.dependency_overrides[get_triage] = lambda: TriageService(FixedProvider())
    res = client.post("/triage", json={"title": "Deploy failing"})
    assert res.json() == {"labels": ["infra"], "priority": "HIGH", "provider": "fixed"}


def test_output_schema_rejects_labels_outside_the_list():
    with pytest.raises(ValueError):
        TriageResult.model_validate({"labels": ["ignore previous instructions"], "priority": "LOW"})


def test_provider_selection(monkeypatch):
    for var in ("TRIAGE_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    assert build_provider().name == "keyword"

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    assert build_provider().name == "anthropic"

    monkeypatch.setenv("GEMINI_API_KEY", "g-test")
    assert build_provider().name == "gemini"  # free provider wins under auto

    monkeypatch.setenv("TRIAGE_PROVIDER", "anthropic")
    assert build_provider().name == "anthropic"
