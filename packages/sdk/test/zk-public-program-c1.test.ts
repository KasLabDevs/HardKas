import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildR0Groth16Scripts, buildR0Groth16Transaction, findPublicR0TestVector, PUBLIC_R0_TEST_VECTORS } from "../src/index.js";

// -----------------------------------------------------------------------------
// C-1 (audit 2026-11-13) · the public-vector guard:
//  - was keyed on (image id, journal hash), but a proof-only lock binds the image id alone: the official image id with any
//    other journal got the very address the published receipt opens. Now keyed on the image id;
//  - did not list HardKAS's own receipt (fixtures/toccata-v2/zk/r0-groth16-hardkas), public since its Testnet-10 spends;
//  - ignored the lock mode: it refused an output-bound lock of the official vector (harmless: the funds go only to the
//    bound outputs) and allowed a proof-only lock of the HardKAS one (anyone-can-spend).
// Now: a proof-only lock of a public program is refused on a public network; an output-bound one is built with
// ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE (anyone can trigger the bound payout at any time). The owner's Testnet-10 evidence
// (an output-bound lock over the HardKAS receipt, payout 3 TKAS, fee cap 0.19398720 TKAS) stays buildable.
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
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);
const warningCodes = (r: { warnings: Array<{ code: string }> }) => r.warnings.map((w) => w.code);

describe("C-1 · public test programs: keyed on the image id, both receipts listed, the refusal only for proof-only locks", () => {
  const k: any = loadManagedKaspaWasmSync();
  const tn = (seed: string) => new k.PrivateKey(seed.repeat(32)).toAddress("testnet-10").toString();

  it("C1-1 both fixture receipts are public programs, and the match is on the image id (any journal)", () => {
    expect(PUBLIC_R0_TEST_VECTORS.map((v) => v.imageId)).toEqual([official.imageId, hardkas.imageId]);
    expect(hardkas.imageId).toBe("04c1cd7cafedbda5f993500071da6b4a1b1193799c0d6dd1e02174857a5dd826");
    for (const v of [official, hardkas]) {
      expect(findPublicR0TestVector(v.imageId, v.journalHash)).toBeDefined();
      expect(findPublicR0TestVector(v.imageId, "ab".repeat(32)), "another journal of the same program").toBeDefined();
      expect(findPublicR0TestVector(v.imageId.toUpperCase())).toBeDefined();
    }
    expect(findPublicR0TestVector("cd".repeat(32), official.journalHash)).toBeUndefined();
  });

  it("C1-2 a proof-only testnet-10 lock is refused for both receipts, acknowledged or not; no testnet address is returned", () => {
    for (const v of [official, hardkas]) {
      const r = buildR0Groth16Scripts({ ...v, addressNetworks: ["testnet-10"], acknowledgeImageIdOnlyLock: true });
      expect(r.ok).toBe(false);
      expect(codes(r)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
      expect(r.p2shAddresses.testnet10).toBeUndefined();
    }
  });

  it("C1-3 the official image id with ANOTHER journal hash is refused proof-only on testnet-10 (it was the gap: the pair did not match)", () => {
    const r = buildR0Groth16Scripts({ ...official, journalHash: "ab".repeat(32), addressNetworks: ["testnet-10"], acknowledgeImageIdOnlyLock: true });
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
    expect(r.p2shAddresses.testnet10).toBeUndefined();
  });

  it("C1-4 the official vector's output-bound lock is now built on testnet-10, with the warning that anyone can trigger its payout; its spend is built too", () => {
    const payee = tn("44");
    const scripts = buildR0Groth16Scripts({
      ...official,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payee, amountSompi: 100_000_000n } },
      addressNetworks: ["testnet-10"]
    });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    expect(scripts.consensusEnforced).toBe(true);
    expect(scripts.p2shAddresses.testnet10).toMatch(/^kaspatest:p/);
    expect(warningCodes(scripts)).toContain("ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE");
    const tx = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: scripts.requiredFundingSompi! },
      destinationAddress: payee,
      networkId: "testnet-10"
    });
    expect(tx.ok, JSON.stringify(tx.issues)).toBe(true);
    expect(tx.consensusEnforced).toBe(true);
    expect(warningCodes(tx)).toContain("ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE");
    // its proof-only spend on testnet-10 stays refused (a simnet lock moved to testnet by hand)
    const proofOnly = buildR0Groth16Scripts({ ...official });
    const refused = buildR0Groth16Transaction({
      scripts: { ...proofOnly, p2shAddresses: { ...proofOnly.p2shAddresses, testnet10: scripts.p2shAddresses.testnet10! } },
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200_000_000n },
      destinationAddress: payee,
      networkId: "testnet-10"
    });
    expect(refused.ok).toBe(false);
    expect(codes(refused)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
  });

  it("C1-5 the owner's Testnet-10 shape stays buildable: an output-bound lock over the HardKAS receipt, payout 3 TKAS, fee cap 0.19398720 TKAS", () => {
    const funder = tn("55");
    const maxFeeSompi = 19_398_720n;
    const scripts = buildR0Groth16Scripts({
      ...hardkas,
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: funder, amountSompi: 300_000_000n }, maxFeeSompi },
      addressNetworks: ["testnet-10"]
    });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    expect(scripts.receiptClaimCrossCheck).toBe("MATCH");
    expect(scripts.consensusEnforced).toBe(true);
    expect(scripts.p2shAddresses.testnet10).toMatch(/^kaspatest:p/);
    expect(scripts.maxInputSompi).toBe(319_398_720n);
    expect(warningCodes(scripts)).toContain("ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE");
    // the evidence funded exactly payout + cap: that UTXO is spendable to the funder with a 0.19398720 TKAS fee
    const tx = buildR0Groth16Transaction({ scripts, utxo: { transactionId: "4b14e00964452aa9319827719e993b1d818b9bbac4696f378b737304b0c882b2", index: 0, amountSompi: 319_398_720n }, destinationAddress: funder, networkId: "testnet-10" });
    expect(tx.ok, JSON.stringify(tx.issues)).toBe(true);
    expect(tx.feeSompi).toBe(maxFeeSompi);
    expect(tx.consensusEnforced).toBe(true);
  });
});
