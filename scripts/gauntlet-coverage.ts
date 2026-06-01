import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn, ChildProcess } from "node:child_process";

// Interfaces for matrix reporting
interface CommandCoverage {
  id: string; // e.g. "hardkas accounts fund"
  isL2: boolean;
  mutatesFs: boolean;
  requiresNetwork: boolean;
  helpCovered: boolean;
  validSmokeCovered: boolean;
  invalidSmokeCovered: boolean;
  excludedReason?: string;
  flagsDiscovered: string[];
}

export async function runCoverageMode(targetVersion = "0.7.11-alpha") {
  console.log(
    "\n============================================================================"
  );
  console.log("🕵️  HardKAS Agentic Coverage Explorer starting...");
  console.log(
    "============================================================================\n"
  );

  const tempDirParent = path.join(os.tmpdir(), "hardkas-gauntlet-coverage");
  const rawHelpDir = path.join(tempDirParent, "raw-help");
  const workspaceDir = path.join(tempDirParent, "workspace");

  fs.mkdirSync(rawHelpDir, { recursive: true });
  if (fs.existsSync(workspaceDir))
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

  // 1. Install target package cleanly
  console.log(
    `📦 Setting up clean workspace and installing @hardkas/cli@${targetVersion}...`
  );
  fs.writeFileSync(
    path.join(workspaceDir, "package.json"),
    JSON.stringify({
      name: "hardkas-coverage",
      version: "1.0.0",
      dependencies: {
        "@hardkas/cli": targetVersion,
        "@hardkas/sdk": targetVersion,
        "@hardkas/kaspa-rpc": targetVersion,
        playwright: "^1.49.0"
      }
    })
  );
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  execSync(`${npmCommand} install --no-audit --no-fund --legacy-peer-deps`, {
    cwd: workspaceDir,
    stdio: "ignore"
  });

  // Initialize HardKAS to make local commands happy
  console.log(`   - Initializing HardKAS project...`);
  execSync(`${npxCommand} hardkas init . --force`, {
    cwd: workspaceDir,
    stdio: "ignore"
  });

  const commandMatrix: Record<string, CommandCoverage> = {};

  console.log(`\n🔍 Phase 1: Deep Dynamic Discovery (--help)`);

  const staticRootCommands = [
    "init",
    "up",
    "tx",
    "artifact",
    "replay",
    "rpc",
    "dag",
    "accounts",
    "node",
    "config",
    "query",
    "test",
    "doctor",
    "verify",
    "verify-semantics",
    "rebuild",
    "run",
    "lock",
    "console",
    "localnet",
    "deploy",
    "dev",
    "local",
    "kaspa",
    "dashboard",
    "explain",
    "torture",
    "telemetry",
    "repair",
    "rotate",
    "inspect",
    "chaos",
    "status",
    "why",
    "ci",
    "sandbox",
    "workflow"
  ];

  function shallowDiscover(baseCmd: string) {
    if (commandMatrix[baseCmd]) return;
    console.log(`   - Discovering: ${baseCmd}`);

    let helpOutput = "";
    try {
      helpOutput = execSync(`${npxCommand} ${baseCmd} --help`, {
        cwd: workspaceDir,
        encoding: "utf8"
      });
    } catch (e: any) {
      helpOutput = e.stdout?.toString() || e.message;
      commandMatrix[baseCmd] = {
        id: baseCmd,
        isL2: false,
        mutatesFs: false,
        requiresNetwork: false,
        helpCovered: false,
        validSmokeCovered: false,
        invalidSmokeCovered: false,
        excludedReason: "CRASH ON --help",
        flagsDiscovered: []
      };
      return;
    }

    const sanitizedName = baseCmd.replace(/ /g, "_").slice(0, 50);
    fs.writeFileSync(path.join(rawHelpDir, `${sanitizedName}_help.txt`), helpOutput);

    const flags: string[] = [];
    let parsingFlags = false;
    const lines = helpOutput.split("\n");

    for (const line of lines) {
      if (line.match(/^Options:/)) {
        parsingFlags = true;
        continue;
      }
      if (line.match(/^Commands:/)) {
        parsingFlags = false;
        continue;
      }
      if (parsingFlags) {
        const flagMatch = line.match(/^\s+(-\w,\s)?(--[a-zA-Z0-9-]+)/);
        if (flagMatch) flags.push(flagMatch[2]);
      }
    }

    const isL2 =
      baseCmd.includes("l2") ||
      baseCmd.includes("artifact") ||
      baseCmd.includes("replay") ||
      baseCmd.includes("workflow");
    const requiresNetwork =
      baseCmd.includes("tx") ||
      baseCmd.includes("rpc") ||
      baseCmd.includes("dag") ||
      baseCmd.includes("accounts fund");
    const mutatesFs =
      baseCmd.includes("init") ||
      baseCmd.includes("accounts fund") ||
      baseCmd.includes("accounts import") ||
      baseCmd.includes("repair");

    commandMatrix[baseCmd] = {
      id: baseCmd,
      isL2,
      mutatesFs,
      requiresNetwork,
      helpCovered: true,
      validSmokeCovered: false,
      invalidSmokeCovered: false,
      flagsDiscovered: flags
    };
  }

  // 1. Discover root
  shallowDiscover("hardkas");

  // 2. Discover static roots
  for (const root of staticRootCommands) {
    shallowDiscover(`hardkas ${root}`);
  }

  // 3. Known deep subcommands (parser limited)
  const knownDeep = [
    "hardkas accounts list",
    "hardkas accounts fund",
    "hardkas accounts import",
    "hardkas accounts export",
    "hardkas accounts balance",
    "hardkas query artifacts",
    "hardkas query store rebuild",
    "hardkas query lineage",
    "hardkas dev server",
    "hardkas dev tools",
    "hardkas artifact inspect",
    "hardkas artifact push",
    "hardkas tx plan",
    "hardkas tx simulate",
    "hardkas tx sign",
    "hardkas tx broadcast"
  ];

  for (const deep of knownDeep) {
    shallowDiscover(deep);
  }

  console.log(`\n🧪 Phase 2: Smoke Testing (Valid & Invalid)`);
  const totalDiscovered = Object.keys(commandMatrix).length;
  console.log(`   - Total commands/subcommands discovered: ${totalDiscovered}`);

  for (const [cmd, metrics] of Object.entries(commandMatrix)) {
    if (!metrics.helpCovered) continue;

    console.log(`   - Testing ${cmd}...`);

    // Invalid Smoke Test (pass --invalid-flag-12345)
    try {
      execSync(`${npxCommand} ${cmd} --invalid-flag-12345`, {
        cwd: workspaceDir,
        stdio: "ignore"
      });
      // If it doesn't throw, invalid smoke fails (it should fail on bad flags!)
      metrics.invalidSmokeCovered = false;
    } catch {
      metrics.invalidSmokeCovered = true;
    }

    // Valid Smoke Test
    if (metrics.requiresNetwork) {
      metrics.excludedReason = "REQUIRES_NETWORK";
      metrics.validSmokeCovered = false;
      continue;
    }

    if (
      cmd === "hardkas console" ||
      cmd === "hardkas dev server" ||
      cmd === "hardkas dashboard" ||
      cmd === "hardkas sandbox"
    ) {
      metrics.excludedReason = "INTERACTIVE_OR_DAEMON";
      metrics.validSmokeCovered = false;
      continue;
    }

    if (metrics.mutatesFs && cmd !== "hardkas init") {
      // Too risky to auto-run blindly without arguments unless specific
      metrics.excludedReason = "DANGEROUS_MUTATION";
      metrics.validSmokeCovered = false;
      continue;
    }

    // Try valid smoke (just the command itself, or with help to ensure it passes)
    try {
      execSync(`${npxCommand} ${cmd}`, {
        cwd: workspaceDir,
        stdio: "ignore",
        timeout: 10000
      });
      metrics.validSmokeCovered = true;
    } catch {
      // It might legitimately require arguments (e.g. hardkas accounts fund <identifier>)
      metrics.excludedReason = "MISSING_REQUIRED_ARGS_OR_TIMEOUT";
      metrics.validSmokeCovered = false;
    }
  }

  console.log(`\n🕸️  Phase 3: Playwright Dev-Server API & Route Tracking`);
  const apiEndpoints = new Set<string>();
  const dashboardRoutes = new Set<string>();

  // Start Dev Server
  const port = 55666;
  const token = "coverage-token";
  const devServerProcess = spawn(
    npxCommand,
    ["hardkas", "dev", "server", "--port", port.toString(), "--open", "false"],
    {
      cwd: workspaceDir,
      env: { ...process.env, HARDKAS_DEV_TOKEN: token },
      stdio: "ignore",
      shell: true
    }
  );

  try {
    // Poll for server health
    let isReady = false;
    for (let i = 0; i < 50; i++) {
      try {
        const res = await fetch(`http://localhost:${port}/api/health`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          isReady = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    if (isReady) {
      const { pathToFileURL } = await import("node:url");
      const playwrightPath = pathToFileURL(
        path.join(workspaceDir, "node_modules", "playwright")
      ).href;
      const playwrightModule = await import(playwrightPath);
      const playwright = playwrightModule.default || playwrightModule;
      const browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();

      page.on("request", (req: any) => {
        try {
          const url = new URL(req.url());
          if (url.pathname.startsWith("/api/")) {
            apiEndpoints.add(url.pathname);
          }
        } catch {}
      });

      // Visit typical routes to harvest endpoints
      dashboardRoutes.add("/");
      await page.goto(`http://localhost:${port}/`);
      await page.waitForTimeout(1000);

      await browser.close();
    }
  } finally {
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${devServerProcess.pid} /t /f`, { stdio: "ignore" });
      } catch {}
    } else {
      devServerProcess.kill();
    }
  }

  console.log(`\n📈 Generating Reports...`);

  // Calculate Metrics
  const commands = Object.values(commandMatrix);
  const total = commands.length;
  const helpCovered = commands.filter((c) => c.helpCovered).length;
  const invalidCovered = commands.filter((c) => c.invalidSmokeCovered).length;
  const validCovered = commands.filter((c) => c.validSmokeCovered).length;

  const helpPct = (helpCovered / total) * 100;
  const invalidPct = (invalidCovered / total) * 100;

  // Check Thresholds
  const passedHelp = helpPct >= 95;
  const passedInvalid = invalidPct >= 80;
  const passedApi = apiEndpoints.size > 0;

  // Dump JSON matrices
  fs.writeFileSync(
    path.join(tempDirParent, "command-matrix.json"),
    JSON.stringify(commandMatrix, null, 2)
  );
  fs.writeFileSync(
    path.join(tempDirParent, "api-matrix.json"),
    JSON.stringify(Array.from(apiEndpoints), null, 2)
  );
  fs.writeFileSync(
    path.join(tempDirParent, "dashboard-route-matrix.json"),
    JSON.stringify(Array.from(dashboardRoutes), null, 2)
  );

  // Write Markdown Report
  let md = `# HardKAS CLI Coverage Report

## Top Level Metrics
- **Total Commands Discovered**: ${total}
- **Help Coverage**: ${helpCovered}/${total} (${helpPct.toFixed(1)}%) — ${passedHelp ? "✅ PASSED (>95%)" : "❌ FAILED"}
- **Invalid Smoke Coverage**: ${invalidCovered}/${total} (${invalidPct.toFixed(1)}%) — ${passedInvalid ? "✅ PASSED (>80%)" : "❌ FAILED"}
- **Valid Smoke Coverage**: ${validCovered}/${total} (${((validCovered / total) * 100).toFixed(1)}%)

## API Matrix (Endpoints Touched)
${
  Array.from(apiEndpoints)
    .map((e) => `- \`${e}\``)
    .join("\n") || "- None"
}

## Dashboard Routes Visited
${Array.from(dashboardRoutes)
  .map((e) => `- \`${e}\``)
  .join("\n")}

## Exclusions & Gaps
`;

  for (const c of commands.filter((c) => !c.validSmokeCovered)) {
    md += `- **${c.id}**: Excluded from valid smoke (${c.excludedReason})\n`;
  }

  const mdPath = path.join(process.cwd(), "reports", "coverage-report.md");
  fs.mkdirSync(path.join(process.cwd(), "reports"), { recursive: true });
  fs.writeFileSync(mdPath, md);

  console.log(`\n✅ Coverage matrices and report saved to temp and ${mdPath}`);
  console.log(
    `📊 Help Pct: ${helpPct.toFixed(1)}%, Invalid Pct: ${invalidPct.toFixed(1)}%`
  );

  if (!passedHelp || !passedInvalid || !passedApi) {
    console.error(`\n❌ STRICT GUARD: Coverage thresholds not met!`);
    process.exit(1);
  }
}
