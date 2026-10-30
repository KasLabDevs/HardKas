import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { Hardkas } from "@hardkas/sdk";
import { readSignedTxArtifact, verifyArtifact } from "@hardkas/artifacts";
import { KeystoreManager } from "@hardkas/accounts";
import { getNetworkPrefix, loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildHardkasProgram } from "../src/program.js";
import { COMMANDS_HONORING_WORKSPACE, commandPathOf } from "../src/workspace-root.js";
import { engineOptionsOf, engineSignersOf, runSilverEnginePlan, runSilverEngineSign } from "../src/runners/silver-engine-runner.js";
import { FakeNode } from "../../sdk/test/helpers/fake-v1-node.js";
import { withClientUrl } from "../../sdk/test/helpers/rpc-instance.js";
import { COUNTER_ADDR, COUNTER_RECORD, COVENANT_ID, FIXTURE, FIXTURE_KEY, FIXTURE_XONLY, fundingUtxo, v1CorpusFacts } from "../../sdk/test/helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// F1.10 · `hardkas silver engine` is the SDK's v1 engine (sdk.covenants) behind a JSON spec: the runner parses the spec
// into the SDK's options and calls the SDK, so a plan made from the CLI is the plan the SDK makes, a refusal is the SDK's
// refusal (same code), and a signed artifact is the one `hardkas tx send` reads and sends through sdk.tx.send (F1.6).
// Against the stand-in node of the SDK tests, with the Silver corpus Counter (silverc artifacts, no compiler).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const PASSWORD = "f110-owner-password";
const COUNTER = { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] };
const keys = { publicKeyOf: (a: string) => (a === FIXTURE ? FIXTURE_XONLY : undefined), privateKeyOf: async () => FIXTURE_KEY };
/** What a plan does (its identity aside: the creation time differs between two plans of the same body). */
const bodyOf = (p: any) => ({ inputs: p.inputs, outputs: p.outputs, genesisCovenantGroups: p.genesisCovenantGroups, nextState: p.nextState, estimatedFeeSompi: p.estimatedFeeSompi, storageMass: p.storageMass, maxFeeSompi: p.maxFeeSompi, txVersion: p.txVersion });
const codeOf = async (p: Promise<unknown>) => p.then(() => "RESOLVED", (e: any) => e?.code ?? `UNCODED ${e?.message}`);

