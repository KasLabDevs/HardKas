import { describe, it, expect } from "vitest";
import {
  DagChain,
  Mempool,
  UtxoLedger,
  createDefaultDevAccounts,
  signInputForAccount,
  DEFAULT_BLOCK_REWARD_SOMPI,
  type SimulatorUtxo
} from "../src/index.js";

describe("DagChain & Mining Engine", () => {
  const accounts = createDefaultDevAccounts("simnet");
  const alice = accounts.alice;
  const bob = accounts.bob;
  const miner = accounts.miner;

  it("mines a block, awards subsidy + fees to miner, and advances DAA score", () => {
    const ledger = new UtxoLedger();
    const mempool = new Mempool();
    const dag = new DagChain({ networkId: "simnet", initialDaaScore: 10n });

    const initialDaa = dag.getVirtualDaaScore();
    expect(initialDaa).toBe(10n);

    // Initial Alice funds
    const utxo: SimulatorUtxo = {
      transactionId: "00".repeat(31) + "01",
      index: 0,
      address: alice.address,
      amountSompi: 100_000_000n,
      scriptPublicKey: alice.scriptPublicKey,
      blockDaaScore: 5n,
      isCoinbase: false
    };
    ledger.addUtxo(utxo);

    // Alice sends 0.4 KAS to Bob, paying the node's relay floor (2036 g × 100 sompi/g, SIM-08) plus a margin
    const sendAmount = 40_000_000n;
    const fee = 250_000n;
    const change = utxo.amountSompi - sendAmount - fee;

    const sighashTx = {
      version: 0,
      inputs: [{ transactionId: utxo.transactionId, index: utxo.index, sequence: 0n, sigOpCount: 1 }],
      outputs: [
        { value: sendAmount, scriptPublicKey: { version: 0, script: bob.scriptPublicKey } },
        { value: change, scriptPublicKey: { version: 0, script: alice.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    const sig = signInputForAccount(alice, sighashTx, 0, {
      amount: utxo.amountSompi,
      scriptPublicKey: { version: 0, script: utxo.scriptPublicKey }
    });

    const tx = {
      version: 0,
      inputs: [{
        previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
        signatureScript: sig,
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

    const res = mempool.submitTransaction(tx, ledger, dag.getVirtualDaaScore());
    expect(res.ok).toBe(true);
    expect(mempool.getAllTransactions().length).toBe(1);

    // Mine the block
    const block = dag.mineBlock(miner.address, miner.scriptPublicKey, mempool, ledger);

    // 1. DAA score advanced by 1
    expect(dag.getVirtualDaaScore()).toBe(11n);
    expect(block.header.daaScore).toBe(10n);

    // 2. Mempool emptied
    expect(mempool.getAllTransactions().length).toBe(0);

    // 3. Bob received the 40 KAS
    expect(ledger.getBalance(bob.address)).toBe(sendAmount);

    // 4. Alice received the change
    expect(ledger.getBalance(alice.address)).toBe(change);

    // 5. Miner received block reward + transaction fee
    const expectedMinerReward = DEFAULT_BLOCK_REWARD_SOMPI + fee;
    expect(ledger.getBalance(miner.address)).toBe(expectedMinerReward);

    // 6. Block includes transactions
    expect(block.transactions.length).toBe(2); // Coinbase + Alice's tx
  });
});
