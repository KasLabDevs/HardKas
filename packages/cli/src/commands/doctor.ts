import { Command } from "commander";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { handleError, UI } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";
import { execa } from "execa";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { HardkasSchemas, eventLedgerPath, legacyEventLedgerPath } from "@hardkas/core";
import readline from "node:readline";
import fsSync from "node:fs";
import { invocationWorkspaceRoot } from "../workspace-root.js";
import { EMPTY_EXTENSION_REGISTRY, type ExtensionRegistry } from "../extensions/registry.js";
import { knownExtension } from "../extensions/api.js";
import type { DoctorFlow, DoctorNodeReport, DoctorSectionId } from "../runners/doctor-node-diagnosis.js";

export function registerDoctorCommand(program: Command, extensions: ExtensionRegistry = EMPTY_EXTENSION_REGISTRY) {
  program
    .command("doctor [module]")
    .description(
      `Perform a full system diagnostic and health report: local configuration, then the workspace's node (connectivity, network identity, sync, capability for a flow); mainnet is never contacted ${UI.maturity("stable")}`
    )
    .option("--json", "Output results as stable JSON schema", false)
    .option("--network <name>", "Check the node of this network of hardkas.config.ts (default: the workspace's network; mainnet is refused, a public testnet needs the payments' opt-in)")
    .option("--url <url>", "Check the node at this endpoint, as the node of --network (default: the workspace's network)")
    .option("--flow <flows>", "Report the node's capability for these flows and fail when one is not ready: payment, silver, covenant (comma-separated)")
    .option("--timeout <ms>", "Bound the node check: connect and answer within this many milliseconds (default 8000)")
    .option("--capabilities", "With 'doctor node': report the node's capabilities (RPC, network, DAA advance) as JSON", false)
    .option("--consistency", "Run advanced deterministic consistency checks", false)
    .option(
      "--strict",
      "Run the consistency checks in strict mode and report DOCTOR_FAILED when a check fails (any failed check exits 1)",
      false
    )
    .option("--release", "With 'doctor workspace': also run the release checks (git, schemas, claims, raw appends, browser imports)", false)
    .action(async (moduleStr, opts) => {
      try {
        if (moduleStr === "workspace") {
          // NEW-11: the L1 workspace checks `dev doctor` ran (it moved to the l2 extension with its L2 section)
          const { runWorkspaceDoctor } = await import("../runners/workspace-doctor-runner.js");
          await runWorkspaceDoctor({ json: opts.json, release: opts.release, workspaceRoot: invocationWorkspaceRoot() });
        } else if (moduleStr === "signer") {
          const { runDoctorSigner } = await import("../runners/doctor-signer-runner.js");
          await runDoctorSigner(opts);
        } else if (moduleStr === "node") {
          const { runDoctorNode } = await import("../runners/doctor-node-runner.js");
          await runDoctorNode(opts);
        } else if (moduleStr !== undefined && knownExtension(moduleStr)) {
          // L2-EXT stage 2 (design §3.8): `doctor <extension>` runs that extension's checks, or refuses with its reason
          const { runExtensionDoctor } = await import("./extension.js");
          await runExtensionDoctor(extensions, moduleStr, opts);
        } else {
          // WORKSPACE-AUTHORITY-1 (WA-I0): the invocation's one workspace root
          const healthy = await runDoctorChecks(invocationWorkspaceRoot(), opts);
          // L-02 (3-nov): a report with a failed check is a failed run, exit 1; warnings and skips keep exit 0. The
          // report (human or --json) is unchanged. --strict additionally raises DOCTOR_FAILED.
          if (!healthy && !process.exitCode) process.exitCode = 1;
        }
      } catch (err) {
        handleError(err);
      }
    });
}

/**
 * RC1-R2 (D4) · `hardkas.doctor.v1`: one document, stable keys. `checks` keeps every check (name, category, status,
 * message, as before) and adds its `section` and a typed `code`; `sections` summarizes them in order; `node` says which
 * node was diagnosed and what it proved; `diagnosis.scope` is `partial` when the node's identity or sync could not be
 * established (no node declared, not contacted by policy, not answering), with the code that says why.
 */
