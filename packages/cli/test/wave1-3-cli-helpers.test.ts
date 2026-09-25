import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { calculateContentHash, CURRENT_HASH_VERSION, checkArtifactIdentity, verifyArtifactIntegritySync } from "@hardkas/artifacts";
import { nextStepsAfterSend, receiptArtifactId, sendExplanation, sendOutcome } from "../src/runners/next-steps.js";
import { describeWhyNode } from "../src/runners/why-narrative.js";
import { sealSilverRecord, silverRecordLabel } from "../src/runners/silver-records.js";
import { runArtifactCreate } from "../src/runners/artifact-create-runner.js";
import { cliSemantics } from "../../../apps/docs/docs-data/cli-semantics.js";

// Wave 1.3 · CLI producers and decision helpers under IC-1′…IC-7
//   R-iii   the CLI decides on the outcome of a send from the submission's
//           authenticated submit result, or from a FULL-scope receipt's status;
//           a legacy (v≤4) status is never a decision input (IC-2′.8 / IC-4′.4);
//   IC-7.3  Silver records and `artifact create` output write no top-level
//           artifactId; the Silver display label is derived from the hash;
//   N1      Silver record references are nested → authenticated under v5 (T-N1b);
//   AUX-01/AUX-08/D-Q20 the documented contract of `hardkas verify`.

const seal = (body: Record<string, unknown>, hashVersion = CURRENT_HASH_VERSION) => {
  const a: any = { ...body, hashVersion };
  a.contentHash = calculateContentHash(a, hashVersion);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  return a;
};

const submission = (extra: Record<string, unknown> = {}) =>
  seal({
    schema: "hardkas.txSubmission.v1",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    networkId: "simnet",
    mode: "localnet",
    createdAt: "2026-09-25T00:00:00.000Z",
    signedArtifactId: "a".repeat(64),
    txId: "b".repeat(64),
    submitResult: { accepted: true, transactionId: "b".repeat(64) },
    rpcUrl: "http://127.0.0.1:16110",
    lineage: { artifactId: "", parentArtifactId: "a".repeat(64), lineageId: "9".repeat(64), rootArtifactId: "9".repeat(64), sequence: 3 },
    ...extra
  });

const receipt = (status: string, hashVersion = CURRENT_HASH_VERSION) =>
  seal(
    {
      schema: "hardkas.txReceipt",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-25T00:00:00.000Z",
      txId: "simulated-" + "1".repeat(32),
      status,
      from: { address: "kaspasim:qqalice" },
      to: { address: "kaspasim:qqbob" },
      amountSompi: "1",
      feeSompi: "1",
      execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
      lineage: { artifactId: "", parentArtifactId: "a".repeat(64), lineageId: "9".repeat(64), rootArtifactId: "9".repeat(64), sequence: 3 }
    },
    hashVersion
  );

describe("Wave 1.3 · send outcome decisions", () => {
  it("a submission's outcome comes from its authenticated submit result", () => {
    expect(sendOutcome(submission())).toEqual({ kind: "submission", accepted: true, decided: true, authScope: "FULL" });
    expect(sendOutcome(submission({ submitResult: { accepted: false, error: "orphan" } }))).toEqual({ kind: "submission", accepted: false, decided: true, authScope: "FULL" });
  });

  it("a FULL-scope receipt's status is a decision input; a legacy status is not (IC-2′.8)", () => {
    expect(sendOutcome(receipt("accepted"))).toEqual({ kind: "receipt", accepted: true, decided: true, authScope: "FULL", status: "accepted" });
    expect(sendOutcome(receipt("failed"))).toEqual({ kind: "receipt", accepted: false, decided: true, authScope: "FULL", status: "failed" });
    const legacy = receipt("accepted", 4);
    expect(sendOutcome(legacy)).toEqual({ kind: "receipt", accepted: false, decided: false, authScope: "LEGACY", status: "accepted" });
    // A tampered artifact decides nothing.
    expect(sendOutcome({ ...receipt("accepted"), status: "confirmed" })).toMatchObject({ decided: false, accepted: false, authScope: "NONE" });
  });

  it("next steps and the explanation work for a submission exactly as for a receipt", () => {
    const s = submission();
    expect(receiptArtifactId(s)).toBe(s.contentHash);
    expect(nextStepsAfterSend({ receipt: s, txId: s.txId })).toEqual([`hardkas explain ${s.contentHash}`, `hardkas why ${s.contentHash}`]);
    expect(sendExplanation({ receipt: s, txId: s.txId })).toEqual({ available: true, artifactId: s.contentHash, txId: s.txId });
  });

  it("`why` narrates a submission from its real fields: submitted, node answer, no observation", () => {
    const text = describeWhyNode(submission())!;
    expect(text).toMatch(/submitted/i);
    expect(text).toContain("b".repeat(64));
    expect(text).toMatch(/no observation|not observed/i);
    const rejected = describeWhyNode(submission({ submitResult: { accepted: false, error: "orphan" } }))!;
    expect(rejected).toMatch(/rejected|not accepted/i);
    expect(rejected).toContain("orphan");
  });
});

