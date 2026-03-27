# UrbanOps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a portfolio-grade smart city operations dashboard that unifies traffic, transit, incidents, and weather data on a live Mapbox map of Chicago with LLM-powered recommendations.

**Architecture:** Event-driven microservices — Simulator, Stream Processor, and LLM Analyst communicate via Redis Pub/Sub. Next.js frontend connects to Processor via WebSocket. Docker Compose orchestrates everything.

**Tech Stack:** FastAPI (Python 3.11+), Redis, Next.js 14, React 18, Mapbox GL JS, Tailwind CSS, Anthropic Claude API

**Design Doc:** `docs/plans/2026-03-27-urbanops-design.md`

---

## Task 1: Project Scaffolding & Infrastructure

Set up Docker Compose, Redis, directory structure, environment config, and shared Python package for event schemas.

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `services/shared/schemas.py`
- Create: `services/shared/__init__.py`
- Create: `services/simulator/requirements.txt`
- Create: `services/simulator/Dockerfile`
- Create: `services/processor/requirements.txt`
- Create: `services/processor/Dockerfile`
- Create: `services/analyst/requirements.txt`
- Create: `services/analyst/Dockerfile`

**Step 1: Create `.gitignore`**

```gitignore
__pycache__/
*.pyc
.env
node_modules/
.next/
dist/
.venv/
*.egg-info/
```

**Step 2: Create `.env.example`**

```env
REDIS_URL=redis://redis:6379
MAPBOX_TOKEN=your_mapbox_token_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

**Step 3: Create shared Pydantic schemas**

Create `services/shared/__init__.py` (empty).

Create `services/shared/schemas.py`:

```python
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


# --- Enums ---

class CongestionLevel(str, Enum):
    FREE = "free"
    LIGHT = "light"
    MODERATE = "moderate"
    HEAVY = "heavy"
    SEVERE = "severe"


class TransitMode(str, Enum):
    BUS = "bus"
    TRAIN = "train"


class TransitStatus(str, Enum):
    ON_TIME = "on_time"
    DELAYED = "delayed"
    STOPPED = "stopped"


class IncidentCategory(str, Enum):
    ACCIDENT = "accident"
    ROAD_CLOSURE = "road_closure"
    FIRE = "fire"
    POLICE = "police"
    CONSTRUCTION = "construction"


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(str, Enum):
    ACTIVE = "active"
    RESPONDING = "responding"
    RESOLVED = "resolved"


class Precipitation(str, Enum):
    NONE = "none"
    RAIN = "rain"
    SNOW = "snow"
    SLEET = "sleet"
    FOG = "fog"


class ActionType(str, Enum):
    REROUTE_TRAFFIC = "reroute_traffic"
    DISPATCH_CREW = "dispatch_crew"
    CLOSE_ROAD = "close_road"
    ISSUE_ALERT = "issue_alert"


# --- Models ---

class TrafficSegment(BaseModel):
    road: str
    from_pos: list[float]  # [lat, lng]
    to_pos: list[float]    # [lat, lng]
    speed_mph: float
    free_flow_mph: float
    congestion_level: CongestionLevel


class TrafficEvent(BaseModel):
    type: str = "traffic"
    timestamp: datetime
    segments: list[TrafficSegment]


class TransitVehicle(BaseModel):
    id: str
    route: str
    mode: TransitMode
    position: list[float]  # [lat, lng]
    heading: float
    speed_mph: float
    delay_minutes: int
    status: TransitStatus


class TransitEvent(BaseModel):
    type: str = "transit"
    timestamp: datetime
    vehicles: list[TransitVehicle]


class IncidentEvent(BaseModel):
    type: str = "incident"
    id: str
    timestamp: datetime
    category: IncidentCategory
    severity: Severity
    position: list[float]  # [lat, lng]
    description: str
    affected_roads: list[str]
    status: IncidentStatus
    estimated_clearance: Optional[datetime] = None


class WeatherConditions(BaseModel):
    temperature_f: float
    wind_speed_mph: float
    wind_direction: str
    precipitation: Precipitation
    visibility_miles: float
    alert: Optional[str] = None


class WeatherEvent(BaseModel):
    type: str = "weather"
    timestamp: datetime
    conditions: WeatherConditions


class RecommendationAction(BaseModel):
    action: ActionType
    description: str
    priority: Severity
    affected_area: Optional[list[list[float]]] = None


class RecommendationEvent(BaseModel):
    type: str = "recommendation"
    id: str
    incident_id: str
    timestamp: datetime
    actions: list[RecommendationAction]
    summary: str
    confidence: float
```

**Step 4: Create requirements.txt for each service**

`services/simulator/requirements.txt`:
```
fastapi==0.115.12
uvicorn==0.34.2
redis==5.3.0
pydantic==2.11.3
faker==37.1.0
```

`services/processor/requirements.txt`:
```
fastapi==0.115.12
uvicorn==0.34.2
redis==5.3.0
pydantic==2.11.3
websockets==15.0.1
```

`services/analyst/requirements.txt`:
```
fastapi==0.115.12
uvicorn==0.34.2
redis==5.3.0
pydantic==2.11.3
anthropic==0.52.0
```

**Step 5: Create Dockerfiles**

All three services use the same Dockerfile pattern. `services/simulator/Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ../shared /app/shared
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

`services/processor/Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ../shared /app/shared
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
```

`services/analyst/Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ../shared /app/shared
COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]
```

**Step 6: Create `docker-compose.yml`**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  simulator:
    build:
      context: ./services
      dockerfile: simulator/Dockerfile
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./services/simulator:/app
      - ./services/shared:/app/shared

  processor:
    build:
      context: ./services
      dockerfile: processor/Dockerfile
    ports:
      - "8001:8001"
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./services/processor:/app
      - ./services/shared:/app/shared

  analyst:
    build:
      context: ./services
      dockerfile: analyst/Dockerfile
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./services/analyst:/app
      - ./services/shared:/app/shared

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - processor
    volumes:
      - ./frontend:/app
      - /app/node_modules
```

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding with Docker Compose, shared schemas, and service boilerplate"
```

---

## Task 2: Simulator — Chicago Data Generators

Build the four data generators that produce realistic Chicago city events. Each generator is a standalone module that returns Pydantic event objects.

**Files:**
- Create: `services/simulator/config.py`
- Create: `services/simulator/generators/__init__.py`
- Create: `services/simulator/generators/traffic.py`
- Create: `services/simulator/generators/transit.py`
- Create: `services/simulator/generators/incidents.py`
- Create: `services/simulator/generators/weather.py`
- Test: `services/simulator/tests/test_generators.py`

**Step 1: Create simulator config with Chicago geography**

`services/simulator/config.py`:

