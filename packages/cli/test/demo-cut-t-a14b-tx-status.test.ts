import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { calculateContentHash, CURRENT_HASH_VERSION, TX_STATUS_POLICY_HARDKAS_DEFAULT_V1 } from "@hardkas/artifacts";
import { finalityDepthFor } from "@hardkas/core";
import { runTxStatus, renderTxStatusRows, stateHeadline, txStatusJson } from "../src/runners/tx-status-runner.js";
import { runTxWait } from "../src/runners/tx-wait-runner.js";

// Demo-cut step 2 · Wave 2(f) / T-A14b — the CLI surface of the Q4 model.
//   `tx status <txId>` and `tx wait <txId>` present what `sdk.tx.observe` /
//   `sdk.tx.status` derive from the workspace evidence (the same sealed
//   `txObservation.v1` artifacts) — no second state machine, no "Consensus Validated",
//   no "Settlement Proof", and FINALIZED only as "final according to the observed rule".

const TX = "1".repeat(64);
const H = (n: number) => n.toString(16).padStart(64, "0");
const FORBIDDEN = /Consensus Validated|Settlement Proof|performed by remote node|implies Kaspa consensus|irreversib/i;

class FakeNode {
  sinkBlueScore = 1000n;
  virtualDaaScore = 5000n;
  pruningPointHash = H(1);
  mempool = new Map<string, { isOrphan: boolean; fee: string }>();
  chain: Array<{ hash: string; blueScore: bigint; daaScore: bigint; accepted: string[] }> = [{ hash: H(1), blueScore: 1n, daaScore: 1n, accepted: [] }];
  removed: string[] = [];
  /** Demo-ready: whether the node's UTXO index already reflects TX (it can trail acceptance). */
  viewIndexed = true;
  utxoViewReads = 0;
  /** What getUtxosByAddress answers: once indexed, an output of TX for the address asked. */
  utxosByAddress(address: string) {
    this.utxoViewReads += 1;
    if (!this.viewIndexed) return [];
    return [{ outpoint: { transactionId: TX, index: 0 }, address, amountSompi: 100_000_000n, scriptPublicKey: "20" + "00".repeat(32) + "ac", blockDaaScore: 5000n, isCoinbase: false }];
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

describe("Demo-cut · T-A14b · tx status / tx wait present the derived Q4 state", () => {
  let ws: string;
  let sdk: any;
  let node: FakeNode;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dc-ta14b-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    node = new FakeNode();
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: "simnet", virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: "simnet", serverVersion: "2.0.1" }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    // Demo-ready: `tx wait` also reads the node's UTXO view once the target state is reached.
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: string) => node.utxosByAddress(address) as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  /** A recorded network submission for TX (the real-broadcast branch with a scripted node). */
  async function realSend(): Promise<void> {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed: any = await sdk.tx.sign(plan, "alice");
    const s: any = structuredClone(signed);
    delete s.authorization;
    s.signedTransaction = { format: "hex", payload: "deadbeef" };
    s.txId = TX;
    delete s.contentHash;
    s.lineage = { ...s.lineage, artifactId: "" };
    s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
    s.lineage.artifactId = s.contentHash;
    s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
    await sdk.artifacts.write(s);
    vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: TX } as any);
    const sent: any = await sdk.tx.send(s, "http://127.0.0.1:16110");
    expect(sent.submitted).toBe(true);
  }

  /**
   * The scripted submission above is recorded by a simulated-network SDK. Re-seal it as
   * what a simnet send records (network, mode, execution), or as a rejected submit, and
   * replace it in the store: a FULL v5 artifact the model accepts as evidence.
   */
  async function resealSubmission(mutate: (s: any) => void): Promise<string> {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    const file = path.join(dir, fs.readdirSync(dir).find((f) => f.startsWith("txSubmission-"))!);
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    mutate(s);
    delete s.contentHash;
    s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
    if (s.lineage) s.lineage.artifactId = s.contentHash; // exact-path self reference, excluded from the hash
    fs.unlinkSync(file);
    await sdk.artifacts.write(s);
    return s.contentHash;
  }
  const asSimnet = (s: any) => {
    s.networkId = "simnet";
    s.mode = "localnet";
    s.execution = { mode: "localnet", domain: "kaspa-l1", network: "simnet" };
  };

  const rowsText = (r: any) => Object.entries(renderTxStatusRows(r)).map(([k, v]) => `${k}: ${v ?? ""}`).join("\n");

  it("walks SUBMITTED → MEMPOOL_ACCEPTED → ACCEPTED(n) → CONFIRMED(n) → FINALIZED, each equal to sdk.tx.status, nothing asserted beyond it", async () => {
    await realSend();
    await resealSubmission(asSimnet); // simnet: the network whose finality depth is verified
    const submitted = await runTxStatus({ txId: TX, sdk, observe: false });
    expect(submitted.derived.status).toBe("SUBMITTED");
    expect(submitted.look.taken).toBe(false);
    expect(stateHeadline(submitted.derived)).toBe("SUBMITTED");

    node.mempool.set(TX, { isOrphan: false, fee: "1500" });
    const mempool = await runTxStatus({ txId: TX, sdk });
    expect(mempool.derived.status).toBe("MEMPOOL_ACCEPTED");
    expect(mempool.look.taken).toBe(true);
    expect(fs.existsSync(mempool.look.path!)).toBe(true);
    expect((await sdk.tx.status(TX)).status).toBe("MEMPOOL_ACCEPTED");

    node.mempool.delete(TX);
    node.advance(5n);
    node.addChainBlock(H(2), [TX]);
    node.advance(2n, 500n);
    const accepted = await runTxStatus({ txId: TX, sdk });
    expect(accepted.derived.status).toBe("ACCEPTED");
    expect(stateHeadline(accepted.derived)).toBe("ACCEPTED (2 blue-score confirmations; CONFIRMED at 100)");

    node.advance(98n);
    const confirmed = await runTxStatus({ txId: TX, sdk });
    expect(confirmed.derived.status).toBe("CONFIRMED");
    expect(stateHeadline(confirmed.derived)).toBe("CONFIRMED (100 blue-score confirmations ≥ 100)");
    const rows = renderTxStatusRows(confirmed);
    expect(rows["Accepting Block"]).toBe(H(2));
    expect(rows.Policy).toMatch(/hardkas\.txStatusPolicy\.default v1: CONFIRMED at ≥ 100 blue-score confirmations \(a HardKAS product default, not a Kaspa parameter\)/);
    expect(rows["Observed Through"]).toMatch(/observation obtained through the configured RPC observer \(obs_[0-9a-f]{64}\)/);
    expect(rows.Evidence).toMatch(/^submission [0-9a-f]{64} · 3 deciding observation\(s\)$/);
    expect(txStatusJson(confirmed)).toMatchObject({ ok: true, command: "tx status", state: "CONFIRMED", confirmations: { blue: "100", unit: "blue-score" } });
    // The CLI shows exactly the SDK's derivation.
    expect(JSON.stringify(confirmed.derived)).toBe(JSON.stringify(await sdk.tx.status(TX)));

    node.advance(BigInt(finalityDepthFor("simnet")!));
    const finalized = await runTxStatus({ txId: TX, sdk });
    expect(finalized.derived.status).toBe("FINALIZED");
    const finRows = renderTxStatusRows(finalized);
    expect(finRows.Finality).toMatch(/^final according to the observed Kaspa virtual-chain finality rule at sink blue score \d+ \(observer obs_[0-9a-f]{64}\); not a claim of irreversibility$/);

    for (const r of [submitted, mempool, accepted, confirmed]) expect(rowsText(r)).not.toMatch(FORBIDDEN);
    // FINALIZED's row names irreversibility only to disclaim it.
    expect(rowsText(finalized).replace("not a claim of irreversibility", "")).not.toMatch(FORBIDDEN);
  });

  it("REORGED, REJECTED_BY_NODE and INSUFFICIENT_EVIDENCE come straight from the model", async () => {
    await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [TX]);
    node.advance(1n);
    expect((await runTxStatus({ txId: TX, sdk })).derived.status).toBe("ACCEPTED");
    node.reorgOut(H(2));
    node.advance(1n);
    expect((await runTxStatus({ txId: TX, sdk })).derived.status).toBe("REORGED");

    const unknown = "e".repeat(64);
    const none = await runTxStatus({ txId: unknown, sdk, observe: false });
    expect(none.derived.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(renderTxStatusRows(none).Evidence).toMatch(/^no submission recorded in this workspace/);
  });

  it("a submission the node rejected is REJECTED_BY_NODE, and `tx wait` fails on it instead of waiting", async () => {
    // `send()` records a rejected submit under the txId the node answers, or "unknown"
    // (R-iii contract, unchanged here); the rejected submission is re-sealed under TX.
    await realSend();
    await resealSubmission((s) => {
      asSimnet(s);
      // the node's rejection as it arrives (rusty-kaspa's RejectedTransaction error; fixtures/toccata-v2 record real ones)
      s.submitResult = { accepted: false, error: `Rejected transaction ${TX}: transaction ${TX} is already in the mempool` };
    });
    expect((await runTxStatus({ txId: TX, sdk, observe: false })).derived.status).toBe("REJECTED_BY_NODE");
    const err: any = await runTxWait({ txId: TX, sdk, until: "accepted", timeoutMs: 10_000, intervalMs: 1, sleep: async () => undefined }).catch((e) => e);
    expect(err.code).toBe("TX_WAIT_FAILED");
    expect(err.exitCode).toBe(1);
  });

  it("CONFLICTING_OBSERVATIONS shows every observer's view", () => {
    const derived: any = {
      txId: TX,
      status: "CONFLICTING_OBSERVATIONS",
      policy: TX_STATUS_POLICY_HARDKAS_DEFAULT_V1,
      perObserver: [
        { observerId: "obs_a", status: "ACCEPTED", acceptingBlockHash: H(2), latestPoint: {}, observationArtifactIds: [], reasons: [] },
        { observerId: "obs_b", status: "NOT_ON_CHAIN", acceptingBlockHash: H(2), latestPoint: {}, observationArtifactIds: [], reasons: [] }
      ],
      observers: [],
      evidence: { observationArtifactIds: ["x", "y"], ignored: [] },
      reasons: ["observer_views_disagree: obs_a: ACCEPTED; obs_b: NOT_ON_CHAIN"],
      isFinal: false
    };
    const rows = renderTxStatusRows({ txId: TX, network: "simnet", derived, look: { taken: false, reason: "test" } });
    expect(rows.State).toBe("CONFLICTING_OBSERVATIONS");
    expect(rows["Per Observer"]).toBe(`obs_a: ACCEPTED (${H(2)}); obs_b: NOT_ON_CHAIN (${H(2)})`);
    expect(rows.Why).toMatch(/observer_views_disagree/);
  });

  it("`tx wait --until confirmed` follows the evidence to CONFIRMED, one persisted observation per look", async () => {
    await realSend();
    const script = [
      () => node.mempool.set(TX, { isOrphan: false, fee: "900" }),
      () => {
        node.mempool.delete(TX);
        node.advance(3n);
        node.addChainBlock(H(2), [TX]);
        node.advance(4n);
      },
      () => node.advance(96n)
    ];
    const lines: string[] = [];
    const r = await runTxWait({
      txId: TX,
      sdk,
      until: "confirmed",
      timeoutMs: 60_000,
      intervalMs: 1,
      onUpdate: (line) => lines.push(line),
      sleep: async () => void script.shift()?.()
    });
    expect(r.outcome).toBe("reached");
    expect(r.derived.status).toBe("CONFIRMED");
    expect(lines).toEqual([
      "SUBMITTED",
      "MEMPOOL_ACCEPTED",
      "ACCEPTED (4 blue-score confirmations; CONFIRMED at 100)",
      "CONFIRMED (100 blue-score confirmations ≥ 100)"
    ]);
    const observations = fs.readdirSync(path.join(ws, ".hardkas", "artifacts", "observations"));
    expect(observations).toHaveLength(r.looks);
    expect(r.lastObservationArtifactId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("`tx wait --until accepted` stops at ACCEPTED; a timeout names the last derived state and never claims confirmation", async () => {
    await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [TX]);
    node.advance(1n);
    const accepted = await runTxWait({ txId: TX, sdk, until: "accepted", timeoutMs: 5_000, intervalMs: 1, sleep: async () => undefined });
    expect(accepted.derived.status).toBe("ACCEPTED");

    let t = 0;
    const err: any = await runTxWait({
      txId: TX,
      sdk,
      until: "confirmed",
      timeoutMs: 3_000,
      intervalMs: 1_000,
      now: () => t,
      sleep: async (ms) => void (t += ms)
    }).catch((e) => e);
    expect(err.code).toBe("TX_WAIT_TIMEOUT");
    expect(err.message).toMatch(/last derived state: ACCEPTED \(1 blue-score confirmations; CONFIRMED at 100\)/);
    expect(err.message).not.toMatch(FORBIDDEN);
  });

  // Demo-ready · post-confirmation view: after the derived state reaches the target, `tx wait`
  // keeps going (bounded by --timeout) until the same node's UTXO view reflects the transaction
  // — an output of it listed for every address the plan pays, its spent inputs no longer listed
  // for the sender — so balances read afterwards are current. It is not a transaction state.
  it("`tx wait --until confirmed` returns only once the node's UTXO view reflects the transaction (a trailing view is waited out)", async () => {
    await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [TX]);
    node.advance(120n);
    node.viewIndexed = false;
    const script = [() => undefined, () => void (node.viewIndexed = true)];
    const r: any = await runTxWait({ txId: TX, sdk, until: "confirmed", timeoutMs: 60_000, intervalMs: 1, sleep: async () => void script.shift()?.() });
    expect(r.outcome).toBe("reached");
    expect(r.derived.status).toBe("CONFIRMED");
    expect(r.utxoView).toMatchObject({ checked: true, converged: true, looks: 3, missingOutputsFor: [], inputsStillListed: [] });
    expect(r.utxoView.addresses.length).toBeGreaterThan(0);
  });

  it("a UTXO view that never reflects the transaction fails explicitly and bounded, naming what is missing; the state stays CONFIRMED", async () => {
    await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [TX]);
    node.advance(120n);
    node.viewIndexed = false;
    let t = 0;
    const err: any = await runTxWait({
      txId: TX,
      sdk,
      until: "confirmed",
      timeoutMs: 3_000,
      intervalMs: 1_000,
      now: () => t,
      sleep: async (ms) => void (t += ms)
    }).catch((e) => e);
    expect(err.code).toBe("TX_WAIT_UTXO_VIEW_STALE");
    expect(err.exitCode).toBe(1);
    expect(err.message).toMatch(/CONFIRMED \(\d+ blue-score confirmations ≥ 100\) according to the recorded observations/);
    expect(err.message).toMatch(/UTXO view/);
    expect(err.message).toMatch(/no output of the transaction is listed for/);
    expect(err.message).not.toMatch(FORBIDDEN);
    expect(err.message).not.toMatch(/FINALIZED/);
    expect(t).toBeGreaterThanOrEqual(3_000); // bounded by --timeout, not open-ended
  });

  it("without a verifiable plan for the txId in this workspace the view is not checked, and the wait says so", async () => {
    await realSend();
    node.advance(1n);
    node.addChainBlock(H(2), [TX]);
    node.advance(120n);
    // The recorded submission names a plan this workspace does not hold (e.g. planned elsewhere).
    // (Deleting the plan file is not enough here: this SDK instance memoised the plan it wrote.)
    const absent = "f".repeat(64);
    await resealSubmission((s) => {
      s.fee = { ...(s.fee ?? {}), planArtifactId: absent };
      if (s.lineage) s.lineage.rootArtifactId = absent;
    });
    const reads = node.utxoViewReads;
    const r: any = await runTxWait({ txId: TX, sdk, until: "confirmed", timeoutMs: 5_000, intervalMs: 1, sleep: async () => undefined });
    expect(r.derived.status).toBe("CONFIRMED");
    expect(r.utxoView).toMatchObject({ checked: false, converged: false });
    expect(r.utxoView.reason).toMatch(/no verifiable plan/);
    expect(node.utxoViewReads).toBe(reads);
  });

  it("a simulator txId is SYNTHETIC_EXECUTED: status and wait say there is no network, and take no observation", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    const { receipt } = await sdk.tx.simulate(await sdk.tx.sign(plan, "alice"));
    const status = await runTxStatus({ txId: receipt.txId, sdk });
    expect(status.derived.status).toBe("SYNTHETIC_EXECUTED");
    expect(status.look).toMatchObject({ taken: false });
    const waited = await runTxWait({ txId: receipt.txId, sdk, until: "confirmed", timeoutMs: 1_000, intervalMs: 1 });
    expect(waited.outcome).toBe("synthetic");
    expect(fs.existsSync(path.join(ws, ".hardkas", "artifacts", "observations"))).toBe(false);
  });
});
