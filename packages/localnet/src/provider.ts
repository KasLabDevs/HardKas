import type {
  KaspaRpcClient,
  KaspaNodeInfo,
  KaspaRpcHealth,
  KaspaAddressBalance,
  KaspaRpcUtxo,
  KaspaSubmitTransactionResult,
  MempoolEntry,
  BlockDagInfo,
  ServerInfo
} from "@hardkas/kaspa-rpc";
import { getAddressBalanceSompi, getSpendableUtxos } from "./balance.js";
import { loadLocalnetState, getDefaultLocalnetStatePath } from "./store.js";
import type { NetworkId } from "@hardkas/core";

export class LocalnetSimulatedProvider implements KaspaRpcClient {
  constructor(private readonly workspacePath: string) {}

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
      blockDaaScore: u.createdAtDaaScore,
      isCoinbase: false,
      scriptPublicKey: ""
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

  async submitTransaction(rawTransaction: string): Promise<KaspaSubmitTransactionResult> {
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
      serverVersion: "simulated",
      networkId: "simnet" as NetworkId,
      isSynced: true
    };
  }

  async close(): Promise<void> {
    // No-op
  }
}
