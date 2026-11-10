import { redactUrlCredentialsInText } from "@hardkas/core";

// EVIDENCE-TRUST-1 (ET-C5): this is the presentation boundary of the CLI. Every line and every JSON document it writes
// has the credentials carried by URLs redacted (userinfo removed, secret-named query values replaced by a marker —
// core's `redactUrlCredentialsInText`). Redaction happens here, at presentation only: it never takes part in an
// identity, an equality, a verification or a replay decision, all of which see the raw values.

export type OutputMode = "human" | "json" | "silent";

/**
 * ESCALÓN 2 · P19: options given on the command line that change nothing (no-effect-options.ts records them before the
 * action runs, and warns on stderr). A JSON envelope, an object with a boolean `ok`, names them under `noEffectOptions`.
 * A document that is an artifact (it has a `schema` or a `contentHash`) is never altered: its identity is its content,
 * and the stderr warning is the notice.
 */
export interface NoEffectOptionNotice {
  readonly code: "OPTION_NO_EFFECT";
  readonly option: string;
  readonly reason: string;
}

const noEffectOptionsGiven: NoEffectOptionNotice[] = [];

export function recordNoEffectOption(notice: NoEffectOptionNotice): boolean {
  if (noEffectOptionsGiven.some((n) => n.option === notice.option)) return false;
  noEffectOptionsGiven.push(notice);
  return true;
}

function withNoEffectOptions(value: unknown): unknown {
  if (noEffectOptionsGiven.length === 0 || value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const doc = value as Record<string, unknown>;
  if (typeof doc.ok !== "boolean" || "schema" in doc || "contentHash" in doc || "noEffectOptions" in doc) return value;
  return { ...doc, noEffectOptions: [...noEffectOptionsGiven] };
}

export interface CommandOutputOptions {
  mode: OutputMode;
  stdout?: NodeJS.WriteStream | { write: (msg: string) => void };
  stderr?: NodeJS.WriteStream | { write: (msg: string) => void };
}

export interface CommandOutput {
  mode: OutputMode;
  jsonWritten: boolean;
  write(message: string): void;
  writeLine(message: string): void;
  writeJson(value: unknown): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createCommandOutput(options: CommandOutputOptions): CommandOutput {
  const rawStdout = options.stdout || process.stdout;
  const rawStderr = options.stderr || process.stderr;
  const stdout = { write: (message: string) => rawStdout.write(redactUrlCredentialsInText(message)) };
  const stderr = { write: (message: string) => rawStderr.write(redactUrlCredentialsInText(message)) };
  const mode = options.mode;

  return {
    mode,
    write(message: string): void {
      if (mode === "human") {
        stdout.write(message);
      } else if (mode === "json") {
        // In json mode, write/writeLine goes to stderr to prevent corrupting pure JSON stdout.
        stderr.write(message);
      }
      // silent suppresses normal write
    },
    writeLine(message: string): void {
      if (mode === "human") {
        stdout.write(message + "\n");
      } else if (mode === "json") {
        stderr.write(message + "\n");
      }
    },
    jsonWritten: false,
    writeJson(input: unknown): void {
      const value = withNoEffectOptions(input);
      const replacer = (k: string, v: unknown) =>
        typeof v === "bigint" ? v.toString() : typeof v === "string" ? redactUrlCredentialsInText(v) : v;
      if (mode === "human") {
        stdout.write(JSON.stringify(value, replacer, 2) + "\n");
      } else if (mode === "json") {
        stdout.write(JSON.stringify(value, replacer, 2) + "\n");
      }
      this.jsonWritten = true;
    },
    warn(message: string): void {
      if (mode !== "silent") {
        stderr.write(message + "\n");
      }
    },
    error(message: string): void {
      // Errors always go to stderr, even in silent mode.
      stderr.write(message + "\n");
    }
  };
}

// ============================================================================
// TEMPORARY GLOBAL BRIDGE (CLI ONLY)
// Do not expose this to SDK/Core. This is a stopgap until all CLI commands
// are refactored to accept CommandOutput explicitly.
// ============================================================================
let globalOutput: CommandOutput = createCommandOutput({ mode: "human" });

export function setGlobalOutput(out: CommandOutput) {
  globalOutput = out;
}

export function getOutput(): CommandOutput {
  return globalOutput;
}

const CONSOLE_GUARD = Symbol.for("@hardkas/cli/console-url-redaction.v1");

/**
 * EVIDENCE-TRUST-1 (ET-C5): the same presentation boundary for what the CLI process prints straight to the console —
 * printers that do not go through `getOutput()`, and servers it hosts in-process (the dev server's access log). String
 * arguments have their URL credentials redacted; nothing else changes. Installed once, by the CLI entry point only.
 */
export function installConsoleRedaction(): void {
  const c = console as any;
  if (c[CONSOLE_GUARD]) return;
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const original = c[method].bind(console);
    c[method] = (...args: unknown[]) =>
      original(...args.map((a) => (typeof a === "string" ? redactUrlCredentialsInText(a) : a)));
  }
  c[CONSOLE_GUARD] = true;
}
