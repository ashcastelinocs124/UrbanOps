"""WebSocket connection manager for broadcasting city events."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts messages."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: "WebSocket") -> None:
        """Accept and store a new WebSocket connection."""
        await ws.accept()
        self._connections.append(ws)
        logger.info("WebSocket connected — %d total", len(self._connections))

    def disconnect(self, ws: "WebSocket") -> None:
        """Remove a WebSocket connection."""
        if ws in self._connections:
            self._connections.remove(ws)
        logger.info("WebSocket disconnected — %d total", len(self._connections))

    async def broadcast(self, message: str) -> None:
        """Send a message to all connected clients, removing failed ones."""
        failed: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                failed.append(ws)
        for ws in failed:
            if ws in self._connections:
                self._connections.remove(ws)

    @property
    def count(self) -> int:
        """Number of active WebSocket connections."""
        return len(self._connections)
