import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import { COUNTER_ADDR, COUNTER_RECORD, COVENANT_ID, FIXTURE, FIXTURE_KEY, FIXTURE_XONLY, TWO_KEYS, fundingUtxo, twoOfTwoFacts, twoPublicKeyOf, v1CorpusFacts } from "./helpers/v1-corpus.js";

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
});
