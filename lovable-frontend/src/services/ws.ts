const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

export const wsMetrics = {
  connects: 0,
  closes: 0,
  errors: 0,
  lastOpenAt: null as string | null,
  lastCloseAt: null as string | null,
};

export async function connectWebSocket(getToken?: () => Promise<string | null>, onMessage?: (ev: MessageEvent) => void) {
  let url = WS_URL;
  try {
    if (getToken) {
      const token = await getToken();
      if (token) {
        const sep = url.includes('?') ? '&' : '?';
        url = `${url}${sep}token=${encodeURIComponent(token)}`;
      }
    }
  } catch {
    // ignore token errors
  }

  const ws = new WebSocket(url);
  ws.onopen = () => {
    wsMetrics.connects += 1;
    wsMetrics.lastOpenAt = new Date().toISOString();
    console.log('[WS] connected');
  };
  ws.onerror = (e) => {
    wsMetrics.errors += 1;
    console.warn('[WS] error', e);
  };
  ws.onclose = (e) => {
    wsMetrics.closes += 1;
    wsMetrics.lastCloseAt = new Date().toISOString();
    console.log('[WS] closed', e.code, e.reason);
  };
  if (onMessage) ws.onmessage = onMessage;
  return ws;
}