export interface DoctorReport {
  schema: "hardkas.doctor.v1";
  version: string;
  timestamp: string;
  diagnosis: { scope: "full" | "partial"; code?: string | undefined; message: string };
  node: DoctorNodeReport;
  sections: Array<{ id: DoctorSectionId; title: string; status: DoctorCheck["status"]; checks: number; failed: number; warnings: number }>;
  checks: DoctorCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
}

export interface DoctorCheck {
  name: string;
  section: DoctorSectionId;
  category: "runtime" | "persistence" | "network" | "security" | "docker" | "consistency" | "env";
  /** A stable, typed code for what the check found (e.g. NODE_NOT_SYNCED, DOCKER_UNREACHABLE). */
  code: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  suggestion?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

type NewCheck = Omit<DoctorCheck, "section"> & { section?: DoctorSectionId };

/**
 * The workspace's network as doctor reads it: its execution default target's network, else `defaultNetwork`
 * (HARDKAS-NETWORK-PORTABILITY-1), and whether it declares a `localnet` target (a user `execution` replaces the
 * built-in one whole, so its targets are the workspace's own); undefined when the config cannot be read or names none.
 */
async function workspaceNetworkOf(
  root: string
): Promise<{ config: any; name: string; network: string; declaresLocalnet: boolean; ownNode: boolean } | undefined> {
  try {
    const { config } = await loadHardkasConfig({ cwd: root });
    const exec: any = (config as any).execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    const name: string | undefined = typeof target?.network === "string" ? target.network : (config as any).defaultNetwork;
    const entry = name ? ((config.networks as any)?.[name] as { network?: unknown } | undefined) : undefined;
    const network = typeof entry?.network === "string" ? entry.network : name;
    const declaresLocalnet = Object.values(exec?.targets ?? {}).some((t: any) => t?.mode === "localnet");
    // RC1-R2 (D4): the default target is an RPC node at an endpoint the workspace declares that is not the canonical
    // localnet's: an operator's own node, which no local Docker serves
    let ownNode = false;
    if (name && target?.mode === "rpc") {
      const { declaredNodeEndpoint } = await import("@hardkas/config");
      const { nodeRpcUrl } = await import("@hardkas/core");
      const declared = declaredNodeEndpoint(config as any, name);
      const norm = (u: string) => u.trim().replace(/\/+$/, "").replace("://localhost:", "://127.0.0.1:");
      ownNode = declared !== undefined && norm(declared) !== norm(nodeRpcUrl());
    }
    return name && network ? { config, name, network, declaresLocalnet, ownNode } : undefined;
  } catch {
    return undefined;
  }
}

export async function runDoctorChecks(
  root: string,
  // HARDKAS-NETWORK-PORTABILITY-1-A: `network: false` (ci verify) never contacts the workspace's endpoint
  opts: {
    json?: boolean;
    consistency?: boolean;
    strict?: boolean;
    quiet?: boolean;
    network?: boolean | string;
    url?: string;
    flow?: string | string[];
    timeout?: string | number;
    onReport?: (report: DoctorReport) => void;
  }
): Promise<boolean> {
  if (opts.json) UI.setJsonMode(true);
  // RC1-R2 (D4): the node options are validated before anything runs (usage errors, exit 2)
  const node = await import("../runners/doctor-node-diagnosis.js");
  const flows: DoctorFlow[] = await node.parseDoctorFlows(opts.flow);
  const timeoutMs = await node.parseDoctorTimeout(opts.timeout);
  const offline = opts.network === false;
  const explicitNetwork = typeof opts.network === "string" ? opts.network : undefined;

  const report: DoctorReport = {
    schema: "hardkas.doctor.v1",
    version: HARDKAS_VERSION,
    timestamp: new Date().toISOString(),
    diagnosis: { scope: "full", message: "" },
    node: { source: "none", contacted: false, timeoutMs },
    sections: [],
    checks: [],
    summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 }
  };

  if (!opts.json && !opts.quiet) {
    UI.box("HardKAS System Doctor", "Operational Health Check");
  }

  const addCheck = (input: NewCheck) => {
    const check: DoctorCheck = { ...input, section: input.section ?? "local-config" };
    report.checks.push(check);
    report.summary.total++;
    if (check.status === "pass") report.summary.passed++;
    else if (check.status === "fail") report.summary.failed++;
    else if (check.status === "warn") report.summary.warnings++;
    else if (check.status === "skip") report.summary.skipped++;
  };

