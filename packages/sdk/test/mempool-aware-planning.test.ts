import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hardkas } from "../src/index.js";
import { HardkasQuery } from "../src/query.js";
import type { TxPlanArtifact } from "@hardkas/artifacts";

describe("Mempool-Aware UTXO Selection (Regression)", () => {
  let sdk: Hardkas;
  let mockRpc: any;

  beforeEach(async () => {
    mockRpc = {
      getUtxosByAddress: vi.fn(),
      getMempoolEntriesByAddresses: vi.fn(),
      getBlockDagInfo: vi.fn().mockResolvedValue({ virtualDaaScore: 100 }),
    };

    const config = {
      cwd: process.cwd(),
      config: {
        defaultNetwork: "simnet",
        networks: {
          simnet: {
            kind: "kaspa-rpc",
            rpcUrl: "mock"
          }
        }
      }
    };

    // Need to use any to bypass private constructor for testing
    sdk = new (Hardkas as any)(config, { mode: "developer" }, mockRpc);

    // Mock accounts to return a valid address
    vi.spyOn(sdk.accounts, "resolve").mockImplementation(async (name) => {
      return { address: name, name, publicKey: "mock", privateKey: "mock" } as any;
    });
  });

  it("tx2 must not reuse input from tx1 if tx1 is pending in mempool", async () => {
    const fromAddress = "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e";
    const toAddress = "kaspasim:qrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrx9awp4f";


    // 1. Initial State: Address has one UTXO (txA:0)
    mockRpc.getUtxosByAddress.mockResolvedValue([
      { outpoint: { transactionId: "txA", index: 0 }, amountSompi: 100000000n, scriptPublicKey: "00", isCoinbase: false }
    ]);
    mockRpc.getMempoolEntriesByAddresses.mockResolvedValue({ entries: [] });

    // 2. Plan Tx1
    const plan1: TxPlanArtifact = await sdk.tx.plan({
      from: fromAddress,
      to: toAddress,
      amount: 10000000n // 0.1 KAS
    });

    // (We assume plan1 successfully created a plan that uses txA)



    // 3. Tx1 is broadcasted and enters the mempool.
    // The node now reports txA as pending in the mempool.
    mockRpc.getUtxosByAddress.mockResolvedValue([
      { outpoint: { transactionId: "txA", index: 0 }, amountSompi: 100000000n, scriptPublicKey: "00", isCoinbase: false }
    ]); // Node DAG still shows it as unspent
    
    mockRpc.getMempoolEntriesByAddresses.mockResolvedValue({
      entries: [
        {
          sending: [{ address: fromAddress }],
          receiving: [{ address: toAddress }, { address: fromAddress }], // Change
          transaction: {
            inputs: [{ previousOutpoint: { transactionId: "txA", index: 0 } }] // txA is locked by this pending tx
          }
        }
      ]
    });

    // 4. Try to plan Tx2 immediately
    await expect(sdk.tx.plan({
      from: fromAddress,
      to: toAddress,
      amount: 10000000n
    })).rejects.toThrow(/Insufficient funds/i); // Should fail because txA is filtered out!

  });
});
