// SAFETY_LEVEL: SIMULATION_ONLY

import { resolve, dirname } from "node:path";
import { existsSync, unlinkSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { loadHardkasConfig, resolveNodeEndpoint } from "@hardkas/config";

export interface RunScriptOptions {
  /** A network of the workspace config; undefined: the workspace's network (HARDKAS-NETWORK-PORTABILITY-1). */
  network?: string | undefined;
  accounts: string;
  balance: string;
  harness: boolean;
  workspaceRoot?: string;
  /** With --json the script's stdout goes to stderr: the command's stdout is its one JSON envelope. */
  json?: boolean;
}

/** The packages the injected wrapper itself imports (buildRunInjection), as opposed to the user script's own. */
const WRAPPER_PACKAGES = ["@hardkas/testing", "@hardkas/kaspa-rpc"];

/**
 * H3 (L1-CORE-1 B2): the error a failed script child printed — Node's uncaught-error line
 * (`Error [CODE]: message`, `TypeError: message`, …) — as a cause the command can name.
 */
export function scriptFailureCause(stderr: string): { name: string; code?: string; message: string } | undefined {
  const m = /^([A-Za-z]*Error)(?: \[([A-Z0-9_]+)\])?: (.+)$/m.exec(stderr);
  if (!m) return undefined;
  return { name: m[1]!, ...(m[2] ? { code: m[2] } : {}), message: m[3]!.trim() };
}

/** INT9 · how much of the script's stderr is kept to name a failure's cause: the first and the last bytes. */
const STDERR_KEEP_BYTES = 256 * 1024;

/**
 * INT9 (B6 review M-5): the script child, run to its end with its output passed on as it is written. stdin is the
 * terminal's; stdout is inherited, or (with --json) written live to this process's stderr; stderr is written live to
 * this process's stderr, and only its first and last STDERR_KEEP_BYTES are kept for scriptFailureCause. Nothing caps
 * the amount of output.
 */
export function runChildLive(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; json: boolean }
): Promise<{ status: number | null; signal: NodeJS.Signals | null; error?: Error; stderrHead: string; stderrTail: string }> {
  return new Promise((resolve) => {
    let head = Buffer.alloc(0);
    let tail = Buffer.alloc(0);
    let settled = false;
    let spawnError: Error | undefined;
    const child = spawn(command, args, {
      stdio: ["inherit", options.json ? "pipe" : "inherit", "pipe"],
      cwd: options.cwd,
      shell: false,
      env: options.env
    });
    // passed on with backpressure: a slow reader of this process's stderr slows the child, nothing piles up here
    const relay = (from: NodeJS.ReadableStream, chunk: Buffer) => {
      if (!process.stderr.write(chunk)) {
        from.pause();
        process.stderr.once("drain", () => from.resume());
      }
    };
    child.stdout?.on("data", (chunk: Buffer) => relay(child.stdout!, chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      relay(child.stderr!, chunk);
      if (head.length < STDERR_KEEP_BYTES) head = Buffer.concat([head, chunk.subarray(0, STDERR_KEEP_BYTES - head.length)]);
      tail = Buffer.concat([tail, chunk]);
      if (tail.length > STDERR_KEEP_BYTES) tail = tail.subarray(tail.length - STDERR_KEEP_BYTES);
    });
    const finish = (status: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      resolve({ status, signal, ...(spawnError ? { error: spawnError } : {}), stderrHead: head.toString("utf8"), stderrTail: tail.toString("utf8") });
    };
    child.on("error", (e) => {
      spawnError = e;
      // a child that never started emits no "close"
      if (child.pid === undefined) finish(null, null);
    });
    child.on("close", (code, signal) => finish(code, signal));
  });
}

/**
 * Validates user-controlled accounts and balance parameters before code generation.
 */
export function validateRunScriptOptions(opts: RunScriptOptions): { accounts: number; balance: bigint } {
  const accountsNum = Number(opts.accounts);
  if (!Number.isInteger(accountsNum) || accountsNum <= 0) {
    const err = new Error(`INVALID_ACCOUNTS: accounts must be a positive integer, got '${opts.accounts}'`);
    (err as any).code = "INVALID_ACCOUNTS";
    throw err;
  }
  const balanceStr = String(opts.balance).trim();
  if (!/^\d+$/.test(balanceStr)) {
    const err = new Error(`INVALID_BALANCE: balance must be a non-negative integer string, got '${opts.balance}'`);
    (err as any).code = "INVALID_BALANCE";
    throw err;
  }
  return { accounts: accountsNum, balance: BigInt(balanceStr) };
}

