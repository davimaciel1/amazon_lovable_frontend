import React from 'react';
import { CopilotKit } from '@copilotkit/react-core';
import '@copilotkit/react-ui/styles.css';

interface CopilotProviderProps {
  children: React.ReactNode;
}

export function CopilotProvider({ children }: CopilotProviderProps) {
  // Backend URL - adjust if your backend runs on a different port
  // Prefer explicit env, fallback to local backend (8080)
  const rawBackend = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:8080';
  // Normalize to avoid double /api
  const backendUrl = rawBackend.replace(/\/$/, '').replace(/\/(api)\/?$/, '');
  const runtimeUrl = `${backendUrl}/api/copilotkit`;

  return (
    <CopilotKit 
      runtimeUrl={runtimeUrl}
      showDevConsole={import.meta.env.DEV}
    >
      {children}
    </CopilotKit>
  );
}

// Export a hook to use CopilotKit features
export { useCopilotAction, useCopilotReadable, useCopilotChat } from '@copilotkit/react-core';