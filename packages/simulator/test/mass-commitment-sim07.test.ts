import { describe, it, expect } from "vitest";
import { kaspaCovenantId } from "@hardkas/core";
import { v1StorageMass } from "@hardkas/tx-builder";
import { createKaspaSimulator, SOMPI_PER_KAS } from "../src/simulator-node.js";
import { signInputForAccount } from "../src/crypto/accounts.js";
import { computeTransactionId } from "../src/mempool/mempool.js";
import { checkMassCommitment, measureTransactionMass } from "../src/mass.js";
import type { KaspaRpcTransaction, SimulatorUtxo } from "../src/types.js";

/*
 * SIM-07 point 9 · the storage-mass commitment (rusty-kaspa v2.1.0):
 * - the mempool validates with TxValidationFlags::SkipMassCheck, computes the contextual (storage) mass itself and sets it
 *   on the transaction (consensus/src/pipeline/virtual_processor/utxo_validation.rs
 *   `validate_mempool_transaction_in_utxo_context`, `set_storage_mass`): the mass a client commits is replaced, not checked;
 * - block validation requires committed == calculated (tx_validation_in_utxo_context.rs `check_mass_commitment`,
 *   TxRuleError::WrongMass "calculated contextual mass (including storage mass) {0} is not equal to the committed mass field {1}").
 * The simulator used to keep whatever mass the client sent, so its blocks committed 0 or an arbitrary mass.
 */

const FEE = 1_000_000n;

function payment(from: { scriptPublicKey: string }, to: { scriptPublicKey: string }, utxo: SimulatorUtxo, amount: bigint, mass?: bigint): KaspaRpcTransaction {
  return {
    version: 0,
    inputs: [{ previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index }, signatureScript: "", sequence: 0n, sigOpCount: 1 }],
    outputs: [
      { amount, scriptPublicKey: { version: 0, scriptPublicKey: to.scriptPublicKey } },
      { amount: utxo.amountSompi - amount - FEE, scriptPublicKey: { version: 0, scriptPublicKey: from.scriptPublicKey } }
    ],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: "",
    ...(mass !== undefined ? { mass } : {})
  };
}

