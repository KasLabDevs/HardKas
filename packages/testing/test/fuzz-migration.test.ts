import { describe, it, expect } from "vitest";
import { Hardkas } from "@hardkas/sdk";
import { mutateArtifact, writeReport } from "../src/fuzzing.js";
import { calculateContentHash } from "@hardkas/artifacts";

describe("Phase 6A: Migration Fuzzing", () => {
  it("should force migration receipts and avoid silent migrations", async () => {
    const sdk = await Hardkas.open({ network: "simnet", autoBootstrap: true });
    const original = {
      schema: "hardkas.txPlan.v1",
      hardkasVersion: "0.7.0",
      version: "0.1.0",
      inputs: [],
      outputs: [],
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      lineage: {
        artifactId: "unknown",
        lineageId: "0000000000000000000000000000000000000000000000000000000000000000",
        rootArtifactId: "0000000000000000000000000000000000000000000000000000000000000000"
      }
    };
    (original as any).hashVersion = 1;
    (original as any).contentHash = calculateContentHash(original, 1);
    (original as any).lineage.artifactId = (original as any).contentHash;

    let silentMigrations = 0;
    let stacktraces = 0;
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const mutated = mutateArtifact(original);
      try {
        const verifyResult = await sdk.artifacts.verify(mutated, { throwOnInvalid: false });
        if (verifyResult.valid === true) {
          if (silentMigrations === 0) console.log("Silent migration accepted:", mutated);
          silentMigrations++;
        }
      } catch (e: any) {
        stacktraces++;
      }
    }

    const report = {
      target: "hardkas.migration.engine",
      iterations,
      silentMigrations,
      rawStacktraces: stacktraces,
      status: silentMigrations === 0 && stacktraces === 0 ? "PASS" : "FAIL"
    };

    writeReport("fuzz-migration-084.json", report);

    expect(silentMigrations).toBe(0);
    expect(stacktraces).toBe(0);
  });
});
