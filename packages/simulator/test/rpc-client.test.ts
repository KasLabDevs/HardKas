import { describe, it, expect } from "vitest";
import {
  createKaspaSimulator,
  signInputForAccount,
  SOMPI_PER_KAS,
  type KaspaRpcTransaction
} from "../src/index.js";

describe("SimulatorRpcClient (Kaspa RPC Implementation)", () => {
  it("submits transaction and automines without throwing (unlike old simulator)", async () => {
    const sim = createKaspaSimulator({ automine: true });
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;

    // 1. Fund Alice
    const fundTxId = sim.fund(alice, 100n * SOMPI_PER_KAS);
    expect(fundTxId).toBeDefined();

    const aliceInitialBal = await sim.rpc.getBalanceByAddress(alice.address);
    expect(aliceInitialBal.balanceSompi).toBe(100n * SOMPI_PER_KAS);

    // 2. Read UTXOs via standard RPC
    const utxoRes = await sim.rpc.getUtxosByAddresses([alice.address]);
    expect(utxoRes.entries.length).toBe(1);
    const utxo = utxoRes.entries[0]!;

    // 3. Build & Sign transaction
    const sendAmount = 25n * SOMPI_PER_KAS;
    const fee = 250_000n; // above the node's relay floor for 1 input / 2 outputs (203 600 sompi, SIM-08)
    const change = utxo.amountSompi - sendAmount - fee;

    const sighashTx = {
      version: 0,
      inputs: [{
        transactionId: utxo.outpoint.transactionId,
        index: utxo.outpoint.index,
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
      amount: utxo.amountSompi,
      scriptPublicKey: { version: 0, script: utxo.scriptPublicKey }
    });

    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [{
        previousOutpoint: utxo.outpoint,
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

    // 4. submitTransaction works!
    const submitRes = await sim.rpc.submitTransaction(tx);
    expect(submitRes.transactionId).toBeDefined();

    // 5. Because automine is true, Bob already has funds!
    const bobBal = await sim.rpc.getBalanceByAddress(bob.address);
    expect(bobBal.balanceSompi).toBe(sendAmount);

    const aliceAfterBal = await sim.rpc.getBalanceByAddress(alice.address);
    expect(aliceAfterBal.balanceSompi).toBe(change);

    // 6. getBlockDagInfo reflects DAG progress
    const dagInfo = await sim.rpc.getBlockDagInfo();
    expect(dagInfo.networkId).toBe("simnet");
    expect(dagInfo.virtualDaaScore).toBeGreaterThan(1n);

    // 7. getFeeEstimate has the node's shape only (CA-TX-07), at the minimum relay feerate (100 sompi/gram)
    const feeEst = await sim.rpc.getFeeEstimate();
    expect(feeEst.estimate.normalBuckets[0]!.feerate).toBe(100);
    expect(feeEst).not.toHaveProperty("normalBuckets");

    // 8. Generic call works
    const info = await sim.rpc.call("getInfo");
    expect((info as any).serverVersion).toContain("kaspa-simulator");
  });
});
