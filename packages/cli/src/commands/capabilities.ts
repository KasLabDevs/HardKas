import { Command } from "commander";
import pc from "picocolors";
import { HARDKAS_VERSION, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

export interface HardKasCapabilities {
  version: string;
  maturity: "alpha" | "hardened-alpha" | "beta" | "stable";
  proofVersion: string;
  hashVersion: number;
  capabilities: {
    // Core systems
    artifacts: boolean;
    lineageVerification: boolean;
    deterministicHashing: boolean;
    atomicPersistence: boolean;
    workspaceLocks: boolean;
    corruptionDetection: boolean;
    secretRedaction: boolean;
    mainnetGuards: boolean;

    // Simulation
    localnetSimulation: boolean;
    ghostdagSimulation: boolean;
    dagConflictResolution: boolean;
    massProfiler: boolean;
    simulationScenarios: boolean;

    // Query & Replay
    queryStore: boolean;
    replayVerification: boolean;
    schemaMigrations: boolean;

    // Infrastructure
    dockerNode: boolean;
    scriptRunner: boolean;
    testingFramework: boolean;

    // L2
    l2Profiles: boolean;
    l2BridgeAssumptions: boolean;

    // NOT yet implemented
    consensusValidation: boolean;
    productionWallet: boolean;
    silverScript: boolean;
    covenants: boolean;
    trustlessExit: boolean;
    differentialDagValidation: boolean;
  };
  trustBoundaries: {
    replay: "local-workflow-only";
    artifacts: "internal-integrity-only";
    simulator: "research-experimental";
    queryStore: "rebuildable-read-model";
    l2Bridge: "pre-zk-assumptions";
  };
}

export function registerCapabilitiesCommand(program: Command) {
  program
    .command("capabilities")
    .description("Show HardKAS capabilities and maturity level")
    .option("--json", "Output as stable JSON schema", false)
    .action(async (opts) => {
      const caps: HardKasCapabilities = {
        version: HARDKAS_VERSION,
        maturity: "hardened-alpha",
        proofVersion: "repro-v0",
        hashVersion: CURRENT_HASH_VERSION,
        capabilities: {
          artifacts: true,
          lineageVerification: true,
          deterministicHashing: true,
          atomicPersistence: true,
          workspaceLocks: true,
          corruptionDetection: true,
          secretRedaction: true,
          mainnetGuards: true,

          localnetSimulation: true,
          ghostdagSimulation: true,
          dagConflictResolution: true,
          massProfiler: true,
          simulationScenarios: true,

          queryStore: true,
          replayVerification: true,
          schemaMigrations: true,

          dockerNode: true,
          scriptRunner: true,
          testingFramework: true,

          l2Profiles: true,
          l2BridgeAssumptions: true,

          consensusValidation: false,
          productionWallet: false,
          silverScript: false,
          covenants: false,
          trustlessExit: false,
          differentialDagValidation: false,
        },
        trustBoundaries: {
          replay: "local-workflow-only",
          artifacts: "internal-integrity-only",
          simulator: "research-experimental",
          queryStore: "rebuildable-read-model",
          l2Bridge: "pre-zk-assumptions",
        }
      };

      if (opts.json) {
        console.log(JSON.stringify(caps, null, 2));
      } else {
        renderHumanReadable(caps);
      }
    });
}

function renderHumanReadable(caps: HardKasCapabilities) {
  console.log(`${pc.bold("HardKAS")} ${pc.cyan("v" + caps.version)} — ${pc.green("Hardened Alpha")}\n`);

  const printGroup = (title: string, items: [string, string, boolean][]) => {
    console.log(`  ${pc.bold(title)}`);
    for (const [name, desc, enabled] of items) {
      const icon = enabled ? pc.green("✅") : pc.red("❌");
      const label = enabled ? pc.white(name.padEnd(16)) : pc.dim(name.padEnd(16));
      console.log(`    ${icon} ${label} ${pc.dim(desc)}`);
    }
    console.log("");
  };

  printGroup("Core", [
    ["Artifacts", "Canonical hashing v3 (NFC + newline normalization)", true],
    ["Lineage", "Contamination detection, monotonic sequences", true],
    ["Determinism", "Reproducibility proof v0 (cross-platform CI)", true],
    ["Atomic writes", "Temp-file-and-rename with fsync", true],
    ["Workspace locks", "O_EXCL + PID liveness + deadlock ordering", true],
    ["Corruption", "27 machine-readable issue codes", true],
    ["Secret redaction", "All error paths masked", true],
    ["Mainnet guards", "Hard refusal without --allow-mainnet-signing", true],
  ]);

  printGroup("Simulation", [
    ["Localnet", "Simulated UTXO state + transactions", true],
    ["GHOSTDAG", "Approximate engine (RESEARCH_EXPERIMENTAL)", true],
    ["DAG conflicts", "GHOSTDAG-aligned blue/red ordering", true],
    ["Mass profiler", "Regression detection + snapshots", true],
    ["Scenarios", "Linear, wide, fork, diamond", true],
  ]);

  printGroup("Query & Replay", [
    ["Query store", "SQLite with forward-only migrations", true],
    ["Replay", "Local workflow verification", true],
    ["Migrations", "Checksummed, transactional", true],
  ]);

  printGroup("Infrastructure", [
    ["Docker node", "Pinned kaspad image on simnet", true],
    ["Script runner", "hardkas run script.ts via tsx", true],
    ["Testing", "Harness + 11 semantic matchers", true],
  ]);

  printGroup("L2", [
    ["Igra profiles", "Built-in + user config registry", true],
    ["Bridge model", "Pre-ZK phase awareness", true],
  ]);

  printGroup("Not Yet Implemented", [
    ["Consensus validation", "", false],
    ["Production wallet", "", false],
    ["SilverScript / covenants", "", false],
    ["Trustless exit", "(requires ZK bridge)", false],
    ["Differential DAG validation", "", false],
  ]);

  console.log(`  ${pc.bold("Trust Boundaries")}`);
  console.log(`    Replay:      ${pc.dim(caps.trustBoundaries.replay.replace(/-/g, " "))}`);
  console.log(`    Artifacts:   ${pc.dim(caps.trustBoundaries.artifacts.replace(/-/g, " "))}`);
  console.log(`    Simulator:   ${pc.dim(caps.trustBoundaries.simulator.replace(/-/g, " "))}`);
  console.log(`    Query store: ${pc.dim(caps.trustBoundaries.queryStore.replace(/-/g, " "))}`);
  console.log(`    L2 bridge:   ${pc.dim(caps.trustBoundaries.l2Bridge.replace(/-/g, " "))}`);
}
