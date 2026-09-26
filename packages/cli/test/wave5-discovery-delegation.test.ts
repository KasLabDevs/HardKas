import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// -----------------------------------------------------------------------------
// Wave 5 · DEF-17 · CLI delegation regression, re-based on the rc.23
// remediation Wave 1.2 contract (Closure Pack IC-5′ / D-Q3.a).
//
// Provisions a canonical plan→signed→receipt triple in the real workspace
// layout (plan at artifacts/ root, signed under signed/, receipt under
// receipts/), sealed under the current hash version because every lookup is
// verified by identity, and asserts that:
//   * why <artifactId>            → resolves subdir-nested artifacts
//   * why <path>                  → resolves paths
//   * explain <artifactId>        → resolves subdir-nested artifacts
//   * explain <path>              → resolves paths
//   * replay verify <directory>   → typed rejection
//   * why <partial-hex>           → typed rejection (NAMESPACE_REQUIRED)
// -----------------------------------------------------------------------------

// Use the built CLI (much faster to boot than `npx tsx` on Windows and
// avoids re-transpiling the entire dependency graph per assertion). This
// requires `pnpm build` in @hardkas/cli before running this file.
const cliDist = path.resolve(__dirname, "../dist/index.js");

const KASPA_TX_ID = "dc228d614488471f0804f368e8ddee605c9993624bf17b6805688df214ca32aa";

/** Seals a draft under the current hash version (identity = recomputed hash). */
function seal(draft: any, label?: "planId" | "signedId"): any {
  const a: any = { ...draft, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  if (label === "planId") a.planId = `plan-${a.contentHash.slice(0, 16)}`;
  if (label === "signedId") a.signedId = `signed-${a.contentHash.slice(0, 16)}`;
  return a;
}

let workspaceRoot: string;
let planPath: string;
let signedPath: string;
let receiptPath: string;
let PLAN_ID: string;
let SIGNED_ID: string;
let RECEIPT_ID: string;

beforeAll(async () => {
  workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-wave5-cli-"));
  const artifactsDir = path.join(workspaceRoot, ".hardkas", "artifacts");
  await fsp.mkdir(path.join(artifactsDir, "signed"), { recursive: true });
  await fsp.mkdir(path.join(artifactsDir, "receipts"), { recursive: true });

  const plan = seal(
    { schema: "hardkas.txPlan", networkId: "simnet", mode: "simulator", lineage: { artifactId: "", sequence: 1 } },
    "planId"
  );
  PLAN_ID = plan.contentHash;
  const signed = seal(
    {
      schema: "hardkas.signedTx",
      txId: KASPA_TX_ID,
      networkId: "simnet",
      mode: "simulator",
      lineage: { artifactId: "", parentArtifactId: PLAN_ID, lineageId: PLAN_ID, rootArtifactId: PLAN_ID, sequence: 2 }
    },
    "signedId"
  );
  SIGNED_ID = signed.contentHash;
  const receipt = seal({
    schema: "hardkas.txReceipt",
    txId: KASPA_TX_ID,
    networkId: "simnet",
    mode: "simulator",
    lineage: { artifactId: "", parentArtifactId: SIGNED_ID, lineageId: PLAN_ID, rootArtifactId: PLAN_ID, sequence: 3 }
  });
  RECEIPT_ID = receipt.contentHash;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  planPath = path.join(artifactsDir, `${timestamp}-plan-${PLAN_ID.slice(0, 16)}.plan.json`);
  signedPath = path.join(artifactsDir, "signed", `signedTx-${SIGNED_ID}.json`);
  receiptPath = path.join(artifactsDir, "receipts", `txReceipt-${RECEIPT_ID}.json`);

  await fsp.writeFile(planPath, JSON.stringify(plan));
  await fsp.writeFile(signedPath, JSON.stringify(signed));
  await fsp.writeFile(receiptPath, JSON.stringify(receipt));
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
    expect(out.authScope).toBe("FULL");
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
    // No lineage chain is produced, and the typed rejection reaches the user
    // via the envelope: a partial hash is neither a path nor a 64-hex
    // artifactId, so it needs a namespace (D-Q3.a).
    expect(r.stdout).not.toContain('"chain"');
    expect(r.stdout).toContain('"ok": false');
    expect(r.stdout).toContain("NAMESPACE_REQUIRED");
  });

  it("hardkas why --tx <txId> resolves the receipt, never the signed (IC-5′.2)", () => {
    const r = runHardkas(`why --tx ${KASPA_TX_ID} --json`);
    expect(r.code, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.target).toBe(RECEIPT_ID);
    expect(out.resolvedBy).toBe("txId");
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
    const r = runHardkas(`replay verify ".hardkas/artifacts" --json`);
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
