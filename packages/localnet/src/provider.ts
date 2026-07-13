import type {
  KaspaRpcClient,
  KaspaNodeInfo,
  KaspaRpcHealth,
  KaspaAddressBalance,
  KaspaRpcUtxo,
  KaspaSubmitTransactionResult,
  MempoolEntry,
  BlockDagInfo,
  ServerInfo,
  KaspaSubscription,
  UtxosChangedEvent,
  KaspaRpcTransaction
} from "@hardkas/kaspa-rpc";
import { getAddressBalanceSompi, getSpendableUtxos } from "./balance.js";
import { loadLocalnetState, getDefaultLocalnetStatePath } from "./store.js";
import type { NetworkId } from "@hardkas/core";

export class LocalnetSimulatedProvider implements KaspaRpcClient {
  constructor(private readonly workspacePath: string) {}

  async call<TResponse = unknown>(method: string, params?: any): Promise<TResponse> {
    return null as TResponse;
  }

  on(event: string, handler: (data: any) => void): void {}
  off(event: string, handler: (data: any) => void): void {}

  async getInfo(): Promise<KaspaNodeInfo> {
    return {
      serverVersion: "hardkas-simulated-1.0.0",
      isSynced: true,
      isUtxoIndexed: true,
      p2pId: "simulated-node-1"
    };
  }

  async healthCheck(): Promise<KaspaRpcHealth> {
    return {
      endpoint: "simulated://local",
      status: "healthy",
      latencyMs: 1,
      circuitState: "closed",
      stale: false,
      info: await this.getInfo(),
      reachable: true
    };
  }

  async getBalanceByAddress(address: string): Promise<KaspaAddressBalance> {
    const statePath = getDefaultLocalnetStatePath(this.workspacePath);
    const state = await loadLocalnetState(statePath);
    if (!state) {
      return { address, balanceSompi: 0n };
    }
    const balance = getAddressBalanceSompi(state, address);
    return {
      address,
      balanceSompi: balance
    };
  }

  async getBalancesByAddresses(addresses: string[]): Promise<KaspaAddressBalance[]> {
    const statePath = getDefaultLocalnetStatePath(this.workspacePath);
    const state = await loadLocalnetState(statePath);
    if (!state) {
      return addresses.map((address) => ({ address, balanceSompi: 0n }));
    }
    return addresses.map((address) => ({
      address,
      balanceSompi: getAddressBalanceSompi(state, address)
    }));
  }

  async getUtxosByAddress(address: string): Promise<KaspaRpcUtxo[]> {
    const statePath = getDefaultLocalnetStatePath(this.workspacePath);
    const state = await loadLocalnetState(statePath);
    if (!state) return [];

    const utxos = getSpendableUtxos(state, address);
    return utxos.map((u) => ({
      address: u.address,
      amountSompi: BigInt(u.amountSompi),
      outpoint: {
        transactionId: u.id.split(":")[1] || "unknown",
        index: Number(u.id.split(":")[2]) || 0
      },
      blockDaaScore: u.createdAtDaaScore ? BigInt(u.createdAtDaaScore) : 0n,
      isCoinbase: u.id.startsWith("coinbase:"),
      scriptPublicKey: "200000000000000000000000000000000000000000000000000000000000000000ac"
    }));
  }

  async getUtxosByAddresses(addresses: string[]): Promise<any> {
    const allUtxos: KaspaRpcUtxo[] = [];
    for (const address of addresses) {
      const utxos = await this.getUtxosByAddress(address);
      allUtxos.push(...utxos);
    }
    return { entries: allUtxos };
  }

  async getBlocks(options?: { includeBlocks?: boolean; includeTransactions?: boolean }): Promise<any> {
    return { blockHashes: [], blocks: [] };
  }

  async submitTransaction(transaction: KaspaRpcTransaction | any, options?: any): Promise<KaspaSubmitTransactionResult> {
    throw new Error(
      "submitTransaction not implemented on SimulatedProvider. Use sdk.tx.simulate instead."
    );
  }

  async getMempoolEntry(txId: string): Promise<MempoolEntry | null> {
    return null;
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    return null;
  }

  async getBlockDagInfo(): Promise<BlockDagInfo> {
    return {
      networkId: "simnet" as NetworkId,
      virtualDaaScore: 1n,
      tipHashes: []
    };
  }

  async getServerInfo(): Promise<ServerInfo> {
    return {
      networkId: "simnet" as NetworkId,
      serverVersion: "hardkas-localnet-mock",
      isSynced: true
    };
  }

  async subscribeToUtxosChanged(addresses: readonly string[], handler: (event: UtxosChangedEvent) => void): Promise<KaspaSubscription> {
    let closed = false;
    return {
      id: "simulated_sub",
      get closed() { return closed; },
      unsubscribe: async () => { closed = true; }
    };
  }

  async getFeeEstimate(): Promise<any> { throw new Error("Not implemented"); }
  async getFeeEstimateExperimental(): Promise<any> { throw new Error("Not implemented"); }
  async getMempoolEntries(): Promise<any> { return []; }
  async getMempoolEntriesByAddresses(addresses: string[]): Promise<any> { return []; }
  async getConnectedPeerInfo(): Promise<any[]> { return []; }
  async getPeerAddresses(): Promise<any[]> { return []; }
  async getCurrentNetwork(): Promise<any> { return { networkId: "simnet" }; }
  async getSink(): Promise<any> { return { sink: "mock-sink" }; }
  async getSinkBlueScore(): Promise<any> { return { blueScore: 0n }; }
  async getVirtualSelectedParentChainFromBlock(startHash: string, includeAcceptedTransactionIds?: boolean): Promise<any> { return {}; }
  async getVirtualSelectedParentBlueScore(): Promise<any> { return { blueScore: 0n }; }
  async estimateNetworkHashesPerSecond(windowSize?: number, startHash?: string): Promise<any> { return { networkHashesPerSecond: 0n }; }
  async getSyncStatus(): Promise<any> { return { isSynced: true }; }
  async getCoinSupply(): Promise<any> { return { maxCoinSupply: 0n, circulatingCoinSupply: 0n }; }
  async getHeaders(): Promise<any> { return { headers: [] }; }

  async close(): Promise<void> {
    // No-op
  }
}
