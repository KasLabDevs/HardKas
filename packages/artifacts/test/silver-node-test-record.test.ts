import { describe, it, expect } from "vitest";
import { verifyArtifactIntegritySync } from "../src/verify.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";

// -----------------------------------------------------------------------------
// `hardkas silver test --on-node` writes `hardkas.silverNodeTest.v1`: each case's verdict is a Kaspa node's answer to the
// real transaction the case describes, with its txid; a case no real transaction reproduces is NOT_REPRODUCIBLE, without
// a verdict. The record below has the shape of one the isolated simnet node produced through the built CLI (txids and
// addresses from that run). Verification accepts it, and refuses a record whose verdicts, summary or status do not hold
// together: a pass without a node verdict, a NOT_REPRODUCIBLE case with a level, a summary or status that does not count
// the results, CONSENSUS_SIMNET on another network. Canonical level.
// -----------------------------------------------------------------------------

const H = (c: string) => c.repeat(64);

function record(mutate?: (r: any) => void) {
  const r: any = {
    schema: "hardkas.silverNodeTest.v1",
    hardkasVersion: "0.0.0-test",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-11-15T15:56:31.792Z",
    mode: "rpc",
    networkId: "simnet",
    evidence: "node-verdicts",
    scope: "Each case's verdict is a Kaspa node's answer to the real transaction the case describes.",
    compileRecord: { path: "guarded.record.json", contentHash: H("7"), artifactSha256: H("b") },
    contract: "GuardedRelease",
    address: "kaspasim:pq8yyles9enzz5c6ryh2q86xdqp867ltgkx9qrvpeuhlh4x3q4h02dp8m60zm",
    lockingScript: { version: 0, script: "aa200e427f302e6621531a192ea01f4668027d7beb458c500d81cf2ffbd4d1056ef587" },
    testFile: { path: "o1.test.json", sha256: H("c") },
    funder: "alice",
    node: { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network: "simnet", sync: "synced", endpoint: "ws://127.0.0.1:59762" },
    results: [
      {
        name: "owner-right-guess-v0",
        function: "release",
        expect: "pass",
        outcome: "PASS",
        verdictLevel: "CONSENSUS_SIMNET",
        nodeVerdict: "ACCEPTED",
        txVersion: 0,
        txId: "1a6e52e1113403fb89582e69301be51d109b5bf00d49eb6a0ad204a0e93c03de",
        coin: {
          outpoint: { transactionId: "37b473643845e5f23e9c43905d7855423b19401cd1cacf283f04b03fb7d4429b", index: 0 },
          valueSompi: "1000000000",
          fundingTxId: "37b473643845e5f23e9c43905d7855423b19401cd1cacf283f04b03fb7d4429b"
        },
        effect: "SPENT_IN_CHAIN"
      },
      {
        name: "owner-wrong-guess-v0",
        function: "release",
        expect: "fail",
        outcome: "PASS",
        verdictLevel: "CONSENSUS_SIMNET",
        nodeVerdict: "REJECTED",
        txVersion: 0,
        txId: "247aa9625f1f3caacdb3b0defb5842e73ee561a851f549a548a1bcf42b8bab2e",
        coin: {
          outpoint: { transactionId: "a2703aec119470c2cf3b0fb4e62b4f8b05718d456fa11c27b3e04d1488640bc8", index: 0 },
          valueSompi: "1000000000",
          fundingTxId: "a2703aec119470c2cf3b0fb4e62b4f8b05718d456fa11c27b3e04d1488640bc8"
        },
        nodeReason: "failed to verify the signature script: script ran, but verification failed",
        nodeReasonCode: "SCRIPT_POLICY_REJECTED"
      },
      {
        name: "runner-default-scenario",
        function: "release",
        expect: "pass",
        outcome: "NOT_REPRODUCIBLE",
        verdictLevel: null,
        nodeVerdict: null,
        notReproducible: { code: "RUNNER_DEFAULT_SCENARIO", reason: "the case states no tx: the runner's default scenario is no real transaction" }
      }
    ],
    summary: { total: 3, passed: 2, failed: 0, inconclusive: 0, notReproducible: 1, level: "CONSENSUS_SIMNET", casesAtLevel: 2 },
    status: "INCOMPLETE"
  };
  mutate?.(r);
  r.contentHash = calculateContentHash(r, CURRENT_HASH_VERSION);
  return r;
}

