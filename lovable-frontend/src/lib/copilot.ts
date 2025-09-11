import type { CopilotMessage } from './copilotStream';

export async function callCopilot(messages: CopilotMessage[], getToken?: () => Promise<string | null>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Attach API key header for Copilot (dev/QA) if provided
  const apiKey = (import.meta.env as any).VITE_API_KEY as string | undefined;
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (getToken) {
    try {
      const token = await getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (_) {}
  }
  const res = await fetch('/api/copilotkit/copilotkit', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Copilot request failed: ${res.status} ${txt}`);
  }
  return res.json();
}

