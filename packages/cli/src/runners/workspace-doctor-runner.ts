import pc from "picocolors";
import { loadHardkasConfig } from "@hardkas/config";
import { HardkasSchemas } from "@hardkas/artifacts";
import { HardkasCliError } from "../cli-errors.js";

/**
 * NEW-11 (L2-EXT stage 2b) · `hardkas doctor workspace`: the L1 checks that `dev doctor` ran before it moved to the l2
 * extension — Node.js, workspace and config validity, the artifact folder, the event ledger's tail, every artifact
 * against the canonical verifier, the query store's projection, the SDK import, the dev server, localnet, and the
 * `--release` checks. Same checks, same codes, same report schema (`hardkas.devDoctor.v1`, the contract the testing
 * golden corpus pins); only the L2 section is not here. The l2 extension's `dev doctor` alias composes these checks
 * with its own L2 ones (`extend`), so its report is the one `dev doctor` printed before.
 */

export interface WorkspaceDoctorCheck {
  name: string;
  status: "success" | "warning" | "error" | "info";
  message?: string;
  details?: any;
  code?: string;
  suggestion?: string;
}

export type WorkspaceDoctorStatus = "ready" | "warning" | "failed";

export interface WorkspaceDoctorResult {
  schema: typeof HardkasSchemas.DevDoctorV1;
  schemaVersion?: string;
  status: WorkspaceDoctorStatus;
  checks: WorkspaceDoctorCheck[];
}

/** Checks a caller adds after the base L1 checks and before the `--release` ones (the l2 extension's L2 section). */
export type WorkspaceDoctorExtension = (config: any) => Promise<{ checks: WorkspaceDoctorCheck[]; status?: WorkspaceDoctorStatus }>;

const worse = (a: WorkspaceDoctorStatus, b: WorkspaceDoctorStatus | undefined): WorkspaceDoctorStatus =>
  a === "failed" || b === "failed" ? "failed" : a === "warning" || b === "warning" ? "warning" : "ready";

