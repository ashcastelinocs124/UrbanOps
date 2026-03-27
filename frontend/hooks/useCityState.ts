"use client";

import { useCallback, useRef, useState } from "react";
import type {
  CityState, CityEvent, TrafficEvent, TransitEvent,
  IncidentEvent, WeatherEvent, RecommendationEvent,
} from "@/lib/types";

const INITIAL_STATE: CityState = {
  traffic: null, transit: null, incidents: [], weather: null, recommendations: [],
};

export function useCityState() {
  const [state, setState] = useState<CityState>(INITIAL_STATE);
  const feedRef = useRef<CityEvent[]>([]);
  const [feed, setFeed] = useState<CityEvent[]>([]);

  const handleEvent = useCallback((data: any) => {
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
    feedRef.current = [event, ...feedRef.current].slice(0, 50);
    setFeed([...feedRef.current]);

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
          if (exists >= 0) incidents[exists] = inc;
          else incidents.push(inc);
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
