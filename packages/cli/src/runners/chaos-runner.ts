import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UI } from "../ui.js";
import { ChaosExitCodes } from "../commands/chaos.js";
import {
  LockHell,
  RotBot,
  DriftHunter,
  HumanChaos,
  type ChaosActor
} from "./chaos-actors.js";
import pc from "picocolors";

const ACTORS: Record<string, ChaosActor> = {
  LockHell,
  RotBot,
  DriftHunter,
  HumanChaos
};

const PROFILES: Record<string, { actor: string; weight: number }[]> = {
  smoke: [
    { actor: "LockHell", weight: 40 },
    { actor: "RotBot", weight: 25 },
    { actor: "DriftHunter", weight: 20 },
    { actor: "HumanChaos", weight: 15 }
  ],
  targeted: [
    { actor: "LockHell", weight: 40 },
    { actor: "RotBot", weight: 25 },
    { actor: "DriftHunter", weight: 20 },
    { actor: "HumanChaos", weight: 15 }
  ],
  full: [
    { actor: "LockHell", weight: 40 },
    { actor: "RotBot", weight: 25 },
    { actor: "DriftHunter", weight: 20 },
    { actor: "HumanChaos", weight: 15 }
  ]
};

function selectActor(seed: number, profileName: string): string {
  const profile = PROFILES[profileName] || PROFILES.smoke || [];
  if (profile.length === 0) return "LockHell";
  const totalWeight = profile.reduce((acc, p) => acc + p.weight, 0);
  let r = seed % totalWeight;
  for (const p of profile) {
    if (r < p.weight) return p.actor;
    r -= p.weight;
  }
  return profile[0]!.actor;
}

/**
 * ESCALÓN 3 · P20: a campaign (or a replay) runs in a directory it creates itself under the OS temp dir
 * (`hardkas-chaos-XXXXXX`, new and empty: mkdtemp). It used to delete ./.hardkas-chaos and ./.hardkas-chaos-workspace in
 * the current directory, without asking, whatever they held, and its actors then ran inside the user's project. The
 * only path a run ever deletes is the `workspace` it created there; the reports stay in `<run dir>/reports`.
 */
export async function createChaosRunDir(): Promise<{ runDir: string; workspaceDir: string; reportsDir: string }> {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-chaos-"));
  const workspaceDir = path.join(runDir, "workspace");
  const reportsDir = path.join(runDir, "reports");
  // Initialize a dummy project
  await fs.mkdir(path.join(workspaceDir, ".hardkas", "keystore"), { recursive: true });
  await fs.mkdir(path.join(reportsDir, "repro"), { recursive: true });
  return { runDir, workspaceDir, reportsDir };
}

/** Deletes the workspace a run created inside its own run directory, and nothing else. */
async function removeOwnWorkspace(runDir: string, workspaceDir: string): Promise<void> {
  if (path.dirname(workspaceDir) !== runDir) throw new Error(`refusing to delete ${workspaceDir}: not this run's workspace`);
  await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
}

