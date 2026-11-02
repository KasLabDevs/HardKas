import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  startLocalEvmNode,
  type LocalEvmNodeHandle,
  sweepDanglingAnvilNodes
} from "./harness/local-evm-node.js";
import {
  EvmJsonRpcClient,
  EvmRpcTimeoutError,
  EvmJsonRpcError
} from "../src/evm-rpc-client.js";
import {
  prepareEvmTransaction,
  EvmLocalAccountSigner,
  sendAndConfirmTransaction,
  sendRawTransactionResilient,
  UncertainBroadcastError
} from "../src/tx-pipeline.js";
import { EvmNonceManager } from "../src/nonce-manager.js";
import { verifyTransactionCanonical } from "../src/resilience.js";

/** Write options for the guarded low-level broadcast (local Anvil profile). */
const LOCAL_WRITE = { profile: "local" } as const;

const ANVIL_DEV_KEY_0 =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ANVIL_DEV_ADDR_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ANVIL_DEV_ADDR_2 = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

describe("L2 Adversarial & Edge Scenarios against Live Local Anvil Node", () => {
  let node: LocalEvmNodeHandle;
  let client: EvmJsonRpcClient;
  let signer0: EvmLocalAccountSigner;

  beforeAll(async () => {
    sweepDanglingAnvilNodes();
    node = await startLocalEvmNode({ silent: true });
    client = new EvmJsonRpcClient({ profile: "local",
      url: node.rpcUrl,
      expectedChainId: 31337,
      timeoutMs: 10000
    });
    signer0 = new EvmLocalAccountSigner(ANVIL_DEV_KEY_0, { expectedChainId: 31337, profile: "local" });
  });

  afterAll(async () => {
    if (node) {
      await node.stop();
    }
    sweepDanglingAnvilNodes();
  });

  it("adversarial scenario 1: handles uncertain in-flight submission and recovers via preserved txHash", async () => {
    const from = signer0.getAddress();
    const prepared = await prepareEvmTransaction(
      client,
      from,
      {
        to: ANVIL_DEV_ADDR_1,
        value: 1000000000000000n
      },
      { expectedChainId: 31337 }
    );

    const { rawTransaction, txHash } = await signer0.signTransaction(prepared);

    // Send transaction to node
    const submittedHash = (await client.sendRawTransaction(rawTransaction, LOCAL_WRITE)) as string;
    expect(submittedHash.toLowerCase()).toBe(txHash.toLowerCase());

    // Simulate an immediate timeout (e.g. client disconnect or network stutter)
    let timedOutError: EvmRpcTimeoutError | null = null;
    try {
      await client.waitForTransactionReceipt(submittedHash, {
        timeoutMs: 1,
        intervalMs: 1
      });
    } catch (err) {
      if (err instanceof EvmRpcTimeoutError) {
        timedOutError = err;
      }
    }

    // Receipt wait timed out as expected
    expect(timedOutError).not.toBeNull();
    expect(timedOutError?.timeoutMs).toBe(1);

    // Recovery: with the preserved txHash, client reconciles without re-submitting or double-spending
    const recoveredReceipt = await client.waitForTransactionReceipt(submittedHash, {
      timeoutMs: 5000,
      intervalMs: 50
    });

    expect(recoveredReceipt).toBeDefined();
    expect(recoveredReceipt.transactionHash.toLowerCase()).toBe(
      submittedHash.toLowerCase()
    );
    expect(recoveredReceipt.status).toBe("0x1");
  });

  it("adversarial scenario 2: uncoordinated concurrent transactions with identical nonce are rejected by node", async () => {
    const from = signer0.getAddress();
    const currentNonce = Number(await client.getTransactionCount(from, "pending"));

    // Prepare two distinct transactions with identical uncoordinated nonce
    const preparedA = await prepareEvmTransaction(
      client,
      from,
      {
        to: ANVIL_DEV_ADDR_1,
        value: 100n,
        nonce: currentNonce
      },
      { expectedChainId: 31337 }
    );

    const preparedB = await prepareEvmTransaction(
      client,
      from,
      {
        to: ANVIL_DEV_ADDR_1,
        value: 200n,
        nonce: currentNonce
      },
      { expectedChainId: 31337 }
    );

    const signedA = await signer0.signTransaction(preparedA);
    const signedB = await signer0.signTransaction(preparedB);

    // Send txA first
    const hashA = (await client.sendRawTransaction(signedA.rawTransaction, LOCAL_WRITE)) as string;
    await client.waitForTransactionReceipt(hashA, { timeoutMs: 5000 });

    // Send txB with same nonce -> must be rejected by EVM mempool/node
    let rejectedError: EvmJsonRpcError | null = null;
    try {
      await client.sendRawTransaction(signedB.rawTransaction, LOCAL_WRITE);
    } catch (err) {
      if (err instanceof EvmJsonRpcError) {
        rejectedError = err;
      }
    }

    expect(rejectedError).not.toBeNull();
    expect(rejectedError?.message).toMatch(/nonce too low|already known/i);
  });

  it("adversarial scenario 3: successfully coordinates concurrent transactions using EvmNonceManager", async () => {
    const from = signer0.getAddress();
    const nonceManager = new EvmNonceManager();

    // Prepare two transactions CONCURRENTLY with Promise.all using EvmNonceManager
    const [preparedA, preparedB] = await Promise.all([
      prepareEvmTransaction(
        client,
        from,
        { to: ANVIL_DEV_ADDR_1, value: 500n },
        { nonceManager, expectedChainId: 31337 }
      ),
      prepareEvmTransaction(
        client,
        from,
        { to: ANVIL_DEV_ADDR_2, value: 600n },
        { nonceManager, expectedChainId: 31337 }
      )
    ]);

    // Nonces must be strictly sequential
    expect(preparedA.nonce).toBeDefined();
    expect(preparedB.nonce).toBe(preparedA.nonce + 1);

    // Sign both transactions
    const [signedA, signedB] = await Promise.all([
      signer0.signTransaction(preparedA),
      signer0.signTransaction(preparedB)
    ]);

    // Send and confirm both concurrently on live Anvil
    const [receiptA, receiptB] = await Promise.all([
      sendAndConfirmTransaction(client, signedA.rawTransaction),
      sendAndConfirmTransaction(client, signedB.rawTransaction)
    ]);

    expect(receiptA.status).toBe("success");
    expect(receiptB.status).toBe("success");
    expect(receiptA.txHash).toBe(signedA.txHash);
    expect(receiptB.txHash).toBe(signedB.txHash);
  });

  it("adversarial scenario 4: EvmNonceManager releases unused nonce on abort and supports reset", async () => {
    const from = signer0.getAddress();
    const nonceManager = new EvmNonceManager();

    const nonce1 = await nonceManager.acquireNonce(client, from);
    expect(nonce1).toBeGreaterThanOrEqual(0);

    // Simulate an aborted operation before broadcast -> release the unused nonce
    nonceManager.releaseUnusedNonce(from, 31337, nonce1);

    // Next acquire reclaims the released nonce instead of creating a hole
    const nonceReclaimed = await nonceManager.acquireNonce(client, from);
    expect(nonceReclaimed).toBe(nonce1);

    // Reset forces fresh node synchronization
    nonceManager.reset(from, 31337);
    expect(nonceManager.peekNextNonce(from, 31337)).toBeUndefined();
  });

  it("adversarial scenario 5: reconciles broadcast with lost network response using deterministic hash", async () => {
    const from = signer0.getAddress();
    const prepared = await prepareEvmTransaction(
      client,
      from,
      { to: ANVIL_DEV_ADDR_1, value: 777n },
      { expectedChainId: 31337 }
    );
    const signed = await signer0.signTransaction(prepared);

    // First broadcast the transaction to the node so it enters the node
    await client.sendRawTransaction(signed.rawTransaction, LOCAL_WRITE);

    // Now simulate an uncertain broadcast where the node responds with a transient drop / already known
    // sendRawTransactionResilient computes hash upfront and reconciles without creating a new transaction
    const resilientResult = await sendRawTransactionResilient(
      client,
      signed.rawTransaction
    );

    expect(resilientResult.txHash.toLowerCase()).toBe(signed.txHash.toLowerCase());
    // Real Anvil 1.8.6 answers the re-send with "transaction already imported" (-32003): the node holds
    // this exact payload. That is reported as already_known (a mempool claim); inclusion is checked below.
    expect(resilientResult.broadcastState).toBe("already_known");

    // Verify receipt confirmed
    const receipt = await client.waitForTransactionReceipt(resilientResult.txHash, {
      timeoutMs: 5000
    });
    expect(receipt.status).toBe("0x1");
  });

  it("adversarial scenario 6: rejects false 'nonce too low' when a competing transaction consumed the nonce", async () => {
    const from = signer0.getAddress();
    const currentNonce = Number(await client.getTransactionCount(from, "pending"));

    // 1. Send legitimate competing transaction that consumes nonce N
    const competingPrepared = await prepareEvmTransaction(
      client,
      from,
      { to: ANVIL_DEV_ADDR_1, value: 111n, nonce: currentNonce },
      { expectedChainId: 31337 }
    );
    const competingSigned = await signer0.signTransaction(competingPrepared);
    await client.sendRawTransaction(competingSigned.rawTransaction, LOCAL_WRITE);
    await client.waitForTransactionReceipt(competingSigned.txHash, { timeoutMs: 5000 });

    // 2. Now attempt to broadcast a DIFFERENT transaction with that same old nonce
    const stalePrepared = await prepareEvmTransaction(
      client,
      from,
      { to: ANVIL_DEV_ADDR_2, value: 222n, nonce: currentNonce },
      { expectedChainId: 31337 }
    );
    const staleSigned = await signer0.signTransaction(stalePrepared);

    // 3. sendRawTransactionResilient must detect that the mined transaction does NOT match our hash
    // and throw a clean Nonce collision error rather than falsely assuming success
    await expect(
      sendRawTransactionResilient(client, staleSigned.rawTransaction)
    ).rejects.toThrow(/Nonce collision.*A competing transaction consumed this nonce/i);
  });

  it("adversarial scenario 7: detects reorganization and marks transaction as non-canonical", async () => {
    const from = signer0.getAddress();

    // 1. Take snapshot of current state
    const snapshotId = await client.callRpc<string>("evm_snapshot");

    // 2. Submit transaction and confirm
    const prepared = await prepareEvmTransaction(
      client,
      from,
      {
        to: ANVIL_DEV_ADDR_1,
        value: 500n
      },
      { expectedChainId: 31337 }
    );
    const signed = await signer0.signTransaction(prepared);
    const receipt = await sendAndConfirmTransaction(client, signed.rawTransaction);

    expect(receipt.status).toBe("success");
    expect(receipt.blockHash).toBeDefined();

    // 3. Verify it is canonical in the current chain
    const beforeReorg = await verifyTransactionCanonical(
      client,
      receipt.txHash,
      receipt.blockHash!
    );
    expect(beforeReorg.isCanonical).toBe(true);

    // 4. Simulate reorganization by reverting back to snapshot
    const reverted = await client.callRpc<boolean>("evm_revert", [snapshotId]);
    expect(reverted).toBe(true);

    // Mine a new block to create a divergent history
    await client.callRpc("evm_mine");

    // 5. Verify transaction is no longer canonical
    const afterReorg = await verifyTransactionCanonical(
      client,
      receipt.txHash,
      receipt.blockHash!
    );
    expect(afterReorg.isCanonical).toBe(false);
    expect(afterReorg.reason).toMatch(/reorg/i);
  });
});
