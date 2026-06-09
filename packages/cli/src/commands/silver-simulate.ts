// @ts-nocheck
import { Command } from "commander";
import pc from "picocolors";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createSilverSimulationState,
  simulateSilverDeploy,
  simulateSilverSpend,
  SilverSimulationError
} from "@hardkas/simulator";

const STATE_PATH = path.join(".hardkas", "silver-simulator", "state.json");

export function getSilverSimulateCommand() {
  const cmd = new Command("simulate")
    .description("Local SilverScript/Toccata artifact lifecycle simulator");

  cmd.command("deploy")
    .argument("<deploy-plan>")
    .description("Simulate a SilverScript deploy plan without RPC")
    .action(async (deployPlanPath) => {
      try {
        const { writeArtifact } = await import("@hardkas/artifacts");
        const deployPlan = readJson(deployPlanPath);
        const result = simulateSilverDeploy(deployPlan);

        const mergedState = mergeState(loadState(), result.state);
        saveState(mergedState);

        const outPath = path.resolve(process.cwd(), `${result.receipt.artifactId}.json`);
        await writeArtifact(outPath, result.receipt);

        console.log(pc.green("SIMULATED_ACCEPTED"));
        console.log(`Artifact: ${pc.bold(outPath)}`);
        console.log(`State:    ${pc.dim(path.resolve(process.cwd(), STATE_PATH))}`);
      } catch (error) {
        handleSilverSimulationError(error);
      }
    });

  cmd.command("spend")
    .argument("<spend-plan>")
    .description("Simulate spending a SilverScript synthetic UTXO")
    .action(async (spendPlanPath) => {
      try {
        const { writeArtifact } = await import("@hardkas/artifacts");
        const spendPlan = readJson(spendPlanPath);
        const state = loadState();
        const result = simulateSilverSpend(spendPlan, state);

        saveState(result.state);

        const outPath = path.resolve(process.cwd(), `${result.receipt.artifactId}.json`);
        await writeArtifact(outPath, result.receipt);

        console.log(pc.green("SIMULATED_ACCEPTED"));
        console.log(`Artifact: ${pc.bold(outPath)}`);
        console.log(`State:    ${pc.dim(path.resolve(process.cwd(), STATE_PATH))}`);
      } catch (error) {
        handleSilverSimulationError(error);
      }
    });

  cmd.command("compare")
    .description("Compare simulated SilverScript receipt with Docker/node receipt")
    .requiredOption("--simulated <receipt>", "Simulated receipt artifact")
    .requiredOption("--docker <receipt>", "Docker/node receipt artifact")
    .option(
      "--mode <mode>",
      "Comparison mode: artifact-coherence, runtime-outcome, strict",
      "artifact-coherence"
    )
    .action((opts) => {
      const simulated = readJson(opts.simulated);
      const docker = readJson(opts.docker);
      const mode = normalizeCompareMode(opts.mode);

      const report = compareSilverReceipts(simulated, docker, mode);

      if (report.drift.length === 0) {
        console.log(pc.green("SILVERSCRIPT_SIMULATION_MATCH"));
      } else {
        console.log(pc.yellow("SILVERSCRIPT_SIMULATION_DRIFT"));
        for (const entry of report.drift) {
          console.log(`- ${entry.field}: ${entry.reason}`);
        }
      }

      if (report.notes.length > 0) {
        console.log(pc.dim("Comparison notes:"));
        for (const note of report.notes) {
          console.log(pc.dim(`- ${note.field}: ${note.reason}`));
        }
      }

      console.log(pc.dim("PARTIAL_VM_SIMULATION"));
    });

  return cmd;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), filePath), "utf8"));
}

