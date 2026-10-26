import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import { RpcRequestNotSentError } from "@hardkas/kaspa-rpc";
import { calculateContentHash, CURRENT_HASH_VERSION, nodeRejectionOf, submitOutcomeOf } from "@hardkas/artifacts";
import {
  COUNTER_ADDR,
  COVENANT_ID,
  FIXTURE,
  GENESIS_TX,
  SUCCESSOR_ADDR,
  engineSigned,
  fundingUtxo,
  genesisBody,
  sealV1Plan,
  transitionBody,
  transitionUtxo,
  v1CorpusFacts
} from "./helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// F1.6 · sdk.tx.send for v1 transactions (Silver and covenants), against a stand-in node. The payment send's guarantees
// are reused as they are (mainnet, identity, endpoint, plan match, fee limit, expected txid, txid lock, record,
// SUBMIT_NOT_SENT, accepted only when the answer names the txid); v1 adds: no send without the verified plan, the v1
// fields compared, a read-only check of the inputs and F1.4 again right before the broadcast, a lock per covenant, no
// second transition of a covenant while one is pending (unless explicitly replaced), and typed rejections. Each scenario
// counts the node's submissions (0 unplanned, 0 re-sends) and the workspace's submission records (0 for a refusal before
// the broadcast, exactly 1 for each broadcast attempted).
// Plans and signatures come from the v1 engine over the Silver corpus Counter (facts from the corpus artifacts).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const H = (n: number) => n.toString(16).padStart(64, "0");