```python
"""Chicago-specific configuration for the simulator."""

# Chicago bounding box (downtown + surrounding area)
CHICAGO_CENTER = [41.8781, -87.6298]
CHICAGO_BOUNDS = {
    "north": 41.95,
    "south": 41.80,
    "east": -87.58,
    "west": -87.72,
}

# Major roads with start/end coordinates for traffic segments
CHICAGO_ROADS = [
    {"road": "I-90/94 (Kennedy)", "from": [41.8827, -87.6340], "to": [41.9400, -87.7200], "free_flow": 55},
    {"road": "I-90/94 (Dan Ryan)", "from": [41.8827, -87.6340], "to": [41.8100, -87.6700], "free_flow": 55},
    {"road": "I-290 (Eisenhower)", "from": [41.8750, -87.6350], "to": [41.8700, -87.7500], "free_flow": 55},
    {"road": "Lake Shore Drive", "from": [41.9100, -87.6250], "to": [41.8200, -87.6050], "free_flow": 40},
    {"road": "Michigan Ave", "from": [41.9000, -87.6245], "to": [41.8500, -87.6244], "free_flow": 25},
    {"road": "State St", "from": [41.9000, -87.6278], "to": [41.8500, -87.6275], "free_flow": 25},
    {"road": "Clark St", "from": [41.9200, -87.6310], "to": [41.8500, -87.6310], "free_flow": 25},
    {"road": "Halsted St", "from": [41.9200, -87.6467], "to": [41.8400, -87.6460], "free_flow": 30},
    {"road": "Ashland Ave", "from": [41.9300, -87.6694], "to": [41.8300, -87.6690], "free_flow": 30},
    {"road": "Western Ave", "from": [41.9400, -87.6866], "to": [41.8300, -87.6860], "free_flow": 30},
    {"road": "Roosevelt Rd", "from": [41.8674, -87.7200], "to": [41.8674, -87.6100], "free_flow": 30},
    {"road": "Chicago Ave", "from": [41.8967, -87.7200], "to": [41.8967, -87.6200], "free_flow": 25},
    {"road": "North Ave", "from": [41.9103, -87.7200], "to": [41.9103, -87.6300], "free_flow": 25},
    {"road": "Fullerton Ave", "from": [41.9253, -87.7100], "to": [41.9253, -87.6300], "free_flow": 25},
]

# CTA bus routes with approximate paths
CTA_BUS_ROUTES = [
    {"route": "77-Belmont", "stops": [[41.9394, -87.7200], [41.9394, -87.6536], [41.9394, -87.6300]]},
    {"route": "22-Clark", "stops": [[41.9500, -87.6550], [41.9100, -87.6340], [41.8800, -87.6310]]},
    {"route": "36-Broadway", "stops": [[41.9540, -87.6490], [41.9300, -87.6440], [41.9100, -87.6380]]},
    {"route": "8-Halsted", "stops": [[41.9400, -87.6470], [41.9000, -87.6465], [41.8600, -87.6460]]},
    {"route": "66-Chicago", "stops": [[41.8970, -87.7100], [41.8968, -87.6700], [41.8967, -87.6250]]},
    {"route": "60-Blue Island", "stops": [[41.8700, -87.6800], [41.8600, -87.6600], [41.8500, -87.6400]]},
]

# CTA L-train lines
CTA_TRAIN_LINES = [
    {"route": "Red Line", "stops": [[41.9474, -87.6536], [41.9269, -87.6530], [41.9037, -87.6313], [41.8819, -87.6278], [41.8568, -87.6270]]},
    {"route": "Blue Line", "stops": [[41.8740, -87.7440], [41.8750, -87.7170], [41.8756, -87.6884], [41.8758, -87.6553], [41.8819, -87.6290]]},
    {"route": "Brown Line", "stops": [[41.9667, -87.7128], [41.9547, -87.6919], [41.9394, -87.6536], [41.9116, -87.6343], [41.8857, -87.6333]]},
    {"route": "Green Line", "stops": [[41.8850, -87.6960], [41.8850, -87.6740], [41.8819, -87.6490], [41.8760, -87.6270]]},
]

# Event generation intervals (seconds)
TRAFFIC_INTERVAL = 2.0
TRANSIT_INTERVAL = 5.0
INCIDENT_INTERVAL = 15.0  # chance of new incident every 15s
WEATHER_INTERVAL = 60.0
```

**Step 2: Write tests for generators**

Create `services/simulator/tests/__init__.py` (empty).

`services/simulator/tests/test_generators.py`:

```python
from datetime import datetime

from shared.schemas import (
    CongestionLevel,
    IncidentCategory,
    IncidentStatus,
    Precipitation,
    Severity,
    TransitMode,
    TransitStatus,
)

from generators.traffic import generate_traffic
from generators.transit import generate_transit
from generators.incidents import maybe_generate_incident
from generators.weather import generate_weather


def test_generate_traffic_returns_all_roads():
    event = generate_traffic()
    assert event.type == "traffic"
    assert isinstance(event.timestamp, datetime)
    assert len(event.segments) > 0
    for seg in event.segments:
        assert 0 <= seg.speed_mph <= seg.free_flow_mph + 5
        assert seg.congestion_level in CongestionLevel


def test_generate_transit_returns_vehicles():
    event = generate_transit()
    assert event.type == "transit"
    assert len(event.vehicles) > 0
    for v in event.vehicles:
        assert v.mode in TransitMode
        assert v.status in TransitStatus
        assert len(v.position) == 2


def test_maybe_generate_incident():
    # Run enough times that we should get at least one incident
    incidents = []
    for _ in range(200):
        inc = maybe_generate_incident()
        if inc is not None:
            incidents.append(inc)
    assert len(incidents) > 0
    inc = incidents[0]
    assert inc.type == "incident"
    assert inc.category in IncidentCategory
    assert inc.severity in Severity
    assert inc.status in IncidentStatus
    assert len(inc.position) == 2


def test_generate_weather():
    event = generate_weather()
    assert event.type == "weather"
    assert -20 <= event.conditions.temperature_f <= 110
    assert event.conditions.precipitation in Precipitation
    assert event.conditions.visibility_miles > 0
```