function loadState() {
  const fullPath = path.resolve(process.cwd(), STATE_PATH);
  if (!fs.existsSync(fullPath)) return createSilverSimulationState();
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function saveState(state: any) {
  const fullPath = path.resolve(process.cwd(), STATE_PATH);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function mergeState(existing: any, next: any) {
  return {
    ...next,
    deployReceipts: {
      ...(existing.deployReceipts || {}),
      ...(next.deployReceipts || {})
    },
    utxos: {
      ...(existing.utxos || {}),
      ...(next.utxos || {})
    },
    spentOutpoints: Array.from(
      new Set([...(existing.spentOutpoints || []), ...(next.spentOutpoints || [])])
    ).sort()
  };
}

function handleSilverSimulationError(error: unknown): never {
  if (error instanceof SilverSimulationError) {
    console.error(pc.red(error.code));
    console.error(pc.dim(error.message));
    process.exit(1);
  }
  throw error;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function valuesMatch(field: string, simulated: unknown, docker: unknown): boolean {
  if (field === "status") {
    return simulated === docker ||
      (simulated === "SIMULATED_ACCEPTED" && (docker === "accepted" || docker === "submitted"));
  }
  return stableJson(simulated) === stableJson(docker);
}

type SilverCompareMode = "artifact-coherence" | "runtime-outcome" | "strict";

interface SilverCompareEntry {
  field: string;
  reason: string;
  classification:
    | "MATCH"
    | "MISSING_IN_SIM"
    | "MISSING_IN_REAL"
    | "SEMANTIC_MISMATCH"
    | "SEMANTICALLY_DERIVED"
    | "IGNORED_NON_CONSENSUS";
}

function normalizeCompareMode(mode: unknown): SilverCompareMode {
  if (mode === "artifact-coherence" || mode === "runtime-outcome" || mode === "strict") {
    return mode;
  }
  throw new Error(
    `SILVERSCRIPT_COMPARE_MODE_INVALID: Expected artifact-coherence, runtime-outcome, or strict.`
  );
}

function compareSilverReceipts(simulated: any, docker: any, mode: SilverCompareMode) {
  const drift: SilverCompareEntry[] = [];
  const notes: SilverCompareEntry[] = [];
  const fields = [
    "redeemScriptHash",
    "lockingScriptHex",
    "signatureScriptHex",
    "expectedOutputs",
    "status"
  ];

  if (mode === "runtime-outcome" || mode === "strict") {
    fields.push("networkId", "spentOutpoint");
  }
  if (mode === "strict") {
    fields.push("lineage", "txId", "simulatedSpendTxId");
  }

  for (const field of fields) {
    const entry = compareField(field, simulated[field], docker[field]);
    if (entry.classification === "MATCH") continue;

    const nonConsensusRuntimeIds =
      mode === "runtime-outcome" &&
      (field === "spentOutpoint" || field === "txId" || field === "simulatedSpendTxId");
    if (nonConsensusRuntimeIds) {
      notes.push({
        ...entry,
        classification: "SEMANTICALLY_DERIVED",
        reason: "synthetic simulator runtime identifier differs from Docker-observed runtime identifier"
      });
      continue;
    }

    drift.push(entry);
  }

  if (mode !== "strict") {
    const lineageReport = compareLineageSemantics(simulated, docker, mode);
    drift.push(...lineageReport.drift);
    notes.push(...lineageReport.notes);
  }

  return { drift, notes };
}

function compareField(field: string, simulatedValue: unknown, dockerValue: unknown): SilverCompareEntry {
  const simulatedMissing = simulatedValue === undefined;
  const dockerMissing = dockerValue === undefined;
  if (simulatedMissing) {
    return {
      field,
      reason: "missing in simulated receipt",
      classification: "MISSING_IN_SIM"
    };
  }
  if (dockerMissing) {
    return {
      field,
      reason: "missing in docker receipt",
      classification: "MISSING_IN_REAL"
    };
  }
  if (valuesMatch(field, simulatedValue, dockerValue)) {
    return {
      field,
      reason: "match",
      classification: "MATCH"
    };
  }
  return {
    field,
    reason: "semantic mismatch",
    classification: "SEMANTIC_MISMATCH"
  };
}

function compareLineageSemantics(simulated: any, docker: any, mode: SilverCompareMode) {
  const drift: SilverCompareEntry[] = [];
  const notes: SilverCompareEntry[] = [];
  const simulatedLineage = simulated.lineage;
  const dockerLineage = docker.lineage;

  if (!simulatedLineage) {
    drift.push({
      field: "lineage",
      reason: "missing in simulated receipt",
      classification: "MISSING_IN_SIM"
    });
    return { drift, notes };
  }
  if (!dockerLineage) {
    drift.push({
      field: "lineage",
      reason: "missing in docker receipt",
      classification: "MISSING_IN_REAL"
    });
    return { drift, notes };
  }

  const semanticChecks = [
    {
      field: "lineage.redeemScriptHash",
      simulated: simulated.redeemScriptHash,
      docker: docker.redeemScriptHash,
      reason: "redeem script hash anchors artifact coherence"
    },
    {
      field: "lineage.lockingScriptHex",
      simulated: simulated.lockingScriptHex,
      docker: docker.lockingScriptHex,
      reason: "locking script anchors artifact coherence"
    },
    {
      field: "lineage.signatureScriptHex",
      simulated: simulated.signatureScriptHex,
      docker: docker.signatureScriptHex,
      reason: "unlock script anchors artifact coherence"
    },
    {
      field: "lineage.expectedOutputs",
      simulated: simulated.expectedOutputs,
      docker: docker.expectedOutputs,
      reason: "expected outputs anchor artifact coherence"
    },
    {
      field: "lineage.network",
      simulated: simulated.networkId,
      docker: docker.networkId,
      reason: "network must match"
    }
  ];

  for (const check of semanticChecks) {
    const entry = compareField(check.field, check.simulated, check.docker);
    if (entry.classification !== "MATCH") {
      drift.push({
        ...entry,
        reason: check.reason
      });
    }
  }

  const deployHashEntry = compareDeploySource(simulated, docker);
  if (deployHashEntry) notes.push(deployHashEntry);

  const spendPlanHashEntry = compareSpendPlanSource(simulated, docker);
  if (spendPlanHashEntry) notes.push(spendPlanHashEntry);

  notes.push({
    field: "lineage.blob",
    reason:
      mode === "artifact-coherence"
        ? "raw lineage IDs are domain-specific: simulator lineage is synthetic, Docker lineage is receipt artifact lineage"
        : "raw lineage IDs are compared by semantic anchors; VM/consensus lineage equivalence is not claimed",
    classification: "SEMANTICALLY_DERIVED"
  });

  if (simulated.simulatedSpendTxId || docker.txId) {
    notes.push({
      field: "lineage.runtime.txid",
      reason: "simulatedSpendTxId and Docker txId are intentionally different runtime identifiers",
      classification: "IGNORED_NON_CONSENSUS"
    });
  }
  if (simulated.spentOutpoint || docker.spentOutpoint) {
    notes.push({
      field: "lineage.runtime.spentOutpoint",
      reason: "synthetic simulator outpoint and Docker-observed outpoint are compared as runtime metadata, not consensus equivalence",
      classification: "IGNORED_NON_CONSENSUS"
    });
  }

  return { drift, notes };
}

function compareDeploySource(simulated: any, docker: any): SilverCompareEntry | undefined {
  if (!simulated.deploySimulationHash && !docker.deployArtifactHash) return undefined;
  if (!simulated.deploySimulationHash) {
    return {
      field: "lineage.source.deploySimulationHash",
      reason: "missing in simulated receipt",
      classification: "MISSING_IN_SIM"
    };
  }
  if (!docker.deployArtifactHash) {
    return {
      field: "lineage.source.deployArtifactHash",
      reason: "missing in docker receipt",
      classification: "MISSING_IN_REAL"
    };
  }
  return {
    field: "lineage.source.deploy",
    reason: "simulator references deploySimulationHash; Docker references real deployArtifactHash",
    classification: "SEMANTICALLY_DERIVED"
  };
}

function compareSpendPlanSource(simulated: any, docker: any): SilverCompareEntry | undefined {
  if (!simulated.spendPlanHash && !docker.spendPlanHash) return undefined;
  if (!simulated.spendPlanHash) {
    return {
      field: "lineage.source.spendPlanHash",
      reason: "missing in simulated receipt",
      classification: "MISSING_IN_SIM"
    };
  }
  if (!docker.spendPlanHash) {
    return {
      field: "lineage.source.spendPlanHash",
      reason: "missing in docker receipt",
      classification: "MISSING_IN_REAL"
    };
  }
  if (simulated.spendPlanHash === docker.spendPlanHash) {
    return {
      field: "lineage.source.spendPlanHash",
      reason: "spend plan hash matches",
      classification: "MATCH"
    };
  }
  return {
    field: "lineage.source.spendPlanHash",
    reason: "simulator spend plan hash is derived from synthetic outpoint normalization; Docker spend plan hash is derived from real outpoint",
    classification: "SEMANTICALLY_DERIVED"
  };
}
