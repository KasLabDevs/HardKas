import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { encodeSilverEntryArgs, loadManagedKaspaWasmSync, silverUnlockScript, systemRuntimeContext } from "@hardkas/core";
import { createV1TxPlanArtifact } from "@hardkas/artifacts";
import { v1StorageMass, PENDING_SPEND_GUARANTEE, type V1PlanBody } from "@hardkas/tx-builder";
import {
  buildV1Transaction,
  checkSignedV1AgainstPlan,
  preflightV1Send,
  v1ContractFactsFromArtifact,
  v1CovenantSpendsOf,
  v1NodeUtxoOf,
  v1SuccessorFactsFromArtifact,
  type V1ContractFacts,
  type V1NodeUtxo,
  type V1SuccessorFacts
} from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// F1.6 · what a v1 send checks before the broadcast, offline: the signed transaction against its plan (each v1 field,
// then the plan's whole transaction against the signed id) and the read-only check of the inputs at the node (unspent,
// unchanged, not pending, no covenant id on a P2PK input) followed by F1.4 with the signed signature scripts. Facts from
// the corpus artifacts (no silverc); the node is a map. No key is resolved anywhere here: nothing is signed at send.
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
const GENESIS_FUNDING = 4_000_000_000n;

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

const counterRef = () => ({ compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }], entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] });
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
const genesisBody = (fee = 408_300n, withId = true): V1PlanBody => {
  const change = GENESIS_FUNDING - 1_000_000_000n - fee;
  const storage = v1StorageMass(
    [{ amountSompi: GENESIS_FUNDING, scriptBytes: 34, covenantId: false }],
    [{ amountSompi: 1_000_000_000n, scriptBytes: 35, covenantId: true }, { amountSompi: change, scriptBytes: 34, covenantId: false }]
  )!;
  return {
    txVersion: 1,
    inputs: [{ outpoint: FUNDING, amountSompi: String(GENESIS_FUNDING), address: FIXTURE, scriptPublicKey: FIXTURE_SPK, kind: "p2pk", computeBudget: 10, signer: "fixture" }],
    outputs: [{ address: COUNTER_ADDR, amountSompi: "1000000000" }, { address: FIXTURE, amountSompi: String(change), role: "change" }],
    genesisCovenantGroups: [{ authorizingInput: 0, outputs: [0], contract: { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] }, ...(withId ? { covenantId: COVENANT_ID } : {}) }],
    estimatedFeeSompi: String(fee),
    estimatedMass: "2083",
    storageMass: String(storage),
    maxFeeSompi: "1000000"
  };
};
const releaseBody = (): V1PlanBody => {
  const storage = v1StorageMass([{ amountSompi: 200_000_000n, scriptBytes: 35, covenantId: false }], [{ amountSompi: 199_000_000n, scriptBytes: 34, covenantId: false }])!;
  return {
    txVersion: 1,
    inputs: [{ outpoint: { transactionId: "d".repeat(64), index: 0 }, amountSompi: "200000000", address: releaseAddr, scriptPublicKey: releaseSpk, kind: "p2sh", computeBudget: 10, contract: { compileRecord: RELEASE_RECORD, contract: "SignedRelease", constructorArgs: [{ kind: "bytes", value: Array.from(Buffer.from(releaseOwner, "hex")) }], entry: "release", args: [{ kind: "signer", signer: "owner" }] } as any }],
    outputs: [{ address: FIXTURE, amountSompi: "199000000", role: "payment" }],
    estimatedFeeSompi: "1000000",
    estimatedMass: "0",
    storageMass: String(storage),
    maxFeeSompi: "2000000"
  };
};

