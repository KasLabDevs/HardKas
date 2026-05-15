import { resolveL2Profile, checkEvmRpcHealth, waitForEvmRpcReady } from "@hardkas/l2";
import { loadHardkasConfig } from "@hardkas/config";

export interface L2RpcHealthOptions {
  network?: string;
  url?: string;
  json?: boolean;
  wait?: boolean;
  timeout?: number;
  interval?: number;
}

export async function runL2RpcHealth(options: L2RpcHealthOptions): Promise<void> {
  const loaded = await loadHardkasConfig();
  
  const profile = resolveL2Profile({
    name: options.network,
    userProfiles: loaded.config.l2?.networks,
    cliOverrides: {
      ...(options.url !== undefined ? { url: options.url } : {})
    }
  });

  const rpcUrl = profile.rpcUrl;

  if (!rpcUrl) {
    throw new Error(`No L2 RPC URL configured for network '${profile.name}'. Pass --url <rpcUrl>.`);
  }

  const healthOptions = {
    url: rpcUrl,
    timeoutMs: (options.timeout ?? 60) * 1000,
    intervalMs: options.interval ?? 1000,
    maxWaitMs: (options.timeout ?? 60) * 1000
  };

  const health = options.wait 
    ? await waitForEvmRpcReady(healthOptions)
    : await checkEvmRpcHealth(healthOptions);

  // Chain ID validation
  let chainIdMismatch = false;
  if (health.ready && profile.chainId !== undefined && health.chainId !== undefined && String(health.chainId) !== String(profile.chainId)) {
    chainIdMismatch = true;
  }

  if (options.json) {
    console.log(JSON.stringify({ ...health, chainIdMismatch, profileChainId: profile.chainId }, (key, value) => 
      typeof value === "bigint" ? value.toString() : value, 2));
    return;
  }

  console.log(`${profile.displayName} L2 RPC health (${profile.source})`);
  console.log("");
  console.log(`Network:  ${profile.name}`);
  console.log(`URL:      ${health.url}`);
  console.log(`Status:   ${health.ready ? "ready" : "not ready"}`);

  if (health.ready) {
    console.log(`Chain ID: ${health.chainId} ${chainIdMismatch ? `(CONFLICT! Expected ${profile.chainId})` : ""}`);
    console.log(`Block:    ${health.blockNumber}`);
    console.log(`Gas:      ${health.gasPriceWei} wei`);
    if (health.latencyMs !== undefined) {
      console.log(`Latency:  ${health.latencyMs}ms`);
    }
  }

  if (chainIdMismatch) {
    console.log("");
    console.log("CRITICAL CONFLICT:");
    console.log(`  The remote RPC reports chain ID ${health.chainId}, but your local profile is configured for ${profile.chainId}.`);
    console.log("  Ensure you are connecting to the correct network.");
  }

  if (health.error) {
    console.log(`Error:    ${health.error}`);
  }

  console.log("");
  console.log("Warning:");
  console.log("  This is L2 EVM state, not Kaspa L1 UTXO state.");

  if (!health.ready || chainIdMismatch) {
    process.exitCode = 1;
  }
}