**Step 3: Run tests — expect failure (modules don't exist yet)**

```bash
cd services/simulator && python -m pytest tests/ -v
```
Expected: `ModuleNotFoundError`

**Step 4: Implement traffic generator**

`services/simulator/generators/__init__.py` (empty).

`services/simulator/generators/traffic.py`:

```python
import random
from datetime import datetime, timezone

from shared.schemas import CongestionLevel, TrafficEvent, TrafficSegment
from config import CHICAGO_ROADS


def _speed_to_congestion(speed: float, free_flow: float) -> CongestionLevel:
    ratio = speed / free_flow
    if ratio > 0.8:
        return CongestionLevel.FREE
    if ratio > 0.6:
        return CongestionLevel.LIGHT
    if ratio > 0.4:
        return CongestionLevel.MODERATE
    if ratio > 0.2:
        return CongestionLevel.HEAVY
    return CongestionLevel.SEVERE


def generate_traffic() -> TrafficEvent:
    segments = []
    for road in CHICAGO_ROADS:
        # Simulate speed as fraction of free flow with some randomness
        factor = random.betavariate(5, 2)  # skewed toward faster speeds
        speed = round(road["free_flow"] * factor, 1)
        segments.append(
            TrafficSegment(
                road=road["road"],
                from_pos=road["from"],
                to_pos=road["to"],
                speed_mph=speed,
                free_flow_mph=road["free_flow"],
                congestion_level=_speed_to_congestion(speed, road["free_flow"]),
            )
        )
    return TrafficEvent(timestamp=datetime.now(timezone.utc), segments=segments)
```

**Step 5: Implement transit generator**

`services/simulator/generators/transit.py`:

```python
import random
from datetime import datetime, timezone

from shared.schemas import TransitEvent, TransitMode, TransitStatus, TransitVehicle
from config import CTA_BUS_ROUTES, CTA_TRAIN_LINES


def _interpolate(stops: list[list[float]], progress: float) -> list[float]:
    """Interpolate position along a route given progress 0-1."""
    n = len(stops) - 1
    idx = min(int(progress * n), n - 1)
    local_t = (progress * n) - idx
    lat = stops[idx][0] + (stops[idx + 1][0] - stops[idx][0]) * local_t
    lng = stops[idx][1] + (stops[idx + 1][1] - stops[idx][1]) * local_t
    return [round(lat, 6), round(lng, 6)]


def generate_transit() -> TransitEvent:
    vehicles = []

    for i, route in enumerate(CTA_BUS_ROUTES):
        progress = random.random()
        delay = random.choices([0, 2, 5, 10, 20], weights=[50, 25, 15, 8, 2])[0]
        status = TransitStatus.ON_TIME if delay == 0 else (TransitStatus.DELAYED if delay < 15 else TransitStatus.STOPPED)
        vehicles.append(
            TransitVehicle(
                id=f"bus-{route['route'].split('-')[0]}-{i:04d}",
                route=route["route"],
                mode=TransitMode.BUS,
                position=_interpolate(route["stops"], progress),
                heading=round(random.uniform(0, 360), 1),
                speed_mph=round(random.uniform(5, 25), 1) if status != TransitStatus.STOPPED else 0,
                delay_minutes=delay,
                status=status,
            )
        )

    for i, line in enumerate(CTA_TRAIN_LINES):
        progress = random.random()
        delay = random.choices([0, 1, 3, 8], weights=[60, 20, 15, 5])[0]
        status = TransitStatus.ON_TIME if delay == 0 else TransitStatus.DELAYED
        vehicles.append(
            TransitVehicle(
                id=f"train-{line['route'].lower().replace(' ', '-')}-{i:04d}",
                route=line["route"],
                mode=TransitMode.TRAIN,
                position=_interpolate(line["stops"], progress),
                heading=round(random.uniform(0, 360), 1),
                speed_mph=round(random.uniform(15, 45), 1),
                delay_minutes=delay,
                status=status,
            )
        )

    return TransitEvent(timestamp=datetime.now(timezone.utc), vehicles=vehicles)
```

**Step 6: Implement incident generator**

`services/simulator/generators/incidents.py`:

```python
import random
import uuid
from datetime import datetime, timedelta, timezone

from shared.schemas import (
    IncidentCategory,
    IncidentEvent,
    IncidentStatus,
    Severity,
)
from config import CHICAGO_BOUNDS, CHICAGO_ROADS

_DESCRIPTIONS = {
    IncidentCategory.ACCIDENT: [
        "Multi-vehicle collision",
        "Rear-end collision at intersection",
        "Vehicle struck pedestrian",
        "Single vehicle rollover",
    ],
    IncidentCategory.ROAD_CLOSURE: [
        "Water main break",
        "Sinkhole reported",
        "Downed power lines",
        "Emergency road repair",
    ],
    IncidentCategory.FIRE: [
        "Structure fire reported",
        "Vehicle fire on roadway",
        "Electrical fire near intersection",
    ],
    IncidentCategory.POLICE: [
        "Police activity — area blocked",
        "Active investigation in progress",
        "Crowd control operation",
    ],
    IncidentCategory.CONSTRUCTION: [
        "Lane closure for road resurfacing",
        "Utility work — expect delays",
        "Bridge maintenance in progress",
    ],
}


def maybe_generate_incident() -> IncidentEvent | None:
    """Returns an incident ~20% of the time, else None."""
    if random.random() > 0.20:
        return None

    category = random.choice(list(IncidentCategory))
    severity = random.choices(
        list(Severity), weights=[40, 30, 20, 10]
    )[0]

    # Place near a known road 70% of the time
    if random.random() < 0.7 and CHICAGO_ROADS:
        road = random.choice(CHICAGO_ROADS)
        t = random.random()
        lat = road["from"][0] + (road["to"][0] - road["from"][0]) * t
        lng = road["from"][1] + (road["to"][1] - road["from"][1]) * t
        affected = [road["road"]]
    else:
        lat = random.uniform(CHICAGO_BOUNDS["south"], CHICAGO_BOUNDS["north"])
        lng = random.uniform(CHICAGO_BOUNDS["west"], CHICAGO_BOUNDS["east"])
        affected = []

    # Add slight random offset
    lat += random.gauss(0, 0.002)
    lng += random.gauss(0, 0.002)

    now = datetime.now(timezone.utc)
    desc_options = _DESCRIPTIONS[category]
    road_suffix = f" on {affected[0]}" if affected else ""

    return IncidentEvent(
        id=f"inc-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}",
        timestamp=now,
        category=category,
        severity=severity,
        position=[round(lat, 6), round(lng, 6)],
        description=random.choice(desc_options) + road_suffix,
        affected_roads=affected,
        status=IncidentStatus.ACTIVE,
        estimated_clearance=now + timedelta(minutes=random.randint(15, 120)),
    )
```

**Step 7: Implement weather generator**

`services/simulator/generators/weather.py`:

```python
import random
from datetime import datetime, timezone

from shared.schemas import Precipitation, WeatherConditions, WeatherEvent

# State that persists across calls for gradual changes
_state = {
    "temp": 34.0,
    "wind": 15.0,
    "precip": Precipitation.SNOW,
    "visibility": 5.0,
}

_WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

_ALERTS = {
    Precipitation.SNOW: "Winter Storm Warning",
    Precipitation.SLEET: "Ice Storm Advisory",
    Precipitation.FOG: "Dense Fog Advisory",
}


def generate_weather() -> WeatherEvent:
    # Gradually drift temperature
    _state["temp"] += random.gauss(0, 1.5)
    _state["temp"] = max(-10, min(100, _state["temp"]))

    # Gradually drift wind
    _state["wind"] += random.gauss(0, 2)
    _state["wind"] = max(0, min(60, _state["wind"]))

    # Small chance to change precipitation
    if random.random() < 0.1:
        _state["precip"] = random.choice(list(Precipitation))

    # Visibility depends on precipitation
    base_vis = {
        Precipitation.NONE: 10.0,
        Precipitation.RAIN: 5.0,
        Precipitation.SNOW: 2.5,
        Precipitation.SLEET: 3.0,
        Precipitation.FOG: 0.5,
    }
    _state["visibility"] = base_vis[_state["precip"]] + random.gauss(0, 0.5)
    _state["visibility"] = max(0.1, _state["visibility"])

    alert = _ALERTS.get(_state["precip"]) if _state["wind"] > 20 else None

    return WeatherEvent(
        timestamp=datetime.now(timezone.utc),
        conditions=WeatherConditions(
            temperature_f=round(_state["temp"], 1),
            wind_speed_mph=round(_state["wind"], 1),
            wind_direction=random.choice(_WIND_DIRS),
            precipitation=_state["precip"],
            visibility_miles=round(_state["visibility"], 1),
            alert=alert,
        ),
    )
```

**Step 8: Run tests — expect pass**

```bash
cd services/simulator && PYTHONPATH=.. python -m pytest tests/ -v
```
Expected: All 4 tests pass.

**Step 9: Commit**

```bash
git add services/simulator/ services/shared/
git commit -m "feat: simulator data generators for traffic, transit, incidents, and weather"
```

---

## Task 3: Simulator — Main App with Redis Publishing

Wire the generators into a FastAPI app with background tasks that publish events to Redis on their configured intervals.

**Files:**
- Create: `services/simulator/main.py`
- Test: `services/simulator/tests/test_main.py`

**Step 1: Write test for the simulator app**

`services/simulator/tests/test_main.py`:

```python
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.anyio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["service"] == "simulator"
    assert data["status"] == "ok"
```

**Step 2: Run test — expect failure**

```bash
cd services/simulator && PYTHONPATH=.. python -m pytest tests/test_main.py -v
```
Expected: `ModuleNotFoundError: No module named 'main'`

**Step 3: Implement simulator main.py**

`services/simulator/main.py`:

```python
import asyncio
import json
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
```

**Step 4: Run test — expect pass**

```bash
cd services/simulator && PYTHONPATH=.. python -m pytest tests/test_main.py -v
```
Expected: PASS

**Step 5: Commit**

```bash
git add services/simulator/
git commit -m "feat: simulator FastAPI app with Redis publishing loops"
```

---

## Task 4: Stream Processor — State Manager & WebSocket Hub

Build the stream processor that subscribes to Redis, maintains city state, and pushes updates to frontend clients via WebSocket.

**Files:**
- Create: `services/processor/state.py`
- Create: `services/processor/ws_manager.py`
- Create: `services/processor/main.py`
- Test: `services/processor/tests/test_processor.py`

**Step 1: Write tests**

Create `services/processor/tests/__init__.py` (empty).

`services/processor/tests/test_processor.py`:

```python
import json

import pytest
from httpx import ASGITransport, AsyncClient

from state import CityState
from shared.schemas import TrafficEvent, IncidentEvent, WeatherEvent


def test_city_state_updates_traffic():
    state = CityState()
    traffic_data = {
        "type": "traffic",
        "timestamp": "2026-03-27T14:30:00Z",
        "segments": [
            {
                "road": "I-90",
                "from_pos": [41.88, -87.63],
                "to_pos": [41.89, -87.62],
                "speed_mph": 25,
                "free_flow_mph": 55,
                "congestion_level": "heavy",
            }
        ],
    }
    state.update(traffic_data)
    snapshot = state.snapshot()
    assert snapshot["traffic"] is not None
    assert len(snapshot["traffic"]["segments"]) == 1


def test_city_state_tracks_active_incidents():
    state = CityState()
    inc = {
        "type": "incident",
        "id": "inc-001",
        "timestamp": "2026-03-27T14:30:00Z",
        "category": "accident",
        "severity": "high",
        "position": [41.88, -87.63],
        "description": "Crash on I-90",
        "affected_roads": ["I-90"],
        "status": "active",
    }
    state.update(inc)
    assert len(state.snapshot()["incidents"]) == 1

    # Resolving removes it
    inc2 = {**inc, "status": "resolved"}
    state.update(inc2)
    assert len(state.snapshot()["incidents"]) == 0


def test_city_state_snapshot_has_all_keys():
    state = CityState()
    snap = state.snapshot()
    assert "traffic" in snap
    assert "transit" in snap
    assert "incidents" in snap
    assert "weather" in snap
    assert "recommendations" in snap
```

**Step 2: Run tests — expect failure**

```bash
cd services/processor && PYTHONPATH=.. python -m pytest tests/ -v
```

**Step 3: Implement state manager**

`services/processor/state.py`:

```python
from typing import Any


class CityState:
    """In-memory snapshot of current city state."""

    def __init__(self):
        self._traffic: dict | None = None
        self._transit: dict | None = None
        self._incidents: dict[str, dict] = {}
        self._weather: dict | None = None
        self._recommendations: dict[str, dict] = {}

    def update(self, event: dict) -> None:
        event_type = event.get("type")
        if event_type == "traffic":
            self._traffic = event
        elif event_type == "transit":
            self._transit = event
        elif event_type == "incident":
            if event.get("status") == "resolved":
                self._incidents.pop(event["id"], None)
            else:
                self._incidents[event["id"]] = event
        elif event_type == "weather":
            self._weather = event
        elif event_type == "recommendation":
            self._recommendations[event["id"]] = event

    def snapshot(self) -> dict[str, Any]:
        return {
            "traffic": self._traffic,
            "transit": self._transit,
            "incidents": list(self._incidents.values()),
            "weather": self._weather,
            "recommendations": list(self._recommendations.values()),
        }
```

**Step 4: Run tests — expect pass**

```bash
cd services/processor && PYTHONPATH=.. python -m pytest tests/ -v
```

**Step 5: Implement WebSocket manager**

`services/processor/ws_manager.py`:

```python
import json
from fastapi import WebSocket


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)

    def disconnect(self, ws: WebSocket):
        self._connections.remove(ws)

    async def broadcast(self, message: str):
        disconnected = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self._connections.remove(ws)

    @property
    def count(self) -> int:
        return len(self._connections)
```

**Step 6: Implement processor main.py**

`services/processor/main.py`:

```python
import asyncio
import json
import os
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from state import CityState
from ws_manager import ConnectionManager


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

city_state = CityState()
ws_manager = ConnectionManager()
redis_client: aioredis.Redis | None = None


async def redis_subscriber():
    """Subscribe to Redis channels and update state + broadcast."""
    sub = redis_client.pubsub()
    await sub.subscribe("city.events", "city.recommendations")

    async for message in sub.listen():
        if message["type"] != "message":
            continue
        try:
            data = json.loads(message["data"])
            city_state.update(data)
            await ws_manager.broadcast(json.dumps(data))
        except (json.JSONDecodeError, Exception):
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = aioredis.from_url(REDIS_URL)
    task = asyncio.create_task(redis_subscriber())
    yield
    task.cancel()
    if redis_client:
        await redis_client.aclose()


app = FastAPI(title="UrbanOps Stream Processor", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "service": "processor",
        "status": "ok",
        "connections": ws_manager.count,
    }


@app.get("/api/snapshot")
async def snapshot():
    """Return current city state as a single JSON object."""
    return city_state.snapshot()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    # Send current state on connect
    await ws.send_text(json.dumps({"type": "snapshot", **city_state.snapshot()}))
    try:
        while True:
            # Keep connection alive, ignore client messages
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
```

**Step 7: Commit**

```bash
git add services/processor/
git commit -m "feat: stream processor with city state, WebSocket broadcasting, and REST snapshot"
```

---

## Task 5: LLM Analyst — Claude-Powered Recommendations

Build the analyst service that listens for incidents and generates LLM-powered action recommendations.

**Files:**
- Create: `services/analyst/prompts.py`
- Create: `services/analyst/config.py`
- Create: `services/analyst/main.py`
- Test: `services/analyst/tests/test_analyst.py`

**Step 1: Write test**

Create `services/analyst/tests/__init__.py` (empty).

`services/analyst/tests/test_analyst.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.anyio
async def test_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["service"] == "analyst"
```

**Step 2: Create analyst config**

`services/analyst/config.py`:

```python
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-20250514"

# Only analyze incidents at or above this severity
MIN_SEVERITY = "medium"
SEVERITY_ORDER = ["low", "medium", "high", "critical"]
```

**Step 3: Create system prompt**

`services/analyst/prompts.py`:

```python
SYSTEM_PROMPT = """You are an AI operations analyst for the City of Chicago's Smart City Operations Center (UrbanOps).

Your role: When given an incident report with surrounding context (traffic conditions, weather, transit status), produce actionable recommendations for city operators.

Response format — return valid JSON only, no markdown:
{
  "actions": [
    {
      "action": "reroute_traffic | dispatch_crew | close_road | issue_alert",
      "description": "Specific, actionable instruction",
      "priority": "low | medium | high | critical",
      "affected_area": [[lat1, lng1], [lat2, lng2]]
    }
  ],
  "summary": "2-3 sentence executive summary of the situation and recommended response",
  "confidence": 0.0-1.0
}

Guidelines:
- Be specific to Chicago geography (reference actual streets, neighborhoods, CTA lines)
- Factor in weather conditions when recommending actions
- Consider time-of-day traffic patterns
- Prioritize public safety over traffic flow
- Keep summaries concise and operator-friendly
- Return 1-3 actions per incident, ordered by priority
"""
```

**Step 4: Implement analyst main.py**

`services/analyst/main.py`:

```python
import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import anthropic
import redis.asyncio as aioredis
from fastapi import FastAPI

from config import REDIS_URL, ANTHROPIC_API_KEY, MODEL, SEVERITY_ORDER, MIN_SEVERITY
from prompts import SYSTEM_PROMPT


redis_client: aioredis.Redis | None = None
llm_client: anthropic.Anthropic | None = None


async def analyze_incident(incident: dict, context: str) -> dict | None:
    """Call Claude to analyze an incident and return recommendation."""
    if not llm_client:
        return None

    user_prompt = f"""New incident reported:

{json.dumps(incident, indent=2, default=str)}

Current city context:
{context}

Analyze this incident and provide actionable recommendations."""

    try:
        response = llm_client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        result = json.loads(response.content[0].text)
        now = datetime.now(timezone.utc)
        return {
            "type": "recommendation",
            "id": f"rec-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}",
            "incident_id": incident.get("id", "unknown"),
            "timestamp": now.isoformat(),
            **result,
        }
    except Exception as e:
        print(f"LLM analysis failed: {e}")
        return None


async def incident_listener():
    """Subscribe to city.events, filter for incidents, analyze them."""
    sub = redis_client.pubsub()
    await sub.subscribe("city.events")

    # Keep recent context for LLM
    recent_context = {"traffic": None, "weather": None}

    async for message in sub.listen():
        if message["type"] != "message":
            continue
        try:
            data = json.loads(message["data"])
            event_type = data.get("type")

            # Track context
            if event_type in ("traffic", "weather"):
                recent_context[event_type] = data
                continue

            # Only analyze incidents above threshold
            if event_type != "incident":
                continue

            severity = data.get("severity", "low")
            if SEVERITY_ORDER.index(severity) < SEVERITY_ORDER.index(MIN_SEVERITY):
                continue

            # Build context string
            ctx_parts = []
            if recent_context["traffic"]:
                severe = [s for s in recent_context["traffic"].get("segments", []) if s.get("congestion_level") in ("heavy", "severe")]
                if severe:
                    ctx_parts.append(f"Congested roads: {', '.join(s['road'] for s in severe[:5])}")
            if recent_context["weather"]:
                w = recent_context["weather"]["conditions"]
                ctx_parts.append(f"Weather: {w['temperature_f']}°F, {w['precipitation']}, wind {w['wind_speed_mph']}mph {w['wind_direction']}, visibility {w['visibility_miles']}mi")

            context = "\n".join(ctx_parts) if ctx_parts else "No additional context available."

            recommendation = await asyncio.to_thread(analyze_incident_sync, data, context)
            if recommendation:
                await redis_client.publish("city.recommendations", json.dumps(recommendation, default=str))

        except Exception as e:
            print(f"Error processing event: {e}")
            continue


def analyze_incident_sync(incident: dict, context: str) -> dict | None:
    """Synchronous wrapper for Claude API call (run in thread)."""
    if not llm_client:
        return None

    user_prompt = f"""New incident reported:

{json.dumps(incident, indent=2, default=str)}

Current city context:
{context}

Analyze this incident and provide actionable recommendations."""

    try:
        response = llm_client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        result = json.loads(response.content[0].text)
        now = datetime.now(timezone.utc)
        return {
            "type": "recommendation",
            "id": f"rec-{now.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}",
            "incident_id": incident.get("id", "unknown"),
            "timestamp": now.isoformat(),
            **result,
        }
    except Exception as e:
        print(f"LLM analysis failed: {e}")
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, llm_client
    redis_client = aioredis.from_url(REDIS_URL)
    if ANTHROPIC_API_KEY:
        llm_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    task = asyncio.create_task(incident_listener())
    yield
    task.cancel()
    if redis_client:
        await redis_client.aclose()


app = FastAPI(title="UrbanOps LLM Analyst", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "service": "analyst",
        "status": "ok",
        "llm_configured": llm_client is not None,
    }
```

**Step 5: Run test — expect pass**

```bash
cd services/analyst && PYTHONPATH=.. python -m pytest tests/ -v
```

**Step 6: Commit**

```bash
git add services/analyst/
git commit -m "feat: LLM analyst service with Claude-powered incident recommendations"
```

---

## Task 6: Frontend — Next.js Project Setup

Initialize the Next.js app with Tailwind CSS and the base dark-theme layout.

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.js`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/tsconfig.json`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/page.tsx`
- Create: `frontend/app/globals.css`
- Create: `frontend/Dockerfile`
- Create: `frontend/lib/types.ts`

**Step 1: Initialize Next.js project**

```bash
cd frontend && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --no-turbopack
```

If the directory already exists, create manually. The key files:

**Step 2: Create TypeScript types matching backend schemas**

`frontend/lib/types.ts`:

```typescript
export type CongestionLevel = "free" | "light" | "moderate" | "heavy" | "severe";
export type TransitMode = "bus" | "train";
export type TransitStatus = "on_time" | "delayed" | "stopped";
export type IncidentCategory = "accident" | "road_closure" | "fire" | "police" | "construction";
export type Severity = "low" | "medium" | "high" | "critical";
export type IncidentStatusType = "active" | "responding" | "resolved";
export type Precipitation = "none" | "rain" | "snow" | "sleet" | "fog";
export type ActionType = "reroute_traffic" | "dispatch_crew" | "close_road" | "issue_alert";

export interface TrafficSegment {
  road: string;
  from_pos: [number, number];
  to_pos: [number, number];
  speed_mph: number;
  free_flow_mph: number;
  congestion_level: CongestionLevel;
}

export interface TrafficEvent {
  type: "traffic";
  timestamp: string;
  segments: TrafficSegment[];
}

export interface TransitVehicle {
  id: string;
  route: string;
  mode: TransitMode;
  position: [number, number];
  heading: number;
  speed_mph: number;
  delay_minutes: number;
  status: TransitStatus;
}

export interface TransitEvent {
  type: "transit";
  timestamp: string;
  vehicles: TransitVehicle[];
}

export interface IncidentEvent {
  type: "incident";
  id: string;
  timestamp: string;
  category: IncidentCategory;
  severity: Severity;
  position: [number, number];
  description: string;
  affected_roads: string[];
  status: IncidentStatusType;
  estimated_clearance?: string;
}

export interface WeatherConditions {
  temperature_f: number;
  wind_speed_mph: number;
  wind_direction: string;
  precipitation: Precipitation;
  visibility_miles: number;
  alert: string | null;
}

export interface WeatherEvent {
  type: "weather";
  timestamp: string;
  conditions: WeatherConditions;
}

export interface RecommendationAction {
  action: ActionType;
  description: string;
  priority: Severity;
  affected_area?: [number, number][];
}

export interface RecommendationEvent {
  type: "recommendation";
  id: string;
  incident_id: string;
  timestamp: string;
  actions: RecommendationAction[];
  summary: string;
  confidence: number;
}

export type CityEvent = TrafficEvent | TransitEvent | IncidentEvent | WeatherEvent | RecommendationEvent;

export interface CityState {
  traffic: TrafficEvent | null;
  transit: TransitEvent | null;
  incidents: IncidentEvent[];
  weather: WeatherEvent | null;
  recommendations: RecommendationEvent[];
}
```

**Step 3: Set up dark theme globals**

Update `frontend/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #0a0e17;
  --bg-secondary: #111827;
  --bg-panel: #1a2332;
  --border: #1e2d3d;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --accent: #3b82f6;
  --danger: #ef4444;
  --warning: #f59e0b;
  --success: #22c55e;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
}

