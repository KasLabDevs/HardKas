import { describe, it, expect } from "vitest";
import { Hardkas } from "@hardkas/sdk";
import { mutateArtifact, writeReport } from "../src/fuzzing.js";
import { calculateContentHash } from "@hardkas/artifacts";

describe("Phase 6A: Policy Fuzzing", () => {
  it("should reject all 10,000 mutated policies", async () => {
    const sdk = await Hardkas.open({ network: "simnet", autoBootstrap: true });
    const original = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.9.2-alpha",
      version: "1.0.0-alpha",
      decision: "ALLOW",
      rules: [{ id: "rule-1", result: true, inputHash: "dummy" }],
      createdAt: new Date().toISOString()
    };
    (original as any).hashVersion = 4;
    (original as any).contentHash = calculateContentHash(original, 4);

    let acceptedInvalid = 0;
    let stacktraces = 0;
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const mutated = mutateArtifact(original);
      try {
        const verifyResult = await sdk.artifacts.verify(mutated, {
          throwOnInvalid: false
        });
        // If it validly passes verification despite mutation, it's a failure
        // Actually, if we mutate something that doesn't change the hash (like adding a new field that gets ignored? canonical.ts includes all fields)
        if (verifyResult.valid === true) {
          acceptedInvalid++;
        }
      } catch (e: unknown) {
        // We shouldn't throw raw errors if throwOnInvalid is false
        stacktraces++;
      }
    }

    const report = {
      target: "hardkas.policy.v1",
      iterations,
      acceptedInvalid,
      rawStacktraces: stacktraces,
      status: acceptedInvalid === 0 && stacktraces === 0 ? "PASS" : "FAIL"
    };

    writeReport("fuzz-policy-084.json", report);

    expect(acceptedInvalid).toBe(0);
    expect(stacktraces).toBe(0);
  });
});