/**
 * HARDKAS-NETWORK-PORTABILITY-1: the network a script runs on — the one asked for, else the workspace's network (its
 * execution default, else the legacy `defaultNetwork` mirror), else simnet when there is no config. A name the
 * workspace config does not know is refused (RUN_NETWORK_UNKNOWN): it used to fall back to the simulator silently.
 */
export function resolveRunNetwork(config: any, requested: string | undefined): string {
  let name = requested;
  if (name === undefined) {
    const exec: any = config?.execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    name = typeof target?.network === "string" ? target.network : typeof config?.defaultNetwork === "string" ? config.defaultNetwork : "simnet";
  }
  if (!config?.networks?.[name as string]) {
    const known = Object.keys(config?.networks ?? {}).join(", ") || "none";
    const err = new Error(`RUN_NETWORK_UNKNOWN: network '${name}' is not in the workspace config (known: ${known}). Nothing ran.`);
    (err as any).code = "RUN_NETWORK_UNKNOWN";
    throw err;
  }
  return name as string;
}

/**
 * Resolves the tsx entrypoint from @hardkas/cli dependencies without relying on a global installation.
 */
export function resolveTsxCli(): string {
  try {
    const req = createRequire(import.meta.url);
    const tsxPkg = req.resolve("tsx/package.json");
    const tsxDir = dirname(tsxPkg);
    const distCli = resolve(tsxDir, "dist", "cli.mjs");
    if (existsSync(distCli)) {
      return distCli;
    }
    const pkg = JSON.parse(readFileSync(tsxPkg, "utf8"));
    const binRel = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.tsx || "./dist/cli.mjs";
    const resolvedBin = resolve(tsxDir, binRel);
    if (existsSync(resolvedBin)) {
      return resolvedBin;
    }
  } catch (err: any) {
    const error = new Error(`TSX_NOT_FOUND: could not resolve 'tsx' from @hardkas/cli dependencies: ${err?.message || err}`);
    (error as any).code = "TSX_NOT_FOUND";
    throw error;
  }
  const error = new Error("TSX_NOT_FOUND: 'tsx' CLI binary file does not exist in installed package");
  (error as any).code = "TSX_NOT_FOUND";
  throw error;
}

/**
 * The global `hardkas` the wrapper injects: the simulator harness on a simulated network, else an RPC client to the
 * network's endpoint that must prove it serves that network before anything is read (NODE-NETWORK-IDENTITY-1).
 */
export function buildRunInjection(config: any, opts: RunScriptOptions & { network: string }): string {
  if (!opts.harness) return "";
  const netConfig = config?.networks?.[opts.network] as Record<string, unknown> | undefined;
  if (netConfig?.kind === "simulated") {
    const validated = validateRunScriptOptions(opts);
    return `
import { createTestHarness } from "@hardkas/testing/harness";
const hardkas = createTestHarness({
  accounts: ${validated.accounts},
  initialBalance: ${validated.balance}n,
  networkId: ${JSON.stringify(opts.network)},
});
Object.assign(globalThis, { hardkas });
`;
  }
  // TESTNET-PORT-COLLISION-1: the shared endpoint authority (a public network with no endpoint the user chose refuses
  // NETWORK_ENDPOINT_REQUIRED before the script runs)
  const rpcUrl = resolveNodeEndpoint({ config, networkId: opts.network }).url;
  const networkId = typeof netConfig?.network === "string" ? netConfig.network : opts.network;
  return `
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
const rpc = new JsonWrpcKaspaClient({ rpcUrl: ${JSON.stringify(rpcUrl)}, expectedNetworkId: ${JSON.stringify(networkId)} });
const hardkas = {
  network: ${JSON.stringify(opts.network)},
  networkId: ${JSON.stringify(networkId)},
  rpcUrl: ${JSON.stringify(rpcUrl)},
  rpc: rpc
};
Object.assign(globalThis, { hardkas });
`;
}

