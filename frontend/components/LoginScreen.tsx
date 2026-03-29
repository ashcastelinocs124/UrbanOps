"use client";

import { useState, useEffect, useRef } from "react";

interface LoginScreenProps {
  onAuthenticated: () => void;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [phase, setPhase] = useState<"idle" | "typing" | "scanning" | "granted">("idle");
  const [accessCode, setAccessCode] = useState("");
  const [displayText, setDisplayText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);
  const [scanProgress, setScanProgress] = useState(0);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const bootRef = useRef<HTMLDivElement>(null);

  // Boot sequence on mount
  useEffect(() => {
    const lines = [
      "[SYS] Initializing UrbanOps Secure Terminal...",
      "[NET] Establishing encrypted channel... OK",
      "[SEC] Loading biometric protocols... OK",
      "[DB]  Connecting to Chicago Operations Database... OK",
      "[SAT] Satellite uplink verified — 4 feeds active",
      "[MAP] Mapbox GL vector tiles cached — 847 layers",
      "[AI]  GPT-4o inference engine standby... OK",
      "[WX]  NWS weather feed synchronized",
      "[CTA] Transit API authenticated",
      "[SYS] All systems nominal.",
      "",
      "[AUTH] Operator authentication required.",
    ];

    let i = 0;
    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (i < lines.length) {
        const line = lines[i];
        i++;
        setBootLines((prev) => [...prev, line]);
        setTimeout(() => {
          bootRef.current?.scrollTo({ top: bootRef.current.scrollHeight });
        }, 10);
      } else {
        clearInterval(interval);
        setTimeout(() => { if (!cancelled) setShowForm(true); }, 300);
      }
    }, 120);

    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Cursor blink
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  // Focus input when form appears
  useEffect(() => {
    if (showForm) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showForm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) return;

    setError("");
    setPhase("scanning");

    // Simulate biometric scan
    let progress = 0;
    const scanInterval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(scanInterval);

        // Accept any non-empty code
        setTimeout(() => {
          setPhase("granted");
          setTimeout(() => onAuthenticated(), 1500);
        }, 400);
      }
      setScanProgress(Math.min(progress, 100));
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--cyan) 1px, transparent 1px), linear-gradient(90deg, var(--cyan) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 40%, rgba(0,200,255,0.04) 0%, transparent 60%)",
        }}
      />

      {/* Scan lines */}
      <div className="absolute inset-0 scanlines pointer-events-none" />

      {/* Main terminal */}
      <div className="relative w-full max-w-lg mx-4">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-16 h-16 mb-4">
            <div className="absolute inset-0 border-2 border-[var(--cyan)]/40 rotate-45 animate-[spin_20s_linear_infinite]" />
            <div className="absolute inset-2 border border-[var(--cyan)]/60 rotate-45 animate-[spin_15s_linear_infinite_reverse]" />
            <div className="absolute inset-4 border border-[var(--cyan)] rotate-45" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold text-[var(--cyan)] text-glow font-[var(--font-display)]">U</span>
            </div>
          </div>
          <h1 className="text-[14px] font-bold tracking-[0.35em] text-[var(--text-bright)] font-[var(--font-display)]">
            URBANOPS
          </h1>
          <p className="text-[9px] tracking-[0.25em] text-[var(--text-dim)] mt-1">
            CHICAGO CITY OPERATIONS CENTER
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-12 h-px bg-gradient-to-r from-transparent to-[var(--cyan)]/40" />
            <span className="text-[7px] tracking-[0.3em] text-[var(--cyan)]/50 font-bold">CLASSIFIED</span>
            <div className="w-12 h-px bg-gradient-to-l from-transparent to-[var(--cyan)]/40" />
          </div>
        </div>

        {/* Terminal window */}
        <div className="panel-glass border border-[var(--border-glow)]/30">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-dim)]">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-[data-flow_2s_ease-in-out_infinite]" />
              <span className="hud-label text-[var(--cyan-muted)]">SECURE TERMINAL</span>
            </div>
            <span className="hud-label">SESSION {Math.random().toString(36).slice(2, 8).toUpperCase()}</span>
          </div>

          {/* Boot log */}
          <div
            ref={bootRef}
            className="px-4 py-3 max-h-48 overflow-y-auto font-mono text-[10px] leading-relaxed"
          >
            {bootLines.filter((l): l is string => l != null).map((line, i) => (
              <div
                key={i}
                className={`${
                  line?.startsWith("[SYS]")
                    ? "text-[var(--cyan)]"
                    : line?.startsWith("[AUTH]")
                    ? "text-[var(--amber)]"
                    : !line
                    ? ""
                    : "text-[var(--text-dim)]"
                }`}
              >
                {line || ""}
              </div>
            ))}
          </div>

          {/* Login form */}
          {showForm && phase !== "granted" && (
            <form onSubmit={handleSubmit} className="px-4 pb-4 pt-2 border-t border-[var(--border-dim)]">
              <div className="space-y-3">
                {/* Operator ID */}
                <div>
                  <label className="hud-label text-[var(--text-dim)] block mb-1.5">OPERATOR ID</label>
                  <div className="relative">
                    <input
                      type="text"
                      defaultValue="OPS-ADMIN"
                      className="w-full bg-black/50 border border-[var(--border-dim)] px-3 py-2 text-[11px] font-mono text-[var(--cyan)] tracking-wider focus:border-[var(--cyan)]/50 focus:outline-none focus:shadow-[0_0_10px_rgba(0,200,255,0.1)] transition-all"
                      readOnly
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <span className="text-[7px] text-[var(--green)] font-bold tracking-wider">VERIFIED</span>
                    </div>
                  </div>
                </div>

                {/* Access Code */}
                <div>
                  <label className="hud-label text-[var(--text-dim)] block mb-1.5">ACCESS CODE</label>
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="password"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      placeholder="ENTER ACCESS CODE"
                      disabled={phase === "scanning"}
                      className="w-full bg-black/50 border border-[var(--border-dim)] px-3 py-2 text-[11px] font-mono text-[var(--text-bright)] tracking-[0.15em] placeholder:text-[var(--text-dim)]/30 placeholder:tracking-[0.15em] focus:border-[var(--cyan)]/50 focus:outline-none focus:shadow-[0_0_10px_rgba(0,200,255,0.1)] transition-all disabled:opacity-50"
                    />
                    {cursorVisible && accessCode === "" && phase === "idle" && (
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-4 bg-[var(--cyan)]/60" />
                    )}
                  </div>
                </div>

                {/* Scan progress */}
                {phase === "scanning" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="hud-label text-[var(--amber)] animate-[data-flow_1s_ease-in-out_infinite]">
                        AUTHENTICATING...
                      </span>
                      <span className="text-[10px] font-mono text-[var(--amber)]">
                        {Math.round(scanProgress)}%
                      </span>
                    </div>
                    <div className="w-full h-1 bg-[var(--border-dim)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--amber)] transition-all duration-150"
                        style={{ width: `${scanProgress}%` }}
                      />
                    </div>
                    <div className="flex gap-4">
                      <span className="hud-label">{scanProgress > 20 ? "✓" : "○"} CREDENTIALS</span>
                      <span className="hud-label">{scanProgress > 50 ? "✓" : "○"} CLEARANCE</span>
                      <span className="hud-label">{scanProgress > 80 ? "✓" : "○"} BIOMETRIC</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="text-[9px] text-[var(--red)] font-mono tracking-wider">
                    [AUTH ERROR] {error}
                  </div>
                )}

                {/* Submit */}
                {phase === "idle" && (
                  <button
                    type="submit"
                    className="w-full py-2.5 text-[10px] font-bold tracking-[0.25em] border border-[var(--cyan)]/50 text-[var(--cyan)] hover:bg-[var(--cyan)]/10 hover:border-[var(--cyan)] hover:shadow-[0_0_20px_rgba(0,200,255,0.15)] transition-all duration-300 mt-1"
                  >
                    AUTHENTICATE
                  </button>
                )}
              </div>
            </form>
          )}

          {/* Access granted */}
          {phase === "granted" && (
            <div className="px-4 py-6 border-t border-[var(--border-dim)] text-center">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="w-6 h-6 rounded-full border-2 border-[var(--green)] flex items-center justify-center shadow-[0_0_15px_rgba(0,228,123,0.3)]">
                  <span className="text-[var(--green)] text-sm font-bold">✓</span>
                </div>
                <span className="text-[12px] font-mono font-bold tracking-[0.3em] text-[var(--green)] text-shadow-[0_0_10px_rgba(0,228,123,0.4)]">
                  ACCESS GRANTED
                </span>
              </div>
              <p className="text-[9px] text-[var(--text-dim)] tracking-wider">
                CLEARANCE LEVEL: ALPHA — LOADING OPERATIONS CENTER...
              </p>
              <div className="mt-3 w-full h-0.5 bg-[var(--border-dim)] overflow-hidden">
                <div className="h-full bg-[var(--green)] animate-[pulse_0.8s_ease-in-out_infinite] w-full" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 px-2">
          <span className="text-[7px] text-[var(--text-dim)]/40 tracking-wider">
            URBANOPS v2.1.0 // ENCRYPTED SESSION
          </span>
          <span className="text-[7px] text-[var(--text-dim)]/40 tracking-wider">
            © 2026 CHICAGO DEPT. OF INFRASTRUCTURE
          </span>
        </div>
      </div>
    </div>
  );
}