const seal = (body: V1PlanBody, to: string) => createV1TxPlanArtifact({ networkId: "simnet" as any, mode: "localnet" as any, from: { input: "fixture", address: FIXTURE }, to: { input: "to", address: to }, amountSompi: BigInt(body.outputs[0]!.amountSompi), body, ctx });
const facts = () => ({
  contract: async (ref: any) => (ref.compileRecord.contentHash === COUNTER_RECORD.contentHash ? counter : release),
  successor: async () => successor
});
const noKeys = { publicKeyOf: () => undefined, privateKeyOf: async () => { throw new Error("no key may be read"); } };
const fixtureKeys = { publicKeyOf: (a: string) => (a === "fixture" ? FIXTURE_XONLY : undefined), privateKeyOf: async () => FIXTURE_KEY };
const utxoMap = (entries: Array<[string, V1NodeUtxo]>) => new Map(entries);
const transitionUtxo = (over: Partial<V1NodeUtxo> = {}): Array<[string, V1NodeUtxo]> => [[`${GENESIS_TX}:0`, { amountSompi: 1_000_000_000n, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID, ...over }]];
const genesisUtxo = (over: Partial<V1NodeUtxo> = {}): Array<[string, V1NodeUtxo]> => [[`${FUNDING.transactionId}:${FUNDING.index}`, { amountSompi: GENESIS_FUNDING, scriptPublicKey: FIXTURE_SPK, ...over }]];
const releaseUtxo = (): Array<[string, V1NodeUtxo]> => [[`${"d".repeat(64)}:0`, { amountSompi: 200_000_000n, scriptPublicKey: releaseSpk }]];
const settle = <T>(p: Promise<T>) => p.then((value) => ({ value, error: undefined as any }), (error) => ({ value: undefined as T | undefined, error }));

/** A node that lists `entries` and whose mempool spends `pending`; counts its reads. */
function fakeNode(entries: Array<[string, V1NodeUtxo]>, pending: string[] = [], opts: { mempoolDown?: boolean; daa?: bigint } = {}) {
  const reads: string[] = [];
  return {
    reads,
    networkId: "simnet",
    utxosByAddresses: async (addresses: readonly string[]) => {
      reads.push(`utxos:${addresses.join(",")}`);
      return utxoMap(entries);
    },
    pendingSpentOutpoints: async (addresses: readonly string[]) => {
      reads.push(`mempool:${addresses.join(",")}`);
      if (opts.mempoolDown) throw Object.assign(new Error("PENDING_SPEND_EVIDENCE_UNAVAILABLE: mempool evidence could not be read"), { code: "PENDING_SPEND_EVIDENCE_UNAVAILABLE" });
      return new Set(pending);
    },
    virtualDaaScore: async () => opts.daa ?? 1_234n
  };
}

async function signedTransition() {
  const plan = seal(transitionBody(), SUCCESSOR_ADDR);
  const r = await buildV1Transaction({ plan, node: { networkId: "simnet", utxosByAddresses: async () => utxoMap(transitionUtxo()) }, facts: facts(), keys: noKeys });
  return { plan, r, rpc: JSON.parse(r.signed.signedTransaction.payload) };
}
async function signedGenesis(withId = true) {
  const plan = seal(genesisBody(408_300n, withId), COUNTER_ADDR);
  const r = await buildV1Transaction({ plan, node: { networkId: "simnet", utxosByAddresses: async () => utxoMap(genesisUtxo()) }, facts: facts(), keys: fixtureKeys });
  return { plan, r, rpc: JSON.parse(r.signed.signedTransaction.payload) };
}

