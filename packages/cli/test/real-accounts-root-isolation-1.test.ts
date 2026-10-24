import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createEmptyRealAccountStore } from "@hardkas/accounts";
import { repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// E2E-REAL-ACCOUNTS-ISOLATION-1 (2026-10-24). packages/cli/test/e2e-real-accounts.test.ts worked in process.cwd() — the
// repository root under the gate — and its beforeEach DELETED that directory's .hardkas/accounts.real.json before
// writing its own (with a dummy plaintext key) and leaving it empty: whoever ran the suite in a workspace with an
// account store lost it, and every gate left an empty store in the repository root.
// Here that file runs in a child vitest started from a temporary directory that already holds an account store (a
// sentinel: an empty store with a recognizable date, no key). The sentinel must come out byte for byte, nothing else may
// appear next to it, and the flow itself must still pass. The repository root's own store is checked too: the child
// must not reach it either.
// -----------------------------------------------------------------------------

const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fingerprint = (file: string) => (fs.existsSync(file) ? { exists: true, sha256: sha(file), mtimeMs: fs.statSync(file).mtimeMs } : { exists: false });
const listing = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).sort() : []);

let root: string;
let logs: string;
let sentinel: string;
let child: { status: number | null; report: any; brief: string };
let sentinelBefore: ReturnType<typeof fingerprint>;
let listingBefore: string[];
let repoStoreBefore: ReturnType<typeof fingerprint>;
const repoStore = path.join(repoRoot, ".hardkas", "accounts.real.json");

beforeAll(() => {
  assertHermeticPreloadActive();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rari1-root-"));
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rari1-logs-"));
  sentinel = path.join(root, ".hardkas", "accounts.real.json");
  fs.mkdirSync(path.dirname(sentinel), { recursive: true });
  fs.writeFileSync(sentinel, JSON.stringify({ ...createEmptyRealAccountStore(), createdAt: "2000-01-01T00:00:00.000Z" }, null, 2));
  sentinelBefore = fingerprint(sentinel);
  listingBefore = listing(path.join(root, ".hardkas"));
  repoStoreBefore = fingerprint(repoStore);
  const reportFile = path.join(logs, "report.json");
  // the child shares the repository's configuration: without coverage, or it would clean the coverage folder the
  // running suite writes into (the first run of this file failed the whole run with an ENOENT on coverage/internal/.tmp)
  const r = spawnSync(
    process.execPath,
    [path.join(repoRoot, "node_modules", "vitest", "vitest.mjs"), "run", "--root", repoRoot, "packages/cli/test/e2e-real-accounts.test.ts", "--coverage.enabled=false", "--reporter=json", `--outputFile=${reportFile}`],
    { cwd: root, encoding: "utf8", env: hermeticChildEnv(path.join(logs, "child.net.log"), { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210" }), timeout: 200_000 }
  );
  let report: any = null;
  try {
    report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  } catch {
    report = null;
  }
  child = { status: r.status, report, brief: `exit ${r.status}\nstderr: ${(r.stderr ?? "").slice(-1200)}` };
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(logs, { recursive: true, force: true });
});

describe("E2E-REAL-ACCOUNTS-ISOLATION-1 · the real-accounts flow never touches the store of the directory it runs from", () => {
  it("R-1 a store that already exists where the suite is started comes out byte for byte", () => {
    expect(fingerprint(sentinel), child.brief).toEqual(sentinelBefore);
  });

  it("R-2 nothing else appears in that directory's .hardkas", () => {
    expect(listing(path.join(root, ".hardkas")), child.brief).toEqual(listingBefore);
  });

  it("R-3 the flow itself still runs and passes (init, import, list, show, remove)", () => {
    expect(child.status, child.brief).toBe(0);
    expect(child.report?.numTotalTests, child.brief).toBe(1);
    expect(child.report?.numPassedTests, child.brief).toBe(1);
  });

  it("R-4 the repository root's own store is not reached either", () => {
    expect(fingerprint(repoStore), child.brief).toEqual(repoStoreBefore);
  });
});
