import { 
  Hardkas, 
  formatSompi, 
  parseKasToSompi,
  writeArtifact,
  HARDKAS_VERSION,
  TxTraceArtifact,
  ARTIFACT_SCHEMAS
} from "@hardkas/sdk";
import fs from "node:fs";
import path from "node:path";

/**
 * Example 07: Failure Debugging
 * 
 * Demonstrates developer-grade transaction debugging and failure analysis
 * for Kaspa-native workflows by intentionally triggering and documenting failures.
 */
async function main() {
  console.log("╔══════════════════════════════╗");
  console.log("║         HardKAS              ║");
  console.log("║    Failure Debugging Demo    ║");
  console.log("╚══════════════════════════════╝\n");

  const hardkas = await Hardkas.create();
  const alice = await hardkas.accounts.resolve("alice");
  const bob = await hardkas.accounts.resolve("bob");

  const artifactsDir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  /**
   * Helper to run a failing scenario and generate artifacts
   */
  async function runScenario(name: string, fn: () => Promise<void>) {
    console.log(`Scenario: ${name}`);
    console.log("-".repeat(name.length + 10));
    
    const scenarioDir = path.join(artifactsDir, name.toLowerCase().replace(/\s+/g, "-"));
    if (!fs.existsSync(scenarioDir)) fs.mkdirSync(scenarioDir);

    const traceSteps: TxTraceArtifact["steps"] = [];
    const addTrace = (phase: string, status: string, details?: any) => {
      traceSteps.push({ phase, status, timestamp: new Date().toISOString(), details });
    };

    try {
      addTrace("resolve-utxos", "start");
      await fn();
      console.log("✓ Scenario unexpectedly succeeded");
    } catch (error: any) {
      addTrace("finalize", "failed", { error: error.message });
      console.log(`✗ Transaction failed`);
      console.log(`Reason: ${error.message}`);

      // Generate structured diagnostics
      const errorArtifact = {
        schema: "hardkas.error.v1",
        hardkasVersion: HARDKAS_VERSION,
        scenario: name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };

      const traceArtifact: TxTraceArtifact = {
        schema: ARTIFACT_SCHEMAS.TX_TRACE || "hardkas.txTrace.v1" as any,
        hardkasVersion: HARDKAS_VERSION,
        networkId: hardkas.network,
        mode: "simulated",
        createdAt: new Date().toISOString(),
        txId: "failure-" + Date.now(),
        steps: traceSteps
      };

      const replayArtifact = {
        schema: "hardkas.replay.v1",
        scenario: name,
        instructions: "Run 'pnpm example:failure' to reproduce this exact failure state."
      };

      await writeArtifact(path.join(scenarioDir, "error.json"), errorArtifact);
      await writeArtifact(path.join(scenarioDir, "trace.json"), traceArtifact);
      await writeArtifact(path.join(scenarioDir, "replay.json"), replayArtifact);

      console.log(`\nArtifacts generated in: ${path.relative(process.cwd(), scenarioDir)}`);
      console.log("- error.json");
      console.log("- trace.json");
      console.log("- replay.json\n");
    }
  }

  // Scenario 1: Insufficient Funds
  await runScenario("Insufficient Funds", async () => {
    // Alice has 0 KAS in this simulated environment if the node is empty
    // We try to send 10,000 KAS
    await hardkas.tx.plan({
      from: alice,
      to: bob,
      amount: parseKasToSompi("10000")
    });
  });

  // Scenario 2: Invalid Address
  await runScenario("Invalid Address", async () => {
    await hardkas.tx.plan({
      from: alice,
      to: "kaspa:invalidaddress12345",
      amount: parseKasToSompi("1")
    });
  });

  // Scenario 3: Invalid Fee Policy
  await runScenario("Invalid Fee Policy", async () => {
    // Attempting a negative or zero fee rate if enforced
    // In this case, we'll simulate a builder error by passing an invalid fee rate type
    await hardkas.tx.plan({
      from: alice,
      to: bob,
      amount: parseKasToSompi("1"),
      feeRate: -1n as any // Intentional invalid fee rate
    });
  });

  console.log("# Summary");
  console.log("Failure debugging artifacts generated for all scenarios.");
}

main().catch(err => {
  console.error("\n✖ Example failed");
  console.error(err);
  process.exit(1);
});
