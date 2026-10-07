import type { Command } from "commander";
import { resolveWorkspaceRoot, workspaceExists, type WorkspaceRootResolution } from "@hardkas/config";
import { HardkasCliError, HardkasExitCode } from "./cli-errors.js";

// WORKSPACE-AUTHORITY-1 · WA-I0: one invocation, one workspace root. The CLI entry resolves it once (the nearest
// hardkas.config.* at or above `--workspace` or the current directory; else that directory) before anything runs, and
// every workspace-aware command reads it from here; nothing re-derives a root from process.cwd(). Programs parsed
// in-process (tests, the public API) never run the entry: they get the same rule per parse, from the parsed
// `--workspace` or from the current directory.

let fixed: WorkspaceRootResolution | undefined;
let parsed: WorkspaceRootResolution | undefined;

/** The `--workspace` value of an argv (`--workspace <dir>` or `--workspace=<dir>`, the last one wins; none after `--`). */
export function workspaceArgFrom(argv: readonly string[]): string | undefined {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") break;
    if (arg === "--workspace" && argv[i + 1] !== undefined) value = argv[++i];
    else if (arg.startsWith("--workspace=")) value = arg.slice("--workspace=".length);
  }
  return value;
}

/** The CLI entry's one resolution for this process. */
export function fixInvocationWorkspace(resolution: WorkspaceRootResolution): void {
  fixed = resolution;
}

/** A program parsed in-process: its own `--workspace` (or none) decides, per parse. Ignored under the CLI entry. */
export function noteParsedWorkspace(explicit: string | undefined): void {
  if (fixed) return;
  parsed = resolveWorkspaceRoot({ explicit });
}

export function invocationWorkspace(): WorkspaceRootResolution {
  return fixed ?? parsed ?? resolveWorkspaceRoot();
}

export function invocationWorkspaceRoot(): string {
  return invocationWorkspace().root;
}

/**
 * The directory a command outside the WORKSPACE-AUTHORITY-1 boundary used before `--workspace` became one global
 * override: the explicit workspace when one was given, else the current directory, exactly as those commands read it.
 */
export function explicitWorkspaceOrCwd(): string {
  const ws = invocationWorkspace();
  return ws.explicit !== undefined ? ws.root : process.cwd();
}

/**
 * The commands that take their workspace from the invocation root, by command path; an entry also covers the commands
 * under it ("query" is every query command). Every other command still acts on the current directory's workspace.
 */
export const COMMANDS_HONORING_WORKSPACE: readonly string[] = [
  // WORKSPACE-AUTHORITY-1
  "status", "verify", "ci verify", "doctor", "repair", "inspect", "rotate", "telemetry", "query", "artifact",
  "accounts balance", "tx plan", "tx sign", "tx send", "tx status", "tx profile", "tx wait", "tx verify",
  "localnet snapshot",
  // the commands that took their own --workspace before it became one global option
  "why", "explain", "replay verify", "corpus verify", "evidence pack", "dev tx send", "dev tx generate", "dev last",
  "tx batch", "workflow create"
];

/** A command's path under the program ("localnet snapshot verify"). */
export function commandPathOf(command: Command): string {
  const names: string[] = [];
  for (let c: Command | null = command; c?.parent; c = c.parent) names.unshift(c.name());
  return names.join(" ");
}

/**
 * WA-I0: an explicit `--workspace` is honoured or refused, never ignored. A command that does not take its workspace
 * from the invocation root refuses it before doing anything, instead of acting on the current directory's workspace.
 */
export function refuseIgnoredWorkspace(command: Command): void {
  const ws = invocationWorkspace();
  if (ws.explicit === undefined) return;
  const commandPath = commandPathOf(command);
  if (COMMANDS_HONORING_WORKSPACE.some((p) => commandPath === p || commandPath.startsWith(`${p} `))) return;
  throw new HardkasCliError(
    "WORKSPACE_OPTION_UNSUPPORTED",
    `'hardkas ${commandPath}' does not take --workspace: it acts on the workspace of the current directory. Nothing was done.`,
    { exitCode: HardkasExitCode.USAGE_ERROR, suggestion: `Run it from the workspace's directory (${ws.root}) without --workspace.` }
  );
}

/**
 * WA-I3: a command whose meaning is "read this workspace" needs one to exist. It never creates one: without a
 * hardkas.config.* up the tree or a `.hardkas/` at the root it fails, and nothing was written.
 */
export function requireExistingWorkspace(command: string): WorkspaceRootResolution {
  const ws = invocationWorkspace();
  if (!workspaceExists(ws)) {
    throw new HardkasCliError(
      "WORKSPACE_NOT_FOUND",
      `No HardKAS workspace at or above ${ws.startDir} (no hardkas.config.* up the tree and no .hardkas/ in ${ws.root}); '${command}' reads an existing workspace and creates none. Nothing was written.`,
      {
        exitCode: HardkasExitCode.USAGE_ERROR,
        suggestion: "Run it inside a workspace (hardkas init creates one), or pass --workspace <dir>."
      }
    );
  }
  return ws;
}
