// mining-repro.ts — Minimal real mining reproducer
// No speculation. Evidence only.
//
// Pipeline per image:
//   getServerInfo → getBlockDagInfo BEFORE → getBlockTemplate → submitBlock → getBlockDagInfo AFTER
//
// Captures: exact outbound JSON, exact inbound JSON, kaspad version, DAG state delta.

import { spawn, execSync } from "child_process";
import WebSocket from "ws";
import net from "net";

// ── Config ──────────────────────────────────────────────────────────────
const IMAGES = [
  "kaspanet/rusty-kaspad:v2.0.0",
  "kaspanet/rusty-kaspad:v2.0.1",
];
const STARTUP_TIMEOUT_MS = 30_000;
const RPC_TIMEOUT_MS = 5_000;

// ── Helpers ─────────────────────────────────────────────────────────────
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function getDigest(image: string): string {
  try {
    const out = execSync(`docker inspect ${image} --format "{{index .RepoDigests 0}}"`, { encoding: "utf-8" });
    return out.trim();
  } catch { return "UNKNOWN"; }
}

// Send a JSON message over WS using the jsonrpc:"2.0" envelope
// (which is what JsonWrpcKaspaClient uses) and capture exact wire data.
function rpcCall(ws: WebSocket, id: number, method: string, params: Record<string, unknown>): Promise<{
  outbound: string;
  inbound: string;
  parsed: any;
}> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const timeout = setTimeout(() => reject(new Error(`Timeout ${RPC_TIMEOUT_MS}ms on ${method}`)), RPC_TIMEOUT_MS);

    const handler = (data: any) => {
      clearTimeout(timeout);
      const raw = data.toString();
      try {
        const parsed = JSON.parse(raw);
        if (String(parsed.id) === String(id)) {
          ws.removeListener("message", handler);
          resolve({ outbound: payload, inbound: raw, parsed });
        }
        // else: notification, ignore
      } catch {
        ws.removeListener("message", handler);
        resolve({ outbound: payload, inbound: raw, parsed: null });
      }
    };

    ws.on("message", handler);
    ws.send(payload);
  });
}

