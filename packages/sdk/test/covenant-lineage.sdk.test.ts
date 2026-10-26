import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { HardkasSchemas } from "@hardkas/core";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, HARDKAS_VERSION, calculateContentHash } from "@hardkas/artifacts";
import { Hardkas, reconstructCovenantLineage, type CovenantLineageTx } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import { COUNTER_ADDR, COUNTER_RECORD, COUNTER_SPK, COVENANT_ID, FIXTURE, FIXTURE_KEY, FIXTURE_XONLY, FUNDING, SUCCESSOR_ADDR, fundingUtxo, v1CorpusFacts } from "./helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · a covenant's history, lineage, inspection and state, from this workspace's records and the node's
// unspent outputs by address (the node has no query by covenant id). The lineage is anchored by recomputing the genesis
// covenant id, linked by outpoints, and its tip checked against the node; each live output's declared state is checked
// against its address. Against the stand-in node, with the corpus Counter (silverc artifacts, no compiler).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const COUNTER = { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] } as any;
const keys = { publicKeyOf: (a: string) => (a === FIXTURE || a === "fixture" ? FIXTURE_XONLY : undefined), privateKeyOf: async () => FIXTURE_KEY };
const CORPUS = path.resolve(__dirname, "../../../fixtures/toccata-v2/silver/covenant-counter-transition");
const int = (v: number) => ({ value: { kind: "int", value: String(v) } }) as any;

