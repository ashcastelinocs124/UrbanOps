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
