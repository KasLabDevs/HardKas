import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  buildSilverVmScenarioTransaction,
  compileSilverScript,
  executeSilverVmScenario,
  loadManagedKaspaWasmSync,
  parseSilArtifactValuesJson,
  silverSigFromInputSignature,
  type SilAbiArtifact,
  type SilArtifactValue
} from "../src/index.js";

// -----------------------------------------------------------------------------
// H-B1 · the runner's own reading of the u64 fields: `timed(int t)` requires tx.time >= t (CHECKLOCKTIMEVERIFY on the
// scenario's lock time and the active input's sequence). Lock times and sequences that a double cannot hold must reach the
// runner exact: a lock time of 2^53 + 1 satisfies t = 2^53 + 1, u64::MAX is read as u64::MAX, and a sequence of u64::MAX
// (a finalized input) is told apart from u64::MAX - 1. SilverScript runner level: HARDKAS_SILVER_RUNNER names a local
// cli-debugger build (UNVERIFIED, run under the level's explicit opt-in); the compiled fixture artifact, no silverc.
// -----------------------------------------------------------------------------

const FIX = path.join(__dirname, "fixtures", "silverscript-v1");
const artifact = JSON.parse(fs.readFileSync(path.join(FIX, "abi-vectors.artifact.json"), "utf8"));
const source = fs.readFileSync(path.join(FIX, "abi-vectors.sil"), "utf8");
const constructorArgs = parseSilArtifactValuesJson(fs.readFileSync(path.join(FIX, "abi-vectors.constructor-args.json"), "utf8"));
const TIMED_LINE = source.split(/\r?\n/).findIndex((l) => l.includes("require(tx.time >= t)")) + 1;

const U64_MAX = (1n << 64n) - 1n;
const P53 = 1n << 53n;

const timed = (lockTime: bigint, t: bigint, sequence = 0n) =>
  executeSilverVmScenario({
    source,
    artifact,
    constructorArgs,
    entrypoint: "timed",
    args: [{ kind: "int", value: t }],
    tx: { version: 1, lockTime, activeInputIndex: 0, inputs: [{ utxoValue: 5000n, sequence }], outputs: [{ value: 5000n }] },
    runnerTrust: "allow-unverified"
  });

const brief = (r: Awaited<ReturnType<typeof timed>>) =>
  `${r.status} ${r.outcomeClass} line=${r.diagnostic?.location?.line ?? "-"}\n${r.stderr.slice(0, 600)}`;

describe("H-B1 · the runner reads lock times and sequences exactly", () => {
  it(`T0 the contract's check is on line ${TIMED_LINE}`, () => {
    expect(TIMED_LINE).toBeGreaterThan(0);
  });

  it("T1 lock time 2^53 + 1 satisfies t = 2^53 + 1: SCRIPT_VM_PASS", async () => {
    const r = await timed(P53 + 1n, P53 + 1n);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
  });

  it("T2 control: lock time 2^53 + 1 does not satisfy t = 2^53 + 2: rejected on the tx.time line", async () => {
    const r = await timed(P53 + 1n, P53 + 2n);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_REJECTED");
    expect(r.diagnostic?.location?.line, brief(r)).toBe(TIMED_LINE);
  });

  it("T3 lock time u64::MAX is read as u64::MAX: it satisfies t = 2^53 + 1", async () => {
    const r = await timed(U64_MAX, P53 + 1n);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
  });

  it("T4 sequence u64::MAX - 1 (not finalized): the lock time applies, SCRIPT_VM_PASS", async () => {
    const r = await timed(P53 + 1n, P53 + 1n, U64_MAX - 1n);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
  });

  it("T5 sequence u64::MAX (a finalized input): the lock time check refuses it on the tx.time line", async () => {
    const r = await timed(P53 + 1n, P53 + 1n, U64_MAX);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_REJECTED");
    expect(r.diagnostic?.location?.line, brief(r)).toBe(TIMED_LINE);
  });
});

// -----------------------------------------------------------------------------
// B-3 · u64::MAX in all four fields, read by the runner itself. `spend(sig s)` only checks the owner's signature, and a
// SIGHASH_ALL signature covers the lock time, the input's sequence and amount and the output's value: it verifies only on
// the transaction HardKAS signed. Controls: a signature made over the same transaction with ONE field one unit lower is
// refused — so a pass means the runner rebuilt every field exactly, not merely something close.
// -----------------------------------------------------------------------------

const SIGNED_SPEND = "pragma silverscript ^0.1.0;\n\ncontract SignedSpend(pubkey owner) {\n    entry spend(sig s) {\n        require(checkSig(s, owner));\n    }\n}\n";
const SIG_LINE = SIGNED_SPEND.split("\n").findIndex((l) => l.includes("require(checkSig(s, owner));")) + 1;
const k = loadManagedKaspaWasmSync();
const KEY = createHash("sha256").update("hardkas-f1.1-u64-max-owner").digest("hex");
const OWNER_XONLY = String(new k.PrivateKey(KEY).toPublicKey().toXOnlyPublicKey().toString());
const ownerArg: SilArtifactValue = { kind: "bytes", value: [...Buffer.from(OWNER_XONLY, "hex")] };

