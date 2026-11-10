import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// -----------------------------------------------------------------------------
// N-5 (integration round 2, 2026-11-07). TESTNET-PORT-COLLISION-1 and TQ1-SCRIPT-BROKEN-1 put a fake node on the
// canonical localnet port (127.0.0.1:18210) and used to assert that it received ZERO connections. That fake also counts
// connections from processes that are not a tested path: a local wallet or explorer, the owner's localnet tooling,
// another worktree's gate running this same file. The suites then failed although no tested path dialled 18210.
// The invariant they measure is per path: every tested path runs in its own process under the hermetic preload, whose
// log records every address that process tried. These helpers make that log the assertion, keep the fake's count as a
// diagnostic, and let a run proceed when another process already holds the port.
// -----------------------------------------------------------------------------

export const CANONICAL_WRPC_PORT = 18210;

/**
 * True when a recorded dial (`KIND host:port`, as the hermetic preload writes it) targets `port`, whatever loopback
 * spelling the path used (127.x.y.z, localhost, ::1, 0.0.0.0) and whether the preload let it through or refused it.
 */
export function dialsPort(dialled: readonly string[], port: number = CANONICAL_WRPC_PORT): boolean {
  const suffix = new RegExp(`:${port}$`);
  return dialled.some((d) => suffix.test(String(d).trim()));
}

/**
 * Starts a fake on a fixed port. When another process already holds it (EADDRINUSE) the run goes on without the fake:
 * the per-path dial logs still prove the invariant, and nothing here talks to a service that is not ours.
 */
export async function startOnFixedPort<T>(start: () => Promise<T>): Promise<{ fake?: T; unavailable?: string }> {
  try {
    return { fake: await start() };
  } catch (e: any) {
    if (e?.code === "EADDRINUSE") return { unavailable: `port held by another process (${e.code})` };
    throw e;
  }
}

const wsModule = createRequire(import.meta.url).resolve("ws");

/**
 * An UNRELATED local process: it has no hermetic preload and is not a tested path. It opens a WebSocket to
 * 127.0.0.1:`port`, asks `getServerInfo` and leaves, as a local wallet or another test run would. Callers use it only
 * against a fake they bound themselves, to show that the verdict does not depend on such traffic.
 */
export function foreignLocalProbe(port: number = CANONICAL_WRPC_PORT): Promise<{ connected: boolean; detail: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NODE_OPTIONS; // no hermetic preload: this process is outside every measured path
  for (const k of Object.keys(env)) if (k.startsWith("HARDKAS_HERMETIC_")) delete env[k];
  const script =
    "const WebSocket = require(process.argv[1]);" +
    "const s = new WebSocket('ws://127.0.0.1:' + process.argv[2]);" +
    "const done = (code, msg) => { try { s.terminate(); } catch {} console.log(msg); process.exit(code); };" +
    "s.on('open', () => s.send(JSON.stringify({ id: 1, method: 'getServerInfo', params: {} })));" +
    "s.on('message', () => done(0, 'answered'));" +
    "s.on('error', (e) => done(2, String(e && e.message)));" +
    "setTimeout(() => done(3, 'timeout'), 10000);";
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", script, wsModule, String(port)], { env });
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (out += String(d)));
    child.on("close", (status) => resolve({ connected: status === 0, detail: `exit ${status}: ${out.trim().slice(0, 200)}` }));
  });
}
