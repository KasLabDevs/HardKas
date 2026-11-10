import { Command } from "commander";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

// #10 (env check): the command used to REQUIRE the deployment profile of `hardkas deploy init`
// (NETWORK, KASPAD_URL, HARDKAS_DATA_DIR, HARDKAS_KASPAD_IMAGE, LOG_LEVEL) and failed in every
// workspace without that .env, although HardKAS itself reads none of them but HARDKAS_KASPAD_IMAGE.
// It now checks the variables HardKAS honours, flags HARDKAS_* names it does not know (a typo is
// a silent misconfiguration), and only reports the deployment profile when a .env declares it.

/**
 * The environment variables HardKAS reads, with what they do. SECRET-SURFACE-2 (D3): a variable marked `secret` holds a
 * credential; `env check` reports it as configured and never prints its value (the dev server's token lives in
 * `.hardkas/dev-server-token`; there is no `hardkas dev-server` command group, N-7). P33: a variable marked `obsolete`
 * is still recognised (never a typo), but setting it no longer does what it once did; its meaning says what to use.
 */
export const HARDKAS_ENV_VARIABLES: ReadonlyArray<{ name: string; meaning: string; secret?: true; obsolete?: true }> = [
  { name: "HARDKAS_HOME", meaning: "home of the managed toolchains (kaspa-wasm, silverc)" },
  { name: "HARDKAS_KASPAD_IMAGE", meaning: "Docker image of the local node (default: the pinned rusty-kaspad); node start requires it pinned by digest (@sha256:)" },
  { name: "HARDKAS_ALLOW_SIMULATED_NODE", meaning: "1: report a simulated node when Docker is unavailable (never a real node)" },
  { name: "HARDKAS_ALLOW_UNVERIFIED_NODE", meaning: "testing harness: accept a node whose identity does not verify" },
  { name: "HARDKAS_SILVER_RUNNER", meaning: "SilverScript runner (cli-debugger) binary of silver test, debug, preflight and fuzz" },
  { name: "HARDKAS_SILVER_RUNNER_TRUST", meaning: "allow-unverified: run a SilverScript runner that is not verified (its verdicts labelled UNVERIFIED)" },
  { name: "HARDKAS_TOCCATA_MINER_THROTTLE_MS", meaning: "pause between blocks of the localnet miner" },
  // ESCALÓN 3 · P20: chaos never runs in the current directory any more, so nothing reads it
  { name: "HARDKAS_ALLOW_UNSAFE_CHAOS", meaning: "obsolete: chaos always runs in its own temporary directory; nothing reads it", obsolete: true },
  // SURFACE-TRUTH-1B (ST-J): what it does, not what it was meant to do. It "exposed the experimental command groups",
  // but it never changed the command tree; HARDKAS_EXPERIMENTAL_VPROGS was read by nothing and is no longer listed.
  { name: "HARDKAS_EXPERIMENTAL", meaning: "1: silence the warning of the internal or unavailable groups (capabilities, pskt, session); the commands are the same" },
  { name: "HARDKAS_PROJECTION_BACKEND", meaning: "query store backend (sqlite or filesystem)" },
  { name: "HARDKAS_QUERY_STORE_PATH", meaning: "path of the query store database" },
  { name: "HARDKAS_ROOT", meaning: "workspace root used by the dev server" },
  { name: "HARDKAS_DEV_TOKEN", meaning: "dev server access token", secret: true },
  // P33: the dev server's variables are listed, not exempt by prefix (a typo of HARDKAS_DEV_SERVER_AUTOSIGN used to pass)
  // ESCALÓN 4 · P38: off by default, and only the local worlds even when set (dev-server/routes/dapp-tx.ts)
  { name: "HARDKAS_DEV_SERVER_AUTOSIGN", meaning: "dev server: 1 lets the server sign dApp requests (POST /api/tx/send with allowDevAutoSign, POST /api/tx/sign) with its own accounts, on the simulated ledger or a local simnet only (never testnet, devnet or mainnet); unset, the server signs for no client" },
  { name: "HARDKAS_DEV_SERVER_URL", meaning: "tests only: base URL of the dev server for the escrow integration suites" },
  { name: "HARDKAS_WATCH_POLLING", meaning: "dev server: poll the filesystem instead of watching it" },
  // P34: no HardKAS package reads it (the dev server's simnet route computed it and never used it); `hardkas test` and
  // `hardkas run` set it for the tests and scripts they start.
  { name: "HARDKAS_NETWORK", meaning: "set by hardkas test and hardkas run for the tests and scripts they start: the selected network (HardKAS itself does not read it)" },
  { name: "HARDKAS_KEYSTORE_LOCK_STALE_MS", meaning: "age after which a keystore lock is stale" },
  { name: "HARDKAS_KEYSTORE_LOCK_TIMEOUT_MS", meaning: "how long to wait for a keystore lock" },
  { name: "HARDKAS_KEEP_RUNS", meaning: "hardkas test: keep the scenario workspaces" },
  { name: "HARDKAS_TEST_RUN_DIR", meaning: "hardkas test: where the scenario workspaces are created" },
  { name: "HARDKAS_MASS_TRACKING", meaning: "hardkas test: record mass measurements" },
  { name: "HARDKAS_TEST_IGNORE_STALENESS", meaning: "tests only: skip the staleness check of artifacts" },
  { name: "HARDKAS_HERMETIC_LOG", meaning: "hermetic gate: where attempted non-loopback connections are logged" },
  { name: "HARDKAS_HERMETIC_DENY_PORTS", meaning: "hermetic gate: loopback ports refused on purpose" },
  { name: "HARDKAS_HERMETIC_TRACE", meaning: "hermetic gate: trace every connection attempt" },
  { name: "IGRA_RPC_URL", meaning: "capabilities: the Igra L2 JSON-RPC endpoint probed when neither the call nor hardkas.config names one (never probed on mainnet)" },
  { name: "HARDKAS_EXPERIMENTAL_L2", meaning: "obsolete: it no longer registers the l2 commands; install the l2 extension instead (only the refusal of an l2 command mentions it)", obsolete: true }
];

