import { EvmJsonRpcClient, EvmJsonRpcClientOptions } from "./evm-rpc-client.js";

export interface EvmRpcHealthResult {
  readonly url: string;
  readonly ready: boolean;
  readonly checkedAt: string;
  readonly latencyMs?: number;
  readonly chainId?: number;
  readonly blockNumber?: bigint;
  readonly gasPriceWei?: bigint;
  readonly error?: string;
}

export async function checkEvmRpcHealth(options: EvmJsonRpcClientOptions): Promise<EvmRpcHealthResult> {
  const start = Date.now();
  const client = new EvmJsonRpcClient(options);

  try {
    const [chainId, blockNumber, gasPriceWei] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      client.getGasPriceWei()
    ]);

    const latencyMs = Date.now() - start;

    return {
      url: options.url,
      ready: true,
      checkedAt: new Date().toISOString(),
      latencyMs,
      chainId,
      blockNumber,
      gasPriceWei
    };
  } catch (e) {
    return {
      url: options.url,
      ready: false,
      checkedAt: new Date().toISOString(),
      error: e instanceof Error ? e.message : String(e)
    };
  }
}

export async function waitForEvmRpcReady(options: EvmJsonRpcClientOptions & {
  readonly intervalMs?: number;
  readonly maxWaitMs?: number;
}): Promise<EvmRpcHealthResult> {
  const interval = options.intervalMs ?? 1000;
  const maxWait = options.maxWaitMs ?? 60000;
  const start = Date.now();

  while (true) {
    const health = await checkEvmRpcHealth(options);
    if (health.ready) return health;

    if (Date.now() - start > maxWait) {
      return health; // Return last health even if not ready
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
