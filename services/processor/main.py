"""Stream Processor — aggregates city events and pushes to WebSocket clients."""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from state import CityState
from ws_manager import ConnectionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
EVENTS_CHANNEL = "city.events"
RECOMMENDATIONS_CHANNEL = "city.recommendations"

city_state = CityState()
manager = ConnectionManager()
redis_client: aioredis.Redis | None = None


async def redis_subscriber() -> None:
    """Subscribe to Redis channels and fan out events to state + WebSocket clients."""
    if redis_client is None:
        return

    pubsub = redis_client.pubsub()
    await pubsub.subscribe(EVENTS_CHANNEL, RECOMMENDATIONS_CHANNEL)
    logger.info("Subscribed to %s and %s", EVENTS_CHANNEL, RECOMMENDATIONS_CHANNEL)

    try:
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            raw = message["data"]
            if isinstance(raw, bytes):
                raw = raw.decode()

            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Received malformed JSON, skipping")
                continue

            city_state.update(event)
            await manager.broadcast(raw)
    finally:
        await pubsub.unsubscribe(EVENTS_CHANNEL, RECOMMENDATIONS_CHANNEL)
        await pubsub.aclose()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = aioredis.from_url(REDIS_URL)
    subscriber_task = asyncio.create_task(redis_subscriber())
    logger.info("Processor started — listening for events")
    yield
    subscriber_task.cancel()
    if redis_client:
        await redis_client.aclose()


app = FastAPI(title="UrbanOps Processor", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "service": "processor",
        "status": "ok",
        "connections": manager.count,
    }


@app.get("/api/snapshot")
async def snapshot():
    return city_state.snapshot()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    try:
        # Send the current snapshot immediately on connect
        await ws.send_json(city_state.snapshot())
        # Keep connection alive — wait for client messages (or disconnect)
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)
