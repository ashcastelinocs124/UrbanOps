"""Tests for CityState."""

import sys
import os

# Ensure the processor package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from state import CityState


def test_city_state_updates_traffic():
    state = CityState()
    event = {
        "type": "traffic",
        "timestamp": "2026-03-27T12:00:00Z",
        "segments": [
            {
                "road": "I-90",
                "from_pos": [41.88, -87.63],
                "to_pos": [41.89, -87.64],
                "speed_mph": 35.0,
                "free_flow_mph": 60.0,
                "congestion_level": "moderate",
            }
        ],
    }
    state.update(event)
    snap = state.snapshot()
    assert snap["traffic"] is not None
    assert snap["traffic"]["type"] == "traffic"
    assert snap["traffic"]["segments"][0]["road"] == "I-90"


def test_city_state_tracks_active_incidents():
    state = CityState()

    # Add an active incident
    active = {
        "type": "incident",
        "id": "inc-001",
        "timestamp": "2026-03-27T12:00:00Z",
        "category": "accident",
        "severity": "high",
        "position": [41.88, -87.63],
        "description": "Multi-car pileup on I-90",
        "affected_roads": ["I-90"],
        "status": "active",
    }
    state.update(active)
    snap = state.snapshot()
    assert len(snap["incidents"]) == 1
    assert snap["incidents"][0]["id"] == "inc-001"

    # Resolve the incident — should be removed
    resolved = {**active, "status": "resolved"}
    state.update(resolved)
    snap = state.snapshot()
    assert len(snap["incidents"]) == 0


def test_city_state_snapshot_has_all_keys():
    state = CityState()
    snap = state.snapshot()
    expected_keys = {"traffic", "transit", "incidents", "weather", "recommendations"}
    assert set(snap.keys()) == expected_keys
