"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import type { CityState, IncidentEvent, TrafficSegment, ActivePlan } from "@/lib/types";
import {
  CHICAGO_CENTER,
  INITIAL_ZOOM,
  MAP_STYLE,
  CONGESTION_COLORS,
  SEVERITY_COLORS,
  SEVERITY_SIZES,
  TRANSIT_COLORS,
} from "@/lib/mapStyles";
import { findRoadCoords } from "@/lib/chicagoRoads";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export interface MapProps {
  state: CityState;
  layers: {
    traffic: boolean;
    transit: boolean;
    incidents: boolean;
    weather: boolean;
  };
  activePlan?: ActivePlan | null;
  onIncidentClick?: (incident: IncidentEvent) => void;
}

/**
 * Convert backend [lat, lng] position to Mapbox [lng, lat].
 */
function toLngLat(pos: [number, number]): [number, number] {
  return [pos[1], pos[0]];
}

/**
 * Build a GeoJSON FeatureCollection of LineStrings from traffic segments.
 */
function buildTrafficGeoJSON(segments: TrafficSegment[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: segments.map((seg) => ({
      type: "Feature" as const,
      properties: {
        congestion: seg.congestion_level,
        color: CONGESTION_COLORS[seg.congestion_level] ?? "#666",
        road: seg.road,
        speed: seg.speed_mph,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: [toLngLat(seg.from_pos), toLngLat(seg.to_pos)],
      },
    })),
  };
}

/**
 * Create a pulsing circle DOM element for an incident marker.
 */
function createIncidentElement(severity: string): HTMLDivElement {
  const size = SEVERITY_SIZES[severity] ?? 10;
  const color = SEVERITY_COLORS[severity] ?? "#888";
  const el = document.createElement("div");
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.backgroundColor = color;
  el.style.border = `2px solid ${color}`;
  el.style.boxShadow = `0 0 ${size / 2}px ${color}`;
  el.style.cursor = "pointer";
  el.style.animation = "pulse 2s ease-in-out infinite";
  return el;
}

/**
 * Create a transit vehicle DOM element (emoji-based).
 */
function createTransitElement(mode: string, status: string): HTMLDivElement {
  const emoji = mode === "train" ? "\u{1F687}" : "\u{1F68C}"; // train or bus
  const color = TRANSIT_COLORS[status] ?? "#888";
  const el = document.createElement("div");
  el.style.fontSize = "22px";
  el.style.lineHeight = "1";
  el.style.filter = `drop-shadow(0 0 4px ${color})`;
  el.style.cursor = "pointer";
  el.textContent = emoji;
  return el;
}

