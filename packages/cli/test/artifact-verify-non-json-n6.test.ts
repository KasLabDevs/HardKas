import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// N-6 (integration round 2): `artifact verify --recursive` aborted the whole scan with an untyped UNKNOWN_ERROR
// ("Unexpected token ...") when ONE file under the directory was not JSON, and a single non-JSON file was refused
// untyped too. Contract: a non-JSON file is a typed ARTIFACT_JSON_INVALID failure; the recursive scan reports it as one
// failed file and still verifies the others.

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 180_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};
const doc = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

describe("N-6 · a non-JSON file is a typed failure, never an aborted scan", () => {
  let dir: string;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-n6-verify-"));
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    const r = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "scan/p-plan.json", "--json"], dir);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    fs.writeFileSync(path.join(dir, "scan", "broken.json"), "{ this is not json");
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("recursive: the valid plan is verified and the broken file fails as ARTIFACT_JSON_INVALID (scan completes)", () => {
    const r = cli(["artifact", "verify", "scan", "--recursive", "--json"], dir);
    const out = doc(r.stdout);
    expect(out, r.stdout + r.stderr).toBeDefined();
    expect(r.status).toBe(1);
    expect(out.ok).toBe(false);
    expect(out.result.scanned).toBe(2);
    expect(out.result.successCount).toBe(1);
    expect(out.result.failCount).toBe(1);
    const broken = out.result.results.find((x: any) => x.file === "broken.json");
    expect(broken.result.issues.map((i: any) => i.code)).toContain("ARTIFACT_JSON_INVALID");
    expect(r.stdout + r.stderr).not.toMatch(/UNKNOWN_ERROR/);
  });

  it("single file: typed ARTIFACT_JSON_INVALID, exit 1, never UNKNOWN_ERROR", () => {
    const r = cli(["artifact", "verify", "scan/broken.json", "--json"], dir);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/ARTIFACT_JSON_INVALID/);
    expect(r.stdout + r.stderr).not.toMatch(/UNKNOWN_ERROR/);
  });
});
