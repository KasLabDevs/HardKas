import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// SECURITY-AUDIT-NODE-DATA-1 (2026-11-11). `security audit` read every file under `.hardkas/` as text, including the
// managed node's data directory (`.hardkas/kaspad/.rusty-kaspa/…`: rusty-kaspa's databases and logs). On a long-lived
// chain that is gigabytes of binary data, and the audit did not finish: the owner's merchant demo, with a 7.9 GB chain in
// its workspace, gave up after 180 s. A node data directory (`.rusty-kaspa`, wherever it is under the searched paths)
// is now left out and named in the result. Every other file is still searched: a secret next to the node data, or in a
// directory merely named like the node's parent, is still found.

const PLAINTEXT_KEY = `{"privateKey": "${"ab".repeat(32)}"}`;
const run = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv({}), input: "", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const jsonOf = (stdout: string) => JSON.parse(stdout.slice(stdout.indexOf("{")));

describe("SECURITY-AUDIT-NODE-DATA-1 · security audit leaves a Kaspa node's data directory out, and says so", () => {
  let ws: string;
  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sand1-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
  });
  afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("the node's data under .hardkas/kaspad/.rusty-kaspa is not searched: the audit passes and names it (JSON and text)", () => {
    // a file shaped like a key INSIDE the node data stands for 'whatever the databases hold': it must not be read
    write(path.join(ws, ".hardkas", "kaspad", ".rusty-kaspa", "kaspa-simnet", "datadir", "consensus", "000123.sst"), PLAINTEXT_KEY);
    write(path.join(ws, ".hardkas", "kaspad", ".rusty-kaspa", "kaspa-simnet", "logs", "rusty-kaspa.log"), "INFO node started\n");
    const j = run(["security", "audit", "--json"], ws);
    expect(j.status, j.all).toBe(0);
    const doc = jsonOf(j.stdout);
    expect(doc.result.status, j.all).toBe("PASS");
    expect(doc.result.skippedNodeData, j.all).toEqual([".hardkas/kaspad/.rusty-kaspa"]);
    const t = run(["security", "audit"], ws);
    expect(t.status, t.all).toBe(0);
    expect(t.stdout, t.all).toContain("Not searched (a Kaspa node's data directory): .hardkas/kaspad/.rusty-kaspa");
  });

  it("a parked copy of a chain (.hardkas/kaspad.parked-*/.rusty-kaspa) is left out the same way", () => {
    write(path.join(ws, ".hardkas", "kaspad.parked-20261111", ".rusty-kaspa", "kaspa-simnet", "datadir", "x.sst"), PLAINTEXT_KEY);
    const j = run(["security", "audit", "--json"], ws);
    expect(j.status, j.all).toBe(0);
    expect(jsonOf(j.stdout).result.skippedNodeData, j.all).toEqual([".hardkas/kaspad.parked-20261111/.rusty-kaspa"]);
  });

  it("control · a plaintext key NEXT TO the node data (.hardkas/kaspad/notes.json) is still found", () => {
    write(path.join(ws, ".hardkas", "kaspad", ".rusty-kaspa", "kaspa-simnet", "datadir", "x.sst"), "binary\n");
    write(path.join(ws, ".hardkas", "kaspad", "notes.json"), PLAINTEXT_KEY);
    const r = run(["security", "audit"], ws);
    expect(r.status, r.all).toBe(1);
    expect(r.all, r.all).toMatch(/SECURITY_AUDIT_FAILED/);
    expect(r.all, r.all).toContain(".hardkas/kaspad/notes.json");
    // the failure names what it did not search as well
    expect(r.all, r.all).toContain("Not searched (a Kaspa node's data directory): .hardkas/kaspad/.rusty-kaspa");
  });

  it("control · the plaintext account store is still found, and a clean workspace reports nothing skipped", () => {
    const clean = run(["security", "audit", "--json"], ws);
    expect(clean.status, clean.all).toBe(0);
    expect(jsonOf(clean.stdout).result.skippedNodeData, clean.all).toEqual([]);
    write(path.join(ws, ".hardkas", "accounts.real.json"), PLAINTEXT_KEY);
    const r = run(["security", "audit"], ws);
    expect(r.status, r.all).toBe(1);
    expect(r.all, r.all).toContain(".hardkas/accounts.real.json");
  });

  it("only a directory NAMED .rusty-kaspa is left out: a file of that name, or a directory that merely contains the word, is searched", () => {
    write(path.join(ws, ".hardkas", "runs", "my.rusty-kaspa-notes", "k.json"), PLAINTEXT_KEY);
    const r = run(["security", "audit"], ws);
    expect(r.status, r.all).toBe(1);
    expect(r.all, r.all).toContain(".hardkas/runs/my.rusty-kaspa-notes/k.json");
  });
});
