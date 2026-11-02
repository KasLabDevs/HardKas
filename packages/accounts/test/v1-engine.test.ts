import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import { createV1TxPlanArtifact } from "@hardkas/artifacts";
import { v1StorageMass, type V1PlanBody } from "@hardkas/tx-builder";
import {
  buildV1Transaction,
  v1ContractFactsFromArtifact,
  v1SuccessorFactsFromArtifact,
  validateV1Transition,
  type V1ContractFacts,
  type V1NodeUtxo,
  type V1SuccessorFacts
} from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// F1.3 + F1.4 + F1.5 · the v1 engine, offline. Facts come from the corpus artifacts (silverc v1.0.0, the same bytes the
// pinned compiler reproduces) and the official parser's ASTs; the node is a map of what it lists. Positives: the corpus
// Counter transition is rebuilt with its exact txid (611cd372…) and signature script (sha256 d03f34c3…); a genesis
// funded by a P2PK input gets the corpus covenant id. Negatives: the F1.4 matrix, each with its code, and never a key
// resolved for a plan the validator refuses. kaspa-wasm (pinned) only; no network, no silverc.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const CORPUS = path.join(repoRoot, "fixtures", "toccata-v2", "silver");
const AST = path.join(__dirname, "fixtures", "v1-engine");
const json = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-10-26T00:00:00.000Z") } } as any;

const FIXTURE_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const FIXTURE_XONLY = "dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659";
const FIXTURE = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const FIXTURE_SPK = `000020${FIXTURE_XONLY}ac`;
const COVENANT_ID = "c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd";
const COUNTER_ADDR = "kaspasim:pqt8xhg7hqt0a6qa4ke6f599dtdse8g02jaca3syhncp0m2akhu8737p5jrg8";
const COUNTER_SPK = "0000aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87";
const SUCCESSOR_ADDR = "kaspasim:pzdzrdpjj4yt94nlv22z6e0txt0ay5386l0h4lxt8f0fhwfzugdvg7qze9dl5";
const GENESIS_TX = "3b93691ca6ea47a6601e12559b6195a8c38bb1821b596cc6cd2ad4d3e2f6b917";
const FUNDING = { transactionId: "7294c339a1b6c5a0e0e9e2a31cbeae4bbeeeca0520f100f9029b75d8d5de4d09", index: 1 };
const COUNTER_RECORD = { contentHash: "a".repeat(64), artifactSha256: "e72250b3be50bb0f7f54b1a51e1ff6ba2aa6f5be6de6a91d584c519df930aef3" };
const SUCCESSOR_SHA = "fb9b122142c1f6244360df72ee687820d52b4c894b1938e8ac379d8a11a206c7";
const RELEASE_RECORD = { contentHash: "b".repeat(64), artifactSha256: "c".repeat(64) };

let k: any;
let counter: V1ContractFacts;
let successor: V1SuccessorFacts;
let release: V1ContractFacts;
let releaseOwner = "";
let releaseAddr = "";
let releaseSpk = "";

beforeAll(() => {
  k = loadManagedKaspaWasmSync();
  counter = v1ContractFactsFromArtifact({
    compileRecordHash: COUNTER_RECORD.contentHash,
    artifactSha256: COUNTER_RECORD.artifactSha256,
    artifact: json(path.join(CORPUS, "covenant-counter-transition", "current.artifact.json")),
    contractName: "Counter",
    constructorArgs: [{ kind: "int", value: 7n }],
    ast: json(path.join(AST, "counter.ast.json"))
  });
  successor = v1SuccessorFactsFromArtifact({ artifact: json(path.join(CORPUS, "covenant-counter-transition", "successor.artifact.json")), artifactSha256: SUCCESSOR_SHA, contractName: "Counter", constructorArgs: [{ kind: "int", value: 12n }] });
  const ownerBytes = json(path.join(CORPUS, "p2sh-signed-release", "contract.constructor-args.json"))[0].value as number[];
  releaseOwner = Buffer.from(ownerBytes).toString("hex");
  release = v1ContractFactsFromArtifact({
    compileRecordHash: RELEASE_RECORD.contentHash,
    artifactSha256: RELEASE_RECORD.artifactSha256,
    artifact: json(path.join(CORPUS, "p2sh-signed-release", "contract.artifact.json")),
    contractName: "SignedRelease",
    constructorArgs: [{ kind: "bytes", value: Uint8Array.from(ownerBytes) }],
    ast: json(path.join(AST, "signed-release.ast.json"))
  });
  releaseSpk = release.lock.version.toString(16).padStart(4, "0") + release.lock.script;
  releaseAddr = k.addressFromScriptPublicKey(new k.ScriptPublicKey(release.lock.version, release.lock.script), "simnet").toString();
});

