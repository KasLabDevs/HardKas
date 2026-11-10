import { describe, it, expect } from "vitest";
import {
  createDefaultDevAccounts,
  signInputForAccount,
  validateTransactionScripts,
  extractSignatureFromSignatureScript,
  extractPublicKeyFromScriptPublicKey,
  DUST_LIMIT_SOMPI,
  type KaspaRpcTransaction,
  type SimulatorUtxo
} from "../src/index.js";

describe("ScriptEngine & Signature Verification", () => {
  const accounts = createDefaultDevAccounts("simnet");
  const alice = accounts.alice;
  const bob = accounts.bob;

  it("verifies authentic BIP-340 Schnorr signature over Kaspa Sighash", () => {
    const inputUtxo: SimulatorUtxo = {
      transactionId: "00".repeat(31) + "01",
      index: 0,
      address: alice.address,
      amountSompi: 100_000_000n, // 1 KAS
      scriptPublicKey: alice.scriptPublicKey,
      blockDaaScore: 10n,
      isCoinbase: false
    };

    const fee = 2000n;
    const sendAmount = 50_000_000n;
    const change = inputUtxo.amountSompi - sendAmount - fee;

    const sighashTx = {
      version: 0,
      inputs: [{
        transactionId: inputUtxo.transactionId,
        index: inputUtxo.index,
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { value: sendAmount, scriptPublicKey: { version: 0, script: bob.scriptPublicKey } },
        { value: change, scriptPublicKey: { version: 0, script: alice.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const sigScript = signInputForAccount(alice, sighashTx, 0, {
      amount: inputUtxo.amountSompi,
      scriptPublicKey: { version: 0, script: inputUtxo.scriptPublicKey }
    });

    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: inputUtxo.transactionId, index: inputUtxo.index },
        signatureScript: sigScript,
        sequence: 0n,
        sigOpCount: 1
      }],
      outputs: [
        { amount: sendAmount, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } },
        { amount: change, scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const result = validateTransactionScripts(tx, [inputUtxo], 100n);
    expect(result.valid).toBe(true);
    expect(result.feeSompi).toBe(fee);
  });

  it("rejects invalid signature (signed with wrong key)", () => {
    const inputUtxo: SimulatorUtxo = {
      transactionId: "00".repeat(31) + "01",
      index: 0,
      address: alice.address,
      amountSompi: 100_000_000n,
      scriptPublicKey: alice.scriptPublicKey,
      blockDaaScore: 10n,
      isCoinbase: false
    };

    const sendAmount = 50_000_000n;

    const sighashTx = {
      version: 0,
      inputs: [{ transactionId: inputUtxo.transactionId, index: inputUtxo.index, sequence: 0n }],
      outputs: [{ value: sendAmount, scriptPublicKey: { version: 0, script: bob.scriptPublicKey } }],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    // Bob tries to sign Alice's UTXO!
    const wrongSigScript = signInputForAccount(bob, sighashTx, 0, {
      amount: inputUtxo.amountSompi,
      scriptPublicKey: { version: 0, script: inputUtxo.scriptPublicKey }
    });

    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: inputUtxo.transactionId, index: inputUtxo.index },
        signatureScript: wrongSigScript,
        sequence: 0n
      }],
      outputs: [{ amount: sendAmount, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const result = validateTransactionScripts(tx, [inputUtxo], 100n);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("invalid Schnorr signature");
  });

  it("rejects transactions that output below the dust limit (600 sompi)", () => {
    const inputUtxo: SimulatorUtxo = {
      transactionId: "00".repeat(31) + "01",
      index: 0,
      address: alice.address,
      amountSompi: 100_000_000n,
      scriptPublicKey: alice.scriptPublicKey,
      blockDaaScore: 10n,
      isCoinbase: false
    };

    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: inputUtxo.transactionId, index: inputUtxo.index },
        signatureScript: "41" + "00".repeat(65),
        sequence: 0n
      }],
      outputs: [
        { amount: DUST_LIMIT_SOMPI - 1n, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const result = validateTransactionScripts(tx, [inputUtxo], 100n);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("below dust limit");
  });

  it("recognises a P2PK signature script only with its OP_DATA_65 push (a bare 65-byte script is not a push)", () => {
    const sig = "11".repeat(64) + "01";
    expect(extractSignatureFromSignatureScript(`41${sig}`)?.signature).toBe(sig);
    expect(extractSignatureFromSignatureScript(sig)).toBeUndefined();
    expect(extractPublicKeyFromScriptPublicKey(alice.scriptPublicKey)).toBe(alice.publicKey);
  });

  it("runs a bare 65-byte signature script through the engine: it is not push-only and is rejected", () => {
    const inputUtxo: SimulatorUtxo = {
      transactionId: "00".repeat(31) + "02",
      index: 0,
      address: alice.address,
      amountSompi: 100_000_000n,
      scriptPublicKey: alice.scriptPublicKey,
      blockDaaScore: 10n,
      isCoinbase: false
    };
    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [{ previousOutpoint: { transactionId: inputUtxo.transactionId, index: 0 }, signatureScript: "ac".repeat(65), sequence: 0n, sigOpCount: 1 }],
      outputs: [{ amount: 50_000_000n, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    const result = validateTransactionScripts(tx, [inputUtxo], 100n);
    expect(result.valid).toBe(false);
    expect(result.scriptCode).toBe("SCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY");
  });

  it("rejects transactions spending more than input funds", () => {
    const inputUtxo: SimulatorUtxo = {
      transactionId: "00".repeat(31) + "01",
      index: 0,
      address: alice.address,
      amountSompi: 100_000_000n,
      scriptPublicKey: alice.scriptPublicKey,
      blockDaaScore: 10n,
      isCoinbase: false
    };

    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: inputUtxo.transactionId, index: inputUtxo.index },
        signatureScript: "41" + "00".repeat(65),
        sequence: 0n
      }],
      outputs: [
        { amount: 200_000_000n, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const result = validateTransactionScripts(tx, [inputUtxo], 100n);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Insufficient input funds");
  });
});
