import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyGroth16Math, verifyZkProofMath, verifyR0Groth16ReceiptLocal } from "../src/index.js";

// L1-CORE-1 B5 · snarkjs (GPL-3.0) is an OPTIONAL peer dependency of @hardkas/sdk: installing the SDK does not install
// it. Without it, a verification that needs the pairing must say so with a typed issue (ZK_ENGINE_UNAVAILABLE) and an
// error status, never a generic error and never VERIFIED. Checks that need no engine (structure, canonical points, the
// weak-key filter) still run and still reject.
// The repo has snarkjs installed (devDependency), so its absence is simulated: `require.resolve("snarkjs")` fails the
// way Node fails for a package that is not installed. Everything else resolves as usual.
vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  const createRequire = (from: string | URL) => {
    const real = actual.createRequire(from);
    const resolve = Object.assign(
      (id: string, options?: { paths?: string[] }) => {
        if (id === "snarkjs") {
          throw Object.assign(new Error("Cannot find module 'snarkjs'\nRequire stack:\n- (test)"), { code: "MODULE_NOT_FOUND" });
        }
        return real.resolve(id, options);
      },
      { paths: real.resolve.paths }
    );
    return Object.assign((id: string) => real(id), real, { resolve });
  };
  return { ...actual, createRequire, default: { ...(actual as any).default, createRequire } };
});

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

const FIXTURE = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "groth16-multiplier");
const R0 = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(FIXTURE, f), "utf8"));
const TOY = { allowWeakVerificationKey: true };

function expectEngineUnavailable(issues: Array<{ code: string; message: string }>) {
  const issue = issues.find((i) => i.code === "ZK_ENGINE_UNAVAILABLE");
  expect(issue, JSON.stringify(issues)).toBeDefined();
  expect(issue!.message).toMatch(/optional peer dependency snarkjs/);
  expect(issue!.message).toMatch(/GPL-3\.0/);
  expect(issue!.message).toMatch(/install it next to @hardkas\/sdk/);
  // the reason Node gave, first line only (no require stack)
  expect(issue!.message).toContain("Cannot find module 'snarkjs'");
  expect(issue!.message).not.toContain("Require stack");
  // typed, not the generic engine error
  expect(issues.some((i) => i.code === "ZK_GROTH16_VERIFIER_ERROR")).toBe(false);
}

describe("L1-CORE-1 B5 · ZK_ENGINE_UNAVAILABLE when the optional peer snarkjs is not installed", () => {
  it("verifyGroth16Math: a proof that would verify (toy key allowed) is an engine error, never VERIFIED", async () => {
    const result = await verifyGroth16Math(read("verification-key.json"), read("public-inputs.json"), read("proof.json"), TOY);
    expect(result.status).toBe("ZK_GROTH16_VERIFIER_ERROR");
    expect(result.ok).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.summary.mathCheck).toBe("ERROR");
    expectEngineUnavailable(result.issues);
  });

  it("checks that need no engine still reject: the toy key without the opt-in is REJECTED, not an engine error", async () => {
    const result = await verifyGroth16Math(read("verification-key.json"), read("public-inputs.json"), read("proof.json"));
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.issues.map((i) => i.code)).toContain("ZK_VERIFICATION_KEY_WEAK_TRAPDOOR");
    expect(result.issues.map((i) => i.code)).not.toContain("ZK_ENGINE_UNAVAILABLE");
  });

  it("a point off the curve is REJECTED before the engine is looked for", async () => {
    const proof = read("proof.json");
    proof.pi_a[0] = "99999999999999999999";
    const result = await verifyGroth16Math(read("verification-key.json"), read("public-inputs.json"), proof, TOY);
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.issues.map((i) => i.code)).not.toContain("ZK_ENGINE_UNAVAILABLE");
  });

  it("verifyZkProofMath (what `hardkas zk proof verify-math` runs) carries the same status and issue", async () => {
    const result = await verifyZkProofMath(FIXTURE, repoRoot(), TOY);
    expect(result.status).toBe("ZK_GROTH16_VERIFIER_ERROR");
    expect(result.ok).toBe(false);
    expect(result.verified).toBe(false);
    expectEngineUnavailable(result.issues);
  });

  it("verifyR0Groth16ReceiptLocal: the official receipt is a verifier error, not VERIFIED and not REJECTED", async () => {
    const result = await verifyR0Groth16ReceiptLocal({
      receiptHex: fs.readFileSync(path.join(R0, "receipt.hex"), "utf8").trim(),
      imageId: JSON.parse(fs.readFileSync(path.join(R0, "image-id.json"), "utf8")).imageId,
      journalHash: JSON.parse(fs.readFileSync(path.join(R0, "journal.json"), "utf8")).journalHash
    });
    expect(result.status).toBe("ZK_R0_GROTH16_VERIFIER_ERROR");
    expect(result.verified).toBe(false);
    expectEngineUnavailable(result.issues);
  });
});
