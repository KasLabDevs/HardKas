import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// -----------------------------------------------------------------------------
// Wave 7 · REPLAY-MODE-1 · CLI mode guard regression.
//
// Contract enforced end-to-end:
//   - `hardkas replay verify <realNodeReceiptId>` returns a JSON envelope
//     carrying `result: "unsupported"`, `code: "REPLAY_MODE_UNSUPPORTED"`.
//   - The classification is NOT `diverged` / `non_deterministic` / etc.
//   - No `.replay.json` report file is generated under `.hardkas/artifacts`.
//   - Exit code is non-zero (execution declined).
//
// Wave 1.2 re-base: every lookup resolves by verified identity, so the fixture
// chain is sealed under the current hash version (ids are the real hashes).
// -----------------------------------------------------------------------------

const cliDist = path.resolve(__dirname, "../dist/index.js");

const KASPA_TX_ID =
  crypto.createHash("sha256").update("wave7-cli-tx").digest("hex");

/** Seals a draft under the current hash version (identity = recomputed hash). */
function seal(draft: any, label?: "planId" | "signedId"): any {
  const a: any = { ...draft, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  if (label === "planId") a.planId = `plan-${a.contentHash.slice(0, 16)}`;
  if (label === "signedId") a.signedId = `signed-${a.contentHash.slice(0, 16)}`;
  return a;
}

let ws: string;
let receiptPath: string;
let RECEIPT_ID: string;

beforeAll(async () => {
  ws = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-wave7-cli-"));
  const art = path.join(ws, ".hardkas", "artifacts");
  await fsp.mkdir(path.join(art, "signed"), { recursive: true });
  await fsp.mkdir(path.join(art, "receipts"), { recursive: true });

  const plan = seal(
    { schema: "hardkas.txPlan", networkId: "simnet", mode: "localnet", lineage: { artifactId: "", sequence: 1 } },
    "planId"
  );
  const signed = seal(
    {
      schema: "hardkas.signedTx",
      txId: KASPA_TX_ID,
      networkId: "simnet",
      mode: "localnet",
      lineage: { artifactId: "", parentArtifactId: plan.contentHash, lineageId: plan.contentHash, rootArtifactId: plan.contentHash, sequence: 2 }
    },
    "signedId"
  );
  const receipt = seal({
    schema: "hardkas.txReceipt",
    txId: KASPA_TX_ID,
    networkId: "simnet",
    mode: "localnet",
    execution: { mode: "localnet", domain: "kaspa-l1", network: "simnet" },
    lineage: { artifactId: "", parentArtifactId: signed.contentHash, lineageId: plan.contentHash, rootArtifactId: plan.contentHash, sequence: 3 }
  });
  RECEIPT_ID = receipt.contentHash;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fsp.writeFile(path.join(art, `${timestamp}-plan-${plan.contentHash.slice(0, 16)}.plan.json`), JSON.stringify(plan));
  await fsp.writeFile(path.join(art, "signed", `signedTx-${signed.contentHash}.json`), JSON.stringify(signed));
  receiptPath = path.join(art, "receipts", `txReceipt-${RECEIPT_ID}.json`);
  await fsp.writeFile(receiptPath, JSON.stringify(receipt));
});

afterAll(async () => {
  if (ws) await fsp.rm(ws, { recursive: true, force: true });
});

function runHardkas(args: string) {
  try {
    const stdout = execSync(`node "${cliDist}" ${args}`, {
      encoding: "utf8",
      stdio: "pipe",
      cwd: ws,
      env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1" }
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e: any) {
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? ""
    };
  }
}

async function countReplayReports(): Promise<number> {
  const art = path.join(ws, ".hardkas", "artifacts");
  let count = 0;
  const walk = async (dir: string) => {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name.endsWith(".replay.json")) count++;
    }
  };
  await walk(art);
  return count;
}

describe("Wave 7 · REPLAY-MODE-1 · CLI mode guard", () => {
  /**
   * The CLI emits TWO JSON blocks on unsupported-mode:
   *   1. the SDK/runner envelope (the one carrying `result`, `code`, etc.)
   *   2. the outer HardkasCliError envelope emitted by index.ts's catch
   *      (DEF-18-adjacent behavior; expected in --json mode).
   * We extract the FIRST valid JSON block by scanning brace depth.
   */
  function extractFirstJsonBlock(text: string): any {
    const start = text.indexOf("{");
    if (start === -1) throw new Error(`no JSON in output: ${text.slice(0, 200)}`);
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return JSON.parse(text.substring(start, i + 1));
      }
    }
    throw new Error(`unterminated JSON in output: ${text.slice(start, start + 200)}`);
  }

  it("hardkas replay verify <realNodeReceiptId> reports REPLAY_MODE_UNSUPPORTED", async () => {
    const reportsBefore = await countReplayReports();
    expect(reportsBefore).toBe(0);

    const r = runHardkas(`replay verify ${RECEIPT_ID} --json`);
    expect(r.code).not.toBe(0);

    // Wave 8 · DEF-18: stdout is now the top-level authoritative failure
    // envelope only. The Wave-7 runner-specific fields (`result`, `lineage`)
    // are no longer emitted on failure; the typed code is what survives.
    const envelope = JSON.parse(r.stdout.trim());
    expect(envelope.ok).toBe(false);
    expect(envelope.code).toBe("REPLAY_MODE_UNSUPPORTED");
  });

  it("no `.replay.json` report file is generated for unsupported receipts", async () => {
    const reports = await countReplayReports();
    expect(reports).toBe(0);
  });

  it("code is NEVER collapsed into UNKNOWN_ERROR", async () => {
    const r = runHardkas(`replay verify ${RECEIPT_ID} --json`);
    const envelope = JSON.parse(r.stdout.trim());
    expect(envelope.code).not.toBe("UNKNOWN_ERROR");
    // Pre-Wave-8 the classification was smuggled into the runner-envelope's
    // `result` field; some values that would have been misleading:
    //   "diverged", "non_deterministic", "missing_dependency"
    // are non-goals for a mode-guard rejection. Under Wave 8 those values
    // simply do not appear because the runner-envelope no longer exists on
    // failure — the top-level envelope has `code` only.
  });
});
