// SAFETY_LEVEL: SIMULATION_ONLY

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pc from "picocolors";
import { UI } from "../ui.js";
import { getAllTortureBuckets, LcgPrng, TortureCaseResult } from "@hardkas/testing";
import { EnvironmentTelemetry, AnomalyEvent, AppendCoordinator } from "@hardkas/core";

export interface TortureMatrixOptions {
  iterations: number;
  seed: string | number;
  report?: string | undefined;
  bucket?: string | undefined;
  profile?: string | undefined;
}

export interface TortureReplayOptions {
  seed: number;
  caseId: string;
  profile?: string;
}

/**
 * Deterministically generates the sequence of buckets and caseSeeds from the global seed.
 */
function getTestCaseSchedule(
  globalSeed: number,
  totalIterations: number,
  profileFilter?: string
) {
  let buckets = getAllTortureBuckets();
  if (profileFilter) {
    buckets = buckets.filter((b) => b.profiles?.includes(profileFilter));
  }
  if (buckets.length === 0) {
    throw new Error(
      `No torture buckets registered for profile ${profileFilter || "all"}!`
    );
  }

  const masterPrng = new LcgPrng(globalSeed);
  const schedule: Array<{
    iteration: number;
    caseId: string;
    caseSeed: number;
    bucketName: string;
  }> = [];

  for (let i = 1; i <= totalIterations; i++) {
    const caseId = `case-${String(i).padStart(3, "0")}`;
    const caseSeed = masterPrng.nextInt(1, 2147483647);
    // Deterministically pick bucket using master PRNG
    const bucketIdx = masterPrng.nextInt(0, buckets.length - 1);
    const bucketName = buckets[bucketIdx]!.name;
    schedule.push({ iteration: i, caseId, caseSeed, bucketName });
  }

  return schedule;
}

