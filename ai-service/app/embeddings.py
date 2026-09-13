"""Text -> vector embeddings, computed locally with sentence-transformers.

An embedding is a list of numbers (here 384 of them) that encodes a text's *meaning*.
Texts about similar things end up pointing in similar directions, so "login button
broken" and "can't sign in" are close together even though they share no words.
"""

from functools import lru_cache
from typing import Protocol

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
DIMENSIONS = 384


class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    def __init__(self) -> None:
        # Imported here so tests that use a fake embedder never load PyTorch.
        from sentence_transformers import SentenceTransformer

        # Downloads ~90MB on first run, then loads from the local cache.
        self._model = SentenceTransformer(MODEL_NAME, device="cpu")

    def embed(self, texts: list[str]) -> list[list[float]]:
        # normalize_embeddings=True scales every vector to length 1. Then cosine
        # similarity is just a dot product, and pgvector's cosine distance is exact.
        vectors = self._model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
        return vectors.tolist()


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    """Load the model once per process — loading takes seconds, encoding takes milliseconds."""
    return SentenceTransformerEmbedder()
