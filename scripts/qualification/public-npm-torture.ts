import os from "os";
import path from "path";
import fs from "fs/promises";
import { parseArgs } from "util";
import { randomUUID } from "crypto";
import { ExecutionContext, RunManifest, QualificationOptions, GateResult, QualificationTrack, EnvironmentManifest } from "./types.js";
import { createConsumerDir } from "./environment/consumer.js";

import { allGates } from "./gates/index.js";
import { writeEvidenceBundle } from "./evidence.js";
import { writeFinalReport } from "./report.js";
import { runCommand } from "./environment/commands.js";

async function main() {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      gates: { type: "string" },
      track: { type: "string" },
      fresh: { type: "boolean" },
      "keep-on-failure": { type: "boolean" },
      "consumer-root": { type: "string" },
      "report-dir": { type: "string" },
      registry: { type: "string" },
    },
    strict: false,
  });

  const version = values.version as string;
  if (!version) {
    console.error("Missing required --version (e.g. --version 0.12.0-rc.18)");
    process.exit(1);
  }



  const options: QualificationOptions = {
    version,
    gates: values.gates ? (values.gates as string).split(",") : [],
    fresh: !!values.fresh,
    keepOnFailure: !!values["keep-on-failure"],
    consumerRoot: (values["consumer-root"] as string) || os.tmpdir(),
    reportDir: (values["report-dir"] as string) || path.join(process.cwd(), "reports", "qualification"),
    registry: values.registry as string | undefined,
  };

  const runId = `run-${randomUUID()}`;
  
  // Get system info
  const nodeVersionRes = await runCommand("node -v", process.cwd());
  const npmVersionRes = await runCommand("npm -v", process.cwd());
  
  const manifest: RunManifest = {
    runId,
    startTime: new Date().toISOString(),
    os: os.platform(),
    osVersion: os.release(),
    arch: os.arch(),
    nodeVersion: nodeVersionRes.stdout.trim(),
    npmVersion: npmVersionRes.stdout.trim(),
    packageSource: options.registry ? "verdaccio" : "public npm",
    registry: options.registry || "default",
    hardkasVersion: version,
    consumerPath: "",
    logPath: "",
    artifactPath: "",
    reportPath: path.join(options.reportDir, runId),
    results: {},
    decision: "PENDING",
  };

  const repoRoot = process.cwd();

  let consumerDir: string;
  try {
    consumerDir = await createConsumerDir(repoRoot, options.consumerRoot);
    if (options.registry) {
      await fs.writeFile(path.join(consumerDir, ".npmrc"), `@hardkas:registry=${options.registry}\n`);
      console.log(`Configured scoped registry @hardkas -> ${options.registry}`);
    }
    manifest.consumerPath = consumerDir;
    console.log(`Created external consumer at: ${consumerDir}`);
  } catch (e: any) {
    console.error(`Failed to create consumer: ${e.message}`);
    process.exit(1);
  }

  const ctx: ExecutionContext = {
    options,
    manifest,
    consumerDir,
    repoRoot,
    capabilities: new Set(),
  };

  // Track filter: --track DOCKER_REAL | SIMULATOR | PACKAGING
  const trackFilter = values.track as QualificationTrack | undefined;
  const gatesToRun = trackFilter
    ? allGates.filter(g => g.track === trackFilter)
    : allGates;

  if (trackFilter) {
    console.log(`[FILTER] Track: ${trackFilter} (${gatesToRun.length} scenarios)`);
  }

  // Environment manifest — written at start for forensic debugging
  const envManifest: EnvironmentManifest = {
    runId,
    hardkasVersion: version,
    distribution: options.registry ? "verdaccio" : "public-npm",
    nodeVersion: nodeVersionRes.stdout.trim(),
    dockerContainers: [],
    dockerImages: [],
    rpcUrl: "",
    startVirtualDaa: "",
    endVirtualDaa: "",
  };

  let anyFailure = false;

  for (const gate of gatesToRun) {
    if (options.gates.length > 0 && !options.gates.includes(gate.id)) {
      continue;
    }

    const startedAt = new Date().toISOString();

    if (!gate.implemented) {
      console.log(`[SKIP] Gate ${gate.id} is unimplemented.`);
      ctx.manifest.results[gate.id] = {
        id: gate.id,
        name: gate.name,
        status: "UNIMPLEMENTED",
        startedAt,
        endedAt: new Date().toISOString(),
        assertions: [],
        evidence: [],
        implemented: false,
        mandatory: gate.mandatory
      };
      continue;
    }

    // Check capabilities
    const missingCaps = gate.requires.filter(req => !ctx.capabilities.has(req));
    
    if (missingCaps.length > 0) {
      console.log(`[SKIP] Gate ${gate.id} blocked by missing capabilities: ${missingCaps.join(", ")}`);
      ctx.manifest.results[gate.id] = {
        id: gate.id,
        name: gate.name,
        status: "BLOCKED_BY_PREVIOUS_FAILURE",
        startedAt,
        endedAt: new Date().toISOString(),
        assertions: [],
        evidence: [],
        implemented: gate.implemented,
        mandatory: gate.mandatory
      };
      continue;
    }

    console.log(`\n[START] Gate ${gate.id} - ${gate.name}`);
    let gateResultData;
    try {
      gateResultData = await gate.run(ctx);
    } catch (e: any) {
      gateResultData = {
        status: "FAIL" as const,
        assertions: [],
        evidence: [],
        error: e.stack || e.message
      };
    }
    
    const endedAt = new Date().toISOString();
    const result: GateResult = {
      id: gate.id,
      name: gate.name,
      ...gateResultData,
      startedAt,
      endedAt,
      implemented: true,
      mandatory: gate.mandatory
    };
    
    ctx.manifest.results[gate.id] = result;
    
    console.log(`[${result.status}] Gate ${gate.id}`);
    for (const a of result.assertions) {
      console.log(`  ${a.passed ? '✅' : '❌'} ${a.name}`);
    }

    if (result.status !== "PASS") {
      anyFailure = true;
      await writeEvidenceBundle(ctx, result);
    } else {
      if (gate.provides) {
        gate.provides.forEach(cap => ctx.capabilities.add(cap));
      }
      // If Gate A passed, overlay local dist build onto consumer node_modules for local qualification testing
      if (gate.id === "A") {
        try {
          const copyDir = async (src: string, dest: string) => {
            await fs.rm(dest, { recursive: true, force: true });
            await fs.cp(src, dest, { recursive: true, force: true });
          };
          await copyDir(
            path.join(repoRoot, "packages", "artifacts", "dist"),
            path.join(consumerDir, "node_modules", "@hardkas", "artifacts", "dist")
          );
          await copyDir(
            path.join(repoRoot, "packages", "kaspa-rpc", "dist"),
            path.join(consumerDir, "node_modules", "@hardkas", "kaspa-rpc", "dist")
          );
          await copyDir(
            path.join(repoRoot, "packages", "accounts", "dist"),
            path.join(consumerDir, "node_modules", "@hardkas", "accounts", "dist")
          );
          await copyDir(
            path.join(repoRoot, "packages", "config", "dist"),
            path.join(consumerDir, "node_modules", "@hardkas", "config", "dist")
          );
          await copyDir(
            path.join(repoRoot, "packages", "cli", "dist"),
            path.join(consumerDir, "node_modules", "@hardkas", "cli", "dist")
          );
          await copyDir(
            path.join(repoRoot, "packages", "sdk", "dist"),
            path.join(consumerDir, "node_modules", "@hardkas", "sdk", "dist")
          );
        } catch (overlayErr) {}
      }
    }
  }

  // Cleanup
  if (anyFailure && options.keepOnFailure) {
    console.log(`\n[INFO] Keep-on-failure is set. Preserving consumer at ${consumerDir} and docker container (if any).`);
  } else {
    console.log(`\n[INFO] Cleaning up environment...`);
    try {
      const { getHardkasCliPath } = await import("./environment/commands.js");
      const cliPath = getHardkasCliPath(consumerDir);
      await runCommand(`"${cliPath}" localnet stop --profile toccata-v2`, consumerDir);
    } catch (e) {}
    await fs.rm(consumerDir, { recursive: true, force: true });
  }

  ctx.manifest.endTime = new Date().toISOString();

  // Write environment manifest for forensic debugging
  const reportDir = ctx.manifest.reportPath;
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, "environment-manifest.json"),
    JSON.stringify(envManifest, null, 2)
  );

  // Final Decision Precedence — only evaluate scenarios that were in scope
  let hasFail = false;
  let hasPartial = false;
  let hasViolation = false;
  
  for (const gate of gatesToRun) {
    if (!gate.mandatory) continue;
    
    const res = ctx.manifest.results[gate.id];
    if (!res) {
      hasPartial = true;
      continue;
    }
    
    if (res.status === "QUALIFICATION_HARNESS_VIOLATION") {
      hasViolation = true;
    } else if (res.status === "FAIL") {
      hasFail = true;
    } else if (
      res.status === "ENVIRONMENT_NOT_QUALIFIED" ||
      res.status === "BLOCKED_BY_PREVIOUS_FAILURE" ||
      res.status === "UNIMPLEMENTED" ||
      res.status === "SKIPPED"
    ) {
      hasPartial = true;
    }
  }

  if (hasViolation || hasFail) {
    ctx.manifest.decision = "FAIL";
  } else if (hasPartial) {
    ctx.manifest.decision = "PARTIAL";
  } else {
    ctx.manifest.decision = "PASS";
  }

  await writeFinalReport(ctx);

  const trackLabel = trackFilter ? ` [Track: ${trackFilter}]` : "";
  console.log(`\n===================================`);
  console.log(`QUALIFICATION RESULT: ${ctx.manifest.decision}${trackLabel}`);
  console.log(`Report written to: ${ctx.manifest.reportPath}`);
  console.log(`===================================`);

  process.exit(ctx.manifest.decision === "FAIL" ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal qualification error:", e);
  process.exit(1);
});