export async function runScript(script: string, opts: RunScriptOptions): Promise<void> {
  const scriptPath = resolve(script);

  if (!existsSync(scriptPath)) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("SCRIPT_NOT_FOUND", `Script not found: ${scriptPath}`, {
      exitCode: 1
    });
  }

  // Validate parameters upfront
  try {
    validateRunScriptOptions(opts);
  } catch (e: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(e.code ?? "INVALID_ARGUMENT", e.message, { exitCode: 2 });
  }

  let config: any;
  try {
    ({ config } = await loadHardkasConfig());
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(typeof err?.code === "string" ? err.code : "CONFIG_INVALID", String(err?.message ?? e), { exitCode: 1, cause: e });
  }
  let network: string;
  try {
    network = resolveRunNetwork(config, opts.network);
  } catch (e: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(e.code ?? "RUN_NETWORK_UNKNOWN", String(e.message).replace(/^RUN_NETWORK_UNKNOWN: /, ""), { exitCode: 2 });
  }
  opts = { ...opts, network };

  let tsxCli: string;
  try {
    tsxCli = resolveTsxCli();
  } catch (e: any) {
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("MISSING_DEPENDENCY", e.message, { exitCode: 1 });
  }

  // Build a wrapper that creates the harness or RPC client and injects it as global. H3: a refusal here (an endpoint the
  // network does not declare, invalid options) keeps its code; nothing reaches the user untyped.
  let injectionCode: string;
  try {
    injectionCode = buildRunInjection(config, { ...opts, network });
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError(typeof err?.code === "string" ? err.code : "RUN_SETUP_FAILED", String(err?.message ?? e), { exitCode: 1, cause: e });
  }
  const scriptFileUrl = pathToFileURL(scriptPath).href;
  const wrapperCode = `
${injectionCode}
(async () => {
  try {
    await import(${JSON.stringify(scriptFileUrl)});
  } catch (err) {
    console.error(err);
    throw err;
  }
})();
`;

  // Write to a temp file inside .hardkas to allow workspace resolution
  const workspaceRoot = opts.workspaceRoot || process.cwd();
  const dotHardkas = resolve(workspaceRoot, ".hardkas");
  if (!existsSync(dotHardkas)) {
    mkdirSync(dotHardkas, { recursive: true });
  }

  const tempWrapper = resolve(dotHardkas, `run-${Date.now()}-${Math.random().toString(36).slice(2)}.mts`);

  const { writeFileAtomicSync } = await import("@hardkas/core");
  writeFileAtomicSync(tempWrapper, wrapperCode);

  try {
    // Execute safely without a shell using process.execPath and the resolved tsx cli. H3: the child's stderr is read
    // so a failure is answered with its cause; with --json its stdout goes to stderr too, so the command's stdout stays
    // its one JSON envelope. INT9 (B6 review M-5): the child's stderr (and, with --json, its stdout) is passed on LIVE,
    // as it is written — a script that warns or asks on stderr no longer looks hung — and nothing is buffered whole: only
    // a bounded head and tail of stderr are kept to name the cause, so any amount of output is fine (spawnSync's 64 MiB
    // maxBuffer made a script that printed more fail with ENOBUFS).
    const result = await runChildLive(process.execPath, [tsxCli, tempWrapper], {
      cwd: workspaceRoot,
      json: opts.json === true,
      env: {
        ...process.env,
        HARDKAS_NETWORK: opts.network,
        HARDKAS_ACCOUNTS: opts.accounts,
        HARDKAS_BALANCE: opts.balance
      }
    });

    if (result.error) {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("SCRIPT_EXECUTION_FAILED", `Failed to execute script: ${result.error.message}`, {
        exitCode: 1,
        cause: result.error
      });
    }

    if (result.status !== 0) {
      const { HardkasCliError } = await import("../cli-errors.js");
      const cause = scriptFailureCause(result.stderrHead) ?? scriptFailureCause(result.stderrTail);
      const missing = cause?.code === "ERR_MODULE_NOT_FOUND" ? /Cannot find package '([^']+)'/.exec(cause.message)?.[1] : undefined;
      if (missing && opts.harness && WRAPPER_PACKAGES.includes(missing)) {
        throw new HardkasCliError(
          "RUN_DEPENDENCY_MISSING",
          `The 'hardkas' global needs ${missing}, which this project does not have installed (${cause!.message}). ` +
            `Install the project's dependencies (npm install in ${workspaceRoot}; a project made by 'hardkas init' lists it), ` +
            `or run with --no-harness. The script did not run.`,
          { exitCode: 1 }
        );
      }
      throw new HardkasCliError(
        "SCRIPT_EXECUTION_FAILED",
        (result.signal ? `Script was terminated by ${result.signal}` : `Script exited with code ${result.status ?? "unknown"}`) +
          (cause ? `: ${cause.name}${cause.code ? ` [${cause.code}]` : ""}: ${cause.message}` : " (it printed no error)"),
        { exitCode: result.status ?? 1 }
      );
    }
  } finally {
    if (existsSync(tempWrapper)) {
      unlinkSync(tempWrapper);
    }
  }
}
