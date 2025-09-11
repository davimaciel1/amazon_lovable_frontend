import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = process.env.TEST_PORT || '8093';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForHealth(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
      });
      if (ok) return true;
    } catch {}
    await wait(500);
  }
  throw new Error(`Server did not become healthy at ${url} within ${timeoutMs}ms`);
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch {}
  return { status: res.status, json, txt };
}

async function main() {
  console.log('Starting test backend on port', PORT);
  const child = spawn('npx ts-node src/index.ts', {
    cwd: process.cwd(),
    env: { ...process.env, ENABLE_COPILOT_AUTH: 'false', PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });
  child.stdout.on('data', (d) => process.stdout.write(`[backend] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[backend] ${d}`));

  try {
    await waitForHealth(`http://localhost:${PORT}/health`);
    console.log('Backend healthy');

    let pass = 0, fail = 0;

    // 1) Chat endpoint (function-calling flow)
    {
      const r = await postJSON(`http://localhost:${PORT}/api/copilotkit/copilotkit`, {
        messages: [{ role: 'user', content: 'Mostre pedidos, unidades, receita e ticket médio dos últimos 7 dias.' }]
      });
      if (r.status === 200 && r.json && r.json.success) { pass++; console.log('✅ chat endpoint OK'); }
      else { fail++; console.error('❌ chat endpoint FAIL', r.status, r.txt); }
    }

    // Date range for debug tools
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString().slice(0,10);
    const endStr = end.toISOString().slice(0,10);

    // 2) getTopProducts
    {
      const r = await postJSON(`http://localhost:${PORT}/api/copilotkit/copilotkit/debug`, { tool: 'getTopProducts', args: { start: startStr, end: endStr, limit: 10 } });
      if (r.status === 200 && r.json?.result) { pass++; console.log('✅ getTopProducts OK'); }
      else { fail++; console.error('❌ getTopProducts FAIL', r.status, r.txt); }
    }

    // 3) getInventoryStatus
    {
      const r = await postJSON(`http://localhost:${PORT}/api/copilotkit/copilotkit/debug`, { tool: 'getInventoryStatus', args: { threshold: 10, limit: 10 } });
      if (r.status === 200 && r.json?.result) { pass++; console.log('✅ getInventoryStatus OK'); }
      else { fail++; console.error('❌ getInventoryStatus FAIL', r.status, r.txt); }
    }

    // 4) getWorstMargins
    {
      const r = await postJSON(`http://localhost:${PORT}/api/copilotkit/copilotkit/debug`, { tool: 'getWorstMargins', args: { start: startStr, end: endStr, limit: 10 } });
      if (r.status === 200 && r.json?.result) { pass++; console.log('✅ getWorstMargins OK'); }
      else { fail++; console.error('❌ getWorstMargins FAIL', r.status, r.txt); }
    }

    // 5) getAsinsWithWeeklyDrop
    {
      const r = await postJSON(`http://localhost:${PORT}/api/copilotkit/copilotkit/debug`, { tool: 'getAsinsWithWeeklyDrop', args: { start: startStr, end: endStr, limit: 10 } });
      if (r.status === 200 && r.json?.result) { pass++; console.log('✅ getAsinsWithWeeklyDrop OK'); }
      else { fail++; console.error('❌ getAsinsWithWeeklyDrop FAIL', r.status, r.txt); }
    }

    console.log(`E2E Summary: pass=${pass}, fail=${fail}`);
    if (fail > 0) process.exitCode = 1;
  } catch (e) {
    console.error('E2E error:', e);
    process.exitCode = 1;
  } finally {
    try { child.kill(); } catch {}
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