/* Mapbox overrides for dark theme */
.mapboxgl-popup-content {
  background: var(--bg-panel) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border) !important;
  border-radius: 8px !important;
  padding: 12px !important;
}

.mapboxgl-popup-tip {
  border-top-color: var(--bg-panel) !important;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
```

**Step 4: Create layout**

`frontend/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UrbanOps — Smart City Operations",
  description: "Real-time city operations platform for Chicago",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css"
          rel="stylesheet"
        />
      </head>
      <body className="h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
```

**Step 5: Create placeholder page**

`frontend/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#0a0e17]">
      <h1 className="text-2xl font-bold text-slate-200">
        UrbanOps — Loading...
      </h1>
    </div>
  );
}
```

**Step 6: Install Mapbox GL**

```bash
cd frontend && npm install mapbox-gl
```

**Step 7: Create Dockerfile**

`frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

**Step 8: Verify build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds

**Step 9: Commit**

```bash
git add frontend/ .gitignore .env.example docker-compose.yml
git commit -m "feat: Next.js frontend setup with Tailwind dark theme and TypeScript types"
```

---

## Task 7: Frontend — WebSocket Hook & City State

Build the React hooks that connect to the processor's WebSocket and maintain live city state.

**Files:**
- Create: `frontend/hooks/useWebSocket.ts`
- Create: `frontend/hooks/useCityState.ts`

