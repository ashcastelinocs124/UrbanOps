"use client";

import { useState, useCallback } from "react";
import type { IncidentEvent } from "@/lib/types";

interface PlanPhaseStep {
  step: number;
  action: string;
  assigned_to: string;
  priority: string;
}

interface PlanPhase {
  phase: number;
  name: string;
  duration: string;
  steps: PlanPhaseStep[];
}

interface Plan {
  incident_summary: string;
  threat_level: string;
  estimated_duration: string;
  phases: PlanPhase[];
  resources_required: string[];
  affected_population: number;
  alternate_routes: string[];
  communications: string[];
  weather_impact: string;
}

interface PlanModalProps {
  incident: IncidentEvent;
  onClose: () => void;
  onExecute: (plan: Plan) => void;
  onPlanGenerated?: (plan: Plan) => void;
  analystUrl: string;
}

const THREAT_COLORS: Record<string, string> = {
  CRITICAL: "text-[var(--red)] border-[var(--red)] bg-[rgba(255,59,79,0.1)]",
  HIGH: "text-[var(--red)] border-[var(--red)]/50 bg-[rgba(255,59,79,0.05)]",
  MODERATE: "text-[var(--amber)] border-[var(--amber)]/50 bg-[rgba(255,170,0,0.05)]",
  LOW: "text-[var(--cyan)] border-[var(--cyan)]/50 bg-[rgba(0,200,255,0.05)]",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-[var(--red)] shadow-[0_0_4px_var(--red)]",
  high: "bg-[var(--red)]",
  medium: "bg-[var(--amber)]",
  low: "bg-[var(--cyan)]",
};

