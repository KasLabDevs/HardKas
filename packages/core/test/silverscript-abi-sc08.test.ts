import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeSilverEntryArgs,
  getSilContract,
  parseSilAbiArtifact,
  silContractBytecodeHex,
  silverUnlockScript,
  SILVER_MAX_SIGNATURE_SCRIPT_LEN,
  type SilArtifactValue
} from "../src/index.js";

/*
 * SC-08 · silverscript-abi v1.0.0 `encode_entry_sig_script` (lib.rs:506-514) refuses an entry call whose signature script
 * (the arguments, the dispatch tag AND the push of the redeem script the caller appends) exceeds MAX_SIGNATURE_SCRIPT_LEN
 * = 250 000 bytes (lib.rs:33; = rusty-kaspa params `new_max_signature_script_len`), with CodecError::SignatureScriptTooLarge
 * "signature script is {actual} bytes, exceeding the consensus limit of {maximum}". HardKAS had no such pre-check: the
 * call was encoded and refused later by the mass or the node.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "silverscript-v1");
const artifact = parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(FIXTURES, "abi-vectors.artifact.json"), "utf8")));
const bytecode = silContractBytecodeHex(getSilContract(artifact).contract);

/** Kaspa data push of `hex` (OP_DATA_n / OP_PUSHDATA1 / OP_PUSHDATA2), as a test-side reference. */
function pushSize(hex: string): number {
  const n = hex.length / 2;
  return n + (n < 76 ? 1 : n < 256 ? 2 : n < 65536 ? 3 : 5);
}

/** `scalars(int, bool, byte, bytes, string)` with a `bytes` argument of `len` bytes. */
const scalars = (len: number): SilArtifactValue[] => [
  { kind: "int", value: 0n },
  { kind: "bool", value: false },
  { kind: "byte", value: 0x20 },
  { kind: "bytes", value: new Uint8Array(len).fill(0xab) as any },
  { kind: "text", value: "" }
];

describe("SC-08 · MAX_SIGNATURE_SCRIPT_LEN pre-check of an entry call (silverscript-abi lib.rs:506-514)", () => {
  it("the constant is upstream's", () => {
    expect(SILVER_MAX_SIGNATURE_SCRIPT_LEN).toBe(250_000);
  });

  it("exactly 250 000 bytes (arguments + tag + redeem push) is encoded; one byte more is refused with upstream's error", () => {
    // the arguments' fixed overhead around a large `bytes` push (PUSHDATA4 range), measured on the encoder itself
    const probe = 70_000;
    const overhead = encodeSilverEntryArgs({ artifact, entry: "scalars", args: scalars(probe) }).length / 2 - probe;
    const redeemPush = pushSize(bytecode);
    const fits = SILVER_MAX_SIGNATURE_SCRIPT_LEN - overhead - redeemPush;

    const ok = encodeSilverEntryArgs({ artifact, entry: "scalars", args: scalars(fits) });
    expect(ok.length / 2 + redeemPush).toBe(SILVER_MAX_SIGNATURE_SCRIPT_LEN);
    expect(silverUnlockScript(bytecode, ok).length / 2).toBe(SILVER_MAX_SIGNATURE_SCRIPT_LEN);

    let caught: any;
    try {
      encodeSilverEntryArgs({ artifact, entry: "scalars", args: scalars(fits + 1) });
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe("SILVER_ABI_SIGNATURE_SCRIPT_TOO_LARGE");
    expect(String(caught?.message)).toBe(
      `SILVER_ABI_SIGNATURE_SCRIPT_TOO_LARGE: signature script is ${SILVER_MAX_SIGNATURE_SCRIPT_LEN + 1} bytes, exceeding the consensus limit of ${SILVER_MAX_SIGNATURE_SCRIPT_LEN}`
    );
  });
});