/**
 * The deployment profile `hardkas deploy init` writes to .env.example; informational only (the deployed app's variables,
 * and HARDKAS_KASPAD_IMAGE). SURFACE-TRUTH-1B (ST-J): one contract for `env check`, `doctor` and `deploy init`.
 * HARDKAS_DATA_DIR is not in it: HardKAS reads no such variable (the workspace's `.hardkas` holds its data), so `env
 * check` reports it as unknown, `deploy init` no longer writes it and `doctor` no longer demands it.
 */
export const DEPLOY_PROFILE_VARIABLES = ["NETWORK", "KASPAD_URL", "HARDKAS_KASPAD_IMAGE", "LOG_LEVEL", "DATABASE_URL", "PROMETHEUS_PORT"];

export function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && match[1] && !line.trim().startsWith("#")) parsed[match[1]] = (match[2] || "").trim();
  }
  return parsed;
}

/**
 * R-08 · a variable set to a value that relaxes a safety policy for every command: `env check` and `doctor` warn about
 * it rather than mark it fine. The per-command alternative is named in the warning.
 */
export const ENV_POLICY_WARNINGS: Readonly<Record<string, (value: string) => string | undefined>> = {
  HARDKAS_SILVER_RUNNER_TRUST: (value) =>
    value === "allow-unverified"
      ? "relaxes the SilverScript runner trust policy for every command: any runner found (the <HARDKAS_HOME>/toolchains one included) starts UNVERIFIED; prefer --allow-unverified-runner on the command that needs it"
      : undefined,
  HARDKAS_ALLOW_UNVERIFIED_NODE: (value) =>
    value === "1" ? "the simnet test harness attaches to a node whose identity it cannot prove" : undefined,
  // P33 / ESCALÓN 4 · P38: what `serverAllowsDevAutoSign` (dev-server/routes/dapp-tx.ts) does with it
  HARDKAS_DEV_SERVER_AUTOSIGN: (value) =>
    value === "1"
      ? "the dev server signs dApp requests with its own accounts for any HTTP client that asks, on the simulated ledger or a local simnet (testnet, devnet and mainnet stay refused); unset it unless a local dApp needs it"
      : undefined
};

