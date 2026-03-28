# ── Stage 1: generate proto bindings ─────────────────────────────────────────
FROM python:3.12-slim AS protos
WORKDIR /gen
RUN pip install --no-cache-dir grpcio-tools
COPY src/recommendation-service/src/proto/ ./proto/
RUN python -m grpc_tools.protoc \
        --python_out=. --grpc_python_out=. \
        -I . proto/Catalog.proto proto/Recommendation.proto && \
    touch proto/__init__.py

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

COPY src/recommendation-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/recommendation-service/src/*.py ./src/
COPY --from=protos /gen/proto/ ./src/proto/

EXPOSE 5007
ENV PYTHONPATH=/app/src
CMD ["python", "src/server.py"]