  // --- 1. Runtime Checks ---
  // I-07: judged against the supported runtime the packages' engines pin, not an older floor of the doctor's own
  const { nodeVersionVerdict, SUPPORTED_NODE_VERSION } = await import("../node-policy.js");
  const nodeVerdict = nodeVersionVerdict(process.version);
  addCheck({
    name: "Node.js version",
    category: "runtime",
    code: nodeVerdict.status === "pass" ? "NODE_RUNTIME_SUPPORTED" : "NODE_RUNTIME_UNSUPPORTED",
    status: nodeVerdict.status,
    message: nodeVerdict.message,
    ...(nodeVerdict.status === "pass" ? {} : { suggestion: `Use Node.js ${SUPPORTED_NODE_VERSION}, the only supported runtime.` })
  });

  try {
    const { stdout } = await execa("pnpm", ["-v"]);
    addCheck({
      name: "pnpm",
      category: "runtime",
      code: "PNPM_FOUND",
      status: "pass",
      message: `v${stdout.trim()}`
    });
  } catch {
    addCheck({
      name: "pnpm",
      category: "runtime",
      code: "PNPM_NOT_FOUND",
      status: "fail",
      message: "Not found in PATH",
      suggestion: "Install pnpm (npm install -g pnpm)."
    });
  }

  // --- 2. Persistence Checks ---
  const hardkasDir = path.join(root, ".hardkas");
  let dirExists = false;
  try {
    const stats = await fs.stat(hardkasDir);
    dirExists = stats.isDirectory();
    addCheck({
      name: ".hardkas/ directory",
      category: "persistence",
      code: "WORKSPACE_DIR_PRESENT",
      status: "pass",
      message: "Exists and is active"
    });
  } catch {
    addCheck({
      name: ".hardkas/ directory",
      category: "persistence",
      code: "WORKSPACE_DIR_MISSING",
      status: "fail",
      message: "Not found",
      suggestion: "Run 'hardkas init' to initialize project."
    });
  }