async function outcome(p: Promise<unknown>) {
  try {
    return { result: (await p) as any, error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
}

/** A re-sealed copy of a signed artifact with another payload (and, unless kept, the payload's own id). */
function resealed(signed: any, mutate: (tx: any) => void, txId?: string): any {
  const s: any = structuredClone(signed);
  const tx = JSON.parse(s.signedTransaction.payload);
  mutate(tx);
  s.signedTransaction = { ...s.signedTransaction, payload: JSON.stringify(tx) };
  if (txId) s.txId = txId;
  delete s.contentHash;
  delete s.signedId;
  s.lineage = { ...s.lineage, artifactId: "" };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

describe("F1.6 · sdk.tx.send for v1 transactions", () => {
  let ws: string;
  let node: FakeNode;

  async function openSdk(root = ws, n: FakeNode = node): Promise<any> {
    const sdk: any = await Hardkas.create({ cwd: root, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: any) => n.listed(address) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockImplementation(async (o: any) => n.mempoolEntries(o.addresses) as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: n.networkId, virtualDaaScore: n.virtualDaaScore, tipHashes: [n.sink], virtualParentHashes: [n.sink], sink: n.sink }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: n.networkId, serverVersion: "2.1.0", isSynced: true }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: n.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => n.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => n.submit(transaction));
    withClientUrl(sdk, LOOPBACK);
    return sdk;
  }

  const filesIn = (root: string, sub: string) => {
    const dir = path.join(root, ".hardkas", "artifacts", sub);
    return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  };
  const submissions = (root = ws) => filesIn(root, "receipts").filter((f) => /txsubmission/i.test(f));
  const records = (root = ws) => submissions(root).map((f) => JSON.parse(fs.readFileSync(path.join(root, ".hardkas", "artifacts", "receipts", f), "utf8")));
  const send = (sdk: any, signed: any, extra: Record<string, unknown> = {}) => outcome(sdk.tx.send(signed, { url: LOOPBACK, v1Facts: v1CorpusFacts(), ...extra }));

  /** The corpus transition (or another of the same covenant, at another fee), planned, signed by the engine and stored. */
  async function transition(sdk: any, fee?: bigint, store = true) {
    const { plan, signed, txId } = await engineSigned(sealV1Plan(transitionBody(fee), SUCCESSOR_ADDR), transitionUtxo());
    if (store) await sdk.artifacts.write(plan);
    return { plan, signed, txId };
  }

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-v1s1-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    node.utxos = [transitionUtxo(), fundingUtxo()];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------- positives
  it("V1S-1 · the corpus transition is sent once: 1 submission naming the covenant outpoint it spends and the check's DAA score and guarantee; tx status follows it to CONFIRMED", async () => {
    const sdk = await openSdk();
    const t = await transition(sdk);
    expect(t.txId).toBe("611cd372b448fbce17b3683e710be193dbd78380bde8845fa5ededfaec75ac54");
    const r = await send(sdk, t.signed);
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(r.result).toMatchObject({ submitted: true, txId: t.txId, mode: "real" });
    expect(r.result.rejection).toBeUndefined();
    expect(node.submits).toEqual([t.txId]);
    const [rec] = records();
    expect(records()).toHaveLength(1);
    expect(rec.covenantSpends).toEqual([{ outpoint: `${GENESIS_TX}:0`, covenantId: COVENANT_ID, address: COUNTER_ADDR }]);
    expect(rec.preflight).toMatchObject({ observedAtDaaScore: "1000000", inputs: 1, scope: "observer-local" });
    expect(rec.preflight.guarantee).toMatch(/local-orchestration-only/);
    expect(rec.fee).toMatchObject({ status: "derived", feeSompi: "300100" });
    expect(rec.replaces).toBeUndefined();
    // what tx wait does on each poll: one look at the node, the state derived from the record and the looks
    expect((await sdk.tx.observe(t.txId)).derived.status).toBe("MEMPOOL_ACCEPTED");
    node.mine(t.txId);
    expect((await sdk.tx.observe(t.txId)).derived.status).toBe("CONFIRMED");
    expect((await sdk.tx.status(t.txId)).status).toBe("CONFIRMED");
  });

  it("V1S-2 · a genesis (P2PK funding, no covenant spent) is sent: no covenant lock needed, no covenantSpends, the preflight recorded", async () => {
    const sdk = await openSdk();
    const { plan, signed, txId } = await engineSigned(sealV1Plan(genesisBody(), COUNTER_ADDR), fundingUtxo());
    await sdk.artifacts.write(plan);
    const r = await send(sdk, signed);
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(r.result.submitted).toBe(true);
    expect(node.submits).toEqual([txId]);
    const [rec] = records();
    expect(rec.covenantSpends).toBeUndefined();
    expect(rec.preflight).toMatchObject({ inputs: 1, scope: "observer-local" });
  });

  // ---------------------------------------------------------------- the payment send's negatives, for v1
  it("V1S-3 · the same txid twice: the second returns the record (node holds it) or TX_ALREADY_SUBMITTED; 0 re-sends", async () => {
    const sdk = await openSdk();
    const t = await transition(sdk);
    await send(sdk, t.signed);
    const again = await send(sdk, t.signed);
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(again.result).toMatchObject({ alreadySubmitted: true, submitted: false });
    node.mempool.delete(t.txId); // the node dropped it
    const third = await send(sdk, t.signed);
    expect(third.error?.code).toBe("TX_ALREADY_SUBMITTED");
    expect(node.submits).toHaveLength(1);
    expect(records()).toHaveLength(1);
  });

  it("V1S-4 · an uncertain outcome (timeout, another txid in the answer, 'already in the mempool') is recorded once and never re-sent", async () => {
    for (const make of ["timeout", "other-txid", "already"] as const) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-v1s1u-"));
      fs.mkdirSync(path.join(root, ".hardkas"));
      const n = new FakeNode();
      n.utxos = [transitionUtxo()];
      try {
        const sdk = await openSdk(root, n);
        const t = await transition(sdk);
        if (make === "timeout") n.loseNextAnswer = true;
        if (make === "other-txid") n.answerOtherTxId = true;
        if (make === "already") n.rejectNext = "Rejected transaction $TX: transaction $TX is already in the mempool";
        const first = await send(sdk, t.signed);
        expect(first.error, `${make}: ${String(first.error?.message)}`).toBeUndefined();
        expect(submitOutcomeOf(first.result.submission.submitResult), make).toBe("unknown");
        expect(first.result.rejection, make).toBeUndefined();
        const again = await send(sdk, t.signed);
        expect(n.submits, make).toHaveLength(1);
        expect(records(root), make).toHaveLength(1);
        expect(again.error?.code === "TX_ALREADY_SUBMITTED" || again.result?.alreadySubmitted === true, make).toBe(true);
      } finally {
        vi.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("V1S-5 · the request never left (SUBMIT_NOT_SENT): no record; sending again is the first broadcast", async () => {
    const sdk = await openSdk();
    const t = await transition(sdk);
    node.dropNextRequest = true;
    const first = await send(sdk, t.signed);
    expect(first.error?.code).toBe("SUBMIT_NOT_SENT");
    expect(records()).toHaveLength(0);
    const again = await send(sdk, t.signed);
    expect(again.error, String(again.error?.message)).toBeUndefined();
    expect(again.result.submitted).toBe(true);
    expect(node.submits).toHaveLength(2);
    expect(records()).toHaveLength(1);
  });

  it("V1S-6 · the node's identity changes, or it is mainnet: refused before the broadcast, nothing recorded", async () => {
    for (const net of ["testnet-10", "mainnet"]) {
      const sdk = await openSdk();
      const t = await transition(sdk);
      node.networkId = net;
      const r = await send(sdk, t.signed);
      expect(r.error?.code, net).toBe(net === "mainnet" ? "MAINNET_BROADCAST_DISABLED" : "NODE_NETWORK_MISMATCH");
      expect(node.submits, net).toHaveLength(0);
      expect(records(), net).toHaveLength(0);
      node.networkId = "simnet";
      vi.restoreAllMocks();
    }
  });

  it("V1S-7 · a mainnet artifact is refused before anything (MAINNET_BROADCAST_DISABLED); nothing read or sent", async () => {
    const sdk = await openSdk();
    const t = await transition(sdk);
    const mainnet = resealed({ ...t.signed, networkId: "mainnet" }, () => {});
    const r = await send(sdk, mainnet);
    expect(r.error?.code).toBe("MAINNET_BROADCAST_DISABLED");
    expect(node.submits).toHaveLength(0);
    expect(records()).toHaveLength(0);
  });

  it("V1S-8 · a fee above the workspace's limit (FEE_EXCEEDS_MAX), a txid that is not the payload's (SIGNED_TXID_MISMATCH), a v1 field that is not the plan's (SIGNED_PLAN_MISMATCH): refused, 0 sends, 0 records", async () => {
    const sdk = await openSdk();
    const t = await transition(sdk);
    const cfg: any = sdk.config.config;
    const saved = structuredClone(cfg.networks.simnet);
    cfg.networks.simnet = { ...cfg.networks.simnet, maxFeeSompi: "100000" };
    const fee = await send(sdk, t.signed);
    cfg.networks.simnet = saved;
    expect(fee.error?.code).toBe("FEE_EXCEEDS_MAX");
    const txid = await send(sdk, resealed(t.signed, () => {}, "a".repeat(64)));
    expect(txid.error?.code).toBe("SIGNED_TXID_MISMATCH");
    const budget = await send(sdk, resealed(t.signed, (tx) => (tx.inputs[0].computeBudget = 3)));
    expect(budget.error?.code).toBe("SIGNED_PLAN_MISMATCH");
    expect(budget.error?.message).toMatch(/compute budget of 3/);
    expect(node.submits).toHaveLength(0);
    expect(records()).toHaveLength(0);
  });

  // ---------------------------------------------------------------- new v1 negatives
  it("V1S-9 · a v1 artifact whose plan is not in the workspace with a verified identity is never sent (V1_SEND_PLAN_UNRESOLVED), an explicit plan object included; once stored, it is", async () => {
    const sdk = await openSdk();
    const t = await transition(sdk, undefined, false);
    const r = await send(sdk, t.signed);
    expect(r.error?.code).toBe("V1_SEND_PLAN_UNRESOLVED");
    const explicit = await send(sdk, t.signed, { plan: t.plan });
    expect(explicit.error?.code).toBe("V1_SEND_PLAN_UNRESOLVED");
    expect(node.submits).toHaveLength(0);
    expect(records()).toHaveLength(0);
    await sdk.artifacts.write(t.plan);
    const ok = await send(sdk, t.signed);
    expect(ok.error, String(ok.error?.message)).toBeUndefined();
    expect(node.submits).toEqual([t.txId]);
  });

  it("V1S-10 · the input is spent, in the node's mempool, or its covenant id changed: refused before the broadcast with its code, 0 records", async () => {
    const cases: Array<[string, () => void, string]> = [
      ["spent", () => (node.utxos = [fundingUtxo()]), "INPUT_NOT_UNSPENT"],
      ["pending", () => node.spendElsewhere(`${GENESIS_TX}:0`), "INPUT_PENDING_SPEND"],
      ["covenant id", () => (node.utxos = [transitionUtxo({ covenantId: "e".repeat(64) }), fundingUtxo()]), "INPUT_DIFFERS_FROM_NODE"]
    ];
    for (const [name, arrange, code] of cases) {
      node = new FakeNode();
      node.utxos = [transitionUtxo(), fundingUtxo()];
      const sdk = await openSdk();
      const t = await transition(sdk);
      arrange();
      const r = await send(sdk, t.signed);
      expect(r.error?.code, name).toBe(code);
      expect(r.error?.message, name).toMatch(/Nothing was sent or recorded/);
      expect(node.submits, name).toHaveLength(0);
      expect(records(), name).toHaveLength(0);
      vi.restoreAllMocks();
    }
  });

  it("V1S-11 · a P2PK input the node lists with a covenant id (artifact signed elsewhere): COVENANT_UTXO_NOT_PAYMENT_INPUT, nothing sent", async () => {
    const sdk = await openSdk();
    const { plan, signed } = await engineSigned(sealV1Plan(genesisBody(), COUNTER_ADDR), fundingUtxo());
    await sdk.artifacts.write(plan);
    node.utxos = [transitionUtxo(), fundingUtxo({ covenantId: COVENANT_ID })];
    const r = await send(sdk, signed);
    expect(r.error?.code).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(node.submits).toHaveLength(0);
    expect(records()).toHaveLength(0);
  });

  it("V1S-12 · a race: another transaction spends the input between the check and the broadcast; the node's double-spend answer is recorded (INPUT_ALREADY_SPENT) and nothing is re-sent", async () => {
    const sdk = await openSdk();
    const t = await transition(sdk);
    node.beforeSubmit = () => node.spendElsewhere(`${GENESIS_TX}:0`);
    const r = await send(sdk, t.signed);
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(r.result.submitted).toBe(false);
    expect(r.result.rejection).toEqual({ code: "INPUT_ALREADY_SPENT", retriable: false });
    expect(node.submits).toEqual([t.txId]);
    expect(records()).toHaveLength(1);
    expect(nodeRejectionOf(records()[0].submitResult)?.code).toBe("INPUT_ALREADY_SPENT");
    const again = await send(sdk, t.signed);
    expect(again.error?.code).toBe("TX_ALREADY_SUBMITTED");
    expect(node.submits).toHaveLength(1);
  });

  it("V1S-13 · each class of the node's rejection comes back typed and final (budget, script, covenant rule, fee)", async () => {
    const texts: Array<[string, string]> = [
      ["Rejected transaction $TX: failed to verify the signature script: script units exceeded the amount committed in the input: used=719, limit=0", "COMPUTE_BUDGET_INSUFFICIENT"],
      ["Rejected transaction $TX: failed to verify the signature script: script ran, but verification failed", "SCRIPT_POLICY_REJECTED"],
      ["Rejected transaction $TX: covenants error: input #0 and outputs with covenant id x do not correspond to the expected genesis hashing", "COVENANT_RULE_REJECTED"],
      ["Rejected transaction $TX: transaction $TX is not standard: transaction has 300100 fees which is under the required amount of 400000 for compute mass 4000", "FEE_BELOW_NODE_MINIMUM"]
    ];
    for (const [text, code] of texts) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-v1s1c-"));
      fs.mkdirSync(path.join(root, ".hardkas"));
      const n = new FakeNode();
      n.utxos = [transitionUtxo()];
      try {
        const sdk = await openSdk(root, n);
        const t = await transition(sdk);
        n.rejectNext = text;
        const r = await send(sdk, t.signed);
        expect(r.error, String(r.error?.message)).toBeUndefined();
        expect(r.result.rejection?.code, code).toBe(code);
        expect(r.result.rejection?.retriable).toBe(false);
        if (code === "COMPUTE_BUDGET_INSUFFICIENT") expect(r.result.rejection).toMatchObject({ usedUnits: "719", limitUnits: "0" });
        expect(n.submits).toHaveLength(1);
        expect(records(root)).toHaveLength(1);
      } finally {
        vi.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("V1S-14 · two different transitions of the same covenant in one workspace: the second is refused before the broadcast (COVENANT_TRANSITION_PENDING)", async () => {
    const sdk = await openSdk();
    const a = await transition(sdk);
    const b = await transition(sdk, 400_000n);
    expect(b.txId).not.toBe(a.txId);
    expect((await send(sdk, a.signed)).result.submitted).toBe(true);
    const r = await send(sdk, b.signed);
    expect(r.error?.code).toBe("COVENANT_TRANSITION_PENDING");
    expect(r.error?.message).toMatch(new RegExp(a.txId));
    expect(node.submits).toEqual([a.txId]);
    expect(records()).toHaveLength(1);
  });

  it("V1S-15 · the same in two workspaces: each lock orders only its own workspace; the consensus takes one, the other is recorded as rejected (INPUT_ALREADY_SPENT), never re-sent", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "hk-v1s1w-"));
    fs.mkdirSync(path.join(other, ".hardkas"));
    try {
      const sdkA = await openSdk(ws, node);
      const a = await transition(sdkA);
      const nodeB = new FakeNode();
      nodeB.utxos = [transitionUtxo()];
      nodeB.mempoolHidden = true; // the second workspace's node does not show the first transaction's spend yet
      const sdkB = await openSdk(other, nodeB);
      const b = await transition(sdkB, 400_000n);
      expect((await send(sdkA, a.signed)).result.submitted).toBe(true);
      nodeB.rejectNext = `Rejected transaction $TX: output ${GENESIS_TX}:0 already spent by transaction ${a.txId} in the mempool`;
      const r = await send(sdkB, b.signed);
      expect(r.error, String(r.error?.message)).toBeUndefined();
      expect(r.result.rejection?.code).toBe("INPUT_ALREADY_SPENT");
      expect(records(ws)).toHaveLength(1);
      expect(records(other)).toHaveLength(1);
      expect(submitOutcomeOf(records(other)[0].submitResult)).toBe("rejected");
      const again = await send(sdkB, b.signed);
      expect(again.error?.code).toBe("TX_ALREADY_SUBMITTED");
      expect(nodeB.submits).toHaveLength(1);
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("V1S-16 · a new transition after an uncertain outcome: COVENANT_TRANSITION_PENDING; with the explicit replacement it is sent and its record names the one it replaced", async () => {
    const sdk = await openSdk();
    const a = await transition(sdk);
    node.loseNextAnswer = true;
    const first = await send(sdk, a.signed);
    expect(submitOutcomeOf(first.result.submission.submitResult)).toBe("unknown");
    node.mempool.delete(a.txId); // the node dropped it: no trace, its covenant outpoint still unspent
    const b = await transition(sdk, 400_000n);
    const pending = await send(sdk, b.signed);
    expect(pending.error?.code).toBe("COVENANT_TRANSITION_PENDING");
    const wrong = await send(sdk, b.signed, { replacePendingTransition: "c".repeat(64) });
    expect(wrong.error?.code).toBe("COVENANT_REPLACEMENT_INVALID");
    expect(node.submits).toEqual([a.txId]);
    const replaced = await send(sdk, b.signed, { replacePendingTransition: first.result.artifactId });
    expect(replaced.error, String(replaced.error?.message)).toBeUndefined();
    expect(replaced.result.submitted).toBe(true);
    expect(node.submits).toEqual([a.txId, b.txId]);
    const rec = records().find((x) => x.txId === b.txId);
    expect(rec.replaces).toEqual([first.result.artifactId]);
  });

  it("V1S-17 · a pending transition resolves by itself once observed accepted, or once another transaction spent its covenant outpoint", async () => {
    const sdk = await openSdk();
    const a = await transition(sdk);
    await send(sdk, a.signed);
    node.mine(a.txId); // accepted: the covenant moved to the successor
    const b = await transition(sdk, 400_000n);
    const after = await send(sdk, b.signed);
    expect(after.error?.code).toBe("INPUT_NOT_UNSPENT"); // not pending any more; its input is now spent
    // in conflict: another transaction (not this workspace's) took the outpoint
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-v1s1r-"));
    fs.mkdirSync(path.join(root, ".hardkas"));
    try {
      const n = new FakeNode();
      n.utxos = [transitionUtxo()];
      const sdk2 = await openSdk(root, n);
      const c = await transition(sdk2);
      n.loseNextAnswer = true;
      await send(sdk2, c.signed);
      n.mempool.delete(c.txId);
      n.utxos = []; // spent by someone else
      const d = await transition(sdk2, 400_000n);
      const r = await send(sdk2, d.signed);
      expect(r.error?.code).toBe("INPUT_NOT_UNSPENT");
      expect(n.submits).toEqual([c.txId]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
