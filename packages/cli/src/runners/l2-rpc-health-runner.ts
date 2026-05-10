import { getL2Profile, checkEvmRpcHealth, waitForEvmRpcReady } from "@hardkas/l2";

export interface L2RpcHealthOptions {
  network?: string;
  url?: string;
  json?: boolean;
  wait?: boolean;
  timeout?: number;
  interval?: number;
}

export async function runL2RpcHealth(options: L2RpcHealthOptions): Promise<void> {
  const networkName = options.network ?? "igra";
  const profile = getL2Profile(networkName);

  if (!profile) {
    throw new Error(`L2 profile '${networkName}' not found.`);
  }

  const rpcUrl = options.url ?? profile.rpcUrl;

  if (!rpcUrl) {
    throw new Error(`No L2 RPC URL configured for network '${networkName}'. Pass --url <rpcUrl>.`);
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

  if (options.json) {
    console.log(JSON.stringify(health, (key, value) => 
      typeof value === "bigint" ? value.toString() : value, 2));
    return;
  }

  console.log(`${profile.displayName} L2 RPC health`);
  console.log("");
  console.log(`Network:  ${networkName}`);
  console.log(`URL:      ${health.url}`);
  console.log(`Status:   ${health.ready ? "ready" : "not ready"}`);

  if (health.ready) {
    console.log(`Chain ID: ${health.chainId}`);
    console.log(`Block:    ${health.blockNumber}`);
    console.log(`Gas:      ${health.gasPriceWei} wei`);
    if (health.latencyMs !== undefined) {
      console.log(`Latency:  ${health.latencyMs}ms`);
    }
  }

  if (health.error) {
    console.log(`Error:    ${health.error}`);
  }

  console.log("");
  console.log("Warning:");
  console.log("  This is L2 EVM state, not Kaspa L1 UTXO state.");

  if (!health.ready) {
    process.exitCode = 1;
  }
}
