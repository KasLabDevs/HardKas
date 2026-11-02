import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  buildSilverVmScenarioTransaction,
  compileSilverScript,
  executeSilverVmScenario,
  loadManagedKaspaWasmSync,
  resolveSilverRunner,
  silverSigFromInputSignature,
  kcc1EncodeState,
  kcc20BorrowWitness,
  kcc20CheckTransfer,
  kcc20DelegatorSignatureScript,
  kcc20DelegatorWitness,
  kcc20SilverStateLayout,
  kcc20State,
  kcc20TransferSignatureScript,
  kcc20TransferWitness,
  kccBytes,
  kccHex,
  type Kcc20State,
  type SilAbiArtifact,
  type SilArtifactValue,
  type SilverVmExecutionRequest
} from "../src/index.js";

// -----------------------------------------------------------------------------
// KCC-20 on the Kaspa script engine: the reference KCC20 program (argent-lang/kcc20-reference @ 27f8403f, compiled by
// HardKAS's pinned silverc) runs `transfer` in the SilverScript runner, with real Schnorr signatures over the scenario
// transaction. The off-chain model (kcc20CheckTransfer) must give the same verdict as the program for every case.
// SilverScript runner level: HARDKAS_SILVER_RUNNER (a local, UNVERIFIED cli-debugger build, under the level's explicit
// opt-in) and HARDKAS_TEST_KCC20_REFERENCE (the reference checkout). Without the reference the suite FAILS
// (KCC20_REFERENCE_MISSING), never passes by omission; HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 skips it explicitly. Script
// execution only: not transaction validity, not node evidence.
// -----------------------------------------------------------------------------

const REF = process.env.HARDKAS_TEST_KCC20_REFERENCE ?? "";
const SKIP_REF = process.env.HARDKAS_TEST_SKIP_KCC20_REFERENCE === "1";
const SIL_SHA256 = "9c61d62a1b90ad541bbf5c48ec53faaff1826cbc6f26bd42fa429df5c295316c";
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const CID = "c0".repeat(32);
const KEY = sha256("hardkas-kcc20-vm-owner");
const OTHER_KEY = sha256("hardkas-kcc20-vm-someone-else");
const ZERO = "00".repeat(32);

let source = "";
let artifact: SilAbiArtifact;
let templateHex = "";
let owner = "";

const bytes = (hex: string): SilArtifactValue => ({ kind: "bytes", value: [...kccBytes(hex, "bytes")] });
const runtimeState = (s: Kcc20State): Record<string, SilArtifactValue> => ({
  gen__kcc20_template: bytes(templateHex),
  amount: { kind: "int", value: s.amount },
  owner: bytes(s.owner),
  owner_scheme: { kind: "byte", value: s.ownerScheme },
  borrow_scheme: { kind: "byte", value: s.borrowScheme },
  borrow_guard: bytes(s.borrowGuard),
  extension_commitment: bytes(s.extensionCommitment)
});
const stateArg = (s: Kcc20State): SilArtifactValue => ({
  kind: "object",
  value: {
    amount: { kind: "int", value: s.amount },
    owner: bytes(s.owner),
    owner_scheme: { kind: "byte", value: s.ownerScheme },
    borrow_scheme: { kind: "byte", value: s.borrowScheme },
    borrow_guard: bytes(s.borrowGuard),
    extension_commitment: bytes(s.extensionCommitment)
  }
});

/** A one-input transfer of the leader's tokens to `next`, signed by `signingKey` over the scenario transaction. */
async function transfer(leader: Kcc20State, next: Kcc20State[], signingKey: string) {
  const tx: NonNullable<SilverVmExecutionRequest["tx"]> = {
    version: 1,
    lockTime: 0n,
    activeInputIndex: 0,
    inputs: [{ utxoValue: 100_000_000n, covenantId: CID, state: runtimeState(leader) }],
    outputs: next.map((s) => ({ value: 30_000_000n, covenantId: CID, authorizingInput: 0, state: runtimeState(s) }))
  };
  const k = loadManagedKaspaWasmSync();
  const { wasmTx } = buildSilverVmScenarioTransaction({ artifact, contractName: "KCC20", tx });
  const sig = silverSigFromInputSignature(String(k.createInputSignature(wasmTx, 0, new k.PrivateKey(signingKey), k.SighashType.All)));
  const witness = kcc20TransferWitness({ scheme: 0x00, signature: kccHex(sig) });
  const constructorArgs: SilArtifactValue[] = [
    bytes(templateHex),
    { kind: "int", value: leader.amount },
    bytes(leader.owner),
    { kind: "byte", value: leader.ownerScheme },
    { kind: "byte", value: leader.borrowScheme },
    bytes(leader.borrowGuard),
    bytes(leader.extensionCommitment)
  ];
  const vm = await executeSilverVmScenario({
    source,
    artifact,
    contractName: "KCC20",
    constructorArgs,
    entrypoint: "transfer",
    args: [{ kind: "array", value: next.map(stateArg) }, { kind: "bytes", value: [...witness] }],
    tx,
    runner: resolveSilverRunner(),
    runnerTrust: "allow-unverified"
  });
  // the off-chain model, with the signature check the program performs (Schnorr by the owner key over this transaction)
  const model = kcc20CheckTransfer({
    inputs: [{ state: leader, kasValueSompi: 100_000_000n, witness: kccHex(witness) }],
    nextStates: next,
    outputs: next.map((s) => ({ state: s, kasValueSompi: 30_000_000n })),
    signatureValid: (c) => c.publicKey === leader.owner && signingKey === KEY
  });
  return { vm, model, brief: `${vm.outcomeClass} ${vm.stderr.slice(0, 400)}` };
}

