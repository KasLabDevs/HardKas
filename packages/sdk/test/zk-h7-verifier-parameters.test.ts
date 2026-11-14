import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildR0Groth16Scripts,
  parseR0Groth16Receipt,
  r0VerifierParametersIssue,
  R0_GROTH16_VERIFIER_PARAMETERS_DIGEST
} from "../src/index.js";

// -----------------------------------------------------------------------------
// H7 (crypto review) · a RISC Zero Groth16 receipt names the verifier it was made for (Groth16ReceiptVerifierParameters,
// the last 32 bytes of a pruned-claim receipt). HardKAS read it and compared nothing. It is now pinned to the digest
// risc0-zkvm's own `Groth16ReceiptVerifierParameters::default().digest()` gives (risc0 3.0.4/3.0.5, computed on
// 2026-11-13), and a receipt with another value is refused before a lock is built: its proof would not verify against
// the key and control root the lock pins. No snarkjs needed here (no pairing runs).
// -----------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(here, "..", "..", "..", "fixtures", "toccata-v2", "zk", "r0-groth16-official");
const receiptHex = fs.readFileSync(path.join(FIXTURE, "receipt.hex"), "utf8").trim();
const imageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const journalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";

describe("H7 · the receipt's verifier parameters are the pinned RISC Zero verifier's", () => {
  it("the public vector carries exactly the pinned digest, and the helper accepts it", () => {
    const parsed = parseR0Groth16Receipt(receiptHex);
    expect(parsed.ok).toBe(true);
    expect(parsed.verifierParameters).toBe(R0_GROTH16_VERIFIER_PARAMETERS_DIGEST);
    expect(R0_GROTH16_VERIFIER_PARAMETERS_DIGEST).toBe("73c457ba541936f0d907daf0c7253a39a9c5c427c225ba7709e44702d3c6eedc");
    expect(r0VerifierParametersIssue(parsed.verifierParameters)).toBeUndefined();
    expect(r0VerifierParametersIssue(R0_GROTH16_VERIFIER_PARAMETERS_DIGEST.toUpperCase())).toBeUndefined();
    expect(r0VerifierParametersIssue(undefined)).toBeUndefined();
  });

  it("another value is ZK_RECEIPT_VERIFIER_PARAMETERS_MISMATCH, naming both digests", () => {
    const other = "11".repeat(32);
    const issue = r0VerifierParametersIssue(other);
    expect(issue?.code).toBe("ZK_RECEIPT_VERIFIER_PARAMETERS_MISMATCH");
    expect(issue?.message).toContain(other);
    expect(issue?.message).toContain(R0_GROTH16_VERIFIER_PARAMETERS_DIGEST);
  });

  it("build-scripts refuses a receipt made for another verifier before building anything (the claim itself still matches)", () => {
    const control = buildR0Groth16Scripts({ imageId, journalHash, receiptHex });
    expect(control.ok, JSON.stringify(control.issues)).toBe(true);
    const tampered = receiptHex.slice(0, receiptHex.length - 64) + "22".repeat(32);
    expect(parseR0Groth16Receipt(tampered).claimDigest).toBe(parseR0Groth16Receipt(receiptHex).claimDigest);
    const r = buildR0Groth16Scripts({ imageId, journalHash, receiptHex: tampered });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("ZK_RECEIPT_VERIFIER_PARAMETERS_MISMATCH");
    expect(r.issues.find((i) => i.code === "ZK_RECEIPT_VERIFIER_PARAMETERS_MISMATCH")?.message).toMatch(/Nothing was built/);
    expect(r.redeemScript ?? "").toBe("");
  });
});
