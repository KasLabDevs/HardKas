import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  UtxoLedger,
  Mempool,
  createDefaultDevAccounts,
  signInputForAccount,
  DUST_LIMIT_SOMPI,
  type SimulatorUtxo,
  type KaspaRpcTransaction
} from "../src/index.js";

describe("Property-Based Testing & Fuzzing (fast-check)", () => {
  const accounts = createDefaultDevAccounts("simnet");
  const alice = accounts.alice;
  const bob = accounts.bob;

  // Property 1: Conservation of sompi (inputs < outputs MUST always be rejected)
  it("Property: Any transaction with outputs > inputs is rejected (Conservation of Sompi)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1_000_000n, max: 10_000_000_000n }),
        fc.bigInt({ min: 1n, max: 100_000_000n }),
        (inputAmount, deficit) => {
          const ledger = new UtxoLedger();
          const mempool = new Mempool();

          const utxo: SimulatorUtxo = {
            transactionId: "01".repeat(32),
            index: 0,
            address: alice.address,
            amountSompi: inputAmount,
            scriptPublicKey: alice.scriptPublicKey,
            blockDaaScore: 10n,
            isCoinbase: false
          };
          ledger.addUtxo(utxo);

          const outputAmount = inputAmount + deficit; // Output exceeds input!

          const tx: KaspaRpcTransaction = {
            version: 0,
            inputs: [{
              previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
              signatureScript: "41" + "00".repeat(64) + "01",
              sequence: 0n,
              sigOpCount: 1
            }],
            outputs: [{
              amount: outputAmount,
              scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
            }],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          };

          const res = mempool.submitTransaction(tx, ledger, 100n);
          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(res.code).toBe("RejectScriptFailed");
            expect(res.error).toContain("Insufficient input funds");
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  // Property 2: Double-spend invariance
  it("Property: For any valid transaction, no second transaction can spend the same outpoint in mempool", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 5_000_000_000n, max: 10_000_000_000n }),
        fc.bigInt({ min: 203_600n, max: 1_000_000n }), // at or above the node's relay floor (SIM-08)
        (utxoAmount, fee) => {
          const ledger = new UtxoLedger();
          const mempool = new Mempool();

          const utxo: SimulatorUtxo = {
            transactionId: "02".repeat(32),
            index: 0,
            address: alice.address,
            amountSompi: utxoAmount,
            scriptPublicKey: alice.scriptPublicKey,
            blockDaaScore: 10n,
            isCoinbase: false
          };
          ledger.addUtxo(utxo);

          const sendAmount = utxoAmount - fee;

          const sighashTx = {
            version: 0,
            inputs: [{ transactionId: utxo.transactionId, index: utxo.index, sequence: 0n, sigOpCount: 1 }],
            outputs: [{ value: sendAmount, scriptPublicKey: { version: 0, script: bob.scriptPublicKey } }],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          };

          const sigScript = signInputForAccount(alice, sighashTx, 0, {
            amount: utxo.amountSompi,
            scriptPublicKey: { version: 0, script: utxo.scriptPublicKey }
          });

          const tx: KaspaRpcTransaction = {
            version: 0,
            inputs: [{
              previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
              signatureScript: sigScript,
              sequence: 0n,
              sigOpCount: 1
            }],
            outputs: [{
              amount: sendAmount,
              scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
            }],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          };

          // 1st submit succeeds
          const res1 = mempool.submitTransaction(tx, ledger, 100n);
          expect(res1.ok).toBe(true);

          // 2nd submit MUST fail with RejectMempoolDoubleSpend or RejectDuplicate
          const res2 = mempool.submitTransaction(tx, ledger, 100n);
          expect(res2.ok).toBe(false);
          if (!res2.ok) {
            expect(["RejectMempoolDoubleSpend", "RejectDuplicate"]).toContain(res2.code);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  // Property 3: Dust rejection invariance (any amount < DUST_LIMIT_SOMPI (600) is rejected)
  it("Property: Any output with amount < 600 sompi is strictly rejected as dust", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: DUST_LIMIT_SOMPI - 1n }),
        (dustAmount) => {
          const ledger = new UtxoLedger();
          const mempool = new Mempool();

          const utxo: SimulatorUtxo = {
            transactionId: "03".repeat(32),
            index: 0,
            address: alice.address,
            amountSompi: 10_000_000_000n,
            scriptPublicKey: alice.scriptPublicKey,
            blockDaaScore: 10n,
            isCoinbase: false
          };
          ledger.addUtxo(utxo);

          const fee = 300_000n; // above the node's relay floor (SIM-08)
          const change = utxo.amountSompi - dustAmount - fee;

          const sighashTx = {
            version: 0,
            inputs: [{ transactionId: utxo.transactionId, index: utxo.index, sequence: 0n, sigOpCount: 1 }],
            outputs: [
              { value: dustAmount, scriptPublicKey: { version: 0, script: bob.scriptPublicKey } },
              { value: change, scriptPublicKey: { version: 0, script: alice.scriptPublicKey } }
            ],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          };

          const sigScript = signInputForAccount(alice, sighashTx, 0, {
            amount: utxo.amountSompi,
            scriptPublicKey: { version: 0, script: utxo.scriptPublicKey }
          });

          const tx: KaspaRpcTransaction = {
            version: 0,
            inputs: [{
              previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
              signatureScript: sigScript,
              sequence: 0n,
              sigOpCount: 1
            }],
            outputs: [
              { amount: dustAmount, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } },
              { amount: change, scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey } }
            ],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          };

          const res = mempool.submitTransaction(tx, ledger, 100n);
          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(res.code).toBe("RejectScriptFailed");
            expect(res.error).toContain("below dust limit");
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  // Property 4: Signature tampering detection (random byte tampering MUST fail signature verification)
  it("Property: Mutating any byte of a valid Schnorr signature script causes verification failure", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 63 }), // a byte of the 64-byte signature (byte 64 is the sighash type, not the signature)
        fc.integer({ min: 1, max: 255 }), // XOR mask
        (byteOffset, mask) => {
          const ledger = new UtxoLedger();
          const mempool = new Mempool();

          const utxo: SimulatorUtxo = {
            transactionId: "04".repeat(32),
            index: 0,
            address: alice.address,
            amountSompi: 10_000_000_000n,
            scriptPublicKey: alice.scriptPublicKey,
            blockDaaScore: 10n,
            isCoinbase: false
          };
          ledger.addUtxo(utxo);

          const fee = 300_000n; // above the node's relay floor (SIM-08)
          const sendAmount = utxo.amountSompi - fee;

          const sighashTx = {
            version: 0,
            inputs: [{ transactionId: utxo.transactionId, index: utxo.index, sequence: 0n, sigOpCount: 1 }],
            outputs: [{ value: sendAmount, scriptPublicKey: { version: 0, script: bob.scriptPublicKey } }],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          };

          const validSig = signInputForAccount(alice, sighashTx, 0, {
            amount: utxo.amountSompi,
            scriptPublicKey: { version: 0, script: utxo.scriptPublicKey }
          });

          // Mutate the signature script at byteOffset
          const sigBytes = Buffer.from(validSig.replace(/^41/, ""), "hex");
          sigBytes[byteOffset] = sigBytes[byteOffset]! ^ mask; // mask >= 1: the byte always changes
          const tamperedSig = "41" + sigBytes.toString("hex");

          const tx: KaspaRpcTransaction = {
            version: 0,
            inputs: [{
              previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
              signatureScript: tamperedSig,
              sequence: 0n,
              sigOpCount: 1
            }],
            outputs: [{
              amount: sendAmount,
              scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
            }],
            lockTime: 0n,
            subnetworkId: "00".repeat(20),
            gas: 0n,
            payload: ""
          };

          const res = mempool.submitTransaction(tx, ledger, 100n);
          expect(res.ok).toBe(false);
          if (!res.ok) {
            expect(res.code).toBe("RejectScriptFailed");
            expect(res.error).toContain("invalid Schnorr signature");
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
