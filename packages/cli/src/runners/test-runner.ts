import { UI } from "../ui.js";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
 * TEST-NETWORK-EVIDENCE-1 · the observer a run injects into its test files (a vitest setup file written into the run
 * directory): every TCP connection a test file starts — host, port, file — is appended to the run's net-contacts.jsonl.
 * It records and never changes a connection. Facts only: what a contact means is derived by networkEvidenceOf.
 */
export const NET_OBSERVER_SOURCE = `// HardKAS TEST-NETWORK-EVIDENCE-1: written by hardkas test into its run directory, loaded by vitest as a setup file.
// Records every TCP connection a test file starts (host, port, file); the connection itself is left untouched.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { expect } from "vitest";
const runDir = process.env.HARDKAS_TEST_RUN_DIR;
const out = runDir ? path.join(runDir, "net-contacts.jsonl") : undefined;
const proto = net.Socket.prototype;
if (out && !proto.connect.__hardkasNetObserver) {
  const original = proto.connect;
  const observer = function (...args) {
    try {
      const first = Array.isArray(args[0]) ? args[0][0] : args[0];
      let port;
      let host;
      if (first && typeof first === "object") {
        if (first.path === undefined) {
          port = first.port;
          host = first.host;
        }
      } else if (first !== undefined && first !== null && !Number.isNaN(Number(first))) {
        port = first;
        host = typeof args[1] === "string" ? args[1] : undefined;
      }
      if (port !== undefined && port !== null) {
        let file = null;
        try {
          file = expect.getState().testPath ?? null;
        } catch {}
        // hardkas-append-allow: the run's own scratch record, one line per contact; @hardkas/core may not resolve from a test worker
        fs.appendFileSync(out, JSON.stringify({ host: host || "localhost", port: Number(port), file, pid: process.pid }) + "\\n");
      }
    } catch {}
    return original.apply(this, args);
  };
  observer.__hardkasNetObserver = true;
  proto.connect = observer;
}
`;

/** Ports of a Kaspa node's RPC endpoints: the canonical localnet's and rusty-kaspa's defaults (gRPC, wRPC Borsh, wRPC JSON). */
const KASPA_NODE_PORTS = [16110, 17110, 18110, 16210, 17210, 18210, 16510, 17510, 18510, 16610, 17610, 18610];

export interface NetContact {
  host: string;
  port: number;
  file: string | null;
}

export interface NetworkEvidence {
  /** The network the run was asked for. */
  requested: string;
  /** Kaspa node endpoints the test files contacted (attempts included), with the files that did. */
  nodeContacts: { endpoint: string; files: string[] }[];
  /** Every other TCP endpoint they contacted (their own local servers, …): listed, never a node. */
  otherContacts: { endpoint: string; files: string[] }[];
}

/**
 * TEST-NETWORK-EVIDENCE-1 · the run's network, derived from the observed contacts: a run requested on the simulated network
 * whose test files contacted a Kaspa node endpoint (a known node port, or the port of a configured network's rpcUrl) is
 * "mixed"; any other run keeps the requested network. The contacts are reported either way.
 */
export function networkEvidenceOf(
  requested: string,
  contacts: NetContact[],
  workspaceRoot: string,
  configuredNodePorts: number[] = []
): { network: string; evidence: NetworkEvidence } {
  const nodePorts = new Set([...KASPA_NODE_PORTS, ...configuredNodePorts]);
  const group = (list: NetContact[]) => {
    const byEndpoint = new Map<string, Set<string>>();
    for (const c of list) {
      const endpoint = `${c.host}:${c.port}`;
      const file = c.file ? path.relative(workspaceRoot, c.file).replace(/\\/g, "/") : "(outside a test)";
      if (!byEndpoint.has(endpoint)) byEndpoint.set(endpoint, new Set());
      byEndpoint.get(endpoint)!.add(file);
    }
    return [...byEndpoint.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([endpoint, files]) => ({ endpoint, files: [...files].sort() }));
  };
  const nodeContacts = group(contacts.filter((c) => nodePorts.has(c.port)));
  const otherContacts = group(contacts.filter((c) => !nodePorts.has(c.port)));
  const simulated = requested === "simulated" || requested === "simulator";
  return { network: simulated && nodeContacts.length > 0 ? "mixed" : requested, evidence: { requested, nodeContacts, otherContacts } };
}

