"""Stream Processor — aggregates city events and pushes to WebSocket clients."""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone

from state import CityState
from ws_manager import ConnectionManager

# Chicago roads lookup for matching plan roads to traffic segments
ROAD_ALIASES: dict[str, list[str]] = {
    "i-90/94 (kennedy)": ["kennedy", "i-90", "i90"],
    "i-90/94 (dan ryan)": ["dan ryan", "i-94", "i94"],
    "i-290 (eisenhower)": ["eisenhower", "i-290", "i290"],
    "lake shore drive": ["lsd", "dusable lake shore", "lake shore"],
    "michigan ave": ["michigan avenue", "michigan"],
    "state st": ["state street", "state"],
    "clark st": ["clark street", "clark"],
    "halsted st": ["halsted street", "halsted"],
    "ashland ave": ["ashland avenue", "ashland"],
    "western ave": ["western avenue", "western"],
    "roosevelt rd": ["roosevelt road", "roosevelt"],
    "chicago ave": ["chicago avenue"],
    "north ave": ["north avenue"],
    "fullerton ave": ["fullerton avenue", "fullerton"],
}


def match_road(road_name: str, target: str) -> bool:
    """Check if a road name matches a target (fuzzy, case-insensitive)."""
    road_lower = road_name.lower()
    target_lower = target.lower()
    if target_lower in road_lower or road_lower in target_lower:
        return True
    for canonical, aliases in ROAD_ALIASES.items():
        if target_lower in canonical or canonical in target_lower:
            if road_lower in canonical or canonical in road_lower:
                return True
        for alias in aliases:
            if target_lower in alias or alias in target_lower:
                if road_lower in canonical or canonical in road_lower:
                    return True
    return False

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.post("/api/execute-plan")
async def execute_plan(plan: dict):
    """
    Execute a response plan by modifying live city data:
    - Close affected roads (speed → 0, congestion → severe)
    - Speed up alternate routes (congestion improves)
    - Update incident status to 'responding'
    - Stop transit on affected routes
    """
    if not redis_client:
        return {"error": "Redis not available"}

    now = datetime.now(timezone.utc).isoformat()

    # Handle resolve request — mark incident as resolved and return
    if plan.get("resolve"):
        incident_id = plan.get("incident_id", "")
        if incident_id:
            resolve_event = {
                "type": "incident",
                "id": incident_id,
                "timestamp": now,
                "status": "resolved",
                "position": plan.get("incident_position", [0, 0]),
                "category": "accident",
                "severity": "low",
                "description": "Incident resolved",
                "affected_roads": [],
            }
            await redis_client.publish(EVENTS_CHANNEL, json.dumps(resolve_event))
        return {"status": "resolved", "incident_id": incident_id}

    affected_roads: list[str] = plan.get("affected_roads", [])
    alternate_routes: list[str] = plan.get("alternate_routes", [])
    incident_id: str = plan.get("incident_id", "")
    incident_position: list[float] = plan.get("incident_position", [0, 0])

    # 1. Modify traffic: close affected roads, improve alternate routes
    current_traffic = city_state.snapshot().get("traffic")
    if current_traffic and "segments" in current_traffic:
        new_segments = []
        for seg in current_traffic["segments"]:
            road = seg["road"]
            new_seg = dict(seg)

            # Check if this road should be closed
            is_affected = any(match_road(road, ar) for ar in affected_roads)
            if is_affected:
                new_seg["speed_mph"] = 0
                new_seg["congestion_level"] = "severe"

            # Check if this road is an alternate route (improve flow)
            is_reroute = any(match_road(road, rt) for rt in alternate_routes)
            if is_reroute and not is_affected:
                new_seg["speed_mph"] = min(new_seg.get("free_flow_mph", 30), new_seg["speed_mph"] * 1.4)
                new_seg["congestion_level"] = "light"

            new_segments.append(new_seg)

        traffic_event = {"type": "traffic", "timestamp": now, "segments": new_segments}
        await redis_client.publish(EVENTS_CHANNEL, json.dumps(traffic_event))

    # 2. Update incident status to "responding"
    if incident_id:
        incident_event = {
            "type": "incident",
            "id": incident_id,
            "timestamp": now,
            "status": "responding",
            "position": incident_position,
            "category": plan.get("category", "accident"),
            "severity": plan.get("severity", "high"),
            "description": plan.get("description", ""),
            "affected_roads": affected_roads,
        }
        await redis_client.publish(EVENTS_CHANNEL, json.dumps(incident_event))

    # 3. Stop transit vehicles near affected roads
    current_transit = city_state.snapshot().get("transit")
    if current_transit and "vehicles" in current_transit:
        new_vehicles = []
        for v in current_transit["vehicles"]:
            new_v = dict(v)
            # Stop vehicles on routes that pass through affected roads
            route_lower = v.get("route", "").lower()
            is_near = any(
                match_road(route_lower, ar) or match_road(ar, route_lower)
                for ar in affected_roads
            )
            # Also check if vehicle position is near incident
            if incident_position and len(incident_position) == 2:
                vlat, vlng = v.get("position", [0, 0])
                ilat, ilng = incident_position
                dist = abs(vlat - ilat) + abs(vlng - ilng)
                if dist < 0.015:  # ~1 mile
                    is_near = True

            if is_near:
                new_v["speed_mph"] = 0
                new_v["status"] = "stopped"
                new_v["delay_minutes"] = 30

            new_vehicles.append(new_v)

        transit_event = {"type": "transit", "timestamp": now, "vehicles": new_vehicles}
        await redis_client.publish(EVENTS_CHANNEL, json.dumps(transit_event))

    return {"status": "executed", "affected_roads": affected_roads, "alternate_routes": alternate_routes}


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
