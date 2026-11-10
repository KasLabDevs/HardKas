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
          address: dummyAddress,
          sending: [
            {
              transaction: {
                inputs: [{ previousOutpoint: { transactionId: "txA", index: 0 } }]
              }
            }
          ],
          receiving: []
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
          address: dummyAddress,
          sending: [],
          receiving: [
            {
              transaction: {
                inputs: [{ previousOutpoint: { transactionId: "txC", index: 2 } }] // completely unrelated
              }
            }
          ]
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

// L1-CORE-1 B2 · TX-LOOKUP-NO-TXINDEX-1: `getTransaction` is `null` on a node without TxIndex (rusty-kaspad's default);
// that was reported as "Transaction … not found" for every transaction, a confirmed one included
describe("QueryToolkit - transaction lookups on a node without TxIndex", () => {
  const rpc = { getTransaction: vi.fn(), getMempoolEntry: vi.fn() } as any;
  const query = new QueryToolkit(rpc);

  it("null and not in the mempool: TX_LOOKUP_UNAVAILABLE (never 'not found'), naming the observation that can tell", async () => {
    rpc.getTransaction.mockResolvedValue(null);
    rpc.getMempoolEntry.mockResolvedValue(null);
    for (const ask of [() => query.transaction("ab".repeat(32)), () => query.confirmations("ab".repeat(32))]) {
      const err: any = await ask().catch((e) => e);
      expect(err.code).toBe("TX_LOOKUP_UNAVAILABLE");
      expect(err.message).not.toMatch(/not found\./);
      expect(err.message).toMatch(/sdk\.tx\.observe|hardkas tx status/);
    }
  });

  it("null but in the mempool: the mempool entry, 0 confirmations", async () => {
    rpc.getTransaction.mockResolvedValue(null);
    rpc.getMempoolEntry.mockResolvedValue({ txId: "cd".repeat(32) });
    expect((await query.transaction("cd".repeat(32))).data).toEqual({ txId: "cd".repeat(32) });
    expect((await query.confirmations("cd".repeat(32))).data).toBe(0);
  });
});