const counterRef = (args: any[] = [{ kind: "int", value: "5" }], extra: Record<string, unknown> = {}) => ({ compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }], entry: "__covenant_entrypoint_auth_bump", policy: "bump", args, ...extra });

const transitionBody = (): V1PlanBody => ({
  txVersion: 1,
  inputs: [{ outpoint: { transactionId: GENESIS_TX, index: 0 }, amountSompi: "1000000000", address: COUNTER_ADDR, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID, kind: "covenant", computeBudget: 0, contract: counterRef() as any }],
  outputs: [{ address: SUCCESSOR_ADDR, amountSompi: "999699900", covenant: { authorizingInput: 0, covenantId: COVENANT_ID } }],
  covenantOutpoints: [`${GENESIS_TX}:0`],
  nextState: [{ covenantId: COVENANT_ID, input: 0, outputs: [0], successor: { artifactSha256: SUCCESSOR_SHA, constructorArgs: [{ kind: "int", value: "12" }], stateToConstructorArg: { value: 0 }, state: { value: { kind: "int", value: "12" } } } }],
  estimatedFeeSompi: "300100",
  estimatedMass: "719",
  storageMass: "1",
  maxFeeSompi: "1000000"
});

const GENESIS_FUNDING = 4_000_000_000n;
const genesisBody = (fee = 408_300n): V1PlanBody => {
  const change = GENESIS_FUNDING - 1_000_000_000n - fee;
  const storage = v1StorageMass(
    [{ amountSompi: GENESIS_FUNDING, scriptBytes: 34, covenantId: false }],
    [{ amountSompi: 1_000_000_000n, scriptBytes: 35, covenantId: true }, { amountSompi: change, scriptBytes: 34, covenantId: false }]
  )!;
  return {
    txVersion: 1,
    inputs: [{ outpoint: FUNDING, amountSompi: String(GENESIS_FUNDING), address: FIXTURE, scriptPublicKey: FIXTURE_SPK, kind: "p2pk", computeBudget: 10, signer: "fixture" }],
    outputs: [{ address: COUNTER_ADDR, amountSompi: "1000000000" }, { address: FIXTURE, amountSompi: String(change), role: "change" }],
    genesisCovenantGroups: [{ authorizingInput: 0, outputs: [0], contract: { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] }, covenantId: COVENANT_ID }],
    estimatedFeeSompi: String(fee),
    estimatedMass: "2083",
    storageMass: String(storage),
    maxFeeSompi: "1000000"
  };
};

const seal = (body: V1PlanBody, to: string) => createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "fixture", address: FIXTURE }, to: { input: "to", address: to }, amountSompi: BigInt(body.outputs[0]!.amountSompi), body, ctx });

