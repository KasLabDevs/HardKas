import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// AGENT-QUICK-RECIPES-1 (2026-11-16) · `hardkas --help` opens with the shortest proven route for the common tasks, before
// Usage (a reader that keeps only the first lines still sees it), and only in the root help. Each recipe names real
// commands with options they accept, so the block cannot drift from the CLI unnoticed. No node, no network.

const run = (args: string[]) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: os.tmpdir(), env: { ...childEnv(), NO_COLOR: "1" }, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("AGENT-QUICK-RECIPES-1 · the root help opens with the quick recipes", () => {
  it("QR-1 the root help starts with the recipes, before Usage", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    const first = r.out.split(/\r?\n/)[0];
    expect(first).toMatch(/^Quick recipes \(simnet\)/);
    expect(r.out.indexOf("Quick recipes")).toBeLessThan(r.out.indexOf("Usage: hardkas"));
    expect(r.out).toMatch(/hardkas tx send --from payer .* --yes --wait --json/);
    expect(r.out).toMatch(/hardkas accounts consolidate payer .* --target-utxos 1 --execute --yes/);
  });

  it("QR-2 a subcommand's help does not repeat them", () => {
    const r = run(["tx", "--help"]);
    expect(r.out).not.toMatch(/Quick recipes/);
  });

  it("QR-3 every option a recipe uses is one its command accepts", () => {
    const optionsOf = (cmd: string[]) => flat(run([...cmd, "--help"]).out);
    const imp = optionsOf(["accounts", "real", "import"]);
    for (const o of ["--name", "--address", "--network", "--private-key-env", "--password-env"]) expect(imp).toContain(o);
    expect(imp).not.toContain("--url"); // the recipe says --url only for tx send and accounts consolidate
    const send = optionsOf(["tx", "send"]);
    for (const o of ["--from", "--to", "--amount", "--network", "--password-env", "--yes", "--wait", "--json", "--url"]) expect(send).toContain(o);
    const con = optionsOf(["accounts", "consolidate"]);
    for (const o of ["--network", "--target-utxos", "--execute", "--yes", "--password-env", "--json", "--url"]) expect(con).toContain(o);
  });
});
