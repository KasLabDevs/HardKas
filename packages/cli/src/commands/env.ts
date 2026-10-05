import { Command } from "commander";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

// #10 (env check): the command used to REQUIRE the deployment profile of `hardkas deploy init`
// (NETWORK, KASPAD_URL, HARDKAS_DATA_DIR, HARDKAS_KASPAD_IMAGE, LOG_LEVEL) and failed in every
// workspace without that .env, although HardKAS itself reads none of them but HARDKAS_KASPAD_IMAGE.
// It now checks the variables HardKAS honours, flags HARDKAS_* names it does not know (a typo is
// a silent misconfiguration), and only reports the deployment profile when a .env declares it.

/** The environment variables HardKAS reads, with what they do. */
export const HARDKAS_ENV_VARIABLES: ReadonlyArray<{ name: string; meaning: string }> = [
  { name: "HARDKAS_HOME", meaning: "home of the managed toolchains (kaspa-wasm, silverc)" },
  { name: "HARDKAS_KASPAD_IMAGE", meaning: "Docker image of the local node (default: the pinned rusty-kaspad)" },
  { name: "HARDKAS_ALLOW_SIMULATED_NODE", meaning: "1: report a simulated node when Docker is unavailable (never a real node)" },
  { name: "HARDKAS_ALLOW_UNVERIFIED_NODE", meaning: "testing harness: accept a node whose identity does not verify" },
  { name: "HARDKAS_TOCCATA_MINER_THROTTLE_MS", meaning: "pause between blocks of the localnet miner" },
  { name: "HARDKAS_ALLOW_UNSAFE_CHAOS", meaning: "1: allow a chaos campaign in the current directory" },
  { name: "HARDKAS_EXPERIMENTAL", meaning: "1: expose the experimental command groups" },
  { name: "HARDKAS_EXPERIMENTAL_VPROGS", meaning: "1: expose the vProgs experiments" },
  { name: "HARDKAS_PROJECTION_BACKEND", meaning: "query store backend (sqlite or filesystem)" },
  { name: "HARDKAS_QUERY_STORE_PATH", meaning: "path of the query store database" },
  { name: "HARDKAS_ROOT", meaning: "workspace root used by the dev server" },
  { name: "HARDKAS_DEV_TOKEN", meaning: "dev server access token" },
  { name: "HARDKAS_WATCH_POLLING", meaning: "dev server: poll the filesystem instead of watching it" },
  { name: "HARDKAS_NETWORK", meaning: "dev server: network of the simnet routes" },
  { name: "HARDKAS_KEYSTORE_LOCK_STALE_MS", meaning: "age after which a keystore lock is stale" },
  { name: "HARDKAS_KEYSTORE_LOCK_TIMEOUT_MS", meaning: "how long to wait for a keystore lock" },
  { name: "HARDKAS_KEEP_RUNS", meaning: "hardkas test: keep the scenario workspaces" },
  { name: "HARDKAS_TEST_RUN_DIR", meaning: "hardkas test: where the scenario workspaces are created" },
  { name: "HARDKAS_MASS_TRACKING", meaning: "hardkas test: record mass measurements" },
  { name: "HARDKAS_TEST_IGNORE_STALENESS", meaning: "tests only: skip the staleness check of artifacts" },
  { name: "HARDKAS_HERMETIC_LOG", meaning: "hermetic gate: where attempted non-loopback connections are logged" },
  { name: "HARDKAS_HERMETIC_DENY_PORTS", meaning: "hermetic gate: loopback ports refused on purpose" },
  { name: "HARDKAS_HERMETIC_TRACE", meaning: "hermetic gate: trace every connection attempt" }
];

/** The deployment profile `hardkas deploy init` writes to .env.example; informational only. */
const DEPLOY_PROFILE_VARIABLES = ["NETWORK", "KASPAD_URL", "HARDKAS_DATA_DIR", "HARDKAS_KASPAD_IMAGE", "LOG_LEVEL", "DATABASE_URL", "PROMETHEUS_PORT"];

export function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && match[1] && !line.trim().startsWith("#")) parsed[match[1]] = (match[2] || "").trim();
  }
  return parsed;
}

