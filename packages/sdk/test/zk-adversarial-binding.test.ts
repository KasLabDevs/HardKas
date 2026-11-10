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
// The official RISC Zero vector (fixtures/toccata-v2/zk/r0-groth16-official): the receipt proves exactly this
// (imageId, journalHash) pair. Develop's suite used an image id the receipt does not prove, which the HK-19 claim
// cross-check now refuses (on-chain such a lock is unspendable). The HKZ1 journal is an off-chain convention only.
const officialImageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const officialJournalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";

describe("HardKAS ZK Consensus Binding — 18 Adversarial Attack Vectors & Safety Campaign", () => {
  const kaspa = loadManagedKaspaWasmSync();
  const aliceKey = new kaspa.PrivateKey("11".repeat(32));
  const aliceAddr = aliceKey.toKeypair().toAddress("simnet").toString();
  const bobKey = new kaspa.PrivateKey("22".repeat(32));
  const bobAddr = bobKey.toKeypair().toAddress("simnet").toString();
  const attackerKey = new kaspa.PrivateKey("66".repeat(32));
  const attackerAddr = attackerKey.toKeypair().toAddress("simnet").toString();

  const standardPayoutSompi = 100000000n; // 1 KAS
  // The UTXO is funded with the scripts' requiredFundingSompi (bound payout + the fee for this spend), set below
  // once the scripts are built. Develop's suite funded 2 KAS for a 1 KAS payout: the other 1 KAS would have been fee.

  /**
   * OFFLINE MODEL of the node's output/input introspection rules (not consensus evidence: kaspa-wasm exposes no
   * script VM). It follows rusty-kaspa v2.1.0: OpTxOutputSpk pushes version (u16 BE) ++ script, OpTxInputCount the
   * input count, OpTxInputAmount the spent amount. The same rules are exercised on a real rusty-kaspad by
   * zk-output-bound-l1.simnet.test.ts.
   */
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
        const outSpk = tx.outputs[outIdx]?.scriptPublicKey;
        // what the node pushes: version (u16 big-endian) ++ script (SpkEncoding::to_bytes)
        const actualSpk = outSpk ? Number(outSpk.version).toString(16).padStart(4, "0") + String(outSpk.script) : "";
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

      if (ops[i].opcode === 0xb3) { // OpTxInputCount
        const expectedOp = ops[i + 1];
        const expected = expectedOp && expectedOp.opcode >= 0x51 && expectedOp.opcode <= 0x60 ? expectedOp.opcode - 0x50 : 1;
        if (tx.inputs.length !== expected) {
          return {
            passed: false,
            failureReason: `Consensus Rejection: OpTxInputCount expected ${expected} input(s), got ${tx.inputs.length}`,
            failingOpcode: "OpNumEqualVerify"
          };
        }
      }

      if (ops[i].opcode === 0xbe) { // OpTxInputAmount (of OpTxInputIndex) <= max
        const buf = Buffer.from(ops[i + 1]?.data ?? "", "hex");
        let max = 0n;
        for (let b = 0; b < buf.length; b++) max |= BigInt(buf[b]) << BigInt(8 * b);
        for (const input of tx.inputs) {
          const amount = BigInt(input?.utxo?.amount ?? 0n);
          if (amount > max) {
            return {
              passed: false,
              failureReason: `Consensus Rejection: OpTxInputAmount ${amount} exceeds the lock limit ${max}`,
              failingOpcode: "OpVerify"
            };
          }
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
    journalHash: officialJournalHash,
    receiptHex: officialReceiptHex,
    bindingPolicy: {
      mode: "proof-and-output-bound",
      payout: {
        address: aliceAddr,
        amountSompi: standardPayoutSompi
      }
    }
  });
  const standardUtxoSompi = boundScripts.requiredFundingSompi!;
  const standardUtxo = { transactionId: "99".repeat(32), index: 0, amountSompi: standardUtxoSompi };

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
    // the count is compared numerically (OpNumEqualVerify)
    expect(consensusEval.failingOpcode).toBe("OpNumEqualVerify");
    expect(consensusEval.failureReason).toContain("OpTxOutputCount expected 1 outputs, got 2");
  });

  // Vector 5: Valid proof + manipulated change address/amount
  it("Vector 5: Valid proof + manipulated change address/amount is REJECTED by change SPK guard", () => {
    const changeScripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
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
  it("Vector 6: an under-funded output-bound lock (fee below the compute-mass floor) is refused: the bound outputs cannot change", () => {
    const feeEstimate = estimateToccataZkFee(1600, 1602n);
    expect(feeEstimate.minimumRequiredSompi).toBeGreaterThan(16000000n);

    const txRes = buildR0Groth16Transaction({
      scripts: boundScripts,
      utxo: { transactionId: "99".repeat(32), index: 0, amountSompi: standardPayoutSompi + 100n }, // Only 100 sompi fee
      destinationAddress: aliceAddr,
      computeBudget: 1600,
      networkId: "simnet"
    });

    // proof-only can raise its fee, so there it is a warning; a bound lock's fee is fixed by its funding: an issue
    expect(txRes.ok).toBe(false);
    expect(txRes.issues.some((w) => w.code === "ZK_BOUND_FEE_BELOW_MEMPOOL_MINIMUM")).toBe(true);
    // the scripts told the funder the amount that avoids this
    expect(boundScripts.requiredFundingSompi! - standardPayoutSompi).toBeGreaterThanOrEqual(feeEstimate.minimumRequiredSompi);
  });

  // Vector 7: Valid proof + altered output ordering
  it("Vector 7: Valid proof + altered output ordering is REJECTED by index 0 SPK match", () => {
    const changeScripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
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
      journalHash: officialJournalHash,
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

  const spendOf = (scripts: any, inputs: Array<{ transactionId: string; amountSompi: bigint }>, outputs: Array<{ address: string; value: bigint }>, lockTime = 0n) =>
    new kaspa.Transaction({
      version: 1,
      inputs: inputs.map((u) => ({
        previousOutpoint: { transactionId: u.transactionId, index: 0 },
        signatureScript: scripts.sigScript,
        sequence: 0n,
        sigOpCount: 0,
        computeBudget: 1600,
        utxo: {
          outpoint: { transactionId: u.transactionId, index: 0 },
          amount: u.amountSompi,
          scriptPublicKey: new kaspa.ScriptPublicKey(scripts.p2shScriptPublicKey.version, scripts.p2shScriptPublicKey.script),
          blockDaaScore: 0n,
          isCoinbase: false
        }
      })),
      outputs: outputs.map((o) => ({ value: o.value, scriptPublicKey: kaspa.payToAddressScript(new kaspa.Address(o.address)) })),
      lockTime,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });

  // Vector 13: Proof reuse across UTXOs. Binding the outpoint is circular (refused); merging UTXOs is rejected.
  it("Vector 13: outpoint binding is refused (circular), and two UTXOs of the lock in one spend are REJECTED by OpTxInputCount", () => {
    const refused = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: officialReceiptHex,
      bindingPolicy: {
        mode: "proof-and-output-bound",
        payout: { address: aliceAddr, amountSompi: standardPayoutSompi },
        utxoBinding: { transactionId: "aa".repeat(32), index: 0 }
      }
    });
    expect(refused.ok).toBe(false);
    expect(refused.issues.map((i) => i.code)).toContain("ZK_UTXO_BINDING_UNSATISFIABLE");

    // Each UTXO of the lock can be spent on its own, to the same bound outputs. Two at once would send the second
    // UTXO's whole amount to the fee: the one-input rule refuses that.
    const merged = spendOf(boundScripts, [standardUtxo, { transactionId: "bb".repeat(32), amountSompi: standardUtxoSompi }], [{ address: aliceAddr, value: standardPayoutSompi }]);
    const consensusEval = evaluateConsensusOutputPolicy(boundScripts.redeemScript, merged);
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failureReason).toContain("OpTxInputCount expected 1 input(s), got 2");
  });

  // Vector 14: an oversized deposit at the lock cannot be burnt as fee
  it("Vector 14: a UTXO above the bound outputs plus the fee cap is refused by the SDK and REJECTED by the input limit", () => {
    const oversized = { transactionId: "cc".repeat(32), index: 0, amountSompi: boundScripts.maxInputSompi! + 1n };
    const sdkRes = buildR0Groth16Transaction({ scripts: boundScripts, utxo: oversized, destinationAddress: aliceAddr, computeBudget: 1600, networkId: "simnet" });
    expect(sdkRes.ok).toBe(false);
    expect(sdkRes.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["ZK_BOUND_INPUT_ABOVE_LOCK_LIMIT"]));
    const consensusEval = evaluateConsensusOutputPolicy(boundScripts.redeemScript, spendOf(boundScripts, [oversized], [{ address: aliceAddr, value: standardPayoutSompi }]));
    expect(consensusEval.passed).toBe(false);
    expect(consensusEval.failureReason).toContain("exceeds the lock limit");
  });

  // Vector 15: fields the lock does not bind. Develop's claim "invalidates P2SH commitment" was false: the proof
  // binds no transaction field, so a spend with the bound outputs and another lockTime still satisfies the lock.
  it("Vector 15: tampering a field the lock does not bind (lockTime) changes the txid but still satisfies the lock (documented property)", () => {
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
    // the outputs are still the bound ones: the lock is satisfied (the node also checks the lockTime itself)
    expect(evaluateConsensusOutputPolicy(boundScripts.redeemScript, tamperedTx).passed).toBe(true);
  });

  // Vector 16: Insufficient compute budget
  it("Vector 16: a compute budget below the precompile's requirement is refused by the SDK (ZK_COMPUTE_BUDGET_INSUFFICIENT)", () => {
    // budget 100 allows 100 * 10,000 + 9,999 script units, far below the Groth16 tag cost plus the VK elements
    const txRes = buildR0Groth16Transaction({ scripts: boundScripts, utxo: standardUtxo, destinationAddress: aliceAddr, computeBudget: 100, networkId: "simnet" });
    expect(txRes.ok).toBe(false);
    expect(txRes.issues.map((i) => i.code)).toContain("ZK_COMPUTE_BUDGET_INSUFFICIENT");
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
