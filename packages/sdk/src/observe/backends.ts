import { Hardkas } from "../index.js";
import { AddressObservationSnapshot, HardkasObserverBackend } from "./types.js";
import { executionModeSchema, kaspaNetworkIdSchema } from "@hardkas/core";

export class RpcObserverBackend implements HardkasObserverBackend {
  constructor(
    private sdk: Hardkas,
    private execution: AddressObservationSnapshot["execution"]
  ) {}

  async observeAddress(address: string): Promise<AddressObservationSnapshot> {
    let mempoolRes: any = null;
    try {
      mempoolRes = await Promise.race([
        this.sdk.rpc.call("getMempoolEntriesByAddressesRequest", {
          addresses: [address],
          includeOrphanPool: false,
          filterTransactionPool: false
        }).catch(() => null),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Mempool timeout")), 2000))
      ]);
    } catch (e) {
      // Ignore mempool timeouts or unsupported errors
    }

    let utxosRes: any;
    let dagInfo: any;
    try {
      utxosRes = await this.sdk.rpc.call("getUtxosByAddressesRequest", {
        addresses: [address]
      }) as any;

      dagInfo = await this.sdk.rpc.getBlockDagInfo();
    } catch (e: any) {
      if (
        e.message?.includes("fetch failed") ||
        e.message?.includes("ECONNREFUSED") ||
        e.message?.includes("closed") ||
        e.message?.includes("WebSocket") ||
        e.code === "ECONNREFUSED"
      ) {
        const error = new Error("RPC node is unavailable.");
        (error as any).code = "OBSERVATION_RPC_UNAVAILABLE";
        throw error;
      }
      throw e;
    }

    const incoming: any[] = [];
    const outgoing: any[] = [];

    let mempoolIncomingSompi = 0n;
    let acceptedUtxoSompi = 0n;

    const mEntries = mempoolRes ? (mempoolRes.entries || mempoolRes.mempoolEntries) : null;
    if (mEntries && Array.isArray(mEntries)) {
      for (const item of mEntries) {
        if (!item) continue;

        // 1. Handle address-scoped RpcMempoolEntryByAddress structure ({ address, receiving, sending })
        if (Array.isArray(item.receiving) || Array.isArray(item.sending)) {
          for (const rxItem of (item.receiving || [])) {
            const tx = rxItem?.transaction || rxItem;
            const txId = tx?.verboseData?.transactionId || tx?.id || rxItem?.transactionId || "unknown";
            let sompi = 0n;
            for (const out of (tx?.outputs || [])) {
              if (out.verboseData?.scriptPublicKeyAddress === address) {
                sompi += BigInt(out.value || out.amount || 0);
              }
            }
            incoming.push({ transactionId: txId, sompi: sompi.toString() });
            mempoolIncomingSompi += sompi;
          }

          for (const txItem of (item.sending || [])) {
            const tx = txItem?.transaction || txItem;
            const txId = tx?.verboseData?.transactionId || tx?.id || txItem?.transactionId || "unknown";
            outgoing.push({ transactionId: txId, sompi: "0" });
          }
          continue;
        }

        // 2. Handle global getMempoolEntries structure ({ transaction })
        const tx = item.transaction || item;
        if (!tx) continue;

        let isIncoming = false;
        let isOutgoing = false;
        let incomingSompi = 0n;

        if (tx.inputs || tx.outputs) {
          for (const out of (tx.outputs || [])) {
            if (out.verboseData?.scriptPublicKeyAddress === address) {
              isIncoming = true;
              incomingSompi += BigInt(out.value || out.amount || 0);
            }
          }
          if (!isIncoming) {
            isOutgoing = true;
          }
        }

        const observedTx = {
          transactionId: tx.verboseData?.transactionId || tx.id || "unknown",
          sompi: incomingSompi.toString()
        };

        if (isIncoming) {
          incoming.push(observedTx);
          mempoolIncomingSompi += incomingSompi;
        } else if (isOutgoing) {
          outgoing.push(observedTx);
        }
      }
    }

    const utxos: any[] = [];
    if (utxosRes && utxosRes.entries) {
      for (const u of utxosRes.entries) {
        const sompi = BigInt(u.utxoEntry?.amount || 0);
        utxos.push({
          transactionId: u.outpoint?.transactionId,
          index: u.outpoint?.index,
          sompi: sompi.toString(),
          scriptPublicKey: u.utxoEntry?.scriptPublicKey?.scriptPublicKey,
          blockDaaScore: u.utxoEntry?.blockDaaScore?.toString()
        });
        acceptedUtxoSompi += sompi;
      }
    }

    return {
      address,
      execution: this.execution,
      mempool: {
        incoming: incoming as any,
        outgoing: outgoing as any
      },
      utxos: utxos as any,
      totals: {
        mempoolIncomingSompi,
        acceptedUtxoSompi
      },
      virtual: {
        daaScore: BigInt(dagInfo.virtualDaaScore || 0)
      },
      observedAt: new Date()
    };
  }
}