const errors = (r: any) => verifyArtifactIntegritySync(r).issues.filter((i) => i.severity === "error").map((i) => `${i.code}@${i.path ?? ""}`);

describe("silverNodeTest records (silver test --on-node)", () => {
  it("N1 a record with node verdicts and one not reproducible case verifies", () => {
    expect(errors(record())).toEqual([]);
  });
  it("N2 a run whose every case has a node verdict is PASS; one with a failure is FAIL", () => {
    expect(
      errors(
        record((r) => {
          r.results.pop();
          r.summary = { ...r.summary, total: 2, notReproducible: 0 };
          r.status = "PASS";
        })
      )
    ).toEqual([]);
    expect(
      errors(
        record((r) => {
          r.results[0].outcome = "FAIL";
          r.summary = { ...r.summary, passed: 1, failed: 1 };
          r.status = "FAIL";
        })
      )
    ).toEqual([]);
  });
  it("N3 a PASS without a node verdict is refused", () => {
    expect(errors(record((r) => { r.results[0].nodeVerdict = null; }))).toContain("ARTIFACT_SCHEMA_INVALID@results.0.verdictLevel");
    expect(errors(record((r) => { r.results[0].verdictLevel = null; }))).toContain("ARTIFACT_SCHEMA_INVALID@results.0.verdictLevel");
  });
  it("N4 a NOT_REPRODUCIBLE case with a level or without its reason is refused", () => {
    expect(errors(record((r) => { r.results[2].verdictLevel = "CONSENSUS_SIMNET"; }))).toContain("ARTIFACT_SCHEMA_INVALID@results.2.notReproducible");
    expect(errors(record((r) => { delete r.results[2].notReproducible; }))).toContain("ARTIFACT_SCHEMA_INVALID@results.2.notReproducible");
  });
  it("N5 a node verdict without the txid it is about is refused", () => {
    expect(errors(record((r) => { delete r.results[1].txId; }))).toContain("ARTIFACT_SCHEMA_INVALID@results.1.txId");
  });
  it("N6 a summary that does not count the results, or a status that does not follow from them, is refused", () => {
    expect(errors(record((r) => { r.summary.passed = 3; }))).toContain("ARTIFACT_SCHEMA_INVALID@summary");
    expect(errors(record((r) => { r.status = "PASS"; }))).toContain("ARTIFACT_SCHEMA_INVALID@status");
    expect(errors(record((r) => { r.summary.casesAtLevel = 3; }))).toContain("ARTIFACT_SCHEMA_INVALID@summary.casesAtLevel");
  });
  it("N7 CONSENSUS_SIMNET is the level of a simnet node only; another node's level is CONSENSUS_NODE", () => {
    expect(errors(record((r) => { r.networkId = "devnet"; }))).toContain("ARTIFACT_SCHEMA_INVALID@summary.level");
    expect(errors(record((r) => { r.results[0].verdictLevel = "CONSENSUS_NODE"; }))).toContain("ARTIFACT_SCHEMA_INVALID@results.0.verdictLevel");
    expect(
      errors(
        record((r) => {
          r.networkId = "devnet";
          r.summary.level = "CONSENSUS_NODE";
          r.results[0].verdictLevel = "CONSENSUS_NODE";
          r.results[1].verdictLevel = "CONSENSUS_NODE";
        })
      )
    ).toEqual([]);
  });
  it("N8 the mode is a node's (localnet or rpc), never the runner's vm", () => {
    expect(errors(record((r) => { r.mode = "vm"; }))).toContain("ARTIFACT_SCHEMA_INVALID@mode");
  });
});