  if (dirExists) {
    try {
      const gitignorePath = path.join(root, ".gitignore");
      const gitignore = await fs.readFile(gitignorePath, "utf-8");
      if (gitignore.includes(".hardkas")) {
        addCheck({
          name: ".gitignore protection",
          category: "persistence",
          code: "GITIGNORE_PROTECTS_WORKSPACE",
          status: "pass",
          message: "Contains .hardkas/"
        });
      } else {
        addCheck({
          name: ".gitignore protection",
          category: "persistence",
          code: "GITIGNORE_MISSING_WORKSPACE",
          status: "warn",
          message: "Does not contain .hardkas/",
          suggestion: "Add '.hardkas/' to your .gitignore to avoid committing artifacts."
        });
      }
    } catch {
      addCheck({
        name: ".gitignore protection",
        category: "persistence",
        code: "GITIGNORE_NOT_FOUND",
        status: "skip",
        message: ".gitignore not found"
      });
    }

    const dbPath = path.join(hardkasDir, "store.db");
    try {
      await fs.access(dbPath);
      addCheck({
        name: "store.db accessibility",
        category: "persistence",
        code: "STORE_DB_PRESENT",
        status: "pass",
        message: "File exists and is accessible"
      });
    } catch {
      addCheck({
        name: "store.db accessibility",
        category: "persistence",
        code: "STORE_DB_MISSING",
        status: "warn",
        message: "store.db not found",
        suggestion: "Run 'hardkas query store rebuild' to populate the index."
      });
    }

    // Locks
    try {
      const files = await fs.readdir(hardkasDir);
      const locks = files.filter((f) => f.endsWith(".lock"));
      if (locks.length === 0) {
        addCheck({
          name: "Workspace locks",
          category: "persistence",
          code: "LOCKS_NONE",
          status: "pass",
          message: "No active or stale locks found"
        });
      } else {
        addCheck({
          name: "Workspace locks",
          category: "persistence",
          code: "LOCKS_FOUND",
          status: "warn",
          message: `${locks.length} lock(s) found`,
          suggestion: "Use 'hardkas lock doctor' to diagnose if they are stale."
        });
      }
    } catch {
      // skip
    }
    // Streams (events.jsonl & telemetry.jsonl)
    const checkStream = async (
      streamName: string,
      streamPath: string,
      schemaValidator: (parsed: any) => boolean
    ) => {
      try {
        const stats = await fs.stat(streamPath);
        if (stats.size === 0) {
          addCheck({
            name: `${streamName} Stream`,
            category: "persistence",
            code: "STREAM_EMPTY",
            status: "pass",
            message: "Stream is empty"
          });
          return;
        }

        // Check missing newline at EOF
        const fd = await fs.open(streamPath, "r");
        const buffer = Buffer.alloc(1);
        await fd.read(buffer, 0, 1, stats.size - 1);
        await fd.close();
        if (buffer.toString() !== "\n") {
          addCheck({
            name: `${streamName} Stream`,
            category: "persistence",
            code: "STREAM_MISSING_TRAILING_NEWLINE",
            status: "fail",
            message: "Missing trailing newline",
            suggestion: "Run 'hardkas repair' to truncate corrupted tail."
          });
          return;
        }

        // Scan line by line
        const fileStream = fsSync.createReadStream(streamPath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        let lineNumber = 0;
        let corrupted = false;

        for await (const line of rl) {
          lineNumber++;
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (!schemaValidator(parsed)) {
              addCheck({
                name: `${streamName} Stream`,
                category: "persistence",
                code: "STREAM_SCHEMA_VIOLATION",
                status: "fail",
                message: `Line ${lineNumber} has valid JSON but violates schema`,
                suggestion: "Run 'hardkas repair' or inspect the stream."
              });
              corrupted = true;
              break;
            }
          } catch {
            addCheck({
              name: `${streamName} Stream`,
              category: "persistence",
              code: "STREAM_CORRUPTED_JSON",
              status: "fail",
              message: `Corrupted JSON at line ${lineNumber}`,
              suggestion: "Run 'hardkas repair' to fix stream."
            });
            corrupted = true;
            break;
          }
        }

        if (!corrupted) {
          addCheck({
            name: `${streamName} Stream`,
            category: "persistence",
            code: "STREAM_VERIFIED",
            status: "pass",
            message: `${lineNumber} events verified`
          });
        }
      } catch {
        addCheck({
          name: `${streamName} Stream`,
          category: "persistence",
          code: "STREAM_NOT_FOUND",
          status: "skip",
          message: "Stream not found"
        });
      }
    };

    await checkStream(
      "Events Ledger",
      eventLedgerPath(root),
      (p) => p && p.schema === HardkasSchemas.Event
    );
    // WORKSPACE-AUTHORITY-1 (A2): a ledger under .hardkas/ is never this workspace's ledger; it is reported, never read
    // or merged
    if (fsSync.existsSync(legacyEventLedgerPath(root))) {
      addCheck({
        name: "Legacy event ledger",
        category: "persistence",
        code: "LEGACY_EVENT_LEDGER",
        status: "warn",
        message: `${legacyEventLedgerPath(root)} is not this workspace's event ledger (${eventLedgerPath(root)}); it is never read or merged`,
        suggestion: "Inspect it, and move it out of .hardkas/ if it holds history you want to keep."
      });
    }
    await checkStream(
      "Telemetry",
      path.join(hardkasDir, "telemetry", "telemetry.jsonl"),
      (p) => p && p.timestamp && p.level
    );
  }

  // --- 3. Security Checks ---
  const keystoreDir = path.join(hardkasDir, "keystore");
  try {
    const stats = await fs.stat(keystoreDir);
    if (stats.isDirectory()) {
      const files = await fs.readdir(keystoreDir);
      let allOk = true;
      for (const file of files) {
        const filePath = path.join(keystoreDir, file);
        const fstats = await fs.stat(filePath);
        // 0600 in octal is 0o600. On windows this check might be tricky but we try.
        if (os.platform() !== "win32") {
          const mode = fstats.mode & 0o777;
          if (mode !== 0o600) allOk = false;
        }
      }

      if (allOk) {
        addCheck({
          name: "Keystore permissions",
          category: "security",
          code: "KEYSTORE_PERMISSIONS_OK",
          status: "pass",
          message: "0600 permissions enforced"
        });
      } else {
        addCheck({
          name: "Keystore permissions",
          category: "security",
          code: "KEYSTORE_PERMISSIONS_RELAXED",
          status: "warn",
          message: "Relaxed permissions detected",
          suggestion: "Ensure .hardkas/keystore/* files are chmod 600."
        });
      }
    }
  } catch {
    // Keystore doesn't exist, skip or pass? Pass means no threat found.
    addCheck({
      name: "Keystore permissions",
      category: "security",
      code: "KEYSTORE_ABSENT",
      status: "pass",
      message: "No keystore found (nothing to secure)"
    });
  }

