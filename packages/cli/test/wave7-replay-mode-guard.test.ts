import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// -----------------------------------------------------------------------------
// Wave 7 · REPLAY-MODE-1 · CLI mode guard regression.
//
// Contract enforced end-to-end:
//   - `hardkas replay verify <realNodeReceiptId>` returns a JSON envelope
//     carrying `result: "unsupported"`, `code: "REPLAY_MODE_UNSUPPORTED"`.
//   - The classification is NOT `diverged` / `non_deterministic` / etc.
//   - No `.replay.json` report file is generated under `.hardkas/artifacts`.
//   - Exit code is non-zero (execution declined).
// -----------------------------------------------------------------------------

const cliDist = path.resolve(__dirname, "../dist/index.js");

const PLAN_ID =
  crypto.createHash("sha256").update("wave7-cli-plan").digest("hex");
const SIGNED_ID =
  crypto.createHash("sha256").update("wave7-cli-signed").digest("hex");
const RECEIPT_ID =
  crypto.createHash("sha256").update("wave7-cli-receipt").digest("hex");
const KASPA_TX_ID =
  crypto.createHash("sha256").update("wave7-cli-tx").digest("hex");

let ws: string;
let receiptPath: string;

beforeAll(async () => {
  ws = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-wave7-cli-"));
  const art = path.join(ws, ".hardkas", "artifacts");
  await fsp.mkdir(path.join(art, "signed"), { recursive: true });
  await fsp.mkdir(path.join(art, "receipts"), { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fsp.writeFile(
    path.join(art, `${timestamp}-plan-${PLAN_ID.slice(0, 16)}.plan.json`),
    JSON.stringify({
      schema: "hardkas.txPlan",
      planId: `plan-${PLAN_ID.slice(0, 16)}`,
      contentHash: PLAN_ID,
      networkId: "simnet",
      mode: "localnet",
      lineage: {
        artifactId: PLAN_ID,
        parentArtifactId: "",
        sequence: 1
      }
    })
  );
  await fsp.writeFile(
    path.join(art, "signed", `signedTx-${SIGNED_ID}.json`),
    JSON.stringify({
      schema: "hardkas.signedTx",
      signedId: `signed-${SIGNED_ID.slice(0, 16)}`,
      contentHash: SIGNED_ID,
      txId: KASPA_TX_ID,
      networkId: "simnet",
      mode: "localnet",
      lineage: {
        artifactId: SIGNED_ID,
        parentArtifactId: PLAN_ID,
        sequence: 2
      }
    })
  );
  receiptPath = path.join(art, "receipts", `txReceipt-${RECEIPT_ID}.json`);
  await fsp.writeFile(
    receiptPath,
    JSON.stringify({
      schema: "hardkas.txReceipt",
      contentHash: RECEIPT_ID,
      txId: KASPA_TX_ID,
      networkId: "simnet",
      mode: "localnet",
      execution: { mode: "localnet", domain: "kaspa-l1", network: "simnet" },
      lineage: {
        artifactId: RECEIPT_ID,
        parentArtifactId: SIGNED_ID,
        sequence: 3
      }
    })
  );
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

  it("hardkas replay verify <realNodeReceiptId> reports unsupported/REPLAY_MODE_UNSUPPORTED", async () => {
    const reportsBefore = await countReplayReports();
    expect(reportsBefore).toBe(0);

    const r = runHardkas(`replay verify ${RECEIPT_ID} --json`);
    expect(r.code).not.toBe(0);

    const envelope = extractFirstJsonBlock(r.stdout);
    expect(envelope.result).toBe("unsupported");
    expect(envelope.code).toBe("REPLAY_MODE_UNSUPPORTED");
    expect(envelope.lineage).toBe("valid");
  });

  it("no `.replay.json` report file is generated for unsupported receipts", async () => {
    const reports = await countReplayReports();
    expect(reports).toBe(0);
  });

  it("classification is NOT diverged / non_deterministic / missing_dependency", async () => {
    const r = runHardkas(`replay verify ${RECEIPT_ID} --json`);
    const envelope = extractFirstJsonBlock(r.stdout);
    expect(envelope.result).not.toBe("diverged");
    expect(envelope.result).not.toBe("non_deterministic");
    expect(envelope.result).not.toBe("missing_dependency");
  });
});
