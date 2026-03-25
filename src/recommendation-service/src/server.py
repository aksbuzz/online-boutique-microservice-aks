import os
from concurrent import futures

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc

from proto import Recommendation_pb2_grpc
from servicer import RecommendationServicer
from logger import get_logger

logger = get_logger("recommendation-service")

_PORT = os.environ.get("PORT", "5007")
_SERVICE_NAME = "boutiqueshop.RecommendationService"

if __name__ == "__main__":
    logger.info("recommendation-service starting")

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))

    Recommendation_pb2_grpc.add_RecommendationServiceServicer_to_server(
        RecommendationServicer(), server
    )

    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)
    health_servicer.set(_SERVICE_NAME, health_pb2.HealthCheckResponse.SERVING)

    server.add_insecure_port(f"0.0.0.0:{_PORT}")
    server.start()
    logger.info(f"listening on port {_PORT}")
    server.wait_for_termination()