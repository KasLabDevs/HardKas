import { RpcRequestNotSentError } from "@hardkas/kaspa-rpc";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { nodeNamesReceived } from "./official-signed-payload.js";
import { COUNTER_ADDR, fundingUtxo, transitionUtxo } from "./v1-corpus.js";

/*
 * F1.6 / phase 3 test seam: a stand-in rusty-kaspa 2.1.0 node for v1 sends (a UTXO set, a mempool that spends outpoints,
 * a virtual chain with accepting blocks, and the submit rules that matter: duplicate, double spend, orphan).
 */

const H = (n: number) => n.toString(16).padStart(64, "0");
export type Listed = ReturnType<typeof transitionUtxo> | ReturnType<typeof fundingUtxo>;

/** A stand-in rusty-kaspa 2.1.0 node: a UTXO set, a mempool that spends outpoints, a virtual chain. */
export class FakeNode {
  networkId = "simnet";
  sinkBlueScore = 5000n;
  virtualDaaScore = 1_000_000n;
  chain: Array<{ hash: string; blueScore: bigint; daaScore: bigint; accepted: string[] }> = [{ hash: H(1), blueScore: 5000n, daaScore: 1_000_000n, accepted: [] }];
  utxos: Listed[] = [];
  /** mempool: txId → the outpoints it spends (with the address they were listed at) */
  mempool = new Map<string, Array<{ outpoint: string; address: string }>>();
  submits: string[] = [];
  loseNextAnswer = false;
  dropNextRequest = false;
  answerOtherTxId = false;
  /** the next submission is answered with this rejection text ($TX = its id) */
  rejectNext: string | undefined;
  /** called between the check and the broadcast (a race: another transaction spends an input then) */
  beforeSubmit: (() => void) | undefined;
  /** this node does not show its mempool's spends to address queries (another node of the network, in effect) */
  mempoolHidden = false;
  get sink() {
    return this.chain[this.chain.length - 1]!.hash;
  }
  accepted(txId: string) {
    return this.chain.some((b) => b.accepted.includes(txId));
  }
  listed(address: string) {
    return this.utxos.filter((u) => u.address === address).map((u) => ({ ...u }));
  }
  /** The outputs of each accepted submission, listed once a block accepts it. */
  outputsOf = new Map<string, any[]>();
  /** A chain block accepts the transaction: its inputs leave the UTXO set, its outputs enter it. */
  mine(txId: string, depth = 120n) {
    const spent = this.mempool.get(txId) ?? [];
    this.utxos = this.utxos.filter((u) => !spent.some((s) => s.outpoint === `${u.outpoint.transactionId}:${u.outpoint.index}`));
    this.mempool.delete(txId);
    const k: any = loadManagedKaspaWasmSync();
    (this.outputsOf.get(txId) ?? []).forEach((o: any, index: number) => {
      const version = Number(o.scriptPublicKey.version ?? 0);
      const script = String(o.scriptPublicKey.scriptPublicKey);
      this.utxos.push({
        outpoint: { transactionId: txId, index },
        address: String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(version, script), "simnet")),
        amountSompi: BigInt(o.amount),
        scriptPublicKey: version.toString(16).padStart(4, "0") + script,
        ...(o.covenant ? { covenantId: o.covenant.covenantId } : {}),
        blockDaaScore: this.virtualDaaScore,
        isCoinbase: false
      } as any);
    });
    this.sinkBlueScore += 1n;
    this.virtualDaaScore += 1n;
    this.chain.push({ hash: H(this.chain.length + 1), blueScore: this.sinkBlueScore, daaScore: this.virtualDaaScore, accepted: [txId] });
    this.sinkBlueScore += depth;
    this.virtualDaaScore += depth;
  }
  /** Another transaction (not this workspace's) spends `outpoint` in this node's mempool. */
  spendElsewhere(outpoint: string, txId = "e".repeat(64)) {
    const u = this.utxos.find((x) => `${x.outpoint.transactionId}:${x.outpoint.index}` === outpoint);
    this.mempool.set(txId, [{ outpoint, address: u?.address ?? COUNTER_ADDR }]);
  }
  async submit(transaction: unknown): Promise<{ transactionId: string }> {
    const { transactionId: txId } = await nodeNamesReceived(transaction);
    this.submits.push(txId);
    if (this.dropNextRequest) {
      this.dropNextRequest = false;
      throw new RpcRequestNotSentError("submitTransaction was not sent: the connection was closed before the request was written");
    }
    this.beforeSubmit?.();
    this.beforeSubmit = undefined;
    if (this.rejectNext) {
      const text = this.rejectNext.replace(/\$TX/g, txId);
      this.rejectNext = undefined;
      throw new Error(text);
    }
    const tx = JSON.parse(String(transaction));
    const spends: Array<{ outpoint: string; address: string }> = tx.inputs.map((i: any) => {
      const outpoint = `${i.previousOutpoint.transactionId}:${i.previousOutpoint.index}`;
      return { outpoint, address: this.utxos.find((u) => `${u.outpoint.transactionId}:${u.outpoint.index}` === outpoint)?.address ?? "" };
    });
    // rusty-kaspa 2.1.0 mining/errors/src/mempool.rs: RejectDuplicate, RejectDisallowedOrphan, RejectDoubleSpendInMempool
    if (this.mempool.has(txId)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is already in the mempool`);
    for (const s of spends) {
      const other = [...this.mempool.entries()].find(([, ss]) => ss.some((x) => x.outpoint === s.outpoint));
      if (other) throw new Error(`Rejected transaction ${txId}: output ${s.outpoint} already spent by transaction ${other[0]} in the mempool`);
      if (!this.utxos.some((u) => `${u.outpoint.transactionId}:${u.outpoint.index}` === s.outpoint)) throw new Error(`Rejected transaction ${txId}: transaction ${txId} is an orphan where orphan is disallowed`);
    }
    this.mempool.set(txId, spends);
    this.outputsOf.set(txId, tx.outputs);
    if (this.loseNextAnswer) {
      this.loseNextAnswer = false;
      throw new Error("RPC request timed out after 30000ms (socket hang up)");
    }
    if (this.answerOtherTxId) {
      this.answerOtherTxId = false;
      return { transactionId: "f".repeat(64) };
    }
    return { transactionId: txId };
  }
  mempoolEntries(addresses: string[]) {
    if (this.mempoolHidden) return { entries: [] };
    return {
      entries: addresses.map((address) => ({
        address,
        sending: [...this.mempool.values()]
          .filter((ss) => ss.some((s) => s.address === address))
          .map((ss) => ({ transaction: { inputs: ss.map((s) => ({ previousOutpoint: { transactionId: s.outpoint.split(":")[0], index: Number(s.outpoint.split(":")[1]) } })) } })),
        receiving: []
      }))
    };
  }
  call(method: string, params: any): any {
    switch (method) {
      case "getBlockDagInfo":
        return { networkName: this.networkId, virtualDaaScore: this.virtualDaaScore.toString(), sink: this.sink, pruningPointHash: this.chain[0]!.hash };
      case "getServerInfo":
        return { networkId: this.networkId, serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true };
      case "getSinkBlueScore":
        return { blueScore: this.sinkBlueScore.toString() };
      case "getMempoolEntry": {
        if (!this.mempool.has(params.transactionId)) throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
        return { mempoolEntry: { isOrphan: false, fee: "300100" } };
      }
      case "getVirtualChainFromBlock": {
        const idx = this.chain.findIndex((b) => b.hash === params.startHash);
        if (idx < 0) throw Object.assign(new Error(`block ${params.startHash} not found`), { code: "RPC_NOT_FOUND" });
        const added = this.chain.slice(idx + 1);
        return {
          removedChainBlockHashes: [],
          addedChainBlockHashes: added.map((b) => b.hash),
          acceptedTransactionIds: added.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted }))
        };
      }
      case "getBlock": {
        const b = this.chain.find((x) => x.hash === params.hash);
        if (!b) throw Object.assign(new Error("block not found"), { code: "RPC_NOT_FOUND" });
        return { block: { header: { blueScore: b.blueScore.toString(), daaScore: b.daaScore.toString() } } };
      }
      default:
        throw new Error(`unscripted rpc ${method}`);
    }
  }
}