**Step 1: Create WebSocket hook**

`frontend/hooks/useWebSocket.ts`:

```typescript
"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebSocketOptions {
  url: string;
  onMessage: (data: any) => void;
  reconnectInterval?: number;
}

export function useWebSocket({ url, onMessage, reconnectInterval = 3000 }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, reconnectInterval);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [url, onMessage, reconnectInterval]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
```

**Step 2: Create city state hook**

`frontend/hooks/useCityState.ts`:

```typescript
"use client";

import { useCallback, useRef, useState } from "react";
import type {
  CityState,
  CityEvent,
  TrafficEvent,
  TransitEvent,
  IncidentEvent,
  WeatherEvent,
  RecommendationEvent,
} from "@/lib/types";

const INITIAL_STATE: CityState = {
  traffic: null,
  transit: null,
  incidents: [],
  weather: null,
  recommendations: [],
};

export function useCityState() {
  const [state, setState] = useState<CityState>(INITIAL_STATE);
  const feedRef = useRef<CityEvent[]>([]);
  const [feed, setFeed] = useState<CityEvent[]>([]);

  const handleEvent = useCallback((data: any) => {
    // Handle initial snapshot from processor
    if (data.type === "snapshot") {
      setState({
        traffic: data.traffic ?? null,
        transit: data.transit ?? null,
        incidents: data.incidents ?? [],
        weather: data.weather ?? null,
        recommendations: data.recommendations ?? [],
      });
      return;
    }

    const event = data as CityEvent;

    // Update feed (keep last 50 events)
    feedRef.current = [event, ...feedRef.current].slice(0, 50);
    setFeed([...feedRef.current]);

    // Update state by event type
    setState((prev) => {
      switch (event.type) {
        case "traffic":
          return { ...prev, traffic: event as TrafficEvent };
        case "transit":
          return { ...prev, transit: event as TransitEvent };
        case "incident": {
          const inc = event as IncidentEvent;
          if (inc.status === "resolved") {
            return { ...prev, incidents: prev.incidents.filter((i) => i.id !== inc.id) };
          }
          const exists = prev.incidents.findIndex((i) => i.id === inc.id);
          const incidents = [...prev.incidents];
          if (exists >= 0) {
            incidents[exists] = inc;
          } else {
            incidents.push(inc);
          }
          return { ...prev, incidents };
        }
        case "weather":
          return { ...prev, weather: event as WeatherEvent };
        case "recommendation": {
          const rec = event as RecommendationEvent;
          return { ...prev, recommendations: [...prev.recommendations, rec].slice(-20) };
        }
        default:
          return prev;
      }
    });
  }, []);

  return { state, feed, handleEvent };
}
```

