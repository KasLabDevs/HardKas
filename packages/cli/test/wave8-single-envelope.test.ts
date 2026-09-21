import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// -----------------------------------------------------------------------------
// Wave 8 · DEF-18 · Single-authoritative-failure-envelope regression.
//
// Central invariant, narrow scope (hardkas replay verify only):
//   For a JSON-mode CLI invocation, stdout must be EXACTLY ONE JSON document
//   parseable by a single `JSON.parse(stdout.trim())`. Not multiple blocks
//   concatenated. Not extractor-tolerant. The strictest contract test that
//   any programmatic consumer would use.
//
//   The typed failure code must survive from the SDK through the CLI to the
//   user without being collapsed into `UNKNOWN_ERROR`.
//
//   No second JSON document may appear on stderr.
// -----------------------------------------------------------------------------

const cliDist = path.resolve(__dirname, "../dist/index.js");

const PLAN_ID =
  crypto.createHash("sha256").update("wave8-plan").digest("hex");
const SIGNED_ID =
  crypto.createHash("sha256").update("wave8-signed").digest("hex");
const RECEIPT_ID_LOCALNET =
  crypto.createHash("sha256").update("wave8-receipt-localnet").digest("hex");
const KASPA_TX_ID =
  crypto.createHash("sha256").update("wave8-tx").digest("hex");

let ws: string;
let receiptPath: string;

beforeAll(async () => {
  ws = await fsp.mkdtemp(path.join(os.tmpdir(), "hk-wave8-envelope-"));
  const art = path.join(ws, ".hardkas", "artifacts");
  await fsp.mkdir(path.join(art, "signed"), { recursive: true });
  await fsp.mkdir(path.join(art, "receipts"), { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await fsp.writeFile(
    path.join(art, `${ts}-plan-${PLAN_ID.slice(0, 16)}.plan.json`),
    JSON.stringify({
      schema: "hardkas.txPlan",
      planId: `plan-${PLAN_ID.slice(0, 16)}`,
      contentHash: PLAN_ID,
      networkId: "simnet",
      mode: "localnet",
      lineage: { artifactId: PLAN_ID, parentArtifactId: "", sequence: 1 }
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
      lineage: { artifactId: SIGNED_ID, parentArtifactId: PLAN_ID, sequence: 2 }
    })
  );
  receiptPath = path.join(art, "receipts", `txReceipt-${RECEIPT_ID_LOCALNET}.json`);
  await fsp.writeFile(
    receiptPath,
    JSON.stringify({
      schema: "hardkas.txReceipt",
      contentHash: RECEIPT_ID_LOCALNET,
      txId: KASPA_TX_ID,
      networkId: "simnet",
      mode: "localnet",
      execution: { mode: "localnet", domain: "kaspa-l1", network: "simnet" },
      lineage: {
        artifactId: RECEIPT_ID_LOCALNET,
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

/**
 * Strict envelope-count assertion: stdout must be EXACTLY one JSON document.
 * Uses `JSON.parse(stdout.trim())` directly, not a permissive extractor.
 */
function parseSingleStdoutEnvelope(stdout: string): any {
  return JSON.parse(stdout.trim());
}

/**
 * Assertion helper for stderr: must contain no full JSON OBJECT documents.
 * Diagnostic single-value JSON (e.g. `"some string"` from a divergence
 * pretty-printer) is allowed since it's not a full envelope.
 */
function assertNoJsonObjectOnStderr(stderr: string) {
  // Scan for a brace-balanced object anywhere in stderr; fail if found.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < stderr.length; i++) {
    const ch = stderr[i];
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
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        // Found a matched `{...}` object in stderr. That would be a second envelope.
        throw new Error(
          `Unexpected JSON object on stderr:\n${stderr}`
        );
      }
    }
  }
}

describe("Wave 8 · DEF-18 · single authoritative failure envelope (replay verify)", () => {
  it("REPLAY_MODE_UNSUPPORTED · stdout parses as exactly one JSON document", () => {
    const r = runHardkas(`replay verify ${RECEIPT_ID_LOCALNET} --json`);
    expect(r.code).not.toBe(0);

    // The strict contract: single JSON document on stdout.
    let envelope: any;
    expect(() => {
      envelope = parseSingleStdoutEnvelope(r.stdout);
    }).not.toThrow();

    expect(envelope.ok).toBe(false);
    expect(envelope.code).toBe("REPLAY_MODE_UNSUPPORTED");
    // Explicit anti-regression: the collapsed UNKNOWN_ERROR must NOT appear.
    expect(envelope.code).not.toBe("UNKNOWN_ERROR");

    assertNoJsonObjectOnStderr(r.stderr);
  });

  it("REPLAY_MODE_UNSUPPORTED · exit code is non-zero", () => {
    const r = runHardkas(`replay verify ${RECEIPT_ID_LOCALNET} --json`);
    // HardkasCliError.exitCode defaults to RUNTIME_FAILURE = 1.
    expect(r.code).toBe(1);
  });

  it("ARTIFACT_INPUT_IS_DIRECTORY · stdout parses as exactly one JSON document", () => {
    const r = runHardkas(`replay verify ".hardkas/artifacts" --json`);
    expect(r.code).not.toBe(0);

    let envelope: any;
    expect(() => {
      envelope = parseSingleStdoutEnvelope(r.stdout);
    }).not.toThrow();

    expect(envelope.ok).toBe(false);
    expect(envelope.code).toBe("ARTIFACT_INPUT_IS_DIRECTORY");
    expect(envelope.code).not.toBe("UNKNOWN_ERROR");
  });

  it("human-mode typed failure · no JSON document on stdout · one presentation", () => {
    const r = runHardkas(`replay verify ${RECEIPT_ID_LOCALNET}`);
    expect(r.code).not.toBe(0);

    // Stdout must NOT parse as JSON (or be empty) in human mode.
    if (r.stdout.trim().length > 0) {
      let parsed: any = undefined;
      try {
        parsed = JSON.parse(r.stdout.trim());
      } catch {}
      expect(parsed).toBeUndefined();
    }

    // The typed code must be visible to the user somewhere (stdout or stderr).
    expect(r.stdout + r.stderr).toContain("REPLAY_MODE_UNSUPPORTED");
  });

  it("stream ownership · JSON failure envelope on stdout only", () => {
    const r = runHardkas(`replay verify ${RECEIPT_ID_LOCALNET} --json`);

    // stdout has the envelope
    const envelope = parseSingleStdoutEnvelope(r.stdout);
    expect(envelope.ok).toBe(false);

    // stderr must NOT contain a full JSON object (envelope).
    assertNoJsonObjectOnStderr(r.stderr);
  });

  it("missing artifact · single envelope with typed code, not UNKNOWN_ERROR", () => {
    // Fabricate a 64-hex artifactId that does not exist in the workspace.
    const fakeId = "f".repeat(64);
    const r = runHardkas(`replay verify ${fakeId} --json`);
    expect(r.code).not.toBe(0);

    let envelope: any;
    expect(() => {
      envelope = parseSingleStdoutEnvelope(r.stdout);
    }).not.toThrow();

    expect(envelope.ok).toBe(false);
    expect(envelope.code).not.toBe("UNKNOWN_ERROR");
    // Whatever specific typed code the resolver returns must be present.
    expect(typeof envelope.code).toBe("string");
    expect(envelope.code.length).toBeGreaterThan(0);
  });
});