export class SimulatorObserverBackend implements HardkasObserverBackend {
  constructor(
    private sdk: Hardkas,
    private execution: AddressObservationSnapshot["execution"]
  ) {}

  async observeAddress(address: string): Promise<AddressObservationSnapshot> {
    // For simulator, we rely on the Localnet state just like tx.ts does for planning
    const { loadOrCreateLocalnetState, getSpendableUtxos, getMempoolTxs } = await import("@hardkas/localnet") as any;
    const localState = await loadOrCreateLocalnetState({ cwd: this.sdk.workspace.root });
    
    const unspent = getSpendableUtxos(localState, address);
    
    // Minimal mock for mempool if getMempoolTxs exists, otherwise empty
    let mempoolIncomingSompi = 0n;
    let acceptedUtxoSompi = 0n;
    const incoming: any[] = [];
    const outgoing: any[] = [];

    if (typeof getMempoolTxs === "function") {
       const mPool = getMempoolTxs(localState);
       // Filter for address... (mocked)
    }

    const utxos = unspent.map((u: any) => {
      const parts = u.id.split(":");
      const index = Number(parts[parts.length - 1]);
      const transactionId = parts.slice(0, -1).join(":");
      const sompi = BigInt(u.amountSompi);
      acceptedUtxoSompi += sompi;
      return {
        transactionId,
        index,
        sompi: sompi.toString(),
        blockDaaScore: "0" // Simulator doesn't track this accurately yet
      };
    });

    return {
      address,
      execution: this.execution,
      mempool: { incoming: incoming as any, outgoing: outgoing as any },
      utxos: utxos as any,
      totals: {
        mempoolIncomingSompi,
        acceptedUtxoSompi
      },
      virtual: {
        daaScore: 0n
      },
      observedAt: new Date()
    };
  }
}

export function resolveObserverBackend(
  sdk: Hardkas, 
  target?: string
): HardkasObserverBackend {
  // Resolve execution target
  let mode = "rpc";
  let domain = "kaspa-l1";
  let network = target || sdk.config.config.defaultNetwork || "simnet";

  const networkConfig = sdk.config.config.networks?.[network];
  
  if (networkConfig?.kind === "simulated" || network === "simulated") {
    mode = "simulator";
  } else if (networkConfig?.kind === "kaspa-node") {
    mode = "localnet";
  }

  const execution = { mode: mode as any, domain: domain as any, network: network as any };

  if (mode === "simulator") {
    console.log("[DEBUG] Using SimulatorObserverBackend for network", network);
    return new SimulatorObserverBackend(sdk, execution);
  } else {
    // Both localnet and external RPC use the RpcObserverBackend, 
    // because localnet runs a real rusty-kaspad node accessible via RPC.
    console.log("[DEBUG] Using RpcObserverBackend for network", network);
    return new RpcObserverBackend(sdk, execution);
  }
}
