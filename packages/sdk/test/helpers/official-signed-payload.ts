import fs from "node:fs";
import path from "node:path";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, expectedScriptPublicKeyHex } from "@hardkas/artifacts";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";

/**
 * EXPECTED-TXID-1 test seam: a signed payload as a signer writes it (RPC-transaction JSON text) together with the id the
 * official kaspa-wasm gives that transaction, built here directly from the same fields (the reference, independent of
 * the code under test). Ids exclude signature scripts, so a placeholder signature does not change it.
 */
export function officialSignedPayload(tx: {
  version?: number;
  inputs: Array<{ previousOutpoint: { transactionId: string; index: number }; signatureScript?: string; sequence?: number | string; sigOpCount?: number }>;
  outputs: Array<{ amount?: unknown; value?: unknown; scriptPublicKey: { version: number; scriptPublicKey: string }; address?: string }>;
}): { payload: string; txId: string } {
  const k: any = loadManagedKaspaWasmSync();
  const inputs = tx.inputs.map((i) => ({
    previousOutpoint: { transactionId: i.previousOutpoint.transactionId, index: Number(i.previousOutpoint.index) },
    signatureScript: i.signatureScript ?? "41" + "bb".repeat(65),
    sequence: String(i.sequence ?? 0),
    sigOpCount: i.sigOpCount ?? 1
  }));
  const outputs = tx.outputs.map((o) => ({ value: String(o.value ?? o.amount), scriptPublicKey: o.scriptPublicKey, ...(o.address ? { address: o.address } : {}) }));
  const version = tx.version ?? 0;
  const txId = String(
    new k.Transaction({
      version,
      inputs: inputs.map((i) => ({ previousOutpoint: i.previousOutpoint, signatureScript: i.signatureScript, sequence: BigInt(i.sequence), sigOpCount: i.sigOpCount })),
      outputs: outputs.map((o) => ({ value: BigInt(o.value), scriptPublicKey: new k.ScriptPublicKey(o.scriptPublicKey.version, o.scriptPublicKey.scriptPublicKey) })),
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    }).id
  );
  const payload = JSON.stringify({ version, inputs, outputs, lockTime: "0", subnetworkId: "0000000000000000000000000000000000000000", gas: "0", payload: "", storageMass: "0" });
  return { payload, txId };
}

/**
 * The RPC transaction a plan authorizes (its inputs; its outputs, then its change), as a signer writes it, with its
 * official id. A send checks a signed payload against its plan (SIGNED_PLAN_MISMATCH), so a re-issued signed artifact
 * that keeps its plan as parent carries this payload.
 */
export function officialSignedPayloadForPlan(plan: any): { payload: string; txId: string } {
  // a simulator destination ("kaspa:sim_bob") has no script: a placeholder script, and the address the plan names
  const output = (address: string, amount: unknown) => {
    const script = expectedScriptPublicKeyHex(address);
    return script !== undefined
      ? { amount, scriptPublicKey: { version: 0, scriptPublicKey: script } }
      : { amount, scriptPublicKey: { version: 0, scriptPublicKey: "20" + "aa".repeat(32) + "ac" }, address };
  };
  return officialSignedPayload({
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
    outputs: [...plan.outputs.map((o: any) => output(o.address, o.amountSompi)), ...(plan.change ? [output(plan.change.address, plan.change.amountSompi)] : [])]
  });
}

/** The plan a signed artifact descends from (its lineage parent), read from the workspace `ws` (test seam, sync). */
export function planOfSigned(ws: string, signed: any): any {
  const id = signed?.lineage?.parentArtifactId ?? signed?.authorization?.planArtifactId;
  const walk = (dir: string): string[] =>
    fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : [];
  for (const file of walk(path.join(ws, ".hardkas"))) {
    if (!file.endsWith(".json")) continue;
    try {
      const a = JSON.parse(fs.readFileSync(file, "utf8"));
      if (a?.contentHash === id && Array.isArray(a?.inputs) && Array.isArray(a?.outputs)) return a;
    } catch {
      // not an artifact
    }
  }
  throw new Error(`test seam: the plan ${String(id)} of the signed artifact is not in ${ws}`);
}

/** A stand-in node's answer to a submission: it names the transaction it was handed (its official id), as a node does. */
export async function nodeNamesReceived(transaction: unknown): Promise<{ transactionId: string }> {
  return { transactionId: officialTxIdOf(transaction) };
}

/**
 * A simulator-signed artifact re-issued as a non-synthetic signed one (hex payload), re-sealed under v5, carrying the
 * transaction its plan authorizes and that transaction's official id: what the real-send tests broadcast.
 */
export function reissueAsBroadcastable(signed: any, plan: any, network?: string): any {
  const official = officialSignedPayloadForPlan(plan);
  const s: any = structuredClone(signed);
  if (network) s.networkId = network;
  delete s.authorization;
  s.signedTransaction = { format: "hex", payload: official.payload };
  s.txId = official.txId;
  delete s.contentHash;
  s.lineage = { ...s.lineage, artifactId: "" };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

/** A minimal transaction (one input, one output) as a signer writes it, with its official id. */
export function officialSignedPayloadFixture(seed = "cd"): { payload: string; txId: string } {
  return officialSignedPayload({
    inputs: [{ previousOutpoint: { transactionId: seed.repeat(32), index: 0 } }],
    outputs: [{ value: "900000", scriptPublicKey: { version: 0, scriptPublicKey: "20" + "aa".repeat(32) + "ac" } }]
  });
}
