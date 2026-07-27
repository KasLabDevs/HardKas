import { describe, it, expect, vi } from "vitest";
import { asNetworkId } from "@hardkas/core";
import { PrivateKeyAuthorizer } from "../src/authorizers.js";
import { TxPlanArtifact } from "@hardkas/artifacts";

describe("PrivateKeyAuthorizer", () => {
  const mockPlan: TxPlanArtifact = {
    schema: "hardkas.txPlan",
    hardkasVersion: "0.11.4-alpha",
    version: "1.0.0-alpha",
    createdAt: new Date().toISOString(),
    planId: "plan123",
    networkId: asNetworkId("simnet") as any,
    mode: "simulated",
    from: { address: "kaspa:sim_alice" },
    to: { address: "kaspa:sim_bob" },
    amountSompi: "1000",
    inputs: [
      {
        outpoint: { transactionId: "tx1", index: 0 },
        amountSompi: "2000",
        address: "kaspa:sim_alice"
      } as any
    ],
    outputs: [],
    estimatedMass: "100",
    estimatedFeeSompi: "100"
  };

  const validPkHex = "1111111111111111111111111111111111111111111111111111111111111111";

  it("should fail if private key does not control input address", async () => {
    const authorizer = new PrivateKeyAuthorizer("alice", validPkHex);
    
    const mockWasm = {
      PrivateKey: vi.fn().mockImplementation(() => ({
        toKeypair: () => ({
          toAddress: () => ({
            toString: () => "kaspa:sim_wrong_address"
          })
        })
      }))
    };

    const auth = authorizer.authorize({
      inputIndex: 0,
      plan: mockPlan,
      wasmTransaction: {},
      wasm: mockWasm
    });

    if (auth.kind !== "wasm-signer") {
      throw new Error("Expected wasm-signer");
    }

    await expect(auth.signer.signInput({
      inputIndex: 0,
      plan: mockPlan,
      wasmTransaction: {},
      wasm: mockWasm
    })).rejects.toThrow(/PRIVATE_KEY_DOES_NOT_CONTROL_INPUT/);
  });

  it("should fail if Kaspa WASM fails to generate signature", async () => {
    const authorizer = new PrivateKeyAuthorizer("alice", validPkHex);
    
    const mockWasm = {
      PrivateKey: vi.fn().mockImplementation(() => ({
        toKeypair: () => ({
          toAddress: () => ({
            toString: () => "kaspa:sim_alice"
          })
        })
      })),
      signTransaction: vi.fn().mockReturnValue({
        inputs: [{ signatureScript: "" }]
      })
    };

    const auth = authorizer.authorize({
      inputIndex: 0,
      plan: mockPlan,
      wasmTransaction: {},
      wasm: mockWasm
    });

    if (auth.kind !== "wasm-signer") {
      throw new Error("Expected wasm-signer");
    }

    await expect(auth.signer.signInput({
      inputIndex: 0,
      plan: mockPlan,
      wasmTransaction: {},
      wasm: mockWasm
    })).rejects.toThrow(/Kaspa WASM failed to generate a signature script/);
  });
});
