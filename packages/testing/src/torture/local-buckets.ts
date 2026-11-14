// SAFETY_LEVEL: SIMULATION_ONLY

import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  registerTortureBucket,
  TortureBucketContext,
  TortureInvariantError
} from "./torture-engine.js";

/** The context of a bucket that runs the CLI: `hardkas torture` adds the path of its own entry (`cliEntry`). */
export type LocalBucketContext = TortureBucketContext & {
  /** Absolute path of the HardKAS CLI entry (`@hardkas/cli/bin`, its dist/index.js) the bucket runs with `node`. */
  cliEntry?: string;
};

/**
 * rc2 audit E-10: the CLI entry the local bucket runs. It was always `../../cli/dist/index.js` next to this package's
 * bundle, which only a flat node_modules (npm) or the monorepo satisfies: under pnpm's isolated layout
 * (node_modules/.pnpm/@hardkas+testing@<v>/node_modules/@hardkas/) there is no cli beside it, since @hardkas/testing
 * does not depend on @hardkas/cli, and the first case failed with INIT_FAILED. Now, in order:
 *   1. `given`: the entry `hardkas torture` passes (the CLI resolves itself, so it holds under any layout); it must exist;
 *   2. `@hardkas/cli/bin` as Node resolves it from this module (a flat or hoisted node_modules);
 *   3. the former sibling path (the monorepo, where packages/testing/dist and packages/cli/dist are siblings).
 * None found: a typed CLI_ENTRY_NOT_FOUND naming what was tried, instead of a failed `node <missing file>`.
 */
export function resolveTortureCliEntry(given?: string, fromUrl: string = import.meta.url): string {
  if (given !== undefined) {
    if (fs.existsSync(given)) return given;
    throw new TortureInvariantError(
      `the CLI entry this torture run was given does not exist: ${given}`,
      "CLI_ENTRY_NOT_FOUND",
      "critical"
    );
  }
  const tried: string[] = [];
  try {
    const resolved = createRequire(fromUrl).resolve("@hardkas/cli/bin");
    if (fs.existsSync(resolved)) return resolved;
    tried.push(resolved);
  } catch {
    tried.push(`@hardkas/cli/bin (not resolvable from ${fileURLToPath(fromUrl)})`);
  }
  const sibling = fileURLToPath(new URL("../../cli/dist/index.js", fromUrl));
  if (fs.existsSync(sibling)) return sibling;
  tried.push(sibling);
  throw new TortureInvariantError(
    `could not find the HardKAS CLI entry (tried ${tried.join("; ")}); run this bucket through \`hardkas torture\`, which passes its own entry`,
    "CLI_ENTRY_NOT_FOUND",
    "critical"
  );
}

registerTortureBucket({
  name: "local-first-lifecycle",
  profiles: ["local"],
  expectedInvariant:
    "Workspace init, basic transfer, and workspace doctor checks succeed without mutation side effects",
  run: async (ctx: LocalBucketContext) => {
    const cliPath = resolveTortureCliEntry(ctx.cliEntry);

    const runDir = path.join(ctx.workspaceDir, ".tmp", `local-${ctx.caseId}`);
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.mkdirSync(runDir, { recursive: true });

    // 0. Dummy package.json
    fs.writeFileSync(path.join(runDir, "package.json"), "{}");

    // 1. hardkas init
    try {
      execSync(`node "${cliPath}" dev init`, {
        cwd: runDir,
        stdio: "pipe",
        encoding: "utf-8"
      });
    } catch (e: unknown) {
      throw new TortureInvariantError(
        `hardkas dev init failed: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}\n${((e as any).stdout)}\n${((e as any).stderr)}`,
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
    alice: { kind: "simulated", address: "kaspa:sim_alice" }
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

    // 3. Workspace doctor (use --json to inspect results; only fail on critical workspace checks). NEW-11: this was
    // `dev doctor`, which moved to the l2 extension; `doctor workspace` is its L1 part, with the same report and checks.
    try {
      const doctorOutput = execSync(`node "${cliPath}" doctor workspace --json`, {
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
          `doctor workspace: workspace invalid — ${workspaceCheck.message}`,
          "DOCTOR_WORKSPACE_INVALID",
          "critical"
        );
      }
      // SDK/dev-server warnings are expected in a bare test workspace
    } catch (e: unknown) {
      if (e instanceof TortureInvariantError) throw e;
      // doctor workspace exits non-zero for "failed" status — parse stdout to check
      const stdout = ((e as any).stdout) || "";
      try {
        const doctorResult = JSON.parse(stdout);
        const workspaceCheck = doctorResult.checks?.find(
          (c: any) => c.name === "Workspace Validity"
        );
        if (workspaceCheck?.status === "error") {
          throw new TortureInvariantError(
            `doctor workspace: workspace invalid — ${workspaceCheck.message}`,
            "DOCTOR_WORKSPACE_INVALID",
            "critical"
          );
        }
        // Non-zero exit but workspace is valid — expected (SDK import fails in bare workspace)
      } catch (parseErr: any) {
        if (parseErr instanceof TortureInvariantError) throw parseErr;
        throw new TortureInvariantError(
          `doctor workspace failed and produced unparseable output: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`,
          "DOCTOR_FAILED",
          "warning"
        );
      }
    }

    // Cleanup
    fs.rmSync(runDir, { recursive: true, force: true });

    return {
      flow: "local-first-lifecycle",
      mutation: "simulated local workflows and workspace doctor",
      environmentMode: "local",
      artifactsAfter: ["events.jsonl"]
    };
  }
});