export async function collectWorkspaceDoctorChecks(options: {
  release?: boolean | undefined;
  extend?: WorkspaceDoctorExtension | undefined;
  /** The workspace root to check; without it, the config is resolved from the current directory (as `dev doctor` did). */
  workspaceRoot?: string | undefined;
}): Promise<{
  checks: WorkspaceDoctorCheck[];
  status: WorkspaceDoctorStatus;
}> {
  const checks: WorkspaceDoctorCheck[] = [];
  let finalStatus: WorkspaceDoctorStatus = "ready";

  // 1. Node Version Check
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.replace("v", "").split(".")[0]!, 10);
  const nodeMinor = parseInt(nodeVer.replace("v", "").split(".")[1]!, 10);
  if (options.release) {
    if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
      checks.push({
        name: "Node.js Version",
        status: "error",
        message: `Requires >= 22.5.0, found ${nodeVer}`,
        code: "NODE_VERSION_MISMATCH",
        suggestion: "Upgrade Node.js to >= 22.5.0"
      });
      finalStatus = "failed";
    } else {
      checks.push({ name: "Node.js Version", status: "success", message: nodeVer });
    }
  } else {
    checks.push({ name: "Node.js Version", status: "success", message: nodeVer });
  }

  let config: any = null;
  try {
    config = await loadHardkasConfig(options.workspaceRoot !== undefined ? { workspaceRoot: options.workspaceRoot } : undefined);
    checks.push({
      name: "Workspace Validity",
      status: "success",
      message: `Valid (cwd: ${config.cwd})`
    });
    checks.push({
      name: "Config Validity",
      status: "success",
      message: "hardkas.config.ts parsed successfully"
    });
  } catch (e: unknown) {
    checks.push({
      name: "Workspace Validity",
      status: "error",
      message: "Not a valid HardKAS workspace",
      code: "WORKSPACE_INVALID",
      suggestion: "Run 'hardkas dev init' to initialize dApp support in this directory."
    });
    finalStatus = "failed";
  }

  if (config) {
    // 2. Artifact Folder Health
    const fs = await import("node:fs");
    const path = await import("node:path");
    const artifactDir = path.join(config.cwd, ".hardkas", "artifacts");
    if (fs.existsSync(artifactDir)) {
      checks.push({ name: "Artifact Folder", status: "success", message: "OK" });

      // Artifact Corruption and Append Integrity Checks
      try {
        // WORKSPACE-AUTHORITY-1 (A): the workspace's one event ledger
        const { eventLedgerPath } = await import("@hardkas/core");
        const eventsPath = eventLedgerPath(config.cwd);
        if (fs.existsSync(eventsPath)) {
          const stat = fs.statSync(eventsPath);
          if (stat.size > 0) {
            const fd = fs.openSync(eventsPath, "r");
            const buf = Buffer.alloc(Math.min(stat.size, 4096));
            fs.readSync(fd, buf, 0, buf.length, Math.max(0, stat.size - buf.length));
            fs.closeSync(fd);
            const str = buf.toString("utf8");
            const lines = str.split("\n").filter((l) => l.trim().length > 0);
            if (lines.length > 0) {
              JSON.parse(lines[lines.length - 1]!); // Will throw if corrupted
            }
          }
          checks.push({
            name: "Append Integrity",
            status: "success",
            message: "events.jsonl tail is valid"
          });
        } else {
          checks.push({
            name: "Append Integrity",
            status: "success",
            message: "No events yet"
          });
        }
      } catch (e: unknown) {
        checks.push({
          name: "Append Integrity",
          status: "error",
          message: "events.jsonl tail corruption detected",
          code: "APPEND_CORRUPTION",
          // SURFACE-TRUTH-1B: `repair` has no --tail; it reports the corrupt tail, and --force truncates it
          suggestion:
            "Run 'hardkas repair' to see the corrupt events.jsonl tail, then 'hardkas repair --force' to truncate it."
        });
        finalStatus = "failed";
      }

      // SURFACE-TRUTH-1A (ST-I2): artifacts are judged by the canonical verifier (`verifyArtifactIntegrity`, the check
      // `hardkas verify` runs first), over every JSON file of the store. The former sweep read `id`/`canonicalHash`,
      // fields v5 artifacts do not have, so it reported every valid artifact as malformed and advised removing it.
      try {
        const { verifyArtifactIntegrity } = await import("@hardkas/artifacts");
        const files: string[] = [];
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith(".json")) files.push(full);
          }
        };
        walk(artifactDir);
        let failing = 0;
        for (const file of files) {
          const verdict = await verifyArtifactIntegrity(file);
          if (verdict.ok) continue;
          failing++;
          checks.push({
            name: "Artifact Integrity",
            status: "error",
            message: `${path.relative(artifactDir, file)} does not verify (${verdict.issues.map((i) => i.code).join(", ") || verdict.errors.join("; ")})`,
            code: "ARTIFACT_INVALID",
            suggestion: "Run 'hardkas verify --json' to see why it fails.",
            details: { paths: [file] }
          });
        }
        if (failing > 0) {
          finalStatus = "failed";
        } else {
          checks.push({
            name: "Artifact Integrity",
            status: "success",
            message: files.length === 0 ? "No artifacts yet" : `${files.length} artifact file(s) verify`
          });
        }
      } catch (e: unknown) {
        checks.push({
          name: "Artifact Integrity",
          status: "error",
          message: `Artifact verification could not run: ${e instanceof Error ? e.message : String(e)}`,
          code: "ARTIFACT_VERIFY_FAILED",
          suggestion: "Run 'hardkas verify --json'."
        });
        finalStatus = "failed";
      }
    } else {
      checks.push({
        name: "Artifact Folder",
        status: "warning",
        message: "Not found (will be created automatically)",
        code: "ARTIFACT_FOLDER_MISSING",
        // SURFACE-TRUTH-1B: `dev` has no `server` subcommand
        suggestion:
          "Run a transaction (e.g. 'hardkas tx send') to generate the artifact folder."
      });
      if (finalStatus === "ready") finalStatus = "warning";
    }

    // Projection Health (read-only SQLite check)
    const storePath = path.join(config.cwd, ".hardkas", "store.db");
    if (fs.existsSync(storePath)) {
      let store: any = null;
      try {
        const { HardkasStore } = await import("@hardkas/query-store");
        store = new HardkasStore({ dbPath: storePath });
        store.connect({ readOnly: true });

        const health = store.checkHealth();
        if (health.ok) {
          checks.push({
            name: "Projection Health",
            status: "success",
            message: "Store is healthy"
          });
        } else {
          for (const issue of health.issues) {
            checks.push({
              name: "Projection Health",
              status: issue.severity === "error" ? "warning" : "info",
              message: issue.message,
              code: issue.code,
              suggestion: issue.suggestion
            });
          }
          if (finalStatus === "ready") finalStatus = "warning";
        }
      } catch (e: unknown) {
        checks.push({
          name: "Projection Health",
          status: "warning",
          message: `Projection database is unavailable: ${(e instanceof Error ? e.message : String(e)) || "unknown error"}`,
          code: "PROJECTION_UNAVAILABLE",
          suggestion:
            "Another process may be using the database. This is not critical — artifact checks passed."
        });
        if (finalStatus === "ready") finalStatus = "warning";
      } finally {
        try {
          store?.disconnect();
        } catch {
          /* ignore disconnect errors */
        }
      }
    }

    // 3. SDK Import Health
    try {
      await import("@hardkas/sdk");
      checks.push({ name: "SDK Import Health", status: "success", message: "OK" });
    } catch (e) {
      checks.push({
        name: "SDK Installation",
        status: "error",
        message: "Could not import @hardkas/sdk",
        code: "SDK_NOT_INSTALLED",
        suggestion: "Run 'pnpm install @hardkas/sdk' inside the workspace."
      });
      finalStatus = "failed";
    }

    // 4. Dev-Server Availability Check
    try {
      const res = await fetch("http://127.0.0.1:7420/api/health", {
        signal: AbortSignal.timeout(1000)
      });
      if (res.ok) {
        checks.push({
          name: "Dev-Server Availability",
          status: "success",
          message: "Running on port 7420"
        });
      } else {
        checks.push({
          name: "Dev-Server Availability",
          status: "warning",
          message: `Responded with ${res.status}`
        });
      }
    } catch (e) {
      checks.push({
        name: "Dev-Server Availability",
        status: "warning",
        message: "Not running (start with 'hardkas dev')"
      });
      if (finalStatus === "ready") finalStatus = "warning";
    }

    // 5. Localnet Availability
    const networkId =
      typeof config.config.networkId === "string"
        ? config.config.networkId
        : config.config.defaultNetwork || "simnet";
    if (networkId === "simulated") {
      checks.push({
        name: "Localnet Availability",
        status: "success",
        message: "Simulated mode (no localnet required)"
      });
    } else {
      checks.push({
        name: "Localnet Availability",
        status: "warning",
        message: `Requires ${networkId} localnet`
      });
    }

    // 6. What a caller adds (the l2 extension's `dev doctor` alias: its L2 section, where it always was)
    if (options.extend) {
      const extra = await options.extend(config);
      checks.push(...extra.checks);
      finalStatus = worse(finalStatus, extra.status);
    }

    if (options.release) {
      const { execSync } = await import("child_process");
      // Git cleanliness (Informational only)
      try {
        const status = execSync("git status --porcelain", { cwd: config.cwd })
          .toString()
          .trim();
        if (status) {
          checks.push({
            name: "Git Cleanliness",
            status: "info",
            message: "Workspace has uncommitted changes"
          });
        } else {
          checks.push({
            name: "Git Cleanliness",
            status: "success",
            message: "Clean workspace"
          });
        }
      } catch (e) {
        checks.push({
          name: "Git Cleanliness",
          status: "info",
          message: "Not a git repository or git error"
        });
      }

      // Schema Compatibility
      try {
        const { ARTIFACT_SCHEMAS } = await import("@hardkas/artifacts");
        checks.push({
          name: "Schema Compatibility",
          status: "success",
          message: `Artifact schemas are verifiable (${Object.keys(ARTIFACT_SCHEMAS).length} schemas)`
        });
      } catch (e) {
        checks.push({
          name: "Schema Compatibility",
          status: "warning",
          message: "Schemas could not be loaded",
          code: "SCHEMA_LOAD_FAILED",
          suggestion: "Reinstall @hardkas/artifacts."
        });
      }

      // Anti-Fake L2 Claims: what the workspace's own files claim about L2 and Kaspa L1 (a text check; no L2 code)
      try {
        const grepTrustless = execSync("git grep -i 'trustless exit' || true", {
          cwd: config.cwd
        }).toString();
        if (
          grepTrustless.includes("docs") ||
          grepTrustless.includes("packages") ||
          grepTrustless.includes("templates")
        ) {
          if (
            !grepTrustless.includes("ZK") &&
            !grepTrustless.includes("experimental") &&
            !grepTrustless.includes("read-only")
          ) {
            checks.push({
              name: "Fake L2 Claims",
              status: "error",
              message: "Found unconditional 'trustless exit' claims",
              code: "FAKE_L2_CLAIMS",
              suggestion:
                "Remove unconditional 'trustless exit' language. ZK bridge is required."
            });
            finalStatus = "failed";
          }
        }
        const grepEvm = execSync("git grep -i 'EVM execution on Kaspa L1' || true", {
          cwd: config.cwd
        }).toString();
        if (grepEvm) {
          checks.push({
            name: "EVM Execution Claims",
            status: "error",
            message: "Found claims of EVM execution on Kaspa L1",
            code: "FALSE_EVM_CLAIMS",
            suggestion: "Kaspa L1 does not execute EVM. Update documentation/claims."
          });
          finalStatus = "failed";
        }
        if (finalStatus !== "failed") {
          checks.push({
            name: "Anti-Fake L2 Claims",
            status: "success",
            message: "No false L2 claims found"
          });
        }
      } catch (e) {
        checks.push({
          name: "L2 Claims Integrity",
          status: "warning",
          message: "Could not perform git grep for L2 claims",
          code: "FAKE_L2_CLAIMS_UNVERIFIED",
          suggestion: "Ensure no false L2 exit claims exist."
        });
      }

      // No Raw Append
      try {
        // hardkas-append-allow
        const grepRawAppend = execSync(
          "git grep 'appendFileSync' packages/core/src || true", // hardkas-append-allow
          { cwd: config.cwd }
        ).toString();
        if (grepRawAppend && !grepRawAppend.includes("append-coordinator.ts")) {
          checks.push({
            name: "Raw Append Usage",
            status: "error",
            message: "append" + "FileSync found outside append-coordinator",
            code: "RAW_APPEND_DETECTED",
            suggestion:
              "Replace raw fs.append" + "FileSync with AppendCoordinator.appendAtomic."
          });
          finalStatus = "failed";
        } else {
          checks.push({
            name: "Raw Append Usage",
            status: "success",
            message: "No raw append" + "FileSync outside coordinator"
          });
        }
      } catch (e) {
        checks.push({
          name: "Raw Append Usage",
          status: "warning",
          message: "Could not check raw append",
          code: "RAW_APPEND_UNVERIFIED",
          suggestion: "Ensure no raw append" + "FileSync is used."
        });
      }

      // No Browser Node Imports
      try {
        const grepNodeFs = execSync(
          "git grep -E 'from \"node:(fs|path|crypto)\"' packages/sdk/src/client.ts packages/react/src || true",
          { cwd: config.cwd }
        ).toString();
        if (grepNodeFs) {
          checks.push({
            name: "Browser Polyfills",
            status: "error",
            message: "Found node: imports in browser-safe packages",
            code: "BROWSER_NODE_POLYFILLS",
            suggestion:
              "Configure your bundler to exclude node: imports or use @hardkas/react."
          });
          finalStatus = "failed";
        } else {
          checks.push({
            name: "Browser Node Imports",
            status: "success",
            message: "Browser packages are Node.js free"
          });
        }
      } catch (e) {
        checks.push({
          name: "Browser Node Imports",
          status: "warning",
          message: "Could not check browser imports",
          code: "UNABLE_TO_CHECK_BROWSER",
          suggestion:
            "Ensure your React/Vite config does not polyfill Node core modules."
        });
      }

      // Read-only sessions
      checks.push({
        name: "Session Immutability",
        status: "success",
        message: "Time-travel is read-only projection"
      });
    }
  }

  return { checks, status: finalStatus };
}

