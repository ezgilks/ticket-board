"""ai-service: stateless text-in, vectors/labels-out.

Invariant: this service never touches the database. The Express API owns all data;
this service only does math on text it is handed. That keeps it trivially scalable
and replaceable.
"""

import hmac
import os
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.embeddings import DIMENSIONS, MODEL_NAME, Embedder, get_embedder
from app.triage import Label, Priority, TriageService, build_provider


def require_service_token(x_service_token: Annotated[str | None, Header()] = None) -> None:
    """In production this service has a public URL, so anyone could call it and spend the
    LLM quota. When AI_SERVICE_TOKEN is set, only callers holding it (the API) get through."""
    expected = os.environ.get("AI_SERVICE_TOKEN")
    # compare_digest takes the same time whether the first or last character differs,
    # so response timing can't be used to guess the token one character at a time.
    if expected and not hmac.compare_digest(x_service_token or "", expected):
        raise HTTPException(status_code=401, detail="invalid service token")


app = FastAPI(title="Ticket Board AI service")

# Dependency injection: the route asks for "an Embedder"; FastAPI supplies one.
# Tests override get_embedder with a fake, so they never load the real model.
EmbedderDep = Annotated[Embedder, Depends(get_embedder)]


@lru_cache(maxsize=1)
def get_triage() -> TriageService:
    return TriageService(build_provider())


TriageDep = Annotated[TriageService, Depends(get_triage)]


class EmbedRequest(BaseModel):
    texts: list[Annotated[str, Field(max_length=8000)]] = Field(min_length=1, max_length=64)


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    vectors: list[list[float]]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/embed", response_model=EmbedResponse, dependencies=[Depends(require_service_token)])
def embed(req: EmbedRequest, embedder: EmbedderDep) -> EmbedResponse:
    # A plain `def` (not async): FastAPI runs it in a thread pool, so CPU-heavy
    # encoding doesn't block the event loop from answering other requests.
    return EmbedResponse(model=MODEL_NAME, dimensions=DIMENSIONS, vectors=embedder.embed(req.texts))


class TriageRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)


class TriageResponse(BaseModel):
    labels: list[Label]
    priority: Priority
    provider: str


@app.post("/triage", response_model=TriageResponse, dependencies=[Depends(require_service_token)])
def triage(req: TriageRequest, service: TriageDep) -> TriageResponse:
    result, provider = service.triage(req.title, req.description)
    return TriageResponse(labels=result.labels, priority=result.priority, provider=provider)