describe("F1.6 · checkSignedV1AgainstPlan: the signed transaction is the plan's, field by field and as a whole", () => {
  it("SV-1 the engine's transition and genesis pass, with their signature scripts", async () => {
    const t = await signedTransition();
    expect(checkSignedV1AgainstPlan(t.r.signed.signedTransaction.payload, t.plan, t.r.txId)).toEqual({ ok: true, signatureScripts: [...t.r.signatureScripts] });
    const g = await signedGenesis();
    expect(checkSignedV1AgainstPlan(g.r.signed.signedTransaction.payload, g.plan, g.r.txId)).toEqual({ ok: true, signatureScripts: [...g.r.signatureScripts] });
    const g2 = await signedGenesis(false);
    expect(checkSignedV1AgainstPlan(g2.r.signed.signedTransaction.payload, g2.plan, g2.r.txId).ok).toBe(true);
  });

  it("SV-2 each v1 field changed in the payload is a SIGNED_PLAN_MISMATCH that names it", async () => {
    const t = await signedTransition();
    const g = await signedGenesis();
    const cases: Array<[string, any, (tx: any) => void, RegExp]> = [
      ["version", t, (tx) => (tx.version = 0), /version 0/],
      ["compute budget", t, (tx) => (tx.inputs[0].computeBudget = 5), /compute budget of 5/],
      ["sig op count", t, (tx) => (tx.inputs[0].sigOpCount = 1), /sig ops/],
      ["sequence", t, (tx) => (tx.inputs[0].sequence = 1), /sequence 1/],
      ["binding removed", t, (tx) => delete tx.outputs[0].covenant, /bound to a covenant in the plan and not in the signed/],
      ["binding authorizing input", t, (tx) => (tx.outputs[0].covenant.authorizingInput = 1), /authorized by input 1/],
      ["binding covenant id", t, (tx) => (tx.outputs[0].covenant.covenantId = "e".repeat(64)), /bound to covenant e{64}/],
      ["genesis binding id", g, (tx) => (tx.outputs[0].covenant.covenantId = "e".repeat(64)), /bound to covenant e{64}, the plan to c6ba/],
      ["unplanned binding", g, (tx) => (tx.outputs[1].covenant = { authorizingInput: 0, covenantId: COVENANT_ID }), /output 1 is bound to a covenant in the signed transaction and not in the plan/],
      ["storage mass", t, (tx) => (tx.storageMass = 0), /storage mass of 0/],
      ["payload", t, (tx) => (tx.payload = "00"), /payload/],
      ["lock time", t, (tx) => (tx.lockTime = 500), /lock time 500/],
      ["gas", t, (tx) => (tx.gas = 1), /gas 1/],
      ["subnetwork", t, (tx) => (tx.subnetworkId = "01" + "0".repeat(38)), /subnetwork/],
      ["extra output", t, (tx) => tx.outputs.push({ ...tx.outputs[0], covenant: undefined }), /2 output\(s\), the plan 1/],
      ["other input", t, (tx) => (tx.inputs[0].previousOutpoint.index = 1), /spends 3b93.*:1/],
      ["signature script not hex", t, (tx) => (tx.inputs[0].signatureScript = "zz"), /no hex signature script/]
    ];
    for (const [name, base, mutate, reason] of cases) {
      const tx = structuredClone(base.rpc);
      mutate(tx);
      const r = checkSignedV1AgainstPlan(JSON.stringify(tx), base.plan, base.r.txId);
      expect(r.ok, name).toBe(false);
      expect((r as any).code, name).toBe("SIGNED_PLAN_MISMATCH");
      expect((r as any).reason, name).toMatch(reason);
    }
  });

  it("SV-3 a payload whose id is not the plan's transaction (an amount or a script differs) is a mismatch; so is a v0 plan or a payload that is not JSON", async () => {
    const t = await signedTransition();
    const other = checkSignedV1AgainstPlan(t.r.signed.signedTransaction.payload, t.plan, "e".repeat(64));
    expect(other).toMatchObject({ ok: false, code: "SIGNED_PLAN_MISMATCH" });
    expect((other as any).reason).toMatch(/the plan describes transaction 611cd372/);
    expect(checkSignedV1AgainstPlan("not json", t.plan, t.r.txId)).toMatchObject({ ok: false, code: "SIGNED_PLAN_MISMATCH" });
    expect(checkSignedV1AgainstPlan(t.r.signed.signedTransaction.payload, { ...t.plan, txVersion: 0 }, t.r.txId)).toMatchObject({ ok: false, code: "SIGNED_PLAN_MISMATCH" });
  });
});

