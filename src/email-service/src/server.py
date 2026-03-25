import os
from concurrent import futures

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc

from proto import Email_pb2_grpc
from logger import get_logger
from servicer import EmailServicer, LogSender, SmtpSender

logger = get_logger("email-service")

_PORT = "5003"
_SERVICE_NAME = "boutiqueshop.EmailService"


def _make_sender():
    backend = os.environ.get("EMAIL_BACKEND", "log")
    if backend == "smtp":
        host = os.environ.get("SMTP_HOST")
        if not host:
            raise RuntimeError("EMAIL_BACKEND=smtp requires SMTP_HOST to be set")
        return SmtpSender(
            host=host,
            port=int(os.environ.get("SMTP_PORT", "587")),
            user=os.environ.get("SMTP_USER", ""),
            password=os.environ.get("SMTP_PASSWORD", ""),
            from_addr=os.environ.get("EMAIL_FROM", "noreply@example.com"),
        )
    logger.info("email backend: log (mock)")
    return LogSender()


if __name__ == "__main__":
    logger.info("email-service starting")

    sender = _make_sender()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))

    Email_pb2_grpc.add_EmailServiceServicer_to_server(EmailServicer(sender), server)

    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)
    health_servicer.set("", health_pb2.HealthCheckResponse.SERVING)
    health_servicer.set(_SERVICE_NAME, health_pb2.HealthCheckResponse.SERVING)

    server.add_insecure_port(f"0.0.0.0:{_PORT}")
    server.start()
    logger.info(f"listening on port {_PORT}")
    server.wait_for_termination()