export interface EnvCheckReport {
  dotEnv: string | null;
  known: Array<{ name: string; value: string; source: "process" | ".env"; meaning: string }>;
  unknown: string[];
  deployProfile: { present: string[]; missing: string[] } | null;
}

export function checkEnvironment(processEnv: NodeJS.ProcessEnv, dotEnv: Record<string, string> | null): EnvCheckReport {
  const merged: Record<string, { value: string; source: "process" | ".env" }> = {};
  for (const [k, v] of Object.entries(processEnv)) if (typeof v === "string") merged[k] = { value: v, source: "process" };
  for (const [k, v] of Object.entries(dotEnv ?? {})) merged[k] = { value: v, source: ".env" };

  const knownNames = new Set(HARDKAS_ENV_VARIABLES.map((v) => v.name));
  const known = HARDKAS_ENV_VARIABLES.filter((v) => merged[v.name] !== undefined && merged[v.name]!.value !== "").map((v) => ({
    name: v.name,
    value: merged[v.name]!.value,
    source: merged[v.name]!.source,
    meaning: v.meaning
  }));
  const unknown = Object.keys(merged)
    .filter((k) => k.startsWith("HARDKAS_") && !knownNames.has(k) && !k.startsWith("HARDKAS_TEST_") && !k.startsWith("HARDKAS_HARNESS_") && !k.startsWith("HARDKAS_ESCROW_") && !k.startsWith("HARDKAS_DEV_SERVER_"))
    .sort();

  // The deployment profile is only a topic when a .env declares any of it.
  const declares = dotEnv ? DEPLOY_PROFILE_VARIABLES.some((v) => dotEnv[v] !== undefined) : false;
  const deployProfile = declares
    ? {
        present: DEPLOY_PROFILE_VARIABLES.filter((v) => (dotEnv![v] ?? "") !== ""),
        missing: ["NETWORK", "KASPAD_URL", "HARDKAS_DATA_DIR", "LOG_LEVEL"].filter((v) => (dotEnv![v] ?? "") === "")
      }
    : null;

  return { dotEnv: null, known, unknown, deployProfile };
}

export function registerEnvCommands(program: Command) {
  const envCmd = program
    .command("env")
    .description("Manage and validate environment configurations");

  envCmd
    .command("check")
    .description("Check the HARDKAS_* environment variables (process and .env): the ones HardKAS honours, and any it does not know")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json: boolean }) => {
      const out = getOutput();
      const { readFileSync, existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const dotEnvPath = join(process.cwd(), ".env");
      const dotEnv = existsSync(dotEnvPath) ? parseDotEnv(readFileSync(dotEnvPath, "utf8")) : null;
      const report = checkEnvironment(process.env, dotEnv);
      report.dotEnv = dotEnv ? dotEnvPath : null;

      if (options.json) {
        out.writeJson({ ok: report.unknown.length === 0, command: "env check", mode: "cli", ...(report.unknown.length ? { code: "ENV_UNKNOWN_VARIABLE" } : {}), result: report });
      } else {
        out.writeLine(`Environment check (${report.dotEnv ? `.env at ${report.dotEnv} + process` : "process only, no .env"})`);
        out.writeLine("");
        if (report.known.length === 0) out.writeLine("  No HARDKAS_* variable is set: the defaults apply.");
        for (const v of report.known) out.writeLine(`  ✅ ${v.name}=${v.value}  (${v.source}; ${v.meaning})`);
        for (const name of report.unknown) out.writeLine(`  ❌ ${name}: not a variable HardKAS reads (a typo?)`);
        if (report.deployProfile) {
          out.writeLine("");
          out.writeLine("  Deployment profile (.env of 'hardkas deploy init'; informational):");
          for (const v of report.deployProfile.present) out.writeLine(`    • ${v} set`);
          for (const v of report.deployProfile.missing) out.writeLine(`    • ${v} not set`);
        }
      }

      if (report.unknown.length > 0) {
        throw new HardkasCliError(
          "ENV_UNKNOWN_VARIABLE",
          `Unknown HARDKAS_* variable(s): ${report.unknown.join(", ")} (HardKAS does not read them; check the spelling)`,
          { exitCode: HardkasExitCode.USAGE_ERROR }
        );
      }
    });
}
