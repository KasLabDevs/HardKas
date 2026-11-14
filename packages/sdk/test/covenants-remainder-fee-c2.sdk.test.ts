import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DEFAULT_MAX_FEE_SOMPI } from "@hardkas/tx-builder";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import { COUNTER_RECORD, FIXTURE, FIXTURE_KEY, FIXTURE_XONLY, TWO_KEYS, fundingUtxo, twoOfTwoFacts, twoPublicKeyOf, v1CorpusFacts } from "./helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// C-2 (audit 2026-11-13) · a v1 contract spend without `sweepTo`, or a covenant transition the covenant pays without a
// "rest" continuation, takes as fee whatever its outputs leave, and the plan's fee limit defaulted to that same fee: a
// 100 KAS contract output spent with `payments: [1 KAS]` planned, checked, signed and sent a 99 KAS fee. Now, without an
// explicit maxFeeSompi, such a remainder fee is held to the larger of HardKAS's default limit (DEFAULT_MAX_FEE_SOMPI,
// 0.1 KAS) and the node's floor for that transaction: above it V1_REMAINDER_FEE_ABOVE_LIMIT, before any plan is sealed or
// stored. sweepTo (or "rest") gives the floor fee; an explicit maxFeeSompi stays the caller's decision.
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const KAS = 100_000_000n;
const COUNTER = { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] } as any;
const fixtureKeys = { publicKeyOf: (a: string) => (a === FIXTURE || a === "fixture" ? FIXTURE_XONLY : undefined), privateKeyOf: async () => FIXTURE_KEY };

