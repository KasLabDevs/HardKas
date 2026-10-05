import pc from "picocolors";
import { formatSompiToKas, maskSecrets } from "@hardkas/core";

import { getOutput } from "./output.js";

export const UI = {
  setJsonMode(enabled: boolean) {
    // No-op. Output mode is now determined globally via createCommandOutput.
  },

  isJsonMode() {
    return getOutput().mode === "json";
  },

  logHuman(msg: string) {
    getOutput().writeLine(msg);
  },

  writeJson(data: any) {
    getOutput().writeJson(data);
  },

  header(text: string) {
    // EVIDENCE-TRUST-1 (D8): a title names things (a file, an id): identity text is never shape-masked — a 64-hex
    // content hash is not a secret. URL credentials are redacted by the output itself (output.ts).
    this.logHuman(pc.bold(pc.magenta(`\n  ═══ ${text} ═══`)));
  },

  divider() {
    this.logHuman(pc.dim("  " + "─".repeat(50)));
  },

  bullet(text: string) {
    this.logHuman(`  • ${text}`);
  },

  step(num: number, text: string) {
    this.logHuman(`  ${pc.dim(num.toString() + ".")} ${text}`);
  },

  raw(text: string) {
    this.logHuman(text);
  },

  emptyLine() {
    this.logHuman("");
  },

  info(text: string) {
    this.logHuman(`  ${pc.blue("ℹ")} ${text}`);
  },

  success(text: string) {
    this.logHuman(`  ${pc.green("✔")} ${text}`);
  },

  box(title: string, subtitle?: string) {
    const width = 40;
    this.logHuman(pc.magenta(`  ╔${"═".repeat(width - 2)}╗`));
    this.logHuman(
      pc.magenta(
        `  ║${pc.bold(pc.white(title.padStart((width - 2 + title.length) / 2).padEnd(width - 2)))}║`
      )
    );
    if (subtitle) {
      this.logHuman(
        pc.magenta(
          `  ║${pc.italic(pc.dim(subtitle.padStart((width - 2 + subtitle.length) / 2).padEnd(width - 2)))}║`
        )
      );
    }
    this.logHuman(pc.magenta(`  ╚${"═".repeat(width - 2)}╝`));
    this.logHuman("");
  },

  warning(text: string) {
    const masked = maskSecrets(text);
    getOutput().error(pc.yellow(`\n  ⚠️  WARNING:`));
    getOutput().error(pc.yellow(`     ${masked}`));
  },

  securityWarning(code: string, message: string, suggestion?: string) {
    getOutput().error(pc.yellow(`\n  ⚠️  SECURITY WARNING [${code}]:`));
    getOutput().error(pc.yellow(`     ${message}`));
    if (suggestion) {
      getOutput().error(pc.cyan(`\n  💡 Suggestion:`));
      getOutput().error(pc.cyan(`     ${suggestion}`));
    }
    getOutput().error("");
  },

  error(msg: string, suggestion?: string) {
    const maskedMsg = maskSecrets(msg);
    const maskedSuggestion = suggestion ? maskSecrets(suggestion) : undefined;
    getOutput().error(pc.red(`\n  ✗ Error:`));
    getOutput().error(pc.red(`    ${maskedMsg}`));
    if (maskedSuggestion) {
      getOutput().error(pc.cyan(`\n  💡 Suggestion:`));
      getOutput().error(pc.cyan(`    ${maskedSuggestion}`));
    }
  },

  field(label: string, value: string | number | boolean | undefined | null) {
    // EVIDENCE-TRUST-1 (D8): a field is structured output (hashes, ids): no shape mask.
    const val =
      value === undefined || value === null ? pc.dim("none") : String(value);
    this.logHuman(`  ${pc.dim(label.padEnd(16))} ${pc.white(val)}`);
  },

  kas(label: string, sompi: bigint | string) {
    this.field(label, pc.cyan(formatSompiToKas(BigInt(sompi))));
  },

  maturity(label: string) {
    const colors: Record<string, any> = {
      stable: pc.green,
      preview: pc.blue,
      experimental: pc.yellow,
      research: pc.magenta,
      internal: pc.dim
    };
    const color = colors[label.toLowerCase()] || pc.white;
    return color(label.toLowerCase());
  },

  async confirm(message: string): Promise<boolean> {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(pc.yellow(`  ⚠️  ${message} (y/N): `));
    rl.close();
    return answer.toLowerCase() === "y";
  },

  footer(hint?: string) {
    if (hint) {
      this.logHuman(pc.dim(`\n  Hint: ${hint}`));
    }
    this.logHuman("");
  },

  causality(
    title: string,
    details: Record<string, string | undefined>,
    nextSteps?: string[],
    // Demo-cut · T-A14b: the icon follows the outcome — a rejection is never shown with ✔.
    tone: "ok" | "fail" | "info" = "ok"
  ) {
    const icon = tone === "fail" ? pc.red("✗") : tone === "info" ? pc.cyan("ℹ") : pc.green("✔");
    this.logHuman(`\n  ${icon} ${pc.bold(title)}\n`);
    for (const [key, value] of Object.entries(details)) {
      if (value) {
        this.logHuman(`  ${pc.dim(key)}`);
        this.logHuman(`    ${pc.white(value)}\n`);
      }
    }
    if (nextSteps && nextSteps.length > 0) {
      this.printNextSteps(nextSteps);
    }
  },

  printNextSteps(steps: string[]) {
    if (getOutput().mode === "json") return;
    this.logHuman(`\n  💡 ${pc.bold("Next Steps:")}`);
    for (const step of steps) {
      this.logHuman(`     > ${pc.blue(step)}`);
    }
    this.logHuman("");
  },

  semanticError(
    title: string,
    cause: string,
    invariant: string,
    consequence: string,
    remediation: string
  ) {
    getOutput().error(pc.red(`\n  ✗ ${title}\n`));
    getOutput().error(`  ${pc.dim("Cause:")}`);
    getOutput().error(`    ${pc.white(cause)}\n`);
    getOutput().error(`  ${pc.dim("Invariant Violated:")}`);
    getOutput().error(`    ${pc.yellow(invariant)}\n`);
    getOutput().error(`  ${pc.dim("Consequence:")}`);
    getOutput().error(`    ${pc.white(consequence)}\n`);
    getOutput().error(`  ${pc.dim("Remediation:")}`);
    getOutput().error(`    ${pc.cyan(remediation)}\n`);
  },

  dryRun(message?: string) {
    // Always write to stderr — must not pollute stdout (which may carry JSON)
    getOutput().error(pc.yellow(`\n  [DRY RUN]`));
    getOutput().error(pc.white(`  No persistent artifacts were written.`));
    getOutput().error(
      pc.dim(
        `\n  Use:\n    ${pc.white("--yes")}\n  to persist deterministic artifacts.\n`
      )
    );
  },

  writeError(msg: string) {
    // Unconditionally writes to stderr — safe in both JSON and human mode
    getOutput().error(msg);
  }
};

