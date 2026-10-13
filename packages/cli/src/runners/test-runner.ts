import { UI } from "../ui.js";
import path from "node:path";
import fs from "node:fs/promises";
import { Hardkas } from "@hardkas/sdk";

export interface TestRunnerOptions {
  files: string[];
  network: string;
  watch?: boolean;
  json?: boolean;
  reporter?: string;
  massReport?: boolean;
  massSnapshot?: string;
  massCompare?: string;
  workspaceRoot?: string;
  keepRuns?: boolean;
  evidence?: boolean;
  scenario?: string;
}

/** CLI-CONTRACT-2A · the counts of one run, read from the runner's own task tree: what was collected, executed, passed, failed, skipped. */
export interface TestRunCounts {
  collected: number;
  executed: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  filesTotal: number;
  filesFailed: number;
}

type TaskLike = { type?: string; mode?: string; result?: { state?: string }; tasks?: TaskLike[] };

/** Walks the files the runner reports (suites hold `tasks`, tests do not) and counts every test by its own result. */
export function countTestRun(files: TaskLike[]): TestRunCounts {
  const c: TestRunCounts = { collected: 0, executed: 0, passed: 0, failed: 0, skipped: 0, todo: 0, filesTotal: files.length, filesFailed: 0 };
  const walk = (t: TaskLike) => {
    if (Array.isArray(t.tasks)) {
      for (const child of t.tasks) walk(child);
      return;
    }
    if (t.type !== "test" && t.type !== "custom") return;
    c.collected++;
    const state = t.result?.state;
    if (state === "pass") c.passed++;
    else if (state === "fail") c.failed++;
    else if (t.mode === "todo" || state === "todo") c.todo++;
    else c.skipped++; // skipped by `.skip`, by a name filter, or never run
  };
  for (const f of files) {
    if (f.result?.state === "fail") c.filesFailed++;
    walk(f);
  }
  c.executed = c.passed + c.failed;
  return c;
}

/**
 * CLI-CONTRACT-2A · the verdict of a run. A pass needs executed tests and no failure; zero collected (NO_TESTS_FOUND),
 * zero executed (NO_TESTS_EXECUTED: every collected test skipped or filtered out) and any failure (TESTS_FAILED, a
 * failing test or a file that could not run) are three typed failures, never a pass. `every()` over the file states
 * used to say "pass" for an empty run and "fail" for an all-skipped one.
 */
export function testRunVerdict(
  counts: TestRunCounts,
  selection: { patterns: string[]; scenario?: string | undefined }
): { ok: true; code?: undefined; message?: undefined } | { ok: false; code: string; message: string } {
  if (counts.failed > 0 || counts.filesFailed > 0) {
    const files = counts.filesFailed > 0 ? `; ${counts.filesFailed} test file(s) could not run` : "";
    return { ok: false, code: "TESTS_FAILED", message: `${counts.failed} of ${counts.executed} executed test(s) failed${files}.` };
  }
  if (counts.collected === 0) {
    return {
      ok: false,
      code: "NO_TESTS_FOUND",
      message: `No test was collected: no test file matched ${selection.patterns.join(", ")}. Nothing ran, so this is not a pass.`
    };
  }
  if (counts.executed === 0) {
    const why = selection.scenario ? `--scenario ${selection.scenario} selected none of them` : `${counts.skipped} skipped, ${counts.todo} todo`;
    return {
      ok: false,
      code: "NO_TESTS_EXECUTED",
      message: `${counts.collected} test(s) collected, none executed (${why}). Nothing ran, so this is not a pass.`
    };
  }
  return { ok: true };
}

/**
 * HardKAS Scenario Runner (v1)
 *
 * Replaces the previous mock with a real discovery and execution engine.
 * Currently uses a thin wrapper around Vitest if available.
 */
