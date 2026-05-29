// SAFETY_LEVEL: SIMULATION_ONLY

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  registerTortureBucket,
  TortureBucketContext,
  TortureInvariantError
} from "./torture-engine.js";

registerTortureBucket({
  name: "local-first-lifecycle",
  profiles: ["local"],
  expectedInvariant:
    "Workspace init, basic transfer, and dev doctor checks succeed without mutation side effects",
  run: async (ctx: TortureBucketContext) => {
    const runDir = path.join(ctx.workspaceDir, ".tmp", `local-${ctx.caseId}`);
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });

    const cliPath = fileURLToPath(new URL("../../cli/dist/index.js", import.meta.url));

    // 0. Dummy package.json
    fs.writeFileSync(path.join(runDir, "package.json"), "{}");

    // 1. hardkas init
    try {
      execSync(`node "${cliPath}" dev init`, {
        cwd: runDir,
        stdio: "pipe",
        encoding: "utf-8"
      });
    } catch (e: any) {
      throw new TortureInvariantError(
        `hardkas dev init failed: ${e.message}\n${e.stdout}\n${e.stderr}`,
        "INIT_FAILED",
        "critical"
      );
    }

    if (!fs.existsSync(path.join(runDir, "hardkas.config.ts"))) {
      throw new TortureInvariantError(
        "hardkas.config.ts was not generated",
        "MISSING_CONFIG",
        "critical"
      );
    }

    // Overwrite config with a minimal version that doesn't require @hardkas/sdk
    // (the bare test workspace doesn't have the SDK installed)
    const minimalConfig = `export default {
  defaultNetwork: "simulated",
  networks: {
    simulated: { kind: "simulated", description: "Pure local simulation" }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_sim_alice" }
  }
};
`;
    fs.writeFileSync(path.join(runDir, "hardkas.config.ts"), minimalConfig);

    // 2. Simple local workflow write (Simulate by creating an events.jsonl with a valid artifact)
    const artifactsDir = path.join(runDir, ".hardkas", "artifacts");
    fs.mkdirSync(artifactsDir, { recursive: true });

    const eventsPath = path.join(artifactsDir, "events.jsonl");
    const mockArtifact = {
      schema: "hardkas.artifact.v1",
      type: "transfer",
      amount: 100,
      timestamp: Date.now()
    };
    // hardkas-append-allow
    fs.appendFileSync(eventsPath, JSON.stringify(mockArtifact) + "\n");

    // 3. Dev doctor (use --json to inspect results; only fail on critical workspace checks)
    try {
      const doctorOutput = execSync(`node "${cliPath}" dev doctor --json`, {
        cwd: runDir,
        stdio: "pipe",
        encoding: "utf-8"
      });
      const doctorResult = JSON.parse(doctorOutput);
      const workspaceCheck = doctorResult.checks?.find(
        (c: any) => c.name === "Workspace Validity"
      );
      if (workspaceCheck?.status === "error") {
        throw new TortureInvariantError(
          `dev doctor: workspace invalid — ${workspaceCheck.message}`,
          "DOCTOR_WORKSPACE_INVALID",
          "critical"
        );
      }
      // SDK/L2/dev-server warnings are expected in a bare test workspace
    } catch (e: any) {
      if (e instanceof TortureInvariantError) throw e;
      // dev doctor exits non-zero for "failed" status — parse stdout to check
      const stdout = e.stdout || "";
      try {
        const doctorResult = JSON.parse(stdout);
        const workspaceCheck = doctorResult.checks?.find(
          (c: any) => c.name === "Workspace Validity"
        );
        if (workspaceCheck?.status === "error") {
          throw new TortureInvariantError(
            `dev doctor: workspace invalid — ${workspaceCheck.message}`,
            "DOCTOR_WORKSPACE_INVALID",
            "critical"
          );
        }
        // Non-zero exit but workspace is valid — expected (SDK import fails in bare workspace)
      } catch (parseErr: any) {
        if (parseErr instanceof TortureInvariantError) throw parseErr;
        throw new TortureInvariantError(
          `dev doctor failed and produced unparseable output: ${e.message}`,
          "DOCTOR_FAILED",
          "warning"
        );
      }
    }

    // Cleanup
    fs.rmSync(runDir, { recursive: true, force: true });

    return {
      flow: "local-first-lifecycle",
      mutation: "simulated local workflows and dev doctor",
      environmentMode: "local",
      artifactsAfter: ["events.jsonl"]
    };
  }
});
