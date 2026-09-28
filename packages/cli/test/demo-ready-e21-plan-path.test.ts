import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// Demo-ready · E21 — without --out, `tx plan` persisted the plan under .hardkas/artifacts/ and said
// nothing: `tx sign` needs that path and the user had to go looking for it. The CLI now prints
// the path it actually wrote, and that path is what `tx sign` takes.

const run = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: { ...childEnv(), NO_COLOR: "1" }, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("Demo-ready · E21 · tx plan says where the plan is", () => {
  it("without --out it prints the persisted path, which exists, holds the plan and is signable", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-demo-ready-e21-"));
    try {
      expect(run(["init", "."], ws).status).toBe(0);
      const plan = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "10", "--network", "simulated"], ws);
      expect(plan.status).toBe(0);
      const m = /Plan saved to: (\S+)/.exec(plan.out);
      expect(m, plan.out).not.toBeNull();
      const printed = m![1]!;
      const abs = path.resolve(ws, printed);
      expect(fs.existsSync(abs)).toBe(true);
      expect(path.relative(path.join(ws, ".hardkas", "artifacts"), abs).startsWith("..")).toBe(false);
      const artifact = JSON.parse(fs.readFileSync(abs, "utf8"));
      expect(artifact.planId).toMatch(/^plan-/);
      expect(plan.out).toContain(artifact.planId);
      const sign = run(["tx", "sign", printed, "--account", "alice"], ws);
      expect(sign.status, sign.out).toBe(0);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  it("with --out it still reports the --out file", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-demo-ready-e21o-"));
    try {
      expect(run(["init", "."], ws).status).toBe(0);
      const plan = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "10", "--network", "simulated", "--out", "p.json"], ws);
      expect(plan.status).toBe(0);
      expect(plan.out).toMatch(/Artifact saved to: p\.json/);
      expect(fs.existsSync(path.join(ws, "p.json"))).toBe(true);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
