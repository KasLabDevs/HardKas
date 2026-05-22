import { Hono } from "hono";
import { loadHardkasConfig } from "@hardkas/config";
import { getQueryBackend } from "../db.js";
import { listHardkasAccounts } from "@hardkas/accounts";
import path from "node:path";

export const overviewRoutes = new Hono();

overviewRoutes.get("/", async (c) => {
  const { config } = await loadHardkasConfig();
  const queryBackend = getQueryBackend();

  const projectName = (config as any).project?.name || path.basename(process.cwd());
  const network = config.defaultNetwork || "simulated";

  // Replay status
  let replayStatus = "NONE";
  let replayCount = 0;
  try {
    const replays = await queryBackend.findArtifacts({ schema: "hardkas.replayReport.v1" });
    replayCount = replays.length;
    if (replays.length > 0) {
      const allPassed = replays.every(r => r.payload.planOk && r.payload.receiptOk && r.payload.invariantsOk);
      replayStatus = allPassed ? "PASS" : "FAIL";
    }
  } catch (e) {
    console.error("Failed to query replay artifacts:", e);
  }

  // Counts
  let txCount = 0;
  let artifactCount = 0;
  let deploymentCount = 0;
  let accountCount = 0;

  try {
    const allArtifacts = await queryBackend.findArtifacts();
    artifactCount = allArtifacts.length;

    // Unique transaction IDs from receipts or plans
    const txIds = new Set<string>();
    for (const art of allArtifacts) {
      if (
        art.schema.startsWith("hardkas.txReceipt") ||
        art.schema.startsWith("hardkas.igraTxReceipt") ||
        art.schema.startsWith("hardkas.txPlan") ||
        art.schema.startsWith("hardkas.igraTxPlan")
      ) {
        if (art.txId) txIds.add(art.txId);
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

  return c.json({
    projectName,
    network,
    replayStatus,
    counts: {
      transactions: txCount,
      artifacts: artifactCount,
      deployments: deploymentCount,
      accounts: accountCount,
      replays: replayCount
    }
  });
});
