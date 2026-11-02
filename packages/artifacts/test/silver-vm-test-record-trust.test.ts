import { describe, it, expect } from "vitest";
import { verifyArtifactIntegritySync } from "../src/verify.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";

// -----------------------------------------------------------------------------
// F3 (H-B4) · a `hardkas silver test` record says "official-vm-scenario" only for a VERIFIED runner. Verification refuses
// an official record whose runner is UNVERIFIED, and one without runner.trust (written before the policy, when every runner
// was an unverified local build); an unverified record verifies. I-02: the record's own claim is not evidence: an official
// record's runner digest must be a trusted reference (none today), so no official record verifies. Canonical level.
// -----------------------------------------------------------------------------

const H = "ab".repeat(32);

function record(evidence: string, trust?: string) {
  const r: any = {
    schema: "hardkas.silverVmTest.v1",
    hardkasVersion: "0.13.0-rc.1",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-10-31T00:00:00.000Z",
    mode: "vm",
    networkId: "simnet",
    evidence,
    scope: "test",
    compileRecord: { path: "x.json", contentHash: H, artifactSha256: H },
    contract: "C",
    runner: {
      binarySha256: H,
      size: 1,
      provenance: "unmanaged-local-build",
      ...(trust ? { trust } : {}),
      expectedSource: { repository: "kaspanet/silverscript", releaseTag: "v1.0.0", commit: "3ed973335b59269293564805cc2c58a14595ec03", package: "cli-debugger" }
    },
    testFile: { path: "t.json", sha256: H },
    runnerInputSha256: H,
    results: [{ name: "t", function: "f", expect: "pass", outcome: "PASS", runnerStatus: "PASS", exitCode: 0, signedArgs: 0, outputSha256: H }],
    summary: { total: 1, passed: 1, failed: 0 },
    status: "PASS"
  };
  r.contentHash = calculateContentHash(r, CURRENT_HASH_VERSION);
  return r;
}

const codes = (r: any) => verifyArtifactIntegritySync(r).issues.filter((i) => i.severity === "error").map((i) => `${i.code}@${i.path ?? ""}`);

describe("F3 · silverVmTest records: official only with a VERIFIED runner", () => {
  it("R1 an unverified record from an UNVERIFIED runner verifies", () => {
    expect(codes(record("unverified-vm-scenario", "UNVERIFIED"))).toEqual([]);
  });
  it("R2 (I-02) an official record that only claims VERIFIED is refused: its runner digest is not a trusted reference (records are not signed)", () => {
    expect(codes(record("official-vm-scenario", "VERIFIED"))).toContain("ARTIFACT_SCHEMA_INVALID@runner.binarySha256");
  });
  it("R2b an R-08 record carries where its runner was found and which opt-in let it run; it verifies", () => {
    const r = record("unverified-vm-scenario", "UNVERIFIED");
    r.runner.source = "home-toolchains";
    r.runner.trustOptIn = "environment";
    r.contentHash = calculateContentHash(r, CURRENT_HASH_VERSION);
    expect(codes(r)).toEqual([]);
  });
  it("R3 an official record from an UNVERIFIED runner is refused", () => {
    expect(codes(record("official-vm-scenario", "UNVERIFIED"))).toContain("ARTIFACT_SCHEMA_INVALID@runner.trust");
  });
  it("R4 an official record without runner.trust (written before the policy) is refused", () => {
    expect(codes(record("official-vm-scenario"))).toContain("ARTIFACT_SCHEMA_INVALID@runner.trust");
  });
});
