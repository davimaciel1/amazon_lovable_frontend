import { useEffect, useRef } from 'react';
import { connectWebSocket } from '@/services/ws';

export function ApiProvider({ children }: { children: React.ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    async function open() {
      try {
        if (wsRef.current) return;
        // Connect without auth token
        wsRef.current = await connectWebSocket(async () => null);
        wsRef.current.onclose = () => {
          wsRef.current = null;
          if (!closed) setTimeout(open, 5000);
        };
      } catch {
        setTimeout(open, 5000);
      }
    }
    open();
    return () => {
      closed = true;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
    };
  }, []);

  return <>{children}</>;
}
