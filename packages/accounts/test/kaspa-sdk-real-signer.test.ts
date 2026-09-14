import { describe, it, expect, vi, beforeEach } from "vitest";
import { KaspaSdkRealTxSigner } from "../src/kaspa-sdk-real-signer.js";
import { TxPlanArtifact } from "@hardkas/artifacts";
import { RealDevAccount } from "../src/real-accounts.js";

describe("KaspaSdkRealTxSigner", () => {
  const mockPlan: any = {
    schema: "hardkas.txPlan",
    hardkasVersion: "0.12.0-rc.20",
    version: "1.0.0-alpha",
    createdAt: new Date().toISOString(),
    planId: "plan123",
    networkId: "simnet",
    mode: "simulator",
    from: { address: "kaspa:sim_alice123" },
    to: { address: "kaspa:sim_bob456" },
    amountSompi: "100000000",
    inputs: [
      {
        outpoint: { transactionId: "tx1", index: 0 },
        address: "kaspa:sim_alice123",
        amountSompi: "200000000",
        scriptPublicKey: "script123"
      }
    ],
    outputs: [{ address: "kaspa:sim_bob456", amountSompi: "100000000" }],
    change: { address: "kaspa:sim_alice123", amountSompi: "99999500" },
    estimatedMass: "500",
    estimatedFeeSompi: "500"
  };

  const mockAccount: RealDevAccount = {
    name: "alice",
    address: "kaspa:sim_alice123",
    privateKey: "privkey123",
    createdAt: new Date().toISOString()
  };

  it("should fail clearly when SDK is missing", async () => {
    const signer = new KaspaSdkRealTxSigner({
      sdkLoader: async () => {
        throw new Error("MODULE_NOT_FOUND");
      }
    });

    await expect(signer.sign({ plan: mockPlan, account: mockAccount })).rejects.toThrow(
      /is not installed/
    );
  });

  it("should sign successfully with a mock SDK", async () => {
    const mockSdk = {
      PrivateKey: vi.fn().mockImplementation((k) => ({ key: k })),
      UtxoEntry: vi.fn(),
      Address: vi.fn().mockImplementation((a) => ({ addr: a })),
      PaymentOutput: vi.fn(),
      ScriptPublicKey: vi.fn().mockImplementation((v, s) => ({ version: v, script: s })),
      createTransaction: vi.fn().mockReturnValue({ id: "txid123" }),
      // kaspa-wasm 2.x returns the signed Transaction itself
      signTransaction: vi.fn().mockReturnValue({
        id: "txid123",
        toJSON: () => ({ payload: "mocked" })
      })
    };

    const signer = new KaspaSdkRealTxSigner({
      sdkLoader: async () => mockSdk
    });

    const result = await signer.sign({ plan: mockPlan, account: mockAccount });

    expect(result.txId).toBe("txid123");
    expect(result.signedTransaction.payload).toBe('{"payload":"mocked"}');
    // 2.x signature: (utxos, outputs including change, fee); no change address argument
    const call = mockSdk.createTransaction.mock.calls[0]!;
    expect(call).toHaveLength(3);
    expect(call[1]).toHaveLength(2);
    expect(call[2]).toBe(500n);
    expect(mockSdk.signTransaction).toHaveBeenCalled();
  });

  it("refuses a plan whose values do not balance instead of paying the difference as fee", async () => {
    const createTransaction = vi.fn();
    const signer = new KaspaSdkRealTxSigner({
      sdkLoader: async () => ({
        PrivateKey: vi.fn().mockImplementation((k) => ({ key: k })),
        ScriptPublicKey: vi.fn().mockImplementation((v, s) => ({ version: v, script: s })),
        PaymentOutput: vi.fn(),
        Address: vi.fn(),
        createTransaction
      })
    });
    const unbalanced = { ...mockPlan, change: undefined };

    await expect(signer.sign({ plan: unbalanced, account: mockAccount })).rejects.toThrow(/TX_VALUE_NOT_CONSERVED/);
    expect(createTransaction).toHaveBeenCalledTimes(0);
  });

  it("should fail if UTXO is missing scriptPublicKey", async () => {
    const planNoScript = {
      ...mockPlan,
      inputs: [{ ...mockPlan.inputs[0], scriptPublicKey: undefined }]
    };

    const signer = new KaspaSdkRealTxSigner({
      sdkLoader: async () => ({
        PrivateKey: vi.fn(),
        UtxoEntry: vi.fn()
      })
    });

    await expect(
      signer.sign({ plan: planNoScript as any, account: mockAccount })
    ).rejects.toThrow(/missing scriptPublicKey/);
  });
});