const nodeWith = (entries: Array<[string, V1NodeUtxo]>, networkId = "simnet") => ({ networkId, utxosByAddresses: async () => new Map(entries) });
const transitionNode = () => nodeWith([[`${GENESIS_TX}:0`, { amountSompi: 1_000_000_000n, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID }]]);
const genesisNode = () => nodeWith([[`${FUNDING.transactionId}:${FUNDING.index}`, { amountSompi: GENESIS_FUNDING, scriptPublicKey: FIXTURE_SPK }]]);
const facts = (over: { contract?: (ref: any) => V1ContractFacts; successor?: () => V1SuccessorFacts } = {}) => ({
  contract: async (ref: any) => (over.contract ? over.contract(ref) : ref.compileRecord.contentHash === COUNTER_RECORD.contentHash ? counter : release),
  successor: async () => (over.successor ? over.successor() : successor)
});
const keys = (map: Record<string, { pub?: string; priv?: string }> = { fixture: { pub: FIXTURE_XONLY, priv: FIXTURE_KEY } }) => {
  const resolved: string[] = [];
  return {
    resolved,
    publicKeyOf: (a: string) => map[a]?.pub,
    privateKeyOf: async (a: string) => {
      resolved.push(a);
      return map[a]?.priv ?? "";
    }
  };
};
const sha = (hex: string) => crypto.createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
const settle = <T>(p: Promise<T>) => p.then((value) => ({ value, error: undefined as any }), (error) => ({ value: undefined as T | undefined, error }));

describe("F1.5 · the engine rebuilds the corpus", () => {
  it("E-1 the Counter transition: txid 611cd372…, signature script d03f34c3…, no key resolved (it has no signature)", async () => {
    const plan = seal(transitionBody(), SUCCESSOR_ADDR);
    const ks = keys({});
    const r = await buildV1Transaction({ plan, node: transitionNode(), facts: facts(), keys: ks });
    expect(r.txId).toBe("611cd372b448fbce17b3683e710be193dbd78380bde8845fa5ededfaec75ac54");
    expect(sha(r.signatureScripts[0]!)).toBe("d03f34c3a0a33d8c5470fa08c492809c198dfa9187f505218a4ea99a28d5ed20");
    expect(ks.resolved).toEqual([]);
    expect(r.validation.feeSompi).toBe(300_100n);
    expect(r.validation.mass.minimumFeeSompi).toBe(71_900n);
    expect(r.signed.schema).toBe("hardkas.signedTx");
    expect(r.signed.sourcePlanId).toBe(plan.planId);
    expect(r.signed.txId).toBe(r.txId);
    expect(r.rpcTransaction.outputs[0].covenant).toBeDefined();
  });

  it("E-2 a genesis funded by a P2PK input (budget 10): the corpus covenant id, a 66-byte Schnorr signature script, the fixture key resolved once", async () => {
    const plan = seal(genesisBody(), COUNTER_ADDR);
    const ks = keys();
    const r = await buildV1Transaction({ plan, node: genesisNode(), facts: facts(), keys: ks });
    expect(String(r.transaction.outputs[0].covenant.covenantId)).toBe(COVENANT_ID);
    expect(r.signatureScripts[0]).toMatch(/^41[0-9a-f]{128}01$/);
    expect(ks.resolved).toEqual(["fixture"]);
    expect(r.validation.mass.computeMass).toBe(2083n);
    expect(r.validation.mass.minimumFeeSompi).toBe(208_300n);
    expect(r.validation.mass.storageMass).toBe(4083n);
  });

  it("E-3 the genesis at the node's floor (208,300) is accepted by the validator; one sompi less is not", async () => {
    const ok = await settle(buildV1Transaction({ plan: seal(genesisBody(208_300n), COUNTER_ADDR), node: genesisNode(), facts: facts(), keys: keys() }));
    expect(ok.error).toBeUndefined();
    const ks = keys();
    const low = await settle(buildV1Transaction({ plan: seal(genesisBody(208_299n), COUNTER_ADDR), node: genesisNode(), facts: facts(), keys: ks }));
    expect(low.error?.code).toBe("FEE_BELOW_V1_FLOOR");
    expect(ks.resolved).toEqual([]);
  });

  it("E-4 a plan whose identity does not verify is refused before the node is read", async () => {
    const plan: any = seal(transitionBody(), SUCCESSOR_ADDR);
    plan.outputs[0].amountSompi = "999699901";
    let reads = 0;
    const r = await settle(buildV1Transaction({ plan, node: { networkId: "simnet", utxosByAddresses: async () => { reads++; return new Map(); } }, facts: facts(), keys: keys() }));
    expect(r.error?.code).toBe("V1_PLAN_IDENTITY_INVALID");
    expect(reads).toBe(0);
  });

  it("E-5 mainnet: refused before the node is read (MAINNET_SIGNING_DISABLED)", async () => {
    let reads = 0;
    const r = await settle(buildV1Transaction({ plan: seal(transitionBody(), SUCCESSOR_ADDR), node: { networkId: "mainnet", utxosByAddresses: async () => { reads++; return new Map(); } }, facts: facts(), keys: keys() }));
    expect(r.error?.code).toBe("MAINNET_SIGNING_DISABLED");
    expect(reads).toBe(0);
  });
});

