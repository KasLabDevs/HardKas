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
        this.sdk.rpc.call("getMempoolEntriesRequest", {
          includeOrphanPool: false,
          filterTransactionPool: false
        }).catch(e => null),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Mempool timeout")), 2000))
      ]);
    } catch (e) {
      // Ignore mempool timeouts or unsupported errors
    }

    const utxosRes = await this.sdk.rpc.call("getUtxosByAddressesRequest", {
      addresses: [address]
    }) as any;

    const dagInfo = await this.sdk.rpc.getBlockDagInfo();

    const incoming: any[] = [];
    const outgoing: any[] = [];

    let mempoolIncomingSompi = 0n;
    let acceptedUtxoSompi = 0n;

    const mEntries = mempoolRes ? (mempoolRes.entries || mempoolRes.mempoolEntries) : null;
    if (mEntries && Array.isArray(mEntries)) {
      for (const entry of mEntries) {
        const tx = entry.transaction;
        let isIncoming = false;
        let isOutgoing = false;
        let incomingSompi = 0n;

        if (tx.inputs) {
           // Without full tx info it's hard to know if we are sending,
           // but the Kaspa RPC getMempoolEntriesByAddresses returns entries related to the address.
           // In Rusty Kaspa, if it's in the response, it's either sending or receiving.
           // We will map based on outputs. If we find our address in outputs, it's incoming.
           // If we don't, it must be outgoing.
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
          transactionId: tx.verboseData?.transactionId || tx.id,
          sompi: incomingSompi.toString() // We store the received amount or 0 for outgoing
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
