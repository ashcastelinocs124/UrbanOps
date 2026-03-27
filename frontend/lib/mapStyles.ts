export const CHICAGO_CENTER: [number, number] = [-87.6298, 41.8781];
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
