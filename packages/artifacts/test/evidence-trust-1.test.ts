import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectArtifactStore } from "../src/store.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";
import { verifyArtifactSemantics } from "../src/verify.js";
import { explainArtifact } from "../src/explain.js";

// EVIDENCE-TRUST-1 (investigation, 2026-10-05) · BEFORE, artifacts level.
// 1. Immutability: the store writes an artifact as an atomic REPLACE of `<subdir>/<prefix>-<identity>.json`. A second
//    write of the same identity (same contentHash, a different unauthenticated field such as createdAt) rewrites the
//    stored bytes, and a stored copy that no longer verifies is overwritten — the tamper evidence disappears.
// 2. Lineage truth: strict semantics without a workspace cannot resolve a parent, yet the issue says the parent was
//    "not found in workspace" — no workspace was looked at. `explainArtifact` always verifies that way.

const sealed = (body: Record<string, unknown>) => {
  const a: any = structuredClone(body);
  delete a.contentHash;
  a.lineage = { ...(a.lineage ?? {}), artifactId: "" };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  a.lineage.artifactId = a.contentHash;
  return a;
};

const PARENT = "b".repeat(64);
const signedBody = (amountSompi = "100000000") => ({
  schema: "hardkas.signedTx",
  schemaVersion: "hardkas.artifact.v1",
  version: "1.0.0-alpha",
  hashVersion: CURRENT_HASH_VERSION,
  createdAt: "2026-10-05T10:00:00.000Z",
  status: "signed",
  networkId: "simulated",
  mode: "simulator",
  from: { address: "kaspa:sim_alice" },
  to: { address: "kaspa:sim_bob" },
  amountSompi,
  txId: `synthetic-${"a".repeat(64)}`,
  lineage: { artifactId: "", lineageId: PARENT, parentArtifactId: PARENT, rootArtifactId: PARENT, sequence: 2 }
});

describe("EVIDENCE-TRUST-1 · a stored artifact is never rewritten", () => {
  let ws: string;
  let store: ProjectArtifactStore;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-store-"));
    store = new ProjectArtifactStore(ws);
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("control: the first write stores the artifact's bytes under its identity", async () => {
    const a = sealed(signedBody());
    const at = await store.writeArtifact(a);
    expect(path.basename(at)).toContain(a.contentHash);
    expect(JSON.parse(fs.readFileSync(at, "utf8")).contentHash).toBe(a.contentHash);
  });

  it("control: another identity is another file, and the first stays as it was", async () => {
    const first = sealed(signedBody("100000000"));
    const other = sealed(signedBody("200000000"));
    const atFirst = await store.writeArtifact(first);
    const bytes = fs.readFileSync(atFirst, "utf8");
    const atOther = await store.writeArtifact(other);
    expect(atOther).not.toBe(atFirst);
    expect(fs.readFileSync(atFirst, "utf8")).toBe(bytes);
  });

  it("writing the same identity again (only createdAt differs) leaves the stored bytes as they were", async () => {
    const first = sealed(signedBody());
    const again = { ...structuredClone(first), createdAt: "2026-10-05T11:00:00.000Z" };
    expect(calculateContentHash(again, CURRENT_HASH_VERSION), "precondition: createdAt is outside the identity").toBe(first.contentHash);
    const at = await store.writeArtifact(first);
    const bytes = fs.readFileSync(at, "utf8");
    // Whether the second write returns or refuses is a decision; the stored evidence must not change either way.
    await store.writeArtifact(again).catch(() => undefined);
    expect(fs.readFileSync(at, "utf8")).toBe(bytes);
  });

  it("a stored copy that no longer verifies is never overwritten (the tamper evidence stays)", async () => {
    const a = sealed(signedBody());
    const at = await store.writeArtifact(a);
    const tampered = JSON.parse(fs.readFileSync(at, "utf8"));
    tampered.amountSompi = "999999999"; // contentHash unchanged: the copy no longer verifies
    const tamperedBytes = JSON.stringify(tampered, null, 2) + "\n";
    fs.writeFileSync(at, tamperedBytes);
    await store.writeArtifact(a).catch(() => undefined);
    expect(fs.readFileSync(at, "utf8")).toBe(tamperedBytes);
  });

  it("a non-artifact file at the identity's path is never overwritten", async () => {
    const a = sealed(signedBody());
    const at = await store.writeArtifact(a);
    fs.writeFileSync(at, "not json\n");
    await store.writeArtifact(a).catch(() => undefined);
    expect(fs.readFileSync(at, "utf8")).toBe("not json\n");
  });
});

describe("EVIDENCE-TRUST-1 · a parent that was not looked up is never reported as missing from the workspace", () => {
  const child = sealed(signedBody());

  it("control: strict semantics without a workspace raise an issue about the parent", () => {
    const r = verifyArtifactSemantics(structuredClone(child), { strict: true });
    expect(r.issues.some((i) => i.code.startsWith("PARENT_") || i.code.startsWith("REFERENCE_"))).toBe(true);
  });

  it("strict semantics without a workspace do not claim the parent is missing from the workspace", () => {
    const r = verifyArtifactSemantics(structuredClone(child), { strict: true });
    const claims = r.issues.filter((i) => /not found in workspace/i.test(i.message)).map((i) => `${i.code} (${i.severity}): ${i.message}`);
    expect(claims, claims.join(" | ")).toEqual([]);
  });

  it("explainArtifact does not claim the parent is missing from the workspace without looking there", async () => {
    const e = await explainArtifact(structuredClone(child));
    const claims = e.security.issues.filter((i) => /not found in workspace/i.test(i.message)).map((i) => `${i.code} (${i.severity}): ${i.message}`);
    expect(claims, `${claims.join(" | ")} · status ${e.summary.status}`).toEqual([]);
  });
});