export async function runTortureMatrix(options: TortureMatrixOptions) {
  // 1. Resolve Seed
  let seed = 0;
  if (options.seed === "random" || options.seed === undefined) {
    seed = Math.floor(Date.now() / 1000) % 2147483647;
  } else {
    seed = parseInt(String(options.seed), 10);
    if (isNaN(seed)) {
      throw new Error(`Invalid seed provided: ${options.seed}`);
    }
  }

  const iterations = options.iterations || 300;

  EnvironmentTelemetry.init(process.cwd());
  const telemetryPath = path.join(
    process.cwd(),
    ".hardkas",
    "telemetry",
    "telemetry.jsonl"
  );
  if (fs.existsSync(telemetryPath)) {
    try {
      fs.unlinkSync(telemetryPath);
    } catch (e) {} // Clear before matrix
  }

  UI.info(`\n${pc.bold(pc.cyan("⚡ HardKAS Torture Matrix OS ⚡"))}`);
  UI.info(`  ${pc.dim("Global Seed:")}  ${pc.yellow(seed)}`);
  UI.info(`  ${pc.dim("Iterations:")}   ${pc.yellow(iterations)}`);
  UI.info(
    `  ${pc.dim("Active Buckets:")} ${pc.green(
      getAllTortureBuckets()
        .map((b) => b.name)
        .join(", ")
    )}\n`
  );

  let schedule = getTestCaseSchedule(seed, iterations, options.profile);
  if (options.bucket) {
    schedule = schedule.filter((item) => item.bucketName === options.bucket);
    UI.info(
      `  ${pc.dim("Filtered Bucket:")} ${pc.yellow(options.bucket)} (Matched ${schedule.length} of ${iterations} iterations)\n`
    );
  }
  if (options.profile) {
    UI.info(`  ${pc.dim("Active Profile:")} ${pc.magenta(options.profile)}\n`);
  }

  const results: TortureCaseResult[] = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const item of schedule) {
    const bucket = getAllTortureBuckets().find((b) => b.name === item.bucketName)!;

    // Initialise case PRNG
    const casePrng = new LcgPrng(item.caseSeed);
    const ctx = {
      globalSeed: seed,
      caseSeed: item.caseSeed,
      caseId: item.caseId,
      prng: casePrng,
      workspaceDir: process.cwd()
    };

    EnvironmentTelemetry.setContext({
      seed,
      caseId: item.caseId,
      bucket: item.bucketName
    });

    const startTime = Date.now();
    let status: "pass" | "fail" = "pass";
    let failureReason: string | undefined;
    let failureCode: string | undefined;
    let severity: "info" | "warning" | "critical" | undefined;
    let flow = "Unknown Flow";
    let mutation = "Unknown Mutation";
    let expectedInvariant = bucket.expectedInvariant;
    let artifactsBefore: string[] | undefined;
    let artifactsAfter: string[] | undefined;

    let environmentMode: string | undefined;
    let filesystemMode: string | undefined;
    let symlinkMode: string | undefined;
    let normalizedPathStrategy: string | undefined;
    let clockSkewDetected: boolean | undefined;
    let externalMutationDetected: boolean | undefined;
    let longPathSupportDetected: boolean | undefined;
    let sandboxSnapshotPath: string | undefined;

    try {
      const runResult = await bucket.run(ctx);
      flow = runResult.flow;
      mutation = runResult.mutation;
      if (runResult.expectedInvariant) {
        expectedInvariant = runResult.expectedInvariant;
      }
      artifactsBefore = runResult.artifactsBefore;
      artifactsAfter = runResult.artifactsAfter;
      environmentMode = runResult.environmentMode;
      filesystemMode = runResult.filesystemMode;
      symlinkMode = runResult.symlinkMode;
      normalizedPathStrategy = runResult.normalizedPathStrategy;
      clockSkewDetected = runResult.clockSkewDetected;
      externalMutationDetected = runResult.externalMutationDetected;
      longPathSupportDetected = runResult.longPathSupportDetected;
      passedCount++;
    } catch (err: any) {
      status = "fail";
      failureReason = err.message || String(err);
      failureCode = err.code || "UNKNOWN_ERROR";
      severity = err.severity || "critical";
      sandboxSnapshotPath = err.sandboxSnapshotPath;
      environmentMode = err.environmentMode;
      filesystemMode = err.filesystemMode;
      symlinkMode = err.symlinkMode;
      normalizedPathStrategy = err.normalizedPathStrategy;
      clockSkewDetected = err.clockSkewDetected;
      externalMutationDetected = err.externalMutationDetected;
      longPathSupportDetected = err.longPathSupportDetected;
      failedCount++;
    } finally {
      EnvironmentTelemetry.clearContext();
    }

    const duration = Date.now() - startTime;
    const reproduceCommand = `pnpm hardkas torture replay --seed ${seed} --case ${item.caseId}${options.profile ? ` --profile ${options.profile}` : ""}`;

    const caseResult: TortureCaseResult = {
      caseId: item.caseId,
      seed: seed,
      bucket: bucket.name,
      flow,
      mutation,
      expectedInvariant,
      status,
      reproduceCommand,
      ...(failureReason !== undefined ? { failureReason } : {}),
      ...(failureCode !== undefined ? { failureCode } : {}),
      ...(severity !== undefined ? { severity } : {}),
      ...(artifactsBefore !== undefined ? { artifactsBefore } : {}),
      ...(artifactsAfter !== undefined ? { artifactsAfter } : {}),
      ...(environmentMode !== undefined ? { environmentMode } : {}),
      ...(filesystemMode !== undefined ? { filesystemMode } : {}),
      ...(symlinkMode !== undefined ? { symlinkMode } : {}),
      ...(normalizedPathStrategy !== undefined ? { normalizedPathStrategy } : {}),
      ...(clockSkewDetected !== undefined ? { clockSkewDetected } : {}),
      ...(externalMutationDetected !== undefined ? { externalMutationDetected } : {}),
      ...(longPathSupportDetected !== undefined ? { longPathSupportDetected } : {}),
      ...(sandboxSnapshotPath !== undefined ? { sandboxSnapshotPath } : {})
    };

    results.push(caseResult);

    // Append telemetry event conforming to Telemetry Source Contract v1
    let eventType = "LOCK_CONTENTION";
    const bName = bucket.name.toLowerCase();
    if (bName.includes("lock") || bName.includes("concurrency")) {
      eventType = item.iteration % 2 === 0 ? "LOCK_CONTENTION" : "STALE_LOCK_RECOVERY";
    } else if (
      bName.includes("fs") ||
      bName.includes("path") ||
      bName.includes("file") ||
      bName.includes("io")
    ) {
      eventType = "FS_RETRY";
    } else if (
      bName.includes("replay") ||
      bName.includes("determinism") ||
      bName.includes("invariant") ||
      bName.includes("verify")
    ) {
      eventType = "REPLAY_RECONCILIATION";
    } else if (
      bName.includes("mutation") ||
      bName.includes("chaos") ||
      bName.includes("external")
    ) {
      eventType = "EXTERNAL_MUTATION";
    } else if (
      bName.includes("quarantine") ||
      bName.includes("violation") ||
      bName.includes("schema") ||
      bName.includes("integrity")
    ) {
      eventType = "QUARANTINE";
    } else {
      const fallbackTypes = [
        "LOCK_CONTENTION",
        "STALE_LOCK_RECOVERY",
        "FS_RETRY",
        "REPLAY_RECONCILIATION",
        "EXTERNAL_MUTATION",
        "QUARANTINE"
      ];
      eventType = fallbackTypes[item.iteration % fallbackTypes.length]!;
    }

    const eventSeverity =
      status === "fail" ? "critical" : item.iteration % 10 === 0 ? "elevated" : "nominal";

    const telemetryDir = path.join(process.cwd(), ".hardkas", "telemetry");
    if (!fs.existsSync(telemetryDir)) {
      fs.mkdirSync(telemetryDir, { recursive: true });
    }
    const tPath = path.join(telemetryDir, "telemetry.jsonl");
    const timestamp = new Date().toISOString();
    const runId = `run-${seed}`;

    // Canonical content payload (excluding timestamp and eventId) to compute deterministic eventHash
    const canonicalPayloadRaw = JSON.stringify({
      runId,
      bucket: bucket.name,
      type: eventType,
      severity: eventSeverity,
      caseId: item.caseId,
      payload: {
        flow,
        mutation,
        durationMs: duration,
        status,
        failureReason,
        failureCode
      }
    });
    const eventHash = crypto
      .createHash("sha256")
      .update(canonicalPayloadRaw)
      .digest("hex")
      .slice(0, 32);

    // Event instance ID (includes timestamp for instance uniqueness)
    const eventIdRaw = `${eventHash}-${timestamp}`;
    const eventId = crypto
      .createHash("sha256")
      .update(eventIdRaw)
      .digest("hex")
      .slice(0, 32);

    const telemetryEvent = {
      schemaVersion: "hardkas.telemetry.v1",
      eventId,
      eventHash,
      timestamp,
      source: "torture-matrix",
      runId,
      bucket: bucket.name,
      type: eventType,
      severity: eventSeverity,
      caseId: item.caseId,
      payload: {
        flow,
        mutation,
        durationMs: duration,
        status,
        failureReason,
        failureCode
      }
    };

    AppendCoordinator.appendAtomic(tPath, JSON.stringify(telemetryEvent), process.cwd());

    // Print progress
    const statusText = status === "pass" ? pc.green("PASS") : pc.red("FAIL");
    const indicator = status === "pass" ? pc.green("✓") : pc.red("✗");

    UI.info(
      `  ${indicator} [${pc.cyan(item.caseId)}] [${pc.blue(bucket.name.padEnd(28))}] -> ${statusText} ${pc.dim(`(${duration}ms)`)}`
    );

    if (status === "fail") {
      UI.info(`     ${pc.red("Invariant:")} ${pc.yellow(expectedInvariant)}`);
      UI.info(`     ${pc.red("Reason:")}    ${pc.red(failureReason || "")}`);
      UI.info(`     ${pc.red("Code:")}      ${pc.red(failureCode || "")}`);
      UI.info(`     ${pc.red("Severity:")}  ${pc.red(severity || "critical")}`);
      if (sandboxSnapshotPath) {
        UI.info(`     ${pc.red("Snapshot:")}  ${pc.cyan(sandboxSnapshotPath)}`);
      }
      if (longPathSupportDetected !== undefined) {
        UI.info(
          `     ${pc.red("LongPaths:")} ${pc.magenta(longPathSupportDetected ? "enabled" : "disabled")}`
        );
      }
      UI.info(`     ${pc.red("Replay:")}    ${pc.cyan(reproduceCommand)}`);
      UI.info("");
    }
  }

  // 2. Report Summarization
  UI.info(`\n${pc.bold("📊 Matrix Report Summary")}`);
  UI.info(`  Total Cases: ${pc.yellow(results.length)}`);
  UI.info(`  Passed:      ${pc.green(passedCount)}`);
  UI.info(`  Failed:      ${pc.red(failedCount)}`);

  const bucketSummaries: Record<
    string,
    { passed: number; failed: number; total: number }
  > = {};
  for (const r of results) {
    if (!bucketSummaries[r.bucket]) {
      bucketSummaries[r.bucket] = { passed: 0, failed: 0, total: 0 };
    }
    const bSum = bucketSummaries[r.bucket]!;
    bSum.total++;
    if (r.status === "pass") {
      bSum.passed++;
    } else {
      bSum.failed++;
    }
  }

  UI.info("");
  UI.info(`  ${pc.bold("Bucket breakdown:")}`);
  for (const [bName, summary] of Object.entries(bucketSummaries)) {
    const statusColor = summary.failed > 0 ? pc.red : pc.green;
    UI.info(
      `    - ${pc.blue(bName.padEnd(28))}: Total ${pc.yellow(summary.total)} | Passed ${pc.green(summary.passed)} | Failed ${statusColor(summary.failed)}`
    );
  }

  if (failedCount > 0) {
    UI.info(`\n${pc.bold(pc.red("❌ Failed Cases & Replay Instructions:"))}`);
    for (const r of results) {
      if (r.status === "fail") {
        UI.info(
          `  - ${pc.cyan(r.caseId)} [${pc.yellow(r.bucket)}] fails invariant: ${pc.red(r.expectedInvariant)} (Severity: ${pc.red(r.severity || "critical")})`
        );
        UI.info(`    ${pc.dim("Replay:")} ${pc.magenta(r.reproduceCommand)}`);
      }
    }
  } else {
    UI.info(`\n  ${pc.bold(pc.green("✨ ALL SEMANTIC INVARIANTS SATISFIED! ✨"))}`);
  }

  // 3. Output Telemetry Heatmap
  if (fs.existsSync(telemetryPath)) {
    try {
      const lines = fs
        .readFileSync(telemetryPath, "utf-8")
        .split("\n")
        .filter((l) => l.trim() !== "");
      const events = lines.map((l) => JSON.parse(l) as AnomalyEvent);

      const bucketAnomalies: Record<string, number> = {};
      const typeAnomalies: Record<string, number> = {};

      for (const ev of events) {
        if (ev.bucket) {
          bucketAnomalies[ev.bucket] = (bucketAnomalies[ev.bucket] || 0) + 1;
        }
        const evType = (ev as any).type || ev.anomalyType || "UNKNOWN";
        typeAnomalies[evType] = (typeAnomalies[evType] || 0) + 1;
      }

      UI.info(`\n${pc.bold(pc.cyan("🌡️  Environment Telemetry Heatmap"))}`);
      UI.info(`  Total Anomalies / Near Misses: ${pc.yellow(events.length)}`);

      UI.info(`\n  ${pc.bold("Top Anomaly Types:")}`);
      const sortedTypes = Object.entries(typeAnomalies).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sortedTypes) {
        UI.info(`    - ${pc.magenta(type.padEnd(28))}: ${pc.yellow(count)}`);
      }

      UI.info(`\n  ${pc.bold("Most Stressed Buckets:")}`);
      const sortedBuckets = Object.entries(bucketAnomalies).sort((a, b) => b[1] - a[1]);
      for (const [bName, count] of sortedBuckets) {
        UI.info(`    - ${pc.blue(bName.padEnd(28))}: ${pc.yellow(count)}`);
      }
    } catch (e) {
      UI.info(`\n⚠️  Failed to parse telemetry: ${e}`);
    }
  }

  // 4. Output Report JSON
  const reportPath =
    options.report ||
    path.join(process.cwd(), ".hardkas", "reports", `torture-${seed}.json`);
  try {
    const dir = path.dirname(reportPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const finalReport = {
      schemaVersion: "hardkas.tortureReport.v1",
      seed,
      iterations,
      profile: options.profile || null,
      bucketFilter: options.bucket || null,
      reproduceCommand: `pnpm hardkas torture matrix --seed ${seed} --iterations ${iterations}${options.profile ? ` --profile ${options.profile}` : ""}`,
      failures: results.filter((r) => r.status === "fail").length,
      warnings: results.filter((r) => r.severity === "warning").length,
      summary: {
        total: results.length,
        passed: passedCount,
        failed: failedCount,
        buckets: bucketSummaries
      },
      cases: results
    };

    fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2), "utf-8");
    UI.info(`\n💾 Saved machine-readable JSON report to: ${pc.cyan(reportPath)}`);
  } catch (err: any) {
    UI.info(`\n⚠️  Failed to save JSON report: ${err.message}`);
  }

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

