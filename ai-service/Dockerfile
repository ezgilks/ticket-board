FROM python:3.14-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/.cache/huggingface

COPY requirements.txt .
RUN pip install -r requirements.txt

# Download the model at build time and bake it into the image, so a cold start
# doesn't spend 20+ seconds fetching ~90MB from Hugging Face.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
ENV HF_HUB_OFFLINE=1

COPY app ./app
RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8001
# Hosts like Render inject $PORT; default to 8001 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
