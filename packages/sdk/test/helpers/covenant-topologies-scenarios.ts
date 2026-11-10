import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { encodeSilverEntryArgs, loadManagedKaspaWasmSync, silverSigFromInputSignature, silverUnlockScript, systemRuntimeContext } from "@hardkas/core";
import { createV1TxPlanArtifact, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { v1StorageMass } from "@hardkas/tx-builder";
import { buildV1WasmTransaction, createWorkspaceV1Facts, v1ArgToSil, v1ContractFactsAtState, v1SignedArtifact } from "@hardkas/accounts";
import { getHardkasFixtureKey } from "../../../testing/src/index.js";
import { Hardkas } from "../../src/index.js";

// -----------------------------------------------------------------------------
// INT9-C1 · the covenant topology scenarios (1:N, N:M with leader and delegates, termination, KCC-20 N:M signed) against
// a real rusty-kaspad v2.1.0, written once and run on each network a test file names: simnet
// (covenant-topologies-node.simnet.test.ts, the harness's node) and devnet (covenant-topologies-node-devnet.simnet.test.ts,
// an own devnet node and miner). What differs between them is only the node: how it starts, how the funder gets mature
// coins, how a transaction gets into a block, and the network id of every address, plan and compile record.
//
// Every valid transaction is built by HardKAS's real construction: compiled by `hardkas silver compile` (the pinned
// silverc), planned, checked, signed and sent by the SDK's v1 engine (`sdk.covenants.planGenesis / planTransition /
// sign / send`), with the workspace's own facts. The node's answer is the verdict: accepted, mined, and its successors
// indexed with the covenant id the engine computed.
//
// Every invalid case is the same valid plan with one thing changed, judged twice: by the engine (`sdk.covenants.check`,
// F1.4, no key) and by the node (the same plan built without F1.4 — the engine's own transaction builder and unlock
// encoding — and submitted). What a covenant's policy computes the engine does not evaluate by design (the node runs the
// script): those cases are expected "engine accepts, node rejects" and are reported as such, never as agreement.
//
// Fixtures: packages/accounts/test/fixtures/v1-engine/phase2 (upstream silverscript v1.0.0 covenant declarations).
// -----------------------------------------------------------------------------

export type CovenantTopologyNetworkId = "simnet" | "devnet";

/** The node a scenario run talks to, as the network's test file gives it. */
export interface CovenantTopologyNode {
  /** The node's wRPC client: submissions, UTXO reads, server info. */
  readonly rpc: {
    submitTransaction(tx: any, options?: any): Promise<any>;
    getUtxosByAddress(address: string): Promise<any[]>;
    getServerInfo(): Promise<any>;
  };
  readonly rpcUrl: string;
  readonly containerName: string | undefined;
  /** The node's image as the test started it (pinned by digest). */
  readonly image: string;
  /** The funder of every genesis (the fixture account "alice" on this network) and its key. */
  readonly funderAddress: string;
  readonly funderPrivateKey: string;
  /** More facts about the node for the evidence file (container, miner…). */
  readonly evidence?: Record<string, unknown> | undefined;
  /** Mature, spendable coins for the funder, enough for every genesis of the run. */
  fund(): Promise<void>;
  /** Resolves once `outpoint` is listed at `address` (the transaction is in a block and indexed); throws when it is not. */
  confirm(address: string, outpoint: { transactionId: string; index: number }): Promise<any>;
  stop(): Promise<void>;
}

export interface CovenantTopologyNetwork {
  readonly networkId: CovenantTopologyNetworkId;
  /** Appended to every describe title ("" keeps the titles as they are). */
  readonly titleSuffix: string;
  /** The variable that names the evidence file. */
  readonly evidenceEnv: string;
  /** The evidence file's name (under the OS temp directory) when the variable is not set, and the log label. */
  readonly evidenceFilePrefix: string;
  start(): Promise<CovenantTopologyNode>;
}

type Verdict = { ok: boolean; code?: string; message?: string };
export interface CovenantTopologyCaseRecord {
  topology: string;
  case: string;
  expectation: "both-accept" | "both-reject" | "policy: engine accepts, node rejects" | "observe";
  engine: Verdict & { warnings?: readonly string[] };
  node: {
    accepted: boolean;
    txId: string;
    reason?: string;
    mined?: boolean;
    /** The first output the node listed for it, once mined (address, outpoint, the DAA score of its block). */
    listed?: { address: string; outpoint: string; blockDaaScore: string; covenantId?: string };
  };
  agree: boolean;
}

/** What a network's test file may read after the scenarios ran (before the run's own afterAll). */
export interface CovenantTopologyRun {
  readonly evidence: Record<string, any>;
  readonly cliDist: string;
  node(): CovenantTopologyNode;
  workspace(): string;
}

const repoRoot = path.resolve(__dirname, "../../../..");
const P2 = path.join(repoRoot, "packages", "accounts", "test", "fixtures", "v1-engine", "phase2");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");

const listedOf = (address: string, u: any): CovenantTopologyCaseRecord["node"]["listed"] => ({
  address,
  outpoint: `${u.outpoint.transactionId}:${u.outpoint.index}`,
  blockDaaScore: String(u.blockDaaScore),
  ...(u.covenantId ? { covenantId: String(u.covenantId) } : {})
});

/**
 * Registers the scenario suites (beforeAll, afterAll and the C1–C4 describes, then the summary) on `network`. Call it once,
 * at the top level of a test file.
 */
export function defineCovenantTopologyScenarios(network: CovenantTopologyNetwork): CovenantTopologyRun {
  const NET = network.networkId;
  const T = network.titleSuffix;

  let node: CovenantTopologyNode;
  let sdk: Hardkas;
  let parent = "";
  let ws = "";
  let k: any;
  let ALICE = "";
  let aliceKey = "";
  const evidence: Record<string, any> = { schema: "hardkas.int9.covenantTopologiesNode.v1", startedAt: new Date().toISOString(), node: {}, compiled: {}, cases: [] as CovenantTopologyCaseRecord[] };

  /** The keys of this test (the project's fixture keys): the funder by its address, and the KCC-20 holders by name. */
  const KEY_OF: Record<string, string> = {};
  const keys = {
    publicKeyOf: (a: string) => (KEY_OF[a] ? String(new k.PrivateKey(KEY_OF[a]).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase() : undefined),
    privateKeyOf: async (a: string) => {
      if (!KEY_OF[a]) throw new Error(`no key for ${a}`);
      return KEY_OF[a]!;
    }
  };

  const int = (n: number | bigint) => ({ kind: "int", value: String(n) });
  const b32 = (n: number) => ({ kind: "bytes", value: new Array(32).fill(n) });
  const arr = (states: Record<string, any>[]) => ({ kind: "array", value: states.map((s) => ({ kind: "object", value: s })) });
  const silState = (state: Record<string, any>) => Object.fromEntries(Object.entries(state).map(([f, v]) => [f, v1ArgToSil(v as any, `state.${f}`)]));

  async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; code: string; message: string }> {
    try {
      return { ok: true, value: await p };
    } catch (e: any) {
      return { ok: false, code: String(e?.code ?? "UNCODED"), message: String(e?.message ?? e).slice(0, 600) };
    }
  }

  /** `hardkas silver compile` in the workspace (the built CLI, the pinned silverc): the record reference a plan names. */
  function compile(name: string, ctor: unknown[]): { contentHash: string; artifactSha256: string; path: string } {
    fs.copyFileSync(path.join(P2, `${name}.sil`), path.join(ws, `${name}.sil`));
    fs.writeFileSync(path.join(ws, `${name}.args.json`), JSON.stringify(ctor));
    const r = spawnSync(process.execPath, [cliDist, "silver", "compile", `${name}.sil`, "--args", `${name}.args.json`, "--network", NET, "--json"], {
      cwd: ws,
      encoding: "utf8",
      env: process.env,
      timeout: 180_000
    });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    const rec = JSON.parse(r.stdout.trim());
    const ref = { contentHash: String(rec.contentHash), artifactSha256: String(rec.provenance.artifactSha256), path: path.relative(ws, rec.recordPath).replace(/\\/g, "/") };
    evidence.compiled[name] = { ...ref, compiler: rec.provenance?.compiler };
    return ref;
  }

  /** The transaction is in a block: `outpoint` listed at `address` (the network's own way of getting it mined). */
  const confirm = (address: string, outpoint: { transactionId: string; index: number }) => node.confirm(address, outpoint);

  const BODY_KEYS = ["txVersion", "inputs", "outputs", "genesisCovenantGroups", "covenantOutpoints", "nextState", "estimatedFeeSompi", "estimatedMass", "storageMass", "maxFeeSompi", "payload"];

  /** A valid plan with one thing changed, sealed again: storage mass and fee from its own amounts (the SDK's rules). */
  function reseal(valid: any, mutate: (body: any) => void): any {
    const body: any = {};
    for (const key of BODY_KEYS) if (valid[key] !== undefined) body[key] = JSON.parse(JSON.stringify(valid[key]));
    mutate(body);
    const sumIn = body.inputs.reduce((s: bigint, i: any) => s + BigInt(i.amountSompi), 0n);
    const sumOut = body.outputs.reduce((s: bigint, o: any) => s + BigInt(o.amountSompi), 0n);
    body.estimatedFeeSompi = String(sumIn - sumOut);
    body.maxFeeSompi = String(sumIn - sumOut);
    const inGroup = new Set<number>(((body.genesisCovenantGroups ?? []) as any[]).flatMap((g) => g.outputs));
    body.storageMass = String(
      v1StorageMass(
        body.inputs.map((i: any) => ({ amountSompi: BigInt(i.amountSompi), scriptBytes: String(i.scriptPublicKey).length / 2 - 2, covenantId: i.covenantId !== undefined })),
        body.outputs.map((o: any, oi: number) => ({ amountSompi: BigInt(o.amountSompi), scriptBytes: expectedScriptPublicKeyHex(o.address)!.length / 2, covenantId: Boolean(o.covenant) || inGroup.has(oi) }))
      ) ?? 0n
    );
    return createV1TxPlanArtifact({
      networkId: NET as any,
      mode: valid.mode,
      from: { input: valid.from?.input ?? valid.from.address, address: valid.from.address },
      to: { input: body.outputs[0]?.address ?? valid.to.address, address: body.outputs[0]?.address ?? valid.to.address },
      amountSompi: BigInt(body.outputs[0]?.amountSompi ?? 0),
      body,
      ctx: systemRuntimeContext
    });
  }

  /** The address of a compiled contract's template holding `state`. */
  async function templateAddress(ref: any, state: Record<string, any>): Promise<string> {
    const base = await createWorkspaceV1Facts({ workspaceRoot: ws }).contract(ref);
    const at = v1ContractFactsAtState(base, silState(state));
    return String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(at.lock.version, at.lock.script), NET));
  }

  /**
   * The plan's transaction WITHOUT F1.4: each contract input unlocked with its entry and arguments as the engine encodes
   * them (silverUnlockScript + encodeSilverEntryArgs), the transaction built by the engine's own builder, and submitted.
   */
  async function rawSubmit(plan: any): Promise<{ accepted: boolean; txId: string; reason?: string }> {
    const facts = createWorkspaceV1Facts({ workspaceRoot: ws });
    const scripts: string[] = [];
    // signer slots: the slot's key signs SIGHASH_ALL over the final transaction (the v1 sighash and the id do not cover
    // signature scripts), as the engine does — but with whatever key the plan names, unchecked
    const unsigned = buildV1WasmTransaction(k, plan);
    for (const [i, input] of (plan.inputs as any[]).entries()) {
      if (!input.contract) throw new Error(`raw builder: input ${i} is not a contract input`);
      const args = (input.contract.args as any[]).map((a, j) =>
        a?.kind === "signer"
          ? { kind: "bytes", value: silverSigFromInputSignature(String(k.createInputSignature(unsigned, i, new k.PrivateKey(KEY_OF[a.signer]!), k.SighashType.All))) }
          : v1ArgToSil(a, `input ${i}.args[${j}]`)
      );
      const base = await facts.contract(input.contract);
      const at = input.contract.state ? v1ContractFactsAtState(base, silState(input.contract.state)) : base;
      scripts[i] = silverUnlockScript(at.bytecodeHex, encodeSilverEntryArgs({ artifact: at.artifact, contractName: at.contractName, entry: input.contract.entry, args: args as any }));
    }
    const tx = buildV1WasmTransaction(k, plan, scripts);
    const { rpcTransaction, txId } = v1SignedArtifact(plan, tx);
    try {
      const res: any = await node.rpc.submitTransaction(rpcTransaction, { allowOrphan: false, expectedTxId: txId });
      return { accepted: res?.accepted !== false, txId, ...(res?.error ? { reason: String(res.error) } : {}) };
    } catch (e: any) {
      return { accepted: false, txId, reason: String(e?.message ?? e).slice(0, 600) };
    }
  }

  /** One invalid case: the engine's verdict (F1.4, no key) and the node's on the same plan. */
  async function judge(topology: string, name: string, plan: any, expectation: CovenantTopologyCaseRecord["expectation"]): Promise<CovenantTopologyCaseRecord> {
    const engine = await settle(sdk.covenants.check(plan, { keys }));
    const nodeVerdict: CovenantTopologyCaseRecord["node"] = await rawSubmit(plan);
    // what the node accepts must also be mined: its first output listed after a block
    if (nodeVerdict.accepted) {
      const listed = await confirm(plan.outputs[0].address, { transactionId: nodeVerdict.txId, index: 0 }).catch(() => undefined);
      nodeVerdict.mined = Boolean(listed);
      if (listed) nodeVerdict.listed = listedOf(plan.outputs[0].address, listed);
    }
    const engineOk = engine.ok;
    const agree = expectation === "policy: engine accepts, node rejects" ? engineOk && !nodeVerdict.accepted : engineOk === nodeVerdict.accepted;
    const rec: CovenantTopologyCaseRecord = {
      topology,
      case: name,
      expectation,
      engine: engine.ok ? { ok: true, warnings: engine.value.warnings } : { ok: false, code: engine.code, message: engine.message },
      node: nodeVerdict,
      agree
    };
    evidence.cases.push(rec);
    return rec;
  }

  /** A valid transaction through the SDK: planned, checked, signed, sent; then mined, its outputs listed by the node. */
  async function sendValid(topology: string, name: string, plan: any, outputsToConfirm: number[]) {
    const signed = await sdk.covenants.sign(plan, { keys });
    const sent = await settle(sdk.covenants.send(signed.signed));
    const rpcTx = JSON.parse(signed.signed.signedTransaction.payload);
    // a v1 send the node rejects is not thrown: it comes back with its rejection (F1.6)
    const accepted = sent.ok && (sent.value as any)?.rejection === undefined && (sent.value as any)?.submitted !== false;
    const reason = sent.ok ? ((sent.value as any)?.rejection ? JSON.stringify((sent.value as any).rejection) : undefined) : `${sent.code}: ${sent.message}`;
    const rec: CovenantTopologyCaseRecord = {
      topology,
      case: name,
      expectation: "both-accept",
      engine: { ok: true, warnings: signed.warnings },
      node: { accepted, txId: signed.txId, ...(reason ? { reason } : {}) },
      agree: accepted
    };
    evidence.cases.push(rec);
    expect(accepted, JSON.stringify(rec)).toBe(true);
    if (sent.ok && (sent.value as any)?.txId) expect(String((sent.value as any).txId).toLowerCase()).toBe(signed.txId.toLowerCase());
    const utxos = [];
    for (const i of outputsToConfirm) utxos.push(await confirm(plan.outputs[i].address, { transactionId: signed.txId, index: i }));
    rec.node.mined = true;
    if (utxos[0]) rec.node.listed = listedOf(plan.outputs[outputsToConfirm[0]!].address, utxos[0]);
    return { txId: signed.txId, utxos, rpcTx, fee: signed.feeSompi, mass: signed.mass };
  }

  beforeAll(async () => {
    node = await network.start();
    expect(node.containerName).not.toBe("hardkas-kaspad-toccata-v2");
    k = loadManagedKaspaWasmSync();
    aliceKey = node.funderPrivateKey;
    ALICE = node.funderAddress;
    KEY_OF[ALICE] = aliceKey;
    KEY_OF.alice = aliceKey;
    KEY_OF.bob = getHardkasFixtureKey("bob");
    KEY_OF.carol = getHardkasFixtureKey("carol");
    const info: any = await node.rpc.getServerInfo();
    evidence.node = {
      rpcUrl: node.rpcUrl,
      containerName: node.containerName,
      image: node.image,
      serverVersion: info.serverVersion,
      networkId: info.networkId,
      harnessRunId: process.env.HARDKAS_TEST_RUN_ID,
      ...(node.evidence ?? {})
    };
    await node.fund();

    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cov-topo-"));
    const init = spawnSync(process.execPath, [cliDist, "init", "app", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: process.env, timeout: 180_000 });
    expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
    ws = path.join(parent, "app");
    const config = {
      execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: NET } } },
      networks: { [NET]: { kind: "kaspa-node", network: NET, rpcUrl: node.rpcUrl } }
    };
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
    sdk = await Hardkas.open({ cwd: ws, network: NET });
  });

  afterAll(async () => {
    evidence.finishedAt = new Date().toISOString();
    const file = process.env[network.evidenceEnv] || path.join(os.tmpdir(), `${network.evidenceFilePrefix}-${Date.now()}.json`);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(evidence, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
      console.log(`[${network.evidenceFilePrefix}] evidence written to ${file}`);
    } catch {
      /* the evidence file is a diagnostic */
    }
    await sdk?.close?.();
    if (node) await node.stop();
    if (parent) fs.rmSync(parent, { recursive: true, force: true });
  });

  describe(`INT9-C1 · 1:N · auth fanout (Decls, to = max_outs = 3) on a real rusty-kaspad${T}`, () => {
    const CTOR = [int(3), int(10)];
    const v = (n: number) => ({ value: int(n) });
    let ref: any;
    let genesisOut: any;
    let covenantId = "";
    const contract = () => ({ compileRecord: ref, contract: "Decls", constructorArgs: CTOR });
    const input = (args: any, state?: Record<string, any>) => ({ ...contract(), entry: "__covenant_entrypoint_auth_fanout", policy: "fanout", args: [args], ...(state ? { state } : {}) });
    let firstContinuation: any;

    it("C1-G genesis of one covenant output: accepted and mined; the node indexes the covenant id the engine computed", async () => {
      ref = compile("fanout", [{ kind: "int", value: 3 }, { kind: "int", value: 10 }]);
      const plan = await sdk.covenants.planGenesis({ contract: contract() as any, outputs: [{ amountSompi: 3_000_000_000n }], funder: ALICE }, {});
      const r = await sendValid("1:N", "genesis (1 covenant output)", plan, [0]);
      genesisOut = r.utxos[0];
      covenantId = String(genesisOut.covenantId);
      expect(covenantId).toMatch(/^[0-9a-f]{64}$/);
      expect(covenantId).toBe(String(r.rpcTx.outputs[0].covenant.covenantId).toLowerCase());
    });

    let valid: any;
    it("C1-V one input, three continuations, each the template holding its state: accepted, mined, three outputs of the covenant", async () => {
      valid = await sdk.covenants.planTransition({
        covenantId,
        inputs: [{ outpoint: genesisOut.outpoint, contract: input(arr([v(3), v(3), v(4)])) as any, computeBudget: "estimate" }],
        continuations: [{ amountSompi: "rest", state: v(3) }, { amountSompi: 900_000_000n, state: v(3) }, { amountSompi: 900_000_000n, state: v(4) }]
      });
      // the invalid variants first, while the genesis output is unspent
      const fee = 10_000_000n;
      const each = (n: number) => String((3_000_000_000n - fee) / BigInt(n));
      const addr1 = await templateAddress(contract(), v(1));
      const four = reseal(valid, (b) => {
        b.outputs = [0, 1, 2, 3].map(() => ({ ...b.outputs[0], address: addr1, amountSompi: each(4) }));
        b.nextState[0].outputs = [0, 1, 2, 3];
        b.nextState[0].states = [v(1), v(1), v(1), v(1)];
        b.inputs[0].contract.args = [arr([v(1), v(1), v(1), v(1)])];
      });
      const c4 = await judge("1:N", "four continuations (max_outs = 3)", four, "both-reject");
      expect(c4.engine.code).toBe("COVENANT_LINEAGE_INVALID");

      const addr8 = await templateAddress(contract(), v(8));
      const wrongState = reseal(valid, (b) => {
        b.outputs = b.outputs.map((o: any, i: number) => ({ ...o, amountSompi: each(3), ...(i === 2 ? { address: addr8 } : {}) }));
      });
      const cs = await judge("1:N", "a continuation not holding its declared state (4 declared, 8 held)", wrongState, "both-reject");
      expect(cs.engine.code).toBe("COVENANT_SUCCESSOR_SCRIPT_MISMATCH");

      const otherId = reseal(valid, (b) => {
        b.outputs = b.outputs.map((o: any, i: number) => ({ ...o, amountSompi: each(3), ...(i === 1 ? { covenant: { authorizingInput: 0, covenantId: "ab".repeat(32) } } : {}) }));
      });
      const ci = await judge("1:N", "a continuation bound to another covenant id", otherId, "both-reject");
      expect(ci.engine.ok).toBe(false);

      const unbound = reseal(valid, (b) => {
        b.outputs = b.outputs.map((o: any, i: number) => {
          const out = { ...o, amountSompi: each(3) };
          if (i === 2) delete out.covenant;
          return out;
        });
      });
      await judge("1:N", "a declared continuation without its covenant binding", unbound, "both-reject");

      const r = await sendValid("1:N", "1 → 3 continuations", valid, [0, 1, 2]);
      for (const u of r.utxos) expect(u.covenantId).toBe(covenantId);
      expect(r.utxos.map((u: any) => u.amountSompi)).toEqual([BigInt(valid.outputs[0].amountSompi), 900_000_000n, 900_000_000n]);
      firstContinuation = r.utxos[0];
    });

    it("C1-T zero continuations on a covenant that does not declare termination: the engine warns that the policy decides; the node's verdict is recorded", async () => {
      // the first continuation holds state 3: the engine and the node judge the same plan
      const plan = await sdk.covenants.planTransition({
        covenantId,
        inputs: [{ outpoint: firstContinuation.outpoint, contract: input(arr([]), v(3)) as any, computeBudget: "estimate" }],
        continuations: [],
        payments: [{ address: ALICE, amountSompi: BigInt(firstContinuation.amountSompi) - 10_000_000n }]
      });
      const rec = await judge("1:N", "zero continuations, termination not declared", plan, "observe");
      expect(rec.engine.ok).toBe(true);
      // observed on rusty-kaspad v2.1.0 (INT9 run): the node accepts and mines it — the fanout's script does not refuse zero
      // continuations; whatever the node answers, an accepted spend must be mined
      if (rec.node.accepted) expect(rec.node.mined).toBe(true);
      expect((rec.engine.warnings ?? []).join(" ")).toMatch(/policy 'fanout' decides/);
    });
  });

  describe(`INT9-C1 · N:M · cov leader and delegate (Matrix, max_ins = max_outs = 2) on a real rusty-kaspad${T}`, () => {
    const CTOR = [int(2), int(2), int(100), b32(7)];
    const st = (amount: number, owner: number) => ({ amount: int(amount), owner: b32(owner) });
    let ref: any;
    let covenantId = "";
    let outs: any[] = [];
    const contract = () => ({ compileRecord: ref, contract: "Matrix", constructorArgs: CTOR });
    const leader = (state: Record<string, any>, fee = 0) => ({ ...contract(), entry: "__leader_step", policy: "step", args: [int(fee)], state });
    const delegate = (state: Record<string, any>) => ({ ...contract(), entry: "__delegate", policy: "step", args: [], state });

    it("C2-G genesis of three outputs of one covenant, each in its own state: accepted, mined, one covenant id on all three", async () => {
      ref = compile("matrix", [{ kind: "int", value: 2 }, { kind: "int", value: 2 }, { kind: "int", value: 100 }, { kind: "bytes", value: new Array(32).fill(7) }]);
      const plan = await sdk.covenants.planGenesis(
        { contract: contract() as any, outputs: [{ amountSompi: 2_000_000_000n, state: st(100, 7) }, { amountSompi: 1_000_000_000n, state: st(50, 8) }, { amountSompi: 500_000_000n, state: st(10, 9) }], funder: ALICE } as any,
        {}
      );
      const r = await sendValid("N:M", "genesis (3 covenant outputs, 3 states)", plan, [0, 1, 2]);
      outs = r.utxos;
      covenantId = String(outs[0].covenantId);
      expect(new Set(outs.map((u: any) => u.covenantId))).toEqual(new Set([covenantId]));
      for (let i = 0; i < 3; i++) expect(String(r.rpcTx.outputs[i].covenant.covenantId).toLowerCase()).toBe(covenantId);
    });

    let next: any[] = [];
    it("C2-V 2:2 (leader first, delegate after it, two continuations returning the previous states): accepted and mined", async () => {
      const valid = await sdk.covenants.planTransition({
        covenantId,
        inputs: [
          { outpoint: outs[0].outpoint, contract: leader(st(100, 7)) as any, computeBudget: "estimate" },
          { outpoint: outs[1].outpoint, contract: delegate(st(50, 8)) as any, computeBudget: "estimate" }
        ],
        continuations: [{ amountSompi: "rest", state: st(100, 7) }, { amountSompi: 1_000_000_000n, state: st(50, 8) }]
      });
      const fee = 10_000_000n;
      // invalid variants of the same plan, while both inputs are unspent
      const swapped = reseal(valid, (b) => {
        b.inputs = [b.inputs[1], b.inputs[0]];
        b.inputs[0].contract = delegate(st(50, 8));
        b.inputs[1].contract = leader(st(100, 7));
        b.covenantOutpoints = b.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
        b.outputs[0].amountSompi = String(2_000_000_000n - fee);
      });
      const sw = await judge("N:M", "the delegate first, the leader after it", swapped, "both-reject");
      expect(sw.engine.code).toBe("COVENANT_LEADER_POSITION_INVALID");

      const negativeFee = reseal(valid, (b) => {
        b.inputs[0].contract = leader(st(100, 7), -1);
        b.outputs[0].amountSompi = String(2_000_000_000n - fee);
      });
      await judge("N:M", "the leader's fee argument is -1 (the policy requires fee >= 0)", negativeFee, "policy: engine accepts, node rejects");

      const otherStates = reseal(valid, (b) => {
        b.outputs[0].amountSompi = String(2_000_000_000n - fee);
      });
      const addr101 = await templateAddress(contract(), st(101, 7));
      const moved = reseal(otherStates, (b) => {
        b.outputs[0].address = addr101;
        b.nextState[0].states = [st(101, 7), st(50, 8)];
      });
      await judge("N:M", "continuations other than the previous states (the policy returns prev_states)", moved, "policy: engine accepts, node rejects");

      const r = await sendValid("N:M", "2 → 2 (leader + delegate)", valid, [0, 1]);
      next = r.utxos;
      for (const u of next) expect(u.covenantId).toBe(covenantId);
    });

    it("C2-N three inputs of the covenant (max_ins = 2): refused by the engine and by the node", async () => {
      // a valid 2:2 plan over the two continuations, then a third input of the same covenant added
      const base = await sdk.covenants.planTransition({
        covenantId,
        inputs: [
          { outpoint: next[0].outpoint, contract: leader(st(100, 7)) as any, computeBudget: "estimate" },
          { outpoint: next[1].outpoint, contract: delegate(st(50, 8)) as any, computeBudget: "estimate" }
        ],
        continuations: [{ amountSompi: "rest", state: st(100, 7) }, { amountSompi: 1_000_000_000n, state: st(50, 8) }]
      });
      const addr109 = await templateAddress(contract(), st(10, 9));
      expect(expectedScriptPublicKeyHex(addr109)).toBe(outs[2].scriptPublicKey.script);
      const three = reseal(base, (b) => {
        b.inputs.push({
          ...b.inputs[1],
          outpoint: { transactionId: outs[2].outpoint.transactionId, index: outs[2].outpoint.index },
          amountSompi: String(outs[2].amountSompi),
          address: addr109,
          scriptPublicKey: outs[2].scriptPublicKey.version.toString(16).padStart(4, "0") + outs[2].scriptPublicKey.script,
          blockDaaScore: String(outs[2].blockDaaScore),
          contract: delegate(st(10, 9))
        });
        b.covenantOutpoints = b.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
        // the policy returns the previous states: three continuations, the leader's paying the fee
        b.outputs = [
          { ...b.outputs[0], amountSompi: String(BigInt(b.inputs[0].amountSompi) - 10_000_000n) },
          { ...b.outputs[1], amountSompi: String(b.inputs[1].amountSompi) },
          { ...b.outputs[1], address: addr109, amountSompi: String(outs[2].amountSompi) }
        ];
        b.nextState[0].outputs = [0, 1, 2];
        b.nextState[0].states = [st(100, 7), st(50, 8), st(10, 9)];
      });
      const rec = await judge("N:M", "three inputs of the covenant (max_ins = 2)", three, "both-reject");
      expect(rec.engine.ok).toBe(false);
    });
  });

  describe(`INT9-C1 · termination · a singleton that declares termination = allowed (Matrix) on a real rusty-kaspad${T}`, () => {
    const CTOR = [int(100), b32(7)];
    const st = (amount: number) => ({ amount: int(amount), owner: b32(7) });
    let ref: any;
    let covenantId = "";
    let current: any;
    const contract = () => ({ compileRecord: ref, contract: "Matrix", constructorArgs: CTOR });
    const step = (states: Record<string, any>[], state?: Record<string, any>) => ({ ...contract(), entry: "__covenant_entrypoint_auth_step", policy: "step", args: [arr(states)], ...(state ? { state } : {}) });

    it("C3-G genesis, then one continuation (100 → 99): accepted and mined", async () => {
      ref = compile("terminable", [{ kind: "int", value: 100 }, { kind: "bytes", value: new Array(32).fill(7) }]);
      const g = await sendValid("termination", "genesis (1 covenant output)", await sdk.covenants.planGenesis({ contract: contract() as any, outputs: [{ amountSompi: 2_000_000_000n }], funder: ALICE }, {}), [0]);
      covenantId = String(g.utxos[0].covenantId);
      const plan = await sdk.covenants.planTransition({
        covenantId,
        inputs: [{ outpoint: g.utxos[0].outpoint, contract: step([st(99)]) as any, computeBudget: "estimate" }],
        continuations: [{ amountSompi: "rest", state: st(99) }]
      });
      // a singleton with two continuations: both refuse
      const two = reseal(plan, (b) => {
        const half = String((2_000_000_000n - 10_000_000n) / 2n);
        b.outputs = [{ ...b.outputs[0], amountSompi: half }, { ...b.outputs[0], amountSompi: half }];
        b.nextState[0].outputs = [0, 1];
        b.nextState[0].states = [st(99), st(99)];
        b.inputs[0].contract = step([st(99), st(99)]);
      });
      const rec = await judge("termination", "two continuations of a singleton", two, "both-reject");
      expect(rec.engine.code).toBe("COVENANT_LINEAGE_INVALID");
      const r = await sendValid("termination", "1 → 1 continuation", plan, [0]);
      current = r.utxos[0];
      expect(current.covenantId).toBe(covenantId);
    });

    it("C3-T zero continuations: the covenant ends, its value paid out; accepted, mined, and no output of the covenant remains", async () => {
      const plan = await sdk.covenants.planTransition({
        covenantId,
        inputs: [{ outpoint: current.outpoint, contract: step([], st(99)) as any, computeBudget: "estimate" }],
        continuations: [],
        payments: [{ address: ALICE, amountSompi: BigInt(current.amountSompi) - 10_000_000n }]
      });
      const r = await sendValid("termination", "1 → 0 (termination, value to a payment)", plan, [0]);
      expect(r.utxos[0].covenantId).toBeUndefined();
      const left = (await node.rpc.getUtxosByAddress(String(plan.inputs[0].address))).filter((u: any) => String(u.outpoint.transactionId).toLowerCase() === String(current.outpoint.transactionId));
      expect(left).toEqual([]);
    });
  });

  describe(`INT9-C1/C3 · KCC-20 (silverscript v1.0.0 example) · signed cov N:M transfer with a delegate, end to end through the SDK, on a real rusty-kaspad${T}`, () => {
    const xonlyBytes = (name: string) => Array.from(Buffer.from(String(new k.PrivateKey(KEY_OF[name]!).toPublicKey().toXOnlyPublicKey().toString()), "hex"));
    const st = (owner: string, amount: number, isMinter = false) => ({
      ownerIdentifier: { kind: "bytes", value: xonlyBytes(owner) },
      identifierType: { kind: "byte", value: 0 },
      amount: int(amount),
      isMinter: { kind: "bool", value: isMinter }
    });
    let ref: any;
    let ctor: any[] = [];
    let covenantId = "";
    let g: any[] = [];
    const contract = () => ({ compileRecord: ref, contract: "KCC20", constructorArgs: ctor });
    const leader = (state: any, newStates: any[], signer: string) => ({ ...contract(), entry: "__leader_transfer", policy: "transfer", args: [arr(newStates), { kind: "signer", signer }, { kind: "byte", value: 0 }], state });
    const delegate = (state: any, signer: string) => ({ ...contract(), entry: "__delegate", policy: "transfer", args: [{ kind: "signer", signer }, { kind: "byte", value: 0 }], state });

    it("C4-G genesis of two token outputs (alice 600, bob 400) of one covenant: accepted, mined, one covenant id", async () => {
      ctor = [{ kind: "bytes", value: xonlyBytes("alice") }, int(1000), { kind: "byte", value: 0 }, { kind: "bool", value: false }, int(2), int(2)];
      ref = compile("kcc20", [{ kind: "bytes", value: xonlyBytes("alice") }, { kind: "int", value: 1000 }, { kind: "byte", value: 0 }, { kind: "bool", value: false }, { kind: "int", value: 2 }, { kind: "int", value: 2 }]);
      const plan = await sdk.covenants.planGenesis({ contract: contract() as any, outputs: [{ amountSompi: 1_000_000_000n, state: st("alice", 600) }, { amountSompi: 1_000_000_000n, state: st("bob", 400) }], funder: ALICE } as any, {});
      const r = await sendValid("KCC-20 N:M", "genesis (2 token outputs)", plan, [0, 1]);
      g = r.utxos;
      covenantId = String(g[0].covenantId);
      expect(g[1].covenantId).toBe(covenantId);
    });

    it("C4-V alice's leader (signed by alice) and bob's delegate (signed by bob) → carol 700 + alice 300: accepted and mined; conservation, minting and a foreign signature refused by the node", async () => {
      const out = [st("carol", 700), st("alice", 300)];
      const valid = await sdk.covenants.planTransition({
        covenantId,
        inputs: [
          { outpoint: g[0].outpoint, contract: leader(st("alice", 600), out, "alice") as any, computeBudget: "estimate" },
          { outpoint: g[1].outpoint, contract: delegate(st("bob", 400), "bob") as any, computeBudget: "estimate" }
        ],
        continuations: [{ amountSompi: "rest", state: out[0]! }, { amountSompi: 1_000_000_000n, state: out[1]! }]
      });
      const fee = 10_000_000n;
      const variant = async (states: any[], name: string, expectation: CovenantTopologyCaseRecord["expectation"], delegateSigner = "bob") => {
        const a0 = await templateAddress(contract(), states[0]);
        const a1 = await templateAddress(contract(), states[1]);
        const plan = reseal(valid, (b) => {
          b.inputs[0].contract = leader(st("alice", 600), states, "alice");
          b.inputs[1].contract = delegate(st("bob", 400), delegateSigner);
          b.outputs[0] = { ...b.outputs[0], address: a0, amountSompi: String(1_000_000_000n - fee) };
          b.outputs[1] = { ...b.outputs[1], address: a1 };
          b.nextState[0].states = states;
        });
        return judge("KCC-20 N:M", name, plan, expectation);
      };
      await variant([st("carol", 701), st("alice", 300)], "amounts not conserved (1000 in, 1001 out)", "policy: engine accepts, node rejects");
      await variant([st("carol", 700, true), st("alice", 300)], "a non-minter creates a minter output", "policy: engine accepts, node rejects");
      const foreign = await variant(out, "bob's delegate signed with alice's key", "both-reject", "alice");
      expect(foreign.engine.code).toBe("SIGNER_SLOT_KEY_MISMATCH");

      const r = await sendValid("KCC-20 N:M", "2 → 2 signed transfer (leader + delegate)", valid, [0, 1]);
      for (const u of r.utxos) expect(u.covenantId).toBe(covenantId);
    });
  });

  describe(`INT9-C1 · summary${T}`, () => {
    it("every case the engine and the node judged agrees with its expectation", () => {
      const disagreements = (evidence.cases as CovenantTopologyCaseRecord[]).filter((c) => c.expectation !== "observe" && !c.agree);
      expect(disagreements, JSON.stringify(disagreements, null, 2)).toEqual([]);
    });
  });

  return {
    evidence,
    cliDist,
    node: () => node,
    workspace: () => ws
  };
}
