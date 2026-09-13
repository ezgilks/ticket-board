import hashlib
import math
import os

import pytest
from fastapi.testclient import TestClient

from app.embeddings import DIMENSIONS, get_embedder
from app.main import app


class FakeEmbedder:
    """Deterministic unit vectors derived from a hash — no model download, instant."""

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            digest = hashlib.sha256(text.encode()).digest()
            raw = [digest[i % len(digest)] - 128 for i in range(DIMENSIONS)]
            norm = math.sqrt(sum(x * x for x in raw)) or 1.0
            out.append([x / norm for x in raw])
        return out


@pytest.fixture
def client():
    # Swap the real model for the fake via FastAPI dependency overrides.
    app.dependency_overrides[get_embedder] = FakeEmbedder
    yield TestClient(app)
    app.dependency_overrides.clear()


def pytest_collection_modifyitems(config, items):
    # Tests marked @pytest.mark.model load the real ~90MB model; opt in with RUN_MODEL_TESTS=1.
    if os.environ.get("RUN_MODEL_TESTS") == "1":
        return
    skip = pytest.mark.skip(reason="set RUN_MODEL_TESTS=1 to run real-model tests")
    for item in items:
        if "model" in item.keywords:
            item.add_marker(skip)
