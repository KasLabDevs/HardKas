import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { Hardkas } from "@hardkas/sdk";
import { getNetworkPrefix, loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildHardkasProgram } from "../src/program.js";
import { commandPathOf } from "../src/workspace-root.js";
import { readSilverEngineDraft, runSilverEngineDraftFinalize, runSilverEngineDraftSign, writeSilverEngineDraft } from "../src/runners/silver-engine-runner.js";
import { FakeNode } from "../../sdk/test/helpers/fake-v1-node.js";
import { withClientUrl } from "../../sdk/test/helpers/rpc-instance.js";
import { FIXTURE, FIXTURE_KEY, FIXTURE_XONLY, TWO_KEYS, fundingUtxo, twoOfTwoFacts } from "../../sdk/test/helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · CLI/SDK parity for F1.9 drafts: `hardkas silver engine draft prepare|sign|combine|finalize` are the SDK's
// sdk.covenants.prepareDraft / signDraft / combineDrafts / finalizeDraft. Two parties sign the TwoOfTwo spend each with
// their own workspace account (alice, bob), the drafts are combined and finalized into the signed artifact `hardkas tx
// send` sends. A manipulated signature refuses the combination; an incomplete draft is not finalized; an account without
// a slot is refused before its key is read. Against the stand-in node; the TwoOfTwo fixture (silverc artifact, no compiler).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const fixtureKeys = { publicKeyOf: (a: string) => (a === FIXTURE ? FIXTURE_XONLY : undefined), privateKeyOf: async () => FIXTURE_KEY };
const codeOf = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
    return "RESOLVED";
  } catch (e: any) {
    return e?.code ?? `UNCODED ${e?.message}`;
  }
};

