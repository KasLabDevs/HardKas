import { Hono } from "hono";
import { loadHardkasConfig } from "@hardkas/config";
import { getQueryBackend } from "../db.js";
import { listHardkasAccounts } from "@hardkas/accounts";
import path from "node:path";

export const overviewRoutes = new Hono();

overviewRoutes.get("/", async (c) => {
  const { config } = await loadHardkasConfig();
  const queryBackend = getQueryBackend();

  const workspaceRoot = process.cwd();
  const artifactDir = ".hardkas/artifacts";
  const queryStorePath = ".hardkas/store.db";

  const projectName = (config as any).project?.name || path.basename(workspaceRoot);
  const network = config.defaultNetwork || "simulated";

  // Replay status & Pending Replays
  let replayStatus = "NONE";
  let replayCount = 0;
  let pendingReplays = 0;
  try {
    const replays = await queryBackend.findArtifacts({
      schema: "hardkas.replayReport.v1"
    });
    const receipts = await queryBackend.findArtifacts({ schema: "hardkas.txReceipt.v1" });

    replayCount = replays.length;
    if (replays.length > 0) {
      const allPassed = replays.every(
        (r) => r.payload.planOk && r.payload.receiptOk && r.payload.invariantsOk
      );
      replayStatus = allPassed ? "PASS" : "FAIL";
    }

    const replayTxIds = new Set(replays.map((r) => r.payload.txId));
    pendingReplays = receipts.filter(
      (r) => r.payload.status === "confirmed" && !replayTxIds.has(r.payload.txId)
    ).length;
  } catch (e) {
    console.error("Failed to query replay artifacts:", e);
  }

  // Counts
  let txCount = 0;
  let artifactCount = 0;
  let corruptedCount = 0;
  let deploymentCount = 0;
  let accountCount = 0;
  let eventCount = 0;

  try {
    const allArtifacts = await queryBackend.findArtifacts();
    artifactCount = allArtifacts.length;
    corruptedCount = allArtifacts.filter((a) => a.kind === "CORRUPTED").length;

    // Unique transaction IDs from receipts or plans
    const txIds = new Set<string>();
    for (const art of allArtifacts) {
      if (
        art.schema.startsWith("hardkas.txReceipt") ||
        art.schema.startsWith("hardkas.igraTxReceipt") ||
        art.schema.startsWith("hardkas.txPlan") ||
        art.schema.startsWith("hardkas.igraTxPlan")
      ) {
        if (art.payload?.txId) txIds.add(art.payload.txId);
      }
      if (art.schema.startsWith("hardkas.deployment")) {
        deploymentCount++;
      }
    }
    txCount = txIds.size;
  } catch (e) {
    console.error("Failed to query artifacts for counts:", e);
  }

  try {
    const accounts = listHardkasAccounts(config);
    accountCount = accounts.length;
  } catch (e) {
    console.error("Failed to list accounts:", e);
  }

  try {
    const events = await queryBackend.getEvents();
    eventCount = events.length;
  } catch (e) {
    console.error("Failed to query events:", e);
  }

  // SEMANTIC STATE ENGINE
  type RuntimeSemanticState =
    | "EMPTY"
    | "ACTIVE"
    | "PENDING"
    | "DEGRADED"
    | "CORRUPTED"
    | "VERIFIED";

  let runtimeState: RuntimeSemanticState = "ACTIVE";
  let runtimeReason = "Runtime data exists.";
  let recommendedAction = "hardkas tx send";

  // Check if projection is degraded (missing projections in SQLite but files exist on disk)
  let isDegraded = false;
  try {
    const fs = await import("node:fs");
    const artifactsDiskDir = path.join(workspaceRoot, ".hardkas", "artifacts");
    if (fs.existsSync(artifactsDiskDir)) {
      const files = fs.readdirSync(artifactsDiskDir).filter((f) => f.endsWith(".json"));
      if (files.length > 0 && artifactCount === 0) {
        isDegraded = true;
      }
    }
  } catch (e) {}

  if (corruptedCount > 0 || replayStatus === "FAIL") {
    runtimeState = "CORRUPTED";
    runtimeReason =
      replayStatus === "FAIL"
        ? "Replay verification failed."
        : "Artifact integrity failed. Deterministic replay is unsafe.";
    recommendedAction = "hardkas doctor --consistency --strict";
  } else if (isDegraded) {
    runtimeState = "DEGRADED";
    runtimeReason =
      "Projection cache (SQLite) is missing or out of sync with filesystem artifacts.";
    recommendedAction = "hardkas query store rebuild";
  } else if (
    artifactCount === 0 &&
    eventCount === 0 &&
    txCount === 0 &&
    replayCount === 0
  ) {
    runtimeState = "EMPTY";
    runtimeReason =
      "Workspace initialized. No deterministic activity has been recorded yet.";
    recommendedAction = "hardkas tx send --from alice --to bob --amount 10 --yes";
  } else if (artifactCount > 0 && replayCount === 0) {
    runtimeState = "PENDING";
    runtimeReason = "Artifacts exist, but local replay verification has not run yet.";
    recommendedAction = "hardkas replay verify";
  } else if (pendingReplays > 0) {
    runtimeState = "PENDING";
    runtimeReason = "Unverified transaction receipts exist.";
    recommendedAction = "hardkas replay verify";
  } else if (replayCount > 0 && pendingReplays === 0 && corruptedCount === 0) {
    runtimeState = "VERIFIED";
    runtimeReason = "Local deterministic runtime is consistent.";
    recommendedAction = "hardkas dashboard";
  } else if (artifactCount > 0 && eventCount === 0) {
    runtimeState = "ACTIVE";
    runtimeReason = "causal_events_not_recorded";
    recommendedAction = "hardkas dashboard";
  }

  const guarantees = {
    artifactIntegrity: corruptedCount === 0 ? "available" : "failed",
    localReplay:
      replayCount > 0 ? (replayStatus === "PASS" ? "verified" : "failed") : "not_checked",
    consensusValidated: false,
    networkFinality: false
  };

  return c.json({
    projectName,
    network,
    workspaceRoot,
    artifactDir,
    queryStorePath,
    runtimeState,
    runtimeReason,
    recommendedAction,
    counts: {
      artifacts: artifactCount,
      transactions: txCount,
      events: eventCount,
      replays: replayCount,
      pendingReplays,
      corruptedArtifacts: corruptedCount,
      degradedProjections: 0 // Placeholder until explicit queries support it
    },
    guarantees
  });
});
