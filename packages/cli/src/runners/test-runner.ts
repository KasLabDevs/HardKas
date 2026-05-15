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
}

/**
 * HardKAS Test Runner (v1)
 * 
 * Replaces the previous mock with a real discovery and execution engine.
 * Currently uses a thin wrapper around Vitest if available.
 */
export async function runTest(options: TestRunnerOptions): Promise<void> {
  const { files, network, watch, json, reporter } = options;

  if (!json) {
    UI.header("HardKAS Test Runner");
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
  const searchPatterns = files.length > 0 ? files : ["test/**/*.test.ts", "tests/**/*.test.ts"];
  
  if (!json) {
    UI.info(`Searching for tests: ${searchPatterns.join(", ")}`);
  }

  // 3. Vitest Integration (Lazy Load)
  try {
    // Note: In a real implementation, we would use the Vitest Node API (startVitest)
    // For this audit/hardening phase, we implement the discovery and setup logic.
    const { startVitest } = await import("vitest/node");

    const vitestOptions: any = {
      run: !watch,
      watch: !!watch,
      reporter: json ? "json" : (reporter || "default"),
      globals: true,
      environment: "node",
      include: searchPatterns,
      exclude: ["**/node_modules/**", "**/dist/**", "**/.hardkas/**"],
      // Injected environment variables for tests to consume
      env: {
        HARDKAS_NETWORK: network,
        HARDKAS_CWD: process.cwd()
      }
    };

    const vitest = await startVitest("test", searchPatterns, vitestOptions);

    if (!vitest) {
      throw new Error("Failed to initialize test engine.");
    }

    // Vitest process will handle its own output and exit codes if run as a process,
    // but here we are using the programmatic API.
  } catch (e) {
    const error = e as any;
    if (error.code === "ERR_MODULE_NOT_FOUND" || error.message?.includes("vitest")) {
      UI.warning("Vitest is not installed in this project.");
      UI.info("Run 'pnpm add -D vitest' to enable real test execution.");
      UI.divider();
      UI.info("Fallback: No real tests were executed because the engine is missing.");
      process.exit(1);
    }
    throw e;
  }
}
