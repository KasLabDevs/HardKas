import { KaspaRpcClient } from "@hardkas/kaspa-rpc";
import { LocalnetState, LocalnetUtxo } from "./types.js";
import { NetworkId, ExecutionMode } from "@hardkas/core";
import { ARTIFACT_SCHEMAS, HARDKAS_VERSION, ARTIFACT_VERSION } from "@hardkas/artifacts";

export interface ForkOptions {
  network: string;
  rpcUrl: string;
  addresses: string[];
  atDaaScore?: string;
}

export async function forkFromNetwork(rpc: KaspaRpcClient, opts: ForkOptions): Promise<LocalnetState> {
  const info = await rpc.getInfo();
  const networkId = (info.networkId as NetworkId) || opts.network as NetworkId;
  const currentDaaScore = info.virtualDaaScore?.toString() || "0";
  const targetDaaScore = opts.atDaaScore || currentDaaScore;

  const utxos: LocalnetUtxo[] = [];
  
  for (const address of opts.addresses) {
    const rpcUtxos = await rpc.getUtxosByAddress(address);
    for (const u of rpcUtxos) {
      utxos.push({
        id: `${u.outpoint.transactionId}:${u.outpoint.index}`,
        address: u.address,
        amountSompi: u.amountSompi.toString(),
        spent: false,
        createdAtDaaScore: u.blockDaaScore?.toString() || "0"
      });
    }
  }

  const state: LocalnetState = {
    schema: ARTIFACT_SCHEMAS.LOCALNET_STATE,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: "sha256-canonical",
    mode: "simulated" as ExecutionMode,
    createdAt: new Date().toISOString(),
    networkId,
    daaScore: targetDaaScore,
    accounts: opts.addresses.map((addr, i) => ({
      name: `forked_${i}`,
      address: addr
    })),
    utxos,
    forkSource: {
      network: opts.network,
      rpcUrl: opts.rpcUrl,
      daaScore: targetDaaScore,
      forkedAt: new Date().toISOString(),
      addresses: opts.addresses
    }
  };

  return state;
}