**Step 3: Commit**

```bash
git add frontend/hooks/
git commit -m "feat: WebSocket and city state React hooks"
```

---

## Task 8: Frontend — Map Component with All Layers

Build the Mapbox GL map with traffic, transit, incident, and weather layers.

**Files:**
- Create: `frontend/components/Map.tsx`
- Create: `frontend/lib/mapStyles.ts`

**Step 1: Create map style constants**

`frontend/lib/mapStyles.ts`:

```typescript
export const CHICAGO_CENTER: [number, number] = [-87.6298, 41.8781]; // [lng, lat] for Mapbox
export const INITIAL_ZOOM = 12;
export const MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

export const CONGESTION_COLORS: Record<string, string> = {
  free: "#22c55e",
  light: "#84cc16",
  moderate: "#f59e0b",
  heavy: "#ef4444",
  severe: "#991b1b",
};

export const SEVERITY_COLORS: Record<string, string> = {
  low: "#3b82f6",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#dc2626",
};

export const SEVERITY_SIZES: Record<string, number> = {
  low: 8,
  medium: 12,
  high: 16,
  critical: 22,
};

export const TRANSIT_COLORS: Record<string, string> = {
  on_time: "#22c55e",
  delayed: "#f59e0b",
  stopped: "#ef4444",
};
```

**Step 2: Create Map component**

`frontend/components/Map.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import type { CityState, IncidentEvent } from "@/lib/types";
import {
  CHICAGO_CENTER,
  INITIAL_ZOOM,
  MAP_STYLE,
  CONGESTION_COLORS,
  SEVERITY_COLORS,
  SEVERITY_SIZES,
  TRANSIT_COLORS,
} from "@/lib/mapStyles";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface MapProps {
  state: CityState;
  layers: { traffic: boolean; transit: boolean; incidents: boolean; weather: boolean };
  onIncidentClick?: (incident: IncidentEvent) => void;
}

export default function Map({ state, layers, onIncidentClick }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const transitMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CHICAGO_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 45,
      bearing: -17.6,
      antialias: true,
    });

    map.on("load", () => {
      // Add 3D building layer
      const labelLayer = map.getStyle().layers?.find(
        (l) => l.type === "symbol" && l.layout?.["text-field"]
      );

      map.addLayer(
        {
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 12,
          paint: {
            "fill-extrusion-color": "#1a1a2e",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 0.6,
          },
        },
        labelLayer?.id
      );

      // Traffic lines source
      map.addSource("traffic-lines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "traffic-layer",
        type: "line",
        source: "traffic-lines",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
          "line-opacity": 0.8,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update traffic layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("traffic-lines") as mapboxgl.GeoJSONSource;
    if (!source) return;

    if (!layers.traffic || !state.traffic) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    const features = state.traffic.segments.map((seg) => ({
      type: "Feature" as const,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [seg.from_pos[1], seg.from_pos[0]], // [lng, lat]
          [seg.to_pos[1], seg.to_pos[0]],
        ],
      },
      properties: {
        color: CONGESTION_COLORS[seg.congestion_level] || "#666",
        road: seg.road,
        speed: seg.speed_mph,
        congestion: seg.congestion_level,
      },
    }));

    source.setData({ type: "FeatureCollection", features });
  }, [state.traffic, layers.traffic]);

  // Update transit markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear old markers if layer is off
    if (!layers.transit || !state.transit) {
      transitMarkersRef.current.forEach((m) => m.remove());
      transitMarkersRef.current.clear();
      return;
    }

    const activeIds = new Set<string>();

    state.transit.vehicles.forEach((vehicle) => {
      activeIds.add(vehicle.id);
      const color = TRANSIT_COLORS[vehicle.status] || "#666";
      const icon = vehicle.mode === "bus" ? "🚌" : "🚇";

      let marker = transitMarkersRef.current.get(vehicle.id);
      if (marker) {
        marker.setLngLat([vehicle.position[1], vehicle.position[0]]);
      } else {
        const el = document.createElement("div");
        el.className = "transit-marker";
        el.style.cssText = `font-size: 18px; cursor: pointer; filter: drop-shadow(0 0 4px ${color});`;
        el.textContent = icon;

        marker = new mapboxgl.Marker({ element: el })
          .setLngLat([vehicle.position[1], vehicle.position[0]])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<strong>${vehicle.route}</strong><br/>
               Speed: ${vehicle.speed_mph} mph<br/>
               Delay: ${vehicle.delay_minutes} min<br/>
               Status: ${vehicle.status}`
            )
          )
          .addTo(mapRef.current!);

        transitMarkersRef.current.set(vehicle.id, marker);
      }
    });

    // Remove stale markers
    transitMarkersRef.current.forEach((m, id) => {
      if (!activeIds.has(id)) {
        m.remove();
        transitMarkersRef.current.delete(id);
      }
    });
  }, [state.transit, layers.transit]);

  // Update incident markers
  useEffect(() => {
    if (!mapRef.current) return;

    if (!layers.incidents) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      return;
    }

    const activeIds = new Set<string>();

    state.incidents.forEach((inc) => {
      activeIds.add(inc.id);
      const color = SEVERITY_COLORS[inc.severity] || "#666";
      const size = SEVERITY_SIZES[inc.severity] || 10;

      let marker = markersRef.current.get(inc.id);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "incident-marker";
        el.style.cssText = `
          width: ${size}px; height: ${size}px;
          background: ${color};
          border-radius: 50%;
          border: 2px solid white;
          cursor: pointer;
          animation: pulse 2s infinite;
          box-shadow: 0 0 ${size}px ${color};
        `;
        el.onclick = () => onIncidentClick?.(inc);

        marker = new mapboxgl.Marker({ element: el })
          .setLngLat([inc.position[1], inc.position[0]])
          .addTo(mapRef.current!);

        markersRef.current.set(inc.id, marker);
      }
    });

    // Remove resolved incidents
    markersRef.current.forEach((m, id) => {
      if (!activeIds.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    });
  }, [state.incidents, layers.incidents, onIncidentClick]);

  return (
    <>
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.3); }
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </>
  );
}
```

**Step 3: Commit**

```bash
git add frontend/components/Map.tsx frontend/lib/mapStyles.ts
git commit -m "feat: Mapbox GL map component with traffic, transit, and incident layers"
```

---

## Task 9: Frontend — UI Panels (LiveFeed, AiAnalyst, StatsBar, LayerToggle)

Build all the supporting UI components.

**Files:**
- Create: `frontend/components/LayerToggle.tsx`
- Create: `frontend/components/LiveFeed.tsx`
- Create: `frontend/components/AiAnalyst.tsx`
- Create: `frontend/components/StatsBar.tsx`

**Step 1: LayerToggle**

`frontend/components/LayerToggle.tsx`:

```tsx
"use client";

