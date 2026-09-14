import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifySilverCorpus } from "../src/index.js";

const CORPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/toccata-v2/silver");
const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A private copy of the golden corpus, optionally limited to some cases. */
function copyCorpus(ids?: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-silver-corpus-"));
  scratch.push(dir);
  fs.cpSync(CORPUS, dir, { recursive: true });
  if (ids) {
    const manifest = readJson(dir, "manifest.json");
    manifest.cases = manifest.cases.filter((c: any) => ids.includes(c.id));
    writeJson(dir, "manifest.json", manifest);
  }
  return dir;
}
const readJson = (dir: string, file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
const writeJson = (dir: string, file: string, value: unknown) => fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + "\n");
const edit = (dir: string, file: string, fn: (value: any) => void) => {
  const value = readJson(dir, file);
  fn(value);
  writeJson(dir, file, value);
};
const codes = (r: { issues: readonly { code: string }[] }) => r.issues.map((i) => i.code);

describe("verifySilverCorpus (golden corpus from real execution)", () => {
  it("verifies the shipped corpus: recompiled by the pinned silverc, derived by the SDK, evidenced by the reference node", async () => {
    const r = await verifySilverCorpus(CORPUS);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.schema).toBe("hardkas.silverCorpusVerify.v1");
    expect(r.summary.cases).toBe(4);
    expect(r.summary.compilesRecompiled).toBe(5);
    expect(r.capabilities).toEqual({
      "silver.compile.v1": "PASS",
      "silver.p2sh.deploy-spend.v1": "PASS",
      "silver.p2sh.relative-timelock.v1": "PASS",
      "toccata.covenant.auth-1to1-transition.v1": "PASS"
    });
  });

  it("refuses a source that is not the one compiled", async () => {
    const dir = copyCorpus(["p2sh-signed-release"]);
    fs.appendFileSync(path.join(dir, "p2sh-signed-release/contract.sil"), "\n"); // hardkas-append-allow: tampering a scratch copy
    const r = await verifySilverCorpus(dir);
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("SOURCE_DIGEST_MISMATCH");
    expect(r.capabilities["silver.compile.v1"]).toBe("FAIL");
  });

  it("refuses a hand-edited artifact even when its digest is re-pinned", async () => {
    const dir = copyCorpus(["p2sh-signed-release"]);
    const file = path.join(dir, "p2sh-signed-release/contract.artifact.json");
    const reformatted = JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8")), null, 4);
    fs.writeFileSync(file, reformatted);
    const { createHash } = await import("node:crypto");
    edit(dir, "p2sh-signed-release/case.json", (c) => {
      c.compiles[0].provenance.artifactSha256 = createHash("sha256").update(reformatted).digest("hex");
    });
    const r = await verifySilverCorpus(dir);
    expect(codes(r)).toEqual(["RECOMPILE_MISMATCH"]);
  });

  it("refuses provenance from a compiler that is not the pinned release", async () => {
    const dir = copyCorpus(["p2sh-signed-release"]);
    edit(dir, "p2sh-signed-release/case.json", (c) => {
      c.compiles[0].provenance.compiler.binarySha256 = "00".repeat(32);
    });
    expect(codes(await verifySilverCorpus(dir))).toContain("COMPILER_NOT_PINNED");
  });

  it("recomputes the covenant id instead of trusting the recorded one", async () => {
    const dir = copyCorpus(["covenant-counter-transition"]);
    edit(dir, "covenant-counter-transition/case.json", (c) => {
      c.covenant.genesisOutpoint.index += 1;
    });
    const r = await verifySilverCorpus(dir);
    expect(codes(r)).toContain("COVENANT_ID_DERIVATION_MISMATCH");
    expect(r.capabilities["toccata.covenant.auth-1to1-transition.v1"]).toBe("FAIL");
  });

  it("refuses evidence whose controls were not refused as classified", async () => {
    const dir = copyCorpus(["covenant-counter-transition"]);
    edit(dir, "covenant-counter-transition/evidence.json", (e) => {
      e.controls.bindingInV0.accepted = true;
      e.controls.successorWithoutBinding.rejectionClass = "unclassified";
    });
    const r = await verifySilverCorpus(dir);
    expect(codes(r)).toEqual(expect.arrayContaining(["CONTROL_NOT_REJECTED", "CONTROL_CLASS_MISMATCH"]));
  });

  it("refuses evidence from a node that is not the verified reference image", async () => {
    const dir = copyCorpus(["p2sh-escrow-refund"]);
    edit(dir, "p2sh-escrow-refund/evidence.json", (e) => {
      e.node.observed.container.imageId = "sha256:" + "11".repeat(32);
    });
    expect(codes(await verifySilverCorpus(dir))).toContain("EVIDENCE_NODE_NOT_REFERENCE");
  });

  it("refuses evidence that carries key material or a signature in clear", async () => {
    const dir = copyCorpus(["p2sh-escrow-refund"]);
    edit(dir, "p2sh-escrow-refund/evidence.json", (e) => {
      e.resolution.buyerPrivateKey = "22".repeat(32);
      e.resolution.signature = "41" + "ab".repeat(64) + "01";
    });
    expect(codes(await verifySilverCorpus(dir))).toEqual(expect.arrayContaining(["EVIDENCE_HAS_PRIVATE_FIELD", "EVIDENCE_HAS_SIGNATURE"]));
  });

  it("refuses a capability the case does not prove", async () => {
    const dir = copyCorpus(["p2sh-signed-release"]);
    const extra = ["toccata.covenant.auth-1to1-transition.v1", "silver.p2sh.relative-timelock.v1"];
    edit(dir, "manifest.json", (m) => m.cases[0].capabilities.push(...extra));
    edit(dir, "p2sh-signed-release/case.json", (c) => c.capabilities.push(...extra));
    edit(dir, "p2sh-signed-release/evidence.json", (e) => e.capabilities.push(...extra));
    const r = await verifySilverCorpus(dir);
    expect(r.issues.filter((i) => i.code === "CAPABILITY_NOT_EVIDENCED").map((i) => i.message.split(":")[0]).sort()).toEqual([...extra].sort());
    expect(r.capabilities["toccata.covenant.auth-1to1-transition.v1"]).toBe("FAIL");
  });

  it("refuses a manifest that claims more than its case", async () => {
    const dir = copyCorpus(["p2sh-escrow-refund"]);
    edit(dir, "manifest.json", (m) => m.cases[0].capabilities.push("silver.p2sh.relative-timelock.v1"));
    expect(codes(await verifySilverCorpus(dir))).toContain("CASE_CAPABILITIES_MISMATCH");
  });

  it("refuses a relative lock whose refusal did not happen before the threshold", async () => {
    const dir = copyCorpus(["p2sh-transfer-with-timeout"]);
    edit(dir, "p2sh-transfer-with-timeout/evidence.json", (e) => {
      e.reclaimBranch.beforeThreshold.virtualDaaScore = e.reclaimBranch.validFromVirtualDaaScore;
    });
    const r = await verifySilverCorpus(dir);
    expect(codes(r)).toEqual(["CAPABILITY_NOT_EVIDENCED"]);
    expect(r.capabilities["silver.p2sh.relative-timelock.v1"]).toBe("FAIL");
  });

  it("refuses case paths outside the corpus", async () => {
    const dir = copyCorpus(["p2sh-signed-release"]);
    edit(dir, "manifest.json", (m) => (m.cases[0].path = "../outside"));
    expect(codes(await verifySilverCorpus(dir))).toContain("CORPUS_PATH_ESCAPES");
  });

  it("cannot pass without the managed silverc", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-silver-empty-home-"));
    scratch.push(home);
    const r = await verifySilverCorpus(copyCorpus(["p2sh-signed-release"]), { home });
    expect(r.ok).toBe(false);
    expect(r.summary.compilesRecompiled).toBe(0);
    expect(codes(r)).toContain("SILVERC_TOOLCHAIN_NOT_INSTALLED");
  });
});
