import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAccountsRealInit } from "../src/runners/accounts-real-init-runner";
import { getDefaultRealAccountsPath, loadRealAccountStore } from "@hardkas/accounts";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// E2E-REAL-ACCOUNTS-ISOLATION-1 (2026-10-24): this flow ran in process.cwd() (the repository root under the gate) and its
// beforeEach DELETED that directory's .hardkas/accounts.real.json, then left an empty store there: whoever ran the suite
// in a workspace with an account store lost it. The flow now runs in its own temporary workspace, and the directory the
// suite was started from must keep its store exactly as it was (or keep having none).
// P27: the import, list, show and remove steps exercised runners no command registers (accounts-real-{import,list,show,
// remove}-runner.ts, removed as dead code; `accounts real import` is the keystore runner). The flow keeps the registered
// `accounts real init` runner, in its own workspace, under the same isolation check.
const startedIn = getDefaultRealAccountsPath(process.cwd());
const fingerprint = () =>
  fs.existsSync(startedIn)
    ? { exists: true, sha256: crypto.createHash("sha256").update(fs.readFileSync(startedIn)).digest("hex"), mtimeMs: fs.statSync(startedIn).mtimeMs }
    : { exists: false };

describe("E2E Real Accounts Management", () => {
  let ws: string;
  let accountPath: string;
  let before: ReturnType<typeof fingerprint>;

  beforeEach(() => {
    before = fingerprint();
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-real-accounts-"));
    accountPath = getDefaultRealAccountsPath(ws);
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
    expect(fingerprint(), "the store of the directory the suite runs in is left as it was").toEqual(before);
  });

  it("should initialize an empty account store in its own workspace, and refuse a second init without --force", async () => {
    const res = await runAccountsRealInit({ workspaceRoot: ws });
    expect(res.path).toBe(accountPath);
    expect(fs.existsSync(accountPath)).toBe(true);
    const store = await loadRealAccountStore({ cwd: ws });
    expect(store?.accounts).toEqual([]);

    await expect(runAccountsRealInit({ workspaceRoot: ws })).rejects.toThrow(/already exists/);
    expect((await loadRealAccountStore({ cwd: ws }))?.accounts).toEqual([]);
  });
});