/**
 * The machine-readable code of an error: its `code`, else a leading `CODE_X:` or `[CODE_X]` of its message
 * (HardKAS errors are thrown in both spellings without a `code`), else UNKNOWN_ERROR — the one parser of codes.
 */
export function errorCodeOf(e: unknown): string {
  const code = (e as any)?.code;
  if (code) return String(code);
  const message = e instanceof Error ? e.message : String(e);
  return (
    /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+):\s/.exec(message)?.[1] ??
    /^\[([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\]/.exec(message)?.[1] ??
    "UNKNOWN_ERROR"
  );
}

/**
 * CLI-RUNTIME-CONTRACT-1 · the exit code an error means for the process: the error's own `exitCode`
 * (HardkasCliError, chaos verdicts), POLICY_DENIED for that code, else RUNTIME_FAILURE.
 */
export function exitCodeOf(e: unknown): number {
  const own = (e as any)?.exitCode;
  if (typeof own === "number" && Number.isInteger(own) && own > 0) return own;
  return errorCodeOf(e) === "POLICY_DENIED" ? 3 : 1;
}

/**
 * CLI-RUNTIME-CONTRACT-1 · a rendered error is a failure of the run: the process can never end with
 * exit 0 after it, whether the command rethrows or returns. The first nonzero exit code is kept.
 */
export function recordFailure(e: unknown): void {
  const current = process.exitCode;
  if (typeof current === "number" && current !== 0) return;
  process.exitCode = exitCodeOf(e);
}

// An error is rendered once, however many handlers see it on its way out (a command's catch, then main()).
const RENDERED = Symbol.for("hardkas.cli.error.rendered");
function alreadyRendered(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as any)[RENDERED] === true;
}
function markRendered(e: unknown): void {
  if (typeof e !== "object" || e === null) return;
  try {
    Object.defineProperty(e, RENDERED, { value: true, enumerable: false, configurable: true });
  } catch {
    /* frozen objects stay unmarked and may render twice */
  }
}

