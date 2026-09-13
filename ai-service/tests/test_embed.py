import math

import pytest

from app.embeddings import DIMENSIONS


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_embed_returns_one_unit_vector_per_text(client):
    res = client.post("/embed", json={"texts": ["login is broken", "add dark mode"]})
    assert res.status_code == 200
    body = res.json()
    assert body["dimensions"] == DIMENSIONS
    assert len(body["vectors"]) == 2
    for v in body["vectors"]:
        assert len(v) == DIMENSIONS
        assert math.isclose(math.sqrt(sum(x * x for x in v)), 1.0, rel_tol=1e-6)


def test_embed_validates_input(client):
    assert client.post("/embed", json={"texts": []}).status_code == 422


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b, strict=True))


@pytest.mark.model
def test_real_model_puts_similar_meanings_close_together():
    from app.embeddings import SentenceTransformerEmbedder

    login_a, login_b, unrelated = SentenceTransformerEmbedder().embed(
        ["Login button does nothing", "Users can't sign in to their account", "Change the footer font color"]
    )
    assert cosine(login_a, login_b) > cosine(login_a, unrelated) + 0.2


def test_service_token_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setenv("AI_SERVICE_TOKEN", "s3cret")
    body = {"texts": ["hello"]}
    assert client.post("/embed", json=body).status_code == 401
    assert client.post("/embed", json=body, headers={"X-Service-Token": "wrong"}).status_code == 401
    assert client.post("/embed", json=body, headers={"X-Service-Token": "s3cret"}).status_code == 200
