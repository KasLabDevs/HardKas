import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildR0Groth16Scripts,
  prepareR0Groth16Proof,
  buildR0Groth16Transaction,
  verifyR0Groth16Scripts,
  parseKaspaScript,
  getToccataPrecompileRules,
  estimateToccataZkFee,
  HISTORICAL_TRIAL_ZK_FEE_SOMPI,
  OP_ZK_PRECOMPILE,
  GROTH16_PROVING_SYSTEM_TAG,
  DEFAULT_ZK_COMPUTE_BUDGET,
  STANDARD_MAX_TRANSACTION_MASS,
  KASPA_WASM_ZK_BUILDER_CLAIM
} from "../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

// Everything here is offline: kaspa-wasm builds the scripts and the transaction, nothing is sent.
// Node acceptance lives in zk-toccata-l1.simnet.test.ts (simnet harness level).
describe("HardKAS Phase 3 ZK / Toccata L1 script building (offline)", () => {
  const officialFixtureDir = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
  const officialImageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
  const officialJournalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
  const officialReceiptHex = fs.readFileSync(path.join(officialFixtureDir, "receipt.hex"), "utf8").trim();

  it("extracts the 128-byte compressed Groth16 proof from the Borsh receipt", () => {
    const proof = prepareR0Groth16Proof(officialReceiptHex);
    expect(proof.length).toBe(256);
    expect(proof).not.toMatch(/^0+$/);
  });

  it("builds the RISC Zero Groth16 P2SH redeem and signature scripts for the official vector", () => {
    const result = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.precompileOpcode).toBe(OP_ZK_PRECOMPILE);
    expect(result.provingSystemTag).toBe(GROTH16_PROVING_SYSTEM_TAG);
    expect(result.redeemScript.length).toBe(1602);
    expect(result.redeemScript.endsWith("0120a6")).toBe(true);
    expect(result.redeemScript.includes(officialImageId)).toBe(true);
    expect(result.sigScript.length).toBe(1934);
    expect(result.sigScript.includes(officialJournalHash)).toBe(true);
    expect(result.fullSignatureScript).toBe(result.sigScript);
    // The claim cross-check limit is stated, never hidden (L-04).
    expect(result.warnings.some((w) => w.code === "ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED")).toBe(true);
  });

  it("derives the same P2SH addresses deterministically across networks", () => {
    const result = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    expect(result.redeemScriptHash).toBe("c7ade3db2026ae6c4bf50e0bb1489b3b7183a103db413b9fa928ba511933a944");
    expect(result.p2shScriptPublicKey.version).toBe(0);
    expect(result.p2shScriptPublicKey.script).toBe(
      "aa20c7ade3db2026ae6c4bf50e0bb1489b3b7183a103db413b9fa928ba511933a94487"
    );
    expect(result.p2shAddresses.testnet10).toBe(
      "kaspatest:prr6mc7myqn2umzt758qhv2gnvahrqapq0d5zwul4y5t55gexw55gcz66pvdf"
    );
    expect(result.p2shAddresses.simnet).toBe(
      "kaspasim:prr6mc7myqn2umzt758qhv2gnvahrqapq0d5zwul4y5t55gexw55gk5pqjvz7"
    );
    expect(result.p2shAddresses.mainnet).toBe("kaspa:prr6mc7myqn2umzt758qhv2gnvahrqapq0d5zwul4y5t55gexw55geyupwjud");
  });

  it("constructs a version 1 transaction with compute budget 1600 and prices it from the measured mass", () => {
    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    const txResult = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: scripts.p2shAddresses.simnet,
      feeSompi: 10000n,
      computeBudget: DEFAULT_ZK_COMPUTE_BUDGET,
      networkId: "simnet"
    });
    expect(txResult.ok).toBe(true);
    expect(txResult.issues).toEqual([]);
    expect(txResult.txVersion).toBe(1);
    expect(txResult.computeBudget).toBe(1600);
    expect(txResult.transactionId.length).toBe(64);
    expect(txResult.mass).toBe(1602n);
    expect(txResult.computeMass).toBe(1602n + 160000n);
    expect(txResult.withinStandardMaxMass).toBe(true);
    expect(txResult.mass).toBeLessThan(STANDARD_MAX_TRANSACTION_MASS);
    expect(txResult.warnings.some((w) => w.code === "ZK_FEE_BELOW_MEMPOOL_MINIMUM")).toBe(true);
  });

  it("estimates fees as baseComputeMass + computeBudget * 100 grams, with no shape-specific constant", () => {
    const estimate = estimateToccataZkFee(1600, 1602n, { marginPercent: 20 });
    expect(estimate.computeMass).toBe(161602n);
    expect(estimate.computeBudgetMass).toBe(160000n);
    expect(estimate.minimumRequiredSompi).toBe(16160200n);
    expect(estimate.recommendedSompi).toBe(19392240n);
    expect(estimate.feerateSompiPerMass).toBe(100n);
    expect(estimate.cappedBelowMinimum).toBe(false);
    // Other shapes scale with their own base mass (M-04).
    expect(estimateToccataZkFee(1600, 3000n).computeMass).toBe(163000n);
    expect(estimateToccataZkFee(1600, 1200n).computeMass).toBe(161200n);
    expect(estimateToccataZkFee(0, 1602n).computeMass).toBe(1602n);
    // Historical evidence: the node demanded 16,152,700 sompi (compute mass 161,527) for this vector;
    // the estimator's minimum stays at or above that figure.
    expect(estimate.minimumRequiredSompi >= 16152700n).toBe(true);
    expect(HISTORICAL_TRIAL_ZK_FEE_SOMPI).toBe(20000000n);

    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    const dynamicTx = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "33".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: scripts.p2shAddresses.simnet,
      computeBudget: 1600,
      networkId: "simnet"
    });
    expect(dynamicTx.ok).toBe(true);
    expect(dynamicTx.feeSompi).toBe(19392240n);
    expect(dynamicTx.warnings).toEqual([]);
  });

  it("rejects compute budgets outside the u16 range and flags a fee cap below the minimum", () => {
    expect(() => estimateToccataZkFee(70000, 1602n)).toThrow(RangeError);
    expect(() => estimateToccataZkFee(-5, 1602n)).toThrow(RangeError);
    expect(() => estimateToccataZkFee(1.5, 1602n)).toThrow(RangeError);
    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    for (const budget of [70000, -5]) {
      const tx = buildR0Groth16Transaction({
        scripts,
        utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
        destinationAddress: scripts.p2shAddresses.simnet,
        computeBudget: budget,
        networkId: "simnet"
      });
      expect(tx.ok).toBe(false);
      expect(tx.issues.some((i) => i.code === "ZK_COMPUTE_BUDGET_OUT_OF_RANGE")).toBe(true);
    }
    const capped = estimateToccataZkFee(65535, 1602n, { maxFeeSompi: 1000n });
    expect(capped.recommendedSompi).toBe(1000n);
    expect(capped.cappedBelowMinimum).toBe(true);
    const cappedTx = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: scripts.p2shAddresses.simnet,
      computeBudget: 65535,
      feeOptions: { maxFeeSompi: 1000n },
      networkId: "simnet"
    });
    expect(cappedTx.warnings.some((w) => w.code === "ZK_FEE_CAP_BELOW_MINIMUM")).toBe(true);
  });

  it("re-audit RA-1/RA-4: withinStandardMaxMass is about the non-contextual mass, and the destination must match the network", () => {
    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    const big = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000000n },
      destinationAddress: scripts.p2shAddresses.simnet,
      computeBudget: 65535,
      networkId: "simnet"
    });
    expect(big.ok).toBe(true);
    expect(big.withinStandardMaxMass).toBe(true);
    expect(big.computeMass).toBe(1602n + 6553500n);
    const wrongNet = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: scripts.p2shAddresses.mainnet,
      networkId: "simnet"
    });
    expect(wrongNet.ok).toBe(false);
    expect(wrongNet.issues.some((i) => i.code === "ZK_DESTINATION_NETWORK_MISMATCH")).toBe(true);
  });

  it("builds for mainnet only with an explicit unguarded-build warning", () => {
    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    const tx = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: scripts.p2shAddresses.mainnet,
      networkId: "mainnet"
    });
    expect(tx.ok).toBe(true);
    expect(tx.networkId).toBe("mainnet");
    expect(tx.warnings.some((w) => w.code === "ZK_MAINNET_BUILD_UNGUARDED")).toBe(true);
  });

  it("verifies the structure of the built scripts by parsing opcodes", () => {
    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    const verification = verifyR0Groth16Scripts({
      redeemScript: scripts.redeemScript,
      sigScript: scripts.sigScript,
      imageId: officialImageId,
      journalHash: officialJournalHash
    });
    expect(verification.ok).toBe(true);
    expect(verification.hasOpZkPrecompile).toBe(true);
    expect(verification.hasGroth16Tag).toBe(true);
    expect(verification.imageIdFound).toBe(true);
    expect(verification.journalHashFound).toBe(true);
    expect(verification.proofPushFound).toBe(true);
    expect(verification.redeemScriptEmbedded).toBe(true);
    // the embedded RISC Zero verifying key: alpha(32) + beta/gamma/delta(3x64) + len(8) + 6 IC points (6x32)
    expect(verification.largestRedeemPushBytes).toBe(424);
    expect(verification.issues).toEqual([]);

    const parsed = parseKaspaScript(scripts.redeemScript);
    expect(parsed.error).toBeUndefined();
    expect(parsed.ops[parsed.ops.length - 1].opcode).toBe(0xa6);
    expect(parsed.ops[parsed.ops.length - 2].data).toBe("20");
  });

  it("rejects scripts that merely contain the bytes a6 / 0120 (M-03)", () => {
    for (const redeem of ["0120a6", "aa6b0120", "deadbeef" + officialImageId + "0120a6"]) {
      const v = verifyR0Groth16Scripts({ redeemScript: redeem, sigScript: officialJournalHash });
      expect(v.ok).toBe(false);
    }
    const misaligned = verifyR0Groth16Scripts({ redeemScript: "aa6b0120", sigScript: "00" });
    expect(misaligned.hasOpZkPrecompile).toBe(false);
    expect(misaligned.issues.some((i) => i.code === "ZK_SCRIPT_PARSE_ERROR" || i.code === "ZK_MISSING_PRECOMPILE_OPCODE")).toBe(true);
  });

  it("describes the Kaspa Toccata L1 precompile facts with upstream-consistent numbers", () => {
    const rules = getToccataPrecompileRules();
    expect(rules.opcode).toBe("0xa6");
    expect(rules.opcodeName).toBe("OpZkPrecompile");
    expect(rules.tag).toBe("0x20");
    expect(rules.curve).toBe("BN254");
    expect(rules.groth16PrecompileCostGrams).toBe(140000);
    expect(rules.groth16PrecompileCostScriptUnits).toBe(14000000);
    expect(rules.gramsPerComputeBudgetUnit).toBe(100);
    expect(rules.scriptUnitsPerComputeBudgetUnit).toBe(10000);
    expect(rules.freeScriptUnitsPerInput).toBe(9999);
    expect(rules.recommendedComputeBudget).toBe(1600);
    expect(rules.recommendedComputeBudgetGrams).toBe(160000);
    expect(rules.computeBudgetMax).toBe(65535);
    expect(rules.requiredTransactionVersion).toBe(1);
    expect(rules.sigOpCountRequirement).toBe(0);
    expect(rules.maxStandardMass).toBe(100000n);
    expect(rules.scriptSource).toBe(KASPA_WASM_ZK_BUILDER_CLAIM);
    expect((rules as any).computeBudgetGramsEquivalent).toBeUndefined();
    // allowed units for the recommended budget cover the precompile cost plus pushes
    expect(1600 * rules.scriptUnitsPerComputeBudgetUnit + rules.freeScriptUnitsPerInput).toBeGreaterThan(14002811);
  });

  it("rejects corrupted or non-hex receipts with a descriptive error", () => {
    expect(() => prepareR0Groth16Proof("00010000deadbeef")).toThrow(/Failed to extract R0 Groth16 proof/i);
    expect(() => prepareR0Groth16Proof("zz".repeat(10))).toThrow(/not a valid even-length hex string/i);
    const result = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: "00010000deadbeef"
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "ZK_RECEIPT_EXTRACTION_FAILED")).toBe(true);
  });

  it("rejects an invalid image id or journal hash length", () => {
    const shortImage = buildR0Groth16Scripts({
      imageId: "75641a540ee2ad9ee5902bcdcdb8b55c",
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    expect(shortImage.ok).toBe(false);
    expect(shortImage.issues.some((i) => i.code === "ZK_INVALID_IMAGE_ID")).toBe(true);
    const shortJournal = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: "5df6e0e2",
      receiptHex: officialReceiptHex
    });
    expect(shortJournal.ok).toBe(false);
    expect(shortJournal.issues.some((i) => i.code === "ZK_INVALID_JOURNAL_HASH")).toBe(true);
  });

  it("fails structural verification when the image id or journal hash do not match", () => {
    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex
    });
    const verification = verifyR0Groth16Scripts({
      redeemScript: scripts.redeemScript,
      sigScript: scripts.sigScript,
      imageId: "deadbeef".repeat(8),
      journalHash: "cafebabe".repeat(8)
    });
    expect(verification.ok).toBe(false);
    expect(verification.issues.some((i) => i.code === "ZK_IMAGE_ID_MISMATCH")).toBe(true);
    expect(verification.issues.some((i) => i.code === "ZK_JOURNAL_HASH_MISMATCH")).toBe(true);
  });

  it("fails structural verification when OpZkPrecompile is stripped or the script is truncated", () => {
    const verification = verifyR0Groth16Scripts({ redeemScript: "2075641a540ee2ad9e012000", sigScript: "205df6e0" });
    expect(verification.ok).toBe(false);
    expect(verification.hasOpZkPrecompile).toBe(false);
    expect(verification.issues.some((i) => i.code === "ZK_MISSING_PRECOMPILE_OPCODE")).toBe(true);
    expect(verification.issues.some((i) => i.code === "ZK_SCRIPT_PARSE_ERROR")).toBe(true);
  });
});