describe("SIM-07 point 9 · storage-mass commitment (WrongMass) as rusty-kaspad 2.1.0", () => {
  it("the mempool replaces the committed mass with the storage mass it calculates; the mined block commits it", async () => {
    for (const clientMass of [undefined, 0n, 1n, 123_456_789n]) {
      const sim = createKaspaSimulator({ networkId: "simnet", automine: false, bootstrapDevAccounts: true });
      const { alice, bob } = sim.accounts;
      const utxo = sim.ledger.getUtxosByAddress(alice.address)[0]!;
      // 0.2 KAS: the storage mass (KIP-9) is far above the compute mass, so a 0 or a compute-mass commitment is wrong
      const tx = payment(alice, bob, utxo, 20_000_000n, clientMass);
      signInputForAccount(alice, tx, 0, utxo);
      const expected = measureTransactionMass(tx, [utxo]).storageMass;
      expect(expected).toBeGreaterThan(measureTransactionMass(tx, [utxo]).computeMass);

      const { transactionId } = await sim.rpc.submitTransaction(tx);
      // the id does not depend on the mass (id_v0 excludes it), so replacing the mass keeps the id
      expect(transactionId).toBe(computeTransactionId(tx));
      const entry = sim.mempool.getTransaction(transactionId)!;
      expect(BigInt(entry.transaction.mass ?? -1n), `client mass ${clientMass}`).toBe(expected);
      expect((await sim.rpc.getMempoolEntry(transactionId)).mempoolEntry.transaction.mass).toBe(expected);

      const [block] = sim.mine(1);
      const index = block!.transactionIds!.indexOf(transactionId);
      expect(index).toBeGreaterThan(0);
      expect(BigInt(block!.transactions[index]!.mass ?? -1n)).toBe(expected);
      expect(checkMassCommitment(block!.transactions[index]!, [utxo])).toEqual({ ok: true, storageMass: expected });
      const rpcBlock = (await sim.rpc.getBlock(block!.header.hash)).block;
      expect(rpcBlock.transactions[index].mass).toBe(expected);
      expect(rpcBlock.verboseData.transactionIds[index]).toBe(transactionId);
    }
  });

  it("a covenant output is committed with its plurality (2 for a P2PK output carrying a covenant id)", async () => {
    const sim = createKaspaSimulator({ networkId: "simnet", automine: false, bootstrapDevAccounts: true });
    const { bob, carol } = sim.accounts;
    const utxo = sim.ledger.getUtxosByAddress(bob.address)[0]!;
    const covenantId = kaspaCovenantId({ transactionId: utxo.transactionId, index: utxo.index }, [
      { index: 0, value: 20n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, script: carol.scriptPublicKey } }
    ]);
    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [{ previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index }, signatureScript: "", sequence: 0n, sigOpCount: 0, computeBudget: 10 }],
      outputs: [
        { amount: 20n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey }, covenant: { authorizingInput: 0, covenantId } },
        { amount: utxo.amountSompi - 20n * SOMPI_PER_KAS - FEE, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: "",
      mass: 0n
    };
    signInputForAccount(bob, tx, 0, utxo);
    const plurality = v1StorageMass(
      [{ amountSompi: utxo.amountSompi, scriptBytes: 34, covenantId: false }],
      [
        { amountSompi: 20n * SOMPI_PER_KAS, scriptBytes: 34, covenantId: true },
        { amountSompi: utxo.amountSompi - 20n * SOMPI_PER_KAS - FEE, scriptBytes: 34, covenantId: false }
      ]
    )!;
    const withoutPlurality = v1StorageMass(
      [{ amountSompi: utxo.amountSompi, scriptBytes: 34, covenantId: false }],
      [
        { amountSompi: 20n * SOMPI_PER_KAS, scriptBytes: 34, covenantId: false },
        { amountSompi: utxo.amountSompi - 20n * SOMPI_PER_KAS - FEE, scriptBytes: 34, covenantId: false }
      ]
    )!;
    expect(plurality).not.toBe(withoutPlurality);

    const { transactionId } = await sim.rpc.submitTransaction(tx);
    const [block] = sim.mine(1);
    const mined = block!.transactions[block!.transactionIds!.indexOf(transactionId)]!;
    expect(BigInt(mined.mass ?? -1n)).toBe(plurality);
  });

  it("checkMassCommitment is the node's check_mass_commitment: equal passes, any other value is WrongMass with the node's message", () => {
    const sim = createKaspaSimulator({ networkId: "simnet", automine: false, bootstrapDevAccounts: true });
    const { alice, bob } = sim.accounts;
    const utxo = sim.ledger.getUtxosByAddress(alice.address)[0]!;
    const tx = payment(alice, bob, utxo, 20_000_000n);
    const calculated = measureTransactionMass(tx, [utxo]).storageMass;

    expect(checkMassCommitment({ ...tx, mass: calculated }, [utxo])).toEqual({ ok: true, storageMass: calculated });
    for (const committed of [0n, calculated - 1n, calculated + 1n]) {
      const res = checkMassCommitment({ ...tx, mass: committed }, [utxo]);
      expect(res).toEqual({
        ok: false,
        code: "WrongMass",
        error: `calculated contextual mass (including storage mass) ${calculated} is not equal to the committed mass field ${committed}`,
        calculated,
        committed
      });
    }
    // no mass field = a committed mass of 0, as the node's default
    expect(checkMassCommitment(tx, [utxo])).toMatchObject({ ok: false, code: "WrongMass", committed: 0n });
  });

  it("a block whose transaction commits a wrong mass is not mined (WrongMass); ledger, mempool and DAG stay as they were", async () => {
    const sim = createKaspaSimulator({ networkId: "simnet", automine: false, bootstrapDevAccounts: true });
    const { alice, bob } = sim.accounts;
    const utxo = sim.ledger.getUtxosByAddress(alice.address)[0]!;
    const tx = payment(alice, bob, utxo, 20_000_000n);
    signInputForAccount(alice, tx, 0, utxo);
    const { transactionId } = await sim.rpc.submitTransaction(tx);
    const entry = sim.mempool.getTransaction(transactionId)! as { transaction: KaspaRpcTransaction };
    const calculated = BigInt(entry.transaction.mass!);
    // a corrupted mempool entry (the node's mempool cannot produce one): block validation must catch it
    entry.transaction = { ...entry.transaction, mass: calculated + 1n };

    const blocksBefore = sim.dag.getAllBlocks().length;
    const utxosBefore = sim.ledger.getAllUtxos().length;
    expect(() => sim.mine(1)).toThrow(
      `WrongMass: calculated contextual mass (including storage mass) ${calculated} is not equal to the committed mass field ${calculated + 1n}`
    );
    expect(sim.dag.getAllBlocks().length).toBe(blocksBefore);
    expect(sim.ledger.getAllUtxos().length).toBe(utxosBefore);
    expect(sim.ledger.getUtxo(utxo.transactionId, utxo.index)).toBeDefined();
    expect(sim.mempool.hasTransaction(transactionId)).toBe(true);
  });

  it("a child spending its parent's output in the same block is checked against the parent's output", async () => {
    const sim = createKaspaSimulator({ networkId: "simnet", automine: false, bootstrapDevAccounts: true });
    const { alice, bob } = sim.accounts;
    const utxo = sim.ledger.getUtxosByAddress(alice.address)[0]!;
    const parent = payment(alice, bob, utxo, 50n * SOMPI_PER_KAS);
    signInputForAccount(alice, parent, 0, utxo);
    const p = await sim.rpc.submitTransaction(parent);
    const parentOut: SimulatorUtxo = {
      transactionId: p.transactionId,
      index: 0,
      address: bob.address,
      amountSompi: 50n * SOMPI_PER_KAS,
      scriptPublicKey: bob.scriptPublicKey,
      blockDaaScore: 0n,
      isCoinbase: false
    };
    const child = payment(bob, alice, parentOut, 10n * SOMPI_PER_KAS);
    signInputForAccount(bob, child, 0, parentOut);
    const c = await sim.rpc.submitTransaction(child);
    const [block] = sim.mine(1);
    expect(block!.transactionIds).toEqual(expect.arrayContaining([p.transactionId, c.transactionId]));
    const minedChild = block!.transactions[block!.transactionIds!.indexOf(c.transactionId)]!;
    expect(BigInt(minedChild.mass ?? -1n)).toBe(measureTransactionMass(child, [parentOut]).storageMass);
  });
});
