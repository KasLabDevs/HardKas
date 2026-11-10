import type { Command } from "commander";
import { getOutput, recordNoEffectOption } from "./output.js";

/**
 * ESCALÓN 2 · P19 · options kept for compatibility that change nothing. Their help says so; given on the command line
 * (never by default), each one is also named on stderr before the command runs and, in a JSON envelope, under
 * `noEffectOptions` (output.ts). None is accepted in silence any more, and none was removed: scripts that pass them keep
 * working. Keyed by the command's path (as `hardkas <path> --help` names it), then by long flag.
 */
const MAINNET_LOCKED =
  "mainnet is blocked in this release (MAINNET TOTAL LOCKDOWN): nothing is signed, sent or read on mainnet, whatever this flag says";
const NO_LOCK = "the command takes no lock of its own; each store write already waits for the store (up to 30 s)";

export const NO_EFFECT_OPTIONS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "tx plan": { "--wait-lock": NO_LOCK, "--lock-timeout": NO_LOCK },
  "tx sign": {
    "--allow-mainnet-signing": `${MAINNET_LOCKED} (MAINNET_SIGNING_DISABLED)`,
    "--wait-lock": NO_LOCK,
    "--lock-timeout": NO_LOCK
  },
  "tx send": { "--wait-lock": NO_LOCK, "--lock-timeout": NO_LOCK },
  "accounts consolidate": { "--allow-mainnet": `${MAINNET_LOCKED} (MAINNET_BROADCAST_DISABLED)` },
  init: {
    "--template": "init has one scaffold; for templates use 'hardkas create'",
    "--accounts": "init always creates the 5 simulated accounts alice…erin"
  },
  up: { "--json": "up prints human output only" },
  "localnet start": { "--detached": "the node always runs as a detached Docker container" },
  "localnet fork": { "--json": "not implemented yet: no JSON is printed" },
  "session create": { "--json": "not implemented yet: the output is text only" },
  "node logs": { "--follow": "the logs are printed once (the last --tail lines); they are not followed" },
  // ESCALÓN 4 · P39: `node start` runs only an image pinned by digest, so there is no floating tag left to allow
  "node start": { "--allow-floating-image": "node start runs only an image pinned by digest (@sha256:<64 hex>); a floating tag is never run" },
  test: {
    "--watch": "the CLI exits after the first run; the watch does not persist",
    "--mass-report": "mass reports are not produced in this release",
    "--mass-snapshot": "mass snapshots are not written in this release",
    "--mass-compare": "mass snapshots are not compared in this release"
  },
  chaos: {
    "--isolate": "every chaos campaign runs in its own new temporary directory",
    "--profile": "smoke, targeted and full use the same actor weights",
    // ESCALÓN 3 · P20: the current-directory mode never ran (the campaign stayed isolated); its flags change nothing
    "--unsafe-current-dir": "a chaos campaign never runs in the current directory; it runs in its own new temporary directory",
    "--force-ci-chaos": "there is no current-directory run to allow in CI",
    "--force-chaos-destructive": "there is no current-directory run whose guards could be bypassed"
  },
  "chaos replay": { "--isolate": "a replay always runs in a fresh temporary directory of its own" },
  // ESCALÓN 3 · P5: the command always refuses (VERIFY_SEMANTICS_UNSUPPORTED)
  "verify-semantics": { "--ci-mode": "verify-semantics always refuses: no HardKAS subsystem records the semantic hashes it would compare" }
};

function commandPath(cmd: Command): string {
  const names: string[] = [];
  for (let c: Command | null = cmd; c && c.parent; c = c.parent) names.unshift(c.name());
  return names.join(" ");
}

/** Called before every action (program.ts): warns once per no-effect option the command line gave. */
export function warnNoEffectOptions(actionCommand: Command): void {
  const specs = NO_EFFECT_OPTIONS[commandPath(actionCommand)];
  if (!specs) return;
  for (const [flag, reason] of Object.entries(specs)) {
    const option = actionCommand.options.find((o) => o.long === flag);
    if (!option || actionCommand.getOptionValueSource(option.attributeName()) !== "cli") continue;
    if (recordNoEffectOption({ code: "OPTION_NO_EFFECT", option: flag, reason })) {
      getOutput().warn(`⚠ ${flag} has no effect (OPTION_NO_EFFECT): ${reason}.`);
    }
  }
}
