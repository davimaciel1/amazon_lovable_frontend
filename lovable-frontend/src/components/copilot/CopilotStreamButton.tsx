import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { streamCopilot } from '@/lib/copilotStream';

export function CopilotStreamButton() {
  // No auth in dev: provide a no-op token getter
  const getToken = async () => null;
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const start = async () => {
    setOutput('');
    setStreaming(true);
    const ac = new AbortController();
    abortRef.current = ac;

    await streamCopilot(
      [
        { role: 'user', content: 'Escreva um resumo curto sobre o desempenho das vendas.' },
      ],
      {
        getToken,
        signal: ac.signal,
        onDelta: (chunk) => setOutput((prev) => prev + chunk),
        onDone: () => setStreaming(false),
        onError: (e) => {
          setStreaming(false);
          setOutput(`Erro no streaming: ${e instanceof Error ? e.message : String(e)}`);
        },
      }
    );
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Copilot Streaming Demo</div>
        <div className="flex gap-2">
          {!streaming ? (
            <Button size="sm" onClick={start}>Testar Streaming</Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={stop}>Parar</Button>
          )}
        </div>
      </div>
      <Textarea value={output} onChange={() => {}} rows={6} placeholder="A resposta do Copilot aparecerá aqui..." />
    </Card>
  );
}
