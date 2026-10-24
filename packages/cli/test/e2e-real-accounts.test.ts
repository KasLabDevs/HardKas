import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runAccountsRealInit } from "../src/runners/accounts-real-init-runner";
import { runAccountsRealImport } from "../src/runners/accounts-real-import-runner";
import { runAccountsRealList } from "../src/runners/accounts-real-list-runner";
import { runAccountsRealShow } from "../src/runners/accounts-real-show-runner";
import { runAccountsRealRemove } from "../src/runners/accounts-real-remove-runner";
import { getDefaultRealAccountsPath } from "@hardkas/accounts";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// E2E-REAL-ACCOUNTS-ISOLATION-1 (2026-10-24): this flow ran in process.cwd() (the repository root under the gate) and its
// beforeEach DELETED that directory's .hardkas/accounts.real.json, then left an empty store there: whoever ran the suite
// in a workspace with an account store lost it. The flow now runs in its own temporary workspace, and the directory the
// suite was started from must keep its store exactly as it was (or keep having none).
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

  it("should initialize, import, list, show and remove an account", async () => {
    // 1. Init
    await runAccountsRealInit({ workspaceRoot: ws });
    expect(fs.existsSync(accountPath)).toBe(true);

    // 2. Import
    await runAccountsRealImport({
      name: "test-acc",
      address: "kaspa:dev_test",
      privateKey: "test_priv",
      workspaceRoot: ws
    });

    // 3. List
    const listRes = await runAccountsRealList({ workspaceRoot: ws });
    expect(listRes.accounts.length).toBe(1);
    expect(listRes.accounts[0].name).toBe("test-acc");

    // 4. Show
    const showRes = await runAccountsRealShow({
      name: "test-acc",
      showPrivate: true,
      workspaceRoot: ws
    });
    expect(showRes.formatted).toContain("test_priv");

    const showResMasked = await runAccountsRealShow({
      name: "test-acc",
      showPrivate: false,
      workspaceRoot: ws
    });
    expect(showResMasked.formatted).toContain("masked");
    expect(showResMasked.formatted).not.toContain("test_priv");

    // 5. Remove
    await runAccountsRealRemove({
      name: "test-acc",
      yes: true,
      workspaceRoot: ws
    });
    const listResAfter = await runAccountsRealList({ workspaceRoot: ws });
    expect(listResAfter.accounts.length).toBe(0);
  });
});
