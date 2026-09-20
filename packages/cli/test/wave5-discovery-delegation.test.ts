import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// -----------------------------------------------------------------------------
// Wave 5 · DEF-17 · CLI delegation regression
//
// Provisions a canonical plan→signed→receipt triple in the real workspace
// layout (plan at artifacts/ root, signed under signed/, receipt under
// receipts/) and asserts that:
//   * why <artifactId>            → resolves subdir-nested artifacts
//   * why <path>                  → resolves paths
//   * explain <artifactId>        → resolves subdir-nested artifacts
//   * explain <path>              → resolves paths
//   * replay verify <directory>   → typed rejection (NEW behavior)
//   * why <partial-hex>           → typed rejection (contract tightening)
//
// These are exactly the discovery-path failures documented in DISCOVERY-1.
// They must never regress silently.
// -----------------------------------------------------------------------------

// Use the built CLI (much faster to boot than `npx tsx` on Windows and
// avoids re-transpiling the entire dependency graph per assertion). This
// requires `pnpm build` in @hardkas/cli before running this file.
const cliDist = path.resolve(__dirname, "../dist/index.js");

const PLAN_ID =
  "12819e7ae148ce513616114625135e450ea592f0980f55530e3fc6c56115e131";
const SIGNED_ID =
  "b66b90960d165c1026fdb68342b86f72883acd19cd3e2e22f94f57be3d91603c";
const RECEIPT_ID =
  "c07596a5ac21ca4a746a1da21589e5e5b88dcb298985fe733b3549184d92f48b";
const KASPA_TX_ID =
  "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";

let workspaceRoot: string;
let planPath: string;
let signedPath: string;
let receiptPath: string;

beforeAll(async () => {
  workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-wave5-cli-"));
  const artifactsDir = path.join(workspaceRoot, ".hardkas", "artifacts");
  await fsp.mkdir(path.join(artifactsDir, "signed"), { recursive: true });
  await fsp.mkdir(path.join(artifactsDir, "receipts"), { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  planPath = path.join(
    artifactsDir,
    `${timestamp}-plan-${PLAN_ID.slice(0, 16)}.plan.json`
  );
  signedPath = path.join(
    artifactsDir,
    "signed",
    `signedTx-${SIGNED_ID}.json`
  );
  receiptPath = path.join(
    artifactsDir,
    "receipts",
    `txReceipt-${RECEIPT_ID}.json`
  );

  await fsp.writeFile(
    planPath,
    JSON.stringify({
      schema: "hardkas.txPlan",
      planId: `plan-${PLAN_ID.slice(0, 16)}`,
      contentHash: PLAN_ID,
      networkId: "simnet",
      lineage: { artifactId: PLAN_ID, parentArtifactId: "", sequence: 1 }
    })
  );
  await fsp.writeFile(
    signedPath,
    JSON.stringify({
      schema: "hardkas.signedTx",
      signedId: `signed-${SIGNED_ID.slice(0, 16)}`,
      contentHash: SIGNED_ID,
      txId: KASPA_TX_ID,
      networkId: "simnet",
      lineage: { artifactId: SIGNED_ID, parentArtifactId: PLAN_ID, sequence: 2 }
    })
  );
  await fsp.writeFile(
    receiptPath,
    JSON.stringify({
      schema: "hardkas.txReceipt",
      contentHash: RECEIPT_ID,
      txId: KASPA_TX_ID,
      networkId: "simnet",
      lineage: { artifactId: RECEIPT_ID, parentArtifactId: SIGNED_ID, sequence: 3 }
    })
  );
});

afterAll(async () => {
  if (workspaceRoot) {
    await fsp.rm(workspaceRoot, { recursive: true, force: true });
  }
});

function runHardkas(args: string, extraEnv: Record<string, string> = {}) {
  try {
    const stdout = execSync(`node "${cliDist}" ${args}`, {
      encoding: "utf8",
      stdio: "pipe",
      cwd: workspaceRoot,
      env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", ...extraEnv }
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

describe("Wave 5 · DEF-17 · CLI discovery delegation", () => {
  it("hardkas why <artifactId> resolves a receipt nested under receipts/", () => {
    const r = runHardkas(`why ${RECEIPT_ID} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.target).toBe(RECEIPT_ID);
    expect(out.resolvedBy).toBe("artifactId");
    // Should walk the full lineage (plan -> signed -> receipt)
    const ids = out.chain.map((n: any) => n.id);
    expect(ids).toContain(RECEIPT_ID);
    expect(ids).toContain(SIGNED_ID);
    expect(ids).toContain(PLAN_ID);
  });

  it("hardkas why <path> resolves a receipt by direct path", () => {
    const r = runHardkas(`why "${receiptPath}" --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.resolvedBy).toBe("path");
    expect(out.chain[0].id).toBe(RECEIPT_ID);
  });

  it("hardkas why <partial-artifactId> is rejected (contract tightening)", () => {
    const r = runHardkas(`why ${RECEIPT_ID.slice(0, 16)} --json`);
    // Wave 5 removes partial-hash silent lookup. The current handleError
    // path emits a typed JSON envelope but does not propagate a non-zero
    // exit code (framework-wide behavior; separate from Wave 5). The
    // Wave 5 guarantee is: no lineage chain is produced, and the typed
    // rejection reaches the user via the envelope.
    expect(r.stdout).not.toContain('"chain"');
    expect(r.stdout).toContain('"ok": false');
    expect(r.stdout).toContain("ARTIFACT_INPUT_UNRECOGNIZED");
  });

  it("hardkas explain <artifactId> resolves a signed nested under signed/", () => {
    const r = runHardkas(`explain ${SIGNED_ID}`);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("Deterministic Explanation");
    expect(r.stdout).toContain(signedPath);
  });

  it("hardkas explain <path> resolves by direct path", () => {
    const r = runHardkas(`explain "${planPath}"`);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("Deterministic Explanation");
    expect(r.stdout).toContain(planPath);
  });

  it("hardkas replay verify <directory> is rejected with a typed error", () => {
    const r = runHardkas(
      `replay verify ".hardkas/artifacts" --json`
    );
    expect(r.code).not.toBe(0);
    // The runner writes a JSON envelope carrying result:"input_rejected"
    // AND error.code:"ARTIFACT_INPUT_IS_DIRECTORY" before throwing.
    const jsonLine = r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
      .join("");
    expect(jsonLine).toBeTruthy();
    // Loose check: the envelope must mention the directory rejection code.
    expect(r.stdout + r.stderr).toContain("ARTIFACT_INPUT_IS_DIRECTORY");
  });
});
