import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import * as waitRunner from "../src/runners/tx-wait-runner.js";
import { sendAsRpc } from "../../sdk/test/helpers/rpc-instance.js";
import { reissueAsBroadcastable, nodeNamesReceived } from "../../sdk/test/helpers/official-signed-payload.js";

const { runTxWait } = waitRunner;

// -----------------------------------------------------------------------------
// TX-WAIT-CHAINED-SPEND-1 (2026-10-21). Found by the TX-SEQUENCE-1 payroll on a real rusty-kaspad 2.1.0 simnet:
// payment 1 (CONFIRMED, 752 blue-score confirmations) ended `tx wait` with TX_WAIT_UTXO_VIEW_STALE after 301 s, because
// its change output had been spent by payment 3 of the same batch (a legitimate later spend). The UTXO-view barrier
// required an output of the transaction listed for EVERY address the plan pays, which a spent output never is again.
// Fixed: kaspad's UTXO index applies a transaction's spent inputs and its new outputs in one diff, so a view that lists
// an output of the transaction and none of its inputs has applied it; an output missing from that view was spent since
// (reported as `outputsNoLongerListed`). A view that lists none of its outputs proves nothing (a lagging, empty or
// rebuilding index), so the wait goes on and ends STALE as before; so it does while one of its inputs is still listed.
// The fake node's UTXO index behaves like kaspad's: before the transaction is applied it lists the sender's inputs;
// once applied, the inputs leave and the outputs appear together; a later transaction can spend any of them.
// -----------------------------------------------------------------------------

const H = (n: number) => n.toString(16).padStart(64, "0");

