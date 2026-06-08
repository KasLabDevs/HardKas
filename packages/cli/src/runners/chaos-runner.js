import fs from "node:fs/promises";
import path from "node:path";
import { UI } from "../ui.js";
import { ChaosExitCodes } from "../commands/chaos.js";
import { LockHell, RotBot, DriftHunter, HumanChaos } from "./chaos-actors.js";
import pc from "picocolors";
const ACTORS = {
    LockHell,
    RotBot,
    DriftHunter,
    HumanChaos
};
const PROFILES = {
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
function selectActor(seed, profileName) {
    const profile = PROFILES[profileName] || PROFILES.smoke || [];
    if (profile.length === 0)
        return "LockHell";
    const totalWeight = profile.reduce((acc, p) => acc + p.weight, 0);
    let r = seed % totalWeight;
    for (const p of profile) {
        if (r < p.weight)
            return p.actor;
        r -= p.weight;
    }
    return profile[0].actor;
}
export async function runChaosEngine(options) {
    const runs = parseInt(options.runs, 10);
    const globalSeed = parseInt(options.seed, 10);
    const profile = options.profile;
    const isolate = options.isolate;
    const originalCwd = process.cwd();
    const workspaceDir = isolate
        ? path.join(originalCwd, ".hardkas-chaos-workspace")
        : originalCwd;
    if (isolate) {
        await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => { });
        await fs.mkdir(workspaceDir, { recursive: true });
        // Initialize a dummy project
        await fs.mkdir(path.join(workspaceDir, ".hardkas", "keystore"), { recursive: true });
    }
    const reportsDir = path.join(originalCwd, ".hardkas-chaos");
    await fs.rm(reportsDir, { recursive: true, force: true }).catch(() => { });
    await fs.mkdir(path.join(reportsDir, "repro"), { recursive: true });
    UI.box("HardKAS Chaos Engine", `Campaign Seed: ${globalSeed} | Runs: ${runs} | Profile: ${options.actor || profile}`);
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
        const hasRawStack = /\n\s+at .+\(.*\)/.test(combinedLog) ||
            /\n\s+at .+[a-zA-Z0-9_\.]/.test(combinedLog) ||
            /UnhandledPromiseRejectionWarning:/.test(combinedLog);
        const isExitFailure = exitCode !== 0 && (!expectedExitCodes || !expectedExitCodes.includes(exitCode));
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
            await fs.writeFile(path.join(reportsDir, "repro", `run-${String(i).padStart(4, "0")}.sh`), reproScript);
            const failureReason = hasRawStack
                ? "Raw stack trace detected!"
                : `Unexpected exit code ${exitCode}!`;
            console.log(pc.red(`✖ Run ${i} FAILED (${actorName}) - ${failureReason}`));
        }
        else {
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
    if (failedRuns > 0) {
        UI.error(`Chaos campaign completed with ${failedRuns} failures. See ${reportsDir} for details.`);
        process.exit(ChaosExitCodes.INVARIANT_VIOLATION);
    }
    else {
        UI.success(`Chaos campaign completed successfully. 0 failures detected across ${runs} runs.`);
        process.exit(ChaosExitCodes.NO_FINDINGS);
    }
}
export async function replayChaosRun(options) {
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
    const workspaceDir = options.isolate
        ? path.join(process.cwd(), ".hardkas-chaos-workspace")
        : process.cwd();
    if (options.isolate) {
        await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => { });
        await fs.mkdir(workspaceDir, { recursive: true });
        await fs.mkdir(path.join(workspaceDir, ".hardkas", "keystore"), { recursive: true });
    }
    UI.info(`Replaying chaos run with seed ${runSeed} via actor ${actorName}...`);
    const { stdout, stderr, exitCode, action, expectedExitCodes } = await actor({
        workspaceDir,
        runId: 0,
        runSeed
    });
    console.log(pc.cyan(`\n--- Action Executed ---`));
    console.log(action);
    console.log(pc.cyan(`\n--- STDOUT ---`));
    console.log(stdout);
    console.log(pc.cyan(`\n--- STDERR ---`));
    console.log(stderr);
    console.log(pc.cyan(`\n--- EXIT CODE: ${exitCode} ---`));
    const combinedLog = stdout + "\n" + stderr;
    const hasRawStack = /\n\s+at .+\(.*\)/.test(combinedLog) ||
        /\n\s+at .+[a-zA-Z0-9_\.]/.test(combinedLog) ||
        /UnhandledPromiseRejectionWarning:/.test(combinedLog);
    const isExitFailure = exitCode !== 0 && (!expectedExitCodes || !expectedExitCodes.includes(exitCode));
    const isFailure = hasRawStack || isExitFailure;
    if (isFailure) {
        const failureReason = hasRawStack
            ? "Raw stack trace detected."
            : `Unexpected exit code ${exitCode}.`;
        UI.error(`Replay failed: ${failureReason}`);
        process.exit(ChaosExitCodes.INVARIANT_VIOLATION);
    }
    else {
        UI.success("Replay completed cleanly.");
        process.exit(ChaosExitCodes.NO_FINDINGS);
    }
}
//# sourceMappingURL=chaos-runner.js.map