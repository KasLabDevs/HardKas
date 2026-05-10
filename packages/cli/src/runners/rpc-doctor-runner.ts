import { UI } from "../ui.js";
import { KaspaJsonRpcClient, LoadBalancedRpcProvider } from "@hardkas/kaspa-rpc";
import { loadHardkasConfig } from "@hardkas/config";

export interface RpcDoctorOptions {
  endpoints?: string[];
  config?: string;
}

export async function runRpcDoctor(options: RpcDoctorOptions) {
  let endpoints = options.endpoints || [];

  if (endpoints.length === 0) {
    const loaded = await loadHardkasConfig(options.config ? { configPath: options.config } : {});
    const networks = loaded.config.networks || {};
    const defaultNetwork = loaded.config.defaultNetwork || "simnet";
    const network = (networks as any)[defaultNetwork];

    if (network?.rpcUrl) {
      endpoints = [network.rpcUrl];
    } else {
      endpoints = ["http://127.0.0.1:18210"];
    }
  }

  UI.header("HardKAS RPC Doctor");
  console.log(`Auditing ${endpoints.length} endpoint(s)...\n`);

  const results = [];

  for (const url of endpoints) {
    const client = new KaspaJsonRpcClient({ url, timeoutMs: 5000 });
    const health = await client.healthCheck();

    results.push({ url, health });

    const statusIcon = health.status === "healthy" ? "✓" : health.status === "stale" ? "⚠" : "✗";
    
    console.log("┌── RPC HEALTH ────────────────────────────────────────────────");
    console.log(`│ ENDPOINT:   ${url.padEnd(48)} │`);
    console.log(`│ STATE:      ${health.status.toUpperCase().padEnd(48)} │`);
    console.log(`│ CONFIDENCE: ${health.confidence?.toUpperCase().padEnd(36)} [${(health.score ?? 0).toString().padStart(3)}%] │`);
    console.log(`│ LATENCY:    ${(health.latencyMs + "ms").padEnd(48)} │`);
    console.log(`│ NETWORK:    ${(health.info?.networkId || "unknown").padEnd(48)} │`);
    console.log(`│ DAA SCORE:  ${(health.info?.virtualDaaScore?.toString() || "0").padEnd(48)} │`);
    console.log("└──────────────────────────────────────────────────────────────");

    // Issues Section
    const { calculateConfidence } = await import("@hardkas/kaspa-rpc");
    const resilience = calculateConfidence({
      latencyMs: health.latencyMs || null,
      successRate: health.successRate ?? 100,
      retries: health.retries ?? 0,
      stale: !!health.stale,
      reachable: !!health.reachable,
      circuitOpen: health.circuitState === "OPEN"
    });

    if (resilience.issues.length > 0) {
      console.log("\n[ ISSUES ]");
      resilience.issues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      UI.success("\n  ✓ No operational issues detected.");
    }

    // Trace Section
    console.log("\n[ TRACE ]");
    console.log(`  - Retries:      ${health.retries ?? 0}`);
    console.log(`  - Circuit:      ${health.circuitState || "CLOSED"}`);
    console.log(`  - Sync Status:  ${health.info?.isSynced ? "SYNCED" : "STALE"}`);
    console.log(`  - Version:      ${health.info?.serverVersion || "unknown"}`);
    console.log("");
  }

  if (endpoints.length > 1) {
    UI.divider();
    const healthy = results.filter(r => r.health.reachable);
    if (healthy.length === endpoints.length) {
      UI.success("All endpoints are healthy and ready for failover.");
    } else if (healthy.length > 0) {
      UI.warning(`${healthy.length}/${endpoints.length} endpoints are healthy. Load balancing will be degraded.`);
    } else {
      UI.error("CRITICAL: All endpoints are unreachable.");
    }
  }
}
