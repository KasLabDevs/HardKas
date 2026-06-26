export type OutputMode = "human" | "json" | "silent";

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
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
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
    writeJson(value: unknown): void {
      const replacer = (k: string, v: unknown) => typeof v === "bigint" ? v.toString() : v;
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
