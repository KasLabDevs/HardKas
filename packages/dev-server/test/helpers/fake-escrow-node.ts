import crypto from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

/*
 * ESCROW-SAFETY-2 test seam: a stand-in of the official kaspa-wasm client for the escrow routes (escrowNode.rpcFactory),
 * answering the methods the routes and the SDK's observer call. A UTXO set by address, a mempool (its spends and the
 * transactions it holds), the chain block that accepts transactions, and the submit outcomes that matter: accepted, the
 * node's own refusal, and an answer that leaves the outcome unknown. No network.
 */

export const H = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const SINK = H("es2 sink");
export const ACCEPTING = H("es2 accepting block");
const PRUNING = H("es2 pruning point");

export type FakeUtxo = { outpoint: { transactionId: string; index: number }; address: string; amount: bigint; spk: string; daa: bigint };
export type FakeEscrowNode = {
  network: string;
  utxos: FakeUtxo[];
  /** "txid:index" outpoints a transaction in the node's mempool spends */
  mempoolSpends: string[];
  failMempool: boolean;
  submit: "accept" | "already" | "reject";
  /** a chain block accepts each transaction as soon as the node takes it */
  acceptOnSubmit: boolean;
  inMempool: Set<string>;
  accepted: Set<string>;
  calls: string[];
  submitted: Array<{ id: string; inputs: string[] }>;
};

export function fakeEscrowNode(): FakeEscrowNode {
  return { network: "simnet", utxos: [], mempoolSpends: [], failMempool: false, submit: "accept", acceptOnSubmit: false, inMempool: new Set(), accepted: new Set(), calls: [], submitted: [] };
}

/** The official client's wording for an error the node returned. */
export const nodeError = (message: string) => new Error(`RPC Server (remote error) -> code:0  message:\`${message}\` data:None`);

/** An official client factory answering from `n`. */
export function factoryOf(n: FakeEscrowNode) {
  const k: any = loadManagedKaspaWasmSync();
  const handlers: Record<string, (r: any) => unknown> = {
    getServerInfo: () => ({ networkId: n.network, serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true, virtualDaaScore: 5_000_000n }),
    getBlockDagInfo: () => ({ network: n.network, virtualDaaScore: 5_000_000n, sink: SINK, tipHashes: [SINK], virtualParentHashes: [SINK], pruningPointHash: PRUNING }),
    getSinkBlueScore: () => ({ blueScore: 5_000_100n }),
    getUtxosByAddresses: (r) => ({
      entries: n.utxos
        .filter((u) => r.addresses.includes(u.address))
        .map((u) => ({ address: u.address, outpoint: u.outpoint, utxoEntry: { amount: u.amount, scriptPublicKey: u.spk, blockDaaScore: u.daa, isCoinbase: false } }))
    }),
    getMempoolEntriesByAddresses: (r) => {
      if (n.failMempool) throw nodeError("the mempool cannot be read now");
      return {
        entries: r.addresses.map((address: string) => ({
          address,
          sending: n.mempoolSpends
            .filter((o) => n.utxos.some((u) => u.address === address && `${u.outpoint.transactionId}:${u.outpoint.index}` === o))
            .map((o) => ({ transaction: { inputs: [{ previousOutpoint: { transactionId: o.split(":")[0], index: Number(o.split(":")[1]) } }] } })),
          receiving: []
        }))
      };
    },
    submitTransaction: (r) => {
      const id = String(new k.Transaction(r.transaction).id);
      n.submitted.push({ id, inputs: r.transaction.inputs.map((i: any) => `${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`) });
      if (n.submit === "already") throw nodeError(`Rejected transaction ${id}: transaction ${id} is already in the mempool`);
      if (n.submit === "reject") throw nodeError(`Rejected transaction ${id}: transaction ${id} is an orphan where orphan is disallowed`);
      n.inMempool.add(id);
      if (n.acceptOnSubmit) n.accepted.add(id);
      return { transactionId: id };
    },
    getMempoolEntry: (r) => {
      if (!n.inMempool.has(r.transactionId) || n.accepted.has(r.transactionId)) throw nodeError(`transaction ${r.transactionId} not found`);
      return { mempoolEntry: { fee: 1000n, isOrphan: false } };
    },
    getVirtualChainFromBlock: (r) =>
      r.startHash === SINK && n.accepted.size > 0
        ? { removedChainBlockHashes: [], addedChainBlockHashes: [ACCEPTING], acceptedTransactionIds: [{ acceptingBlockHash: ACCEPTING, acceptedTransactionIds: [...n.accepted] }] }
        : { removedChainBlockHashes: [], addedChainBlockHashes: [], acceptedTransactionIds: [] },
    getBlock: (r) => {
      if (r.hash !== ACCEPTING) throw nodeError(`block ${r.hash} not found`);
      return { block: { header: { hash: ACCEPTING, blueScore: 5_000_050n, daaScore: 4_999_990n } } };
    }
  };
  return (_url: string) => {
    let connected = false;
    const base: Record<string, unknown> = {
      get isConnected() {
        return connected;
      },
      async connect() {
        connected = true;
      },
      async disconnect() {
        connected = false;
      },
      addEventListener() {},
      removeEventListener() {}
    };
    return new Proxy(base, {
      get(target, prop) {
        if (typeof prop === "string" && prop in target) return (target as any)[prop];
        if (typeof prop === "string" && Object.prototype.hasOwnProperty.call(handlers, prop)) {
          return async (request: unknown) => {
            n.calls.push(prop);
            return handlers[prop]!(request);
          };
        }
        return undefined;
      }
    }) as any;
  };
}
