"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebSocketOptions {
  url: string;
  onMessage: (data: any) => void;
  reconnectInterval?: number;
}

export function useWebSocket({ url, onMessage, reconnectInterval = 3000 }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, reconnectInterval);
    };

    ws.onerror = () => ws.close();

    wsRef.current = ws;
  }, [url, onMessage, reconnectInterval]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  return { connected };
}
