import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import "@hardkas/testing/setup";
import { analyzeSilverScriptSecurity } from "@hardkas/core";
import { createCovenantTestbed, fuzzComputeBudgetBounds, type CompiledCovenantContract } from "@hardkas/testing";

// Example 10 · silverc level (vitest.silverc.config.ts): compiles GuardedVaultCounter with the pinned silverc; no
// SilverScript runner. The structural validation (F1.4) and the static analysis. Its SCRIPT_VM tests are in
// guarded-vault-counter.silver-runner.test.ts.

const contractPath = path.resolve(__dirname, "../contracts/guarded-vault-counter.sil");

describe("Example 10 · Covenant Dev Framework (GuardedVaultCounter)", () => {
  const source = fs.readFileSync(contractPath, "utf8");
  let testbed: ReturnType<typeof createCovenantTestbed>;
  let contract: CompiledCovenantContract;

  beforeAll(async () => {
    testbed = createCovenantTestbed();
    const owner = testbed.getAccount("owner");
    contract = await testbed.compileContract({
      source,
      sourceFile: "guarded-vault-counter.sil",
      constructorArgs: [`0x${owner.xOnlyPublicKey}`, 10n, 500_000n]
    });
  });

  it("1. passes static security analysis with 0 HIGH and 0 MEDIUM findings", async () => {
    const audit = await analyzeSilverScriptSecurity({
      source,
      file: "guarded-vault-counter.sil",
      ast: contract.ast,
      artifact: contract.artifact
    });

    expect(audit.summary.high).toBe(0);
    expect(audit.summary.medium).toBe(0);
  });

  it("1b. structural validation (SYNTHETIC) accepts a valid transition and refuses one below the v1 fee floor", async () => {
    const genesis = await testbed.deployGenesis({ contract, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const valid = await testbed.executeTransition({
      contract,
      utxo: genesis.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }],
      feeSompi: 300_000n,
      backends: ["SYNTHETIC"]
    });
    expect(valid.status).toBe("SYNTHETIC_PASS");
    expect(valid.structuralPassed).toBe(true);

    const second = await testbed.deployGenesis({ contract, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const underpaid = await testbed.executeTransition({
      contract,
      utxo: second.utxo,
      entrypoint: "bump",
      args: [
        { kind: "int", value: 5n },
        { kind: "signer", signer: "owner" }
      ],
      nextStates: [{ state: { value: 15n } }],
      feeSompi: 1_000n,
      backends: ["SYNTHETIC"]
    });
    expect(underpaid.status).toBe("SYNTHETIC_FAIL");
    expect(underpaid.structuralErrorCode).toBe("FEE_BELOW_V1_FLOOR");
  });

  it("1c. structural compute-budget bounds hold in both directions (bidirectional property)", async () => {
    const report = await fuzzComputeBudgetBounds(testbed, contract, { numRuns: 20, seed: 20261029 });
    expect(report.outcome, report.failure?.error).toBe("PASS");
    expect(report.coverage.expectedAccept).toBeGreaterThanOrEqual(2);
    expect(report.coverage.expectedReject).toBeGreaterThanOrEqual(3);
  });
});
