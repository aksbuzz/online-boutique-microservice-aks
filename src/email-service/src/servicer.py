import grpc
import smtplib
from email.mime.text import MIMEText

from proto import Email_pb2_grpc, Email_pb2
from logger import get_logger

logger = get_logger("email-service")

def _format_money(money) -> str:
    cents = money.nanos // 10_000_000
    return f"{money.currency_code} {money.units}.{cents:02d}"

def _build_body(order) -> str:
    lines = [
        f"Order Confirmation - Order #{order.order_id}",
        "",
        "Items:",
    ]
    for oi in order.items:
        lines.append(
            f"  - {oi.item.product_id} x {oi.item.quantity}  ({_format_money(oi.cost)})"
        )
    lines += [
        "",
        "Shipping to:",
        f"  {order.shipping_address.street_address}",
        f"  {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip_code}",
        f"  {order.shipping_address.country}",
        "",
        f"Tracking ID: {order.shipping_tracking_id}",
        f"Shipping cost: {_format_money(order.shipping_cost)}",
    ]
    return "\n".join(lines)

# SENDERS

class LogSender:
    def send(self, to: str, subject: str, body: str) -> None:
        logger.info(f"[mock] to={to!r} subject={subject!r}\n{body}")

class SmtpSender:
    def __init__(
        self,
        host: str,
        port: int,
        user: str,
        password: str,
        from_addr: str,
    ) -> None:
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._from = from_addr

    def send(self, to: str, subject: str, body: str) -> None:
        msg = MIMEText(body, "plain")
        msg["Subject"] = subject
        msg["From"] = self._from
        msg["To"] = to
        with smtplib.SMTP(self._host, self._port) as smtp:
            smtp.starttls()
            if self._user:
                smtp.login(self._user, self._password)
            smtp.send_message(msg)
        logger.info(f"email sent to={to!r} subject={subject!r}")


class EmailServicer(Email_pb2_grpc.EmailServiceServicer):
    def __init__(self, sender) -> None:
        self._sender = sender

    def SendOrderConfirmation(self, request, context):
        try:
            subject = f"Order Confirmation - #{request.order.order_id}"
            body = _build_body(request.order)
            self._sender.send(request.email, subject, body)
        except Exception as exc:
            logger.error(f"failed to send email: {exc}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(exc))
        return Email_pb2.Empty()