export async function runChaosEngine(options: any) {
  const runs = parseInt(options.runs, 10);
  const globalSeed = parseInt(options.seed, 10);
  const profile = options.profile;

  const { runDir, workspaceDir, reportsDir } = await createChaosRunDir();

  UI.box(
    "HardKAS Chaos Engine",
    `Campaign Seed: ${globalSeed} | Runs: ${runs} | Profile: ${options.actor || profile}`
  );

  let failedRuns = 0;
  const results = [];

  for (let i = 0; i < runs; i++) {
    const runSeed = globalSeed + i * 13; // deterministic progression
    const actorName = options.actor || selectActor(runSeed, profile);
    const actor = ACTORS[actorName];

    if (!actor) {
      throw {
        message: `Unknown chaos actor: ${actorName}`,
        exitCode: ChaosExitCodes.INTERNAL_FAILURE
      };
    }

    const { stdout, stderr, exitCode, action, expectedExitCodes } = await actor({
      workspaceDir,
      runId: i,
      runSeed
    });

    // Check for raw stack traces (fail condition even if exitCode is 0)
    // We look for \n    at  which is the classic Node.js stack trace frame format
    const combinedLog = stdout + "\n" + stderr;
    const hasRawStack =
      /\n\s+at .+\(.*\)/.test(combinedLog) ||
      /\n\s+at .+[a-zA-Z0-9_\.]/.test(combinedLog) ||
      /UnhandledPromiseRejectionWarning:/.test(combinedLog);

    const isExitFailure =
      exitCode !== 0 && (!expectedExitCodes || !expectedExitCodes.includes(exitCode));
    const isFailure = hasRawStack || isExitFailure;

    const runResult = {
      campaignSeed: globalSeed,
      runId: i,
      runSeed,
      actor: actorName,
      action,
      failed: isFailure,
      hasRawStack,
      exitCode,
      expectedExitCodes,
      stdout,
      stderr
    };

    results.push(runResult);

    if (isFailure) {
      failedRuns++;
      const reproScript = `#!/bin/bash\n# Repro for Run ${i} (Seed: ${runSeed})\n# Actor: ${actorName}\n# Action: ${action}\npnpm hardkas chaos replay --run-seed ${runSeed} --isolate\n`;
      await fs.writeFile(
        path.join(reportsDir, "repro", `run-${String(i).padStart(4, "0")}.sh`),
        reproScript
      );

      const failureReason = hasRawStack
        ? "Raw stack trace detected!"
        : `Unexpected exit code ${exitCode}!`;
      console.log(pc.red(`✖ Run ${i} FAILED (${actorName}) - ${failureReason}`));
    } else {
      process.stdout.write(pc.green("."));
    }
  }

  console.log("\n");

  const reportFile = path.join(reportsDir, "chaos-report.json");
  const summaryFile = path.join(reportsDir, "chaos-summary.md");

  await fs.writeFile(reportFile, JSON.stringify(results, null, 2));

  const summary = `# Chaos Campaign Summary
- **Seed**: ${globalSeed}
- **Runs**: ${runs}
- **Failed**: ${failedRuns}

## Failed Runs
${results
  .filter((r) => r.failed)
  .map((r) => `- Run ${r.runId} (${r.actor}): ${r.action}`)
  .join("\n")}
`;
  await fs.writeFile(summaryFile, summary);
  await removeOwnWorkspace(runDir, workspaceDir);
  UI.info(`Chaos reports: ${reportsDir}`);

  if (failedRuns > 0) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "CHAOS_CAMPAIGN_FAILED",
      `Chaos campaign completed with ${failedRuns} failures. See ${reportsDir} for details.`,
      { exitCode: ChaosExitCodes.INVARIANT_VIOLATION }
    );
  } else {
    UI.success(
      `Chaos campaign completed successfully. 0 failures detected across ${runs} runs.`
    );
    return;
  }
}

export async function replayChaosRun(options: any) {
  const runSeed = parseInt(options.runSeed, 10);
  const profile = options.profile || "smoke";
  const actorName = options.actor || selectActor(runSeed, profile);
  const actor = ACTORS[actorName];

  if (!actor) {
    throw {
      message: `Unknown chaos actor: ${actorName}`,
      exitCode: ChaosExitCodes.INTERNAL_FAILURE
    };
  }

  // ESCALÓN 3 · P20: a fresh directory of its own under the OS temp dir, never the current directory
  const { runDir, workspaceDir } = await createChaosRunDir();

  UI.info(`Replaying chaos run with seed ${runSeed} via actor ${actorName}...`);
  let replayed: Awaited<ReturnType<ChaosActor>>;
  try {
    replayed = await actor({
      workspaceDir,
      runId: 0,
      runSeed
    });
  } finally {
    await removeOwnWorkspace(runDir, workspaceDir);
    await fs.rm(runDir, { recursive: true, force: true }).catch(() => {});
  }
  const { stdout, stderr, exitCode, action, expectedExitCodes } = replayed;

  console.log(pc.cyan(`\n--- Action Executed ---`));
  console.log(action);

  console.log(pc.cyan(`\n--- STDOUT ---`));
  console.log(stdout);

  console.log(pc.cyan(`\n--- STDERR ---`));
  console.log(stderr);

  console.log(pc.cyan(`\n--- EXIT CODE: ${exitCode} ---`));

  const combinedLog = stdout + "\n" + stderr;
  const hasRawStack =
    /\n\s+at .+\(.*\)/.test(combinedLog) ||
    /\n\s+at .+[a-zA-Z0-9_\.]/.test(combinedLog) ||
    /UnhandledPromiseRejectionWarning:/.test(combinedLog);

  const isExitFailure =
    exitCode !== 0 && (!expectedExitCodes || !expectedExitCodes.includes(exitCode));
  const isFailure = hasRawStack || isExitFailure;

  if (isFailure) {
    const failureReason = hasRawStack
      ? "Raw stack trace detected."
      : `Unexpected exit code ${exitCode}.`;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("REPLAY_FAILED", `Replay failed: ${failureReason}`, {
      exitCode: ChaosExitCodes.INVARIANT_VIOLATION
    });
  } else {
    UI.success("Replay completed cleanly.");
    return;
  }
}