describe("F1.3 · keys are checked again when resolved (defense in depth)", () => {
  it("A-1 a resolved key that does not control the P2PK input: PRIVATE_KEY_DOES_NOT_CONTROL_INPUT", async () => {
    const r = await settle(buildV1Transaction({ plan: seal(genesisBody(), COUNTER_ADDR), node: genesisNode(), facts: facts(), keys: keys({ fixture: { pub: FIXTURE_XONLY, priv: "11".repeat(32) } }) }));
    expect(r.error?.code).toBe("PRIVATE_KEY_DOES_NOT_CONTROL_INPUT");
  });

  it("A-2 no key for an account the plan needs: MISSING_INPUT_AUTHORIZER", async () => {
    const r = await settle(buildV1Transaction({ plan: seal(genesisBody(), COUNTER_ADDR), node: genesisNode(), facts: facts(), keys: keys({ fixture: { pub: FIXTURE_XONLY } }) }));
    expect(r.error?.code).toBe("MISSING_INPUT_AUTHORIZER");
  });

  it("A-3 a signature slot whose resolved key is not the contract's: SIGNER_SLOT_KEY_MISMATCH (the slot validated against the store's public key)", async () => {
    const body: V1PlanBody = {
      txVersion: 1,
      inputs: [{ outpoint: { transactionId: "d".repeat(64), index: 0 }, amountSompi: "200000000", address: releaseAddr, scriptPublicKey: releaseSpk, kind: "p2sh", computeBudget: 10, contract: { compileRecord: RELEASE_RECORD, contract: "SignedRelease", constructorArgs: [{ kind: "bytes", value: Buffer.from(releaseOwner, "hex").toJSON().data }], entry: "release", args: [{ kind: "signer", signer: "owner" }] } as any }],
      outputs: [{ address: FIXTURE, amountSompi: "199000000", role: "payment" }],
      estimatedFeeSompi: "1000000",
      estimatedMass: "0",
      storageMass: "0",
      maxFeeSompi: "2000000"
    };
    const storage = v1StorageMass([{ amountSompi: 200_000_000n, scriptBytes: 35, covenantId: false }], [{ amountSompi: 199_000_000n, scriptBytes: 34, covenantId: false }])!;
    const plan = seal({ ...body, storageMass: String(storage) }, FIXTURE);
    const node = nodeWith([[`${"d".repeat(64)}:0`, { amountSompi: 200_000_000n, scriptPublicKey: releaseSpk }]]);
    const r = await settle(buildV1Transaction({ plan, node, facts: facts(), keys: keys({ owner: { pub: releaseOwner, priv: "22".repeat(32) } }) }));
    expect(r.error?.code).toBe("SIGNER_SLOT_KEY_MISMATCH");
  });
});