describe("F1.6 · preflightV1Send: read-only, right before the broadcast", () => {
  it("PF-1 the corpus transition passes: the evidence names the DAA score of the check, the inputs read and the observer-local guarantee; node read once, mempool once", async () => {
    const t = await signedTransition();
    const node = fakeNode(transitionUtxo());
    const r = await preflightV1Send({ plan: t.plan, signatureScripts: t.r.signatureScripts, node, facts: facts() });
    expect(r.evidence).toEqual({ observedAtDaaScore: "1234", inputs: 1, scope: "observer-local", guarantee: PENDING_SPEND_GUARANTEE });
    expect(r.validation.feeSompi).toBe(300_100n);
    expect(node.reads).toEqual([`utxos:${COUNTER_ADDR}`, `mempool:${COUNTER_ADDR}`]);
  });

  it("PF-2 each input fact the node contradicts has its code: spent, amount, script, covenant id changed, pending in its mempool", async () => {
    const t = await signedTransition();
    const run = (entries: Array<[string, V1NodeUtxo]>, pending: string[] = []) => settle(preflightV1Send({ plan: t.plan, signatureScripts: t.r.signatureScripts, node: fakeNode(entries, pending), facts: facts() }));
    expect((await run([])).error?.code).toBe("INPUT_NOT_UNSPENT");
    expect((await run(transitionUtxo({ amountSompi: 1n }))).error).toMatchObject({ code: "INPUT_DIFFERS_FROM_NODE", detail: { field: "amount" } });
    expect((await run(transitionUtxo({ scriptPublicKey: FIXTURE_SPK }))).error).toMatchObject({ code: "INPUT_DIFFERS_FROM_NODE", detail: { field: "scriptPublicKey" } });
    expect((await run(transitionUtxo({ covenantId: "e".repeat(64) }))).error).toMatchObject({ code: "INPUT_DIFFERS_FROM_NODE", detail: { field: "covenantId" } });
    expect((await run(transitionUtxo({ covenantId: undefined }))).error).toMatchObject({ code: "INPUT_DIFFERS_FROM_NODE", detail: { field: "covenantId" } });
    expect((await run(transitionUtxo(), [`${GENESIS_TX}:0`])).error?.code).toBe("INPUT_PENDING_SPEND");
  });

  it("PF-3 a P2PK input the node lists with a covenant id (an artifact signed elsewhere): COVENANT_UTXO_NOT_PAYMENT_INPUT", async () => {
    const g = await signedGenesis();
    const r = await settle(preflightV1Send({ plan: g.plan, signatureScripts: g.r.signatureScripts, node: fakeNode(genesisUtxo({ covenantId: COVENANT_ID })), facts: facts() }));
    expect(r.error?.code).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
  });

  it("PF-4 without mempool evidence nothing is sent (fail closed, the node's own code)", async () => {
    const t = await signedTransition();
    const r = await settle(preflightV1Send({ plan: t.plan, signatureScripts: t.r.signatureScripts, node: fakeNode(transitionUtxo(), [], { mempoolDown: true }), facts: facts() }));
    expect(r.error?.code).toBe("PENDING_SPEND_EVIDENCE_UNAVAILABLE");
  });

  it("PF-5 the signed scripts are the plan's: the covenant unlock byte for byte (no signer slot), the P2PK one SIGHASH_ALL", async () => {
    const t = await signedTransition();
    const node = () => fakeNode(transitionUtxo());
    const unlock = t.r.signatureScripts[0]!;
    const flipped = unlock.slice(0, 20) + (unlock[20] === "0" ? "1" : "0") + unlock.slice(21);
    expect((await settle(preflightV1Send({ plan: t.plan, signatureScripts: [flipped], node: node(), facts: facts() }))).error?.code).toBe("SIGNED_PLAN_MISMATCH");
    expect((await settle(preflightV1Send({ plan: t.plan, signatureScripts: [unlock + "00"], node: node(), facts: facts() }))).error?.code).toBe("SIGNED_PLAN_MISMATCH");
    const g = await signedGenesis();
    const anyoneCanPay = g.r.signatureScripts[0]!.slice(0, -2) + "81";
    expect((await settle(preflightV1Send({ plan: g.plan, signatureScripts: [anyoneCanPay], node: fakeNode(genesisUtxo()), facts: facts() }))).error?.code).toBe("SIGNED_PLAN_MISMATCH");
    expect((await settle(preflightV1Send({ plan: g.plan, signatureScripts: [g.r.signatureScripts[0]!], node: fakeNode(genesisUtxo()), facts: facts() }))).error).toBeUndefined();
  });

  it("PF-6 a P2SH signer slot: any 64-byte signature with SIGHASH_ALL passes the structure check (only the node verifies it); another sighash or another byte outside the slot does not", async () => {
    const plan = seal(releaseBody(), FIXTURE);
    const zero = silverUnlockScript(release.bytecodeHex, encodeSilverEntryArgs({ artifact: release.artifact, contractName: "SignedRelease", entry: "release", args: [{ kind: "bytes", value: new Uint8Array(65) }] }));
    const slotAt = zero.indexOf("41" + "00".repeat(65)) + 2;
    expect(slotAt).toBeGreaterThan(1);
    const withSig = (sig: string) => zero.slice(0, slotAt) + sig + zero.slice(slotAt + 130);
    const run = (script: string) => settle(preflightV1Send({ plan, signatureScripts: [script], node: fakeNode(releaseUtxo()), facts: facts() }));
    expect((await run(withSig("ab".repeat(64) + "01"))).error).toBeUndefined();
    expect((await run(withSig("ab".repeat(64) + "02"))).error?.code).toBe("SIGNED_PLAN_MISMATCH");
    const tail = withSig("ab".repeat(64) + "01");
    expect((await run(tail.slice(0, -4) + (tail.slice(-4, -2) === "87" ? "88" : "87") + tail.slice(-2))).error?.code).toBe("SIGNED_PLAN_MISMATCH");
  });

  it("PF-7 F1.4 runs again at send without any key: a successor the facts no longer give is refused (COVENANT_SUCCESSOR_SCRIPT_MISMATCH)", async () => {
    const t = await signedTransition();
    const other = v1SuccessorFactsFromArtifact({ artifact: json(path.join(CORPUS, "covenant-counter-transition", "successor.artifact.json")), artifactSha256: "f".repeat(64), contractName: "Counter", constructorArgs: [{ kind: "int", value: 12n }] });
    const r = await settle(preflightV1Send({ plan: t.plan, signatureScripts: t.r.signatureScripts, node: fakeNode(transitionUtxo()), facts: { ...facts(), successor: async () => other } }));
    expect(r.error?.code).toBe("COVENANT_SUCCESSOR_SCRIPT_MISMATCH");
  });

  it("PF-8 v1CovenantSpendsOf names the covenant outpoint, its id and address; v1NodeUtxoOf reads the clients' shapes", async () => {
    const t = await signedTransition();
    expect(v1CovenantSpendsOf(t.plan)).toEqual([{ outpoint: `${GENESIS_TX}:0`, covenantId: COVENANT_ID, address: COUNTER_ADDR }]);
    expect(v1CovenantSpendsOf(seal(genesisBody(), COUNTER_ADDR))).toEqual([]);
    expect(v1NodeUtxoOf({ outpoint: { transactionId: GENESIS_TX.toUpperCase(), index: 0 }, amountSompi: 5n, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID, blockDaaScore: 7n, isCoinbase: false })).toEqual({
      key: `${GENESIS_TX}:0`,
      utxo: { amountSompi: 5n, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID, blockDaaScore: 7n, isCoinbase: false }
    });
    expect(v1NodeUtxoOf({ outpoint: { transactionId: GENESIS_TX, index: 0 }, utxoEntry: { amount: "5", scriptPublicKey: { version: 0, script: COUNTER_SPK.slice(4) }, covenantId: "" } })).toEqual({
      key: `${GENESIS_TX}:0`,
      utxo: { amountSompi: 5n, scriptPublicKey: COUNTER_SPK }
    });
  });
});
