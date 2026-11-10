import { describe, it, expect } from "vitest";
import { managedKaspaWasm } from "./helpers/managed-wasm.js";
import { transactionId } from "../src/crypto/tx-hashing.js";
import { verifyKaspaInputSignature, kaspaSighashInputsFromWasm, signKaspaInput } from "../src/crypto/kaspa-sighash.js";
import { deriveAccountFromSeed } from "../src/crypto/accounts.js";
import { transactionMass } from "../src/mass.js";

// HK-06 / CA-EV-01: the managed, digest-verified kaspa-wasm (HARDKAS_HOME); without it the suite is skipped with the reason
const { k, reason: noWasm } = managedKaspaWasm();

const big = (v: unknown) => BigInt(String(v).replace(/n$/, ""));

describe.skipIf(!k)(`kaspa-wasm 2.1.0 vs simulator: addresses, v0 txid (local hasher), signatures, mass${noWasm ? ` (skipped: ${noWasm})` : ""}`, () => {
  it("computes identical Bech32 addresses and SPKs", () => {
    const alice = deriveAccountFromSeed("alice", 0, "simnet");
    const wasmAddr = new k.PrivateKey(alice.privateKey).toKeypair().toAddress("simnet").toString();
    expect(wasmAddr).toBe(alice.address);

    const wasmSpk = String(k.payToAddressScript(alice.address).script);
    expect(wasmSpk).toBe(alice.scriptPublicKey);
  });

  it("the simulator's own v0 hasher gives kaspa-wasm's transaction id (no longer delegated, so not tautological: SIM-04)", () => {
    const alice = deriveAccountFromSeed("alice", 0, "simnet");
    const bob = deriveAccountFromSeed("bob", 1, "simnet");

    const prevTxId = "ab".repeat(32);
    const entry = {
      address: alice.address,
      outpoint: { transactionId: prevTxId, index: 1 },
      amount: 100_000_000n,
      scriptPublicKey: k.payToAddressScript(alice.address),
      blockDaaScore: 10n,
      isCoinbase: false
    };
    const outputs = [
      { address: bob.address, amount: 40_000_000n },
      { address: alice.address, amount: 59_990_000n }
    ];
    const tx = k.createTransaction([entry], outputs, 0n, "", 1);
    const signed = k.signTransaction(tx, [new k.PrivateKey(alice.privateKey)], true);
    const ser = signed.serializeToObject();

    const simTxId = transactionId({
      version: Number(ser.version),
      inputs: ser.inputs.map((i: any) => ({
        previousOutpoint: { transactionId: i.transactionId, index: Number(i.index) },
        signatureScript: i.signatureScript,
        sequence: big(i.sequence),
        sigOpCount: Number(i.sigOpCount)
      })),
      outputs: ser.outputs.map((o: any) => ({
        amount: big(o.value),
        scriptPublicKey: {
          version: parseInt(String(o.scriptPublicKey).slice(0, 4), 16),
          scriptPublicKey: String(o.scriptPublicKey).slice(4)
        }
      })),
      lockTime: big(ser.lockTime),
      subnetworkId: ser.subnetworkId,
      gas: 0n,
      payload: ser.payload ?? ""
    });

    expect(simTxId).toBe(String(signed.id));
  });

  it("verifies signatures symmetrically between WASM and Simulator", () => {
    const alice = deriveAccountFromSeed("alice", 0, "simnet");
    const bob = deriveAccountFromSeed("bob", 1, "simnet");

    const prevTxId = "ab".repeat(32);
    const entry = {
      address: alice.address,
      outpoint: { transactionId: prevTxId, index: 1 },
      amount: 100_000_000n,
      scriptPublicKey: k.payToAddressScript(alice.address),
      blockDaaScore: 10n,
      isCoinbase: false
    };
    const outputs = [
      { address: bob.address, amount: 40_000_000n },
      { address: alice.address, amount: 59_990_000n }
    ];
    const tx = k.createTransaction([entry], outputs, 0n, "", 1);
    const signed = k.signTransaction(tx, [new k.PrivateKey(alice.privateKey)], true);
    const ser = signed.serializeToObject();

    const { tx: stx, utxos } = kaspaSighashInputsFromWasm(ser);
    const sigScript: string = ser.inputs[0].signatureScript;
    const sig = sigScript.slice(2);

    const wasmValid = verifyKaspaInputSignature({
      tx: stx,
      inputIndex: 0,
      utxo: utxos[0]!,
      publicKey: alice.publicKey,
      signature: sig
    });
    expect(wasmValid).toBe(true);

    const mySig = signKaspaInput(stx, 0, utxos[0]!, alice.privateKey);
    const simValid = verifyKaspaInputSignature({
      tx: stx,
      inputIndex: 0,
      utxo: utxos[0]!,
      publicKey: alice.publicKey,
      signature: mySig
    });
    expect(simValid).toBe(true);
  });

  it("matches total mass calculations with WASM calculateTransactionMass", () => {
    const alice = deriveAccountFromSeed("alice", 0, "simnet");
    const bob = deriveAccountFromSeed("bob", 1, "simnet");

    const entry = {
      address: alice.address,
      outpoint: { transactionId: "11".repeat(32), index: 0 },
      amount: 100_000_000n,
      scriptPublicKey: k.payToAddressScript(alice.address),
      blockDaaScore: 10n,
      isCoinbase: false
    };
    const outputs = [
      { address: bob.address, amount: 40_000_000n },
      { address: alice.address, amount: 59_990_000n }
    ];
    const tx = k.createTransaction([entry], outputs, 0n, "", 1);
    const signed = k.signTransaction(tx, [new k.PrivateKey(alice.privateKey)], true);
    const ser = signed.serializeToObject();

    const simTx = {
      version: Number(ser.version),
      inputs: ser.inputs.map((i: any) => ({
        previousOutpoint: { transactionId: i.transactionId, index: Number(i.index) },
        signatureScript: i.signatureScript,
        sequence: big(i.sequence),
        sigOpCount: Number(i.sigOpCount)
      })),
      outputs: ser.outputs.map((o: any) => ({
        amount: big(o.value),
        scriptPublicKey: {
          version: parseInt(String(o.scriptPublicKey).slice(0, 4), 16),
          scriptPublicKey: String(o.scriptPublicKey).slice(4)
        }
      })),
      lockTime: big(ser.lockTime),
      subnetworkId: ser.subnetworkId,
      gas: big(ser.gas),
      payload: ser.payload ?? ""
    };

    const wasmMass = big(k.calculateTransactionMass("simnet", signed));
    const simMass = transactionMass(simTx, [100_000_000n]);
    expect(simMass.mass).toBe(wasmMass);
  });
});
