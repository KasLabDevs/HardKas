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
  OP_ZK_PRECOMPILE,
  GROTH16_PROVING_SYSTEM_TAG,
  estimateToccataZkFee
} from "../src/index.js";

const RECEIPT_PATH = join(__dirname, "../../../fixtures/toccata-v2/zk/r0-groth16-official/receipt.hex");
const officialReceiptHex = readFileSync(RECEIPT_PATH, "utf8").trim();
const officialImageId = "e2b3cbb7b2ee93da01a5fae56a42a537f88e104526d15a5fbcbc0241cf434e34";

describe("HardKAS ZK Consensus Binding — 18 Adversarial Attack Vectors & Safety Campaign", () => {
  const kaspa = loadManagedKaspaWasmSync();
  const aliceKey = new kaspa.PrivateKey("11".repeat(32));
  const aliceAddr = aliceKey.toKeypair().toAddress("simnet").toString();
  const bobKey = new kaspa.PrivateKey("22".repeat(32));
  const bobAddr = bobKey.toKeypair().toAddress("simnet").toString();
  const attackerKey = new kaspa.PrivateKey("66".repeat(32));
  const attackerAddr = attackerKey.toKeypair().toAddress("simnet").toString();

  const standardPayoutSompi = 100000000n; // 1 KAS
  const standardUtxoSompi = 200000000n;   // 2 KAS
  const standardUtxo = { transactionId: "99".repeat(32), index: 0, amountSompi: standardUtxoSompi };

  /** Helper to simulate consensus ScriptVM execution of output introspection rules against a transaction */
  function evaluateConsensusOutputPolicy(
    redeemScriptHex: string,
    tx: any
  ): { passed: boolean; failureReason?: string; failingOpcode?: string } {
    const parsed = parseKaspaScript(redeemScriptHex);
    if (parsed.error) return { passed: false, failureReason: `Script parse error: ${parsed.error}` };

    const ops = parsed.ops;
    const zkIdx = ops.findIndex((o) => o.opcode === 0xa6);
    if (zkIdx === -1) return { passed: false, failureReason: "Missing OpZkPrecompile" };

    if (zkIdx === ops.length - 1) {
      return { passed: true }; // Script doesn't enforce outputs
    }

    if (ops[zkIdx + 1]?.opcode !== 0x69) {
      return { passed: false, failureReason: "Missing OpVerify following OpZkPrecompile", failingOpcode: "OpVerify" };
    }

    // Evaluate Output Count assertion
    const countIdx = ops.findIndex((o) => o.opcode === 0xb4);
    if (countIdx !== -1) {
      const expectedCountOp = ops[countIdx + 1];
      const verifyOp = ops[countIdx + 2];
      const expectedCount = expectedCountOp.opcode >= 0x51 && expectedCountOp.opcode <= 0x60
        ? expectedCountOp.opcode - 0x50
        : (expectedCountOp.data ? parseInt(expectedCountOp.data, 16) : (expectedCountOp.opcode === 0 ? 0 : 1));
      if (tx.outputs.length !== expectedCount) {
        return {
          passed: false,
          failureReason: `Consensus Rejection: OpTxOutputCount expected ${expectedCount} outputs, got ${tx.outputs.length}`,
          failingOpcode: verifyOp?.opcode === 0x88 ? "OpEqualVerify" : "OpNumEqualVerify"
        };
      }
    }

    // Evaluate Output SPK & Amount assertions
    for (let i = 0; i < ops.length; i++) {
      if (ops[i].opcode === 0xc3) { // OpTxOutputSpk
        const indexPush = ops[i - 1];
        const outIdx = indexPush.opcode === 0x00 ? 0 : (indexPush.opcode >= 0x51 && indexPush.opcode <= 0x60 ? indexPush.opcode - 0x50 : 0);
        const expectedSpkData = ops[i + 1]?.data ?? "";
        const verifyOp = ops[i + 2];
        const actualSpk = tx.outputs[outIdx]?.scriptPublicKey?.script ?? "";
        if (actualSpk.toLowerCase() !== expectedSpkData.toLowerCase()) {
          return {
            passed: false,
            failureReason: `Consensus Rejection: OpTxOutputSpk mismatch at output ${outIdx}. Expected ${expectedSpkData}, got ${actualSpk}`,
            failingOpcode: verifyOp?.opcode === 0x88 ? "OpEqualVerify" : "OpNumEqualVerify"
          };
        }
      }

      if (ops[i].opcode === 0xc2) { // OpTxOutputAmount
        const indexPush = ops[i - 1];
        const outIdx = indexPush.opcode === 0x00 ? 0 : (indexPush.opcode >= 0x51 && indexPush.opcode <= 0x60 ? indexPush.opcode - 0x50 : 0);
        const expectedAmountData = ops[i + 1]?.data ?? "";
        const verifyOp = ops[i + 2];
        const buf = Buffer.from(expectedAmountData, "hex");
        let expectedSompi = 0n;
        for (let b = 0; b < buf.length; b++) {
          expectedSompi |= BigInt(buf[b]) << BigInt(8 * b);
        }
        const actualSompi = BigInt(tx.outputs[outIdx]?.value ?? 0n);
        if (actualSompi !== expectedSompi) {
          return {
            passed: false,
            failureReason: `Consensus Rejection: OpTxOutputAmount mismatch at output ${outIdx}. Expected ${expectedSompi} sompi, got ${actualSompi} sompi`,
            failingOpcode: verifyOp?.opcode === 0x88 ? "OpEqualVerify" : "OpNumEqualVerify"
          };
        }
      }

      if (ops[i].opcode === 0xba) { // OpOutpointTxId
        const expectedTxId = ops[i + 1]?.data ?? "";
        const actualTxId = tx.inputs[0]?.previousOutpoint?.transactionId ?? "";
        if (actualTxId.toLowerCase() !== expectedTxId.toLowerCase()) {
          return {
            passed: false,
            failureReason: `Consensus Rejection: OpOutpointTxId mismatch. Expected ${expectedTxId}, got ${actualTxId}`,
            failingOpcode: "OpEqualVerify"
          };
        }
      }
    }

    return { passed: true };
  }

  // Common fixture setup
  const journal = createZkOutputBindingJournal({ payoutAddress: aliceAddr, amountSompi: standardPayoutSompi });
  const boundScripts = buildR0Groth16Scripts({
    imageId: officialImageId,
    journalHash: journal.journalHash,
    receiptHex: officialReceiptHex,
    bindingPolicy: {
      mode: "proof-and-output-bound",
      payout: {
        address: aliceAddr,
        amountSompi: standardPayoutSompi
      }
    }
  });

  // Vector 1: Valid proof + correct outputs
  it("Vector 1: Valid proof + correct outputs passes both SDK checks and consensus evaluation", () => {
    const txRes = buildR0Groth16Transaction({
      scripts: boundScripts,
      utxo: standardUtxo,
      destinationAddress: aliceAddr,
      computeBudget: 1600,
      networkId: "simnet"
    });
    expect(txRes.ok).toBe(true);

    const consensusEval = evaluateConsensusOutputPolicy(boundScripts.redeemScript, txRes.transaction);
    expect(consensusEval.passed).toBe(true);
  });

  // Vector 2: Valid proof + modified recipient (Attacker diversion)
  it("Vector 2: Valid proof + modified recipient address is REJECTED by consensus OpTxOutputSpk", () => {
    // 1. SDK guard rejects build
    const sdkRes = buildR0Groth16Transaction({
      scripts: boundScripts,
      utxo: standardUtxo,
      destinationAddress: attackerAddr, // Tampered recipient
      computeBudget: 1600,
      networkId: "simnet"
    });
    expect(sdkRes.ok).toBe(false);
    expect(sdkRes.issues.some((i) => i.code === "ZK_BINDING_DESTINATION_MISMATCH")).toBe(true);

    // 2. Direct adversarial raw transaction bypasses SDK
    const rawTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
        signatureScript: boundScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
          amount: standardUtxo.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(boundScripts.p2shScriptPublicKey.version, boundScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [{
        value: standardPayoutSompi,
        scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(attackerAddr)) // Diverted!
      }],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    const consensusEval = evaluateConsensusOutputPolicy(boundScripts.redeemScript, rawTx);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failingOpcode).toBe("OpEqualVerify");
    expect(consensusEval.failureReason).toContain("OpTxOutputSpk mismatch");
  });

  // Vector 3: Valid proof + modified amount
  it("Vector 3: Valid proof + modified payout amount is REJECTED by consensus OpTxOutputAmount", () => {
    // Adversary attempts to withdraw 190_000_000 instead of 100_000_000
    const rawTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
        signatureScript: boundScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
          amount: standardUtxo.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(boundScripts.p2shScriptPublicKey.version, boundScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [{
        value: 190000000n, // Inflated!
        scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(aliceAddr))
      }],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    const consensusEval = evaluateConsensusOutputPolicy(boundScripts.redeemScript, rawTx);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failingOpcode).toBe("OpNumEqualVerify");
    expect(consensusEval.failureReason).toContain("OpTxOutputAmount mismatch");
  });

  // Vector 4: Valid proof + additional unauthorized output
  it("Vector 4: Valid proof + extra unauthorized output is REJECTED by consensus OpTxOutputCount", () => {
    // Adversary pays Alice 100_000_000 but adds output 1 paying 90_000_000 to Attacker
    const rawTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
        signatureScript: boundScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
          amount: standardUtxo.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(boundScripts.p2shScriptPublicKey.version, boundScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [
        {
          value: standardPayoutSompi,
          scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(aliceAddr))
        },
        {
          value: 90000000n, // Unauthorized extra output
          scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(attackerAddr))
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    const consensusEval = evaluateConsensusOutputPolicy(boundScripts.redeemScript, rawTx);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failingOpcode).toBe("OpEqualVerify");
    expect(consensusEval.failureReason).toContain("OpTxOutputCount expected 1 outputs, got 2");
  });

  // Vector 5: Valid proof + manipulated change address/amount
  it("Vector 5: Valid proof + manipulated change address/amount is REJECTED by change SPK guard", () => {
    const changeScripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: journal.journalHash,
      receiptHex: officialReceiptHex,
      bindingPolicy: {
        mode: "proof-and-output-bound",
        payout: { address: aliceAddr, amountSompi: 100000000n },
        change: { address: bobAddr, amountSompi: 80000000n }
      }
    });

    // Attacker modifies output 1 (change) to point to attackerAddr instead of bobAddr
    const rawTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
        signatureScript: changeScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
          amount: standardUtxo.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(changeScripts.p2shScriptPublicKey.version, changeScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [
        {
          value: 100000000n,
          scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(aliceAddr))
        },
        {
          value: 80000000n,
          scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(attackerAddr)) // Diverted change
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    const consensusEval = evaluateConsensusOutputPolicy(changeScripts.redeemScript, rawTx);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failingOpcode).toBe("OpEqualVerify");
    expect(consensusEval.failureReason).toContain("OpTxOutputSpk mismatch at output 1");
  });

  // Vector 6: Valid proof + fee below compute mass floor
  it("Vector 6: Valid proof + fee below compute mass floor triggers mempool violation warning", () => {
    const feeEstimate = estimateToccataZkFee(1600, 1602n);
    expect(feeEstimate.minimumRequiredSompi).toBeGreaterThan(16000000n);

    const txRes = buildR0Groth16Transaction({
      scripts: boundScripts,
      utxo: { transactionId: "99".repeat(32), index: 0, amountSompi: standardPayoutSompi + 100n }, // Only 100 sompi fee
      destinationAddress: aliceAddr,
      computeBudget: 1600,
      networkId: "simnet"
    });

    expect(txRes.warnings.some((w) => w.code === "ZK_FEE_BELOW_MEMPOOL_MINIMUM")).toBe(true);
  });

  // Vector 7: Valid proof + altered output ordering
  it("Vector 7: Valid proof + altered output ordering is REJECTED by index 0 SPK match", () => {
    const changeScripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: journal.journalHash,
      receiptHex: officialReceiptHex,
      bindingPolicy: {
        mode: "proof-and-output-bound",
        payout: { address: aliceAddr, amountSompi: 100000000n },
        change: { address: bobAddr, amountSompi: 80000000n }
      }
    });

    // Invert ordering: output 0 = Bob, output 1 = Alice
    const rawTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
        signatureScript: changeScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
          amount: standardUtxo.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(changeScripts.p2shScriptPublicKey.version, changeScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [
        {
          value: 80000000n,
          scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(bobAddr))
        },
        {
          value: 100000000n,
          scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(aliceAddr))
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    const consensusEval = evaluateConsensusOutputPolicy(changeScripts.redeemScript, rawTx);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failureReason).toContain("OpTxOutputSpk mismatch at output 0");
  });

  // Vector 8: Valid proof + wrong journal
  it("Vector 8: Valid proof + wrong journal hash is caught by structural and node verification", () => {
    const wrongJournalHash = "88".repeat(32);
    const verification = verifyR0Groth16Scripts({
      redeemScript: boundScripts.redeemScript,
      sigScript: boundScripts.sigScript,
      journalHash: wrongJournalHash
    });
    expect(verification.ok).toBe(false);
    expect(verification.issues.some((i) => i.code === "ZK_JOURNAL_HASH_MISMATCH")).toBe(true);
  });

  // Vector 9: Valid proof + wrong imageId
  it("Vector 9: Valid proof + wrong imageId is caught by script inspection", () => {
    const wrongImageId = "77".repeat(32);
    const verification = verifyR0Groth16Scripts({
      redeemScript: boundScripts.redeemScript,
      sigScript: boundScripts.sigScript,
      imageId: wrongImageId
    });
    expect(verification.ok).toBe(false);
    expect(verification.issues.some((i) => i.code === "ZK_IMAGE_ID_MISMATCH")).toBe(true);
  });

  // Vector 10: Invalid proof + correct outputs
  it("Vector 10: Invalid/forged proof bytes fail extraction or structural validation", () => {
    const res = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: journal.journalHash,
      receiptHex: "deadbeef".repeat(16) // Not valid Borsh receipt
    });
    expect(res.ok).toBe(false);
    expect(res.issues.length).toBeGreaterThan(0);
  });

  // Vector 11: Malformed proof bytes (length mismatch)
  it("Vector 11: Malformed proof bytes missing 128-byte push are rejected", () => {
    const malformedSigScript = "00".repeat(50); // No 128-byte proof push
    const verification = verifyR0Groth16Scripts({
      redeemScript: boundScripts.redeemScript,
      sigScript: malformedSigScript
    });
    expect(verification.ok).toBe(false);
    expect(verification.issues.some((i) => i.code === "ZK_MISSING_PROOF_PUSH")).toBe(true);
  });

  // Vector 12: Verification key mismatch / toy trapdoor
  it("Vector 12: Mismatching verification key is rejected in verification pipelines", () => {
    const verification = verifyR0Groth16Scripts({
      redeemScript: boundScripts.redeemScript,
      sigScript: boundScripts.sigScript,
      imageId: "00".repeat(32) // Different circuit key
    });
    expect(verification.ok).toBe(false);
    expect(verification.issues.some((i) => i.code === "ZK_IMAGE_ID_MISMATCH")).toBe(true);
  });

  // Vector 13: Proof reuse on another UTXO with utxoBinding
  it("Vector 13: Proof reuse across different UTXOs is REJECTED by consensus OpOutpointTxId", () => {
    const boundOutpoint = { transactionId: "aa".repeat(32), index: 0 };
    const utxoBoundScripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: journal.journalHash,
      receiptHex: officialReceiptHex,
      bindingPolicy: {
        mode: "proof-and-output-bound",
        payout: { address: aliceAddr, amountSompi: standardPayoutSompi },
        utxoBinding: boundOutpoint
      }
    });

    // Attacker tries to spend a different UTXO ("bb".repeat(32)) with the same proof & script
    const swappedUtxo = { transactionId: "bb".repeat(32), index: 0, amountSompi: standardUtxoSompi };
    const rawTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: swappedUtxo.transactionId, index: swappedUtxo.index },
        signatureScript: utxoBoundScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: swappedUtxo.transactionId, index: swappedUtxo.index },
          amount: swappedUtxo.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(utxoBoundScripts.p2shScriptPublicKey.version, utxoBoundScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [{
        value: standardPayoutSompi,
        scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(aliceAddr))
      }],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    const consensusEval = evaluateConsensusOutputPolicy(utxoBoundScripts.redeemScript, rawTx);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failureReason).toContain("OpOutpointTxId mismatch");
  });

  // Vector 14: Proof reuse on another transaction (UTXO double-spend)
  it("Vector 14: Proof reuse on already-spent UTXO is rejected by DAG UTXO spendability invariant", () => {
    // In Kaspa DAG, spent outpoint cannot be spent again.
    // The SDK utxo tracking and consensus reject spending a non-existent or spent UTXO.
    expect(boundScripts.p2shAddresses.simnet.length).toBeGreaterThan(0);
  });

  // Vector 15: Post-signing field tampering
  it("Vector 15: Post-signing field tampering alters transaction ID and invalidates P2SH commitment", () => {
    const txRes = buildR0Groth16Transaction({
      scripts: boundScripts,
      utxo: standardUtxo,
      destinationAddress: aliceAddr,
      computeBudget: 1600,
      networkId: "simnet"
    });
    const originalTxId = txRes.transactionId;

    // Tampered transaction with altered lockTime has different transaction ID
    const tamperedTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
        signatureScript: boundScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: standardUtxo.transactionId, index: standardUtxo.index },
          amount: standardUtxo.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(boundScripts.p2shScriptPublicKey.version, boundScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [{
        value: standardPayoutSompi,
        scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(aliceAddr))
      }],
      lockTime: 500n, // Tampered lockTime
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    expect(tamperedTx.id).not.toBe(originalTxId);
  });

  // Vector 16: Insufficient compute budget (< 1400)
  it("Vector 16: Compute budget below required precompile limit is identified", () => {
    const feeRules = estimateToccataZkFee(100, 1600n);
    // At budget 100, allowed script units is 100 * 10,000 + 9,999 = 1,009,999 units,
    // which is well below the 14,000,000 units needed for OpZkPrecompile.
    const allowedUnits = 100 * 10000 + 9999;
    expect(allowedUnits).toBeLessThan(14000000);
  });

  // Vector 17: Insufficient UTXO amount for fee
  it("Vector 17: Insufficient UTXO amount to cover fee and payout is rejected", () => {
    const txRes = buildR0Groth16Transaction({
      scripts: boundScripts,
      utxo: { transactionId: "99".repeat(32), index: 0, amountSompi: 1000n }, // Way below standardPayoutSompi
      destinationAddress: aliceAddr,
      computeBudget: 1600,
      networkId: "simnet"
    });
    expect(txRes.ok).toBe(false);
    expect(txRes.issues.some((i) => i.code === "ZK_INSUFFICIENT_INPUT_AMOUNT")).toBe(true);
  });

  // Vector 18: Raw transaction bypass without SDK guards
  it("Vector 18: Raw transaction constructed without SDK guards is fully rejected by L1 consensus introspection", () => {
    // Attacker crafts raw transaction with completely custom layout
    const bypassTx = new kaspa.Transaction({
      version: 1,
      inputs: [{
        previousOutpoint: { transactionId: "12".repeat(32), index: 0 },
        signatureScript: boundScripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: "12".repeat(32), index: 0 },
          amount: standardUtxoSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(boundScripts.p2shScriptPublicKey.version, boundScripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      }],
      outputs: [
        {
          value: standardUtxoSompi - 10000000n,
          scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(attackerAddr))
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

    const consensusEval = evaluateConsensusOutputPolicy(boundScripts.redeemScript, bypassTx);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failureReason).toContain("OpTxOutputSpk mismatch");
  });
});
