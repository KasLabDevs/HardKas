import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildR0Groth16Scripts,
  computeR0ReceiptClaimDigest,
  findPublicR0TestVector,
  parseR0Groth16Receipt,
  verifyR0Groth16Scripts,
  R0_GROTH16_VERIFIER_PARAMETERS_DIGEST
} from "../src/index.js";

// -----------------------------------------------------------------------------
// H4 (crypto review) · every ZK check ran on ONE receipt, the public kaspa-python-sdk vector, so a bug that only that
// receipt hides (one image id, one journal, one seal) could not show. fixtures/toccata-v2/zk/r0-groth16-hardkas is a
// second, independent receipt HardKAS made itself (13-nov, its own guest program, risc0 3.0.5 crates with risc0-groth16
// 3.0.4 / recursion 4.0.4): its claim, its verifier parameters and the scripts built from it are checked here the same
// way. It was private until spent on Testnet-10; it is public since (its README), so it is a public test program like the
// other one (C-1, audit 2026-11-13): no proof-only testnet lock, an output-bound one with a warning.
// The pairing check (snarkjs) is exercised by the CLI suites; this file needs no snarkjs.
// -----------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const ZK = path.resolve(here, "..", "..", "..", "fixtures", "toccata-v2", "zk");
const load = (dir: string) => ({
  receiptHex: fs.readFileSync(path.join(ZK, dir, "receipt.hex"), "utf8").trim(),
  imageId: JSON.parse(fs.readFileSync(path.join(ZK, dir, "image-id.json"), "utf8")).imageId as string,
  journalHash: JSON.parse(fs.readFileSync(path.join(ZK, dir, "journal.json"), "utf8")).journalHash as string
});
const official = load("r0-groth16-official");
const hardkas = load("r0-groth16-hardkas");

describe("H4 · a second, independent RISC Zero receipt", () => {
  it("is another program and another journal, carries its own claim and the pinned verifier's parameters", () => {
    expect(hardkas.imageId).not.toBe(official.imageId);
    expect(hardkas.journalHash).not.toBe(official.journalHash);
    const parsed = parseR0Groth16Receipt(hardkas.receiptHex);
    expect(parsed.ok, JSON.stringify(parsed.issues)).toBe(true);
    expect(parsed.claimEncoding).toBe("PRUNED_DIGEST");
    expect(parsed.claimDigest).toBe(computeR0ReceiptClaimDigest(hardkas.imageId, hardkas.journalHash));
    expect(parsed.verifierParameters).toBe(R0_GROTH16_VERIFIER_PARAMETERS_DIGEST);
    expect(parsed.sealHex).not.toBe(parseR0Groth16Receipt(official.receiptHex).sealHex);
  });

  // C-1 (audit 2026-11-13): INVERTED. This test asserted that the HardKAS receipt is NOT a public vector and that a
  // testnet-10 proof-only (image-id-only) address IS built for it. Its receipt is public since its Testnet-10 spends, and
  // a proof-only lock binds the image id only, so that address was anyone-can-spend. Now it is a public test program: the
  // proof-only testnet lock is refused for it exactly as for the official vector.
  it("is a public test program now: a testnet-10 proof-only lock is refused for it (acknowledged or not), as for the official vector", () => {
    expect(findPublicR0TestVector(hardkas.imageId, hardkas.journalHash)?.name).toMatch(/r0-groth16-hardkas/);
    const own = buildR0Groth16Scripts({ ...hardkas, addressNetworks: ["testnet-10"], acknowledgeImageIdOnlyLock: true });
    expect(own.ok).toBe(false);
    expect(own.issues.map((i) => i.code)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
    expect(own.p2shAddresses.testnet10).toBeUndefined();
    const pub = buildR0Groth16Scripts({ ...official, addressNetworks: ["testnet-10"], acknowledgeImageIdOnlyLock: true });
    expect(pub.ok).toBe(false);
    expect(pub.issues.map((i) => i.code)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
    // simnet stays available for both (the suites' own node)
    expect(buildR0Groth16Scripts({ ...hardkas }).p2shAddresses.simnet).toMatch(/^kaspasim:p/);
  });

  it("its scripts differ from the public vector's only where the program, journal and proof differ; both pass the structural check", () => {
    const own = buildR0Groth16Scripts({ ...hardkas });
    const pub = buildR0Groth16Scripts({ ...official });
    expect(own.ok && pub.ok).toBe(true);
    expect(own.redeemScript).not.toBe(pub.redeemScript);
    expect(own.redeemScript.length).toBe(pub.redeemScript.length);
    expect(own.redeemScript).toContain(hardkas.imageId);
    expect(own.sigScript).toContain(hardkas.journalHash);
    for (const s of [own, pub]) {
      expect(verifyR0Groth16Scripts({ redeemScript: s.redeemScript, sigScript: s.sigScript }).ok).toBe(true);
    }
  });

  it("a wrong journal for it is refused (ZK_RECEIPT_CLAIM_MISMATCH): the cross-check is not specific to one vector", () => {
    const r = buildR0Groth16Scripts({ ...hardkas, journalHash: official.journalHash });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("ZK_RECEIPT_CLAIM_MISMATCH");
  });
});
