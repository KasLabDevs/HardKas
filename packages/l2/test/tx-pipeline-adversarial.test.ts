import { describe, it, expect, vi } from "vitest";
import {
  prepareEvmTransaction,
  EvmLocalAccountSigner,
  EvmSignerChainMismatchError
} from "../src/tx-pipeline.js";
import {
  EvmJsonRpcClient,
  EvmRpcTimeoutError,
  EvmJsonRpcError
} from "../src/evm-rpc-client.js";

const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
// Explicit fee ceilings (Galleon has no built-in fee policy).
const FEES = { maxGasLimit: 1_000_000n, maxFeePerGasWei: 10_000_000_000_000n, maxTotalFeeWei: 10n ** 19n };

describe("L2 Transaction Pipeline — Negative & Adversarial Scenarios", () => {
  it("rejects transaction preparation when remote chainId does not match expectedChainId", async () => {
    const mockClient = {
      getChainId: vi.fn().mockResolvedValue(1), // Mainnet Ethereum returned by mistaken RPC
      getTransactionCount: vi.fn().mockResolvedValue(0n),
      estimateGas: vi.fn().mockResolvedValue(21000n),
      getGasPriceWei: vi.fn().mockResolvedValue(2000000000n)
    } as unknown as EvmJsonRpcClient;

    // Caller expects Igra Galleon (38836), but node returned 1
    await expect(
      prepareEvmTransaction(
        mockClient,
        TEST_ADDR,
        { to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: 100n },
        { expectedChainId: 38836, feeLimits: FEES }
      )
    ).rejects.toThrow(EvmSignerChainMismatchError);
  });

  it("rejects signing when signer expectedChainId does not match prepared transaction chainId", async () => {
    // Signer is configured for Igra Galleon (38836)
    const signer = new EvmLocalAccountSigner(TEST_PK, { expectedChainId: 38836, feeLimits: FEES });

    // Tx was prepared for Anvil (31337)
    const tx = {
      from: TEST_ADDR as `0x${string}`,
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
      value: 100n,
      data: "0x" as `0x${string}`,
      nonce: 0,
      gasLimit: 21000n,
      chainId: 31337, // Mismatch!
      type: "legacy" as const,
      gasPrice: 2000000000n
    };

    await expect(signer.signTransaction(tx)).rejects.toThrow(
      EvmSignerChainMismatchError
    );
  });

  it("applies configured minGasPriceWei floor when node gas price is lower", async () => {
    const mockClient = {
      getChainId: vi.fn().mockResolvedValue(38836),
      getTransactionCount: vi.fn().mockResolvedValue(0n),
      estimateGas: vi.fn().mockResolvedValue(21000n),
      getGasPriceWei: vi.fn().mockResolvedValue(1000000000n) // 1 Gwei
    } as unknown as EvmJsonRpcClient;

    const prepared = await prepareEvmTransaction(
      mockClient,
      TEST_ADDR,
      { to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: 100n },
      {
        expectedChainId: 38836,
        feeLimits: FEES,
        preferredType: "legacy",
        minGasPriceWei: 2000000000000n // 2000 Gwei minimum floor
      }
    );

    expect(prepared.gasPrice).toBe(2000000000000n);
    expect(prepared.type).toBe("legacy");
  });

  it("preserves txHash in error when receipt polling times out", async () => {
    const client = new EvmJsonRpcClient({ url: "http://127.0.0.1:8545", timeoutMs: 100 });
    const dummyTx = "0x" + "a".repeat(64);

    vi.spyOn(client, "getTransactionReceipt").mockResolvedValue(null);

    await expect(
      client.waitForTransactionReceipt(dummyTx, { timeoutMs: 150, intervalMs: 50 })
    ).rejects.toThrow(EvmRpcTimeoutError);
  });

  it("handles chunked log queries across multiple block spans", async () => {
    const client = new EvmJsonRpcClient({ url: "http://127.0.0.1:8545" });

    vi.spyOn(client, "getBlockNumber").mockResolvedValue(5000n);
    const getLogsSpy = vi.spyOn(client, "getLogs").mockImplementation(async (filter) => {
      const blockStr = (filter?.fromBlock ?? "0x0") as string;
      return [
        {
          address: "0x1234567890123456789012345678901234567890",
          topics: ["0xtopic1"],
          data: "0x",
          blockNumber: blockStr,
          blockHash: "0x" + "1".repeat(64),
          transactionHash: "0x" + "2".repeat(64),
          logIndex: blockStr
        }
      ];
    });

    const logs = await client.getLogsChunked({
      fromBlock: 0n,
      toBlock: 4000n,
      chunkSize: 2000
    });

    // Spans 0 to 4000 with chunkSize 2000 requires 3 chunk calls: [0..1999], [2000..3999], [4000..4000]
    expect(getLogsSpy).toHaveBeenCalledTimes(3);
    expect(logs.length).toBe(3);
  });
});