/** What a secret-bearing variable's value is reported as (SECRET-SURFACE-2 D3): the marker, never the value. */
export const ENV_SECRET_VALUE_MARKER = "[REDACTED]";

export interface EnvCheckReport {
  dotEnv: string | null;
  known: Array<{
    name: string;
    /** The value as set — or `[REDACTED]` for a secret-bearing variable, whose value is never reported. */
    value: string;
    source: "process" | ".env";
    meaning: string;
    /** Only on a secret-bearing variable: it is configured (non-empty); its value is not part of this report. */
    configured?: true;
    secret?: true;
    /** P33: a recognised variable that no longer has its former effect (its meaning says what to use instead). */
    obsolete?: true;
    /** R-08: set when this value relaxes a safety policy for every command. */
    warning?: string;
  }>;
  unknown: string[];
  /** R-08: the variables whose value relaxes a safety policy (also on their `known` entry). */
  warnings: Array<{ name: string; message: string }>;
  deployProfile: { present: string[]; missing: string[] } | null;
}

export function checkEnvironment(processEnv: NodeJS.ProcessEnv, dotEnv: Record<string, string> | null): EnvCheckReport {
  const merged: Record<string, { value: string; source: "process" | ".env" }> = {};
  for (const [k, v] of Object.entries(processEnv)) if (typeof v === "string") merged[k] = { value: v, source: "process" };
  for (const [k, v] of Object.entries(dotEnv ?? {})) merged[k] = { value: v, source: ".env" };

  const knownNames = new Set(HARDKAS_ENV_VARIABLES.map((v) => v.name));
  const known = HARDKAS_ENV_VARIABLES.filter((v) => merged[v.name] !== undefined && merged[v.name]!.value !== "").map((v) => {
    const warning = ENV_POLICY_WARNINGS[v.name]?.(merged[v.name]!.value);
    return {
      name: v.name,
      value: v.secret ? ENV_SECRET_VALUE_MARKER : merged[v.name]!.value,
      source: merged[v.name]!.source,
      meaning: v.meaning,
      ...(v.secret ? { configured: true as const, secret: true as const } : {}),
      ...(v.obsolete ? { obsolete: true as const } : {}),
      ...(warning ? { warning } : {})
    };
  });
  const warnings = known.filter((k) => k.warning !== undefined).map((k) => ({ name: k.name, message: k.warning! }));
  const unknown = Object.keys(merged)
    .filter((k) => k.startsWith("HARDKAS_") && !knownNames.has(k) && !k.startsWith("HARDKAS_TEST_") && !k.startsWith("HARDKAS_HARNESS_") && !k.startsWith("HARDKAS_ESCROW_"))
    .sort();

  // The deployment profile is only a topic when a .env declares any of it.
  const declares = dotEnv ? DEPLOY_PROFILE_VARIABLES.some((v) => dotEnv[v] !== undefined) : false;
  const deployProfile = declares
    ? {
        present: DEPLOY_PROFILE_VARIABLES.filter((v) => (dotEnv![v] ?? "") !== ""),
        missing: ["NETWORK", "KASPAD_URL", "LOG_LEVEL"].filter((v) => (dotEnv![v] ?? "") === "")
      }
    : null;

  return { dotEnv: null, known, unknown, warnings, deployProfile };
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
        for (const v of report.known) {
          // a secret-bearing variable is reported as configured; its value is never printed (D3)
          if (v.warning) out.writeLine(`  ⚠️ ${v.name}=${v.value}  (${v.source}; ${v.warning})`);
          else if (v.obsolete) out.writeLine(`  ⚠️ ${v.name}=${v.value}  (${v.source}; ${v.meaning})`);
          else out.writeLine(v.secret ? `  ✅ ${v.name}=${v.value}  (configured; ${v.source}; ${v.meaning})` : `  ✅ ${v.name}=${v.value}  (${v.source}; ${v.meaning})`);
        }
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
