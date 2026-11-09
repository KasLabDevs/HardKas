import { describe, it, expect, beforeAll, vi } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { KaspaWasmPrivateKeySigner } from "../src/kaspa-wasm-signer.js";
import { StaticSignatureScriptAuthorizer } from "../src/authorizers.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// F1 follow-up (7-nov-2026) · the internal signer (KaspaWasmPrivateKeySigner) read only a plan-level `computeBudget`
// and ignored the per-input `inputs[].computeBudget` every v1 plan carries (the v1 planner's and the ZK lock's,
// buildR0Groth16Plan): it signed those inputs with budget 0, i.e. 9 999 script units, a transaction other than the plan
// (the v1 txid covers the budgets) that the node refuses for any signature check (100 000 units). It now commits each
// input's stated budget, and refuses a v1 input whose plan states none (V1_COMPUTE_BUDGET_REQUIRED: every v1 unlock is
// metered against it and the signer cannot tell what a caller-supplied unlock needs) or an invalid / contradictory one
// (V1_COMPUTE_BUDGET_INVALID), before any key is resolved. Real pinned kaspa-wasm, no network.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
let k: any;
let officialTxIdOf: (rpcTx: unknown) => string;
const KEY = "1111".padStart(64, "0");
let alice = "";
let aliceSpk = "";
let lockAddr = "";
let lockSpk = "";

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  officialTxIdOf = (await import(pathToFileURL(path.join(repoRoot, "packages", "kaspa-rpc", "dist", "index.js")).href)).officialTxIdOf;
  alice = new k.PrivateKey(KEY).toKeypair().toAddress("simnet").toString();
  const a = k.payToAddressScript(alice);
  aliceSpk = Number(a.version).toString(16).padStart(4, "0") + String(a.script);
  const p = k.payToScriptHashScript("51");
  lockSpk = Number(p.version).toString(16).padStart(4, "0") + String(p.script);
  lockAddr = k.addressFromScriptPublicKey(new k.ScriptPublicKey(Number(p.version), String(p.script)), "simnet").toString();
});

/** A v1 plan with one input (fee 1 000 000), as the internal signer reads it. */
function v1Plan(input: Record<string, unknown>, outputs: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): any {
  return {
    schema: "hardkas.txPlan",
    networkId: "simnet",
    mode: "rpc",
    txVersion: 1,
    from: { address: String(input.address), input: "from" },
    to: { address: alice, input: "alice" },
    amountSompi: String(outputs[0]!.amountSompi),
    inputs: [{ outpoint: { transactionId: "e".repeat(64), index: 0 }, amountSompi: "200000000", blockDaaScore: "1000", isCoinbase: false, ...input }],
    outputs,
    estimatedFeeSompi: "1000000",
    estimatedMass: "3000",
    ...extra
  };
}
const zkPlan = (budget?: number) =>
  v1Plan({ address: lockAddr, scriptPublicKey: lockSpk, kind: "p2sh", ...(budget !== undefined ? { computeBudget: budget } : {}) }, [{ address: alice, amountSompi: "199000000", role: "payment" }]);
/** A P2PK v1 input funding a covenant genesis output (binding without an id: populateGenesisCovenants) plus change. */
const genesisPlan = (budget?: number, extra: Record<string, unknown> = {}) =>
  v1Plan(
    { address: alice, scriptPublicKey: aliceSpk, ...(budget !== undefined ? { computeBudget: budget } : {}) },
    [
      { address: lockAddr, amountSompi: "100000000", covenant: { authorizingInput: 0 } },
      { address: alice, amountSompi: "99000000", role: "change" }
    ],
    extra
  );
const keySigner = () => new KaspaWasmPrivateKeySigner({ account: { kind: "kaspa", name: "alice", network: "simnet", address: alice, privateKey: KEY } as any });
const payloadOf = (r: any) => JSON.parse(r.signedTransaction.payload);
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "NO_ERROR";
  } catch (e: any) {
    return e?.code ?? `UNCODED: ${String(e?.message ?? e).slice(0, 120)}`;
  }
};