class FakeNode {
  sinkBlueScore = 1000n;
  virtualDaaScore = 5000n;
  pruningPointHash = H(1);
  mempool = new Map<string, { isOrphan: boolean; fee: string }>();
  chain: Array<{ hash: string; blueScore: bigint; daaScore: bigint; accepted: string[] }> = [{ hash: H(1), blueScore: 1n, daaScore: 1n, accepted: [] }];
  removed: string[] = [];
  /** The node's UTXO index: outpoint (`txId:index`) → the address it pays. */
  index = new Map<string, string>();
  utxoViewReads = 0;
  utxosByAddress(address: string) {
    this.utxoViewReads += 1;
    return [...this.index]
      .filter(([, owner]) => owner === address)
      .map(([key]) => ({
        outpoint: { transactionId: key.split(":")[0]!, index: Number(key.split(":")[1]) },
        address,
        amountSompi: 100_000_000n,
        scriptPublicKey: "20" + "00".repeat(32) + "ac",
        blockDaaScore: 5000n,
        isCoinbase: false
      }));
  }
  get sink() {
    return this.chain[this.chain.length - 1]!.hash;
  }
  advance(blue: bigint, daa: bigint = blue) {
    this.sinkBlueScore += blue;
    this.virtualDaaScore += daa;
  }
  addChainBlock(hash: string, accepted: string[] = []) {
    this.chain.push({ hash, blueScore: this.sinkBlueScore, daaScore: this.virtualDaaScore, accepted });
  }
  reorgOut(hash: string) {
    this.chain = this.chain.filter((b) => b.hash !== hash);
    this.removed.push(hash);
  }
  call(method: string, params: any): any {
    switch (method) {
      case "getBlockDagInfo":
        return { networkName: "simnet", virtualDaaScore: this.virtualDaaScore.toString(), sink: this.sink, pruningPointHash: this.pruningPointHash };
      case "getMempoolEntry": {
        const e = this.mempool.get(params.transactionId);
        if (!e) throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
        return { mempoolEntry: { isOrphan: e.isOrphan, fee: e.fee } };
      }
      case "getVirtualChainFromBlock": {
        const idx = this.chain.findIndex((b) => b.hash === params.startHash);
        if (idx < 0) {
          if (this.removed.includes(params.startHash)) {
            return {
              removedChainBlockHashes: [params.startHash],
              addedChainBlockHashes: this.chain.map((b) => b.hash),
              acceptedTransactionIds: this.chain.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted }))
            };
          }
          throw Object.assign(new Error(`block ${params.startHash} not found`), { code: "RPC_NOT_FOUND" });
        }
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

const keyOf = (o: { transactionId: string; index: number }) => `${o.transactionId}:${Number(o.index)}`;
/** What a plan pays, in the order the signed transaction carries it: its outputs, then its change. */
const paysOf = (plan: any): string[] => [...plan.outputs.map((o: any) => o.address), ...(plan.change ? [plan.change.address] : [])];

describe("TX-WAIT-CHAINED-SPEND-1 · `tx wait` and an output of the transaction spent after it", () => {
  let ws: string;
  let sdk: any;
  let node: FakeNode;
  let blocks = 10;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-twcs1-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    node = new FakeNode();
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: "simnet", serverVersion: "2.1.0" }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: string) => node.utxosByAddress(address) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  /** A recorded network submission of a real transaction (the real-broadcast branch, scripted node). */
  async function realSend(amount = "10"): Promise<{ txId: string; plan: any }> {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount });
    const signed: any = await sdk.tx.sign(plan, "alice");
    const s: any = reissueAsBroadcastable(signed, plan);
    await sdk.artifacts.write(s);
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(nodeNamesReceived as any);
    const sent: any = await sendAsRpc(sdk, s, "http://127.0.0.1:16110");
    expect(sent.submitted).toBe(true);
    return { txId: s.txId, plan };
  }

  /** The index lists the sender's inputs (what it shows before the transaction is applied). */
  const indexHolds = (plan: any) => {
    for (const i of plan.inputs) node.index.set(keyOf(i.outpoint), plan.from.address);
  };
  /** The index applies the transaction: its inputs leave and its outputs appear, in one diff. */
  const indexApplies = (txId: string, plan: any) => {
    for (const i of plan.inputs) node.index.delete(keyOf(i.outpoint));
    paysOf(plan).forEach((address, k) => node.index.set(`${txId}:${k}`, address));
  };
  /** A chain block accepts the transaction, and the chain grows past the confirmation policy. */
  const confirm = (txId: string) => {
    node.advance(1n);
    node.addChainBlock(H(++blocks), [txId]);
    node.advance(120n);
  };
  /** A bounded wait on a virtual clock (3 s, a look per second). */
  const boundedWait = (txId: string, until: "accepted" | "confirmed" = "confirmed") => {
    let t = 0;
    return runTxWait({ txId, sdk, until, timeoutMs: 3_000, intervalMs: 1_000, now: () => t, sleep: async (ms) => void (t += ms) }).catch((e) => e);
  };

  it("R1 · CONFIRMED with its change unspent: the wait returns once the view lists every output (unchanged)", async () => {
    const { txId, plan } = await realSend();
    indexHolds(plan);
    confirm(txId);
    indexApplies(txId, plan);
    const r: any = await boundedWait(txId);
    expect(r.outcome, String(r?.message)).toBe("reached");
    expect(r.derived.status).toBe("CONFIRMED");
    expect(r.utxoView).toMatchObject({ checked: true, converged: true, missingOutputsFor: [], inputsStillListed: [], looks: 1 });
    expect(r.utxoView.outputsNoLongerListed ?? []).toEqual([]);
  });

  it("R2 · CONFIRMED, its change spent later by another payment of the batch: the wait returns and says which output was spent since (it ended TX_WAIT_UTXO_VIEW_STALE)", async () => {
    const { txId, plan } = await realSend();
    indexHolds(plan);
    confirm(txId);
    indexApplies(txId, plan);
    // payment 3 of the batch spends this payment's change: the change leaves the index, payment 3's outputs appear
    const changeKey = `${txId}:${plan.outputs.length}`;
    expect(node.index.get(changeKey)).toBe(plan.change.address);
    const payment3 = H(0x3333);
    node.index.delete(changeKey);
    node.index.set(`${payment3}:0`, "kaspa:sim_dave");
    node.index.set(`${payment3}:1`, plan.from.address);
    const r: any = await boundedWait(txId);
    expect(r.code, String(r?.message)).toBeUndefined();
    expect(r.outcome).toBe("reached");
    expect(r.derived.status).toBe("CONFIRMED");
    expect(r.utxoView).toMatchObject({
      checked: true,
      converged: true,
      missingOutputsFor: [],
      inputsStillListed: [],
      outputsNoLongerListed: [plan.change.address]
    });
    expect(waitRunner.utxoViewRow(r.utxoView)).toMatch(/spent since/);
  });

  it("R2b · a recipient's output spent later, the change still unspent: the wait returns", async () => {
    const { txId, plan } = await realSend();
    indexHolds(plan);
    confirm(txId);
    indexApplies(txId, plan);
    node.index.delete(`${txId}:0`); // bob spent what he received
    node.index.set(`${H(0x4444)}:0`, "kaspa:sim_erin");
    const r: any = await boundedWait(txId);
    expect(r.code, String(r?.message)).toBeUndefined();
    expect(r.outcome).toBe("reached");
    expect(r.utxoView).toMatchObject({ converged: true, outputsNoLongerListed: [plan.outputs[0].address] });
  });

  describe("R3 · a chained batch: payment 2 is planned on payment 1's change", () => {
    const TX2 = H(0x2222);
    const PLAN2 = "c2".repeat(32);
    let plan2: any;

    /**
     * Test seam: payment 2's recorded submission and plan, as the barrier reads them (submission → its plan). Its state
     * is derived from the chain observations alone (this stand-in submission does not verify, so it decides nothing).
     */
    function recordPayment2(txId1: string, plan1: any) {
      plan2 = {
        from: { address: plan1.from.address },
        inputs: [{ outpoint: { transactionId: txId1, index: plan1.outputs.length }, amountSompi: plan1.change.amountSompi }],
        outputs: [{ address: "kaspa:sim_carol", amountSompi: "200000000" }],
        change: { address: plan1.change.address, amountSompi: "100000000" }
      };
      const read = sdk.artifacts.read.bind(sdk.artifacts);
      vi.spyOn(sdk.artifacts, "read").mockImplementation(async (lookup: any, options?: any) => {
        if (lookup?.tx === TX2) return { fee: { planArtifactId: PLAN2 } };
        if (lookup?.artifact === PLAN2) return plan2;
        return read(lookup, options);
      });
    }

    it("R3a · both applied by the index: waiting on payment 1 returns (its change was spent by payment 2), and so does waiting on payment 2", async () => {
      const { txId: tx1, plan: plan1 } = await realSend();
      recordPayment2(tx1, plan1);
      indexHolds(plan1);
      confirm(tx1);
      confirm(TX2);
      indexApplies(tx1, plan1);
      indexApplies(TX2, plan2);
      const r1: any = await boundedWait(tx1);
      expect(r1.code, String(r1?.message)).toBeUndefined();
      expect(r1.utxoView).toMatchObject({ converged: true, outputsNoLongerListed: [plan1.change.address] });
      const r2: any = await boundedWait(TX2);
      expect(r2.code, String(r2?.message)).toBeUndefined();
      expect(r2.derived.status).toBe("CONFIRMED");
      expect(r2.utxoView).toMatchObject({ checked: true, converged: true, missingOutputsFor: [], inputsStillListed: [] });
      expect(r2.utxoView.outputsNoLongerListed ?? []).toEqual([]);
    });

    it("R3b · the index lags behind both: payment 2's input (payment 1's change) is not listed yet only because the index never showed it — the wait does NOT stop there; it returns once the index applied payment 2", async () => {
      const { txId: tx1, plan: plan1 } = await realSend();
      recordPayment2(tx1, plan1);
      indexHolds(plan1);
      confirm(tx1);
      confirm(TX2);
      // look 1: neither applied (payment 1's change was never listed; no output of payment 2 is listed)
      // look 2: payment 1 applied (its change, payment 2's input, is listed for the sender)
      // look 3: payment 2 applied
      const script = [() => indexApplies(tx1, plan1), () => indexApplies(TX2, plan2)];
      const r: any = await runTxWait({ txId: TX2, sdk, until: "confirmed", timeoutMs: 60_000, intervalMs: 1, sleep: async () => void script.shift()?.() });
      expect(r.outcome).toBe("reached");
      expect(r.utxoView).toMatchObject({ converged: true, looks: 3, missingOutputsFor: [], inputsStillListed: [] });
    });
  });

  it("R4 · a txId with no submission that no look finds: TX_WAIT_TIMEOUT, and the UTXO view is never read", async () => {
    const reads = node.utxoViewReads;
    const err: any = await boundedWait("e".repeat(64), "accepted");
    expect(err.code).toBe("TX_WAIT_TIMEOUT");
    expect(node.utxoViewReads).toBe(reads);
  });

  it("R5 · accepted but not yet confirmed: `--until confirmed` times out naming ACCEPTED, and the UTXO view is never read", async () => {
    const { txId, plan } = await realSend();
    indexHolds(plan);
    node.advance(1n);
    node.addChainBlock(H(++blocks), [txId]);
    node.advance(1n);
    indexApplies(txId, plan);
    const reads = node.utxoViewReads;
    const err: any = await boundedWait(txId);
    expect(err.code).toBe("TX_WAIT_TIMEOUT");
    expect(err.message).toMatch(/last derived state: ACCEPTED/);
    expect(node.utxoViewReads).toBe(reads);
  });

  it("R6 · a stale view (the index has not applied the transaction: its inputs still listed, no output of it): TX_WAIT_UTXO_VIEW_STALE, bounded; the state stays CONFIRMED", async () => {
    const { txId, plan } = await realSend();
    indexHolds(plan);
    confirm(txId);
    const err: any = await boundedWait(txId);
    expect(err.code).toBe("TX_WAIT_UTXO_VIEW_STALE");
    expect(err.message).toMatch(/CONFIRMED/);
    expect(err.message).toMatch(/no output of the transaction is listed for/);
    expect(err.message).toMatch(/input\(s\) it spent are still listed for the sender/);
  });

  it("R6b · an inconsistent view (an output listed while an input is still listed): still STALE", async () => {
    const { txId, plan } = await realSend();
    indexHolds(plan);
    confirm(txId);
    node.index.set(`${txId}:0`, plan.outputs[0].address);
    const err: any = await boundedWait(txId);
    expect(err.code).toBe("TX_WAIT_UTXO_VIEW_STALE");
    expect(err.message).toMatch(/input\(s\) it spent are still listed for the sender/);
  });

  it("R6c · an index that lists nothing at all (empty or rebuilding): STALE — no input listed is not, by itself, proof the transaction was applied", async () => {
    const { txId } = await realSend();
    confirm(txId);
    const err: any = await boundedWait(txId);
    expect(err.code).toBe("TX_WAIT_UTXO_VIEW_STALE");
    expect(err.message).toMatch(/no output of the transaction is listed for/);
  });

  it("R7 · reorged out: the wait never reaches the target and times out naming REORGED; the UTXO view is never read", async () => {
    const { txId, plan } = await realSend();
    indexHolds(plan);
    node.advance(1n);
    const accepting = H(++blocks);
    node.addChainBlock(accepting, [txId]);
    node.advance(1n);
    indexApplies(txId, plan);
    const first: any = await runTxWait({ txId, sdk, until: "accepted", timeoutMs: 5_000, intervalMs: 1, sleep: async () => undefined });
    expect(first.derived.status).toBe("ACCEPTED");
    node.reorgOut(accepting);
    node.advance(1n);
    const reads = node.utxoViewReads;
    const err: any = await boundedWait(txId, "accepted");
    expect(err.code).toBe("TX_WAIT_TIMEOUT");
    expect(err.message).toMatch(/last derived state: REORGED/);
    expect(node.utxoViewReads).toBe(reads);
  });
});
