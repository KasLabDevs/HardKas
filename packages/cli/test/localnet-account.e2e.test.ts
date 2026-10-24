import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// E2E-LOCALNET-ACCOUNT-1: `localnet account create` makes a REAL simnet account (docs/migrations/0.11-to-0.12.md): a
// random key, stored in plaintext in the workspace's .hardkas/accounts.real.json and never printed (SECRET-SURFACE-2).
// The synthetic `kaspa:sim_*` account this file used to expect is the contract of `simulator account create`
// (simulator-account.e2e.test.ts). No assertion here can echo a key when it fails.
const HEX64 = /[0-9a-f]{64}/i;

describe("hardkas localnet account create", () => {
  let tmpDir: string;
  const cliPath = path.resolve(__dirname, "../src/index.ts");
  const tsx = "node";
  // E2E-HARDKAS-ISOLATION-1: `localnet account create` writes .hardkas/accounts.real.json (a plaintext simnet key) in
  // the current directory and takes no --workspace, so it runs in its own temporary directory, never in the repository;
  // a bare `--import tsx` does not resolve from there, so the loader goes by absolute URL.
  const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
  const runArgs = ["--import", tsxLoader, cliPath];
  const create = (name: string) =>
    execa(tsx, [...runArgs, "localnet", "account", "create", name, "--json"], { cwd: tmpDir, reject: false });
  const stored = async (name: string) => {
    const store = JSON.parse(await fs.readFile(path.join(tmpDir, ".hardkas", "accounts.real.json"), "utf-8"));
    return store.accounts.find((a: any) => a.name === name);
  };

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "localnet-account-test-"));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates a real simnet account whose key is stored in the workspace, never printed", async () => {
    const r = await create("alice");
    expect(r.exitCode, r.stderr).toBe(0);
    expect(HEX64.test(`${r.stdout}\n${r.stderr}`), "the command prints no key").toBe(false);

    const account = JSON.parse(r.stdout);
    expect(account.accountName).toBe("alice");
    expect(account.address).toMatch(/^kaspasim:[a-z0-9]+$/);
    expect(account.securityModel).toBe("localnet-plaintext");
    expect("privateKey" in account, "the JSON carries no key").toBe(false);

    const alice = await stored("alice");
    expect(alice?.address).toBe(account.address);
    expect(/^[0-9a-f]{64}$/i.test(String(alice?.privateKey)), "the store keeps a 64-hex key").toBe(true);
  }, 180000);

  it("refuses a second account with the same name and leaves the first one untouched", async () => {
    const before = await stored("alice");
    const again = await create("alice");
    expect(again.exitCode).not.toBe(0);
    expect(`${again.stdout}\n${again.stderr}`).toMatch(/already exists/);
    const after = await stored("alice");
    expect(after?.address === before?.address && after?.privateKey === before?.privateKey, "alice is unchanged").toBe(true);
  }, 180000);

  it("gives another name another key", async () => {
    const r = await create("bob");
    expect(r.exitCode, r.stderr).toBe(0);
    const bob = JSON.parse(r.stdout);
    const alice = await stored("alice");
    expect(bob.address).toMatch(/^kaspasim:/);
    expect(bob.address).not.toBe(alice?.address);
    expect((await stored("bob"))?.privateKey !== alice?.privateKey, "bob has a key of his own").toBe(true);
  }, 180000);
});
