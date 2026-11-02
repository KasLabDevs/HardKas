import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseEther } from "viem";
import { EvmJsonRpcClient } from "../src/evm-rpc-client.js";
import {
  EvmLocalAccountSigner,
  prepareEvmTransaction,
  sendAndConfirmTransaction
} from "../src/tx-pipeline.js";
import {
  waitForConfirmations,
  verifyTransactionCanonical,
  withRetry,
  isTransientError
} from "../src/resilience.js";
import {
  startLocalEvmNode,
  type LocalEvmNodeHandle,
  ANVIL_TEST_ACCOUNTS,
  sweepDanglingAnvilNodes
} from "./harness/local-evm-node.js";

/** Write options for the guarded low-level broadcast (local Anvil profile). */
const LOCAL_WRITE = { profile: "local" } as const;

describe("Phase 5: Robustness, Reorgs and Resilience (Live Anvil Node)", () => {
  let node: LocalEvmNodeHandle;
  let client: EvmJsonRpcClient;
  let signer: EvmLocalAccountSigner;

  beforeAll(async () => {
    sweepDanglingAnvilNodes();
    node = await startLocalEvmNode({ startupTimeoutMs: 15000 });
    client = new EvmJsonRpcClient({ profile: "local",
      url: node.rpcUrl,
      target: node.target,
      timeoutMs: 5000
    });
    signer = new EvmLocalAccountSigner(ANVIL_TEST_ACCOUNTS[0]!.privateKey, { profile: "local" });
  }, 20000);

  afterAll(async () => {
    if (node) {
      await node.stop();
    }
    sweepDanglingAnvilNodes();
  });

  describe("Configurable Confirmations", () => {
    it("waits for 1 confirmation by default", async () => {
      const recipient = ANVIL_TEST_ACCOUNTS[1]!;
      const prepared = await prepareEvmTransaction(client, signer.getAddress(), {
        to: recipient.address,
        value: parseEther("0.1")
      });
      const { rawTransaction, txHash } = await signer.signTransaction(prepared);
      await client.sendRawTransaction(rawTransaction, LOCAL_WRITE);

      const confirmed = await waitForConfirmations(client, txHash, {
        requiredConfirmations: 1,
        timeoutMs: 5000
      });

      expect(confirmed.receipt.status).toBe("success");
      expect(confirmed.confirmations >= 1n).toBe(true);
    });

    it("waits until multiple confirmations are achieved across mined blocks", async () => {
      const recipient = ANVIL_TEST_ACCOUNTS[2]!;
      const prepared = await prepareEvmTransaction(client, signer.getAddress(), {
        to: recipient.address,
        value: parseEther("0.1")
      });
      const { rawTransaction, txHash } = await signer.signTransaction(prepared);
      await client.sendRawTransaction(rawTransaction, LOCAL_WRITE);

      // Start waiting for 3 confirmations in background
      const confirmationPromise = waitForConfirmations(client, txHash, {
        requiredConfirmations: 3,
        timeoutMs: 10000,
        intervalMs: 50
      });

      // Mine 3 additional blocks explicitly via Anvil RPC
      await client.callRpc("anvil_mine", ["0x3"]);

      const confirmed = await confirmationPromise;
      expect(confirmed.receipt.status).toBe("success");
      expect(confirmed.confirmations >= 3n).toBe(true);
    });
  });

  describe("Reorg and Canonicality Detection (Live EVM Snapshot/Revert)", () => {
    it("detects when a transaction is reorged out of canonical chain", async () => {
      // 1. Take snapshot of chain state at H0
      const snapshotId = await client.callRpc<string>("evm_snapshot", []);
      expect(typeof snapshotId).toBe("string");

      // 2. Submit transaction T1
      const recipient = ANVIL_TEST_ACCOUNTS[3]!;
      const prepared = await prepareEvmTransaction(client, signer.getAddress(), {
        to: recipient.address,
        value: parseEther("0.5")
      });
      const { rawTransaction, txHash } = await signer.signTransaction(prepared);
      const receipt = await sendAndConfirmTransaction(client, rawTransaction);
      expect(receipt.status).toBe("success");
      const canonicalBlockHash = receipt.blockHash!;
      expect(canonicalBlockHash).toBeDefined();

      // 3. Verify it is initially canonical
      const initialCheck = await verifyTransactionCanonical(
        client,
        txHash,
        canonicalBlockHash
      );
      expect(initialCheck.isCanonical).toBe(true);
      expect(initialCheck.currentReceipt).not.toBeNull();

      // 4. Trigger Reorg: revert chain back to snapshot H0
      const reverted = await client.callRpc<boolean>("evm_revert", [snapshotId]);
      expect(reverted).toBe(true);

      // 5. Mine an alternative branch with empty blocks
      await client.callRpc("anvil_mine", ["0x2"]);

      // 6. Verify canonicality detection detects the reorg
      const reorgCheck = await verifyTransactionCanonical(
        client,
        txHash,
        canonicalBlockHash
      );
      expect(reorgCheck.isCanonical).toBe(false);
      expect(reorgCheck.reason).toBeDefined();
    });
  });

  describe("Retry Policies and Fault Recovery", () => {
    it("retries on transient failure and recovers successfully", async () => {
      let attempts = 0;
      const result = await withRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error("fetch failed: ECONNRESET");
          }
          return "recovered";
        },
        { maxRetries: 3, initialDelayMs: 20 }
      );

      expect(result).toBe("recovered");
      expect(attempts).toBe(3);
    });

    it("does not retry on permanent / non-transient errors", async () => {
      let attempts = 0;
      await expect(
        withRetry(
          async () => {
            attempts++;
            throw new Error("Execution reverted: Invalid input");
          },
          { maxRetries: 3, initialDelayMs: 20 }
        )
      ).rejects.toThrow(/Execution reverted/);

      expect(attempts).toBe(1); // Fails fast without retrying
    });

    it("correctly identifies transient vs permanent errors", () => {
      expect(isTransientError(new Error("fetch failed"))).toBe(true);
      expect(isTransientError(new Error("connect ECONNREFUSED 127.0.0.1"))).toBe(true);
      expect(isTransientError(new Error("HTTP error 503: Service Unavailable"))).toBe(true);
      expect(isTransientError(new Error("HTTP error 400: Bad Request"))).toBe(false);
      expect(isTransientError(new Error("JSON-RPC error: execution reverted"))).toBe(false);
    });
  });
});
