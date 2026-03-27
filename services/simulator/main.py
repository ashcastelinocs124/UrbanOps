import asyncio
import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI

from generators.traffic import generate_traffic
from generators.transit import generate_transit
from generators.incidents import maybe_generate_incident
from generators.weather import generate_weather
from config import TRAFFIC_INTERVAL, TRANSIT_INTERVAL, INCIDENT_INTERVAL, WEATHER_INTERVAL

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
CHANNEL = "city.events"

redis_client: aioredis.Redis | None = None


async def publish(event_json: str):
    if redis_client:
        await redis_client.publish(CHANNEL, event_json)


async def traffic_loop():
    while True:
        event = generate_traffic()
        await publish(event.model_dump_json())
        await asyncio.sleep(TRAFFIC_INTERVAL)


async def transit_loop():
    while True:
        event = generate_transit()
        await publish(event.model_dump_json())
        await asyncio.sleep(TRANSIT_INTERVAL)


async def incident_loop():
    while True:
        event = maybe_generate_incident()
        if event:
            await publish(event.model_dump_json())
        await asyncio.sleep(INCIDENT_INTERVAL)


async def weather_loop():
    while True:
        event = generate_weather()
        await publish(event.model_dump_json())
        await asyncio.sleep(WEATHER_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = aioredis.from_url(REDIS_URL)
    tasks = [
        asyncio.create_task(traffic_loop()),
        asyncio.create_task(transit_loop()),
        asyncio.create_task(incident_loop()),
        asyncio.create_task(weather_loop()),
    ]
    yield
    for t in tasks:
        t.cancel()
    if redis_client:
        await redis_client.aclose()


app = FastAPI(title="UrbanOps Simulator", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"service": "simulator", "status": "ok"}
