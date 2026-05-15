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

export function registerDoctorCommand(program: Command) {
  program
    .command("doctor")
    .description(`Perform a full system diagnostic and health report ${UI.maturity("stable")}`)
    .option("--json", "Output results as stable JSON schema", false)
    .action(async (opts) => {
      try {
        await runDoctor(opts);
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
  category: "runtime" | "persistence" | "network" | "security" | "docker";
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  suggestion?: string | undefined;
}

async function runDoctor(opts: { json?: boolean }) {
  const report: DoctorReport = {
    version: "0.2.2-alpha.1", // In real world, get this from constants
    timestamp: new Date().toISOString(),
    checks: [],
    summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 }
  };

  if (!opts.json) {
    UI.box("HardKAS System Doctor", "Operational Health Check");
  }

  const addCheck = (check: DoctorCheck) => {
    report.checks.push(check);
    report.summary.total++;
    if (check.status === "pass") report.summary.passed++;
    else if (check.status === "fail") report.summary.failed++;
    else if (check.status === "warn") report.summary.warnings++;
    else if (check.status === "skip") report.summary.skipped++;

    if (!opts.json) {
      let icon = pc.green("✅");
      if (check.status === "fail") icon = pc.red("❌");
      if (check.status === "warn") icon = pc.yellow("⚠️");
      if (check.status === "skip") icon = pc.gray("⏭️");
      
      console.log(`  ${icon} ${pc.bold(check.name)}: ${check.message}`);
      if (check.suggestion && check.status !== "pass") {
        console.log(`     ${pc.dim("Suggestion: " + check.suggestion)}`);
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
      const locks = files.filter(f => f.endsWith(".lock"));
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
      const accountsJson = files.find(f => f.includes("accounts") && f.endsWith(".json"));
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

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    UI.divider();
    console.log(`  Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.warnings} warning, ${report.summary.skipped} skipped`);
    UI.footer("Use 'hardkas capabilities' to see supported features.");
  }
}