// ── Per-image test ──────────────────────────────────────────────────────
async function testImage(image: string) {
  const digest = getDigest(image);
  const port = await getFreePort();
  const rpcUrl = `ws://127.0.0.1:${port}`;

  console.log(`\n${"=".repeat(72)}`);
  console.log(`IMAGE:  ${image}`);
  console.log(`DIGEST: ${digest}`);
  console.log(`PORT:   ${port}`);
  console.log(`${"=".repeat(72)}`);

  // Start container
  const child = spawn("docker", [
    "run", "--rm", "-p", `${port}:${port}`,
    image, "kaspad",
    "--simnet",
    `--rpclisten-json=0.0.0.0:${port}`,
    "--enable-unsynced-mining",
    "--reset-db",
  ], { stdio: "pipe" });

  let kaspadLogs = "";
  child.stdout?.on("data", (d) => { kaspadLogs += d.toString(); });
  child.stderr?.on("data", (d) => { kaspadLogs += d.toString(); });

  // Wait for node to be ready (WebSocket connectable)
  const startTs = Date.now();
  let ws: WebSocket | null = null;
  while (Date.now() - startTs < STARTUP_TIMEOUT_MS) {
    try {
      ws = await new Promise<WebSocket>((resolve, reject) => {
        const w = new WebSocket(rpcUrl);
        const t = setTimeout(() => { w.close(); reject(new Error("connect timeout")); }, 2000);
        w.on("open", () => { clearTimeout(t); resolve(w); });
        w.on("error", () => { clearTimeout(t); reject(new Error("connect error")); });
      });
      break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (!ws) {
    console.log("RESULT: ENVIRONMENT_NOT_QUALIFIED — could not connect to node");
    child.kill("SIGKILL");
    return;
  }
  console.log(`Connected in ${Date.now() - startTs}ms`);

  const results: Record<string, { status: string; outbound?: string; inbound?: string; error?: string }> = {};

  // 1. getServerInfo
  try {
    const r = await rpcCall(ws, 1, "getServerInfo", {});
    const res = r.parsed.result || r.parsed.params;
    if (r.parsed.error) throw new Error(JSON.stringify(r.parsed.error));
    results["1_getServerInfo"] = { status: "OK", outbound: r.outbound, inbound: r.inbound };
    console.log(`\n[1] getServerInfo: OK — version=${res?.serverVersion}, network=${res?.networkId}`);
  } catch (e: any) {
    results["1_getServerInfo"] = { status: "FAIL", error: e.message };
    console.log(`\n[1] getServerInfo: FAIL — ${e.message}`);
  }

  // 2. getBlockDagInfo BEFORE
  let daaBefore: string | undefined;
  try {
    const r = await rpcCall(ws, 2, "getBlockDagInfo", {});
    if (r.parsed.error) throw new Error(JSON.stringify(r.parsed.error));
    const res = r.parsed.result || r.parsed.params;
    daaBefore = String(res?.virtualDaaScore ?? res?.daaScore ?? "?");
    results["2_getBlockDagInfo_BEFORE"] = { status: "OK", outbound: r.outbound, inbound: r.inbound };
    console.log(`[2] getBlockDagInfo BEFORE: OK — virtualDaaScore=${daaBefore}`);
  } catch (e: any) {
    results["2_getBlockDagInfo_BEFORE"] = { status: "FAIL", error: e.message };
    console.log(`[2] getBlockDagInfo BEFORE: FAIL — ${e.message}`);
  }

  // 3. getBlockTemplate
  let blockTemplate: any = null;
  try {
    const r = await rpcCall(ws, 3, "getBlockTemplate", {
      payAddress: "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqn648kfwc",
      extraData: [],
    });
    if (r.parsed.error) throw new Error(JSON.stringify(r.parsed.error));
    const res = r.parsed.result || r.parsed.params;
    blockTemplate = res?.block || res?.blockMessage;
    results["3_getBlockTemplate"] = { status: "OK", outbound: r.outbound, inbound: r.inbound.substring(0, 2000) };
    console.log(`[3] getBlockTemplate: OK — block keys: ${blockTemplate ? Object.keys(blockTemplate) : "null"}`);
  } catch (e: any) {
    results["3_getBlockTemplate"] = { status: "FAIL", error: e.message, outbound: undefined };
    console.log(`[3] getBlockTemplate: FAIL — ${e.message}`);
  }

  // 4. submitBlock (only if template obtained)
  if (blockTemplate) {
    try {
      const r = await rpcCall(ws, 4, "submitBlock", {
        block: blockTemplate,
        allowNonDAABlocks: false,
      });
      if (r.parsed.error) throw new Error(JSON.stringify(r.parsed.error));
      const res = r.parsed.result || r.parsed.params;
      results["4_submitBlock"] = { status: res?.rejectReason ? `REJECTED: ${res.rejectReason}` : "OK", outbound: r.outbound.substring(0, 2000), inbound: r.inbound };
      console.log(`[4] submitBlock: ${res?.rejectReason ? "REJECTED — " + res.rejectReason : "OK"}`);
    } catch (e: any) {
      results["4_submitBlock"] = { status: "FAIL", error: e.message };
      console.log(`[4] submitBlock: FAIL — ${e.message}`);
    }
  } else {
    results["4_submitBlock"] = { status: "SKIPPED — no template" };
    console.log(`[4] submitBlock: SKIPPED (no template from step 3)`);
  }

  // 5. getBlockDagInfo AFTER
  try {
    const r = await rpcCall(ws, 5, "getBlockDagInfo", {});
    if (r.parsed.error) throw new Error(JSON.stringify(r.parsed.error));
    const res = r.parsed.result || r.parsed.params;
    const daaAfter = String(res?.virtualDaaScore ?? res?.daaScore ?? "?");
    results["5_getBlockDagInfo_AFTER"] = { status: "OK", outbound: r.outbound, inbound: r.inbound };
    console.log(`[5] getBlockDagInfo AFTER: OK — virtualDaaScore=${daaAfter}`);
    console.log(`    DAG ADVANCED: ${daaBefore !== daaAfter ? `YES (${daaBefore} → ${daaAfter})` : `NO (still ${daaAfter})`}`);
  } catch (e: any) {
    results["5_getBlockDagInfo_AFTER"] = { status: "FAIL", error: e.message };
    console.log(`[5] getBlockDagInfo AFTER: FAIL — ${e.message}`);
  }

  // Capture kaspad logs
  console.log(`\n--- kaspad logs (last 500 chars) ---`);
  console.log(kaspadLogs.substring(kaspadLogs.length - 500));

  // Dump wire payloads for failed steps
  for (const [step, r] of Object.entries(results)) {
    if (r.status !== "OK" && r.outbound) {
      console.log(`\n--- WIRE DUMP: ${step} ---`);
      console.log(`  OUTBOUND: ${r.outbound}`);
    }
  }

  ws.close();
  child.kill("SIGKILL");
  await new Promise(r => setTimeout(r, 1000));
}

// ── Main ────────────────────────────────────────────────────────────────
(async () => {
  for (const image of IMAGES) {
    await testImage(image);
  }
  console.log("\n\nDONE.");
  process.exit(0);
})();
