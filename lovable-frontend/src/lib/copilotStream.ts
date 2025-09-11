export type CopilotMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
};

export type StreamOptions = {
  onDelta?: (chunk: string) => void;
  onDone?: (full: string) => void;
  onError?: (err: unknown) => void;
  getToken?: () => Promise<string | null>;
  signal?: AbortSignal;
};

// Streams text responses from the CopilotKit SSE endpoint (POST)
export async function streamCopilot(
  messages: CopilotMessage[],
  opts: StreamOptions = {}
) {
  const { onDelta, onDone, onError, getToken, signal } = opts;
  let full = '';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = (import.meta.env as any).VITE_API_KEY as string | undefined;
    if (apiKey) headers['X-API-Key'] = apiKey;
    if (getToken) {
      try {
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (_) {}
    }

    const res = await fetch('/api/copilotkit/copilotkit/stream', {
      method: 'POST',
      headers: {
        ...headers,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ messages }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Stream request failed with status ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });

      // Parse SSE lines (data: {"delta":"..."})
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data:')) {
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            onDone?.(full);
            return;
          }
          try {
            const obj = JSON.parse(payload);
            const delta: string = obj?.delta ?? '';
            if (delta) {
              full += delta;
              onDelta?.(delta);
            }
          } catch (e) {
            // Non-JSON data lines can be ignored
          }
        }
      }
    }

    onDone?.(full);
  } catch (err) {
    onError?.(err);
  }
}

// Optional helper for QA: call a tool directly without LLM (backend debug route)
export async function callCopilotToolDebug(tool: string, args: any, getToken?: () => Promise<string | null>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = (import.meta.env as any).VITE_API_KEY as string | undefined;
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (getToken) {
    try {
      const token = await getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (_) {}
  }
  const res = await fetch('/api/copilotkit/copilotkit/debug', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, args }),
  });
  if (!res.ok) {
    throw new Error(`Debug call failed: ${res.status}`);
  }
  return res.json();
}

/*
Example usage (with Clerk):

import { useAuth } from '@clerk/clerk-react';
import { streamCopilot, callCopilotToolDebug } from '@/lib/copilotStream';

function Example() {
  const { getToken } = useAuth();

  async function runStream() {
    await streamCopilot([
      { role: 'user', content: 'Escreva um resumo sobre resultados de vendas.' }
    ], {
      getToken,
      onDelta: (chunk) => console.log('delta:', chunk),
      onDone: (full) => console.log('done:', full),
      onError: (e) => console.error(e)
    });
  }

  async function runDebug() {
    const res = await callCopilotToolDebug('getSalesReport', { start: '2024-08-01', end: '2024-08-31' }, getToken);
    console.log(res);
  }
}
*/