describe("F1.4 · the validator's negative matrix (each mutation, its code; never a key)", () => {
  const base = () => JSON.parse(JSON.stringify({ ...transitionBody(), schema: "hardkas.txPlan", networkId: "simnet", from: { address: FIXTURE }, to: { address: SUCCESSOR_ADDR } }));
  const gbase = () => JSON.parse(JSON.stringify({ ...genesisBody(), schema: "hardkas.txPlan", networkId: "simnet", from: { address: FIXTURE }, to: { address: COUNTER_ADDR } }));
  const nodeT = (over: Partial<V1NodeUtxo> | null = {}) => ({ networkId: "simnet", utxos: new Map(over === null ? [] : [[`${GENESIS_TX}:0`, { amountSompi: 1_000_000_000n, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID, ...over }]]) });
  const nodeG = (over: Partial<V1NodeUtxo> = {}) => ({ networkId: "simnet", utxos: new Map([[`${FUNDING.transactionId}:${FUNDING.index}`, { amountSompi: GENESIS_FUNDING, scriptPublicKey: FIXTURE_SPK, ...over }]]) });
  const run = (plan: any, opts: { node?: any; facts?: (ref: any) => V1ContractFacts | undefined; successor?: () => V1SuccessorFacts | undefined; pub?: Record<string, string> } = {}) => {
    try {
      validateV1Transition({
        plan,
        node: opts.node ?? (plan.genesisCovenantGroups ? nodeG() : nodeT()),
        facts: opts.facts ?? ((ref: any) => (ref.compileRecord.contentHash === COUNTER_RECORD.contentHash ? counter : undefined)),
        successor: opts.successor ?? (() => successor),
        publicKeyOf: (a) => (opts.pub ?? { fixture: FIXTURE_XONLY })[a]
      });
      return "VALID";
    } catch (e: any) {
      return e.code ?? `UNCODED: ${e.message}`;
    }
  };
  const withCounter = (patch: (c: any) => void) => {
    const c = JSON.parse(JSON.stringify(json(path.join(CORPUS, "covenant-counter-transition", "current.artifact.json"))));
    patch(c);
    return v1ContractFactsFromArtifact({ compileRecordHash: COUNTER_RECORD.contentHash, artifactSha256: COUNTER_RECORD.artifactSha256, artifact: c, contractName: "Counter", constructorArgs: [{ kind: "int", value: 7n }], ast: json(path.join(AST, "counter.ast.json")) });
  };

  it("V-0 controls: the corpus transition and the genesis are valid", () => {
    expect(run(base())).toBe("VALID");
    expect(run(gbase())).toBe("VALID");
  });

  const cases: Array<[string, () => string, string]> = [
    ["invalid shape (budget outside u16)", () => run({ ...base(), inputs: [{ ...base().inputs[0], computeBudget: 70000 }] }), "V1_PLAN_INVALID"],
    ["input absent or already spent at the node", () => run(base(), { node: nodeT(null) }), "INPUT_NOT_UNSPENT"],
    ["input that differs from the node (amount)", () => run(base(), { node: nodeT({ amountSompi: 1n }) }), "INPUT_DIFFERS_FROM_NODE"],
    ["input that differs from the node (covenant id)", () => run(base(), { node: nodeT({ covenantId: "e".repeat(64) }) }), "INPUT_DIFFERS_FROM_NODE"],
    ["a covenant UTXO declared as a P2SH contract input", () => { const p = base(); delete p.inputs[0].covenantId; p.inputs[0].kind = "p2sh"; delete p.covenantOutpoints; delete p.nextState; p.outputs[0] = { address: SUCCESSOR_ADDR, amountSompi: "999699900", role: "payment" }; return run(p); }, "COVENANT_INPUT_UNDECLARED"],
    ["a contract without a compile record", () => run(base(), { facts: () => undefined }), "SILVER_RECORD_NOT_REPRODUCED"],
    ["a record silverc does not reproduce (other artifact digest)", () => run(base(), { facts: () => ({ ...counter, artifactSha256: "f".repeat(64) }) }), "SILVER_RECORD_NOT_REPRODUCED"],
    ["a covenant UTXO at a P2PK address", () => run(gbase(), { node: nodeG({ covenantId: COVENANT_ID }) }), "COVENANT_P2PK_INPUT_NOT_SUPPORTED"],
    ["a 1:N declaration planned with a recompiled (1:1) successor", () => run(base(), { facts: () => ({ ...counter, declarations: [{ ...counter.declarations[0]!, to: 2 }] }) }), "V1_PLAN_INVALID"],
    ["an artifact naming a delegate entry it lacks", () => run(base(), { facts: () => withCounter((c) => { c.contracts.Counter.delegate_entry_abi = "__delegate"; }) }), "SILVER_ARTIFACT_INCONSISTENT"],
    ["no continuation, termination not declared", () => { const p = base(); p.outputs[0] = { address: SUCCESSOR_ADDR, amountSompi: "999699900", role: "payment" }; return run(p); }, "COVENANT_TERMINATION_NOT_DECLARED"],
    ["no continuation and no next state, termination not declared", () => { const p = base(); p.outputs[0] = { address: SUCCESSOR_ADDR, amountSompi: "999699900", role: "payment" }; delete p.nextState; return run(p); }, "COVENANT_TERMINATION_NOT_DECLARED"],
    ["the continuation bound to another covenant id", () => { const p = base(); p.outputs[0].covenant.covenantId = "e".repeat(64); return run(p); }, "COVENANT_LINEAGE_INVALID"],
    ["authorizingInput naming another input", () => { const p = base(); p.inputs.push({ outpoint: FUNDING, amountSompi: "4000000000", address: FIXTURE, scriptPublicKey: FIXTURE_SPK, kind: "p2pk", computeBudget: 10, signer: "fixture" }); p.outputs[0].covenant.authorizingInput = 1; p.outputs.push({ address: FIXTURE, amountSompi: "4000000000", role: "change" }); return run(p, { node: { networkId: "simnet", utxos: new Map([...nodeT().utxos, ...nodeG().utxos]) } }); }, "COVENANT_LINEAGE_INVALID"],
    ["two outputs with the covenant's id", () => { const p = base(); p.outputs.push({ ...p.outputs[0], amountSompi: "1" }); p.outputs[0].amountSompi = "999699899"; return run(p); }, "COVENANT_LINEAGE_INVALID"],
    ["a binding with neither input nor genesis", () => { const p = base(); p.outputs.push({ address: SUCCESSOR_ADDR, amountSompi: "1", covenant: { authorizingInput: 0, covenantId: "e".repeat(64) } }); p.outputs[0].amountSompi = "999699899"; return run(p); }, "COVENANT_BINDING_ORPHAN"],
    ["a genesis id that does not match", () => { const p = gbase(); p.genesisCovenantGroups[0].covenantId = "e".repeat(64); return run(p); }, "COVENANT_GENESIS_ID_MISMATCH"],
    ["a genesis output with another script", () => { const p = gbase(); p.outputs[0].address = SUCCESSOR_ADDR; delete p.genesisCovenantGroups[0].covenantId; return run(p); }, "COVENANT_GENESIS_SCRIPT_MISMATCH"],
    ["a successor of another template", () => run(base(), { successor: () => ({ ...successor, templateHash: "0".repeat(64) }) }), "SILVER_SUCCESSOR_TEMPLATE_CHANGED"],
    ["a successor equal to the current state", () => run(base(), { successor: () => ({ ...successor, bytecodeHex: counter.bytecodeHex }) }), "SILVER_SUCCESSOR_STATE_UNCHANGED"],
    ["a successor other than the declared one", () => { const p = base(); p.nextState[0].successor.artifactSha256 = "0".repeat(64); return run(p); }, "COVENANT_SUCCESSOR_SCRIPT_MISMATCH"],
    ["the continuation not at the successor's address", () => { const p = base(); p.outputs[0].address = COUNTER_ADDR; return run(p); }, "COVENANT_SUCCESSOR_SCRIPT_MISMATCH"],
    ["an unlock through another entry", () => { const p = base(); p.inputs[0].contract.entry = "bump"; return run(p); }, "COVENANT_UNLOCK_MISMATCH"],
    ["an unlock with other arguments", () => { const p = base(); p.inputs[0].contract.args = [{ kind: "int", value: "5" }, { kind: "int", value: "1" }]; return run(p); }, "COVENANT_UNLOCK_MISMATCH"],
    ["an extra output to a third party", () => { const p = base(); p.outputs.push({ address: FIXTURE, amountSompi: "100" }); p.outputs[0].amountSompi = "999699800"; return run(p); }, "V1_OUTPUT_UNDECLARED"],
    ["change to someone other than the funder", () => { const p = gbase(); p.outputs[1].address = SUCCESSOR_ADDR; return run(p); }, "V1_OUTPUT_UNDECLARED"],
    ["a fee below the node's floor", () => { const p = base(); p.outputs[0].amountSompi = String(1_000_000_000n - 71_899n); p.estimatedFeeSompi = "71899"; p.storageMass = "1"; return run(p); }, "FEE_BELOW_V1_FLOOR"],
    ["a fee above the plan's limit", () => run({ ...base(), maxFeeSompi: "300099" }), "FEE_EXCEEDS_MAX"],
    ["a declared storage mass the node would not compute", () => run({ ...base(), storageMass: "0" }), "V1_PLAN_INVALID"],
    ["another network", () => run(base(), { node: { ...nodeT(), networkId: "testnet-10" } }), "V1_NETWORK_MISMATCH"],
    ["mainnet", () => run({ ...base(), networkId: "mainnet" }), "MAINNET_SIGNING_DISABLED"],
    ["a P2PK input whose account does not hold the key", () => run(gbase(), { pub: { fixture: "11".repeat(32) } }), "PRIVATE_KEY_DOES_NOT_CONTROL_INPUT"]
  ];
  for (const [name, fn, expected] of cases) {
    it(`V: ${name} → ${expected}`, () => {
      expect(fn()).toBe(expected);
    });
  }

  it("V: a signature slot the contract checks against another key → SIGNER_SLOT_KEY_MISMATCH; an unknown account key → SIGNER_SLOT_KEY_UNRESOLVED", () => {
    const plan = {
      txVersion: 1, schema: "hardkas.txPlan", networkId: "simnet", from: { address: FIXTURE }, to: { address: FIXTURE },
      inputs: [{ outpoint: { transactionId: "d".repeat(64), index: 0 }, amountSompi: "200000000", address: releaseAddr, scriptPublicKey: releaseSpk, kind: "p2sh", computeBudget: 10, contract: { compileRecord: RELEASE_RECORD, contract: "SignedRelease", constructorArgs: [{ kind: "bytes", value: Array.from(Buffer.from(releaseOwner, "hex")) }], entry: "release", args: [{ kind: "signer", signer: "owner" }] } }],
      outputs: [{ address: FIXTURE, amountSompi: "199000000", role: "payment" }],
      estimatedFeeSompi: "1000000", estimatedMass: "0",
      storageMass: String(v1StorageMass([{ amountSompi: 200_000_000n, scriptBytes: 35, covenantId: false }], [{ amountSompi: 199_000_000n, scriptBytes: 34, covenantId: false }])),
      maxFeeSompi: "2000000"
    };
    const node = { networkId: "simnet", utxos: new Map([[`${"d".repeat(64)}:0`, { amountSompi: 200_000_000n, scriptPublicKey: releaseSpk }]]) };
    const f = () => release;
    expect(run(plan, { node, facts: f, pub: { owner: releaseOwner } })).toBe("VALID");
    expect(run(plan, { node, facts: f, pub: { owner: "11".repeat(32) } })).toBe("SIGNER_SLOT_KEY_MISMATCH");
    expect(run(plan, { node, facts: f, pub: {} })).toBe("SIGNER_SLOT_KEY_UNRESOLVED");
    const resolvedSig = JSON.parse(JSON.stringify(plan));
    resolvedSig.inputs[0].contract.args = [{ kind: "bytes", value: new Array(65).fill(1) }];
    expect(run(resolvedSig, { node, facts: f, pub: { owner: releaseOwner } })).toBe("V1_PLAN_INVALID");
  });
});

