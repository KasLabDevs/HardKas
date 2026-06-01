import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hardkas } from "../src/index.js";
import {
  KaspaWasmPrivateKeySigner,
  listHardkasAccounts,
  resolveHardkasAccount
} from "@hardkas/accounts";
import { verifySignedTxSemantics } from "@hardkas/tx-builder";
import { finalizeArtifact, deepFreeze, writeArtifact } from "@hardkas/artifacts";
import path from "node:path";
import fs from "node:fs";

// Mock Kaspa WASM dependency
vi.mock("kaspa", () => {
  return {
    PrivateKey: vi.fn().mockImplementation(() => ({
      toAddress: vi.fn().mockReturnValue("kaspa:mock_addr")
    })),
    UtxoEntry: vi.fn().mockImplementation((amount, spk, txid, idx, address) => ({
      amount,
      spk,
      txid,
      idx,
      address
    })),
    PaymentOutput: vi.fn(),
    Address: vi.fn(),
    createTransaction: vi.fn().mockReturnValue({
      serialize: vi.fn().mockReturnValue("mock-tx-payload"),
      id: "mock-tx-id"
    }),
    signTransaction: vi.fn().mockReturnValue({
      serialize: vi.fn().mockReturnValue("mock-tx-payload-signed"),
      id: "mock-tx-id-signed",
      toRpcTransaction: vi.fn().mockReturnValue({})
    })
  };
});

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual = await vi.importActual("@hardkas/kaspa-rpc");
  return {
    ...(actual as any),
    JsonWrpcKaspaClient: vi.fn().mockImplementation(() => ({
      submitTransaction: vi
        .fn()
        .mockResolvedValue({ accepted: true, transactionId: "tx_mock_hash_123" }),
      getUtxosByAddress: vi.fn().mockResolvedValue([]),
      getBalanceByAddress: vi.fn().mockResolvedValue({ balanceSompi: 100000000n })
    }))
  };
});

describe("Core Hardening Sprint Regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // VULN-01: Silent Mock Script Injection
  it("[VULN-01] should throw a strict error if scriptPublicKey is missing in WASM signing", async () => {
    const signer = new KaspaWasmPrivateKeySigner({
      account: {
        name: "test",
        kind: "kaspa-private-key",
        address: "kaspa:test",
        privateKeyEnv: "TEST_KEY"
      }
    });

    process.env.TEST_KEY = "1".repeat(64);

    const plan = {
      networkId: "simnet" as any,
      mode: "real",
      estimatedFeeSompi: "100",
      from: { address: "kaspa:test" },
      inputs: [
        {
          amountSompi: "1000",
          outpoint: { transactionId: "123", index: 0 }
          // scriptPublicKey is omitted
        }
      ],
      outputs: [{ address: "kaspa:to", amountSompi: "900" }]
    };

    await expect(
      signer.signTxPlan({ planArtifact: plan as any, accountName: "test" })
    ).rejects.toThrow(
      "UTXO is missing scriptPublicKey. Real signing flows must never fabricate cryptographic state."
    );
  });

  // VULN-02: No-Op Plan ID Verification
  it("[VULN-02] should fail signed transaction verification on plan ID mismatch", () => {
    const plan = {
      planId: "plan_123",
      amountSompi: "1000",
      networkId: "simnet"
    };

    const signed = {
      sourcePlanId: "plan_wrong",
      amountSompi: "1000",
      networkId: "simnet",
      signedTransaction: { payload: "signed-payload" }
    };

    const result = verifySignedTxSemantics(signed, plan as any);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "PLAN_ID_MISMATCH")).toBe(true);
  });

  // VULN-03: Post-Hash Artifact Mutation
  it("[VULN-03] should produce an immutable receipt and seal tracePath before hashing", async () => {
    const sdk = await Hardkas.open({ cwd: "./test-workspace" });

    const signedArtifact = {
      schema: "hardkas.signedTx",
      signedId: "signed_123",
      sourcePlanId: "plan_123",
      amountSompi: "1000",
      networkId: "simnet",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      signedTransaction: { payload: "signed-payload" }
    };

    const mockPlan = {
      planId: "plan_123",
      networkId: "simnet",
      mode: "simulated",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      amountSompi: "1000",
      inputs: [],
      outputs: [{ address: "kaspa:sim_bob", amountSompi: "1000" }]
    };
    vi.spyOn(sdk.artifacts, "read").mockResolvedValue(mockPlan);

    const { receipt } = await sdk.tx.simulate(signedArtifact as any);

    // Verify tracePath is populated inside receipt
    expect(receipt.tracePath).toBeDefined();

    // Verify that the receipt is frozen (immutable)
    expect(Object.isFrozen(receipt)).toBe(true);

    // Verify mutating receipt throws
    expect(() => {
      (receipt as any).amountSompi = "2000";
    }).toThrow();
  });

  // VULN-05: Optional Semantic Verification
  it("[VULN-05] should fail closed and prevent broadcast if pre-broadcast semantic verification fails", async () => {
    const sdk = await Hardkas.open({ cwd: "./test-workspace" });

    const invalidSigned = {
      signedId: "signed_123",
      amountSompi: "1000",
      networkId: "simnet",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" }
      // Missing signedTransaction payload
    };

    await expect(sdk.tx.send(invalidSigned as any)).rejects.toThrow(
      /Pre-broadcast semantic verification failed/
    );
  });

  it("[VULN-05] should warn PLAN_UNAVAILABLE_FOR_LINEAGE_CHECK if plan is not in the workspace during send", async () => {
    const signed = {
      signedId: "signed_123",
      sourcePlanId: "non-existent-plan",
      amountSompi: "1000",
      networkId: "simnet",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" },
      signedTransaction: { payload: "signed-payload" }
    };

    const planVerification = verifySignedTxSemantics(signed, undefined);
    expect(planVerification.ok).toBe(true); // Should pass as ok because it's a warning
    expect(
      planVerification.issues.some((i) => i.code === "PLAN_UNAVAILABLE_FOR_LINEAGE_CHECK")
    ).toBe(true);
  });

  // VULN-06: Path Resolution Divergence
  it("[VULN-06] should fail closed when attempting encrypted keystore listing without cwd context", () => {
    const mockExistsSync = vi.spyOn(fs, "existsSync");
    mockExistsSync.mockImplementation((filePath) => {
      if (
        typeof filePath === "string" &&
        filePath.includes(path.join(process.cwd(), ".hardkas", "keystore"))
      ) {
        return true;
      }
      return false;
    });

    expect(() => listHardkasAccounts()).toThrow(/Workspace root\/cwd is required/);

    mockExistsSync.mockRestore();
  });
});
