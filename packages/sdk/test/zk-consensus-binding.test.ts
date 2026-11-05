import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import {
  buildR0Groth16Scripts,
  verifyR0Groth16Scripts,
  buildR0Groth16Transaction,
  createZkOutputBindingJournal,
  parseKaspaScript,
  ZK_OUTPUT_BINDING_DOMAIN,
  ZK_OUTPUT_BINDING_MAGIC,
  OP_ZK_PRECOMPILE,
  GROTH16_PROVING_SYSTEM_TAG,
  DEFAULT_ZK_COMPUTE_BUDGET
} from "../src/index.js";

const RECEIPT_PATH = join(__dirname, "../../../fixtures/toccata-v2/zk/r0-groth16-official/receipt.hex");
const officialReceiptHex = readFileSync(RECEIPT_PATH, "utf8").trim();
const officialImageId = "e2b3cbb7b2ee93da01a5fae56a42a537f88e104526d15a5fbcbc0241cf434e34";

describe("HardKAS ZK Consensus Binding — L1 Introspection & Policy Enforcer", () => {
  const kaspa = loadManagedKaspaWasmSync();
  const aliceKey = new kaspa.PrivateKey("11".repeat(32));
  const aliceAddr = aliceKey.toKeypair().toAddress("simnet").toString();
  const bobKey = new kaspa.PrivateKey("22".repeat(32));
  const bobAddr = bobKey.toKeypair().toAddress("simnet").toString();

  describe("Domain-Separated Journal Commitment (createZkOutputBindingJournal)", () => {
    it("generates deterministic domain journal matching specification", () => {
      const fixedNonce = "aa".repeat(32);
      const journal1 = createZkOutputBindingJournal({
        payoutAddress: aliceAddr,
        amountSompi: 150000000n,
        nonceHex: fixedNonce
      });
      const journal2 = createZkOutputBindingJournal({
        payoutAddress: aliceAddr,
        amountSompi: 150000000n,
        nonceHex: fixedNonce
      });

      expect(journal1.domain).toBe(ZK_OUTPUT_BINDING_DOMAIN);
      expect(journal1.journalHex.startsWith(ZK_OUTPUT_BINDING_MAGIC)).toBe(true);
      expect(journal1.journalHex).toBe(journal2.journalHex);
      expect(journal1.journalHash).toBe(journal2.journalHash);
      expect(journal1.amountSompi).toBe(150000000n);
      expect(journal1.recipientSpkHex.length).toBeGreaterThan(0);
    });

    it("ensures unique journal hashes across different nonces or payout values", () => {
      const jA = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 100000000n });
      const jB = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 100000000n });
      const jC = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 200000000n });
      const jD = createZkOutputBindingJournal({ payoutAddress: bobAddr, amountSompi: 100000000n });

      expect(jA.journalHash).not.toBe(jB.journalHash);
      expect(jA.journalHash).not.toBe(jC.journalHash);
      expect(jA.journalHash).not.toBe(jD.journalHash);
    });

    it("binds UTXO outpoint when specified for single-use replay protection", () => {
      const outpoint1 = { transactionId: "44".repeat(32), index: 0 };
      const outpoint2 = { transactionId: "44".repeat(32), index: 1 };
      const nonce = "00".repeat(32);

      const j1 = createZkOutputBindingJournal({
        payoutAddress: aliceAddr,
        amountSompi: 50000000n,
        utxoOutpoint: outpoint1,
        nonceHex: nonce
      });
      const j2 = createZkOutputBindingJournal({
        payoutAddress: aliceAddr,
        amountSompi: 50000000n,
        utxoOutpoint: outpoint2,
        nonceHex: nonce
      });

      expect(j1.journalHash).not.toBe(j2.journalHash);
    });
  });

  describe("Covenant Script Generation (buildR0Groth16Scripts)", () => {
    it("builds consensus-bound redeem script with output introspection opcodes", () => {
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 100000000n });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 100000000n
          }
        }
      });

      expect(scripts.ok).toBe(true);
      expect(scripts.bindingMode).toBe("proof-and-output-bound");
      expect(scripts.consensusEnforced).toBe(true);
      expect(scripts.boundPayoutAddress).toBe(aliceAddr);
      expect(scripts.boundPayoutAmount).toBe(100000000n);
      expect(scripts.p2shAddresses.simnet.startsWith("kaspasim:p")).toBe(true);
      expect(scripts.p2shAddresses.testnet10.startsWith("kaspatest:p")).toBe(true);
      expect(scripts.p2shAddresses.mainnet.startsWith("kaspa:p")).toBe(true);

      // Verify that parsed script contains introspection opcodes
      const parsed = parseKaspaScript(scripts.redeemScript);
      const opcodes = parsed.ops.map((o) => o.opcode);
      expect(opcodes).toContain(0xa6); // OpZkPrecompile
      expect(opcodes).toContain(0x69); // OpVerify
      expect(opcodes).toContain(0xb4); // OpTxOutputCount
      expect(opcodes).toContain(0xc3); // OpTxOutputSpk
      expect(opcodes).toContain(0xc2); // OpTxOutputAmount
      expect(opcodes).toContain(0x9d); // OpNumEqualVerify
      expect(opcodes).toContain(0x88); // OpEqualVerify
      expect(opcodes[opcodes.length - 1]).toBe(0x51); // OpTrue (or 1)
    });

    it("builds script with change output policy (2 outputs enforced)", () => {
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 80000000n });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 80000000n
          },
          change: {
            address: bobAddr,
            amountSompi: 15000000n
          }
        }
      });

      expect(scripts.ok).toBe(true);
      const verified = verifyR0Groth16Scripts({
        redeemScript: scripts.redeemScript,
        sigScript: scripts.sigScript,
        expectedBindingMode: "proof-and-output-bound",
        expectedPayoutAddress: aliceAddr,
        expectedPayoutAmount: 80000000n
      });
      expect(verified.ok).toBe(true);
      expect(verified.enforcesOutputCount).toBe(true);
      expect(verified.enforcesPayoutSpk).toBe(true);
      expect(verified.enforcesPayoutAmount).toBe(true);
    });

    it("builds script with outpoint replay protection", () => {
      const boundOutpoint = { transactionId: "aa".repeat(32), index: 3 };
      const journal = createZkOutputBindingJournal({
        payoutAddress: aliceAddr,
        amountSompi: 100000000n,
        utxoOutpoint: boundOutpoint
      });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 100000000n
          },
          utxoBinding: boundOutpoint
        }
      });

      expect(scripts.ok).toBe(true);
      const verified = verifyR0Groth16Scripts({
        redeemScript: scripts.redeemScript,
        sigScript: scripts.sigScript,
        expectedBindingMode: "proof-and-output-bound"
      });
      expect(verified.ok).toBe(true);
      expect(verified.enforcesUtxoBinding).toBe(true);
    });

    it("preserves proof-only mode as an explicit non-enforced alternative with security warning", () => {
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: "11".repeat(32),
        receiptHex: officialReceiptHex,
        bindingPolicy: { mode: "proof-only" }
      });

      expect(scripts.ok).toBe(true);
      expect(scripts.bindingMode).toBe("proof-only");
      expect(scripts.consensusEnforced).toBe(false);
      expect(scripts.warnings.some((w) => w.code === "ZK_UNBOUND_OUTPUTS_POLICY")).toBe(true);

      const parsed = parseKaspaScript(scripts.redeemScript);
      const opcodes = parsed.ops.map((o) => o.opcode);
      expect(opcodes).toContain(0xa6); // OpZkPrecompile
      expect(opcodes).not.toContain(0xb4); // No OpTxOutputCount
      expect(opcodes).not.toContain(0xc3); // No OpTxOutputSpk
      expect(opcodes).not.toContain(0xc2); // No OpTxOutputAmount
    });
  });

  describe("Script Structural Verification (verifyR0Groth16Scripts)", () => {
    it("verifies and extracts binding parameters from script pair", () => {
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 120000000n });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 120000000n
          }
        }
      });

      const verification = verifyR0Groth16Scripts({
        redeemScript: scripts.redeemScript,
        sigScript: scripts.sigScript,
        imageId: officialImageId,
        journalHash: journal.journalHash,
        expectedBindingMode: "proof-and-output-bound",
        expectedPayoutAddress: aliceAddr,
        expectedPayoutAmount: 120000000n
      });

      expect(verification.ok).toBe(true);
      expect(verification.hasOpZkPrecompile).toBe(true);
      expect(verification.hasGroth16Tag).toBe(true);
      expect(verification.proofPushFound).toBe(true);
      expect(verification.redeemScriptEmbedded).toBe(true);
      expect(verification.bindingMode).toBe("proof-and-output-bound");
      expect(verification.consensusEnforced).toBe(true);
      expect(verification.enforcesOutputCount).toBe(true);
      expect(verification.enforcesPayoutSpk).toBe(true);
      expect(verification.enforcesPayoutAmount).toBe(true);
      expect(verification.boundPayoutAmount).toBe(120000000n);
      expect(verification.issues).toEqual([]);
    });

    it("flags error if expected payout address does not match script SPK", () => {
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 100000000n });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 100000000n
          }
        }
      });

      const verification = verifyR0Groth16Scripts({
        redeemScript: scripts.redeemScript,
        sigScript: scripts.sigScript,
        expectedPayoutAddress: bobAddr
      });

      expect(verification.ok).toBe(false);
      expect(verification.issues.some((i) => i.code === "ZK_BOUND_PAYOUT_SPK_MISMATCH")).toBe(true);
    });

    it("flags error if expected payout amount does not match script push", () => {
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 100000000n });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 100000000n
          }
        }
      });

      const verification = verifyR0Groth16Scripts({
        redeemScript: scripts.redeemScript,
        sigScript: scripts.sigScript,
        expectedPayoutAmount: 99999999n
      });

      expect(verification.ok).toBe(false);
      expect(verification.issues.some((i) => i.code === "ZK_BOUND_PAYOUT_AMOUNT_MISMATCH")).toBe(true);
    });
  });

  describe("Transaction Construction (buildR0Groth16Transaction)", () => {
    it("builds compliant transaction matching consensus-bound script parameters", () => {
      const payoutAmount = 100000000n;
      const utxoAmount = 150000000n;
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: payoutAmount });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: payoutAmount
          }
        }
      });

      const txResult = buildR0Groth16Transaction({
        scripts,
        utxo: { transactionId: "55".repeat(32), index: 0, amountSompi: utxoAmount },
        destinationAddress: aliceAddr,
        computeBudget: 1600,
        networkId: "simnet"
      });

      expect(txResult.ok).toBe(true);
      expect(txResult.bindingMode).toBe("proof-and-output-bound");
      expect(txResult.consensusEnforced).toBe(true);
      expect(txResult.txVersion).toBe(1);
      expect(txResult.computeBudget).toBe(1600);
      expect(txResult.feeSompi).toBe(utxoAmount - payoutAmount);
      expect(txResult.transaction.outputs.length).toBe(1);
      expect(txResult.transaction.outputs[0].value).toBe(payoutAmount);
    });

    it("rejects build if destination address contradicts consensus-bound script", () => {
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 100000000n });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 100000000n
          }
        }
      });

      const txResult = buildR0Groth16Transaction({
        scripts,
        utxo: { transactionId: "55".repeat(32), index: 0, amountSompi: 150000000n },
        destinationAddress: bobAddr, // Malicious / mismatching destination
        computeBudget: 1600,
        networkId: "simnet"
      });

      expect(txResult.ok).toBe(false);
      expect(txResult.issues.some((i) => i.code === "ZK_BINDING_DESTINATION_MISMATCH")).toBe(true);
    });

    it("rejects build if feeSompi contradicts the covenant's implied output math", () => {
      const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: 100000000n });
      const scripts = buildR0Groth16Scripts({
        imageId: officialImageId,
        journalHash: journal.journalHash,
        receiptHex: officialReceiptHex,
        bindingPolicy: {
          mode: "proof-and-output-bound",
          payout: {
            address: aliceAddr,
            amountSompi: 100000000n
          }
        }
      });

      const txResult = buildR0Groth16Transaction({
        scripts,
        utxo: { transactionId: "55".repeat(32), index: 0, amountSompi: 150000000n },
        destinationAddress: aliceAddr,
        feeSompi: 30000000n, // Contradicts 150_000_000 - 100_000_000 = 50_000_000
        computeBudget: 1600,
        networkId: "simnet"
      });

      expect(txResult.ok).toBe(false);
      expect(txResult.issues.some((i) => i.code === "ZK_BINDING_AMOUNT_MISMATCH")).toBe(true);
    });
  });
});