export async function runTest(options: TestRunnerOptions): Promise<void> {
  const { files, network, watch, json, reporter } = options;

  if (!json) {
    UI.header("HardKAS Scenario Runner");
    UI.info(`Network: ${network}`);
  }

  // 1. Project validation
  let hardkas;
  try {
    hardkas = await Hardkas.open(".");
    // RESOURCE-LIFECYCLE-1 (RL-I1): it only proves the project here, so it is released at once.
    await hardkas.close();
  } catch (e) {
    throw new Error("Could not find a valid HardKAS project in this directory.");
  }

  // 2. File discovery
  const searchPatterns =
    files.length > 0 ? files : ["test/**/*.test.ts", "tests/**/*.test.ts", "scenarios/**/*.scenario.ts", "scenarios/**/*.test.ts"];

  if (!json) {
    UI.info(`Searching for tests: ${searchPatterns.join(", ")}`);
  }

  // 3. Scenario Execution Setup
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const testRunId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const testRunDir = path.join(workspaceRoot, ".hardkas", "runs", testRunId);
  const scenarioResultsDir = path.join(testRunDir, "scenario-results");
  await fs.mkdir(scenarioResultsDir, { recursive: true });
  const testResultsPath = path.join(testRunDir, "test-results.json");

  // 4. Vitest Integration (Lazy Load)
  try {
    // Note: In a real implementation, we would use the Vitest Node API (startVitest)
    // For this audit/hardening phase, we implement the discovery and setup logic.
    const { startVitest } = await import("vitest/node");

    // CLI-CONTRACT-2A: the runner's own JSON report goes to a file in the run directory, never to stdout (`--json`
    // prints exactly one document, the envelope); the human reporter stays in human mode.
    const vitestJsonPath = path.join(testRunDir, "vitest-report.json");
    const vitestOptions: any = {
      run: !watch,
      watch: !!watch,
      reporter: json ? ["json"] : [reporter || "default", "json"],
      outputFile: { json: vitestJsonPath },
      globals: true,
      environment: "node",
      include: searchPatterns,
      exclude: ["**/node_modules/**", "**/dist/**", "**/.hardkas/**"],
      // Injected environment variables for tests to consume
      env: {
        HARDKAS_NETWORK: network,
        HARDKAS_CWD: workspaceRoot,
        HARDKAS_KEEP_RUNS: options.keepRuns ? "true" : "false",
        HARDKAS_TEST_RUN_ID: testRunId,
        HARDKAS_TEST_RESULTS_PATH: testResultsPath,
        HARDKAS_TEST_RUN_DIR: testRunDir
      },
      ...(options.scenario ? { testNamePattern: options.scenario } : {})
    };

    const vitest = await startVitest("test", [], vitestOptions);

    if (!vitest) {
      throw new Error("Failed to initialize test engine.");
    }

    // CLI-CONTRACT-2A: the verdict comes from the runner's own task tree (collected, executed, passed, failed, skipped),
    // never from `every()` over the file states, which answered "pass" for an empty run and "fail" for an all-skipped one.
    const counts = countTestRun(vitest.state.getFiles() as unknown as TaskLike[]);
    const verdict = testRunVerdict(counts, { patterns: searchPatterns, scenario: options.scenario });
    const passed = verdict.ok;

    // Gather scenario results
    let scenarioResults: string[] = [];
    try {
      const dirContents = await fs.readdir(scenarioResultsDir);
      for (const file of dirContents) {
        if (file.endsWith(".json")) {
          const content = await fs.readFile(path.join(scenarioResultsDir, file), "utf-8");
          const info = JSON.parse(content);
          scenarioResults.push(info.scenarioResultPath);
        }
      }
    } catch (e) {
      // ignore
    }

    const vitestReportExists = await fs.stat(vitestJsonPath).then(() => true, () => false);
    const testReport = {
      testRunId,
      network,
      // CLI-CONTRACT-2A: what ran, from the runner's own results; `passed` keeps its name and now means the verdict.
      tests: { collected: counts.collected, executed: counts.executed, passed: counts.passed, failed: counts.failed, skipped: counts.skipped, todo: counts.todo },
      files: { total: counts.filesTotal, failed: counts.filesFailed },
      verdict: passed ? "PASS" : verdict.code,
      scenariosExecuted: scenarioResults.length,
      passed,
      scenarios: scenarioResults,
      createdAt: new Date().toISOString(),
      ...(vitestReportExists ? { vitestReport: path.relative(workspaceRoot, vitestJsonPath).replace(/\\/g, "/") } : {})
    };
    await fs.writeFile(testResultsPath, JSON.stringify(testReport, null, 2));

    if (!json) {
      UI.divider();
      UI.info(
        `Tests: ${counts.collected} collected, ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped` +
          `${counts.todo ? `, ${counts.todo} todo` : ""}${counts.filesFailed ? `; ${counts.filesFailed} file(s) could not run` : ""}`
      );
      UI.info(`Report saved to .hardkas/runs/${testRunId}/test-results.json`);
      if (passed) UI.success("All executed tests passed.");
    }

    // Auto-package evidence
    if (options.evidence && scenarioResults.length > 0) {
      if (!json) UI.info(`Auto-packaging evidence for ${scenarioResults.length} scenarios...`);
      const { EvidenceManager } = await import("@hardkas/sdk");
      for (const resPath of scenarioResults) {
        try {
          const outPath = await EvidenceManager.pack({
            scenarioResultPath: resPath,
            workspaceRoot
          });
          if (!json) UI.success(`Packed evidence: ${path.relative(workspaceRoot, outPath)}`);
        } catch (err: any) {
          if (!json) UI.error(`Failed to pack evidence for ${resPath}: ${err.message}`);
        }
      }
    }

    if (json) {
      // CLI-CONTRACT-2A: one envelope, the verdict's code and message inside it when the run is not a pass (the typed
      // error thrown below is then rendered nowhere else: the renderer never writes a second document).
      const { getOutput } = await import("../output.js");
      getOutput().writeJson({
        ok: passed,
        ...(passed ? {} : { code: verdict.code, message: verdict.message }),
        command: "test",
        mode: "cli",
        result: testReport
      });
    }

    if (!verdict.ok) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(verdict.code, verdict.message, { exitCode: 1 });
    }

  } catch (e) {
    if (e instanceof Error) {
      const errCode = (e as unknown as Record<string, unknown>).code;
      if (errCode === "ERR_MODULE_NOT_FOUND" || ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes("vitest")) {
        UI.warning("Vitest is not installed in this project.");
        UI.info("Run 'pnpm add -D vitest' to enable real test execution.");
        UI.divider();
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError(
          "VITEST_MISSING",
          "Fallback: No real tests were executed because the engine is missing.",
          { exitCode: 1 }
        );
      }
    }
    throw e;
  }
}
