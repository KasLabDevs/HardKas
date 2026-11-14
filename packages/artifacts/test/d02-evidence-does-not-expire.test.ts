import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION,
  HARDKAS_VERSION,
  calculateContentHash,
  verifyArtifactIntegritySync,
  verifyArtifactSemantics,
  checkExecutionFreshness,
  STALE_ARTIFACT_MAX_AGE_HOURS,
  type Clock
} from "../src/index.js";

// D-02 · evidence does not expire. An intact artifact keeps verifying however old it is: age is a warning that names
// the age, never an integrity failure. Tamper detection is exactly as strict at any age. Freshness is a rule of the
// executors (signing and sending a plan or signed transaction), checked by checkExecutionFreshness at their call sites;
// receipts, submissions and observations are records of the past and are never refused for their age.

const CREATED = "2026-09-01T00:00:00.000Z";
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number): Clock => ({ now: () => Date.parse(CREATED) + days * DAY + 60_000 });
const ADDRESS = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";

function seal(draft: Record<string, unknown>): any {
  const d: Record<string, unknown> = JSON.parse(JSON.stringify(draft));
  delete d.contentHash;
  return { ...d, contentHash: calculateContentHash(d, CURRENT_HASH_VERSION) };
}

function receipt(): any {
  return seal({
    schema: "hardkas.txReceipt",
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simulated",
    mode: "simulator",
    createdAt: CREATED,
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simulated" },
    txId: `synthetic-${"ab".repeat(32)}`,
    status: "confirmed",
    from: { address: ADDRESS },
    to: { address: ADDRESS },
    amountSompi: "100000000",
    feeSompi: "2036"
  });
}

let previous: string | undefined;
beforeAll(() => {
  // the rule under test must run: the tests-only escape is lifted for this file
  previous = process.env.HARDKAS_TEST_IGNORE_STALENESS;
  delete process.env.HARDKAS_TEST_IGNORE_STALENESS;
});
afterAll(() => {
  if (previous === undefined) delete process.env.HARDKAS_TEST_IGNORE_STALENESS;
  else process.env.HARDKAS_TEST_IGNORE_STALENESS = previous;
});

describe("D-02 · evidence does not expire: age is a warning, never an integrity failure", () => {
  it("a 40-day-old intact receipt verifies OK (integrity and semantics), with a staleness warning that names its age", () => {
    const r = receipt();
    const integrity = verifyArtifactIntegritySync(structuredClone(r));
    expect(integrity.ok).toBe(true);
    expect(integrity.authScope).toBe("FULL");
    const semantics = verifyArtifactSemantics(structuredClone(r), { clock: at(40) });
    expect(semantics.ok).toBe(true);
    expect(semantics.errors).toEqual([]);
    const stale = semantics.issues.filter((i) => i.code === "STALE_ARTIFACT");
    expect(stale).toHaveLength(1);
    expect(stale[0]!.severity).toBe("warning");
    expect(stale[0]!.message).toMatch(/40 days old \(created 2026-09-01T00:00:00\.000Z\)/);
    expect(stale[0]!.message).toMatch(/record of the past/);
    // a record of the past is never refused for its age, by any executor
    expect(checkExecutionFreshness(r, "send", at(40)).ok).toBe(true);
  });

  it("the same receipt 400 days later still verifies (the warning is the only trace of its age)", () => {
    const semantics = verifyArtifactSemantics(receipt(), { clock: at(400) });
    expect(semantics.ok).toBe(true);
    expect(semantics.issues.find((i) => i.code === "STALE_ARTIFACT")?.message).toMatch(/400 days old/);
  });

  it("a 40-day-old TAMPERED receipt still fails integrity (ARTIFACT_HASH_MISMATCH): tamper detection is as strict at any age", () => {
    const tampered = { ...receipt(), amountSompi: "1" };
    const integrity = verifyArtifactIntegritySync(structuredClone(tampered));
    expect(integrity.ok).toBe(false);
    expect(integrity.issues.map((i) => i.code)).toContain("ARTIFACT_HASH_MISMATCH");
    // and the age adds nothing to it: still only a warning in the semantic pass
    const semantics = verifyArtifactSemantics(structuredClone(tampered), { clock: at(40) });
    expect(semantics.issues.find((i) => i.code === "STALE_ARTIFACT")?.severity).toBe("warning");
  });

  it("a plan older than 30 days: verification passes with a warning that says it is refused for signing and sending", () => {
    const plan = { schema: "hardkas.txPlan", createdAt: CREATED, networkId: "simnet", mode: "rpc" };
    const semantics = verifyArtifactSemantics(plan, { clock: at(31) });
    expect(semantics.ok).toBe(true);
    const stale = semantics.issues.find((i) => i.code === "STALE_ARTIFACT");
    expect(stale?.severity).toBe("warning");
    expect(stale?.message).toMatch(/31 days old/);
    expect(stale?.message).toMatch(/refused for signing and sending \(STALE_ARTIFACT_REFUSED\)/);
  });

  it("checkExecutionFreshness: a plan or signed transaction past the limit is refused (STALE_ARTIFACT_REFUSED); within it, or any record, is not", () => {
    expect(STALE_ARTIFACT_MAX_AGE_HOURS).toBe(24 * 30);
    for (const schema of ["hardkas.txPlan", "hardkas.signedTx"]) {
      const a = { schema, createdAt: CREATED };
      expect(checkExecutionFreshness(a, "sign", at(29)).ok, schema).toBe(true);
      const refused = checkExecutionFreshness(a, "send", at(31));
      expect(refused.ok, schema).toBe(false);
      if (!refused.ok) {
        expect(refused.code).toBe("STALE_ARTIFACT_REFUSED");
        expect(refused.age.ageDays).toBe(31);
        expect(refused.message).toMatch(/Refusing to send/);
        expect(refused.message).toMatch(/Plan the payment again/);
      }
    }
    for (const schema of ["hardkas.txReceipt", "hardkas.txSubmission.v1", "hardkas.txObservation.v1"]) {
      expect(checkExecutionFreshness({ schema, createdAt: CREATED }, "send", at(400)).ok, schema).toBe(true);
    }
    // no createdAt: nothing to judge
    expect(checkExecutionFreshness({ schema: "hardkas.txPlan" }, "sign", at(400)).ok).toBe(true);
  });
});
