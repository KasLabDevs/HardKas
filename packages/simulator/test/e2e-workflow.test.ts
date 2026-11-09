import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { createKaspaSimulator, SOMPI_PER_KAS } from "../src/simulator-node.js";
import { SimulatorRpcServer } from "../src/rpc/rpc-server.js";
import { signInputForAccount } from "../src/crypto/accounts.js";
import { managedKaspaWasm } from "./helpers/managed-wasm.js";

// HK-06 / CA-EV-01: the managed kaspa-wasm, never a machine's absolute path; without it the suite is skipped, with the
// reason, instead of failing to load (it used to `require` an absolute path at the top level).
const { k, reason: noWasm } = managedKaspaWasm();

// Kept on purpose: a host application that installs this hack must not change what the simulator sends on the wire
// (the server writes bigints exactly, before JSON.stringify could call it).
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

describe.skipIf(!k)(`End-to-End Developer Workflow (simulator only): kaspa-wasm RpcClient, Tx, Mining, Snapshots & Revert${noWasm ? ` (skipped: ${noWasm})` : ""}`, () => {
  let sim: ReturnType<typeof createKaspaSimulator>;
  let simServer: SimulatorRpcServer;
  let simWsUrl: string;
  let rpcClient: any;

  beforeAll(async () => {
    (globalThis as any).WebSocket = WebSocket;

    // 1. Initialize Simulator in manual mining mode (automine: false)
    sim = createKaspaSimulator({
      networkId: "simnet",
      automine: false,
      bootstrapDevAccounts: true
    });

    simServer = new SimulatorRpcServer(sim);
    const info = await simServer.start({ port: 0, host: "127.0.0.1" });
    simWsUrl = info.wsUrl;

    // 2. Connect official kaspa-wasm RpcClient over wRPC SerdeJson WebSocket
    rpcClient = new k.RpcClient({ url: simWsUrl, encoding: k.Encoding.SerdeJson });
    await rpcClient.connect({ blockAsyncConnect: true });
  });

  afterAll(async () => {
    if (rpcClient) await rpcClient.disconnect();
    if (simServer) await simServer.close();
  });

  it("Step 1: Check initial node status, accounts and UTXOs via kaspa-wasm RPC", async () => {
    const info = await rpcClient.getInfo();
    expect(info.serverVersion).toContain("2.1.0");
    expect(info.isSynced).toBe(true);

    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;

    const balanceRes = await rpcClient.getBalancesByAddresses({ addresses: [alice.address, bob.address] });
    const aliceBal = balanceRes.entries.find((e: any) => e.address === alice.address);
    expect(BigInt(aliceBal.balance)).toBe(1000n * SOMPI_PER_KAS);

    const utxosRes = await rpcClient.getUtxosByAddresses({ addresses: [alice.address] });
    expect(utxosRes.entries.length).toBeGreaterThan(0);
    const firstAmount = BigInt(utxosRes.entries[0].amount ?? utxosRes.entries[0].entry?.amount);
    expect(firstAmount).toBe(1000n * SOMPI_PER_KAS);
  });

  it("Step 2: Construct, sign, and submit a valid transaction from Alice to Bob", async () => {
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;

    const utxosRes = await rpcClient.getUtxosByAddresses({ addresses: [alice.address] });
    const inputUtxo = utxosRes.entries[0];
    const inputAmount = BigInt(inputUtxo.amount ?? inputUtxo.entry?.amount);
    const txId = inputUtxo.outpoint?.transactionId ?? inputUtxo.entry?.outpoint?.transactionId;
    const outIndex = inputUtxo.outpoint?.index ?? inputUtxo.entry?.outpoint?.index ?? 0;

    const transferAmount = 100n * SOMPI_PER_KAS;
    const fee = 300_000n; // above the node's relay floor (203 600 sompi for 1 input / 2 outputs, SIM-08)
    const changeAmount = inputAmount - transferAmount - fee;

    const tx: any = {
      version: 0,
      inputs: [
        {
          previousOutpoint: {
            transactionId: txId,
            index: outIndex
          },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 1
        }
      ],
      outputs: [
        {
          value: transferAmount,
          scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey)
        },
        {
          value: changeAmount,
          scriptPublicKey: new k.ScriptPublicKey(0, alice.scriptPublicKey)
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    };

    // Sign the input using Alice's Schnorr private key
    signInputForAccount(alice, tx, 0, [
      {
        transactionId: txId,
        index: outIndex,
        amountSompi: inputAmount,
        scriptPublicKey: alice.scriptPublicKey,
        blockDaaScore: 1n,
        isCoinbase: false,
        address: alice.address
      }
    ]);

    const submitRes = await rpcClient.submitTransaction({ transaction: tx, allowOrphan: false });
    expect(submitRes.transactionId).toBeDefined();

    // Verify transaction is in mempool before mining
    const mempoolRes = await rpcClient.getMempoolEntriesByAddresses({
      addresses: [alice.address],
      includeOrphanPool: false,
      filterTransactionPool: true
    });
    expect(mempoolRes.entries.length).toBe(1);
  });

  it("Step 3: Mine a block and verify Alice and Bob updated balances", async () => {
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;

    // Mine 1 block to confirm mempool transactions (1 coinbase + 1 user transfer = 2 txs)
    const minedBlocks = sim.mine(1);
    expect(minedBlocks.length).toBe(1);
    expect(minedBlocks[0]!.transactions.length).toBe(2);

    // Verify balances via kaspa-wasm RPC
    const aliceBalRes = await rpcClient.getBalanceByAddress({ address: alice.address });
    const bobBalRes = await rpcClient.getBalanceByAddress({ address: bob.address });

    expect(BigInt(bobBalRes.balance)).toBe(1100n * SOMPI_PER_KAS);
    expect(BigInt(aliceBalRes.balance)).toBeLessThan(1000n * SOMPI_PER_KAS);
  });

  it("Step 4: Create a 0ms state snapshot, execute a second tx, and revert state", async () => {
    const bob = sim.accounts.bob;
    const carol = sim.accounts.carol;

    // 4.1 Create snapshot
    const snapshotId = sim.snapshot();
    expect(snapshotId).toBeDefined();

    // 4.2 Bob sends 50 KAS to Carol
    const bobUtxos = await rpcClient.getUtxosByAddresses({ addresses: [bob.address] });
    const bobInput = bobUtxos.entries.find((u: any) => BigInt(u.amount ?? u.entry?.amount) >= 50n * SOMPI_PER_KAS)!;
    const bobInAmount = BigInt(bobInput.amount ?? bobInput.entry?.amount);
    const bobTxId = bobInput.outpoint?.transactionId ?? bobInput.entry?.outpoint?.transactionId;
    const bobOutIndex = bobInput.outpoint?.index ?? bobInput.entry?.outpoint?.index ?? 0;

    const bobTransfer = 50n * SOMPI_PER_KAS;
    const fee = 300_000n;
    const bobChange = bobInAmount - bobTransfer - fee;

    const tx2: any = {
      version: 0,
      inputs: [
        {
          previousOutpoint: {
            transactionId: bobTxId,
            index: bobOutIndex
          },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 1
        }
      ],
      outputs: [
        {
          value: bobTransfer,
          scriptPublicKey: new k.ScriptPublicKey(0, carol.scriptPublicKey)
        },
        {
          value: bobChange,
          scriptPublicKey: new k.ScriptPublicKey(0, bob.scriptPublicKey)
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    };

    signInputForAccount(bob, tx2, 0, [
      {
        transactionId: bobTxId,
        index: bobOutIndex,
        amountSompi: bobInAmount,
        scriptPublicKey: bob.scriptPublicKey,
        blockDaaScore: 2n,
        isCoinbase: false,
        address: bob.address
      }
    ]);

    await rpcClient.submitTransaction({ transaction: tx2, allowOrphan: false });
    sim.mine(1);

    // Carol now has 1050 KAS (1000 initial + 50)
    const carolBal1 = await rpcClient.getBalanceByAddress({ address: carol.address });
    expect(BigInt(carolBal1.balance)).toBe(1050n * SOMPI_PER_KAS);

    // 4.3 Revert to snapshot in 0ms
    const reverted = sim.revert(snapshotId);
    expect(reverted).toBe(true);

    // 4.4 Verify state is reverted: Carol has 1000 KAS again, Bob has 1100 KAS
    const carolBalReverted = await rpcClient.getBalanceByAddress({ address: carol.address });
    const bobBalReverted = await rpcClient.getBalanceByAddress({ address: bob.address });

    expect(BigInt(carolBalReverted.balance)).toBe(1000n * SOMPI_PER_KAS);
    expect(BigInt(bobBalReverted.balance)).toBe(1100n * SOMPI_PER_KAS);
  });
});
