import { describe, it, expect } from "vitest";
import { v1StorageMass } from "@hardkas/tx-builder";
import {
  Mempool,
  UtxoLedger,
  UNACCEPTED_DAA_SCORE,
  createDefaultDevAccounts,
  measureTransactionMass,
  minimumRelayFee,
  signInputForAccount,
  type KaspaRpcTransaction,
  type SimulatorUtxo
} from "../src/index.js";

// rusty-kaspad 2.1.0's minimum relay fee for a v0 P2PK payment with one input and two outputs: 2 036 grams of compute
// mass at 100 sompi/gram (X3-02 of the 6-nov audit measured the same 203 600 on the Generator).
const RELAY_FEE_1_IN_2_OUT = 203_600n;

describe("Mempool (Double-Spend Protection & Priority)", () => {
  const accounts = createDefaultDevAccounts("simnet");
  const alice = accounts.alice;
  const bob = accounts.bob;

  function createSignedTx(inputUtxo: SimulatorUtxo, sendAmount: bigint, fee: bigint): KaspaRpcTransaction {
    const change = inputUtxo.amountSompi - sendAmount - fee;

    const outputs = [{ amount: sendAmount, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }];
    if (change > 0n) {
      outputs.push({ amount: change, scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey } });
    }

    const sighashTx = {
      version: 0,
      inputs: [{ transactionId: inputUtxo.transactionId, index: inputUtxo.index, sequence: 0n, sigOpCount: 1 }],
      outputs: outputs.map((o) => ({
        value: o.amount,
        scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }
      })),
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const sigScript = signInputForAccount(alice, sighashTx, 0, {
      amount: inputUtxo.amountSompi,
      scriptPublicKey: { version: 0, script: inputUtxo.scriptPublicKey }
    });

    return {
      version: 0,
      inputs: [
        {
          previousOutpoint: { transactionId: inputUtxo.transactionId, index: inputUtxo.index },
          signatureScript: sigScript,
          sequence: 0n,
          sigOpCount: 1
        }
      ],
      outputs,
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
  }

  const utxoOf = (n: number, amountSompi = 100_000_000n): SimulatorUtxo => ({
    transactionId: "00".repeat(31) + n.toString(16).padStart(2, "0"),
    index: 0,
    address: alice.address,
    amountSompi,
    scriptPublicKey: alice.scriptPublicKey,
    blockDaaScore: 10n,
    isCoinbase: false
  });

  it("accepts valid transaction and tracks spent outpoint", () => {
    const ledger = new UtxoLedger();
    const mempool = new Mempool();
    const utxo = utxoOf(1);
    ledger.addUtxo(utxo);

    const result = mempool.submitTransaction(createSignedTx(utxo, 50_000_000n, 300_000n), ledger, 100n);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mempool.hasTransaction(result.transactionId)).toBe(true);
    expect(mempool.isOutpointSpent(`${utxo.transactionId}:${utxo.index}`)).toBe(true);
  });

  it("rejects mempool double-spend (competing transaction trying to spend the same UTXO)", () => {
    const ledger = new UtxoLedger();
    const mempool = new Mempool();
    const utxo = utxoOf(1);
    ledger.addUtxo(utxo);

    expect(mempool.submitTransaction(createSignedTx(utxo, 50_000_000n, 300_000n), ledger, 100n).ok).toBe(true);
    const res2 = mempool.submitTransaction(createSignedTx(utxo, 60_000_000n, 310_000n), ledger, 100n);
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.code).toBe("RejectMempoolDoubleSpend");
      expect(res2.error).toContain("already spent by unconfirmed mempool transaction");
    }
  });

  it("prioritizes transactions with higher fee-rate for block inclusion", () => {
    const ledger = new UtxoLedger();
    const mempool = new Mempool();
    const utxo1 = utxoOf(1);
    const utxo2 = utxoOf(2);
    ledger.addUtxo(utxo1);
    ledger.addUtxo(utxo2);

    mempool.submitTransaction(createSignedTx(utxo1, 50_000_000n, 300_000n), ledger, 100n);
    mempool.submitTransaction(createSignedTx(utxo2, 50_000_000n, 600_000n), ledger, 100n);

    const selected = mempool.selectTransactionsForBlock();
    expect(selected.length).toBe(2);
    expect(selected[0]!.feeSompi).toBe(600_000n);
    expect(selected[1]!.feeSompi).toBe(300_000n);
  });

  it("SIM-04: an id the client carries is ignored (as by the node); the computed id is the transaction's", () => {
    const ledger = new UtxoLedger();
    const mempool = new Mempool();
    const utxo = utxoOf(3);
    ledger.addUtxo(utxo);

    const honest = createSignedTx(utxo, 50_000_000n, 250_000n);
    const forged = { ...honest, id: "deadbeef".repeat(8) };
    const res = mempool.submitTransaction(forged, ledger, 100n);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.transactionId).not.toBe("deadbeef".repeat(8));
    expect(mempool.hasTransaction("deadbeef".repeat(8))).toBe(false);
  });
});