/** Every file under a directory (the workspace's artifact store): a refused plan adds none. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

describe("C-2 · a v1 fee that is what the outputs leave is limited unless the caller sets maxFeeSompi", () => {
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

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-c2-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    // 200 KAS to fund a 100 KAS contract output
    node.utxos = [fundingUtxo({ amountSompi: 200n * KAS })];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  /** A TwoOfTwo contract output of 100 KAS, deployed and accepted. */
  async function contractOutput(sdk: any) {
    const { facts, record, ctor } = twoOfTwoFacts();
    const contract = { compileRecord: record, contract: "TwoOfTwo", constructorArgs: ctor } as any;
    const d = await sdk.covenants.sign(await sdk.covenants.planContractDeploy({ contract, amountSompi: 100n * KAS, funder: FIXTURE }, { facts }), { facts, keys: fixtureKeys });
    await sdk.covenants.send(d.signed, { facts });
    node.mine(d.txId);
    const spend = (over: Record<string, unknown> = {}) => ({
      outpoint: { transactionId: d.txId, index: 0 },
      contract: { ...contract, entry: "spend", args: [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }] },
      payments: [{ address: FIXTURE, amountSompi: 1n * KAS }],
      computeBudget: 50,
      ...over
    });
    return { facts, spend, deployTxId: d.txId };
  }

  it("C2-1 a 100 KAS contract output with payments [1 KAS] and neither sweepTo nor maxFeeSompi is refused before anything is planned, stored or signed", async () => {
    const sdk = await openSdk();
    const { facts, spend } = await contractOutput(sdk);
    const store = path.join(ws, ".hardkas");
    const before = filesUnder(store).sort();
    const refused = await sdk.covenants.planContractSpend(spend(), { facts }).then(
      () => undefined,
      (e: any) => e
    );
    expect(refused?.code).toBe("V1_REMAINDER_FEE_ABOVE_LIMIT");
    // the two ways out are named, with the numbers
    expect(String(refused.message)).toMatch(/sweepTo/);
    expect(String(refused.message)).toMatch(/maxFeeSompi/);
    expect(String(refused.message)).toMatch(/9900000000 sompi of the 10000000000 sompi input/);
    expect(refused.metadata).toMatchObject({ feeSompi: String(99n * KAS), limitSompi: String(DEFAULT_MAX_FEE_SOMPI), inputSompi: String(100n * KAS) });
    // no plan sealed or stored (so there is nothing to sign), nothing sent beyond the deploy
    expect(filesUnder(store).sort()).toEqual(before);
    expect(node.submits.length).toBe(1);
  });

  it("C2-2 the same spend with sweepTo: a normal fee (the node's floor), the rest swept; checked, signed and sent", async () => {
    const sdk = await openSdk();
    const { facts, spend } = await contractOutput(sdk);
    const plan = await sdk.covenants.planContractSpend(spend({ sweepTo: FIXTURE }), { facts });
    const fee = BigInt(plan.estimatedFeeSompi);
    expect(fee).toBeGreaterThan(0n);
    expect(fee).toBeLessThanOrEqual(DEFAULT_MAX_FEE_SOMPI);
    expect(plan.maxFeeSompi).toBe(String(fee));
    expect(plan.outputs.map((o: any) => o.amountSompi)).toEqual([String(1n * KAS), String(99n * KAS - fee)]);
    const both = { publicKeyOf: twoPublicKeyOf, privateKeyOf: async (a: string) => TWO_KEYS[a]! };
    expect((await sdk.covenants.check(plan, { facts, keys: both })).feeSompi).toBe(fee);
    const s = await sdk.covenants.sign(plan, { facts, keys: both });
    expect((await sdk.covenants.send(s.signed, { facts })).submitted).toBe(true);
  });

  it("C2-3 the same spend with an explicit high maxFeeSompi is the caller's decision: planned with that limit, checked and signed; a lower explicit limit is FEE_EXCEEDS_MAX", async () => {
    const sdk = await openSdk();
    const { facts, spend } = await contractOutput(sdk);
    const plan = await sdk.covenants.planContractSpend(spend({ maxFeeSompi: 99n * KAS }), { facts });
    expect([plan.estimatedFeeSompi, plan.maxFeeSompi]).toEqual([String(99n * KAS), String(99n * KAS)]);
    const both = { publicKeyOf: twoPublicKeyOf, privateKeyOf: async (a: string) => TWO_KEYS[a]! };
    expect((await sdk.covenants.check(plan, { facts, keys: both })).feeSompi).toBe(99n * KAS);
    const s = await sdk.covenants.sign(plan, { facts, keys: both });
    expect(s.feeSompi).toBe(99n * KAS);
    await expect(sdk.covenants.planContractSpend(spend({ maxFeeSompi: 1n * KAS }), { facts })).rejects.toMatchObject({ code: "FEE_EXCEEDS_MAX" });
  });

  it("C2-4 the limit's edge: a remainder fee of exactly DEFAULT_MAX_FEE_SOMPI is planned, one sompi more is refused", async () => {
    const sdk = await openSdk();
    const { facts, spend } = await contractOutput(sdk);
    const at = await sdk.covenants.planContractSpend(spend({ payments: [{ address: FIXTURE, amountSompi: 100n * KAS - DEFAULT_MAX_FEE_SOMPI }] }), { facts });
    expect(at.estimatedFeeSompi).toBe(String(DEFAULT_MAX_FEE_SOMPI));
    await expect(
      sdk.covenants.planContractSpend(spend({ payments: [{ address: FIXTURE, amountSompi: 100n * KAS - DEFAULT_MAX_FEE_SOMPI - 1n }] }), { facts })
    ).rejects.toMatchObject({ code: "V1_REMAINDER_FEE_ABOVE_LIMIT" });
  });

  it("C2-5 a transition the covenant pays without a \"rest\" continuation: the same limit; \"rest\" gives the floor; an explicit maxFeeSompi allows it", async () => {
    const sdk = await openSdk();
    const facts = v1CorpusFacts();
    const g = await sdk.covenants.sign(await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 10n * KAS }], funder: FIXTURE }, { facts }), { facts, keys: fixtureKeys });
    await sdk.covenants.send(g.signed, { facts });
    node.mine(g.txId);
    const covenantId = JSON.parse(g.signed.signedTransaction.payload).outputs[0].covenant.covenantId as string;
    const input = { outpoint: { transactionId: g.txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] } };
    const twelve = { value: { kind: "int", value: "12" } };
    // a continuation that forgot half a KAS: 0.5 KAS would go to the miner
    const forgot = { covenantId, inputs: [input], continuations: [{ amountSompi: 10n * KAS - KAS / 2n, state: twelve }] };
    const refused = await sdk.covenants.planTransition(forgot, { facts }).then(() => undefined, (e: any) => e);
    expect(refused?.code).toBe("V1_REMAINDER_FEE_ABOVE_LIMIT");
    expect(String(refused.message)).toMatch(/"rest"/);
    expect(String(refused.message)).toMatch(/maxFeeSompi/);
    // the same transition with "rest": the floor (71,900, the corpus fee)
    const rest = await sdk.covenants.planTransition({ ...forgot, continuations: [{ amountSompi: "rest", state: twelve }] }, { facts });
    expect(rest.estimatedFeeSompi).toBe("71900");
    // the caller's explicit limit: planned
    const paid = await sdk.covenants.planTransition({ ...forgot, maxFeeSompi: KAS / 2n }, { facts });
    expect([paid.estimatedFeeSompi, paid.maxFeeSompi]).toEqual([String(KAS / 2n), String(KAS / 2n)]);
    // a small remainder (the corpus fee) needs no limit: unchanged
    const corpus = await sdk.covenants.planTransition({ ...forgot, continuations: [{ amountSompi: 10n * KAS - 71_900n, state: twelve }] }, { facts });
    expect(corpus.estimatedFeeSompi).toBe("71900");
  });
});
