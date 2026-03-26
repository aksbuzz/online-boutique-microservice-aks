# ── Stage 1: generate proto bindings ─────────────────────────────────────────
FROM python:3.12-slim AS protos
WORKDIR /gen
RUN pip install --no-cache-dir grpcio-tools
COPY src/proto/ ./proto/
RUN python -m grpc_tools.protoc \
        --python_out=. --grpc_python_out=. \
        -I . proto/Catalog.proto proto/Recommendation.proto && \
    touch proto/__init__.py

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir grpcio grpcio-health-checking
COPY src/server.py src/servicer.py src/logger.py src/catalog_client.py ./src/
COPY --from=protos /gen/proto/ ./src/proto/
WORKDIR /app/src
EXPOSE 5007
CMD ["python", "server.py"]
