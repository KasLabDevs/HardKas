import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// Example 11 (KCC-20) runs as documented: its sample state, transfer and kcc20.json through the built CLI, and its API
// walkthrough through the built @hardkas/core. Canonical level.
// -----------------------------------------------------------------------------

const EX = path.join(repoRoot, "examples", "11-kcc20-token");
const cli = (args: string[]) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: repoRoot, env: childEnv({ NO_COLOR: "1" }), encoding: "utf8", timeout: 60_000 });
  return { exit: r.status, json: (() => { try { return JSON.parse(r.stdout); } catch { return undefined; } })(), text: `${r.stdout}\n${r.stderr}` };
};

describe("example 11 · KCC-20", () => {
  it("E1 state.json encodes to the KCC-20 vector's encoding", () => {
    const r = cli(["kcc20", "encode-state", path.join(EX, "state.json"), "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect(r.json.encodedState).toBe("08e8030000000000002011111111111111111111111111111111111111111111111111111111111111110101010120f401000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000");
  });

  it("E2 transfer.json is STRUCTURALLY_VALID with one unverified owner signature", () => {
    const r = cli(["kcc20", "check", path.join(EX, "transfer.json"), "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect([r.json.verdict, r.json.signaturesNotVerified.length]).toEqual(["STRUCTURALLY_VALID", 1]);
  });

  it("E3 kcc20.json is the default configuration", () => {
    const r = cli(["kcc20", "artifact", path.join(EX, "kcc20.json"), "--json"]);
    expect(r.exit, r.text).toBe(0);
    expect(r.json.entrypointTags.transfer.dispatchTag).toBe("79c71c23");
  });

  it("E4 walkthrough.mjs runs: an accepted transfer, a refused inflation, the hash-chain guard", () => {
    const r = spawnSync(process.execPath, [path.join(EX, "walkthrough.mjs")], { cwd: repoRoot, env: childEnv({ NO_COLOR: "1" }), encoding: "utf8", timeout: 60_000 });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("transfer  79c71c23");
    expect(r.stdout).toContain("state     112 bytes; decodes to amount 1000");
    expect(r.stdout).toMatch(/check\s+\{\s+accepted: true,\s+path: 'normal'/);
    expect(r.stdout).toMatch(/inflated\s+\{\s+accepted: false,\s+rule: 'conservation'/);
    expect(r.stdout).toContain("initial borrow_guard 46530c9d75f7a5a1ce01b4e04cd8833f5f30c2482f99d855e3841279a8bcb8cc");
  });
});
