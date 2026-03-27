"use client";

import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import type { CityState, IncidentEvent, TrafficSegment } from "@/lib/types";
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

// Inject the pulse animation globally once
if (typeof document !== "undefined") {
  const styleId = "urbanops-pulse-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.7; transform: scale(1.3); }
      }
    `;
    document.head.appendChild(style);
  }
}

export interface MapProps {
  state: CityState;
  layers: {
    traffic: boolean;
    transit: boolean;
    incidents: boolean;
    weather: boolean;
  };
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

export default function Map({ state, layers, onIncidentClick }: MapProps) {
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
