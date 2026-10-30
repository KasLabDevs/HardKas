import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import {
  COUNTER_ADDR,
  COUNTER_RECORD,
  COVENANT_ID,
  FIXTURE,
  FIXTURE_KEY,
  FIXTURE_XONLY,
  SUCCESSOR_ADDR,
  TWO_KEYS,
  fundingUtxo,
  twoOfTwoCompileRecord,
  twoOfTwoFacts,
  twoPublicKeyOf,
  v1CorpusFacts
} from "./helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// Phase 3 · the v1 engine from the SDK (sdk.covenants): planGenesis / planTransition (sealed, stored plans; funder coins by
// F1.7; the fee the node's floor measured on the transaction itself, F1.2; certified budgets, F1.8), sign (F1.4 before
// any key, F1.5) and send (F1.6, the one send). Against the stand-in node, with the Silver corpus Counter as contract
// (facts from its silverc artifact). The genesis gets the corpus covenant id c6ba323d… (same outpoint, same outputs).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const COUNTER = { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] } as any;
const keys = { publicKeyOf: (a: string) => (a === FIXTURE || a === "fixture" ? FIXTURE_XONLY : undefined), privateKeyOf: async () => FIXTURE_KEY };

describe("phase 3 · sdk.covenants plans, signs and sends v1 covenant transactions", () => {
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
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cov3-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    node.utxos = [fundingUtxo()];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("CV-1 genesis → transition 7 → 12: the floor fees (208,300 and 71,900 as the corpus), the corpus covenant id, one record each, accepted", async () => {
    const sdk = await openSdk();
    const facts = v1CorpusFacts();
    const genesis = await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE }, { facts });
    expect(genesis.estimatedFeeSompi).toBe("208300");
    expect(genesis.outputs).toEqual([
      { address: COUNTER_ADDR, amountSompi: "1000000000" },
      { address: FIXTURE, amountSompi: String(4_000_000_000n - 1_000_000_000n - 208_300n), role: "change" }
    ]);
    expect(genesis.inputs[0]).toMatchObject({ kind: "p2pk", computeBudget: 10, signer: FIXTURE });
    const g = await sdk.covenants.sign(genesis, { facts, keys });
    expect(g.signed.txVersion).toBe(1);
    const sentG = await sdk.covenants.send(g.signed, { facts });
    expect(sentG.submitted).toBe(true);
    node.mine(g.txId);
    const covenantId = JSON.parse(g.signed.signedTransaction.payload).outputs[0].covenant.covenantId;
    expect(covenantId).toBe(COVENANT_ID);

    const transition = await sdk.covenants.planTransition(
      {
        covenantId,
        inputs: [{ outpoint: { transactionId: g.txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] } }],
        continuations: [{ amountSompi: 1_000_000_000n - 71_900n, state: { value: { kind: "int", value: "12" } } }]
      },
      { facts }
    );
    expect(transition.estimatedFeeSompi).toBe("71900");
    expect(transition.inputs[0].computeBudget).toBe(0); // certified (F1.8)
    const t = await sdk.covenants.sign(transition, { facts, keys });
    const sentT = await sdk.covenants.send(t.signed, { facts });
    expect(sentT.submitted).toBe(true);
    expect(node.submits).toEqual([g.txId, t.txId]);
  });

  it("CV-2 a transition whose fee the funder pays: the covenant keeps its whole value; the floor counts the extra P2PK input", async () => {
    const sdk = await openSdk();
    const facts = v1CorpusFacts();
    const genesis = await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE }, { facts });
    const g = await sdk.covenants.sign(genesis, { facts, keys });
    await sdk.covenants.send(g.signed, { facts });
    node.mine(g.txId);
    const covenantId = JSON.parse(g.signed.signedTransaction.payload).outputs[0].covenant.covenantId;
    const transition = await sdk.covenants.planTransition(
      {
        covenantId,
        inputs: [{ outpoint: { transactionId: g.txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] } }],
        continuations: [{ amountSompi: 1_000_000_000n, state: { value: { kind: "int", value: "12" } } }],
        funder: FIXTURE
      },
      { facts }
    );
    expect(transition.outputs[0]).toMatchObject({ amountSompi: "1000000000", covenant: { authorizingInput: 0, covenantId } });
    expect(transition.inputs.map((i: any) => i.kind)).toEqual(["covenant", "p2pk"]);
    expect(BigInt(transition.estimatedFeeSompi)).toBeGreaterThan(71_900n);
    const t = await sdk.covenants.sign(transition, { facts, keys });
    expect((await sdk.covenants.send(t.signed, { facts })).submitted).toBe(true);
  });

  it("CV-4 a contract deployed (P2SH, no covenant) and spent by two signers: planContractDeploy, planContractSpend, sign with both keys, send", async () => {
    const sdk = await openSdk();
    const { facts, record, ctor } = twoOfTwoFacts();
    const contract = { compileRecord: record, contract: "TwoOfTwo", constructorArgs: ctor } as any;
    const deploy = await sdk.covenants.planContractDeploy({ contract, amountSompi: 500_000_000n, funder: FIXTURE }, { facts });
    expect(deploy.outputs[0]).toMatchObject({ amountSompi: "500000000", role: "payment" });
    const d = await sdk.covenants.sign(deploy, { facts, keys });
    expect((await sdk.covenants.send(d.signed, { facts })).submitted).toBe(true);
    node.mine(d.txId);
    const spend = await sdk.covenants.planContractSpend(
      { outpoint: { transactionId: d.txId, index: 0 }, contract: { ...contract, entry: "spend", args: [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }] }, payments: [{ address: FIXTURE, amountSompi: 499_000_000n }], computeBudget: 50 },
      { facts }
    );
    const both = { publicKeyOf: twoPublicKeyOf, privateKeyOf: async (a: string) => TWO_KEYS[a]! };
    const s = await sdk.covenants.sign(spend, { facts, keys: both });
    expect((await sdk.covenants.send(s.signed, { facts })).submitted).toBe(true);
    expect(node.submits).toEqual([d.txId, s.txId]);
    await expect(sdk.covenants.planContractSpend({ outpoint: { transactionId: d.txId, index: 0 }, contract: { ...contract, entry: "spend", args: [] }, payments: [{ address: FIXTURE, amountSompi: 1n }] }, { facts })).rejects.toMatchObject({ code: "V1_COMPUTE_BUDGET_REQUIRED" });
  });

  it("CV-5 check: F1.4 without reading any private key, the txid the signed transaction gets; a plan check refuses, sign refuses with the same code", async () => {
    const sdk = await openSdk();
    const facts = v1CorpusFacts();
    const genesis = await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE }, { facts });
    const reads: string[] = [];
    const counting = {
      publicKeyOf: keys.publicKeyOf,
      privateKeyOf: async (a: string) => {
        reads.push(a);
        return FIXTURE_KEY;
      }
    };
    const c = await sdk.covenants.check(genesis, { facts, keys: counting });
    expect(reads).toEqual([]);
    expect(c.feeSompi).toBe(208_300n);
    const s = await sdk.covenants.sign(genesis, { facts, keys: counting });
    expect(s.txId).toBe(c.txId);
    expect(reads).toEqual([FIXTURE]);
    node.utxos = [];
    await expect(sdk.covenants.check(genesis, { facts, keys: counting })).rejects.toMatchObject({ code: "INPUT_NOT_UNSPENT" });
    await expect(sdk.covenants.sign(genesis, { facts, keys: counting })).rejects.toMatchObject({ code: "INPUT_NOT_UNSPENT" });
    expect(reads).toEqual([FIXTURE]);
  });

  it("CV-3 refusals: a covenant fee below the floor (FEE_BELOW_V1_FLOOR), a transition from an outpoint the node does not list (INPUT_NOT_UNSPENT), an uncertified entry without a budget (V1_COMPUTE_BUDGET_REQUIRED)", async () => {
    const sdk = await openSdk();
    const facts = v1CorpusFacts();
    const genesis = await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE }, { facts });
    const g = await sdk.covenants.sign(genesis, { facts, keys });
    await sdk.covenants.send(g.signed, { facts });
    node.mine(g.txId);
    const covenantId = JSON.parse(g.signed.signedTransaction.payload).outputs[0].covenant.covenantId;
    const input = (over: any = {}) => ({ outpoint: { transactionId: g.txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] }, ...over });
    const cont = (amount: bigint) => [{ amountSompi: amount, state: { value: { kind: "int", value: "12" } } }];
    await expect(sdk.covenants.planTransition({ covenantId, inputs: [input()], continuations: cont(1_000_000_000n - 71_899n) }, { facts })).rejects.toMatchObject({ code: "FEE_BELOW_V1_FLOOR" });
    await expect(sdk.covenants.planTransition({ covenantId, inputs: [input({ outpoint: { transactionId: "e".repeat(64), index: 0 } })], continuations: cont(999_000_000n) }, { facts })).rejects.toMatchObject({ code: "INPUT_NOT_UNSPENT" });
    await expect(
      sdk.covenants.planTransition({ covenantId, inputs: [input({ contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump_other", policy: "bump", args: [] } })], continuations: cont(999_000_000n) }, { facts })
    ).rejects.toMatchObject({ code: "V1_COMPUTE_BUDGET_REQUIRED" });
  });

  /** A covenant of the corpus Counter (state 7), started and accepted. */
  async function counterCovenant(sdk: any, facts: any) {
    const g = await sdk.covenants.sign(await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE }, { facts }), { facts, keys });
    await sdk.covenants.send(g.signed, { facts });
    node.mine(g.txId);
    return { txId: g.txId, covenantId: JSON.parse(g.signed.signedTransaction.payload).outputs[0].covenant.covenantId as string };
  }
  const bump = (txId: string, over: any = {}) => ({ outpoint: { transactionId: txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] }, ...over });
  const twelve = { value: { kind: "int", value: "12" } } as const;

  it("CV-6 a continuation that takes the rest: the covenant pays the node's floor (71,900, the corpus fee) or a larger fee given; refused with a funder or twice", async () => {
    const sdk = await openSdk();
    const facts = v1CorpusFacts();
    const { txId, covenantId } = await counterCovenant(sdk, facts);
    const floor = await sdk.covenants.planTransition({ covenantId, inputs: [bump(txId)], continuations: [{ amountSompi: "rest", state: twelve }] }, { facts });
    expect(floor.estimatedFeeSompi).toBe("71900");
    // the continuation is the template holding 12: the corpus successor, the covenant's id
    expect(floor.outputs).toEqual([{ address: SUCCESSOR_ADDR, amountSompi: String(1_000_000_000n - 71_900n), covenant: { authorizingInput: 0, covenantId } }]);
    const more = await sdk.covenants.planTransition({ covenantId, inputs: [bump(txId)], continuations: [{ amountSompi: "rest", state: twelve }], feeSompi: 100_000n }, { facts });
    expect([more.estimatedFeeSompi, more.outputs[0].amountSompi]).toEqual(["100000", String(1_000_000_000n - 100_000n)]);
    // a fee below the floor is the floor (the plan never pays less)
    const less = await sdk.covenants.planTransition({ covenantId, inputs: [bump(txId)], continuations: [{ amountSompi: "rest", state: twelve }], feeSompi: 1n }, { facts });
    expect(less.estimatedFeeSompi).toBe("71900");
    const t = await sdk.covenants.sign(floor, { facts, keys });
    expect((await sdk.covenants.send(t.signed, { facts })).submitted).toBe(true);
    for (const options of [
      { covenantId, inputs: [bump(txId)], continuations: [{ amountSompi: "rest", state: twelve }], funder: FIXTURE },
      { covenantId, inputs: [bump(txId)], continuations: [{ amountSompi: "rest", state: twelve }, { amountSompi: "rest", state: twelve }] }
    ]) {
      await expect(sdk.covenants.planTransition(options as any, { facts })).rejects.toMatchObject({ code: "V1_PLAN_INVALID" });
    }
  });

  it("CV-7 a contract spend swept to one address: the fee is the floor measured on the sweep itself (or more), the rest is swept; a sequence is planned; refusals", async () => {
    const sdk = await openSdk();
    const { facts, record, ctor } = twoOfTwoFacts();
    const contract = { compileRecord: record, contract: "TwoOfTwo", constructorArgs: ctor } as any;
    const d = await sdk.covenants.sign(await sdk.covenants.planContractDeploy({ contract, amountSompi: 500_000_000n, funder: FIXTURE }, { facts }), { facts, keys });
    await sdk.covenants.send(d.signed, { facts });
    node.mine(d.txId);
    const spendOf = (over: any = {}) => ({
      outpoint: { transactionId: d.txId, index: 0 },
      contract: { ...contract, entry: "spend", args: [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }] },
      payments: [],
      sweepTo: FIXTURE,
      computeBudget: 50,
      ...over
    });
    const both = { publicKeyOf: twoPublicKeyOf, privateKeyOf: async (a: string) => TWO_KEYS[a]! };
    const swept = await sdk.covenants.planContractSpend(spendOf(), { facts });
    const fee = BigInt(swept.estimatedFeeSompi);
    expect(fee).toBeGreaterThan(0n);
    expect(swept.outputs).toEqual([{ address: FIXTURE, amountSompi: String(500_000_000n - fee), role: "payment" }]);
    // the floor is the one of this very transaction: the check (F1.4) accepts it
    expect((await sdk.covenants.check(swept, { facts, keys: both })).feeSompi).toBe(fee);
    // a payment and the sweep: two outputs raise the floor above the one-output fee + 1,000 given, so the floor is paid;
    // a fee above the floor is paid as given
    const paid = await sdk.covenants.planContractSpend(spendOf({ payments: [{ address: FIXTURE, amountSompi: 100_000_000n }], feeSompi: fee + 1_000n }), { facts });
    const paidFee = BigInt(paid.estimatedFeeSompi);
    expect(paidFee).toBeGreaterThan(fee + 1_000n);
    expect((await sdk.covenants.check(paid, { facts, keys: both })).feeSompi).toBe(paidFee);
    expect(paid.outputs.map((o: any) => o.amountSompi)).toEqual(["100000000", String(400_000_000n - paidFee)]);
    const generous = await sdk.covenants.planContractSpend(spendOf({ payments: [{ address: FIXTURE, amountSompi: 100_000_000n }], feeSompi: 1_000_000n }), { facts });
    expect([generous.estimatedFeeSompi, generous.outputs[1].amountSompi]).toEqual(["1000000", String(400_000_000n - 1_000_000n)]);
    const sequenced = await sdk.covenants.planContractSpend(spendOf({ sequence: 5n }), { facts });
    expect(sequenced.inputs[0].sequence).toBe("5");
    // the sequence is part of the signed transaction (and of the txid)
    expect((await sdk.covenants.check(sequenced, { facts, keys: both })).txId).not.toBe((await sdk.covenants.check(swept, { facts, keys: both })).txId);
    const s = await sdk.covenants.sign(swept, { facts, keys: both });
    expect((await sdk.covenants.send(s.signed, { facts })).submitted).toBe(true);
    node.mine(s.txId);
    // the contract output is spent (the deploy's change, its output 1, stays); the sweep holds the rest
    expect(node.utxos.some((u) => u.outpoint.transactionId === d.txId && u.outpoint.index === 0)).toBe(false);
    expect(node.utxos.find((u) => u.outpoint.transactionId === s.txId)?.amountSompi).toBe(500_000_000n - fee);
  });

  it("CV-7b spend refusals before any node answer matters: feeSompi without sweepTo, nothing to pay, a sequence above u64", async () => {
    const sdk = await openSdk();
    const { facts, record, ctor } = twoOfTwoFacts();
    const contract = { compileRecord: record, contract: "TwoOfTwo", constructorArgs: ctor } as any;
    const d = await sdk.covenants.sign(await sdk.covenants.planContractDeploy({ contract, amountSompi: 500_000_000n, funder: FIXTURE }, { facts }), { facts, keys });
    await sdk.covenants.send(d.signed, { facts });
    node.mine(d.txId);
    const base = { outpoint: { transactionId: d.txId, index: 0 }, contract: { ...contract, entry: "spend", args: [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }] }, computeBudget: 50 };
    for (const over of [{ payments: [{ address: FIXTURE, amountSompi: 1n }], feeSompi: 10_000n }, { payments: [] }, { payments: [], sweepTo: FIXTURE, sequence: 1n << 64n }]) {
      await expect(sdk.covenants.planContractSpend({ ...base, ...over } as any, { facts })).rejects.toMatchObject({ code: "V1_PLAN_INVALID" });
    }
  });

  it("CV-8 a deploy without constructor arguments funds the P2SH of the compile record's own artifact: a record the caller read, or the workspace's; a tampered one is not found", async () => {
    const sdk = await openSdk();
    const record = twoOfTwoCompileRecord();
    const { facts: twoFacts } = twoOfTwoFacts();
    const expected = (await twoFacts.contract()).lock;
    const k: any = (await import("@hardkas/core")).loadManagedKaspaWasmSync();
    const address = String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(expected.version, expected.script), "simnet"));
    const ref = { compileRecord: { contentHash: record.contentHash, artifactSha256: record.provenance.artifactSha256 }, contract: "TwoOfTwo" };
    const given = await sdk.covenants.planContractDeploy({ contract: ref, amountSompi: 300_000_000n, funder: FIXTURE }, { compileRecords: [record] });
    expect(given.outputs[0]).toEqual({ address, amountSompi: "300000000", role: "payment" });
    expect(given.inputs.every((i: any) => i.kind === "p2pk" && i.contract === undefined)).toBe(true);
    // not given and not in the workspace: SILVER_RECORD_NOT_FOUND
    await expect(sdk.covenants.planContractDeploy({ contract: ref, amountSompi: 300_000_000n, funder: FIXTURE })).rejects.toMatchObject({ code: "SILVER_RECORD_NOT_FOUND" });
    // in the workspace, where `silver compile` writes it
    const dir = path.join(ws, ".hardkas", "artifacts", "silver");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `silverCompile-${record.contentHash.slice(0, 16)}.json`), JSON.stringify(record, null, 2));
    const found = await sdk.covenants.planContractDeploy({ contract: ref, amountSompi: 300_000_000n, funder: FIXTURE });
    expect(found.outputs[0].address).toBe(address);
    // a record whose artifact was changed (its identity and digest no longer verify) is never used: given, it is passed
    // over for the workspace's own; once the workspace holds only that one, there is none
    const tampered = { ...record, artifactJson: `${record.artifactJson} ` };
    const passedOver = await sdk.covenants.planContractDeploy({ contract: ref, amountSompi: 300_000_000n, funder: FIXTURE }, { compileRecords: [tampered] });
    expect(passedOver.outputs[0].address).toBe(address);
    fs.writeFileSync(path.join(dir, `silverCompile-${record.contentHash.slice(0, 16)}.json`), JSON.stringify(tampered, null, 2));
    await expect(sdk.covenants.planContractDeploy({ contract: ref, amountSompi: 300_000_000n, funder: FIXTURE }, { compileRecords: [tampered] })).rejects.toMatchObject({ code: "SILVER_RECORD_NOT_FOUND" });
    // another state than the record's needs the facts silverc reproduces
    await expect(
      sdk.covenants.planContractDeploy({ contract: ref, amountSompi: 300_000_000n, funder: FIXTURE, state: { value: { kind: "int", value: "1" } } }, { compileRecords: [record] })
    ).rejects.toMatchObject({ code: "V1_PLAN_INVALID" });
  });
});