export default function Map({ state, layers, activePlan, onIncidentClick }: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapReady = useRef(false);

  // Stable refs for markers so we can update without re-creating
  const transitMarkers = useRef(new globalThis.Map<string, mapboxgl.Marker>());
  const incidentMarkers = useRef(new globalThis.Map<string, mapboxgl.Marker>());

  // Keep a ref to the latest onIncidentClick to avoid stale closures
  const onIncidentClickRef = useRef(onIncidentClick);
  useEffect(() => {
    onIncidentClickRef.current = onIncidentClick;
  }, [onIncidentClick]);

  // ---------- Initialize Map ----------
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
      // 3D buildings
      map.addLayer({
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
      });

      // Traffic source + layer (empty initially)
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
          "line-opacity": 0.85,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });

      // Plan overlay sources + layers
      map.addSource("plan-closures", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "plan-closures-layer",
        type: "line",
        source: "plan-closures",
        paint: {
          "line-color": "#ff3b4f",
          "line-width": 6,
          "line-opacity": 0.8,
          "line-dasharray": [2, 3],
        },
        layout: { "line-cap": "round" },
      });

      map.addSource("plan-reroutes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "plan-reroutes-layer",
        type: "line",
        source: "plan-reroutes",
        paint: {
          "line-color": "#00e5c8",
          "line-width": 4,
          "line-opacity": 0.9,
          "line-dasharray": [1, 2],
        },
        layout: { "line-cap": "round" },
      });

      map.addSource("plan-zones", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "plan-zones-layer",
        type: "fill",
        source: "plan-zones",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "plan-zones-border",
        type: "line",
        source: "plan-zones",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2,
          "line-opacity": 0.5,
          "line-dasharray": [4, 4],
        },
      });

      mapReady.current = true;
    });

    mapRef.current = map;

    return () => {
      // Cleanup all markers
      transitMarkers.current.forEach((m) => m.remove());
      transitMarkers.current.clear();
      incidentMarkers.current.forEach((m) => m.remove());
      incidentMarkers.current.clear();
      map.remove();
      mapRef.current = null;
      mapReady.current = false;
    };
  }, []);

  // ---------- Traffic Layer ----------
  const updateTraffic = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReady.current) return;

    const source = map.getSource("traffic-lines") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    if (!layers.traffic || !state.traffic) {
      source.setData({ type: "FeatureCollection", features: [] });
      return;
    }

    source.setData(buildTrafficGeoJSON(state.traffic.segments));
  }, [state.traffic, layers.traffic]);

  useEffect(() => {
    updateTraffic();
  }, [updateTraffic]);

  // ---------- Transit Layer ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!layers.transit || !state.transit) {
      // Clear all transit markers
      transitMarkers.current.forEach((m) => m.remove());
      transitMarkers.current.clear();
      return;
    }

    const currentIds = new Set<string>();
    for (const vehicle of state.transit.vehicles) {
      currentIds.add(vehicle.id);
      const lngLat = toLngLat(vehicle.position);

      const existing = transitMarkers.current.get(vehicle.id);
      if (existing) {
        // Update position of existing marker
        existing.setLngLat(lngLat);
        // Update popup content
        const popup = existing.getPopup();
        if (popup) {
          popup.setHTML(buildTransitPopup(vehicle.route, vehicle.mode, vehicle.speed_mph, vehicle.delay_minutes, vehicle.status));
        }
      } else {
        // Create new marker
        const el = createTransitElement(vehicle.mode, vehicle.status);
        const popup = new mapboxgl.Popup({ offset: 15, closeButton: false }).setHTML(
          buildTransitPopup(vehicle.route, vehicle.mode, vehicle.speed_mph, vehicle.delay_minutes, vehicle.status)
        );
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);
        transitMarkers.current.set(vehicle.id, marker);
      }
    }

    // Remove stale markers
    for (const [id, marker] of transitMarkers.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        transitMarkers.current.delete(id);
      }
    }
  }, [state.transit, layers.transit]);

  // ---------- Incident Layer ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!layers.incidents || state.incidents.length === 0) {
      incidentMarkers.current.forEach((m) => m.remove());
      incidentMarkers.current.clear();
      return;
    }

    const currentIds = new Set<string>();
    for (const incident of state.incidents) {
      currentIds.add(incident.id);
      const lngLat = toLngLat(incident.position);

      const existing = incidentMarkers.current.get(incident.id);
      if (existing) {
        existing.setLngLat(lngLat);
      } else {
        const el = createIncidentElement(incident.severity);
        // Capture incident for the click handler
        const capturedIncident = incident;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onIncidentClickRef.current?.(capturedIncident);
        });

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(lngLat)
          .addTo(map);
        incidentMarkers.current.set(incident.id, marker);
      }
    }

    // Remove stale markers
    for (const [id, marker] of incidentMarkers.current) {
      if (!currentIds.has(id)) {
        marker.remove();
        incidentMarkers.current.delete(id);
      }
    }
  }, [state.incidents, layers.incidents]);

  // ---------- Plan Overlay ----------
  const planMarkersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady.current) return;

    // Clear previous plan markers
    planMarkersRef.current.forEach((m) => m.remove());
    planMarkersRef.current = [];

    const closureSrc = map.getSource("plan-closures") as mapboxgl.GeoJSONSource | undefined;
    const rerouteSrc = map.getSource("plan-reroutes") as mapboxgl.GeoJSONSource | undefined;
    const zoneSrc = map.getSource("plan-zones") as mapboxgl.GeoJSONSource | undefined;

    const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

    if (!activePlan) {
      closureSrc?.setData(empty);
      rerouteSrc?.setData(empty);
      zoneSrc?.setData(empty);
      return;
    }

    const closureFeatures: GeoJSON.Feature[] = [];
    const rerouteFeatures: GeoJSON.Feature[] = [];
    const zoneFeatures: GeoJSON.Feature[] = [];

    // Parse plan phases for road closures and dispatch actions
    const closedRoads = new Set<string>();
    const dispatchLocations: { position: [number, number]; label: string }[] = [];

    for (const phase of activePlan.phases || []) {
      for (const step of phase.steps || []) {
        const actionLower = step.action.toLowerCase();

        // Detect road closures
        if (actionLower.includes("close") || actionLower.includes("shut down") || actionLower.includes("block")) {
          // Try to extract road names from the action text
          for (const road of activePlan.affected_roads) {
            closedRoads.add(road);
          }
        }

        // Detect dispatch actions — place a marker at incident location
        if (actionLower.includes("dispatch") || actionLower.includes("deploy") || actionLower.includes("send")) {
          dispatchLocations.push({
            position: activePlan.incident_position,
            label: step.assigned_to,
          });
        }
      }
    }

    // Draw closed roads
    for (const road of closedRoads) {
      const coords = findRoadCoords(road);
      if (coords) {
        closureFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }

    // Also close roads from affected_roads
    for (const road of activePlan.affected_roads) {
      if (!closedRoads.has(road)) {
        const coords = findRoadCoords(road);
        if (coords) {
          closureFeatures.push({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: coords },
          });
        }
      }
    }

    // Draw alternate reroute paths
    for (const route of activePlan.alternate_routes || []) {
      // Try to find coordinates for mentioned roads in the route description
      const words = route.toLowerCase();
      for (const [roadName, coords] of Object.entries(
        // Import inline to avoid circular — just use findRoadCoords
        {} as Record<string, [number, number][]>
      )) {
        // skip — we'll use a different approach
      }
      // Fuzzy: try to match any known road mentioned in the route string
      const matched = findRoadCoords(route);
      if (matched) {
        rerouteFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: matched },
        });
      }
    }

    // Draw alert/response zone around incident
    const [lat, lng] = activePlan.incident_position;
    const radius = activePlan.threat_level === "CRITICAL" ? 0.008 : 0.005;
    const zoneColor = activePlan.threat_level === "CRITICAL" ? "#ff3b4f" : "#ffaa00";
    // Create a rough circle polygon
    const circleCoords: [number, number][] = [];
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      circleCoords.push([
        lng + radius * 1.3 * Math.cos(angle),
        lat + radius * Math.sin(angle),
      ]);
    }
    zoneFeatures.push({
      type: "Feature",
      properties: { color: zoneColor },
      geometry: { type: "Polygon", coordinates: [circleCoords] },
    });

    // Add dispatch markers
    const uniqueDispatches = new globalThis.Map<string, { position: [number, number]; label: string }>();
    for (const d of dispatchLocations) {
      if (!uniqueDispatches.has(d.label)) {
        uniqueDispatches.set(d.label, d);
      }
    }
    let offsetIdx = 0;
    for (const [, d] of uniqueDispatches) {
      const el = document.createElement("div");
      el.innerHTML = `<div style="
        background: rgba(0,200,255,0.15);
        border: 1px solid rgba(0,200,255,0.6);
        padding: 2px 6px;
        font-family: 'JetBrains Mono', monospace;
        font-size: 8px;
        color: #00c8ff;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        white-space: nowrap;
        box-shadow: 0 0 10px rgba(0,200,255,0.2);
      ">${d.label}</div>`;
      // Offset each marker slightly so they don't stack
      const offset = offsetIdx * 0.002;
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([d.position[1] + offset, d.position[0] + offset * 0.5])
        .addTo(map);
      planMarkersRef.current.push(marker);
      offsetIdx++;
    }

    // Add "ROAD CLOSED" labels on closure lines
    for (const road of closedRoads) {
      const coords = findRoadCoords(road);
      if (coords && coords.length >= 2) {
        const mid = coords[Math.floor(coords.length / 2)];
        const el = document.createElement("div");
        el.innerHTML = `<div style="
          background: rgba(255,59,79,0.2);
          border: 1px solid rgba(255,59,79,0.7);
          padding: 2px 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          font-weight: 700;
          color: #ff3b4f;
          letter-spacing: 0.15em;
          text-shadow: 0 0 8px rgba(255,59,79,0.5);
        ">CLOSED</div>`;
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(mid)
          .addTo(map);
        planMarkersRef.current.push(marker);
      }
    }

    // Add "REROUTE" labels
    for (const route of activePlan.alternate_routes || []) {
      const coords = findRoadCoords(route);
      if (coords && coords.length >= 2) {
        const mid = coords[Math.floor(coords.length / 2)];
        const el = document.createElement("div");
        el.innerHTML = `<div style="
          background: rgba(0,229,200,0.15);
          border: 1px solid rgba(0,229,200,0.6);
          padding: 2px 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 8px;
          font-weight: 600;
          color: #00e5c8;
          letter-spacing: 0.12em;
        ">REROUTE →</div>`;
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(mid)
          .addTo(map);
        planMarkersRef.current.push(marker);
      }
    }

    closureSrc?.setData({ type: "FeatureCollection", features: closureFeatures });
    rerouteSrc?.setData({ type: "FeatureCollection", features: rerouteFeatures });
    zoneSrc?.setData({ type: "FeatureCollection", features: zoneFeatures });
  }, [activePlan]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "100%" }}
    />
  );
}

// ---------- Helpers ----------

function buildTransitPopup(
  route: string,
  mode: string,
  speed: number,
  delay: number,
  status: string
): string {
  const statusColor = TRANSIT_COLORS[status] ?? "#888";
  return `
    <div style="font-family: system-ui, sans-serif; font-size: 13px; color: #e2e8f0; background: #1e293b; padding: 8px 10px; border-radius: 6px; min-width: 140px;">
      <div style="font-weight: 600; margin-bottom: 4px;">${mode === "train" ? "\u{1F687}" : "\u{1F68C}"} ${route}</div>
      <div>Speed: ${speed.toFixed(0)} mph</div>
      <div>Delay: ${delay > 0 ? `+${delay} min` : "None"}</div>
      <div style="color: ${statusColor}; font-weight: 500; margin-top: 2px;">${status.replace("_", " ")}</div>
    </div>
  `;
}