  // No plaintext check
  if (dirExists) {
    try {
      const files = await fs.readdir(hardkasDir);
      const accountsJson = files.find(
        (f) => f.includes("accounts") && f.endsWith(".json")
      );
      if (accountsJson) {
        const content = await fs.readFile(path.join(hardkasDir, accountsJson), "utf-8");
        if (content.includes("privateKey") && !content.includes("encrypted")) {
          addCheck({
            name: "Plaintext keys check",
            category: "security",
            code: "PLAINTEXT_KEYS_FOUND",
            status: "fail",
            message: "Plaintext private keys detected in artifacts!",
            suggestion: "Use encrypted accounts and avoid --unsafe-plaintext."
          });
        } else {
          addCheck({
            name: "Plaintext keys check",
            category: "security",
            code: "NO_PLAINTEXT_KEYS",
            status: "pass",
            message: "No plaintext keys found in account artifacts"
          });
        }
      }
    } catch {
      // skip
    }
  }

  // --- 4. Docker Checks ---
  // DOCTOR-DOCKER-SCOPE-1: a workspace whose network is public (testnet-<n>, mainnet) and that declares no localnet
  // target runs against the endpoint it declares, never a local node: there an unreachable daemon is reported, not
  // failed. A localnet target needs the daemon: unchanged. `doctor node` and the localnet/node commands check the local
  // node themselves, whatever the workspace's network.
  const { isPublicKaspaNetwork } = await import("@hardkas/config");
  const workspaceNet = await workspaceNetworkOf(root);
  const publicNetwork =
    workspaceNet && isPublicKaspaNetwork(workspaceNet.network) && !workspaceNet.declaresLocalnet ? workspaceNet.network : undefined;
  // RC1-R2 (D4): the same holds for a workspace whose node is its own declared RPC node (not the canonical localnet's
  // endpoint) and that declares no localnet target: no local Docker serves it
  const ownNodeNetwork = !publicNetwork && workspaceNet?.ownNode && !workspaceNet.declaresLocalnet ? workspaceNet.network : undefined;
  let dockerDaemonOk = false;
  try {
    await execa("docker", ["info"]);
    dockerDaemonOk = true;
    addCheck({
      name: "Docker daemon",
      category: "docker",
      code: "DOCKER_REACHABLE",
      status: "pass",
      message: "Reachable"
    });
  } catch {
    addCheck(
      publicNetwork || ownNodeNetwork
        ? {
            name: "Docker daemon",
            category: "docker",
            code: "DOCKER_NOT_NEEDED",
            status: "skip",
            message: `Not reachable; not needed by this workspace: it runs on ${publicNetwork ?? ownNodeNetwork} through the endpoint it declares and has no localnet target (the localnet and node commands, and 'hardkas doctor node', need it)`
          }
        : {
            name: "Docker daemon",
            category: "docker",
            code: "DOCKER_UNREACHABLE",
            status: "fail",
            message: "Not reachable",
            suggestion: "Ensure Docker is running."
          }
    );
  }

  if (dockerDaemonOk) {
    // RC1-R2 (D4): the image the managed localnet runs, read from the pin; the node itself is the node section's (which
    // contacts the managed localnet only when it is the workspace's node), never probed here
    const { CANONICAL_LOCALNET } = await import("@hardkas/core");
    addCheck({
      name: "kaspad image",
      category: "docker",
      code: "KASPAD_IMAGE_PINNED",
      status: "pass",
      message: process.env.HARDKAS_KASPAD_IMAGE ?? CANONICAL_LOCALNET.image
    });
  }

