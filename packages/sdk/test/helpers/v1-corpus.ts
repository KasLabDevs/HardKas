import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import { createV1TxPlanArtifact } from "@hardkas/artifacts";
import { v1StorageMass, type V1PlanBody } from "@hardkas/tx-builder";
import { buildV1Transaction, v1ContractFactsFromArtifact, v1SuccessorFactsFromArtifact, type V1ContractFacts, type V1NodeUtxo, type V1SuccessorFacts } from "@hardkas/accounts";

/*
 * F1.6 test seam: the Silver corpus Counter (silverc v1.0.0 artifacts, official parser AST) as v1 plans and signed
 * artifacts made by the v1 engine, offline. Facts come from the corpus artifacts (the bytes the pinned silverc
 * reproduces), so no compiler runs; the funding key is the public simnet fixture key of the corpus.
 */

const repoRoot = path.resolve(__dirname, "../../../..");
const CORPUS = path.join(repoRoot, "fixtures", "toccata-v2", "silver");
const AST = path.join(repoRoot, "packages", "accounts", "test", "fixtures", "v1-engine");
const json = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const ctx = { ...systemRuntimeContext, clock: { ...systemRuntimeContext.clock, now: () => Date.parse("2026-10-26T00:00:00.000Z") } } as any;

export const FIXTURE_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
export const FIXTURE_XONLY = "dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659";
export const FIXTURE = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
export const FIXTURE_SPK = `000020${FIXTURE_XONLY}ac`;
export const COVENANT_ID = "c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd";
export const COUNTER_ADDR = "kaspasim:pqt8xhg7hqt0a6qa4ke6f599dtdse8g02jaca3syhncp0m2akhu8737p5jrg8";
export const COUNTER_SPK = "0000aa2016735d1eb816fee81dadb3a4d0a56adb0c9d0f54bb8ec604bcf017ed5db5f87f87";
export const SUCCESSOR_ADDR = "kaspasim:pzdzrdpjj4yt94nlv22z6e0txt0ay5386l0h4lxt8f0fhwfzugdvg7qze9dl5";
export const GENESIS_TX = "3b93691ca6ea47a6601e12559b6195a8c38bb1821b596cc6cd2ad4d3e2f6b917";
export const FUNDING = { transactionId: "7294c339a1b6c5a0e0e9e2a31cbeae4bbeeeca0520f100f9029b75d8d5de4d09", index: 1 };
export const GENESIS_FUNDING = 4_000_000_000n;
export const COUNTER_RECORD = { contentHash: "a".repeat(64), artifactSha256: "e72250b3be50bb0f7f54b1a51e1ff6ba2aa6f5be6de6a91d584c519df930aef3" };
const SUCCESSOR_SHA = "fb9b122142c1f6244360df72ee687820d52b4c894b1938e8ac379d8a11a206c7";

let cached: { counter: V1ContractFacts; successor: V1SuccessorFacts } | undefined;
function corpusFacts() {
  if (!cached) {
    cached = {
      counter: v1ContractFactsFromArtifact({
        compileRecordHash: COUNTER_RECORD.contentHash,
        artifactSha256: COUNTER_RECORD.artifactSha256,
        artifact: json(path.join(CORPUS, "covenant-counter-transition", "current.artifact.json")),
        contractName: "Counter",
        constructorArgs: [{ kind: "int", value: 7n }],
        ast: json(path.join(AST, "counter.ast.json"))
      }),
      successor: v1SuccessorFactsFromArtifact({
        artifact: json(path.join(CORPUS, "covenant-counter-transition", "successor.artifact.json")),
        artifactSha256: SUCCESSOR_SHA,
        contractName: "Counter",
        constructorArgs: [{ kind: "int", value: 12n }]
      })
    };
  }
  return cached;
}

/** The contract facts a send (or the engine) is given: the corpus Counter and its 7 → 12 successor. */
export function v1CorpusFacts() {
  return { contract: async () => corpusFacts().counter, successor: async () => corpusFacts().successor };
}

