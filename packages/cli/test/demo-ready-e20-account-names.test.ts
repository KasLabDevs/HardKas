import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// Demo-ready · E20 — `accounts real generate --name ana` created `ana1`. Root cause: the command
// built the runner options as `{ count: parseInt(...), ...options }`, so commander's string
// "1" overwrote the parsed count and the runner's `count === 1` never matched. A single
// account now gets exactly the requested name. Collisions stay refused — and are refused
// BEFORE any key material is written: in encrypted mode the runner used to write
// `.hardkas/keystore/<name>.json` first, overwriting the existing account's keystore, and
// only then fail on the duplicate name.

const run = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: { ...childEnv(), NO_COLOR: "1", ...env }, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const store = (ws: string) => JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "accounts.real.json"), "utf8"));
const names = (ws: string) => store(ws).accounts.map((a: any) => a.name);
const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

describe("Demo-ready · E20 · real account names", () => {
  let ws: string;
  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-demo-ready-e20-"));
  });
  afterEach(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("--name ana creates exactly `ana` when one account is requested", () => {
    const r = run(["accounts", "real", "generate", "--name", "ana", "--unsafe-plaintext", "--yes", "--json"], ws);
    expect(r.status).toBe(0);
    expect(names(ws)).toEqual(["ana"]);
    expect(JSON.parse(r.stdout.slice(r.stdout.indexOf("[")))[0].name).toBe("ana");
  });

  it("--count 2 --name ben still numbers them: ben1, ben2", () => {
    const r = run(["accounts", "real", "generate", "--name", "ben", "--count", "2", "--unsafe-plaintext", "--yes"], ws);
    expect(r.status).toBe(0);
    expect(names(ws)).toEqual(["ben1", "ben2"]);
  });

  it("a taken name is refused and the existing plaintext account is left untouched", () => {
    expect(run(["accounts", "real", "generate", "--name", "ana", "--unsafe-plaintext", "--yes"], ws).status).toBe(0);
    const before = store(ws).accounts[0];
    const again = run(["accounts", "real", "generate", "--name", "ANA", "--unsafe-plaintext", "--yes"], ws);
    expect(again.status).not.toBe(0);
    expect(again.out).toMatch(/ACCOUNT_NAME_TAKEN/);
    expect(store(ws).accounts).toEqual([before]);
  });

  it("a taken name in encrypted mode is refused before the existing keystore is touched", () => {
    const env = { HK_TEST_PW: "correct horse battery staple" };
    expect(run(["accounts", "real", "generate", "--name", "cleo", "--password-env", "HK_TEST_PW"], ws, env).status).toBe(0);
    const keystore = path.join(ws, ".hardkas", "keystore", "cleo.json");
    expect(fs.existsSync(keystore)).toBe(true);
    const before = sha(keystore);
    const again = run(["accounts", "real", "generate", "--name", "cleo", "--password-env", "HK_TEST_PW"], ws, env);
    expect(again.status).not.toBe(0);
    expect(again.out).toMatch(/ACCOUNT_NAME_TAKEN/);
    expect(sha(keystore)).toBe(before);
    expect(names(ws)).toEqual(["cleo"]);
  });
});
