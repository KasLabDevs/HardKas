import { describe, it, expect, beforeAll, afterAll } from "vitest";
import net from "node:net";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  EvmJsonRpcClient,
  EvmJsonRpcError,
  EvmRpcTimeoutError
} from "../src/evm-rpc-client.js";
import {
  startLocalEvmNode,
  type LocalEvmNodeHandle,
  ANVIL_CHAIN_ID,
  ANVIL_TEST_ACCOUNTS,
  sweepDanglingAnvilNodes,
  getFreePort
} from "./harness/local-evm-node.js";

/** Write options for the guarded low-level broadcast (local Anvil profile). */
const LOCAL_WRITE = { profile: "local" } as const;

describe("EvmJsonRpcClient (Real Local Anvil Node Integration)", () => {
  let node: LocalEvmNodeHandle;
  let client: EvmJsonRpcClient;

  beforeAll(async () => {
    // Sweep any previously orphaned test containers before starting
    sweepDanglingAnvilNodes();

    node = await startLocalEvmNode({ startupTimeoutMs: 15000 });
    client = new EvmJsonRpcClient({
      url: node.rpcUrl,
      target: node.target,
      timeoutMs: 5000
    });
  }, 20000);

  afterAll(async () => {
    if (node) {
      await node.stop();
    }
    // Final hygiene sweep to ensure zero container leak
    sweepDanglingAnvilNodes();
  });

  describe("Live JSON-RPC Communication (No Mocks)", () => {
    it("verifies eth_chainId against real node", async () => {
      const chainId = await client.getChainId();
      expect(chainId).toBe(ANVIL_CHAIN_ID);
      expect(client.target?.mode).toBe("localnet");
      expect(client.target?.domain).toBe("evm-l2");
    });

    it("verifies eth_blockNumber returns valid block height", async () => {
      const blockNumber = await client.getBlockNumber();
      expect(typeof blockNumber).toBe("bigint");
      expect(blockNumber >= 0n).toBe(true);
    });

    it("verifies eth_gasPrice returns non-zero gas price", async () => {
      const gasPrice = await client.getGasPriceWei();
      expect(typeof gasPrice).toBe("bigint");
      expect(gasPrice > 0n).toBe(true);
    });

    it("verifies eth_getBalance for pre-funded lab accounts", async () => {
      const fundedAccount = ANVIL_TEST_ACCOUNTS[0]!;
      const balance = await client.getBalanceWei(fundedAccount.address);

      // Anvil pre-funds standard accounts with 10,000 ETH
      const expectedBalance = parseEther("10000");
      expect(balance).toBe(expectedBalance);

      // Unfunded fresh address should report zero balance
      const unfundedBalance = await client.getBalanceWei(
        "0x000000000000000000000000000000000000dEaD"
      );
      expect(unfundedBalance).toBe(0n);
    });

    it("verifies eth_getTransactionCount returns current nonce", async () => {
      const account = ANVIL_TEST_ACCOUNTS[2]!;
      const nonce = await client.getTransactionCount(account.address);
      expect(typeof nonce).toBe("bigint");
      expect(nonce >= 0n).toBe(true);
    });

    it("verifies eth_estimateGas for a standard transfer", async () => {
      const sender = ANVIL_TEST_ACCOUNTS[0]!.address;
      const recipient = ANVIL_TEST_ACCOUNTS[1]!.address;

      const estimatedGas = await client.estimateGas({
        from: sender,
        to: recipient,
        value: "0x3e8" // 1000 Wei
      });

      // Standard ETH transfer cost is 21,000 gas
      expect(estimatedGas).toBe(21000n);
    });

    it("verifies eth_call against real node", async () => {
      const recipient = ANVIL_TEST_ACCOUNTS[1]!.address;
      const callResult = await client.call({
        to: recipient,
        data: "0x"
      });
      expect(typeof callResult).toBe("string");
      expect(callResult.startsWith("0x")).toBe(true);
    });

    it("verifies eth_getTransactionReceipt returns null for non-existent tx", async () => {
      const nonExistentTxHash =
        "0x1111111111111111111111111111111111111111111111111111111111111111";
      const receipt = await client.getTransactionReceipt(nonExistentTxHash);
      expect(receipt).toBeNull();
    });

    it("verifies real sendRawTransaction and waitForTransactionReceipt lifecycle", async () => {
      const sender = ANVIL_TEST_ACCOUNTS[0]!;
      const recipient = ANVIL_TEST_ACCOUNTS[3]!;
      const senderAccount = privateKeyToAccount(sender.privateKey);

      const nonce = await client.getTransactionCount(sender.address);
      const gasPrice = await client.getGasPriceWei();

      // Sign real transaction with viem
      const rawTx = await senderAccount.signTransaction({
        to: recipient.address,
        value: parseEther("1"),
        gas: 21000n,
        gasPrice,
        nonce: Number(nonce),
        chainId: ANVIL_CHAIN_ID
      });

      // Send to local EVM node
      const txHash = (await client.sendRawTransaction(rawTx, LOCAL_WRITE)) as string;
      expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // Verify transaction receipt from live node using poller
      const receipt = await client.waitForTransactionReceipt(txHash, {
        timeoutMs: 5000,
        intervalMs: 50
      });

      expect(receipt).not.toBeNull();
      expect(receipt.transactionHash.toLowerCase()).toBe(txHash.toLowerCase());
      expect(receipt.status).toBe("0x1"); // 1 = Success
      expect(receipt.from.toLowerCase()).toBe(sender.address.toLowerCase());
      expect(receipt.to.toLowerCase()).toBe(recipient.address.toLowerCase());
      expect(BigInt(receipt.gasUsed) > 0n).toBe(true);

      // Verify recipient balance was credited
      const recipientBalance = await client.getBalanceWei(recipient.address);
      expect(recipientBalance).toBe(parseEther("10001"));
    });
  });

  describe("Negative, Adversarial and Resilience Tests", () => {
    it("handles non-existent JSON-RPC methods properly", async () => {
      // A read-shaped name passes callRpc's allow-list and reaches the node, which rejects it.
      await expect(
        client.callRpc("eth_getMethodThatDoesNotExist", [])
      ).rejects.toThrow(/JSON-RPC error:.*Method not found/);
    });

    it("throws EvmJsonRpcError on invalid RPC parameter", async () => {
      // Pass invalid block tag to eth_getBalance
      await expect(
        client.callRpc("eth_getBalance", [
          ANVIL_TEST_ACCOUNTS[0]!.address,
          "invalid_block_tag_value"
        ])
      ).rejects.toThrow(EvmJsonRpcError);
    });

    it("handles client-side request timeout when server is unresponsive", async () => {
      const sockets = new Set<net.Socket>();
      const silentServer = net.createServer((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      });

      const silentPort = await new Promise<number>((resolve) => {
        silentServer.listen(0, "127.0.0.1", () => {
          resolve((silentServer.address() as net.AddressInfo).port);
        });
      });

      try {
        const timeoutClient = new EvmJsonRpcClient({
          url: `http://127.0.0.1:${silentPort}`,
          timeoutMs: 150
        });

        await expect(timeoutClient.getBlockNumber()).rejects.toThrow(
          EvmRpcTimeoutError
        );
      } finally {
        for (const s of sockets) {
          s.destroy();
        }
        await new Promise<void>((resolve) => silentServer.close(() => resolve()));
      }
    });

    it("handles waitForTransactionReceipt timeout on unmined txHash", async () => {
      const nonExistentTxHash =
        "0x9999999999999999999999999999999999999999999999999999999999999999";

      await expect(
        client.waitForTransactionReceipt(nonExistentTxHash, {
          timeoutMs: 150,
          intervalMs: 30
        })
      ).rejects.toThrow(EvmRpcTimeoutError);
    });

    it("handles connection failure when node is unreachable / port closed", async () => {
      const freePort = await getFreePort();
      const deadClient = new EvmJsonRpcClient({
        url: `http://127.0.0.1:${freePort}`,
        timeoutMs: 1000
      });

      await expect(deadClient.getChainId()).rejects.toThrow();
    });

    it("rejects invalid addresses client-side before sending HTTP request", async () => {
      await expect(client.getBalanceWei("0xInvalidAddress")).rejects.toThrow(
        /Invalid EVM address/
      );
      await expect(client.getTransactionCount("")).rejects.toThrow(
        /Invalid address: must be a non-empty string/
      );
    });

    it("rejects invalid transaction hashes client-side before sending HTTP request", async () => {
      await expect(client.getTransactionReceipt("0x1234")).rejects.toThrow(
        /Invalid EVM txHash/
      );
      await expect(
        client.getTransactionReceipt("not-a-hex-hash-at-all-abcdef")
      ).rejects.toThrow(/Invalid EVM txHash/);
    });

    it("rejects invalid raw transaction payload format", async () => {
      await expect(
        client.sendRawTransaction("not-hex-data", LOCAL_WRITE)
      ).rejects.toThrow(expect.objectContaining({ code: "L2_INVALID_TX_PARAMS" }));

      // Odd length hex
      await expect(
        client.sendRawTransaction("0x123", LOCAL_WRITE)
      ).rejects.toThrow(expect.objectContaining({ code: "L2_INVALID_TX_PARAMS" }));
    });
  });
});
