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

    const vitestOptions: any = {
      run: !watch,
      watch: !!watch,
      reporter: json ? "json" : reporter || "default",
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

    // Vitest process will handle its own output and exit codes if run as a process,
    // but here we are using the programmatic API.
    // In programmatic API without watch, it resolves after tests complete.
    const filesState = vitest.state.getFiles();
    const passed = filesState.every(f => f.result?.state === "pass");

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

    const testReport = {
      testRunId,
      network,
      scenariosExecuted: scenarioResults.length,
      passed,
      scenarios: scenarioResults,
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(testResultsPath, JSON.stringify(testReport, null, 2));

    if (!json) {
      UI.divider();
      UI.success(`Scenario execution completed! Report saved to .hardkas/runs/${testRunId}/test-results.json`);
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
      const { getOutput } = await import("../output.js");
      getOutput().writeJson({
        ok: passed,
        command: "test",
        mode: "cli",
        result: testReport
      });
    }

    if (!passed) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "TESTS_FAILED",
        "One or more scenarios failed.",
        { exitCode: 1 }
      );
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