describe("F1.7 · a transition whose fee the funder's P2PK coin pays (the covenant keeps its whole value)", () => {
  const withFeeInput = (feeInputAddress = FIXTURE, feeInputSpk = FIXTURE_SPK) => {
    const fee = 400_000n;
    const change = GENESIS_FUNDING - fee;
    const b = transitionBody();
    const storage = v1StorageMass(
      [{ amountSompi: 1_000_000_000n, scriptBytes: 35, covenantId: true }, { amountSompi: GENESIS_FUNDING, scriptBytes: 34, covenantId: false }],
      [{ amountSompi: 1_000_000_000n, scriptBytes: 35, covenantId: true }, { amountSompi: change, scriptBytes: 34, covenantId: false }]
    )!;
    const body: V1PlanBody = {
      ...b,
      inputs: [...b.inputs, { outpoint: FUNDING, amountSompi: String(GENESIS_FUNDING), address: feeInputAddress, scriptPublicKey: feeInputSpk, kind: "p2pk", computeBudget: 10, signer: "fixture" }],
      outputs: [{ ...b.outputs[0]!, amountSompi: "1000000000" }, { address: FIXTURE, amountSompi: String(change), role: "change" }],
      estimatedFeeSompi: String(fee),
      storageMass: String(storage)
    };
    return seal(body, SUCCESSOR_ADDR);
  };
  const both = () =>
    nodeWith([
      [`${GENESIS_TX}:0`, { amountSompi: 1_000_000_000n, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID }],
      [`${FUNDING.transactionId}:${FUNDING.index}`, { amountSompi: GENESIS_FUNDING, scriptPublicKey: FIXTURE_SPK }]
    ]);

  it("FE-1 the Counter's successor keeps all 1,000,000,000 sompi; the fixture's coin pays 400,000 and takes its change", async () => {
    const ks = keys();
    const r = await buildV1Transaction({ plan: withFeeInput(), node: both(), facts: facts(), keys: ks });
    expect(r.rpcTransaction.outputs[0]).toMatchObject({ amount: "1000000000", covenant: { authorizingInput: 0, covenantId: COVENANT_ID } });
    expect(r.validation.feeSompi).toBe(400_000n);
    expect(ks.resolved).toEqual(["fixture"]);
    expect(r.signatureScripts[0]).toBe(sha256Unlock(r.signatureScripts[0]!));
    expect(r.signatureScripts[1]).toMatch(/^41[0-9a-f]{128}01$/);
  });

  it("FE-2 a P2PK input of another account than the funder: V1_FEE_INPUT_NOT_FUNDER, no key read", async () => {
    const other = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
    const ks = keys();
    const r = await settle(buildV1Transaction({ plan: withFeeInput(other), node: both(), facts: facts(), keys: ks }));
    expect(r.error?.code).toBe("V1_FEE_INPUT_NOT_FUNDER");
    expect(ks.resolved).toEqual([]);
  });
});

/** The corpus Counter unlock is the same with or without a fee input (it signs nothing): its sha256 is d03f34c3…. */
function sha256Unlock(script: string): string {
  expect(sha(script)).toBe("d03f34c3a0a33d8c5470fa08c492809c198dfa9187f505218a4ea99a28d5ed20");
  return script;
}

describe("V1-ENGINE · the payment signer never signs a v1 engine plan", () => {
  it("PS-1 a genesis plan of the engine handed to signTxPlanArtifact: V1_PLAN_REQUIRES_ENGINE, before any key is used", async () => {
    const { signTxPlanArtifact } = await import("../src/index.js");
    await expect(
      signTxPlanArtifact({
        target: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } as any,
        planArtifact: seal(genesisBody(), COUNTER_ADDR) as any,
        account: { name: "fixture", kind: "kaspa", network: "simnet", address: FIXTURE, privateKey: FIXTURE_KEY } as any
      })
    ).rejects.toMatchObject({ code: "V1_PLAN_REQUIRES_ENGINE" });
  });
});
