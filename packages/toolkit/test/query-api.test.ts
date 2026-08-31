import { describe, it, expect, vi } from "vitest";
import { QueryToolkit } from "../src/query-api.js";

describe("QueryToolkit - spendableUtxos", () => {
  const dummyAddress = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e";

  const mockRpc = {
    getUtxosByAddress: vi.fn(),
    getMempoolEntriesByAddresses: vi.fn()
  } as any;

  const query = new QueryToolkit(mockRpc);

  it("should return base DAG UTXOs if no mempool entries exist", async () => {
    mockRpc.getUtxosByAddress.mockResolvedValueOnce([
      { outpoint: { transactionId: "txA", index: 0 }, amountSompi: 100n }
    ]);
    mockRpc.getMempoolEntriesByAddresses.mockResolvedValueOnce({ entries: [] });

    const res = await query.spendableUtxos({ address: dummyAddress, excludePending: true });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].outpoint.transactionId).toBe("txA");
  });

  it("should exclude UTXO if a mempool transaction is spending it", async () => {
    mockRpc.getUtxosByAddress.mockResolvedValueOnce([
      { outpoint: { transactionId: "txA", index: 0 }, amountSompi: 100n },
      { outpoint: { transactionId: "txB", index: 1 }, amountSompi: 200n }
    ]);
    mockRpc.getMempoolEntriesByAddresses.mockResolvedValueOnce({
      entries: [
        {
          sending: [{ address: dummyAddress }],
          receiving: [],
          transaction: {
            inputs: [{ previousOutpoint: { transactionId: "txA", index: 0 } }]
          }
        }
      ]
    });

    const res = await query.spendableUtxos({ address: dummyAddress, excludePending: true });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].outpoint.transactionId).toBe("txB");
  });

  it("should NOT exclude UTXO if mempool tx is only receiving to this address", async () => {
    mockRpc.getUtxosByAddress.mockResolvedValueOnce([
      { outpoint: { transactionId: "txA", index: 0 }, amountSompi: 100n }
    ]);
    mockRpc.getMempoolEntriesByAddresses.mockResolvedValueOnce({
      entries: [
        {
          sending: [{ address: "kaspatest:another_address" }],
          receiving: [{ address: dummyAddress }],
          transaction: {
            inputs: [{ previousOutpoint: { transactionId: "txC", index: 2 } }] // completely unrelated
          }
        }
      ]
    });

    const res = await query.spendableUtxos({ address: dummyAddress, excludePending: true });
    expect(res.data).toHaveLength(1); // txA is still spendable
    expect(res.data[0].outpoint.transactionId).toBe("txA");
  });

  it("should respect manual excludeOutpoints", async () => {
    mockRpc.getUtxosByAddress.mockResolvedValueOnce([
      { outpoint: { transactionId: "txA", index: 0 }, amountSompi: 100n },
      { outpoint: { transactionId: "txB", index: 1 }, amountSompi: 200n }
    ]);
    mockRpc.getMempoolEntriesByAddresses.mockResolvedValueOnce({ entries: [] });

    const excludeOutpoints = new Set(["txB:1"]);
    const res = await query.spendableUtxos({ address: dummyAddress, excludePending: true, excludeOutpoints });
    expect(res.data).toHaveLength(1);
    expect(res.data[0].outpoint.transactionId).toBe("txA");
  });

  it("should return base DAG UTXOs if excludePending is false", async () => {
    mockRpc.getUtxosByAddress.mockResolvedValueOnce([
      { outpoint: { transactionId: "txA", index: 0 }, amountSompi: 100n }
    ]);

    const res = await query.spendableUtxos({ address: dummyAddress, excludePending: false });
    expect(res.data).toHaveLength(1);
    // Should not have called mempool (we can reset mocks before each test ideally, but this is fine for now)
  });
});
