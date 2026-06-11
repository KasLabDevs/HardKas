import { describe, it, expect } from "vitest";
import { Hardkas } from "@hardkas/sdk";
import { mutateArtifact, writeReport } from "../src/fuzzing.js";
import { calculateContentHash } from "@hardkas/artifacts";

describe("Phase 6A: Network Fuzzing", () => {
  it("should reject all mutated network profiles", async () => {
    const sdk = await Hardkas.open({ network: "simnet", autoBootstrap: true });
    const original = {
      schema: "hardkas.networkProfile.v1",
      hardkasVersion: "0.9.3-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      layer: "L1",
      capabilities: { supports_rbf: false, gas_model: "utxo" },
      createdAt: new Date().toISOString()
    };
    (original as any).hashVersion = 4;
    (original as any).contentHash = calculateContentHash(original, 4);

    let acceptedInvalid = 0;
    let stacktraces = 0;
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const mutated = mutateArtifact(original);
      try {
        const verifyResult = await sdk.artifacts.verify(mutated, {
          throwOnInvalid: false
        });
        if (verifyResult.valid === true) {
          acceptedInvalid++;
        }
      } catch (e: unknown) {
        stacktraces++;
      }
    }

    const report = {
      target: "hardkas.networkProfile.v1",
      iterations,
      acceptedInvalid,
      rawStacktraces: stacktraces,
      status: acceptedInvalid === 0 && stacktraces === 0 ? "PASS" : "FAIL"
    };

    writeReport("fuzz-network-084.json", report);

    expect(acceptedInvalid).toBe(0);
    expect(stacktraces).toBe(0);
  });
});
