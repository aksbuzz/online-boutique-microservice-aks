import threading
import time
import grpc
import os

from proto import Catalog_pb2, Catalog_pb2_grpc
from logger import get_logger

logger = get_logger("recommendation-service")

_CATALOG_ADDR = os.environ.get("CATALOG_SERVICE_ADDR", "catalog-service:5002")
_CACHE_TTL_SECONDS = 300  # 5 minutes

_lock = threading.Lock()
_cache: list = []
_cache_fetched_at: float = 0.0

_channel = grpc.insecure_channel(_CATALOG_ADDR)
_stub = Catalog_pb2_grpc.CatalogServiceStub(_channel)


def get_all_products() -> list:
    global _cache, _cache_fetched_at

    now = time.monotonic()
    
    # Fast Path
    if _cache and (now - _cache_fetched_at) < _CACHE_TTL_SECONDS:
        return _cache
    
    with _lock:
        if _cache and (time.monotonic() - _cache_fetched_at) < _CACHE_TTL_SECONDS:
            return _cache

        try:
            response = _stub.ListProducts(Catalog_pb2.Empty(), timeout=5.0)
            _cache = list(response.products)
            _cache_fetched_at = time.monotonic()
            logger.info(f"catalog cache refreshed: {len(_cache)} products")

        except grpc.RpcError as e:
            if _cache:
                logger.warning(f"catalog-service error {e.code()}, returning stale cache")
            else:
                logger.warning(f"catalog-service unavailable: {e.code()}, returning empty list")
                return []

    return _cache