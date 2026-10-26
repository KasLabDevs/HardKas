import { describe, it, expect, vi } from "vitest";
import { KaspaSdkRealTxSigner } from "../src/kaspa-sdk-real-signer.js";

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25). `KaspaSdkRealTxSigner` (exported by @hardkas/accounts) signs a
// plan without going through `signTxPlanArtifact`: it refuses a plan input that belongs to a covenant the same way,
// before it loads the SDK or reads the account's key. A covenant is spent only through its own commands.
// -----------------------------------------------------------------------------

const COVENANT_ID = "c0".repeat(32);
const plan = (covenantId?: string): any => ({
  schema: "hardkas.txPlan",
  planId: "cuf1c",
  networkId: "simnet",
  mode: "real",
  from: { address: "kaspasim:qpayer" },
  to: { address: "kaspasim:qpayee" },
  amountSompi: "100000000",
  inputs: [
    {
      outpoint: { transactionId: "ab".repeat(32), index: 0 },
      address: "kaspasim:qpayer",
      amountSompi: "200000000",
      scriptPublicKey: "script123",
      ...(covenantId ? { covenantId } : {})
    }
  ],
  outputs: [{ address: "kaspasim:qpayee", amountSompi: "100000000" }],
  change: { address: "kaspasim:qpayer", amountSompi: "99999500" },
  estimatedMass: "500",
  estimatedFeeSompi: "500"
});

/** The account, with every read of its key recorded. */
function watchedAccount() {
  const reads: string[] = [];
  const account = new Proxy({ name: "payer", address: "kaspasim:qpayer", privateKey: "11".repeat(32), createdAt: "2026-10-25T00:00:00.000Z" } as any, {
    get(target, prop, receiver) {
      if (prop === "privateKey") reads.push(prop);
      return Reflect.get(target, prop, receiver);
    }
  });
  return { account, reads };
}

function mockSdk() {
  return {
    PrivateKey: vi.fn().mockImplementation((k) => ({ key: k })),
    ScriptPublicKey: vi.fn().mockImplementation((v, s) => ({ version: v, script: s })),
    PaymentOutput: vi.fn(),
    Address: vi.fn(),
    createTransaction: vi.fn().mockReturnValue({ id: "txid123" }),
    signTransaction: vi.fn().mockReturnValue({ id: "txid123", toJSON: () => ({ payload: "mocked" }) })
  };
}

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · KaspaSdkRealTxSigner never signs a covenant input", () => {
  it("CC-S1: a plan input with a covenant id is refused before the SDK loads or the key is read", async () => {
    const sdkLoader = vi.fn(async () => mockSdk());
    const { account, reads } = watchedAccount();
    const r = await new KaspaSdkRealTxSigner({ sdkLoader }).sign({ plan: plan(COVENANT_ID), account }).then(
      () => ({ error: undefined as any }),
      (error) => ({ error })
    );
    expect(r.error?.code).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
    expect(sdkLoader).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });

  it("CC-S2 (control): the same plan without the covenant id is signed as before", async () => {
    const sdk = mockSdk();
    const { account } = watchedAccount();
    const result = await new KaspaSdkRealTxSigner({ sdkLoader: async () => sdk }).sign({ plan: plan(), account });
    expect(result.txId).toBe("txid123");
    expect(sdk.signTransaction).toHaveBeenCalledTimes(1);
  });
});