  // --- 4.5. Environment Checks ---
  let envContent = "";
  try {
    envContent = await fs.readFile(path.join(root, ".env"), "utf8");
    addCheck({
      name: ".env file",
      category: "env",
      code: "ENV_FILE_PRESENT",
      status: "pass",
      message: "Present in workspace"
    });

    // SURFACE-TRUTH-1B (ST-J): the contract of `hardkas env check` (one registry, `checkEnvironment`). The former check
    // required the deployment profile (NETWORK, KASPAD_URL, HARDKAS_DATA_DIR, HARDKAS_KASPAD_IMAGE, LOG_LEVEL) of any .env,
    // although HardKAS reads none of them but HARDKAS_KASPAD_IMAGE, so `ci verify` failed in every workspace whose .env
    // only held the app's variables.
    const { checkEnvironment, parseDotEnv } = await import("./env.js");
    const envReport = checkEnvironment(process.env, parseDotEnv(envContent));
    const profile = envReport.deployProfile
      ? `; deployment profile (informational): ${envReport.deployProfile.missing.length ? `${envReport.deployProfile.missing.join(", ")} not set` : "complete"}`
      : "";
    if (envReport.unknown.length === 0 && envReport.warnings.length > 0) {
      // R-08: known variables whose value relaxes a safety policy for every command are a warning, not a pass
      addCheck({
        name: "HARDKAS_* environment",
        category: "env",
        code: "ENV_VARS_RELAX_POLICY",
        status: "warn",
        message: `Every HARDKAS_* variable set is one HardKAS reads; relaxes a policy: ${envReport.warnings.map((w) => `${w.name} (${w.message})`).join("; ")}${profile}`,
        suggestion: "Unset the variable and use the per-command option where one exists (silver: --allow-unverified-runner)."
      });
    } else if (envReport.unknown.length === 0) {
      addCheck({
        name: "HARDKAS_* environment",
        category: "env",
        code: "ENV_VARS_KNOWN",
        status: "pass",
        message: `Every HARDKAS_* variable set is one HardKAS reads${profile}`
      });
    } else {
      addCheck({
        name: "HARDKAS_* environment",
        category: "env",
        code: "ENV_VARS_UNKNOWN",
        status: "fail",
        message: `Not variables HardKAS reads: ${envReport.unknown.join(", ")}${profile}`,
        suggestion: "Run 'hardkas env check' to see the variables HardKAS honours."
      });
    }
  } catch {
    addCheck({
      name: ".env file",
      category: "env",
      code: "ENV_FILE_MISSING",
      status: "warn",
      message: "No .env file found",
      suggestion: "Create a .env file for production deployment."
    });
  }

