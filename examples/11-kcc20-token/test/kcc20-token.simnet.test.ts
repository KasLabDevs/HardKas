import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createCovenantTestbed,
  createFundedCovenant,
  getHardkasFixtureKey,
  mineBlocks,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  waitForUtxo,
  type CompiledCovenantContract,
  type IsolatedSimnetSession
} from "@hardkas/testing";
import {
  kcc1EncodeState,
  kcc20CheckTransfer,
  kcc20SilverStateLayout,
  kcc20State,
  kcc20TransferSignatureScript,
  kcc20TransferWitness,
  kccBytes,
  kccHex,
  loadManagedKaspaWasmSync,
  silverP2shAddress,
  silverP2shLock,
  silverSigFromInputSignature,
  type Kcc20State,
  type SilArtifactValue
} from "@hardkas/core";
import { parseWasmTxToRpc } from "@hardkas/accounts";
import { classifyNodeRejection } from "@hardkas/artifacts";
import { calculateUpstreamStorageMass } from "@hardkas/tx-builder";

// Example 11 on a real rusty-kaspad v2.1.0 simnet node: the walkthrough's transfer (1000 -> 600 + 400) as real token
// UTXOs of the reference KCC20 program, compiled by HardKAS's pinned silverc. The token is created by a covenant
// genesis; alice's transfer is a signed v1 transaction the node validates by running the program, and so is the
// conservation violation it rejects — for the program's own reason (the script ran and returned false), never a fee, a
// mass or a compute budget. The off-chain check (`hardkas kcc20 check`'s model) gives its verdict next to the node's.
// Needs HARDKAS_TEST_KCC20_REFERENCE (a checkout of argent-lang/kcc20-reference @ 27f8403f): without it the test FAILS
// (KCC20_REFERENCE_MISSING); HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 skips it explicitly, reported as skipped.

const REF = process.env.HARDKAS_TEST_KCC20_REFERENCE ?? "";
const SKIP_REF = process.env.HARDKAS_TEST_SKIP_KCC20_REFERENCE === "1";
const ZERO = "00".repeat(32);
const KAS = 2_000_000_000n;
const FEE = 20_000_000n;
const BUDGET = 300;

let session: IsolatedSimnetSession;
let token: CompiledCovenantContract;
let template = "";

