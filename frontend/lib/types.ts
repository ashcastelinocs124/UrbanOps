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

export interface PlanStep {
  step: number;
  action: string;
  assigned_to: string;
  priority: string;
}

export interface PlanPhase {
  phase: number;
  name: string;
  duration: string;
  steps: PlanStep[];
}

export interface ActivePlan {
  incident_id: string;
  incident_position: [number, number];
  threat_level: string;
  phases: PlanPhase[];
  alternate_routes: string[];
  resources_required: string[];
  affected_roads: string[];
  communications: string[];
}

export interface CityState {
  traffic: TrafficEvent | null;
  transit: TransitEvent | null;
  incidents: IncidentEvent[];
  weather: WeatherEvent | null;
  recommendations: RecommendationEvent[];
}
