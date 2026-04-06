import logging
import os
import threading

from dotenv import load_dotenv
from fastapi import FastAPI

from consumer import run_consumer

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="Notification Service")

_stop = threading.Event()
_consumer_thread: threading.Thread | None = None
_consumer_ready = threading.Event()


@app.on_event("startup")
def _start_consumer():
    global _consumer_thread
    _consumer_ready.clear()

    def on_ready():
        _consumer_ready.set()

    _consumer_thread = threading.Thread(
        target=run_consumer,
        args=(_stop, on_ready),
        daemon=True,
        name="amqp-consumer",
    )
    _consumer_thread.start()


@app.on_event("shutdown")
def _stop_consumer():
    _stop.set()
    if _consumer_thread is not None:
        _consumer_thread.join(timeout=5)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "consumer_ready": _consumer_ready.is_set(),
    }