describe("V1-ENGINE-2 · sdk.covenants history, lineage, inspect, getState", () => {
  let ws: string;
  let node: FakeNode;

  async function openSdk(): Promise<any> {
    const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: any) => node.listed(address) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockImplementation(async (o: any) => node.mempoolEntries(o.addresses) as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: node.networkId, virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: node.networkId, serverVersion: "2.1.0", isSynced: true }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    withClientUrl(sdk, LOOPBACK);
    return sdk;
  }

  /** genesis (7), then transitions through the given states (each bump = the difference), each sent and mined. */
  async function covenantThrough(sdk: any, states: number[], o: { mineLast?: boolean } = {}) {
    const facts = v1CorpusFacts();
    const g = await sdk.covenants.sign(await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE }, { facts }), { facts, keys });
    await sdk.covenants.send(g.signed, { facts });
    node.mine(g.txId);
    const txs = [g.txId];
    let at = { txId: g.txId, value: 7 };
    for (const [n, next] of states.entries()) {
      const plan = await sdk.covenants.planTransition(
        {
          covenantId: COVENANT_ID,
          inputs: [{ outpoint: { transactionId: at.txId, index: 0 }, contract: { ...COUNTER, ...(at.value !== 7 ? { state: int(at.value) } : {}), entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: String(next - at.value) }] }, computeBudget: 0 }],
          continuations: [{ amountSompi: "rest", state: int(next) }]
        },
        { facts }
      );
      const t = await sdk.covenants.sign(plan, { facts, keys });
      await sdk.covenants.send(t.signed, { facts });
      if (n < states.length - 1 || o.mineLast !== false) node.mine(t.txId);
      txs.push(t.txId);
      at = { txId: t.txId, value: next };
    }
    return { txs, facts };
  }

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-lin-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    node.utxos = [fundingUtxo()];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("LN-1 genesis → 12 → 17: the anchor recomputed (c6ba323d…), two linked transitions, the tip unspent at the node holding 17 (its address commits to it): verified", async () => {
    const sdk = await openSdk();
    const { txs, facts } = await covenantThrough(sdk, [12, 17]);
    const l = await sdk.covenants.lineage(COVENANT_ID, { facts });
    expect(l.genesis).toMatchObject({ txId: txs[0], anchorCheck: "verified", anchor: { transactionId: FUNDING.transactionId, index: FUNDING.index } });
    expect(l.transitions.map((t: any) => t.txId)).toEqual([txs[1], txs[2]]);
    expect(l.transitions[1].spends).toEqual([`${txs[1]}:0`]);
    expect(l.tip).toHaveLength(1);
    expect(l.tip[0]).toMatchObject({ outpoint: `${txs[2]}:0`, createdBy: txs[2], node: "unspent", stateCheck: { status: "address-commits", state: { value: { kind: "int", value: "17" } } } });
    expect(l.checks).toEqual({ anchor: "verified", links: "complete", conflicts: 0, node: "checked", tip: "unspent" });
    expect(l.verified).toBe(true);
    expect(l.findings).toEqual([]);
    const inspection = await sdk.covenants.inspect(COVENANT_ID, { facts });
    expect(inspection).toMatchObject({ active: true, utxoCount: 1, transitions: 2, rejected: 0, verified: true, genesis: { txId: txs[0], anchorCheck: "verified" } });
    expect(inspection.totalValueLocked).toBe(BigInt(l.tip[0].amountSompi));
    const state = await sdk.covenants.getState(COVENANT_ID, { facts });
    expect(state).toMatchObject({ active: true, utxoCount: 1, verified: true });
    expect(state.utxos[0].stateCheck).toMatchObject({ status: "address-commits", state: { value: { kind: "int", value: "17" } } });
    const history = await sdk.covenants.history(COVENANT_ID);
    expect(history.transactions.map((t: any) => [t.kind, t.txId, t.recorded])).toEqual([["genesis", txs[0], "accepted"], ["transition", txs[1], "accepted"], ["transition", txs[2], "accepted"]]);
  });

  it("LN-2 a transition the node rejected is history, not lineage: the tip stays the output it tried to spend, still unspent", async () => {
    const sdk = await openSdk();
    const { txs, facts } = await covenantThrough(sdk, [12]);
    node.rejectNext = "Rejected transaction $TX: failed to verify the signature script: script ran, but verification failed";
    const plan = await sdk.covenants.planTransition(
      { covenantId: COVENANT_ID, inputs: [{ outpoint: { transactionId: txs[1], index: 0 }, contract: { ...COUNTER, state: int(12), entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] }, computeBudget: 0 }], continuations: [{ amountSompi: "rest", state: int(999) }] },
      { facts }
    );
    const t = await sdk.covenants.sign(plan, { facts, keys });
    expect((await sdk.covenants.send(t.signed, { facts })).submitted).toBe(false);
    const l = await sdk.covenants.lineage(COVENANT_ID, { facts });
    expect(l.rejected.map((r: any) => r.txId)).toEqual([t.txId]);
    expect(l.transitions.map((r: any) => r.txId)).toEqual([txs[1]]);
    expect(l.tip.map((r: any) => [r.outpoint, r.node])).toEqual([[`${txs[1]}:0`, "unspent"]]);
    expect(l.verified).toBe(true);
  });

  it("LN-3 an uncertain or unaccepted transition: its output is not listed yet (a finding), the lineage is not verified; once accepted, it is", async () => {
    const sdk = await openSdk();
    const { txs, facts } = await covenantThrough(sdk, [12], { mineLast: false });
    const before = await sdk.covenants.lineage(COVENANT_ID, { facts });
    expect(before.tip.map((r: any) => [r.outpoint, r.node])).toEqual([[`${txs[1]}:0`, "not-listed"]]);
    expect(before.verified).toBe(false);
    expect(before.findings.join("\n")).toMatch(/not unspent at the node: not accepted yet, or spent by a transaction this workspace did not record/);
    node.mine(txs[1]!);
    expect((await sdk.covenants.lineage(COVENANT_ID, { facts })).verified).toBe(true);
  });

  it("LN-4 a transition this workspace did not record: the node no longer lists the tip, a finding says why it may be; the state is not active", async () => {
    const sdk = await openSdk();
    const { txs, facts } = await covenantThrough(sdk, [12]);
    // another workspace's transaction spends the tip (its output goes elsewhere)
    node.utxos = node.utxos.filter((u) => !(u.outpoint.transactionId === txs[1] && u.outpoint.index === 0));
    const state = await sdk.covenants.getState(COVENANT_ID, { facts });
    expect(state).toMatchObject({ active: false, utxoCount: 0, verified: false });
    expect(state.findings.join("\n")).toMatch(new RegExp(`${txs[1]}:0 .*not unspent at the node`));
  });

  it("LN-5 `hardkas silver covenant` records alone (no engine artifacts): merged as history; the anchor is unverifiable (the record holds no genesis transaction), the node's reported id is cited; the state is checked from the state's compile record", async () => {
    const sdk = await openSdk();
    const dir = path.join(ws, ".hardkas", "artifacts", "silver");
    fs.mkdirSync(dir, { recursive: true });
    const seal = (draft: Record<string, unknown>) => {
      const d = { ...draft, version: ARTIFACT_VERSION, mode: "localnet", hashVersion: CURRENT_HASH_VERSION };
      return { ...d, contentHash: calculateContentHash(d, CURRENT_HASH_VERSION) } as any;
    };
    const write = (prefix: string, r: any) => {
      const file = path.join(dir, `${prefix}-${r.contentHash.slice(0, 16)}.json`);
      fs.writeFileSync(file, JSON.stringify(r, null, 2));
      return path.relative(ws, file).replace(/\\/g, "/");
    };
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const compile = (which: "current" | "successor", address: string) => {
      const artifactJson = fs.readFileSync(path.join(CORPUS, `${which}.artifact.json`), "utf8");
      const source = fs.readFileSync(path.join(CORPUS, `${which}.sil`), "utf8");
      return seal({
        schema: HardkasSchemas.SilverCompileV1,
        hardkasVersion: HARDKAS_VERSION,
        createdAt: "2026-10-26T00:00:00.000Z",
        networkId: "simnet",
        capability: "silver.compile.v1",
        source: { path: `${which}.sil`, sha256: sha(source), text: source },
        provenance: { schema: "hardkas.silver.compileProvenance.v1", compiler: { id: "silverc", releaseTag: "v1.0.0", commit: "0".repeat(40), assetSha256: "0".repeat(64), binarySha256: "0".repeat(64) }, sourceSha256: sha(source), constructorArgsSha256: "0".repeat(64), artifactSha256: sha(artifactJson) },
        artifactJson,
        contracts: [{ name: "Counter", lockingScript: { version: 0, script: COUNTER_SPK.slice(4) }, address }]
      });
    };
    const current = compile("current", COUNTER_ADDR);
    const successor = compile("successor", SUCCESSOR_ADDR);
    const currentPath = write("silverCompile", current);
    const successorPath = write("silverCompile", successor);
    const genesisTx = "1".repeat(64);
    const transitionTx = "2".repeat(64);
    const node0 = { verified: true, imageDigest: "sha256:" + "0".repeat(64) };
    const genesis = seal({
      schema: HardkasSchemas.SilverCovenantV1, hardkasVersion: HARDKAS_VERSION, createdAt: "2026-10-26T00:00:00.000Z", networkId: "simnet", capability: "toccata.covenant.auth-1to1-transition.v1",
      kind: "genesis", compileRecord: { path: currentPath, contentHash: current.contentHash, artifactSha256: current.provenance.artifactSha256 }, contract: "Counter",
      covenantId: COVENANT_ID, covenantIdFromNode: COVENANT_ID, lockingScript: { version: 0, script: COUNTER_SPK.slice(4) }, address: COUNTER_ADDR,
      txId: genesisTx, outpoint: { transactionId: genesisTx, index: 0 }, valueSompi: "1000000000", feeSompi: "208300", computeBudget: 10, status: "confirmed", confirmedAtBlockDaaScore: "900", node: node0
    });
    const genesisPath = write("silverCovenant", genesis);
    const transition = seal({
      schema: HardkasSchemas.SilverCovenantV1, hardkasVersion: HARDKAS_VERSION, createdAt: "2026-10-26T00:00:01.000Z", networkId: "simnet", capability: "toccata.covenant.auth-1to1-transition.v1",
      kind: "transition", previous: { path: genesisPath, contentHash: genesis.contentHash, outpoint: genesis.outpoint },
      compileRecord: { path: successorPath, contentHash: successor.contentHash, artifactSha256: successor.provenance.artifactSha256 }, contract: "Counter", policy: "bump",
      covenantId: COVENANT_ID, lockingScript: { version: 0, script: "00" }, address: SUCCESSOR_ADDR,
      txId: transitionTx, outpoint: { transactionId: transitionTx, index: 0 }, valueSompi: "999928100", feeSompi: "71900", computeBudget: 0, status: "submitted", node: node0
    });
    write("silverCovenant", transition);
    node.utxos = [{ outpoint: { transactionId: transitionTx, index: 0 }, address: SUCCESSOR_ADDR, amountSompi: 999_928_100n, scriptPublicKey: "0000aa20" + "00".repeat(32) + "87", covenantId: COVENANT_ID, blockDaaScore: 901n, isCoinbase: false } as any];
    const l = await sdk.covenants.lineage(COVENANT_ID);
    expect(l.genesis).toMatchObject({ txId: genesisTx, anchorCheck: "unverifiable", sources: [{ kind: "silver-record" }] });
    expect(l.findings.join("\n")).toMatch(/does not hold its transaction: its covenant id cannot be recomputed here \(the node reported this covenant id/);
    expect(l.transitions.map((t: any) => [t.txId, t.spends, t.recorded])).toEqual([[transitionTx, [`${genesisTx}:0`], "submitted"]]);
    expect(l.tip[0]).toMatchObject({ outpoint: `${transitionTx}:0`, node: "unspent", stateCheck: { status: "address-commits", state: { value: { kind: "int", value: "12" } } } });
    // every check it can make passes, but the anchor could not be recomputed: not verified
    expect(l.checks).toMatchObject({ anchor: "unverifiable", links: "complete", tip: "unspent" });
    expect(l.verified).toBe(false);
  });

  it("LN-6 reconstruction alone: an anchor that does not give the covenant id, a gap, a conflict — each a finding, never verified", () => {
    const out = (outpoint: string, amount = 1_000_000_000n) => ({ outpoint, address: COUNTER_ADDR, amountSompi: amount, scriptPublicKey: COUNTER_SPK });
    const g: CovenantLineageTx = { txId: "a".repeat(64), kind: "genesis", sources: [], spends: [], outputs: [out(`${"a".repeat(64)}:0`)], anchor: FUNDING, recorded: "accepted" };
    expect(reconstructCovenantLineage(COVENANT_ID, [g]).genesis?.anchorCheck).toBe("verified");
    const wrongValue = { ...g, outputs: [out(`${"a".repeat(64)}:0`, 999n)] };
    const mismatch = reconstructCovenantLineage(COVENANT_ID, [wrongValue]);
    expect(mismatch.genesis?.anchorCheck).toBe("mismatch");
    expect(mismatch.findings.join("\n")).toMatch(/does not give this covenant id/);
    const t1: CovenantLineageTx = { txId: "b".repeat(64), kind: "transition", sources: [], spends: [`${"a".repeat(64)}:0`], outputs: [out(`${"b".repeat(64)}:0`)], recorded: "accepted" };
    const t2: CovenantLineageTx = { ...t1, txId: "c".repeat(64), outputs: [out(`${"c".repeat(64)}:0`)], recorded: "unknown" };
    const gap: CovenantLineageTx = { ...t1, txId: "d".repeat(64), spends: [`${"9".repeat(64)}:3`], outputs: [out(`${"d".repeat(64)}:0`)] };
    const r = reconstructCovenantLineage(COVENANT_ID, [g, t1, t2, gap]);
    expect(r.findings.join("\n")).toMatch(/spent by 2 recorded transactions/);
    expect(r.findings.join("\n")).toMatch(/which no recorded transaction of this covenant created/);
    expect(r.findings.join("\n")).toMatch(/outcome of its submission is unknown/);
    const unsent: CovenantLineageTx = { ...t1, txId: "e".repeat(64), recorded: "not-submitted" };
    expect(reconstructCovenantLineage(COVENANT_ID, [g, unsent]).unsent.map((t) => t.txId)).toEqual(["e".repeat(64)]);
    let code: string | undefined;
    try {
      reconstructCovenantLineage("xyz", []);
    } catch (e: any) {
      code = e?.code;
    }
    expect(code).toBe("COVENANT_ID_INVALID");
  });
});
