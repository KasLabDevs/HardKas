import { describe, it, expect, vi, beforeEach } from "vitest";
import { KaspaSdkRealTxSigner } from "../src/kaspa-sdk-real-signer.js";
import { TxPlanArtifact } from "@hardkas/artifacts";
import { RealDevAccount } from "../src/real-accounts.js";

describe("KaspaSdkRealTxSigner", () => {
  const mockPlan: any = {
    schema: "hardkas.txPlan",
    hardkasVersion: "0.2.2-alpha",
    version: "1.0.0-alpha",
    createdAt: new Date().toISOString(),
    planId: "plan123",
    networkId: "simnet",
    mode: "simulated",
    from: { address: "kaspasim:alice123" },
    to: { address: "kaspasim:bob456" },
    amountSompi: "100000000",
    inputs: [
      {
        outpoint: { transactionId: "tx1", index: 0 },
        address: "kaspasim:alice123",
        amountSompi: "200000000",
        scriptPublicKey: "script123"
      }
    ],
    outputs: [],
    estimatedMass: "500",
    estimatedFeeSompi: "500"
  };

  const mockAccount: RealDevAccount = {
    name: "alice",
    address: "kaspasim:alice123",
    privateKey: "privkey123",
    createdAt: new Date().toISOString()
  };

  it("should fail clearly when SDK is missing", async () => {
    const signer = new KaspaSdkRealTxSigner({
      sdkLoader: async () => { throw new Error("MODULE_NOT_FOUND"); }
    });

    await expect(signer.sign({ plan: mockPlan, account: mockAccount }))
      .rejects.toThrow(/is not installed/);
  });

  it("should sign successfully with a mock SDK", async () => {
    const mockSdk = {
      PrivateKey: vi.fn().mockImplementation((k) => ({ key: k })),
      UtxoEntry: vi.fn(),
      Address: vi.fn().mockImplementation((a) => ({ addr: a })),
      PaymentOutput: vi.fn(),
      createTransaction: vi.fn().mockReturnValue({ id: "txid123" }),
      signTransaction: vi.fn().mockReturnValue({ 
        id: "txid123", 
        serialize: () => "signed_payload_hex" 
      })
    };

    const signer = new KaspaSdkRealTxSigner({
      sdkLoader: async () => mockSdk
    });

    const result = await signer.sign({ plan: mockPlan, account: mockAccount });

    expect(result.txId).toBe("txid123");
    expect(result.signedTransaction.payload).toBe("signed_payload_hex");
    expect(mockSdk.createTransaction).toHaveBeenCalled();
    expect(mockSdk.signTransaction).toHaveBeenCalled();
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

    await expect(signer.sign({ plan: planNoScript as any, account: mockAccount }))
      .rejects.toThrow(/missing scriptPublicKey/);
  });
});