describe("Wave 1.3 · Silver records (IC-7.3, N1)", () => {
  it("a sealed record is a v5 artifact with no top-level artifactId; its label is derived, not stored", () => {
    const record = sealSilverRecord({ schema: "hardkas.silverCompile.v1", networkId: "simnet", provenance: { artifactSha256: "ab".repeat(32) }, artifactJson: "{}" }, "silvercompile");
    expect(record.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(record.artifactId).toBeUndefined();
    expect(record.mode).toBe("localnet");
    expect(calculateContentHash(record, CURRENT_HASH_VERSION)).toBe(record.contentHash);
    expect(checkArtifactIdentity(record).ok).toBe(true);
    expect(silverRecordLabel("silvercompile", record.contentHash)).toBe(`silvercompile-${record.contentHash.slice(0, 16)}`);
    expect(silverRecordLabel("silvercompile", record)).toBe(`silvercompile-${record.contentHash.slice(0, 16)}`);
  });

  it("T-N1b · a nested record reference is authenticated: changing compileRecord.contentHash changes the deploy identity", () => {
    const compileRef = { path: ".hardkas/artifacts/silver/x.json", contentHash: "1".repeat(64), artifactSha256: "2".repeat(64) };
    const deploy = sealSilverRecord({ schema: "hardkas.silverDeploy.v1", networkId: "simnet", compileRecord: compileRef, txId: "3".repeat(64) }, "silverdeploy");
    const repointed = { ...deploy, compileRecord: { ...compileRef, contentHash: "4".repeat(64) } };
    expect(calculateContentHash(repointed, CURRENT_HASH_VERSION)).not.toBe(deploy.contentHash);
    expect(checkArtifactIdentity(repointed).ok).toBe(false);
    const digestSwapped = { ...deploy, compileRecord: { ...compileRef, artifactSha256: "5".repeat(64) } };
    expect(checkArtifactIdentity(digestSwapped).ok).toBe(false);
  });
});

describe("Wave 1.3 · artifact create writes no identity copy (IC-7.3)", () => {
  let ws: string;
  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w13-create-"));
    fs.writeFileSync(path.join(ws, "payload.json"), JSON.stringify({ key: "value", b: 2, a: 1 }));
  });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("the created artifact has a deterministic contentHash as its only identity", async () => {
    await runArtifactCreate({ type: "test-type", input: "payload.json", out: "out1.json", json: true, workspaceRoot: ws });
    await runArtifactCreate({ type: "test-type", input: "payload.json", out: "out2.json", json: true, workspaceRoot: ws });
    const a = JSON.parse(fs.readFileSync(path.join(ws, "out1.json"), "utf8"));
    const b = JSON.parse(fs.readFileSync(path.join(ws, "out2.json"), "utf8"));
    expect(a.artifactId).toBeUndefined();
    expect(a.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(a.contentHash).toBe(b.contentHash);
    expect(calculateContentHash(a, CURRENT_HASH_VERSION)).toBe(a.contentHash);
  });
});

describe("Wave 1.3 · `hardkas verify` documented contract (AUX-01 / AUX-08 / D-Q20)", () => {
  it("the generated-reference data names the accepted target and no `--deep` flag", () => {
    const entry: any = cliSemantics["hardkas verify"];
    expect(entry).toBeDefined();
    expect(entry.acceptedIdentifiers).toEqual(["(none) → every artifact under .hardkas/artifacts/", "explicit workspace-contained filepath", "explicit workspace-contained directory"]);
    expect(JSON.stringify(entry)).not.toMatch(/--deep/);
    expect(entry.limitations?.some((l: string) => /strict/.test(l) && /MIGRATION_REQUIRED/.test(l))).toBe(true);
  });
});

describe("Wave 1.3 · sanity of the fixtures used above", () => {
  it("submission and receipt fixtures verify as intended", () => {
    expect(verifyArtifactIntegritySync(submission(), { strict: true }).ok).toBe(true);
    expect(verifyArtifactIntegritySync(receipt("accepted"), { strict: true }).ok).toBe(true);
    expect(verifyArtifactIntegritySync(receipt("accepted", 4), { strict: false }).authScope).toBe("LEGACY");
  });
});
