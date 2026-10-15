import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { childEnv, repoRoot } from "./first-contact-helpers.js";

// HERMETIC-CHILD-PRELOAD-1 (2026-10-15): tests that measure every address a child process dials must not depend on
// the environment that runs them. They passed locally because the hermetic gate (scripts/gate-hermetic.mjs) exports
// NODE_OPTIONS=--require=<preload>; CI runs plain vitest, so the children ran WITHOUT the preload — no log, so "zero
// connections" assertions held vacuously, positive ones failed, and a case meant to be refused reached a public host.
// Every such child now loads the preload itself, and a file refuses to run if the preload does not record.

export const HERMETIC_PRELOAD = path.join(repoRoot, "scripts", "hermetic", "no-network-preload.cjs");

/** NODE_OPTIONS with the hermetic preload (forward slashes: Node reads backslashes in NODE_OPTIONS as escapes). */
function withPreload(nodeOptions: string | undefined): string {
  const current = nodeOptions ?? "";
  if (current.includes("no-network-preload")) return current;
  return `${current} --require="${HERMETIC_PRELOAD.split(path.sep).join("/")}"`.trim();
}

/** The env of a child whose every connection attempt is logged to `log` (loopback allowed, anything else refused). */
export function hermeticChildEnv(log: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return childEnv({ ...extra, HARDKAS_HERMETIC_LOG: log, NODE_OPTIONS: withPreload(process.env.NODE_OPTIONS) });
}

/**
 * Proves the preload is active in a child built by hermeticChildEnv: the child tries a non-loopback address (TEST-NET-1,
 * never routed) and the log must record the refusal. Throws otherwise — a file must not measure "zero connections"
 * with an instrument that records nothing.
 */
export function assertHermeticPreloadActive(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hermetic-probe-"));
  const log = path.join(dir, "probe.net.log");
  try {
    spawnSync(
      process.execPath,
      ["-e", "const s=require('node:net').connect(9,'192.0.2.1');s.on('error',()=>{});setTimeout(()=>process.exit(0),200);"],
      { env: hermeticChildEnv(log), encoding: "utf8", timeout: 30_000 }
    );
    const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
    if (!/REFUSED_CONNECT\t192\.0\.2\.1:9/.test(text)) {
      throw new Error(`HERMETIC_PRELOAD_INACTIVE: a child built with hermeticChildEnv did not record its connection attempt (log: ${JSON.stringify(text)})`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