describe("F1.10 · hardkas silver engine = the SDK's v1 engine", () => {
  let ws: string;
  let node: FakeNode;

  /** `keys: false`: the engine resolves the workspace's own accounts (keystores included) instead of the fixture's key. */
  async function openSdk(o: { keys?: boolean } = {}): Promise<any> {
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
    // the engine's facts and keys of the SDK tests (the corpus Counter; the fixture's key)
    for (const m of ["sign", "check"]) {
      const f = sdk.covenants[m].bind(sdk.covenants);
      vi.spyOn(sdk.covenants, m).mockImplementation((plan: any, x: any = {}) => f(plan, { ...x, facts: v1CorpusFacts(), ...(o.keys === false ? {} : { keys }) }));
    }
    for (const m of ["planGenesis", "planTransition", "planContractDeploy", "planContractSpend"]) {
      const f = sdk.covenants[m].bind(sdk.covenants);
      vi.spyOn(sdk.covenants, m).mockImplementation((options: any, o: any = {}) => f(options, { ...o, facts: v1CorpusFacts() }));
    }
    // `hardkas tx send` calls sdk.tx.send(signed, url): the facts then come from the workspace's compile records (silverc);
    // here, the corpus ones
    const send = sdk.tx.send.bind(sdk.tx);
    vi.spyOn(sdk.tx, "send").mockImplementation((s: any, u: any) => send(s, typeof u === "string" ? { url: u, v1Facts: v1CorpusFacts() } : u));
    return sdk;
  }

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-f110-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    node.utxos = [fundingUtxo()];
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("EN-1 a spec is the SDK's options: sompi strings become bigint; an unknown key, a bad amount or operation is SILVER_ENGINE_SPEC_INVALID", () => {
    const o = engineOptionsOf("genesis", { contract: COUNTER, outputs: [{ amountSompi: "1000000000" }], funder: FIXTURE, feeSompi: "300000" });
    expect(o).toEqual({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE, feeSompi: 300_000n });
    expect(engineOptionsOf("transition", { covenantId: COVENANT_ID, inputs: [], continuations: [{ amountSompi: 5, state: {} }], payments: [{ address: FIXTURE, amountSompi: "7" }] })).toMatchObject({
      continuations: [{ amountSompi: 5n }],
      payments: [{ amountSompi: 7n }]
    });
    const code = (f: () => unknown) => {
      try {
        f();
        return "OK";
      } catch (e: any) {
        return e?.code;
      }
    };
    expect(code(() => engineOptionsOf("genesis", { contract: COUNTER, outputs: [], funder: FIXTURE, fundr: "x" }))).toBe("SILVER_ENGINE_SPEC_INVALID");
    expect(code(() => engineOptionsOf("deploy", { contract: COUNTER, amountSompi: "1.5", funder: FIXTURE }))).toBe("SILVER_ENGINE_SPEC_INVALID");
    expect(code(() => engineOptionsOf("deploy", { contract: COUNTER, amountSompi: -1, funder: FIXTURE }))).toBe("SILVER_ENGINE_SPEC_INVALID");
    expect(code(() => engineOptionsOf("spend", { outpoint: {}, contract: COUNTER, payments: {} }))).toBe("SILVER_ENGINE_SPEC_INVALID");
    expect(code(() => engineOptionsOf("burn" as any, {}))).toBe("SILVER_ENGINE_SPEC_INVALID");
    expect(code(() => engineOptionsOf("genesis", [] as any))).toBe("SILVER_ENGINE_SPEC_INVALID");
  });

  it("EN-2 the CLI's plan is the SDK's plan (genesis, then the 7 → 12 transition), stored where the CLI says", async () => {
    const sdk = await openSdk();
    const cli = await runSilverEnginePlan(sdk, "genesis", { contract: COUNTER, outputs: [{ amountSompi: "1000000000" }], funder: FIXTURE });
    const direct = await sdk.covenants.planGenesis({ contract: COUNTER, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE });
    expect(bodyOf(cli.plan)).toEqual(bodyOf(direct));
    expect(cli.plan.estimatedFeeSompi).toBe("208300");
    expect(JSON.parse(fs.readFileSync(cli.path, "utf8")).contentHash).toBe(cli.plan.contentHash);

    const g = await runSilverEngineSign(sdk, cli.plan);
    await sdk.tx.send((await readSignedTxArtifact(g.path)) as any, LOOPBACK);
    node.mine(g.txId);
    const spec = {
      covenantId: COVENANT_ID,
      inputs: [{ outpoint: { transactionId: g.txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] } }],
      continuations: [{ amountSompi: String(1_000_000_000n - 71_900n), state: { value: { kind: "int", value: "12" } } }]
    };
    const t = await runSilverEnginePlan(sdk, "transition", spec);
    const tDirect = await sdk.covenants.planTransition(engineOptionsOf("transition", spec));
    expect(bodyOf(t.plan)).toEqual(bodyOf(tDirect));
    expect(t.plan.estimatedFeeSompi).toBe("71900");
  });

  it("EN-3 the CLI's refusals are the SDK's, code for code (covenant fee below the floor, outpoint not listed, uncertified entry, a covenant UTXO as a contract spend)", async () => {
    const sdk = await openSdk();
    const g = await runSilverEngineSign(sdk, (await runSilverEnginePlan(sdk, "genesis", { contract: COUNTER, outputs: [{ amountSompi: "1000000000" }], funder: FIXTURE })).plan);
    await sdk.tx.send(g.signed, LOOPBACK);
    node.mine(g.txId);
    const input = (over: any = {}) => ({ outpoint: { transactionId: g.txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] }, ...over });
    const cases: Array<[string, any, string]> = [
      ["transition", { covenantId: COVENANT_ID, inputs: [input()], continuations: [{ amountSompi: String(1_000_000_000n - 71_899n), state: { value: { kind: "int", value: "12" } } }] }, "FEE_BELOW_V1_FLOOR"],
      ["transition", { covenantId: COVENANT_ID, inputs: [input({ outpoint: { transactionId: "e".repeat(64), index: 0 } })], continuations: [{ amountSompi: "999000000", state: { value: { kind: "int", value: "12" } } }] }, "INPUT_NOT_UNSPENT"],
      ["transition", { covenantId: COVENANT_ID, inputs: [input({ contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump_other", policy: "bump", args: [] } })], continuations: [{ amountSompi: "999000000", state: { value: { kind: "int", value: "12" } } }] }, "V1_COMPUTE_BUDGET_REQUIRED"],
      ["spend", { outpoint: { transactionId: g.txId, index: 0 }, contract: { ...COUNTER, entry: "__covenant_entrypoint_auth_bump", args: [{ kind: "int", value: "5" }] }, payments: [{ address: FIXTURE, amountSompi: "900000000" }], computeBudget: 0 }, "COVENANT_INPUT_UNDECLARED"]
    ];
    for (const [op, spec, expected] of cases) {
      const viaCli = await codeOf(runSilverEnginePlan(sdk, op as any, spec));
      const m = op === "transition" ? "planTransition" : "planContractSpend";
      const viaSdk = await codeOf(sdk.covenants[m](engineOptionsOf(op as any, spec)));
      expect([op, viaCli]).toEqual([op, expected]);
      expect(viaSdk).toBe(viaCli);
    }
    // a payment plan signer never signs an engine plan: the CLI sign is the engine's own (F1.4 first)
    expect(node.submits).toEqual([g.txId]);
  });

  it("EN-4 the signed artifact is the one `hardkas tx send` reads (verified) and sends through sdk.tx.send (F1.6: one record)", async () => {
    const sdk = await openSdk();
    const p = await runSilverEnginePlan(sdk, "genesis", { contract: COUNTER, outputs: [{ amountSompi: "1000000000" }], funder: FIXTURE });
    const s = await runSilverEngineSign(sdk, p.plan);
    expect(s.path.startsWith(path.join(ws, ".hardkas", "artifacts"))).toBe(true);
    expect((await verifyArtifact(s.path)).ok).toBe(true);
    const read = await readSignedTxArtifact(s.path);
    expect((read as any).contentHash).toBe(s.signed.contentHash);
    const sent = await sdk.tx.send(read as any, LOOPBACK);
    expect(sent.receipt.txId).toBe(s.txId);
    expect(node.submits).toEqual([s.txId]);
  });

  it("EN-7 sign asks for a keystore password only after F1.4 accepted the plan, and only for an encrypted signer; the password opens its key", async () => {
    const k: any = loadManagedKaspaWasmSync();
    const kp = new k.PrivateKey(FIXTURE_KEY).toKeypair();
    const address = kp.toAddress(getNetworkPrefix("simnet")).toString();
    expect(address).toBe(FIXTURE);
    const ks = await KeystoreManager.createEncryptedKeystore({ address, privateKey: FIXTURE_KEY, network: "simnet", publicKey: kp.publicKey }, PASSWORD, { label: "enc-fixture", network: "simnet" });
    fs.mkdirSync(path.join(ws, ".hardkas", "keystore"), { recursive: true });
    await KeystoreManager.saveEncryptedKeystore(path.join(ws, ".hardkas", "keystore", "enc-fixture.json"), ks);
    const sdk = await openSdk({ keys: false });
    const asked: string[][] = [];
    const password = async (accounts: readonly string[]) => {
      asked.push([...accounts]);
      return PASSWORD;
    };
    const p = await runSilverEnginePlan(sdk, "genesis", { contract: COUNTER, outputs: [{ amountSompi: "1000000000" }], funder: "enc-fixture" });
    expect(p.plan.inputs[0].signer).toBe("enc-fixture");
    // the node no longer lists the funding coin: F1.4 refuses the plan, and no password was asked
    const listed = node.utxos;
    node.utxos = [];
    expect(await codeOf(runSilverEngineSign(sdk, p.plan, { password }))).toBe("INPUT_NOT_UNSPENT");
    expect(asked).toEqual([]);
    // listed again: asked once, for the encrypted signer; the password opens the key that signs
    node.utxos = listed;
    const s = await runSilverEngineSign(sdk, p.plan, { password });
    expect(asked).toEqual([["enc-fixture"]]);
    expect(s.txId).toBe((await sdk.covenants.check(p.plan)).txId);
    // a wrong password opens nothing: the keystore's own refusal, nothing signed
    const wrong = await codeOf(runSilverEngineSign(sdk, p.plan, { password: async () => "not-the-password" }));
    expect(wrong).not.toBe("RESOLVED");
  });

  it("EN-5 the accounts a plan signs with: P2PK signers and signer slots (nested too)", () => {
    const plan = {
      inputs: [
        { kind: "p2pk", signer: "fixture" },
        { kind: "p2sh", contract: { args: [{ kind: "signer", signer: "alice" }, { kind: "array", value: [{ kind: "object", value: { s: { kind: "signer", signer: "bob" } } }] }, { kind: "int", value: "1" }] } },
        { kind: "p2pk", signer: "fixture" }
      ]
    };
    expect(engineSignersOf(plan)).toEqual(["fixture", "alice", "bob"]);
    expect(engineSignersOf({})).toEqual([]);
  });

  it("EN-6 the program has `silver engine plan|sign`, and they take the invocation's workspace", () => {
    const all = (root: Command): Command[] => root.commands.flatMap((c) => [c, ...all(c)]);
    const paths = all(buildHardkasProgram({ forDocs: true })).map(commandPathOf);
    expect(paths).toEqual(expect.arrayContaining(["silver engine", "silver engine plan", "silver engine sign"]));
    expect(COMMANDS_HONORING_WORKSPACE).toContain("silver engine");
  });
});