describe("SIM-08 · masses and the relay fee as rusty-kaspad 2.1.0 (through @hardkas/tx-builder)", () => {
  const accounts = createDefaultDevAccounts("simnet");
  const alice = accounts.alice;
  const bob = accounts.bob;
  const sign = (utxo: SimulatorUtxo, outputs: Array<{ amount: bigint; spk: string }>) => {
    const sighashTx = {
      version: 0,
      inputs: [{ transactionId: utxo.transactionId, index: utxo.index, sequence: 0n, sigOpCount: 1 }],
      outputs: outputs.map((o) => ({ value: o.amount, scriptPublicKey: { version: 0, script: o.spk } })),
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    const sigScript = signInputForAccount(alice, sighashTx, 0, { amount: utxo.amountSompi, scriptPublicKey: { version: 0, script: utxo.scriptPublicKey } });
    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [{ previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index }, signatureScript: sigScript, sequence: 0n, sigOpCount: 1 }],
      outputs: outputs.map((o) => ({ amount: o.amount, scriptPublicKey: { version: 0, scriptPublicKey: o.spk } })),
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    return tx;
  };
  const coin = (amountSompi: bigint): SimulatorUtxo => ({
    transactionId: "11".repeat(32),
    index: 0,
    address: alice.address,
    amountSompi,
    scriptPublicKey: alice.scriptPublicKey,
    blockDaaScore: 10n,
    isCoinbase: false
  });

  it("the floor is 100 sompi per gram of compute mass: 203 600 accepted, 203 599 refused", () => {
    const input = coin(1_000n * 100_000_000n);
    for (const [fee, ok] of [[RELAY_FEE_1_IN_2_OUT, true], [RELAY_FEE_1_IN_2_OUT - 1n, false]] as const) {
      const ledger = new UtxoLedger();
      ledger.addUtxo(input);
      const tx = sign(input, [
        { amount: 10n * 100_000_000n, spk: bob.scriptPublicKey },
        { amount: input.amountSompi - 10n * 100_000_000n - fee, spk: alice.scriptPublicKey }
      ]);
      const res = new Mempool().submitTransaction(tx, ledger, 100n);
      expect(res.ok).toBe(ok);
      if (!res.ok) expect(res.code).toBe("RejectInsufficientFee");
    }
  });

  it("the storage mass is not charged by the relay floor (CA-TX-03): a 0.2 KAS payment pays the compute floor only", () => {
    const input = coin(100_000_000n);
    const ledger = new UtxoLedger();
    ledger.addUtxo(input);
    const tx = sign(input, [
      { amount: 20_000_000n, spk: bob.scriptPublicKey },
      { amount: input.amountSompi - 20_000_000n - RELAY_FEE_1_IN_2_OUT, spk: alice.scriptPublicKey }
    ]);
    const m = measureTransactionMass(tx, [input]);
    expect(m.storageMass).toBeGreaterThan(m.feeMass);
    expect(minimumRelayFee(m.feeMass)).toBe(RELAY_FEE_1_IN_2_OUT);
    expect(new Mempool().submitTransaction(tx, ledger, 100n).ok).toBe(true);
  });

  it("a covenant output counts with plurality 2 in the storage mass (it was ignored)", () => {
    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [{ previousOutpoint: { transactionId: "22".repeat(32), index: 0 }, signatureScript: "41" + "00".repeat(65), sequence: 0n, computeBudget: 1 } as any],
      outputs: [{ amount: 10_000_000n, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }, covenant: { authorizingInput: 0, covenantId: "33".repeat(32) } }],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    const plain = { ...tx, outputs: [{ amount: 10_000_000n, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }] };
    const spent = [coin(1_000_000_000n)];
    const withCovenant = measureTransactionMass(tx, spent).storageMass;
    const without = measureTransactionMass(plain, spent).storageMass;
    // KIP-9 with the Toccata plurality: the covenant output's term is C·2²/v instead of C/v
    expect(withCovenant).toBe(v1StorageMass([{ amountSompi: 1_000_000_000n, scriptBytes: 34, covenantId: false }], [{ amountSompi: 10_000_000n, scriptBytes: 34, covenantId: true }]));
    expect(withCovenant).toBeGreaterThan(3n * without);
  });
});

