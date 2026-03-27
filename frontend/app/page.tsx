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
    console.log("Applied recommendation:", rec.id);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0e17]">
      <header className="flex items-center justify-between px-4 py-2 bg-[#111827] border-b border-slate-700/50">
        <h1 className="text-lg font-bold text-slate-100 tracking-tight">UrbanOps</h1>
        <LayerToggle layers={layers} onToggle={toggleLayer} />
        <span className="text-sm text-slate-400 font-medium">Chicago, IL</span>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <Map state={state} layers={layers} onIncidentClick={setSelectedIncident} />
        </div>

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

      <StatsBar state={state} connected={connected} />
    </div>
  );
}
