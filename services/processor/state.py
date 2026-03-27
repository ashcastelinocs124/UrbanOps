"""In-memory city state snapshot maintained from event streams."""

from __future__ import annotations


class CityState:
    """Maintains the latest city snapshot by aggregating events by type.

    Traffic, transit, and weather are last-write-wins (only latest kept).
    Incidents are keyed by id; resolved incidents are removed.
    Recommendations are keyed by id.
    """

    def __init__(self) -> None:
        self._traffic: dict | None = None
        self._transit: dict | None = None
        self._incidents: dict[str, dict] = {}
        self._weather: dict | None = None
        self._recommendations: dict[str, dict] = {}

    def update(self, event: dict) -> None:
        """Route an event dict to the appropriate state slot."""
        event_type = event.get("type")

        if event_type == "traffic":
            self._traffic = event
        elif event_type == "transit":
            self._transit = event
        elif event_type == "incident":
            incident_id = event.get("id", "")
            if event.get("status") == "resolved":
                self._incidents.pop(incident_id, None)
            else:
                self._incidents[incident_id] = event
        elif event_type == "weather":
            self._weather = event
        elif event_type == "recommendation":
            rec_id = event.get("id", "")
            self._recommendations[rec_id] = event

    def snapshot(self) -> dict:
        """Return the full city state with incidents and recommendations as lists."""
        return {
            "traffic": self._traffic,
            "transit": self._transit,
            "incidents": list(self._incidents.values()),
            "weather": self._weather,
            "recommendations": list(self._recommendations.values()),
        }