interface LayerToggleProps {
  layers: Record<string, boolean>;
  onToggle: (layer: string) => void;
}

const LAYER_CONFIG = [
  { key: "traffic", label: "Traffic", icon: "🚗" },
  { key: "transit", label: "Transit", icon: "🚌" },
  { key: "incidents", label: "Incidents", icon: "⚠️" },
  { key: "weather", label: "Weather", icon: "🌦️" },
];

export default function LayerToggle({ layers, onToggle }: LayerToggleProps) {
  return (
    <div className="flex gap-2">
      {LAYER_CONFIG.map(({ key, label, icon }) => (
        <button
          key={key}
          onClick={() => onToggle(key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            layers[key]
              ? "bg-blue-600/30 text-blue-300 border border-blue-500/50"
              : "bg-slate-800/50 text-slate-500 border border-slate-700/50 hover:text-slate-300"
          }`}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  );
}
```

**Step 2: LiveFeed**

`frontend/components/LiveFeed.tsx`:

```tsx
"use client";

import type { CityEvent } from "@/lib/types";

interface LiveFeedProps {
  events: CityEvent[];
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function eventSummary(event: CityEvent): { icon: string; text: string; color: string } {
  switch (event.type) {
    case "traffic": {
      const severe = event.segments.filter((s) => s.congestion_level === "severe" || s.congestion_level === "heavy");
      return {
        icon: "🚗",
        text: severe.length > 0 ? `${severe.length} congested road${severe.length > 1 ? "s" : ""}` : "Traffic flowing",
        color: severe.length > 0 ? "text-amber-400" : "text-green-400",
      };
    }
    case "transit": {
      const delayed = event.vehicles.filter((v) => v.status !== "on_time");
      return {
        icon: "🚌",
        text: delayed.length > 0 ? `${delayed.length} vehicle${delayed.length > 1 ? "s" : ""} delayed` : "All on time",
        color: delayed.length > 0 ? "text-amber-400" : "text-green-400",
      };
    }
    case "incident":
      return {
        icon: "⚠️",
        text: `${event.description}`,
        color: event.severity === "critical" || event.severity === "high" ? "text-red-400" : "text-amber-400",
      };
    case "weather":
      return {
        icon: "🌦️",
        text: `${event.conditions.temperature_f}°F ${event.conditions.precipitation}${event.conditions.alert ? ` — ${event.conditions.alert}` : ""}`,
        color: event.conditions.alert ? "text-red-400" : "text-slate-300",
      };
    case "recommendation":
      return {
        icon: "🤖",
        text: event.summary.slice(0, 80) + (event.summary.length > 80 ? "..." : ""),
        color: "text-blue-400",
      };
    default:
      return { icon: "📡", text: "Unknown event", color: "text-slate-400" };
  }
}

export default function LiveFeed({ events }: LiveFeedProps) {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-2 border-b border-slate-700/50">
        Live Feed
      </h2>
      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-sm text-slate-500 p-3">Waiting for events...</p>
        ) : (
          events.map((event, i) => {
            const { icon, text, color } = eventSummary(event);
            return (
              <div
                key={`${event.type}-${i}`}
                className="flex items-start gap-2 px-3 py-2 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
              >
                <span className="text-sm mt-0.5">{icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${color} truncate`}>{text}</p>
                  <p className="text-xs text-slate-500">{formatTime(event.timestamp)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

**Step 3: AiAnalyst**

`frontend/components/AiAnalyst.tsx`:

```tsx
"use client";

import type { RecommendationEvent, IncidentEvent } from "@/lib/types";

interface AiAnalystProps {
  recommendations: RecommendationEvent[];
  incidents: IncidentEvent[];
  selectedIncident: IncidentEvent | null;
  onApply?: (rec: RecommendationEvent) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-blue-500/20 text-blue-300",
  medium: "bg-amber-500/20 text-amber-300",
  high: "bg-red-500/20 text-red-300",
  critical: "bg-red-600/30 text-red-200",
};

export default function AiAnalyst({ recommendations, incidents, selectedIncident, onApply }: AiAnalystProps) {
  // Show recommendations for selected incident, or latest
  const relevant = selectedIncident
    ? recommendations.filter((r) => r.incident_id === selectedIncident.id)
    : recommendations.slice(-3);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 py-2 border-b border-slate-700/50 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        AI Analyst
      </h2>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {relevant.length === 0 ? (
          <p className="text-sm text-slate-500">
            {selectedIncident
              ? "Analyzing incident..."
              : "Monitoring for incidents..."}
          </p>
        ) : (
          relevant.map((rec) => (
            <div key={rec.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <p className="text-sm text-slate-200 mb-2">{rec.summary}</p>
              <div className="space-y-1.5 mb-3">
                {rec.actions.map((action, i) => (
                  <div
                    key={i}
                    className={`text-xs px-2 py-1 rounded ${PRIORITY_COLORS[action.priority] || ""}`}
                  >
                    <strong className="uppercase">{action.action.replace("_", " ")}</strong>: {action.description}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Confidence: {Math.round(rec.confidence * 100)}%
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onApply?.(rec)}
                    className="px-3 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                  >
                    Apply
                  </button>
                  <button className="px-3 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 rounded transition-colors">
                    Skip
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 4: StatsBar**

`frontend/components/StatsBar.tsx`:

```tsx
"use client";

import type { CityState } from "@/lib/types";

interface StatsBarProps {
  state: CityState;
  connected: boolean;
}

export default function StatsBar({ state, connected }: StatsBarProps) {
  const activeIncidents = state.incidents.length;

  const avgSpeed = state.traffic
    ? Math.round(state.traffic.segments.reduce((sum, s) => sum + s.speed_mph, 0) / state.traffic.segments.length)
    : 0;

  const transitTotal = state.transit?.vehicles.length ?? 0;
  const transitOnTime = state.transit?.vehicles.filter((v) => v.status === "on_time").length ?? 0;

  const temp = state.weather?.conditions.temperature_f ?? "--";
  const precip = state.weather?.conditions.precipitation ?? "--";

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#111827] border-t border-slate-700/50 text-xs text-slate-400">
      <div className="flex items-center gap-6">
        <span>
          Active Incidents: <strong className={activeIncidents > 0 ? "text-red-400" : "text-green-400"}>{activeIncidents}</strong>
        </span>
        <span>
          Avg Speed: <strong className="text-slate-200">{avgSpeed} mph</strong>
        </span>
        <span>
          Transit: <strong className="text-slate-200">{transitOnTime}/{transitTotal}</strong> on time
        </span>
        <span>
          Temp: <strong className="text-slate-200">{temp}°F</strong> {precip}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"} animate-pulse`} />
        <span>{connected ? "Live" : "Disconnected"}</span>
      </div>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add frontend/components/
git commit -m "feat: UI panels — LayerToggle, LiveFeed, AiAnalyst, StatsBar"
```

---

## Task 10: Frontend — Dashboard Assembly

Wire everything together into the main dashboard page.

**Files:**
- Modify: `frontend/app/page.tsx`

**Step 1: Assemble the dashboard**

Replace `frontend/app/page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useCityState } from "@/hooks/useCityState";
import LayerToggle from "@/components/LayerToggle";
import LiveFeed from "@/components/LiveFeed";
import AiAnalyst from "@/components/AiAnalyst";
import StatsBar from "@/components/StatsBar";
import type { IncidentEvent, RecommendationEvent } from "@/lib/types";

// Dynamic import to avoid SSR issues with Mapbox
const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8001/ws";

export default function Dashboard() {
  const { state, feed, handleEvent } = useCityState();
  const { connected } = useWebSocket({ url: WS_URL, onMessage: handleEvent });
  const [selectedIncident, setSelectedIncident] = useState<IncidentEvent | null>(null);
  const [layers, setLayers] = useState({
    traffic: true,
    transit: true,
    incidents: true,
    weather: true,
  });

  const toggleLayer = useCallback((layer: string) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer as keyof typeof prev] }));
  }, []);

  const handleApply = useCallback((rec: RecommendationEvent) => {
    // Visual feedback — could animate reroute on map
    console.log("Applied recommendation:", rec.id);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0e17]">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#111827] border-b border-slate-700/50">
        <h1 className="text-lg font-bold text-slate-100 tracking-tight">
          UrbanOps
        </h1>
        <LayerToggle layers={layers} onToggle={toggleLayer} />
        <span className="text-sm text-slate-400 font-medium">Chicago, IL</span>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <Map
            state={state}
            layers={layers}
            onIncidentClick={setSelectedIncident}
          />
        </div>

        {/* Right panel */}
        <aside className="w-80 flex flex-col bg-[#111827] border-l border-slate-700/50">
          <div className="flex-1 overflow-hidden">
            <LiveFeed events={feed} />
          </div>
          <div className="h-px bg-slate-700/50" />
          <div className="flex-1 overflow-hidden">
            <AiAnalyst
              recommendations={state.recommendations}
              incidents={state.incidents}
              selectedIncident={selectedIncident}
              onApply={handleApply}
            />
          </div>
        </aside>
      </div>

      {/* Stats bar */}
      <StatsBar state={state} connected={connected} />
    </div>
  );
}
```

**Step 2: Add environment variables for frontend**

Create `frontend/.env.local.example`:
```env
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token_here
NEXT_PUBLIC_WS_URL=ws://localhost:8001/ws
```

**Step 3: Verify build**

```bash
cd frontend && npm run build
```
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: assemble full dashboard — map, panels, live data, dark theme"
```

---

## Task 11: Integration — Docker Compose Smoke Test

Verify the full stack runs together with `docker compose up`.

**Step 1: Create `.env` from example**

```bash
cp .env.example .env
# Edit .env and add real MAPBOX_TOKEN and ANTHROPIC_API_KEY
```

**Step 2: Fix Dockerfiles for shared module**

The Dockerfiles need adjustment since `COPY ../shared` doesn't work in Docker. Update the `docker-compose.yml` build context to `./services` and adjust Dockerfiles accordingly.

Update each service Dockerfile to:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY <service>/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY shared/ ./shared/
COPY <service>/ ./
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "<port>", "--reload"]
```

(Replace `<service>` and `<port>` for each: simulator=8000, processor=8001, analyst=8002)

**Step 3: Bring up the stack**

```bash
docker compose up --build
```

**Step 4: Verify services**

```bash
curl http://localhost:8001/health        # processor health
curl http://localhost:8001/api/snapshot   # should return city state JSON
# Open http://localhost:3000 in browser  # should show the dashboard
```

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: Docker build context and integration fixes for full-stack compose"
```