const bytes = (hex: string): SilArtifactValue => ({ kind: "bytes", value: [...kccBytes(hex, "bytes")] });
const holder = (amount: bigint, owner: string) => kcc20State({ amount, owner, ownerScheme: 0, borrowScheme: 0, borrowGuard: ZERO, extensionCommitment: ZERO });
const xonly = (priv: string) => {
  const k = loadManagedKaspaWasmSync();
  return String(new k.PrivateKey(priv).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
};

/** The token program holding `s`: the compiled bytecode with `s` written into its state span (KCC-1 encoding). */
function program(s: Kcc20State): Uint8Array {
  const layout = kcc20SilverStateLayout(token.artifact, "KCC20");
  const bc = Uint8Array.from(token.artifact.contracts.KCC20!.compiled.bytecode);
  const state = { gen__kcc20_template: template, amount: s.amount, owner: s.owner, owner_scheme: s.ownerScheme, borrow_scheme: s.borrowScheme, borrow_guard: s.borrowGuard, extension_commitment: s.extensionCommitment };
  return Uint8Array.from([...bc.slice(0, layout.stateStart), ...kcc1EncodeState(layout.fields, state, layout.records), ...bc.slice(layout.stateStart + layout.stateLen)]);
}

/** One owner-signed transfer of a token UTXO to `next`: signed, submitted, and on acceptance mined and observed. */
async function transfer(input: { outpoint: { transactionId: string; index: number }; kas: bigint; covenantId: string; blockDaaScore: bigint; state: Kcc20State }, next: Kcc20State[], ownerKey: string) {
  const k = loadManagedKaspaWasmSync();
  const lock = silverP2shLock(kccHex(program(input.state)));
  const each = (input.kas - FEE) / BigInt(next.length);
  const make = (signatureScript = "") => {
    const tx = new k.Transaction({
      version: 1,
      inputs: [{ previousOutpoint: input.outpoint, signatureScript, sequence: 0n, sigOpCount: 0, computeBudget: BUDGET, utxo: { outpoint: input.outpoint, amount: input.kas, scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script), blockDaaScore: input.blockDaaScore, isCoinbase: false, covenantId: input.covenantId } }],
      outputs: next.map((s) => {
        const out = silverP2shLock(kccHex(program(s)));
        return { value: each, scriptPublicKey: new k.ScriptPublicKey(out.version, out.script), covenant: { authorizingInput: 0, covenantId: input.covenantId } };
      }),
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass([input.kas], next.map(() => each), "simnet");
    tx.finalize();
    return tx;
  };
  // the owner's Schnorr signature (SIGHASH_ALL over the transaction) in the leader's witness: path 00 || signature
  const signature = kccHex(silverSigFromInputSignature(String(k.createInputSignature(make(), 0, new k.PrivateKey(ownerKey), k.SighashType.All))));
  const witness = kcc20TransferWitness({ scheme: 0x00, signature });
  const signed = make(kccHex(kcc20TransferSignatureScript(next, witness, program(input.state))));
  const txId = String(signed.id).toLowerCase();
  const model = kcc20CheckTransfer({
    inputs: [{ state: input.state, kasValueSompi: input.kas, witness: kccHex(witness) }],
    nextStates: next,
    outputs: next.map((s) => ({ state: s, kasValueSompi: each })),
    signatureValid: (c) => c.publicKey === xonly(ownerKey)
  });
  const res = await session.rpc.submitTransaction(parseWasmTxToRpc(signed.serializeToObject()), { allowOrphan: false, expectedTxId: txId }).catch((e: any) => ({ accepted: false, error: String(e?.message ?? e) }));
  const successors = [];
  if (res.accepted) {
    await mineBlocks(session, 1);
    for (let i = 0; i < next.length; i++) successors.push(await waitForUtxo(session, silverP2shAddress(kccHex(program(next[i]!)), "simnet"), { transactionId: txId, index: i }));
  }
  return { txId, accepted: res.accepted === true, reason: (res as any).error as string | undefined, model, successors };
}

describe.skipIf(SKIP_REF)("Example 11 · a KCC-20 token on a real rusty-kaspad simnet node", () => {
  const alice = getHardkasFixtureKey("alice");
  const bob = getHardkasFixtureKey("bob");

  beforeAll(async () => {
    if (REF === "") {
      throw new Error(
        "KCC20_REFERENCE_MISSING: set HARDKAS_TEST_KCC20_REFERENCE to a checkout of argent-lang/kcc20-reference @ 27f8403f " +
          "(or HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 to skip this test explicitly)"
      );
    }
    const sil = fs.readFileSync(path.join(REF, "fixtures", "public-mint", "sil", "KCC20.sil"));
    // a checkout made with core.autocrlf=true converts the reference's line endings: it fails here, by name
    const crlf = sil.includes("\r\n") ? " (its line endings were converted to CRLF: check the reference out with core.autocrlf=false)" : "";
    expect(createHash("sha256").update(sil).digest("hex"), `KCC20.sil is the pinned reference file${crlf}`).toBe("9c61d62a1b90ad541bbf5c48ec53faaff1826cbc6f26bd42fa429df5c295316c");
    session = await startIsolatedSimnet({ minerFixture: "alice" });
    const zero: SilArtifactValue[] = [bytes(ZERO), { kind: "int", value: 0n }, bytes(ZERO), { kind: "byte", value: 0 }, { kind: "byte", value: 0 }, bytes(ZERO), bytes(ZERO)];
    token = await createCovenantTestbed().compileContract({ source: sil.toString("utf8"), sourceFile: "KCC20.sil", contractName: "KCC20", constructorArgs: zero });
    template = kccHex(Uint8Array.from(token.artifact.contracts.KCC20!.compiled.template_hash));
  }, 300_000);

  afterAll(async () => {
    if (session) await stopIsolatedSimnet(session);
  }, 60_000);

  it("E11 the token is created by a covenant genesis (alice, 1000); 1000 -> 500 + 600 is rejected by the node and the model; 1000 -> bob 600 + alice 400 is accepted and confirmed", async () => {
    const minted = holder(1_000n, xonly(alice));
    const g = await createFundedCovenant(session, {
      contract: token,
      funderFixture: "alice",
      valueSompi: KAS,
      initialState: {
        gen__kcc20_template: bytes(template),
        amount: { kind: "int", value: minted.amount },
        owner: bytes(minted.owner),
        owner_scheme: { kind: "byte", value: 0 },
        borrow_scheme: { kind: "byte", value: 0 },
        borrow_guard: bytes(ZERO),
        extension_commitment: bytes(ZERO)
      }
    });
    const utxo = { outpoint: g.outpoint, kas: g.amountSompi, covenantId: g.covenantId!, blockDaaScore: g.blockDaaScore, state: minted };

    const over = await transfer(utxo, [holder(500n, xonly(bob)), holder(600n, xonly(alice))], alice);
    expect(over.accepted, over.reason).toBe(false);
    expect(classifyNodeRejection(over.reason ?? "").code, over.reason).toBe("SCRIPT_POLICY_REJECTED");
    expect(over.reason).toMatch(/failed to verify the signature script: script ran, but verification failed/);
    expect(over.reason).not.toMatch(/\bfees?\b|\bmass\b|script units exceeded|compute budget/i);
    expect([over.model.accepted, over.model.rule]).toEqual([false, "conservation"]);

    const ok = await transfer(utxo, [holder(600n, xonly(bob)), holder(400n, xonly(alice))], alice);
    expect(ok.accepted, ok.reason).toBe(true);
    expect(ok.model.accepted, ok.model.reason).toBe(true);
    expect(ok.successors.map((s) => s.covenantId)).toEqual([g.covenantId, g.covenantId]);
    console.log("[EXAMPLE11_SIMNET_EVIDENCE]", JSON.stringify({ genesis: `${g.outpoint.transactionId}:0`, covenantId: g.covenantId, rejected: { txId: over.txId, reason: over.reason, class: classifyNodeRejection(over.reason ?? "").code }, accepted: { txId: ok.txId, successors: ok.successors.map((s) => `${s.outpoint.transactionId}:${s.outpoint.index}`) } }));
  }, 240_000);
});
