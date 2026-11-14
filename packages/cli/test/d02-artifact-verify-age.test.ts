import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, HARDKAS_VERSION, calculateContentHash } from "@hardkas/artifacts";
import { runCli, tempDir } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// D-02 · `hardkas artifact verify` never fails an intact artifact for its age. It used to report INTEGRITY_FAILED and
// exit 1 for any artifact older than 30 days (STALE_ARTIFACT as an error), so archived evidence "expired" by calendar.
// Age is now a warning that names it; tamper detection is unchanged at any age. The CLI runs WITHOUT the tests-only
// HARDKAS_TEST_IGNORE_STALENESS, so the rule really runs.

const DAY = 24 * 60 * 60 * 1000;
const ADDRESS = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const STALENESS_ON = { HARDKAS_TEST_IGNORE_STALENESS: "" };

function seal(draft: Record<string, unknown>): any {
  const d: Record<string, unknown> = JSON.parse(JSON.stringify(draft));
  delete d.contentHash;
  return { ...d, contentHash: calculateContentHash(d, CURRENT_HASH_VERSION) };
}

function oldReceipt(days: number): any {
  return seal({
    schema: "hardkas.txReceipt",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simulated",
    mode: "simulator",
    createdAt: new Date(Date.now() - days * DAY - 60_000).toISOString(),
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
    txId: `synthetic-${"cd".repeat(32)}`,
    status: "confirmed",
    from: { address: ADDRESS },
    to: { address: ADDRESS },
    amountSompi: "100000000",
    feeSompi: "2036"
  });
}

const made: string[] = [];
let dir = "";
let logs = "";
const write = (name: string, value: unknown, at = dir) => {
  const file = path.join(at, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
};

beforeAll(() => {
  dir = tempDir("hk-d02-verify-", made);
  logs = tempDir("hk-d02-verify-logs-", made);
});

afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("D-02 · artifact verify: evidence does not expire", () => {
  it("a 40-day-old intact receipt: exit 0, INTEGRITY_VERIFIED, a STALE_ARTIFACT warning that names its age", async () => {
    const r = await runCli(logs, "old-intact", ["artifact", "verify", write("old-intact", oldReceipt(40)), "--json"], dir, STALENESS_ON);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.ok, r.brief).toBe(true);
    expect(r.json?.result?.levels?.integrity, r.brief).toBe("INTEGRITY_VERIFIED");
    const stale = (r.json?.result?.issues ?? []).filter((i: any) => i.code === "STALE_ARTIFACT");
    expect(stale, r.brief).toHaveLength(1);
    expect(stale[0].severity).toBe("warning");
    expect(stale[0].message).toMatch(/40 days old/);
  });

  it("a 40-day-old TAMPERED receipt: exit 1, INTEGRITY_FAILED (ARTIFACT_HASH_MISMATCH), exactly as a fresh one", async () => {
    const r = await runCli(logs, "old-tampered", ["artifact", "verify", write("old-tampered", { ...oldReceipt(40), amountSompi: "1" }), "--json"], dir, STALENESS_ON);
    expect(r.status, r.brief).toBe(1);
    expect(r.json?.result?.levels?.integrity, r.brief).toBe("INTEGRITY_FAILED");
    expect(JSON.stringify(r.json?.result?.issues), r.brief).toMatch(/ARTIFACT_HASH_MISMATCH/);
  });

  it("human output: VERIFICATION SUCCESSFUL, the age printed as a warning", async () => {
    const r = await runCli(logs, "old-human", ["artifact", "verify", write("old-human", oldReceipt(40))], dir, STALENESS_ON);
    expect(r.status, r.brief).toBe(0);
    expect(r.all, r.brief).toMatch(/VERIFICATION SUCCESSFUL/);
    expect(r.all, r.brief).toMatch(/Age: Artifact is 40 days old/);
    expect(r.all, r.brief).toMatch(/Integrity: INTEGRITY_VERIFIED/);
  });

  it("a directory of old intact receipts verifies recursively (exit 0)", async () => {
    const sub = path.join(dir, "archive");
    fs.mkdirSync(sub, { recursive: true });
    write("a", oldReceipt(45), sub);
    write("b", oldReceipt(400), sub);
    const r = await runCli(logs, "old-dir", ["artifact", "verify", sub, "--recursive", "--json"], dir, STALENESS_ON);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.result, r.brief).toMatchObject({ scanned: 2, successCount: 2, failCount: 0 });
  });
});
