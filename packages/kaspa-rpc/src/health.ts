import { KaspaJsonRpcClient } from "./json-rpc-client.js";

export interface RpcHealthCheckOptions {
  readonly url?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface RpcReadinessWaitOptions extends RpcHealthCheckOptions {
  readonly wait?: boolean | undefined;
  readonly intervalMs?: number | undefined;
  readonly maxWaitMs?: number | undefined;
}

export interface RpcHealthResult {
  readonly endpoint: string;
  readonly status: RpcHealthState;
  readonly ready: boolean; 
  readonly checkedAt: string;
  readonly latencyMs?: number | undefined;
  readonly networkId?: string | undefined;
  readonly virtualDaaScore?: string | undefined;
  readonly serverVersion?: string | undefined;
  readonly isSynced?: boolean | undefined;
  readonly error?: string | undefined; // Legacy
  readonly lastError?: string | null | undefined;
  readonly retries?: number | undefined;
  readonly circuitState?: string | undefined;
  readonly stale?: boolean | undefined;
}

import { RpcHealthState } from "./resilience.js";

export async function checkKaspaRpcHealth(options?: RpcHealthCheckOptions): Promise<RpcHealthResult> {
  const url = options?.url || "http://127.0.0.1:18210";
  const client = new KaspaJsonRpcClient({ url, timeoutMs: options?.timeoutMs });
  const checkedAt = new Date().toISOString();

  try {
    const health = await client.healthCheck();

    return {
      endpoint: url,
      status: health.status,
      ready: health.status === "healthy" || health.status === "degraded",
      checkedAt,
      ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
      ...(health.info?.networkId !== undefined ? { networkId: health.info.networkId } : {}),
      ...(health.info?.virtualDaaScore !== undefined ? { virtualDaaScore: health.info.virtualDaaScore.toString() } : {}),
      ...(health.info?.serverVersion !== undefined ? { serverVersion: health.info.serverVersion } : {}),
      ...(health.info?.isSynced !== undefined ? { isSynced: health.info.isSynced } : {}),
      lastError: health.lastError,
      ...(health.retries !== undefined ? { retries: health.retries } : {}),
      ...(health.circuitState !== undefined ? { circuitState: health.circuitState } : {}),
      stale: health.stale
    };
  } catch (e: any) {
    return {
      endpoint: url,
      status: "unreachable",
      ready: false,
      checkedAt,
      error: e.message,
      lastError: e.message
    };
  }
}

export async function waitForKaspaRpcReady(options?: RpcReadinessWaitOptions): Promise<RpcHealthResult> {
  const intervalMs = options?.intervalMs || 1000;
  const maxWaitMs = options?.maxWaitMs || 60000;
  const start = Date.now();

  let lastResult: RpcHealthResult | undefined;

  while (Date.now() - start < maxWaitMs) {
    lastResult = await checkKaspaRpcHealth({ 
      url: options?.url, 
      timeoutMs: options?.timeoutMs 
    });

    if (lastResult.ready) {
      return lastResult;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return lastResult || {
    endpoint: options?.url || "http://127.0.0.1:18210",
    status: "unreachable",
    ready: false,
    checkedAt: new Date().toISOString(),
    error: "Timed out waiting for RPC to be ready"
  };
}