/**
 * The one owner of a failure's presentation: records the exit code, writes the single JSON envelope
 * (every error type, typed or not) and renders the human form — once per error.
 */
export function handleError(e: unknown, context?: string) {
  recordFailure(e);
  if (alreadyRendered(e)) return;
  markRendered(e);

  const rawMsg = e instanceof Error ? e.message : String(e);
  // EVIDENCE-TRUST-1 (D8): the shape-based mask is a safety net for the free text a human reads; the JSON envelope is
  // structured output and keeps identities (content hashes, txIds) whole. URL credentials are redacted in both, by the
  // output itself (output.ts).
  const msg = maskSecrets(rawMsg);
  const errorObj = e as any;

  // JSON mode: exactly one failure envelope on stdout, whoever renders first. Previously a typed
  // error that a command swallowed left no envelope at all (and exit 0).
  if (UI.isJsonMode() && !getOutput().jsonWritten) {
    getOutput().writeJson({
      ok: false,
      code: errorCodeOf(e),
      message: context ? `${context}: ${rawMsg}` : rawMsg,
      mode: "cli"
    });
  }

  if (e instanceof Error && (e as any).code === "REPLAY_DIVERGED") {
    const report = (e as any).report;
    UI.semanticError(
      "Replay Verification Failed",
      report?.errors?.[0] || "State modifications detected during deterministic replay",
      "deterministic execution integrity",
      "replay artifact is corrupted and excluded from deterministic validation",
      "restore the original artifact or regenerate the replay lineage"
    );

    if (report && report.divergences && report.divergences.length > 0) {
      // Always use stderr — divergence output must not corrupt JSON stdout
      getOutput().error(pc.bold("\n  Divergences found:"));
      for (const div of report.divergences) {
        getOutput().error(`    ${pc.cyan(div.path)}:`);
        if (div?.secret === true) {
          // A divergence at a secret field carries no values (diffArtifacts redacts them): say so,
          // never print `undefined` as if it were the content.
          getOutput().error(`      ${pc.dim("(secret field: the values differ and are not shown)")}`);
          continue;
        }
        getOutput().error(`      Expected: ${pc.green(JSON.stringify(div.expected))}`);
        getOutput().error(`      Actual:   ${pc.red(JSON.stringify(div.actual))}`);
      }
    }
    return;
  }

  // HardkasCliError is structured: code, message and (optionally) a suggestion.
  if (errorObj.name === "HardkasCliError") {
    if (!UI.isJsonMode()) {
      getOutput().error(`\n  ✗ [${errorObj.code}] ${msg}`);
      if (errorObj.suggestion) {
        getOutput().error(pc.cyan(`\n  💡 Suggestion:`));
        getOutput().error(pc.cyan(`    ${maskSecrets(String(errorObj.suggestion))}`));
      }
    }
    return;
  }

  if (UI.isJsonMode()) return;

  let reason = maskSecrets ? maskSecrets(errorObj.reason) : errorObj.reason;
  let suggestion = maskSecrets ? maskSecrets(errorObj.suggestion) : errorObj.suggestion;

  if (msg === "Real transaction signing is not available") {
    getOutput().error(`\n${msg}`);
    if (reason) getOutput().error(`\nReason:\n  ${reason}`);
    if (suggestion)
      getOutput().error(`\nSuggestion:\n  ${suggestion}\n  No artifact was written.`);
    return;
  }

  if (!suggestion) {
    if (msg.includes("Localnet state not found")) {
      suggestion =
        "Run 'hardkas localnet reset' to initialize the simulated environment.";
    } else if (msg.includes("Insufficient funds")) {
      suggestion =
        "Use 'hardkas faucet <address> <amount>' to add funds to your account.";
    } else if (msg.includes("Account not found")) {
      suggestion = "Check your 'hardkas.config.ts' or use a full Kaspa address.";
    } else if (msg.includes("Docker") || msg.includes("container")) {
      suggestion =
        "Ensure Docker is running and you have permissions to manage containers.";
    } else if (msg.includes("L2 RPC") || msg.includes("L2 profile")) {
      suggestion = "Check your L2 network configuration or pass a valid --url.";
    } else if (msg.includes("RPC") || msg.includes("Connection refused")) {
      suggestion =
        "The Kaspa node might still be starting. Try 'hardkas rpc health --wait'.";
    } else if (msg.includes("submitTransaction is not exposed")) {
      suggestion =
        "Ensure your node/RPC provider supports transaction submission and you are NOT on mainnet without --allow-mainnet-signing.";
    }
  }

  UI.error(context ? `${context}: ${msg}` : msg, suggestion);

  if (e instanceof Error && (e as any).code && (e as any).context) {
    const ctx = (e as any).context;
    getOutput().error(`  ${pc.dim("Code:")}     ${pc.white((e as any).code)}`);
    if (ctx.endpoint)
      getOutput().error(`  ${pc.dim("Endpoint:")} ${pc.white(ctx.endpoint)}`);
    if (ctx.network)
      getOutput().error(`  ${pc.dim("Network:")}  ${pc.white(ctx.network)}`);
    if (ctx.protocol)
      getOutput().error(`  ${pc.dim("Protocol:")} ${pc.white(ctx.protocol)}`);
  }
}