describe("V1-ENGINE-2 · silver engine draft = the SDK's F1.9 drafts", () => {
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
    // the TwoOfTwo facts of the fixture (no compiler) wherever the engine needs facts
    const { facts } = twoOfTwoFacts();
    const prepare = sdk.covenants.prepareDraft.bind(sdk.covenants);
    vi.spyOn(sdk.covenants, "prepareDraft").mockImplementation((plan: any, o: any = {}) => prepare(plan, { ...o, facts }));
    const finalize = sdk.covenants.finalizeDraft.bind(sdk.covenants);
    vi.spyOn(sdk.covenants, "finalizeDraft").mockImplementation((d: any, plan: any, o: any = {}) => finalize(d, plan, { ...o, facts }));
    return sdk;
  }

  /** TwoOfTwo deployed and accepted; its spend (swept to the fixture) planned and stored. */
  async function spendPlan(sdk: any) {
    const { facts, record, ctor } = twoOfTwoFacts();
    const contract = { compileRecord: record, contract: "TwoOfTwo", constructorArgs: ctor } as any;
    const d = await sdk.covenants.sign(await sdk.covenants.planContractDeploy({ contract, amountSompi: 500_000_000n, funder: FIXTURE }, { facts }), { facts, keys: fixtureKeys });
    await sdk.covenants.send(d.signed, { facts });
    node.mine(d.txId);
    const plan = await sdk.covenants.planContractSpend(
      { outpoint: { transactionId: d.txId, index: 0 }, contract: { ...contract, entry: "spend", args: [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }] }, payments: [], sweepTo: FIXTURE, computeBudget: 50 },
      { facts }
    );
    return { plan, facts };
  }

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-v1e2-draft-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    // alice and bob are this workspace's accounts (plaintext test keys: synthetic constants)
    const k: any = loadManagedKaspaWasmSync();
    const account = (name: string) => ({ name, address: new k.PrivateKey(TWO_KEYS[name]!).toKeypair().toAddress(getNetworkPrefix("simnet")).toString(), privateKey: TWO_KEYS[name]!, network: "simnet", createdAt: "2026-10-26T00:00:00.000Z" });
    fs.writeFileSync(path.join(ws, ".hardkas", "accounts.real.json"), JSON.stringify({ version: 1, accounts: [account("alice"), account("bob")] }, null, 2));
    node = new FakeNode();
    node.utxos = [fundingUtxo()];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("DF-1 prepare → alice and bob sign apart (their own accounts) → combine → finalize → send: accepted; the draft files round-trip", async () => {
    const sdk = await openSdk();
    const { plan, facts } = await spendPlan(sdk);
    const prepared = await sdk.covenants.prepareDraft(plan);
    expect(prepared.slots.map((s: any) => [s.input, s.kind, s.param, s.signer, s.signature])).toEqual([
      [0, "contract", "sa", "alice", undefined],
      [0, "contract", "sb", "bob", undefined]
    ]);
    const file = await writeSilverEngineDraft(ws, prepared);
    expect(file.startsWith(path.join(ws, ".hardkas", "drafts"))).toBe(true);
    const asked: string[][] = [];
    const password = async (accounts: readonly string[]) => (asked.push([...accounts]), undefined);
    const byAlice = await runSilverEngineDraftSign(sdk, readSilverEngineDraft(file), plan, "alice", { password });
    const byBob = await runSilverEngineDraftSign(sdk, readSilverEngineDraft(file), plan, "bob", { password });
    expect(asked).toEqual([]); // plaintext accounts: no keystore password asked
    expect(byAlice.slots.map((s: any) => s.signature !== undefined)).toEqual([true, false]);
    expect(byBob.slots.map((s: any) => s.signature !== undefined)).toEqual([false, true]);
    const combined = sdk.covenants.combineDrafts([readSilverEngineDraft(await writeSilverEngineDraft(ws, byBob)), byAlice], plan);
    expect(combined.slots.every((s: any) => s.signature !== undefined)).toBe(true);
    // the order the drafts come in does not change the result
    expect(sdk.covenants.combineDrafts([byAlice, byBob], plan).contentHash).toBe(combined.contentHash);
    const f = await runSilverEngineDraftFinalize(sdk, combined, plan);
    expect(f.txId).toBe(combined.txId);
    expect(JSON.parse(fs.readFileSync(f.path, "utf8")).contentHash).toBe(f.signed.contentHash);
    expect((await sdk.covenants.send(f.signed, { facts })).submitted).toBe(true);
    expect(node.submits.at(-1)).toBe(f.txId);
  });

  it("DF-2 refusals: a manipulated signature refuses the combination; an incomplete draft is not finalized; an account without a slot is refused before its key; another plan's draft is refused", async () => {
    const sdk = await openSdk();
    const { plan } = await spendPlan(sdk);
    const prepared = await sdk.covenants.prepareDraft(plan);
    const byAlice = await runSilverEngineDraftSign(sdk, prepared, plan, "alice");
    const byBob = await runSilverEngineDraftSign(sdk, prepared, plan, "bob");
    // a party flips one bit of alice's signature and reseals the draft (the seal is not a signature)
    const sig = byAlice.slots[0].signature as string;
    const flipped = `${sig.slice(0, 10)}${((parseInt(sig[10]!, 16) ^ 1) & 15).toString(16)}${sig.slice(11)}`;
    const { calculateContentHash, CURRENT_HASH_VERSION } = await import("@hardkas/artifacts");
    const { contentHash: _drop, ...body } = { ...byAlice, slots: [{ ...byAlice.slots[0], signature: flipped }, byAlice.slots[1]] };
    const forged = { ...body, contentHash: calculateContentHash(JSON.parse(JSON.stringify(body)), CURRENT_HASH_VERSION) };
    expect(await codeOf(() => sdk.covenants.combineDrafts([forged, byBob], plan))).toBe("SILVER_SPEND_SIGNATURE_INVALID");
    expect(await codeOf(runSilverEngineDraftFinalize(sdk, byAlice, plan))).toBe("SILVER_SPEND_SIGNATURE_MISSING");
    // carol has no slot (and no account here): refused on the draft, before any key or password
    let asked = 0;
    expect(await codeOf(runSilverEngineDraftSign(sdk, prepared, plan, "carol", { password: async () => (asked++, undefined) }))).toBe("SILVER_SPEND_SIGNER_NOT_IN_DRAFT");
    expect(asked).toBe(0);
    // a draft resealed for another plan
    const other = await sdk.covenants.planContractSpend(
      { outpoint: plan.inputs[0].outpoint, contract: plan.inputs[0].contract, payments: [], sweepTo: FIXTURE, computeBudget: 51 },
      { facts: twoOfTwoFacts().facts }
    );
    expect(await codeOf(runSilverEngineDraftSign(sdk, prepared, other, "alice"))).toBe("SILVER_SPEND_DRAFT_INVALID");
    expect(node.submits.length).toBe(1); // only the deploy was ever sent
  });

  it("DF-3 the program has `silver engine draft prepare|sign|combine|finalize`", () => {
    const all = (root: Command): Command[] => root.commands.flatMap((c) => [c, ...all(c)]);
    const paths = all(buildHardkasProgram({ forDocs: true })).map(commandPathOf);
    expect(paths).toEqual(expect.arrayContaining(["silver engine draft", "silver engine draft prepare", "silver engine draft sign", "silver engine draft combine", "silver engine draft finalize", "silver covenant inspect"]));
  });
});