  // --- 5. Consistency Checks ---
  if (opts.consistency && dirExists) {
    // WORKSPACE-AUTHORITY-1 (WA-I3): the projection is observed, never created or migrated by a diagnosis
    let consistencyStore: any = null;
    try {
      const { HardkasStore } = await import("@hardkas/query-store");
      consistencyStore = HardkasStore.openExisting(path.join(root, ".hardkas", "store.db"));
      if (!consistencyStore) {
        throw Object.assign(
          new Error("There is no query projection to check: the query commands read the workspace directly."),
          { code: "PROJECTION_ABSENT" }
        );
      }

      const { HardkasIndexer } = await import("@hardkas/query-store");
      const indexer = new HardkasIndexer(consistencyStore.getDatabase(), {
        cwd: root,
        strict: opts.strict ? true : false
      });
      const idxReport = indexer.doctor();

      if (idxReport.corruptedFiles.length > 0) {
        addCheck({
          name: "Artifact Integrity",
          category: "consistency",
          code: "ARTIFACTS_CORRUPTED",
          status: "fail",
          message: `${idxReport.corruptedFiles.length} corrupted artifact(s) found`,
          suggestion: "Use 'hardkas artifact verify' to identify corrupted files."
        });
      } else {
        addCheck({
          name: "Artifact Integrity",
          category: "consistency",
          code: "ARTIFACTS_SOUND",
          status: "pass",
          message: "All indexed artifacts are structurally sound"
        });
      }

      if (idxReport.orphanEdges > 0) {
        addCheck({
          name: "Lineage Continuity",
          category: "consistency",
          code: "LINEAGE_ORPHAN_EDGES",
          status: "fail",
          message: `${idxReport.orphanEdges} orphan lineage edge(s) found`,
          suggestion: "Lineage graph is broken. Re-index or fix dependencies."
        });
      } else {
        addCheck({
          name: "Lineage Continuity",
          category: "consistency",
          code: "LINEAGE_CONNECTED",
          status: "pass",
          message: "Lineage graph is fully connected"
        });
      }

      if (idxReport.duplicateProjections > 0) {
        addCheck({
          name: "Projection Uniqueness",
          category: "consistency",
          code: "PROJECTION_DUPLICATES",
          status: "fail",
          message: `${idxReport.duplicateProjections} duplicate projection(s) detected`,
          suggestion: "Multiple artifacts claim the same tx_id. Indexer rebuild required."
        });
      } else {
        addCheck({
          name: "Projection Uniqueness",
          category: "consistency",
          code: "PROJECTION_UNIQUE",
          status: "pass",
          message: "All state projections are unique"
        });
      }

      if (idxReport.brokenReplayDependencies > 0) {
        addCheck({
          name: "Replay Dependencies",
          category: "consistency",
          code: "REPLAY_DEPENDENCIES_BROKEN",
          status: "fail",
          message: `${idxReport.brokenReplayDependencies} broken replay dependency(s)`,
          suggestion: "Replay reports exist for missing target artifacts."
        });
      } else {
        addCheck({
          name: "Replay Dependencies",
          category: "consistency",
          code: "REPLAY_DEPENDENCIES_VALID",
          status: "pass",
          message: "All replay reports reference valid artifacts"
        });
      }

      if (idxReport.duplicateEventSequences > 0) {
        // WORKSPACE-AUTHORITY-1 (A): the index keeps one row per event identity, so distinct events that share a
        // (correlation, sequence, kind) position are the ledger's own data, not a projection defect
        addCheck({
          name: "Event Deduplication",
          category: "consistency",
          code: "EVENT_SEQUENCES_SHARED",
          status: "warn",
          message: `${idxReport.duplicateEventSequences} sequence position(s) shared by distinct events (each event is indexed)`,
          suggestion:
            "The producers of these events reuse a sequence number within a correlation ID; no rebuild is needed."
        });
      } else {
        addCheck({
          name: "Event Deduplication",
          category: "consistency",
          code: "EVENT_SEQUENCES_UNIQUE",
          status: "pass",
          message: "All event sequences are unique"
        });
      }

      if (idxReport.orphanEvents > 0) {
        addCheck({
          name: "Event Causality",
          category: "consistency",
          code: "EVENT_ORPHANS",
          status: "fail",
          message: `${idxReport.orphanEvents} orphan event(s) found`,
          suggestion: "Events reference missing causation IDs. Check event log integrity."
        });
      } else {
        addCheck({
          name: "Event Causality",
          category: "consistency",
          code: "EVENT_CAUSALITY_CONNECTED",
          status: "pass",
          message: "Event causality graph is fully connected"
        });
      }
    } catch (err: any) {
      addCheck(
        err?.code === "PROJECTION_ABSENT"
          ? { name: "Consistency Engine", category: "consistency", code: "PROJECTION_ABSENT", status: "skip", message: err.message }
          : {
              name: "Consistency Engine",
              category: "consistency",
              code: "CONSISTENCY_ENGINE_FAILED",
              status: "fail",
              message: `Failed to run consistency checks: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`
            }
      );
    } finally {
      consistencyStore?.disconnect();
    }

    // 6. Snapshot Integrity Checks
    const snapshotsDir = path.join(root, "snapshots");
    try {
      const { readSnapshotManifest } = await import("@hardkas/core");
      const fs = await import("node:fs/promises");
      const stats = await fs.stat(snapshotsDir);

      if (stats.isDirectory()) {
        const snapshots = await fs.readdir(snapshotsDir);
        let brokenSnapshots = 0;

        for (const snap of snapshots) {
          try {
            const manifest = await readSnapshotManifest(path.join(snapshotsDir, snap));
            if (!manifest || !manifest.snapshotVersion) brokenSnapshots++;
          } catch {
            brokenSnapshots++;
          }
        }

        if (brokenSnapshots > 0) {
          addCheck({
            name: "Snapshot Integrity",
            category: "persistence",
            code: "SNAPSHOTS_INVALID",
            status: "fail",
            message: `${brokenSnapshots} invalid snapshot(s) found`,
            suggestion: "Remove broken snapshots from the snapshots/ directory."
          });
        } else {
          addCheck({
            name: "Snapshot Integrity",
            category: "persistence",
            code: "SNAPSHOTS_VERIFIED",
            status: "pass",
            message: `${snapshots.length} snapshot(s) verified`
          });
        }
      }
    } catch {
      // Snapshots dir doesn't exist, which is fine
    }
  }