export default function PlanModal({ incident, onClose, onExecute, onPlanGenerated, analystUrl }: PlanModalProps) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  const generatePlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${analystUrl}/api/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(incident),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPlan(data);
      onPlanGenerated?.(data);
    } catch (e: any) {
      setError(e.message || "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  }, [incident, analystUrl]);

  // Auto-generate on mount
  useState(() => { generatePlan(); });

  const handleExecute = () => {
    if (plan) {
      setExecuted(true);
      onExecute(plan);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col panel-glass border border-[var(--border-glow)] shadow-[0_0_40px_rgba(0,200,255,0.1)]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-dim)]">
          <div className="flex items-center gap-3">
            <div className="relative w-3 h-3">
              <span className="absolute inset-0 rounded-full bg-[var(--cyan)] animate-ping opacity-30" />
              <span className="absolute inset-0 rounded-full bg-[var(--cyan)]" />
            </div>
            <div>
              <h2 className="text-xs font-bold tracking-[0.2em] text-[var(--text-bright)] font-[var(--font-display)]">
                RESPONSE PLAN GENERATOR
              </h2>
              <p className="text-[8px] text-[var(--text-dim)] tracking-wider mt-0.5">
                INCIDENT {incident.id.toUpperCase()} // {incident.category.replace("_", " ").toUpperCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-dim)] hover:text-[var(--text-primary)] text-sm px-2 py-1 border border-[var(--border-dim)] hover:border-[var(--border-glow)] transition-all"
          >
            ESC
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-2 border-[var(--cyan)]/20 rounded-full" />
                <div className="absolute inset-0 border-2 border-t-[var(--cyan)] rounded-full animate-spin" />
                <div className="absolute inset-3 border border-[var(--cyan)]/30 rounded-full" />
                <div className="absolute inset-3 border border-t-[var(--cyan)]/60 rounded-full animate-[spin_1.5s_linear_infinite_reverse]" />
              </div>
              <div className="text-center">
                <p className="text-[11px] font-mono font-bold text-[var(--cyan)] tracking-wider text-glow">
                  GENERATING RESPONSE PLAN
                </p>
                <p className="text-[9px] text-[var(--text-dim)] tracking-wider mt-1">
                  GPT-4o ANALYZING INCIDENT PARAMETERS...
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="text-[var(--red)] text-sm">PLAN GENERATION FAILED</span>
              <p className="text-[10px] text-[var(--text-dim)]">{error}</p>
              <button
                onClick={generatePlan}
                className="px-4 py-1.5 text-[10px] font-bold tracking-wider border border-[var(--cyan)] text-[var(--cyan)] hover:bg-[var(--cyan-dim)] transition-all"
              >
                RETRY
              </button>
            </div>
          )}

          {plan && (
            <div className="space-y-5">
              {/* Threat Banner */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-[var(--text-primary)] leading-relaxed">
                    {plan.incident_summary}
                  </p>
                  <p className="text-[9px] text-[var(--text-dim)] mt-1 tracking-wider">
                    EST. DURATION: {plan.estimated_duration} // AFFECTED: ~{plan.affected_population?.toLocaleString()} people
                  </p>
                </div>
                <span className={`px-3 py-1 text-[10px] font-bold tracking-wider border ${THREAT_COLORS[plan.threat_level] || THREAT_COLORS.MODERATE}`}>
                  {plan.threat_level}
                </span>
              </div>

              {/* Weather Impact */}
              {plan.weather_impact && (
                <div className="px-3 py-2 border border-[var(--amber)]/20 bg-[var(--amber)]/5">
                  <span className="text-[8px] font-bold tracking-wider text-[var(--amber)]">WEATHER IMPACT</span>
                  <p className="text-[10px] text-[var(--text-primary)] mt-0.5">{plan.weather_impact}</p>
                </div>
              )}

              {/* Phases */}
              {plan.phases?.map((phase) => (
                <div key={phase.phase} className="border border-[var(--border-dim)]">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-dim)] bg-white/[0.01]">
                    <span className="text-[10px] font-bold text-[var(--cyan)] tracking-wider font-mono">
                      PHASE {phase.phase}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--text-bright)] tracking-wider uppercase">
                      {phase.name}
                    </span>
                    <span className="ml-auto text-[8px] text-[var(--text-dim)] tracking-wider">
                      {phase.duration}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--border-dim)]">
                    {phase.steps?.map((step) => (
                      <div key={step.step} className="flex items-start gap-3 px-3 py-2 group hover:bg-white/[0.01] transition-colors">
                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[step.priority] || PRIORITY_DOT.medium}`} />
                          <span className="text-[9px] font-mono text-[var(--text-dim)] w-4">
                            {String(step.step).padStart(2, "0")}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[var(--text-primary)] leading-snug">
                            {step.action}
                          </p>
                          <p className="text-[8px] text-[var(--cyan-muted)] tracking-wider mt-0.5">
                            {step.assigned_to}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Resources */}
              {plan.resources_required?.length > 0 && (
                <div>
                  <span className="hud-label text-[var(--cyan-muted)] block mb-1.5">RESOURCES REQUIRED</span>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.resources_required.map((r, i) => (
                      <span key={i} className="px-2 py-0.5 text-[9px] border border-[var(--border-dim)] text-[var(--text-primary)] tracking-wide">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Alternate Routes */}
              {plan.alternate_routes?.length > 0 && (
                <div>
                  <span className="hud-label text-[var(--cyan-muted)] block mb-1.5">ALTERNATE ROUTES</span>
                  <div className="space-y-1">
                    {plan.alternate_routes.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[9px] text-[var(--teal)] shrink-0">→</span>
                        <span className="text-[10px] text-[var(--text-primary)]">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Communications */}
              {plan.communications?.length > 0 && (
                <div>
                  <span className="hud-label text-[var(--cyan-muted)] block mb-1.5">PUBLIC COMMUNICATIONS</span>
                  <div className="space-y-1">
                    {plan.communications.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 px-2 py-1 border-l-2 border-[var(--amber)]/30">
                        <span className="text-[10px] text-[var(--text-primary)]">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {plan && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-dim)]">
            <div className="flex items-center gap-2">
              <span className="hud-label">PLAN READY</span>
              <span className="text-[9px] text-[var(--green)]">
                {plan.phases?.length} PHASES // {plan.phases?.reduce((sum, p) => sum + (p.steps?.length || 0), 0)} STEPS
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={generatePlan}
                className="px-4 py-1.5 text-[10px] font-bold tracking-wider border border-[var(--border-dim)] text-[var(--text-dim)] hover:border-[var(--border-glow)] hover:text-[var(--text-primary)] transition-all"
              >
                REGENERATE
              </button>
              <button
                onClick={handleExecute}
                disabled={executed}
                className={`px-6 py-1.5 text-[10px] font-bold tracking-[0.2em] border transition-all
                  ${executed
                    ? "border-[var(--green)] text-[var(--green)] bg-[var(--green)]/10 cursor-default"
                    : "border-[var(--cyan)] text-[var(--cyan)] hover:bg-[var(--cyan)] hover:text-black shadow-[0_0_15px_rgba(0,200,255,0.2)] hover:shadow-[0_0_25px_rgba(0,200,255,0.4)]"
                  }`}
              >
                {executed ? "EXECUTED ✓" : "EXECUTE PLAN"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