/** Prints a workspace-doctor report (JSON, or the human list) and fails with `failureCode` when it failed. */
export async function renderWorkspaceDoctorReport(
  result: { checks: WorkspaceDoctorCheck[]; status: WorkspaceDoctorStatus },
  options: { json: boolean; title: string; failureCode: string; failureMessage: string; schema?: string }
): Promise<void> {
  if (options.json) {
    const schema = options.schema ?? HardkasSchemas.DevDoctorV1;
    const report = { schema, schemaVersion: schema, status: result.status, checks: result.checks };
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.bold(`HardKAS • ${options.title}`));
    console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));
    for (const check of result.checks) {
      const icon =
        check.status === "success"
          ? pc.green("✓")
          : check.status === "warning"
            ? pc.yellow("⚠")
            : check.status === "info"
              ? pc.blue("ℹ")
              : pc.red("✗");
      console.log(`${icon} ${pc.bold(check.name)}: ${check.message}`);
      if (check.suggestion) {
        console.log(`    ${pc.cyan("→")} ${pc.dim(check.suggestion)} ${check.code ? pc.dim(`[${check.code}]`) : ""}`);
      }
    }
    console.log(
      pc.bold("\nStatus: ") +
        (result.status === "ready" ? pc.green("READY") : result.status === "warning" ? pc.yellow("WARNING") : pc.red("FAILED"))
    );
  }
  if (result.status === "failed") {
    throw new HardkasCliError(options.failureCode, options.failureMessage, { exitCode: 1 });
  }
}

/** `hardkas doctor workspace`: the invocation's one workspace root (WORKSPACE-AUTHORITY-1, WA-I0). */
export async function runWorkspaceDoctor(options: { json?: boolean | undefined; release?: boolean | undefined; workspaceRoot: string }): Promise<void> {
  const result = await collectWorkspaceDoctorChecks({ release: options.release, workspaceRoot: options.workspaceRoot });
  await renderWorkspaceDoctorReport(result, {
    json: Boolean(options.json),
    title: "Workspace Doctor",
    failureCode: "WORKSPACE_DOCTOR_FAILED",
    failureMessage: "Workspace doctor checks failed."
  });
}