describe.skipIf(SKIP_REF)("KCC-20 · the reference program's transfer on the script engine (SCRIPT_VM)", () => {
  beforeAll(async () => {
    if (REF === "") {
      throw new Error(
        "KCC20_REFERENCE_MISSING: set HARDKAS_TEST_KCC20_REFERENCE to a checkout of argent-lang/kcc20-reference @ 27f8403f " +
          "(or HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 to skip this suite explicitly)"
      );
    }
    const sil = fs.readFileSync(path.join(REF, "fixtures", "public-mint", "sil", "KCC20.sil"));
    // a checkout made with core.autocrlf=true converts the reference's line endings: it fails here, by name
    const crlf = sil.includes("\r\n") ? " (its line endings were converted to CRLF: check the reference out with core.autocrlf=false)" : "";
    expect(sha256(sil), `KCC20.sil is the pinned reference file${crlf}`).toBe(SIL_SHA256);
    source = sil.toString("utf8");
    const k = loadManagedKaspaWasmSync();
    owner = String(new k.PrivateKey(KEY).toPublicKey().toXOnlyPublicKey().toString());
    // the template hash does not depend on the state: compile once with a zero state to read it, then with it
    const zeroCtor: SilArtifactValue[] = [bytes(ZERO), { kind: "int", value: 0n }, bytes(ZERO), { kind: "byte", value: 0 }, { kind: "byte", value: 0 }, bytes(ZERO), bytes(ZERO)];
    const first = (await compileSilverScript({ source, constructorArgs: zeroCtor })).artifact;
    templateHex = kccHex(Uint8Array.from(first.contracts.KCC20!.compiled.template_hash));
    artifact = first;
  });

  const leaderOf = (amount: bigint): Kcc20State => kcc20State({ amount, owner, ownerScheme: 0, borrowScheme: 0, borrowGuard: ZERO, extensionCommitment: ZERO });
  const to = (amount: bigint, who: string, scheme = 0): Kcc20State => kcc20State({ amount, owner: who, ownerScheme: scheme, borrowScheme: 0, borrowGuard: ZERO, extensionCommitment: ZERO });

  it("V1 an owner-signed transfer of 1000 into 600 + 400: the program accepts it, and so does the model", async () => {
    const r = await transfer(leaderOf(1000n), [to(600n, "22".repeat(32)), to(400n, owner)], KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_PASS");
    expect(r.model.accepted, r.model.reason).toBe(true);
  });

  it("V2 conservation: 1000 into 600 + 500 is rejected by the program and by the model", async () => {
    const r = await transfer(leaderOf(1000n), [to(600n, "22".repeat(32)), to(500n, owner)], KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_REJECTED");
    expect([r.model.accepted, r.model.rule]).toEqual([false, "conservation"]);
  });

  it("V3 ownership: a signature by another key is rejected by the program and by the model", async () => {
    const r = await transfer(leaderOf(1000n), [to(1000n, "22".repeat(32))], OTHER_KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_REJECTED");
    expect([r.model.accepted, r.model.rule]).toEqual([false, "owner"]);
  });

  it("V4 a successor with an unsupported owner scheme (0x7f) is rejected by the program and by the model", async () => {
    const r = await transfer(leaderOf(1000n), [to(1000n, "22".repeat(32), 0x7f)], KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_REJECTED");
    expect([r.model.accepted, r.model.rule]).toEqual([false, "owner_scheme"]);
  });

  it("V5 a negative successor amount (-600, 1600) is rejected by the program and by the model", async () => {
    const r = await transfer(leaderOf(1000n), [to(-600n, "22".repeat(32)), to(1600n, owner)], KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_REJECTED");
    expect([r.model.accepted, r.model.rule]).toEqual([false, "amount"]);
  });

  // Borrowed receive: input 0 is the recipient's existing UTXO (borrowed, amount-threshold 500, no owner signature);
  // input 1 is the sender, a delegator signing for its own tokens. Each input runs on its own, as consensus runs them.
  const RECIPIENT = "77".repeat(32);
  const GUARD_500 = `f401000000000000${"00".repeat(24)}`;
  const recipientState = kcc20State({ amount: 1000n, owner: RECIPIENT, ownerScheme: 0, borrowScheme: 1, borrowGuard: GUARD_500, extensionCommitment: ZERO });
  const programOf = (s: Kcc20State): Uint8Array => {
    const layout = kcc20SilverStateLayout(artifact, "KCC20");
    const bc = Uint8Array.from(artifact.contracts.KCC20!.compiled.bytecode);
    const full = { gen__kcc20_template: templateHex, amount: s.amount, owner: s.owner, owner_scheme: s.ownerScheme, borrow_scheme: s.borrowScheme, borrow_guard: s.borrowGuard, extension_commitment: s.extensionCommitment };
    return Uint8Array.from([...bc.slice(0, layout.stateStart), ...kcc1EncodeState(layout.fields, full, layout.records), ...bc.slice(layout.stateStart + layout.stateLen)]);
  };
  const ctorOf = (s: Kcc20State): SilArtifactValue[] => [
    bytes(templateHex),
    { kind: "int", value: s.amount },
    bytes(s.owner),
    { kind: "byte", value: s.ownerScheme },
    { kind: "byte", value: s.borrowScheme },
    bytes(s.borrowGuard),
    bytes(s.extensionCommitment)
  ];

  async function borrowedReceive(received: bigint, active: 0 | 1, senderKey: string) {
    const sender = leaderOf(1000n);
    const next = [kcc20State({ ...recipientState, amount: recipientState.amount + received }), to(sender.amount - received, owner)];
    const leaderWitness = kcc20BorrowWitness({ scheme: 0x01 });
    const base: NonNullable<SilverVmExecutionRequest["tx"]> = {
      version: 1,
      lockTime: 0n,
      activeInputIndex: active,
      inputs: [
        { utxoValue: 100_000_000n, covenantId: CID, state: runtimeState(recipientState) },
        { utxoValue: 100_000_000n, covenantId: CID, state: runtimeState(sender) }
      ],
      outputs: next.map((s, i) => ({ value: i === 0 ? 100_000_000n : 90_000_000n, covenantId: CID, authorizingInput: 0, state: runtimeState(s) }))
    };
    const k = loadManagedKaspaWasmSync();
    const { wasmTx } = buildSilverVmScenarioTransaction({ artifact, contractName: "KCC20", tx: base });
    const senderSig = kccHex(silverSigFromInputSignature(String(k.createInputSignature(wasmTx, 1, new k.PrivateKey(senderKey), k.SighashType.All))));
    const delegatorWitness = kcc20DelegatorWitness({ scheme: 0x00, signature: senderSig });
    // the other input's invocation, as the program reads it
    const inputs = base.inputs.map((inp, i) =>
      i === active
        ? inp
        : {
            ...inp,
            signatureScriptHex: kccHex(
              i === 0 ? kcc20TransferSignatureScript(next, leaderWitness, programOf(recipientState)) : kcc20DelegatorSignatureScript(delegatorWitness, programOf(sender))
            )
          }
    );
    const vm = await executeSilverVmScenario({
      source,
      artifact,
      contractName: "KCC20",
      constructorArgs: ctorOf(active === 0 ? recipientState : sender),
      entrypoint: active === 0 ? "transfer" : "transfer_delegator",
      args: active === 0 ? [{ kind: "array", value: next.map(stateArg) }, { kind: "bytes", value: [...leaderWitness] }] : [{ kind: "bytes", value: [...delegatorWitness] }],
      tx: { ...base, inputs },
      runner: resolveSilverRunner(),
      runnerTrust: "allow-unverified"
    });
    const model = kcc20CheckTransfer({
      inputs: [
        { state: recipientState, kasValueSompi: 100_000_000n, witness: kccHex(leaderWitness) },
        { state: sender, kasValueSompi: 100_000_000n, witness: kccHex(delegatorWitness) }
      ],
      nextStates: next,
      outputs: next.map((s, i) => ({ state: s, kasValueSompi: i === 0 ? 100_000_000n : 90_000_000n })),
      signatureValid: (c) => c.publicKey === owner && senderKey === KEY
    });
    return { vm, model, brief: `${vm.outcomeClass} ${vm.stderr.slice(0, 400)}` };
  }

  it("V6 borrowed receive of 501 tokens (threshold 500): the leader's program accepts it, and so does the model", async () => {
    const r = await borrowedReceive(501n, 0, KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_PASS");
    expect([r.model.accepted, r.model.path], r.model.reason).toEqual([true, "borrowed"]);
  });

  it("V7 borrowed receive of exactly the threshold (500): rejected by the leader's program and by the model", async () => {
    const r = await borrowedReceive(500n, 0, KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_REJECTED");
    expect([r.model.accepted, r.model.rule]).toEqual([false, "amount"]);
  });

  it("V8 the sender's delegator input, signed by its owner: its program accepts it", async () => {
    const r = await borrowedReceive(501n, 1, KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_PASS");
    expect(r.model.accepted, r.model.reason).toBe(true);
  });

  it("V9 the sender's delegator input signed by another key: rejected by its program and by the model", async () => {
    const r = await borrowedReceive(501n, 1, OTHER_KEY);
    expect(r.vm.outcomeClass, r.brief).toBe("SCRIPT_VM_REJECTED");
    expect([r.model.accepted, r.model.rule]).toEqual([false, "owner"]);
  });
});
