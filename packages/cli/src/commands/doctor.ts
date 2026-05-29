import { Command } from "commander";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { handleError, UI } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { HardkasStore } from "@hardkas/query-store";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { execa } from "execa";
import { HARDKAS_VERSION } from "@hardkas/artifacts";
import readline from "node:readline";
import fsSync from "node:fs";

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description(
      `Perform a full system diagnostic and health report ${UI.maturity("stable")}`
    )
    .option("--json", "Output results as stable JSON schema", false)
    .option("--consistency", "Run advanced deterministic consistency checks", false)
    .option(
      "--strict",
      "Fail strictly (exit 1) if invariants or consistency checks fail",
      false
    )
    .action(async (opts) => {
      try {
        await runDoctorChecks(process.cwd(), opts);
      } catch (err) {
        handleError(err);
      }
    });
}

interface DoctorReport {
  version: string;
  timestamp: string;
  checks: DoctorCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
}

interface DoctorCheck {
  name: string;
  category: "runtime" | "persistence" | "network" | "security" | "docker" | "consistency";
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  suggestion?: string | undefined;
}

export async function runDoctorChecks(
  root: string,
  opts: { json?: boolean; consistency?: boolean; strict?: boolean; quiet?: boolean }
): Promise<boolean> {
  if (opts.json) UI.setJsonMode(true);

  const report: DoctorReport = {
    version: HARDKAS_VERSION,
    timestamp: new Date().toISOString(),
    checks: [],
    summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 }
  };

  if (!opts.json && !opts.quiet) {
    UI.box("HardKAS System Doctor", "Operational Health Check");
  }

  const addCheck = (check: DoctorCheck) => {
    report.checks.push(check);
    report.summary.total++;
    if (check.status === "pass") report.summary.passed++;
    else if (check.status === "fail") report.summary.failed++;
    else if (check.status === "warn") report.summary.warnings++;
    else if (check.status === "skip") report.summary.skipped++;

    if (!opts.json && !opts.quiet) {
      let icon = pc.green("✅");
      if (check.status === "fail") icon = pc.red("❌");
      if (check.status === "warn") icon = pc.yellow("⚠️");
      if (check.status === "skip") icon = pc.gray("⏭️");

      UI.logHuman(`  ${icon} ${pc.bold(check.name)}: ${check.message}`);
      if (check.suggestion && check.status !== "pass") {
        UI.logHuman(`     ${pc.dim("Suggestion: " + check.suggestion)}`);
      }
    }
  };

  // --- 1. Runtime Checks ---
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.slice(1).split(".")[0]!);
  if (nodeMajor >= 18) {
    addCheck({
      name: "Node.js version",
      category: "runtime",
      status: "pass",
      message: `${nodeVer} (>= 18 required)`
    });
  } else {
    addCheck({
      name: "Node.js version",
      category: "runtime",
      status: "fail",
      message: `${nodeVer} (>= 18 required)`,
      suggestion: "Upgrade Node.js to v18 or higher."
    });
  }

  try {
    const { stdout } = await execa("pnpm", ["-v"]);
    addCheck({
      name: "pnpm",
      category: "runtime",
      status: "pass",
      message: `v${stdout.trim()}`
    });
  } catch {
    addCheck({
      name: "pnpm",
      category: "runtime",
      status: "fail",
      message: "Not found in PATH",
      suggestion: "Install pnpm (npm install -g pnpm)."
    });
  }

  // --- 2. Persistence Checks ---
  const hardkasDir = path.join(process.cwd(), ".hardkas");
  let dirExists = false;
  try {
    const stats = await fs.stat(hardkasDir);
    dirExists = stats.isDirectory();
    addCheck({
      name: ".hardkas/ directory",
      category: "persistence",
      status: "pass",
      message: "Exists and is active"
    });
  } catch {
    addCheck({
      name: ".hardkas/ directory",
      category: "persistence",
      status: "fail",
      message: "Not found",
      suggestion: "Run 'hardkas init' to initialize project."
    });
  }

  if (dirExists) {
    try {
      const gitignorePath = path.join(process.cwd(), ".gitignore");
      const gitignore = await fs.readFile(gitignorePath, "utf-8");
      if (gitignore.includes(".hardkas")) {
        addCheck({
          name: ".gitignore protection",
          category: "persistence",
          status: "pass",
          message: "Contains .hardkas/"
        });
      } else {
        addCheck({
          name: ".gitignore protection",
          category: "persistence",
          status: "warn",
          message: "Does not contain .hardkas/",
          suggestion: "Add '.hardkas/' to your .gitignore to avoid committing artifacts."
        });
      }
    } catch {
      addCheck({
        name: ".gitignore protection",
        category: "persistence",
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
        status: "pass",
        message: "File exists and is accessible"
      });
    } catch {
      addCheck({
        name: "store.db accessibility",
        category: "persistence",
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
          status: "pass",
          message: "No active or stale locks found"
        });
      } else {
        addCheck({
          name: "Workspace locks",
          category: "persistence",
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
            status: "pass",
            message: `${lineNumber} events verified`
          });
        }
      } catch {
        addCheck({
          name: `${streamName} Stream`,
          category: "persistence",
          status: "skip",
          message: "Stream not found"
        });
      }
    };

    await checkStream(
      "Events Ledger",
      path.join(process.cwd(), "events.jsonl"),
      (p) => p && p.schema === "hardkas.event"
    );
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
          status: "pass",
          message: "0600 permissions enforced"
        });
      } else {
        addCheck({
          name: "Keystore permissions",
          category: "security",
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
            status: "fail",
            message: "Plaintext private keys detected in artifacts!",
            suggestion: "Use encrypted accounts and avoid --unsafe-plaintext."
          });
        } else {
          addCheck({
            name: "Plaintext keys check",
            category: "security",
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
  let dockerDaemonOk = false;
  try {
    await execa("docker", ["info"]);
    dockerDaemonOk = true;
    addCheck({
      name: "Docker daemon",
      category: "docker",
      status: "pass",
      message: "Reachable"
    });
  } catch {
    addCheck({
      name: "Docker daemon",
      category: "docker",
      status: "fail",
      message: "Not reachable",
      suggestion: "Ensure Docker is running."
    });
  }

  if (dockerDaemonOk) {
    try {
      const runner = new DockerKaspadRunner();
      const status = await runner.status();
      addCheck({
        name: "kaspad image",
        category: "docker",
        status: "pass",
        message: status.image || "unknown"
      });

      if (status.running) {
        addCheck({
          name: "Local node RPC",
          category: "network",
          status: status.rpcReady ? "pass" : "fail",
          message: status.rpcReady ? "Ready" : "Not Ready",
          suggestion: !status.rpcReady ? "Check node logs: hardkas node logs" : undefined
        });
      } else {
        addCheck({
          name: "Local node RPC",
          category: "network",
          status: "skip",
          message: "Node is not running"
        });
      }
    } catch {
      // skip
    }
  }

  // --- 5. Consistency Checks ---
  if (opts.consistency && dirExists) {
    try {
      const { HardkasStore } = await import("@hardkas/query-store");
      const path = await import("node:path");
      const store = new HardkasStore({
        dbPath: path.join(process.cwd(), ".hardkas", "store.db")
      });
      store.connect({ autoMigrate: true });

      const { HardkasIndexer } = await import("@hardkas/query-store");
      const indexer = new HardkasIndexer(store.getDatabase(), {
        cwd: process.cwd(),
        strict: opts.strict ? true : false
      });
      const idxReport = indexer.doctor();

      if (idxReport.corruptedFiles.length > 0) {
        addCheck({
          name: "Artifact Integrity",
          category: "consistency",
          status: "fail",
          message: `${idxReport.corruptedFiles.length} corrupted artifact(s) found`,
          suggestion: "Use 'hardkas artifact verify' to identify corrupted files."
        });
      } else {
        addCheck({
          name: "Artifact Integrity",
          category: "consistency",
          status: "pass",
          message: "All indexed artifacts are structurally sound"
        });
      }

      if (idxReport.orphanEdges > 0) {
        addCheck({
          name: "Lineage Continuity",
          category: "consistency",
          status: "fail",
          message: `${idxReport.orphanEdges} orphan lineage edge(s) found`,
          suggestion: "Lineage graph is broken. Re-index or fix dependencies."
        });
      } else {
        addCheck({
          name: "Lineage Continuity",
          category: "consistency",
          status: "pass",
          message: "Lineage graph is fully connected"
        });
      }

      if (idxReport.duplicateProjections > 0) {
        addCheck({
          name: "Projection Uniqueness",
          category: "consistency",
          status: "fail",
          message: `${idxReport.duplicateProjections} duplicate projection(s) detected`,
          suggestion: "Multiple artifacts claim the same tx_id. Indexer rebuild required."
        });
      } else {
        addCheck({
          name: "Projection Uniqueness",
          category: "consistency",
          status: "pass",
          message: "All state projections are unique"
        });
      }

      if (idxReport.brokenReplayDependencies > 0) {
        addCheck({
          name: "Replay Dependencies",
          category: "consistency",
          status: "fail",
          message: `${idxReport.brokenReplayDependencies} broken replay dependency(s)`,
          suggestion: "Replay reports exist for missing target artifacts."
        });
      } else {
        addCheck({
          name: "Replay Dependencies",
          category: "consistency",
          status: "pass",
          message: "All replay reports reference valid artifacts"
        });
      }

      if (idxReport.duplicateEventSequences > 0) {
        addCheck({
          name: "Event Deduplication",
          category: "consistency",
          status: "fail",
          message: `${idxReport.duplicateEventSequences} duplicate event sequence(s)`,
          suggestion:
            "Duplicate sequence numbers within a correlation ID. Indexer rebuild required."
        });
      } else {
        addCheck({
          name: "Event Deduplication",
          category: "consistency",
          status: "pass",
          message: "All event sequences are unique"
        });
      }

      if (idxReport.orphanEvents > 0) {
        addCheck({
          name: "Event Causality",
          category: "consistency",
          status: "fail",
          message: `${idxReport.orphanEvents} orphan event(s) found`,
          suggestion: "Events reference missing causation IDs. Check event log integrity."
        });
      } else {
        addCheck({
          name: "Event Causality",
          category: "consistency",
          status: "pass",
          message: "Event causality graph is fully connected"
        });
      }
    } catch (err: any) {
      addCheck({
        name: "Consistency Engine",
        category: "consistency",
        status: "fail",
        message: `Failed to run consistency checks: ${err.message}`
      });
    }

    // 6. Snapshot Integrity Checks
    const snapshotsDir = path.join(process.cwd(), "snapshots");
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
            status: "fail",
            message: `${brokenSnapshots} invalid snapshot(s) found`,
            suggestion: "Remove broken snapshots from the snapshots/ directory."
          });
        } else {
          addCheck({
            name: "Snapshot Integrity",
            category: "persistence",
            status: "pass",
            message: `${snapshots.length} snapshot(s) verified`
          });
        }
      }
    } catch {
      // Snapshots dir doesn't exist, which is fine
    }
  }

  if (opts.json) {
    UI.writeJson(report);
  } else if (!opts.quiet) {
    UI.divider();
    UI.logHuman(
      `  Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warnings} warning, ${report.summary.skipped} skipped`
    );
    UI.footer("Use 'hardkas capabilities' to see supported features.");
  }

  if (opts.strict && report.summary.failed > 0) {
    process.exit(1);
  }

  return report.summary.failed === 0;
}