/** The transaction the payload describes, with its UTXO, through kaspa-wasm's consensus verifier (no key: verifies only). */
function verifies(payload: any, utxoSpk: string): boolean {
  const entries = [{ address: alice, outpoint: { transactionId: "e".repeat(64), index: 0 }, utxoEntry: { amount: 200_000_000n, scriptPublicKey: new k.ScriptPublicKey(0, utxoSpk.slice(4)), blockDaaScore: 1000n, isCoinbase: false } }];
  const tx = k.createTransaction(entries, payload.outputs.map((o: any) => new k.PaymentOutput(k.addressFromScriptPublicKey(new k.ScriptPublicKey(Number(o.scriptPublicKey.version), o.scriptPublicKey.scriptPublicKey), "simnet"), BigInt(o.value ?? o.amount))), 1_000_000n);
  tx.version = 1;
  const groups = payload.outputs.map((o: any, n: number) => (o.covenant ? n : -1)).filter((n: number) => n >= 0);
  if (groups.length > 0) tx.populateGenesisCovenants([new k.GenesisCovenantGroup(0, groups)]);
  payload.inputs.forEach((i: any, n: number) => {
    tx.inputs[n].sequence = BigInt(i.sequence);
    tx.inputs[n].sigOpCount = Number(i.sigOpCount);
    tx.inputs[n].computeBudget = Number(i.computeBudget);
    tx.inputs[n].signatureScript = String(i.signatureScript);
  });
  if (payload.storageMass !== undefined) tx.storageMass = BigInt(payload.storageMass);
  tx.finalize();
  try {
    k.signTransaction(tx, [], true);
    return true;
  } catch {
    return false;
  }
}

describe("the internal signer commits each v1 input's own compute budget", () => {
  it("a ZK-style p2sh input with a caller-supplied unlock: budget 1600 committed (it was 0); the declared txId is official", async () => {
    const r = await new KaspaWasmPrivateKeySigner({}).signTxPlan({ planArtifact: zkPlan(1600), authorizers: { 0: new StaticSignatureScriptAuthorizer("515151") } } as any);
    const payload = payloadOf(r);
    expect(payload.inputs.map((i: any) => Number(i.computeBudget))).toEqual([1600]);
    expect(String(payload.inputs[0].signatureScript)).toBe("515151");
    expect(r.txId).toBe(officialTxIdOf(payload));
  });

  it("a P2PK v1 input funding a covenant genesis: budget 10 committed, the binding kept, txId official, signature verifies", async () => {
    const r = await keySigner().signTxPlan({ planArtifact: genesisPlan(10) } as any);
    const payload = payloadOf(r);
    expect(payload.inputs.map((i: any) => [Number(i.computeBudget), Number(i.sigOpCount)])).toEqual([[10, 0]]);
    expect(payload.outputs[0].covenant).toBeDefined();
    expect(r.txId).toBe(officialTxIdOf(payload));
    expect(verifies(payload, aliceSpk)).toBe(true);
  });

  it("a legacy plan-level budget still applies to every input (V1-TXID-1); per-input and plan-level agreeing is fine", async () => {
    const legacy = payloadOf(await keySigner().signTxPlan({ planArtifact: genesisPlan(undefined, { computeBudget: "12" }) } as any));
    expect(legacy.inputs.map((i: any) => Number(i.computeBudget))).toEqual([12]);
    const both = payloadOf(await keySigner().signTxPlan({ planArtifact: genesisPlan(12, { computeBudget: "12" }) } as any));
    expect(both.inputs.map((i: any) => Number(i.computeBudget))).toEqual([12]);
  });

  it("no budget stated for a v1 input: V1_COMPUTE_BUDGET_REQUIRED (a key signature or a caller's unlock), never a silent 0", async () => {
    expect(await codeOf(keySigner().signTxPlan({ planArtifact: genesisPlan() } as any))).toBe("V1_COMPUTE_BUDGET_REQUIRED");
    expect(await codeOf(new KaspaWasmPrivateKeySigner({}).signTxPlan({ planArtifact: zkPlan(), authorizers: { 0: new StaticSignatureScriptAuthorizer("51") } } as any))).toBe("V1_COMPUTE_BUDGET_REQUIRED");
  });

  it("an invalid or contradictory budget: V1_COMPUTE_BUDGET_INVALID", async () => {
    for (const bad of [65_536, -1, 1.5, "10"]) {
      expect(await codeOf(keySigner().signTxPlan({ planArtifact: genesisPlan(bad as any) } as any)), String(bad)).toBe("V1_COMPUTE_BUDGET_INVALID");
    }
    expect(await codeOf(keySigner().signTxPlan({ planArtifact: genesisPlan(10, { computeBudget: "12" }) } as any))).toBe("V1_COMPUTE_BUDGET_INVALID");
  });

  it("control · v0 payments are untouched (no budget needed, sig-op count 1)", async () => {
    const plan = { ...genesisPlan(), txVersion: undefined, outputs: [{ address: lockAddr, amountSompi: "100000000" }, { address: alice, amountSompi: "99000000" }] };
    const payload = payloadOf(await keySigner().signTxPlan({ planArtifact: plan } as any));
    expect(Number(payload.version)).toBe(0);
    expect(payload.inputs.map((i: any) => Number(i.sigOpCount))).toEqual([1]);
  });
});
