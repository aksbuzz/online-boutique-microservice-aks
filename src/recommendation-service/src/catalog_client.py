import os
import time

import grpc

from proto import Catalog_pb2, Catalog_pb2_grpc
from logger import get_logger

logger = get_logger("recommendation-service")

_CATALOG_ADDR = os.environ.get("CATALOG_SERVICE_ADDR", "catalog-service:5002")
_CACHE_TTL_SECONDS = 300  # 5 minutes

_cache: list = []
_cache_fetched_at: float = 0.0


def get_all_products() -> list:
    global _cache, _cache_fetched_at

    now = time.monotonic()
    if _cache and (now - _cache_fetched_at) < _CACHE_TTL_SECONDS:
        return _cache

    try:
        with grpc.insecure_channel(_CATALOG_ADDR) as channel:
            stub = Catalog_pb2_grpc.CatalogServiceStub(channel)
            response = stub.ListProducts(Catalog_pb2.Empty())
        
        _cache = list(response.products)
        _cache_fetched_at = now
        logger.info(f"catalog cache refreshed: {len(_cache)} products")
        return _cache

    except grpc.RpcError as e:
        logger.warning(f"catalog-service unavailable: {e.code()}, returning empty list")
        return []
