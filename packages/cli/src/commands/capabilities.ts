import { Command } from "commander";
import pc from "picocolors";
import type { HardkasCapabilities } from "@hardkas/sdk";
import { getOutput } from "../output.js";

// SURFACE-TRUTH-1B (ST-A, D-ST1): the report is the SDK's (`HardkasCapabilitiesApi.get()`), derived from the checks the
// features themselves use. This command renders it and keeps no table of its own: it used to keep two literal ones (the
// JSON and a separate human table) that denied SilverScript and covenants, claimed L2 profiles and a bridge model the
// L1 core does not register, "hashing v3" and a "GHOSTDAG-aligned" ordering.

type CapabilityKey = keyof HardkasCapabilities["capabilities"];

export function registerCapabilitiesCommand(program: Command) {
  const capsCmd = program
    .command("capabilities", { hidden: true })
    .description("Show HardKAS capabilities and maturity level");

  capsCmd.hook("preAction", () => {
    if (!process.env.HARDKAS_EXPERIMENTAL) {
      getOutput().warn(
        "\n⚠️  WARNING: 'capabilities' command is internal/experimental. Set HARDKAS_EXPERIMENTAL=1 to acknowledge.\n"
      );
    }
  });

  capsCmd.option("--json", "Output as stable JSON schema", false).action(async (opts) => {
    const { HardkasCapabilitiesApi } = await import("@hardkas/sdk");
    // The workspace configuration, when there is one, as `Hardkas.open` would read it (a custom kaspa-wasm, an Igra
    // RPC URL); this command never bootstraps a workspace.
    let workspace: { config: unknown } | undefined;
    try {
      const { loadHardkasConfig } = await import("@hardkas/config");
      workspace = { config: await loadHardkasConfig() };
    } catch {
      workspace = undefined;
    }
    const caps = await new HardkasCapabilitiesApi(workspace).get();
    if (opts.json) {
      getOutput().writeJson(caps);
    } else {
      renderHumanReadable(caps);
    }
  });
}

/** Static entries: what this build contains. `hashVersion` is filled from the report. */
const BUILD_GROUPS = (caps: HardkasCapabilities): Array<[string, Array<[CapabilityKey, string, string]>]> => [
  [
    "Core",
    [
      ["artifacts", "Artifacts", `Canonical hashing v${caps.hashVersion} (NFC + newline normalization)`],
      ["lineageVerification", "Lineage", "Contamination detection, monotonic sequences"],
      ["deterministicHashing", "Determinism", "Reproducibility proof v0 (@hardkas/testing): same code + inputs, same contentHash"],
      ["atomicPersistence", "Atomic writes", "Temp-file-and-rename with fsync"],
      ["workspaceLocks", "Workspace locks", "O_EXCL + PID liveness + deadlock ordering"],
      ["corruptionDetection", "Corruption", "Machine-readable issue codes (hardkas verify, hardkas repair)"],
      ["secretRedaction", "Secret redaction", "Credentials redacted before they are persisted or printed"],
      ["mainnetGuards", "Mainnet guards", "Mainnet signing refused in this release"]
    ]
  ],
  [
    "Simulation",
    [
      ["localnetSimulation", "Localnet", "Simulated UTXO state + transactions"],
      ["ghostdagSimulation", "GHOSTDAG", "Approximate engine (research; no equivalence with rusty-kaspa claimed)"],
      ["dagConflictResolution", "DAG conflicts", "Double-spend conflict analysis on the light model (NOT GHOSTDAG)"],
      ["massProfiler", "Mass profiler", "@hardkas/simulator profiles + snapshots (library; `test --mass-*` has no effect)"],
      ["simulationScenarios", "Scenarios", "Linear, wide, fork, diamond"]
    ]
  ],
  [
    "Query & Replay",
    [
      ["queryStore", "Query store", "SQLite with forward-only migrations"],
      ["replayVerification", "Replay", "Simulator-mode receipts replayed locally (hardkas replay verify)"],
      ["schemaMigrations", "Migrations", "Checksummed, transactional"]
    ]
  ],
  [
    "Infrastructure",
    [
      ["dockerNode", "Docker node", "Pinned kaspad image on simnet"],
      ["scriptRunner", "Script runner", "hardkas run script.ts via tsx"],
      ["testingFramework", "Testing", "Harness + 11 semantic matchers"]
    ]
  ]
];