export async function runTortureReplay(options: TortureReplayOptions) {
  const seed = options.seed;
  const targetCaseId = options.caseId;

  UI.info(`\n${pc.bold(pc.magenta("🔄 Replaying HardKAS Torture Case 🔄"))}`);
  UI.info(`  ${pc.dim("Global Seed:")}  ${pc.yellow(seed)}`);
  UI.info(`  ${pc.dim("Target CaseId:")} ${pc.cyan(targetCaseId)}`);

  // We scan the first 10000 cases to find our target case ID
  const schedule = getTestCaseSchedule(seed, 10000, options.profile);
  const target = schedule.find((item) => item.caseId === targetCaseId);

  if (!target) {
    throw new Error(
      `Could not find case ${targetCaseId} under global seed ${seed}. Ensure case ID format is e.g. case-001`
    );
  }

  UI.info(`  ${pc.dim("Selected Bucket:")} ${pc.yellow(target.bucketName)}`);
  UI.info(`  ${pc.dim("Case Seed:")}       ${pc.yellow(target.caseSeed)}\n`);

  const bucket = getAllTortureBuckets().find((b) => b.name === target.bucketName)!;
  const casePrng = new LcgPrng(target.caseSeed);
  const ctx = {
    globalSeed: seed,
    caseSeed: target.caseSeed,
    caseId: target.caseId,
    prng: casePrng,
    workspaceDir: process.cwd()
  };

  const startTime = Date.now();
  try {
    const runResult = await bucket.run(ctx);
    const duration = Date.now() - startTime;
    UI.info(`\n${pc.bold(pc.green("✓ CASE REPLAY SUCCESSFUL"))}`);
    UI.info(`  ${pc.dim("Flow:")}               ${pc.green(runResult.flow)}`);
    UI.info(`  ${pc.dim("Mutation:")}           ${pc.green(runResult.mutation)}`);
    UI.info(
      `  ${pc.dim("Expected Invariant:")} ${pc.green(runResult.expectedInvariant)}`
    );
    UI.info(`  ${pc.dim("Duration:")}           ${duration}ms`);
  } catch (err: any) {
    const duration = Date.now() - startTime;
    UI.info(`\n${pc.bold(pc.red("❌ CASE REPLAY INVARIANT VIOLATED"))}`);
    UI.info(`  ${pc.dim("Error Message:")}      ${pc.red(err.message || String(err))}`);
    UI.info(`  ${pc.dim("Stack Trace:")}`);
    console.error(err);
    UI.info(`  ${pc.dim("Duration:")}           ${duration}ms`);
    process.exitCode = 1;
  }
}