/** TwoOfTwo (silverc 1.0.0, accounts fixtures phase2): alice's and bob's keys sign its `spend` (keys 0x11…, 0x22…). */
export const TWO_KEYS: Record<string, string> = { alice: "11".repeat(32), bob: "22".repeat(32) };
export const TWO_RECORD = { contentHash: "c".repeat(64), artifactSha256: "" };
export const twoPublicKeyOf = (account: string): string | undefined =>
  TWO_KEYS[account] ? String(new (loadManagedKaspaWasmSync() as any).PrivateKey(TWO_KEYS[account]!).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase() : undefined;
let two: V1ContractFacts | undefined;
export function twoOfTwoFacts() {
  if (!two) {
    const bytes = fs.readFileSync(path.join(AST, "phase2", "twooftwo.artifact.json"));
    TWO_RECORD.artifactSha256 = createHash("sha256").update(bytes).digest("hex");
    const ctor = ["alice", "bob"].map((a) => ({ kind: "bytes" as const, value: Array.from(Buffer.from(twoPublicKeyOf(a)!, "hex")) }));
    two = v1ContractFactsFromArtifact({ compileRecordHash: TWO_RECORD.contentHash, artifactSha256: TWO_RECORD.artifactSha256, artifact: JSON.parse(bytes.toString("utf8")), contractName: "TwoOfTwo", constructorArgs: ctor, ast: json(path.join(AST, "phase2", "twooftwo.ast.json")) });
  }
  return { facts: { contract: async () => two!, successor: async (): Promise<never> => { throw new Error("no successor"); } }, record: TWO_RECORD, ctor: two!.constructorArgs.map((a: any) => ({ kind: "bytes", value: Array.from(a.value as ArrayLike<number>) })) };
}

/** The corpus transition 7 → 12 of the Counter (txid 611cd372… at fee 300,100); another fee gives another transaction. */
export function transitionBody(fee = 300_100n): V1PlanBody {
  return {
    txVersion: 1,
    inputs: [
      {
        outpoint: { transactionId: GENESIS_TX, index: 0 },
        amountSompi: "1000000000",
        address: COUNTER_ADDR,
        scriptPublicKey: COUNTER_SPK,
        covenantId: COVENANT_ID,
        kind: "covenant",
        computeBudget: 0,
        contract: { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }], entry: "__covenant_entrypoint_auth_bump", policy: "bump", args: [{ kind: "int", value: "5" }] } as any
      }
    ],
    outputs: [{ address: SUCCESSOR_ADDR, amountSompi: String(1_000_000_000n - fee), covenant: { authorizingInput: 0, covenantId: COVENANT_ID } }],
    covenantOutpoints: [`${GENESIS_TX}:0`],
    nextState: [{ covenantId: COVENANT_ID, input: 0, outputs: [0], successor: { artifactSha256: SUCCESSOR_SHA, constructorArgs: [{ kind: "int", value: "12" }], stateToConstructorArg: { value: 0 }, state: { value: { kind: "int", value: "12" } } } }],
    estimatedFeeSompi: String(fee),
    estimatedMass: "719",
    storageMass: "1",
    maxFeeSompi: "1000000"
  };
}

/** A genesis of the Counter funded by the fixture's P2PK coin (budget 10), change back to the fixture. */
export function genesisBody(fee = 408_300n): V1PlanBody {
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
}

export function sealV1Plan(body: V1PlanBody, to: string, networkId = "simnet"): any {
  return createV1TxPlanArtifact({ networkId: networkId as any, mode: "localnet" as any, from: { input: "fixture", address: FIXTURE }, to: { input: "to", address: to }, amountSompi: BigInt(body.outputs[0]!.amountSompi), body, ctx });
}

export const transitionUtxo = (over: Partial<V1NodeUtxo> = {}) => ({ outpoint: { transactionId: GENESIS_TX, index: 0 }, address: COUNTER_ADDR, amountSompi: 1_000_000_000n, scriptPublicKey: COUNTER_SPK, covenantId: COVENANT_ID, blockDaaScore: 900n, isCoinbase: false, ...over });
export const fundingUtxo = (over: Record<string, unknown> = {}) => ({ outpoint: FUNDING, address: FIXTURE, amountSompi: GENESIS_FUNDING, scriptPublicKey: FIXTURE_SPK, blockDaaScore: 900n, isCoinbase: false, ...over });

/** A plan and the signed artifact the v1 engine makes of it, with the node listing `utxo`. */
export async function engineSigned(plan: any, utxo: any): Promise<{ plan: any; signed: any; txId: string }> {
  loadManagedKaspaWasmSync();
  const key = `${utxo.outpoint.transactionId}:${utxo.outpoint.index}`;
  const r = await buildV1Transaction({
    plan,
    node: { networkId: "simnet", utxosByAddresses: async () => new Map([[key, { amountSompi: utxo.amountSompi, scriptPublicKey: utxo.scriptPublicKey, ...(utxo.covenantId ? { covenantId: utxo.covenantId } : {}) }]]) },
    facts: v1CorpusFacts(),
    keys: { publicKeyOf: (a) => (a === "fixture" ? FIXTURE_XONLY : undefined), privateKeyOf: async () => FIXTURE_KEY }
  });
  return { plan, signed: r.signed, txId: r.txId };
}