/** Vite overrides with the observer added to their setup files (the project's own setup files are kept: overrides merge). */
function withNetObserver(viteOverrides: any, observerPath: string): any {
  const test = viteOverrides?.test ?? {};
  const setupFiles = Array.isArray(test.setupFiles) ? test.setupFiles : test.setupFiles ? [test.setupFiles] : [];
  return { ...(viteOverrides ?? {}), test: { ...test, setupFiles: [...setupFiles, observerPath] } };
}

/** The ports of the rpcUrl of every network the workspace configures (best effort: none when the config cannot be read). */
async function configuredRpcPorts(workspaceRoot: string): Promise<number[]> {
  try {
    const { loadHardkasConfig } = await import("@hardkas/config");
    const loaded: any = await loadHardkasConfig({ workspaceRoot });
    const ports: number[] = [];
    for (const n of Object.values(loaded?.config?.networks ?? {}) as any[]) {
      try {
        const port = Number(new URL(String(n?.rpcUrl)).port);
        if (port > 0) ports.push(port);
      } catch {
        // no rpcUrl, or not a URL
      }
    }
    return ports;
  } catch {
    return [];
  }
}

/**
 * TEST-RUNNER-VITEST-INSTANCE-1 · the engine a run starts is the vitest the workspace itself resolves. Its test files,
 * and the packages they load from its node_modules (@hardkas/testing's scenario(), whose vitest is a peer), register
 * their tests on THAT vitest: an engine started from another copy — the CLI's own, found wherever the CLI is installed —
 * holds no suite for them ("Vitest failed to find the current suite") and runs nothing. A workspace without a vitest of
 * its own runs on the CLI's, as before.
 */
export async function loadTestEngine(workspaceRoot: string): Promise<typeof import("vitest/node")> {
  let entry: string | undefined;
  try {
    entry = createRequire(path.join(workspaceRoot, "package.json")).resolve("vitest/node");
  } catch {
    entry = undefined; // no vitest of its own
  }
  return entry ? import(pathToFileURL(entry).href) : import("vitest/node");
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
  // TEST-NETWORK-EVIDENCE-1: what the test files contact is observed in their own processes; the fact stays in the run
  const netContactsPath = path.join(testRunDir, "net-contacts.jsonl");
  const netObserverPath = path.join(testRunDir, "net-observer.mjs");
  await fs.writeFile(netObserverPath, NET_OBSERVER_SOURCE);

  // 4. Vitest Integration (Lazy Load)
  try {
    // Note: In a real implementation, we would use the Vitest Node API (startVitest)
    // For this audit/hardening phase, we implement the discovery and setup logic.
    // TEST-NETWORK-EVIDENCE-1: every start of the engine carries the observer as one more setup file, merged into the
    // project's own configuration (vite overrides add setup files; test options would replace the project's)
    // TEST-RUNNER-VITEST-INSTANCE-1: the workspace's own vitest when it has one
    const { startVitest: startVitestEngine } = await loadTestEngine(workspaceRoot);
    const startVitest: typeof startVitestEngine = (mode, filters, testOptions, viteOverrides, engineOptions) =>
      startVitestEngine(mode, filters, testOptions, withNetObserver(viteOverrides, netObserverPath), engineOptions);

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

    // TEST-JSON-STDOUT-1: under --json the engine's own messages ("JSON report written to …") go to stderr, so stdout carries
    // exactly the envelope
    const vitest = await startVitest("test", [], vitestOptions, undefined, json ? { stdout: process.stderr } : undefined);

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
    const contacts: NetContact[] = await fs.readFile(netContactsPath, "utf8").then(
      (text) => text.split("\n").filter(Boolean).map((line) => JSON.parse(line)),
      () => []
    );
    const { network: observedNetwork, evidence: networkEvidence } = networkEvidenceOf(network, contacts, workspaceRoot, await configuredRpcPorts(workspaceRoot));
    const testReport = {
      testRunId,
      // TEST-NETWORK-EVIDENCE-1: derived from what the test files contacted, not only from the request
      network: observedNetwork,
      networkEvidence,
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
      if (networkEvidence.nodeContacts.length > 0) {
        const where = networkEvidence.nodeContacts.map((c) => `${c.endpoint} (${c.files.join(", ")})`).join("; ");
        const line = `Network: ${observedNetwork} (requested ${network}): test files contacted a Kaspa node: ${where}`;
        if (observedNetwork !== network) UI.warning(line);
        else UI.info(line);
      }
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
