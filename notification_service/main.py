"""
Notification Service – RabbitMQ subscriber only. No HTTP endpoints.
Receives payment status from RabbitMQ → sends SMS (and reconciliation). No database.
"""
import logging
import sys

from consumer import run_consumer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    try:
        run_consumer()
    except KeyboardInterrupt:
        logger.info("Notification Service stopped.")