describe("SIM-09 · a chain of unconfirmed transactions", () => {
  const accounts = createDefaultDevAccounts("simnet");
  const alice = accounts.alice;
  const bob = accounts.bob;

  function payFrom(from: typeof alice, utxo: SimulatorUtxo, to: string, amount: bigint, fee: bigint): KaspaRpcTransaction {
    const outputs = [
      { amount, scriptPublicKey: { version: 0, scriptPublicKey: to } },
      { amount: utxo.amountSompi - amount - fee, scriptPublicKey: { version: 0, scriptPublicKey: from.scriptPublicKey } }
    ];
    const sighashTx = {
      version: 0,
      inputs: [{ transactionId: utxo.transactionId, index: utxo.index, sequence: 0n, sigOpCount: 1 }],
      outputs: outputs.map((o) => ({ value: o.amount, scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey } })),
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    const sigScript = signInputForAccount(from, sighashTx, 0, { amount: utxo.amountSompi, scriptPublicKey: { version: 0, script: utxo.scriptPublicKey } });
    return {
      version: 0,
      inputs: [{ previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index }, signatureScript: sigScript, sequence: 0n, sigOpCount: 1 }],
      outputs,
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
  }

  it("a child may spend an output of a parent still in the mempool; blocks take the parent first", () => {
    const ledger = new UtxoLedger();
    const mempool = new Mempool();
    const funding: SimulatorUtxo = {
      transactionId: "44".repeat(32),
      index: 0,
      address: alice.address,
      amountSompi: 10_000_000_000n,
      scriptPublicKey: alice.scriptPublicKey,
      blockDaaScore: 10n,
      isCoinbase: false
    };
    ledger.addUtxo(funding);

    const parent = payFrom(alice, funding, bob.scriptPublicKey, 5_000_000_000n, 300_000n);
    const p = mempool.submitTransaction(parent, ledger, 100n);
    expect(p.ok).toBe(true);
    if (!p.ok) return;

    // Bob spends the parent's output 0 before any block confirms it
    const parentOut: SimulatorUtxo = {
      transactionId: p.transactionId,
      index: 0,
      address: bob.address,
      amountSompi: 5_000_000_000n,
      scriptPublicKey: bob.scriptPublicKey,
      blockDaaScore: UNACCEPTED_DAA_SCORE,
      isCoinbase: false
    };
    // the child pays a much higher fee, so a plain feerate sort would put it first
    const child = payFrom(bob, parentOut, alice.scriptPublicKey, 1_000_000_000n, 5_000_000n);
    const c = mempool.submitTransaction(child, ledger, 100n);
    expect(c.ok).toBe(true);
    if (!c.ok) return;

    const selected = mempool.selectTransactionsForBlock().map((m) => m.transactionId);
    expect(selected).toEqual([p.transactionId, c.transactionId]);

    // the parent's output, once spent by the child, cannot be spent again
    const again = payFrom(bob, parentOut, alice.scriptPublicKey, 2_000_000_000n, 400_000n);
    const d = mempool.submitTransaction(again, ledger, 100n);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe("RejectMempoolDoubleSpend");
  });
});