  // --- 6. The node: connectivity, network identity, sync, capability (RC1-R2 · D4) ---
  // It replaces HARDKAS-NETWORK-PORTABILITY-1 C6 (the public endpoint only) and the canonical localnet's RPC probe that
  // ran in every workspace: now the workspace's own node (or --url/--network), whatever its network, with a bounded
  // timeout; mainnet and a public testnet without the payments' opt-in are never contacted; the canonical localnet only
  // when it is the workspace's node and Docker reports it running.
  const diagnosis = await node.diagnoseNode({
    root,
    url: opts.url,
    network: explicitNetwork,
    flows,
    timeoutMs,
    offline,
    dockerReachable: dockerDaemonOk
  });
  for (const c of diagnosis.checks) addCheck(c);
  report.node = diagnosis.node;
  report.diagnosis = diagnosis.partial
    ? {
        scope: "partial",
        code: diagnosis.partial.code,
        message: `partial diagnosis: ${diagnosis.partial.message}; the local configuration was checked, the node's identity and sync were not all established`
      }
    : { scope: "full", message: "local configuration and the node (connectivity, network identity, sync, capability) were checked" };

  for (const s of node.DOCTOR_SECTIONS) {
    const of = report.checks.filter((c) => c.section === s.id);
    const failed = of.filter((c) => c.status === "fail").length;
    const warnings = of.filter((c) => c.status === "warn").length;
    report.sections.push({
      id: s.id,
      title: s.title,
      status: failed > 0 ? "fail" : warnings > 0 ? "warn" : of.some((c) => c.status === "pass") ? "pass" : "skip",
      checks: of.length,
      failed,
      warnings
    });
  }

  if (opts.json) {
    UI.writeJson(report);
  } else if (!opts.quiet) {
    for (const s of node.DOCTOR_SECTIONS) {
      const of = report.checks.filter((c) => c.section === s.id);
      if (of.length === 0) continue;
      UI.logHuman(`  ${pc.bold(s.title)}`);
      for (const check of of) {
        let icon = pc.green("✅");
        if (check.status === "fail") icon = pc.red("❌");
        if (check.status === "warn") icon = pc.yellow("⚠️");
        if (check.status === "skip") icon = pc.gray("⏭️");
        UI.logHuman(`  ${icon} ${pc.bold(check.name)}: ${check.message} ${pc.dim(`[${check.code}]`)}`);
        if (check.suggestion && check.status !== "pass") {
          UI.logHuman(`     ${pc.dim("Suggestion: " + check.suggestion)}`);
        }
      }
    }
    UI.divider();
    if (report.diagnosis.scope === "partial") {
      UI.logHuman(`  ${pc.yellow(`Partial diagnosis [${report.diagnosis.code}]`)}: ${report.diagnosis.message.replace(/^partial diagnosis: /, "")}`);
    }
    UI.logHuman(
      `  Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warnings} warning, ${report.summary.skipped} skipped`
    );
    // SURFACE-TRUTH-1B: the footer named `capabilities`, a hidden command; hidden means not advertised.
  }

  if (opts.strict && report.summary.failed > 0) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "DOCTOR_FAILED",
      "Strict mode: Doctor health checks failed.",
      { exitCode: HardkasExitCode.RUNTIME_FAILURE }
    );
  }

  // INT9 · CLI-CONTRACT-2B C5: a caller (ci verify) can name which checks failed
  opts.onReport?.(report);
  return report.summary.failed === 0;
}
