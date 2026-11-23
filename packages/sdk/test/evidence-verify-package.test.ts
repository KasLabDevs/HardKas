import { describe, it, expect } from "vitest";
import { createScenarioResultArtifact, calculateContentHash, CURRENT_HASH_VERSION, ARTIFACT_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";
import { EvidenceManager, evidenceScopeStatement } from "../src/evidence.js";

// COVERAGE 1.0 · EvidenceManager.verifyPackage on its refusal paths. Each verdict is a status the CLI prints and a reader
// relies on; the package is built in memory from a really sealed scenario result (createScenarioResultArtifact) and
// artifacts sealed with calculateContentHash, so nothing here depends on a node or a workspace.

const HASH = (c: string) => c.repeat(64);

function seal<T extends Record<string, unknown>>(body: T): T & { contentHash: string } {
  const withMeta = { hardkasVersion: HARDKAS_VERSION, version: ARTIFACT_VERSION, hashVersion: CURRENT_HASH_VERSION, ...body };
  return { ...withMeta, contentHash: calculateContentHash(withMeta, CURRENT_HASH_VERSION) } as any;
}

/** A small sealed artifact the package can carry (its schema is irrelevant to membership and claims). */
const artifact = (n: string) => seal({ schema: "hardkas.txPlan", networkId: "simnet", note: n });

function pack(over: { artifacts?: any[]; scenario?: any; named?: string[]; claim?: any; pkg?: any } = {}) {
  const artifacts = over.artifacts ?? [];
  const named = over.named ?? artifacts.map((a) => a.contentHash);
  const scenarioResult =
    over.scenario ??
    createScenarioResultArtifact({
      networkId: "simnet",
      mode: "simulator",
      scenarioName: "unit",
      status: "passed",
      artifactsGenerated: named,
      ...(over.claim ? { evidenceClaim: over.claim } : {})
    } as any);
  return {
    version: "1.0.0-alpha",
    schema: "hardkas.evidencePackage.v1",
    name: "unit",
    hardkasVersion: HARDKAS_VERSION,
    networkId: "simnet",
    mode: "simulator",
    createdAt: new Date().toISOString(),
    scenarioResult,
    artifacts,
    hashes: Object.fromEntries(artifacts.map((a) => [a.contentHash, a.contentHash])),
    claims: { mainnet: false, testnet: false, production: false, bridgeReady: false, onchainZk: false },
    artifactDiscovery: { source: "scenarioResult" },
    ...(over.pkg ?? {})
  } as any;
}

describe("EvidenceManager.verifyPackage · what it refuses, and the scope it states", () => {
  it("EV-1 another schema is EVIDENCE_INVALID_SCHEMA", async () => {
    const r = await EvidenceManager.verifyPackage(pack({ pkg: { schema: "hardkas.other.v1" } }));
    expect(r).toMatchObject({ ok: false, status: "EVIDENCE_INVALID_SCHEMA" });
  });

  it("EV-2 every forbidden claim (mainnet, testnet, production, bridge, on-chain ZK) is EVIDENCE_POLICY_VIOLATION", async () => {
    for (const key of ["mainnet", "testnet", "production", "bridgeReady", "onchainZk"]) {
      const claims = { mainnet: false, testnet: false, production: false, bridgeReady: false, onchainZk: false, [key]: true };
      const r = await EvidenceManager.verifyPackage(pack({ pkg: { claims } }));
      expect(r, key).toMatchObject({ ok: false, status: "EVIDENCE_POLICY_VIOLATION" });
    }
  });

  it("EV-3 a package with no scenario result, or an edited one, is EVIDENCE_SCENARIO_RESULT_INVALID", async () => {
    const none = await EvidenceManager.verifyPackage(pack({ pkg: { scenarioResult: undefined } }));
    expect(none).toMatchObject({ ok: false, status: "EVIDENCE_SCENARIO_RESULT_INVALID" });
    expect(none.details).toMatch(/missing/);

    const sealed = createScenarioResultArtifact({ networkId: "simnet", mode: "simulator", scenarioName: "unit", status: "failed", artifactsGenerated: [] } as any);
    const edited = { ...sealed, status: "passed" }; // the verdict changed after sealing
    const r = await EvidenceManager.verifyPackage(pack({ scenario: edited }));
    expect(r).toMatchObject({ ok: false, status: "EVIDENCE_SCENARIO_RESULT_INVALID" });
  });

  it("EV-4 a package that disagrees with its sealed scenario result on name, network or mode is EVIDENCE_PACKAGE_INCONSISTENT", async () => {
    const r = await EvidenceManager.verifyPackage(pack({ pkg: { name: "other", networkId: "devnet", mode: "localnet" } }));
    expect(r).toMatchObject({ ok: false, status: "EVIDENCE_PACKAGE_INCONSISTENT" });
    expect(r.details).toMatch(/name, networkId, mode/);
  });

  it("EV-5 an artifact whose body no longer hashes to its identity is EVIDENCE_ARTIFACT_HASH_MISMATCH", async () => {
    const a = artifact("a");
    const tampered = { ...a, note: "changed" };
    const r = await EvidenceManager.verifyPackage(pack({ artifacts: [tampered], named: [a.contentHash] }));
    expect(r).toMatchObject({ ok: false, status: "EVIDENCE_ARTIFACT_HASH_MISMATCH" });
  });

  it("EV-6 membership: carried but not named, named but not carried, carried twice and a wrong hash list are EVIDENCE_MEMBERSHIP_MISMATCH", async () => {
    const a = artifact("a");
    const b = artifact("b");
    const extra = await EvidenceManager.verifyPackage(pack({ artifacts: [a, b], named: [a.contentHash] }));
    expect(extra).toMatchObject({ ok: false, status: "EVIDENCE_MEMBERSHIP_MISMATCH" });
    expect(extra.details).toMatch(/carried but not named/);

    const absent = await EvidenceManager.verifyPackage(pack({ artifacts: [a], named: [a.contentHash, b.contentHash] }));
    expect(absent.details).toMatch(/named but not carried/);

    const twice = await EvidenceManager.verifyPackage(pack({ artifacts: [a, a], named: [a.contentHash] }));
    expect(twice.status).toBe("EVIDENCE_MEMBERSHIP_MISMATCH");

    const badList = await EvidenceManager.verifyPackage(pack({ artifacts: [a], named: [a.contentHash], pkg: { hashes: { x: HASH("1") } } }));
    expect(badList.details).toMatch(/hash list does not match/);
  });

  it("EV-7 claims: `none` with artifacts, `artifacts` with none, and an undeclared empty package are EVIDENCE_CLAIM_INCONSISTENT / EVIDENCE_EMPTY_UNDECLARED", async () => {
    const a = artifact("a");
    const noneWithArtifacts = await EvidenceManager.verifyPackage(pack({ artifacts: [a], claim: { kind: "none" } }));
    expect(noneWithArtifacts).toMatchObject({ ok: false, status: "EVIDENCE_CLAIM_INCONSISTENT" });

    const claimsNone = await EvidenceManager.verifyPackage(pack({ artifacts: [], claim: { kind: "artifacts" } }));
    expect(claimsNone).toMatchObject({ ok: false, status: "EVIDENCE_CLAIM_INCONSISTENT" });
    expect(claimsNone.details).toMatch(/claims artifacts but the package carries none/);

    // a result sealed with no claim at all (before claims existed) and no artifact says nothing it could be presented as
    const unsealedClaim = createScenarioResultArtifact({ networkId: "simnet", mode: "simulator", scenarioName: "unit", status: "passed", artifactsGenerated: [] } as any) as any;
    delete unsealedClaim.evidenceClaim;
    unsealedClaim.contentHash = calculateContentHash(
      Object.fromEntries(Object.entries(unsealedClaim).filter(([k]) => k !== "contentHash")),
      CURRENT_HASH_VERSION
    );
    const undeclared = await EvidenceManager.verifyPackage(pack({ scenario: unsealedClaim }));
    expect(undeclared).toMatchObject({ ok: false, status: "EVIDENCE_EMPTY_UNDECLARED" });
    expect(undeclared.scope?.claim).toBe("unspecified");
  });

  it("EV-8 a payment claim that names no payment, or whose submission is not carried, is EVIDENCE_PAYMENT_INCOMPLETE and says why", async () => {
    const a = artifact("a");
    // a payment claim that names no payment does not even seal: the scenario result's own schema refuses it
    const noPayment = await EvidenceManager.verifyPackage(pack({ artifacts: [a], claim: { kind: "payment", payments: [] } }));
    expect(noPayment).toMatchObject({ ok: false, status: "EVIDENCE_SCENARIO_RESULT_INVALID" });

    const missingSubmission = await EvidenceManager.verifyPackage(
      pack({ artifacts: [a], claim: { kind: "payment", payments: [{ txId: HASH("2"), submissionArtifactId: HASH("3") }] } })
    );
    expect(missingSubmission.status).toBe("EVIDENCE_PAYMENT_INCOMPLETE");
    expect(missingSubmission.details).toMatch(/is not carried/);
    expect(missingSubmission.scope?.payments[0]).toMatchObject({ lineageClosed: false, submitAccepted: null });
  });

  it("EV-9 an intact `artifacts` claim verifies, with its scope: count, verdict, closed lineage and the statement of what it does not prove", async () => {
    const a = artifact("a");
    const b = artifact("b");
    const r = await EvidenceManager.verifyPackage(pack({ artifacts: [a, b], claim: { kind: "artifacts" } }));
    expect(r.ok).toBe(true);
    expect(r.status).toBe("EVIDENCE_VERIFIED");
    expect(r.scope).toMatchObject({ artifacts: 2, claim: "artifacts", verdict: "passed", lineage: "closed", unresolved: [], payments: [] });
    expect(r.scope?.statement).toBe(evidenceScopeStatement("artifacts"));
    expect(r.scope?.statement).toMatch(/Not a proof of inclusion on chain/);
  });

  it("EV-10 an artifact pointing at a parent the package does not carry reports the lineage as open", async () => {
    const child = seal({ schema: "hardkas.signedTx", networkId: "simnet", lineage: { parentArtifactId: HASH("9") } });
    const r = await EvidenceManager.verifyPackage(pack({ artifacts: [child], claim: { kind: "artifacts" } }));
    expect(r.ok).toBe(true);
    expect(r.scope?.lineage).toBe("open");
    expect(r.scope?.unresolved).toEqual([{ from: child.contentHash, field: "lineage.parentArtifactId", missing: HASH("9") }]);
  });

  it("EV-11 the statement names the payment lineage only for a payment claim", () => {
    expect(evidenceScopeStatement("payment")).toMatch(/lineage \(plan, signed, submission\) closes inside it/);
    expect(evidenceScopeStatement("none")).not.toMatch(/lineage/);
  });
});

describe("EvidenceManager · files", () => {
  it("EV-12 verify and explain refuse a package that does not exist", async () => {
    await expect(EvidenceManager.verify("does-not-exist.hke.json")).rejects.toThrow(/not found/);
    await expect(EvidenceManager.explain("does-not-exist.hke.json")).rejects.toThrow(/not found/);
  });

  it("EV-13 pack refuses a scenario result that does not exist", async () => {
    await expect(EvidenceManager.pack({ scenarioResultPath: "nope.json", workspaceRoot: "." })).rejects.toThrow(/Scenario result not found/);
  });
});