---

## Task 12: Polish & Final Touches

Add the pulse animation CSS, ensure weather overlay works, add loading states, and verify the complete experience.

**Step 1: Add weather visual effects to globals.css**

Append to `frontend/app/globals.css`:

```css
/* Weather overlay effects */
.weather-snow {
  background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.05) 0%, transparent 70%);
}

.weather-rain {
  background: linear-gradient(180deg, rgba(59,130,246,0.03) 0%, transparent 100%);
}

/* Smooth transitions for layer toggles */
.mapboxgl-canvas {
  transition: opacity 0.3s ease;
}
```

**Step 2: Add a loading skeleton for initial connection**

In `frontend/app/page.tsx`, add a loading state before the WebSocket connects showing a pulsing "Connecting to UrbanOps..." overlay on the map.

**Step 3: Final build verification**

```bash
docker compose down
docker compose up --build -d
# Wait 10 seconds for services to start
curl http://localhost:8001/health
curl http://localhost:8001/api/snapshot
# Open http://localhost:3000 and verify:
# - Map renders with Chicago 3D buildings
# - Traffic lines appear (color coded)
# - Transit markers move
# - Incidents pulse on map
# - Live feed scrolls
# - AI recommendations appear for high-severity incidents
# - Stats bar shows live data
# - Layer toggles work
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: polish — weather effects, loading states, final integration"
```

---

## Summary

| Task | Description | Est. Steps |
|------|-------------|-----------|
| 1 | Project scaffolding, Docker Compose, shared schemas | 7 |
| 2 | Simulator data generators (traffic, transit, incidents, weather) | 9 |
| 3 | Simulator main app with Redis publishing | 5 |
| 4 | Stream processor (state, WebSocket, REST) | 7 |
| 5 | LLM analyst with Claude API | 6 |
| 6 | Frontend Next.js setup (Tailwind, types, layout) | 9 |
| 7 | WebSocket + city state React hooks | 3 |
| 8 | Mapbox map component with all layers | 3 |
| 9 | UI panels (LayerToggle, LiveFeed, AiAnalyst, StatsBar) | 5 |
| 10 | Dashboard assembly | 4 |
| 11 | Docker Compose integration test | 5 |
| 12 | Polish and final verification | 4 |

**Total: 12 tasks, ~67 steps**