interface Fields {
  readonly lockTime: bigint;
  readonly sequence: bigint;
  readonly utxoValue: bigint;
  readonly value: bigint;
}
const scenario = (f: Fields) => ({
  version: 1,
  lockTime: f.lockTime,
  activeInputIndex: 0,
  inputs: [{ utxoValue: f.utxoValue, sequence: f.sequence }],
  outputs: [{ value: f.value }]
});
const MAX: Fields = { lockTime: U64_MAX, sequence: U64_MAX, utxoValue: U64_MAX, value: U64_MAX };

let spendArtifact: SilAbiArtifact;
const spend = (args: unknown[], f: Fields) =>
  executeSilverVmScenario({
    source: SIGNED_SPEND,
    artifact: spendArtifact,
    constructorArgs: [ownerArg],
    entrypoint: "spend",
    args: args as any,
    tx: scenario(f),
    runnerTrust: "allow-unverified"
  });
/** The owner's signature over `f`'s scenario, made outside the bridge (as the bridge makes it: SIGHASH_ALL, input 0). */
const signatureOver = (f: Fields): SilArtifactValue => {
  const { wasmTx, activeInputIndex } = buildSilverVmScenarioTransaction({ artifact: spendArtifact, tx: scenario(f) });
  const raw = k.createInputSignature(wasmTx, activeInputIndex, new k.PrivateKey(KEY), k.SighashType.All);
  return { kind: "bytes", value: [...silverSigFromInputSignature(String(raw))] };
};

describe("B-3 · u64::MAX in lock_time, sequence, utxo_value and value, with one-unit controls", () => {
  beforeAll(async () => {
    spendArtifact = (await compileSilverScript({ source: SIGNED_SPEND, constructorArgs: [ownerArg] })).artifact;
  });

  it(`X0 the contract's check is on line ${SIG_LINE}`, () => {
    expect(SIG_LINE).toBeGreaterThan(0);
  });

  it("X1 signed by the bridge with u64::MAX in every field: SCRIPT_VM_PASS", async () => {
    const r = await spend([{ privateKeyHex: KEY }], MAX);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
  });

  it("X2 control: the same signature made outside the bridge over the exact fields: SCRIPT_VM_PASS", async () => {
    const r = await spend([signatureOver(MAX)], MAX);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
  });

  for (const field of ["lockTime", "sequence", "utxoValue", "value"] as const) {
    it(`X3 control: a signature over ${field} = u64::MAX - 1 is refused on the signature line`, async () => {
      const r = await spend([signatureOver({ ...MAX, [field]: U64_MAX - 1n })], MAX);
      expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_REJECTED");
      expect(r.diagnostic?.location?.line, brief(r)).toBe(SIG_LINE);
    });
  }
});

// -----------------------------------------------------------------------------
// M-1 · with a host BigInt.prototype.toJSON (to a string, or to a Number), real verdicts on the runner are unchanged.
// -----------------------------------------------------------------------------

const TO_JSON_VARIANTS: Array<[string, (this: bigint) => unknown]> = [
  ["toString", function (this: bigint) {
    return this.toString();
  }],
  ["Number", function (this: bigint) {
    return Number(this);
  }]
];

for (const [variant, toJSON] of TO_JSON_VARIANTS) {
  describe(`M-1 · with a host BigInt.prototype.toJSON (${variant}) the runner's verdicts are unchanged`, () => {
    beforeAll(async () => {
      spendArtifact ??= (await compileSilverScript({ source: SIGNED_SPEND, constructorArgs: [ownerArg] })).artifact;
      Object.defineProperty(BigInt.prototype, "toJSON", { value: toJSON, configurable: true, writable: true });
    });
    afterAll(() => {
      delete (BigInt.prototype as any).toJSON;
    });

    it("H1 lock time 2^53 + 1 satisfies t = 2^53 + 1: SCRIPT_VM_PASS", async () => {
      const r = await timed(P53 + 1n, P53 + 1n);
      expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
    });

    it("H2 control: lock time 2^53 + 1 does not satisfy t = 2^53 + 2", async () => {
      const r = await timed(P53 + 1n, P53 + 2n);
      expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_REJECTED");
      expect(r.diagnostic?.location?.line, brief(r)).toBe(TIMED_LINE);
    });

    it("H3 u64::MAX in every field, signed by the bridge: SCRIPT_VM_PASS", async () => {
      const r = await spend([{ privateKeyHex: KEY }], MAX);
      expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
    });

    it("H4 control: a signature over value = u64::MAX - 1 is refused on the signature line", async () => {
      const r = await spend([signatureOver({ ...MAX, value: U64_MAX - 1n })], MAX);
      expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_REJECTED");
      expect(r.diagnostic?.location?.line, brief(r)).toBe(SIG_LINE);
    });
  });
}