/**
 * Specialized error handler for lock-related errors.
 */
export function handleLockError(e: any) {
  const code = errorCodeOf(e);
  if (code !== "LOCK_HELD" && code !== "LOCK_TIMEOUT" && code !== "STALE_LOCK") {
    handleError(e);
    return;
  }

  // CLI-RUNTIME-CONTRACT-1: a lock conflict is a failure of the run too, rendered once.
  recordFailure(e);
  if (alreadyRendered(e)) return;
  markRendered(e);
  const meta = e.cause as any;

  if (UI.isJsonMode()) {
    if (!getOutput().jsonWritten) {
      getOutput().writeJson({
        ok: false,
        code,
        message: e.message || "Lock error",
        mode: "cli",
        meta
      });
    }
    return;
  }

  {
    const title =
      code === "STALE_LOCK"
        ? "Stale Workspace Lock Detected"
        : "Workspace is locked by another HardKAS process";

    getOutput().error(pc.red(`\n  ✗ ${pc.bold(title)}`));
    getOutput().error(pc.red(`  ${"─".repeat(title.length + 4)}`));

    if (meta) {
      getOutput().error(`  ${pc.dim("Lock:")}    ${pc.white(meta.name)}`);
      getOutput().error(`  ${pc.dim("PID:")}     ${pc.white(meta.pid)}`);
      getOutput().error(`  ${pc.dim("Command:")} ${pc.white(meta.command)}`);
      getOutput().error(`  ${pc.dim("Created:")} ${pc.white(meta.createdAt)}`);
      if (meta.path) getOutput().error(`  ${pc.dim("Path:")}    ${pc.white(meta.path)}`);
    }

    getOutput().error(pc.cyan(`\n  💡 Suggestion:`));
    if (code === "STALE_LOCK") {
      getOutput().error(`    The process (PID ${meta?.pid}) appears to be dead.`);
      getOutput().error(
        `    Run 'hardkas lock clear ${meta?.name} --if-dead' to release it safely.`
      );
    } else {
      getOutput().error(`    Wait for the process to finish, or run:`);
      getOutput().error(`    hardkas lock doctor`);
      getOutput().error(`\n    If you believe the process is dead:`);
      getOutput().error(`    hardkas lock clear ${meta?.name} --if-dead`);
    }
    getOutput().error("");
  }
}
