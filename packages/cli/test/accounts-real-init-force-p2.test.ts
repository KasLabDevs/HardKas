/**
 * ESCALÓN 3 · P2 — `accounts real init --force` replaced the store with an empty one, silently and with no copy: every
 * account entry was gone. A store that holds accounts is now refused (REAL_ACCOUNT_STORE_NOT_EMPTY) unless
 * --discard-accounts confirms it, and any replaced store is first copied to a backup that never overwrites another.
 * Everything runs in temporary workspaces and a temporary HARDKAS_HOME; no real store is read or written.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createEmptyRealAccountStore, getDefaultRealAccountsPath, saveRealAccountStore } from "@hardkas/accounts";
import { runAccountsRealInit } from "../src/runners/accounts-real-init-runner.js";
import { cliDist, childEnv } from "./first-contact-helpers.js";

let ws: string;
let home: string;
let storePath: string;

async function storeWithAccounts(): Promise<string> {
  const store: any = {
    ...createEmptyRealAccountStore(),
    accounts: [
      { name: "keep-me", address: "kaspasim:qz0000000000000000000000000000000000000000000000000000000p5xxxxx", network: "simnet", keystoreRef: "keep-me.keystore.json" },
      { name: "and-me", address: "kaspasim:qz1111111111111111111111111111111111111111111111111111111p5yyyyy", network: "simnet", keystoreRef: "and-me.keystore.json" }
    ]
  };
  await saveRealAccountStore(store, { cwd: ws });
  return fs.readFileSync(storePath, "utf8");
}

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd: ws,
    encoding: "utf8",
    env: childEnv({ HARDKAS_HOME: home }),
    timeout: 120_000
  });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`, stdout: r.stdout ?? "" };
}

beforeEach(() => {
  // real paths: on macOS the temp dir is under /var -> /private/var, and the CLI reports paths already resolved
  ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-p2-ws-")));
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-p2-home-")));
  storePath = getDefaultRealAccountsPath(ws);
});

afterEach(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

describe("ESCALÓN 3 · P2 · accounts real init --force never drops accounts silently", () => {
  it("runner: --force on a store with accounts is refused and the store is unchanged, byte for byte", async () => {
    const before = await storeWithAccounts();
    await expect(runAccountsRealInit({ workspaceRoot: ws, force: true })).rejects.toMatchObject({
      code: "REAL_ACCOUNT_STORE_NOT_EMPTY"
    });
    expect(fs.readFileSync(storePath, "utf8")).toBe(before);
    expect(fs.readdirSync(path.dirname(storePath)).filter((f) => f.includes(".backup"))).toEqual([]);
  });

  it("runner: --force --discard-accounts keeps the old store in a backup before replacing it", async () => {
    const before = await storeWithAccounts();
    const res = await runAccountsRealInit({ workspaceRoot: ws, force: true, discardAccounts: true });
    expect(res.backup).toBe(`${storePath}.backup`);
    expect(fs.readFileSync(`${storePath}.backup`, "utf8")).toBe(before);
    expect(JSON.parse(fs.readFileSync(storePath, "utf8")).accounts).toEqual([]);

    // a second forced init never overwrites the first backup
    const again = await runAccountsRealInit({ workspaceRoot: ws, force: true });
    expect(again.backup).toBe(`${storePath}.backup.1`);
    expect(fs.readFileSync(`${storePath}.backup`, "utf8")).toBe(before);
  });

  it("runner: an empty store is replaced with --force, with a backup; without --force it is refused", async () => {
    await runAccountsRealInit({ workspaceRoot: ws });
    const before = fs.readFileSync(storePath, "utf8");
    await expect(runAccountsRealInit({ workspaceRoot: ws })).rejects.toMatchObject({ code: "REAL_ACCOUNT_STORE_EXISTS" });
    const res = await runAccountsRealInit({ workspaceRoot: ws, force: true });
    expect(fs.readFileSync(res.backup!, "utf8")).toBe(before);
  });

  it("CLI: --force with accounts inside exits non-zero with the typed code; --discard-accounts confirms it", async () => {
    const before = await storeWithAccounts();
    const refused = cli(["accounts", "real", "init", "--force", "--json"]);
    expect(refused.status, refused.out).not.toBe(0);
    expect(refused.out).toContain("REAL_ACCOUNT_STORE_NOT_EMPTY");
    expect(fs.readFileSync(storePath, "utf8")).toBe(before);

    const confirmed = cli(["accounts", "real", "init", "--force", "--discard-accounts", "--json"]);
    expect(confirmed.status, confirmed.out).toBe(0);
    const result = JSON.parse(confirmed.stdout.slice(confirmed.stdout.indexOf("{")));
    expect(result.backup).toBe(`${storePath}.backup`);
    expect(fs.readFileSync(`${storePath}.backup`, "utf8")).toBe(before);
  });
});