/** Entries checked in this environment: false means "not ready here" (with the reason), never "not implemented". */
/**
 * Entries checked in this environment, each with the concrete surface it covers (the report's `scopes`): the compiler,
 * the real covenant builders, and, on the covenant line, the SDK planning that is not supported. Never a generic
 * "covenants supported".
 */
const CHECKED = (caps: HardkasCapabilities): Array<[CapabilityKey & keyof NonNullable<HardkasCapabilities["reasons"]>, string, string]> => [
  ["silverScript", "SilverScript", caps.scopes?.silverScript ?? "managed silverc (hardkas silver compile)"],
  [
    "covenants",
    "Covenants",
    `${caps.scopes?.covenants ?? "1:1 auth-bound transitions (hardkas silver covenant genesis|transition)"}; SDK planning ${caps.scopes?.sdkCovenantPlanning ?? "not supported"}`
  ],
  ["transactionV1", "Transaction v1", "the loaded kaspa-wasm signs v1"]
];

const NOT_IN_THIS_BUILD: Array<[CapabilityKey, string, string]> = [
  ["consensusValidation", "Consensus validation", ""],
  ["productionWallet", "Production wallet", ""],
  ["trustlessExit", "Trustless exit", ""],
  ["differentialDagValidation", "Differential DAG validation", ""],
  ["l2Profiles", "L2 profiles", "Igra is a Lab, not the L1 core (the SDK still lists its profiles; L2 operations refuse)"],
  ["l2BridgeAssumptions", "Bridge model", "a Lab, not the L1 core"]
];

function renderHumanReadable(caps: HardkasCapabilities) {
  const out = getOutput();
  out.writeLine(`${pc.bold("HardKAS")} ${pc.cyan("v" + caps.version)} — ${pc.green("Hardened Alpha")}\n`);

  const line = (icon: string, name: string, desc: string, dim = false) =>
    out.writeLine(`    ${icon} ${dim ? pc.dim(name.padEnd(16)) : pc.white(name.padEnd(16))} ${pc.dim(desc)}`);

  for (const [title, rows] of BUILD_GROUPS(caps)) {
    out.writeLine(`  ${pc.bold(title)}`);
    for (const [key, name, desc] of rows) {
      line(caps.capabilities[key] ? pc.green("✅") : pc.red("❌"), name, desc, !caps.capabilities[key]);
    }
    out.writeLine("");
  }

  out.writeLine(`  ${pc.bold("Programmability (checked here)")}`);
  for (const [key, name, desc] of CHECKED(caps)) {
    if (caps.capabilities[key]) line(pc.green("✅"), name, desc);
    else line(pc.yellow("○ "), name, `${desc}; not ready here: ${caps.reasons?.[key] ?? "not checked"}`);
  }
  out.writeLine("");

  const node = caps.runtimeMatrix?.node;
  if (node) {
    out.writeLine(`  ${pc.bold("Canonical node")}`);
    out.writeLine(
      node.version === "unknown"
        ? `    ${pc.dim("not observed: no node proved its identity, so none is reported as Toccata-capable")}`
        : `    rusty-kaspad ${node.version}: Toccata ${node.toccata ? "yes" : "no"}, covenants ${node.covenants ? "yes" : "no"}`
    );
    out.writeLine("");
  }

  out.writeLine(`  ${pc.bold("Not in this build")}`);
  for (const [key, name, desc] of NOT_IN_THIS_BUILD) {
    line(caps.capabilities[key] ? pc.green("✅") : pc.red("❌"), name, desc, !caps.capabilities[key]);
  }
  out.writeLine("");

  out.writeLine(`  ${pc.bold("Trust Boundaries")}`);
  out.writeLine(`    Replay:      ${pc.dim(caps.trustBoundaries.replay.replace(/-/g, " "))}`);
  out.writeLine(`    Artifacts:   ${pc.dim(caps.trustBoundaries.artifacts.replace(/-/g, " "))}`);
  out.writeLine(`    Simulator:   ${pc.dim(caps.trustBoundaries.simulator.replace(/-/g, " "))}`);
  out.writeLine(`    Query store: ${pc.dim(caps.trustBoundaries.queryStore.replace(/-/g, " "))}`);
  out.writeLine(`    L2 bridge:   ${pc.dim(`${caps.trustBoundaries.l2Bridge.replace(/-/g, " ")} (a Lab, not the L1 core)`)}`);
}
