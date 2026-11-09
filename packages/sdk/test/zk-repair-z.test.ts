// Agent Z repair wave (6-nov-2026): regression tests for HK-04, CA-ZK-01..07, CA-EV-10, HK-16..HK-20 and
// ZK-07..ZK-12. They reproduce EXP-02, EXP-03, CA-EXP-04 and CA-EXP-04b of the audit and its counter-audit.
// The trapdoor keys and forged proofs are built with ffjavascript (snarkjs' own curve library), not with
// the code under test.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  verifyGroth16Math,
  verifyZkProofMath,
  verifyZkProofLocal,
  verifyZkCorpus,
  inspectZkProof,
  assessVerificationKeyStrength,
  buildR0Groth16Scripts,
  buildR0Groth16Plan,
  buildR0Groth16Transaction,
  deriveZkOperationStatus,
  getToccataPrecompileRules,
  createZkCapabilities,
  groth16VerificationKeyFingerprint,
  findPinnedGroth16VerificationKey,
  computeR0ReceiptClaimDigest,
  parseR0Groth16Receipt,
  verifyR0Groth16ReceiptLocal,
  R0_GROTH16_VERIFICATION_KEY,
  R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX,
  R0_GROTH16_CONTROL_ROOT,
  R0_GROTH16_BN254_CONTROL_ID,
  minimumR0Groth16ComputeBudget
} from "../src/index.js";
import { legacyDomainDigest } from "@hardkas/artifacts";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import * as bn from "../src/zk/bn254.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

const ZK = path.join(repoRoot(), "fixtures", "toccata-v2", "zk");
const MULT = path.join(ZK, "groth16-multiplier");
const R0 = path.join(ZK, "r0-groth16-official");
const rj = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const TOY = { allowWeakVerificationKey: true };
const IMAGE = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const JOURNAL = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
const RECEIPT = fs.readFileSync(path.join(R0, "receipt.hex"), "utf8").trim();
const P2PK_SIMNET = "kaspasim:qprx6l72u437tjcf5rgcwza4sq6ysprp0pu6zj2feu3zshcm4cljwd5me0nwt";
const q = bn.BN254_Q;
const r = bn.BN254_R;

let curve: any;
let g1: (k: bigint | number) => string[];
let g2: (k: bigint | number) => string[][];

beforeAll(async () => {
  const reqSdk = createRequire(path.join(repoRoot(), "packages", "sdk", "package.json"));
  const reqSnark = createRequire(reqSdk.resolve("snarkjs"));
  const ff = await import(pathToFileURL(reqSnark.resolve("ffjavascript")).href);
  const buildBn128 = ff.buildBn128 ?? ff.default?.buildBn128;
  if (typeof buildBn128 !== "function") throw new Error("ffjavascript exposes no buildBn128");
  curve = await buildBn128();
  const s = (v: any): any => (typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(s) : String(v));
  const m = (k: bigint) => ((k % r) + r) % r;
  g1 = (k) => s(curve.G1.toObject(curve.G1.toAffine(curve.G1.timesScalar(curve.G1.g, m(BigInt(k))))));
  g2 = (k) => s(curve.G2.toObject(curve.G2.toAffine(curve.G2.timesScalar(curve.G2.g, m(BigInt(k))))));
}, 60000);

afterAll(async () => {
  if (curve) await curve.terminate();
});

function toyFiles() {
  return {
    vk: rj(path.join(MULT, "verification-key.json")),
    inputs: rj(path.join(MULT, "public-inputs.json")),
    proof: rj(path.join(MULT, "proof.json"))
  };
}

/** CA-EXP-04b: a key with a KNOWN non-trivial trapdoor, every point canonical affine. */
function trapdoorKey() {
  const { vk } = toyFiles();
  const k = clone(vk);
  k.vk_alpha_1 = g1(2);
  k.vk_beta_2 = g2(7);
  k.vk_gamma_2 = g2(3);
  k.vk_delta_2 = g2(5);
  k.IC = [g1(1), g1(-1)];
  k.verificationKeyId = "attacker-known-trapdoor";
  return k;
}
/** e(A,B) = e(alpha,beta) e(vk_x,gamma) e(C,delta) with B = G2, C = O, vk_x = (1 - c) G1 => a = 2*7 + 3*(1 - c). */
function forgedFor(c: string) {
  const { proof } = toyFiles();
  return { ...proof, proofId: `forged-${c}`, pi_a: g1(14n + 3n * (1n - BigInt(c))), pi_b: g2(1), pi_c: ["0", "1", "0"] };
}

/** EXP-02: the SAME toy key re-encoded in Jacobian coordinates (Z = 2), IC[0] infinity replaced by G1. */
function jacobianToyKey() {
  const { vk } = toyFiles();
  const mod = (a: bigint) => ((a % q) + q) % q;
  const k = clone(vk);
  k.vk_alpha_1 = [String(mod(BigInt(vk.vk_alpha_1[0]) * 4n)), String(mod(BigInt(vk.vk_alpha_1[1]) * 8n)), "2"];
  k.vk_beta_2 = [
    [String(mod(BigInt(vk.vk_beta_2[0][0]) * 4n)), String(mod(BigInt(vk.vk_beta_2[0][1]) * 4n))],
    [String(mod(BigInt(vk.vk_beta_2[1][0]) * 8n)), String(mod(BigInt(vk.vk_beta_2[1][1]) * 8n))],
    ["2", "0"]
  ];
  k.IC[0] = ["1", "2", "1"];
  k.verificationKeyId = "reencoded-toy-key";
  return k;
}

function writeSelfAttestedFixture(dir: string, vk: any, proof: any, pub: any) {
  const dg = legacyDomainDigest;
  const vkH = dg(vk);
  const piH = dg(pub);
  const p = { ...proof, publicInputsHash: piH, verificationKeyHash: vkH };
  const pH = dg(p);
  const adapter = "snarkjs-bn254";
  const coherenceDigest = dg({ proofSystem: "groth16", proofHash: pH, publicInputsHash: piH, verificationKeyHash: vkH, statementHash: pub.statementHash, verifierAdapter: adapter });
  const meta = { schema: "hardkas.zk.groth16.verifierMetadata.v1", proofHash: pH, publicInputsHash: piH, verificationKeyHash: vkH, coherenceDigest };
  const report = { schema: "hardkas.zk.groth16.verifyReport.v1", status: "ZK_FIXTURE_COHERENCE_PASS", coherenceDigest, claims: { zkOnchainVerification: "NOT_CLAIMED" } };
  const manifest = {
    schema: "hardkas.zkGroth16Fixture.v1", proofSystem: "groth16", curve: "bn128", verifierAdapter: adapter,
    proof: "proof.json", publicInputs: "public-inputs.json", verificationKey: "verification-key.json",
    verifierMetadata: "verifier-metadata.json", verifyReport: "verify-report.json",
    contentHashes: { proof: pH, publicInputs: piH, verificationKey: vkH, verifierMetadata: dg(meta), verifyReport: dg(report) },
    expectedStatus: "ZK_FIXTURE_COHERENCE_PASS",
    claims: { cryptographicVerification: "TOY_KNOWN_TRAPDOOR", zkOnchainVerification: "NOT_CLAIMED" }
  };
  for (const [f, v] of Object.entries({ "proof.json": p, "public-inputs.json": pub, "verification-key.json": vk, "verifier-metadata.json": meta, "verify-report.json": report, "manifest.json": manifest })) {
    fs.writeFileSync(path.join(dir, f), JSON.stringify(v, null, 2));
  }
}

describe("HK-04 / CA-ZK-02 / CA-ZK-04 · a VERIFIED result needs an anchored key; non-canonical keys never reach the filter or snarkjs", { timeout: 60000 }, () => {
  it("CA-EXP-04b: a canonical trapdoor key WITHOUT a pin never yields the verified state", async () => {
    const vk = trapdoorKey();
    const { inputs } = toyFiles();
    expect(assessVerificationKeyStrength(vk).strength).toBe("NO_KNOWN_WEAKNESS"); // the heuristic is not a boundary
    for (const c of ["34", "123456789"]) {
      const res = await verifyGroth16Math(vk, { ...inputs, publicSignals: [c] }, forgedFor(c) as any);
      expect(res.status, c).toBe("ZK_GROTH16_MATH_VALID_UNANCHORED_VK");
      expect(res.verified, c).toBe(false);
      expect(res.ok, c).toBe(false);
      expect(res.summary.mathCheck, c).toBe("PASS");
      expect((res.summary as any).verificationKeyAnchor, c).toBe("UNANCHORED");
      expect(res.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_UNANCHORED"), c).toBe(true);
    }
  });

  it("CA-EXP-04b: the same forgery pinned to another key (the toy fixture's) is rejected before any pairing", async () => {
    const vk = trapdoorKey();
    const toy = toyFiles();
    for (const pin of [legacyDomainDigest(toy.vk), groth16VerificationKeyFingerprint(toy.vk)!]) {
      const res = await verifyGroth16Math(vk, { ...toy.inputs, publicSignals: ["34"] }, forgedFor("34") as any, { expectedVerificationKeyHash: pin });
      expect(res.status).toBe("ZK_GROTH16_MATH_REJECTED");
      expect(res.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_HASH_MISMATCH")).toBe(true);
    }
  });

  it("the fixture's valid proof with the right pin is VERIFIED (caller pin and in-code registry)", async () => {
    const { vk, inputs, proof } = toyFiles();
    const fp = groth16VerificationKeyFingerprint(vk)!;
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    const pinned = await verifyGroth16Math(vk, inputs, proof, { ...TOY, expectedVerificationKeyHash: fp });
    expect(pinned.status).toBe("ZK_GROTH16_MATH_VERIFIED");
    expect(pinned.verified).toBe(true);
    expect((pinned.summary as any).verificationKeyAnchor).toBe("CALLER_PIN");
    const legacyPinned = await verifyGroth16Math(vk, inputs, proof, { ...TOY, expectedVerificationKeyHash: legacyDomainDigest(vk) });
    expect(legacyPinned.verified).toBe(true);
    const registry = await verifyGroth16Math(vk, inputs, proof, TOY);
    expect(registry.status).toBe("ZK_GROTH16_MATH_VERIFIED");
    expect((registry.summary as any).verificationKeyAnchor).toBe("PINNED_REGISTRY");
    expect((registry.summary as any).pinnedVerificationKeyId).toBe("hardkas-groth16-multiplier-toy");
    const entry = findPinnedGroth16VerificationKey(fp)!;
    expect(entry.knownTrapdoor).toBe(true);
    // the registry key is still weak: without allowWeak it is refused
    const byDefault = await verifyGroth16Math(vk, inputs, proof);
    expect(byDefault.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(byDefault.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_WEAK_TRAPDOOR")).toBe(true);
  });

  it("EXP-02: the Jacobian re-encoding of the toy key is rejected as non-canonical (before the filter and before snarkjs)", async () => {
    const vk = jacobianToyKey();
    const { inputs } = toyFiles();
    // ffjavascript reads the same group elements; the forgery A = (2 - c)·G1, B = G2, C = O
    const forged = { ...toyFiles().proof, pi_a: g1(2n - 34n), pi_b: toyFiles().vk.vk_gamma_2, pi_c: ["0", "1", "0"] };
    const res = await verifyGroth16Math(vk, { ...inputs, publicSignals: ["34"] }, forged, TOY);
    expect(res.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(res.summary.mathCheck).toBe("FAIL");
    expect(res.issues.some((i) => i.code === "ZK_POINT_NOT_CANONICAL")).toBe(true);
    expect(res.issues.some((i) => i.code === "ZK_GROTH16_PAIRING_FAILED")).toBe(false);
    // the standalone heuristic judges the same group elements as the canonical key
    expect(assessVerificationKeyStrength(vk).strength).toBe("WEAK_TRAPDOOR_SUSPECTED");
    expect(groth16VerificationKeyFingerprint(vk)).toBeUndefined();
  });

  it("points off the curve or outside the G2 subgroup are rejected before snarkjs", async () => {
    const { vk, inputs, proof } = toyFiles();
    const offCurve = await verifyGroth16Math({ ...vk, vk_alpha_1: ["2", "3", "1"] }, inputs, proof, TOY);
    expect(offCurve.issues.some((i) => i.code === "ZK_POINT_NOT_ON_CURVE")).toBe(true);
    const offCurveProof = await verifyGroth16Math(vk, inputs, { ...proof, pi_a: ["99999999999999999999", proof.pi_a[1], "1"] }, TOY);
    expect(offCurveProof.issues.some((i) => i.code === "ZK_POINT_NOT_ON_CURVE")).toBe(true);
    // a point on the twist but outside the r-torsion subgroup (independently checked with ffjavascript)
    let point: bn.G2Affine | undefined;
    for (let k = 1n; k < 50n && !point; k++) {
      const x: bn.Fp2 = [k, 1n];
      const y = bn.fp2Sqrt(bn.fp2Add(bn.fp2Mul(bn.fp2Sqr(x), x), bn.BN254_G2_B));
      if (y) point = { x, y, infinity: false };
    }
    expect(point).toBeDefined();
    const json = [[String(point!.x[0]), String(point!.x[1])], [String(point!.y[0]), String(point!.y[1])], ["1", "0"]];
    const ffPoint = curve.G2.fromObject(json.map((row) => row.map((v) => BigInt(v))));
    expect(curve.G2.isZero(curve.G2.timesScalar(ffPoint, r))).toBe(false);
    const badB = await verifyGroth16Math(vk, inputs, { ...proof, pi_b: json }, TOY);
    expect(badB.issues.some((i) => i.code === "ZK_POINT_NOT_IN_SUBGROUP")).toBe(true);
    const badDelta = await verifyGroth16Math({ ...vk, vk_delta_2: json }, inputs, proof, TOY);
    expect(badDelta.issues.some((i) => i.code === "ZK_POINT_NOT_IN_SUBGROUP")).toBe(true);
  });

  it("CA-ZK-01: gamma = the G2 generator is not a weakness signal (honest snarkjs and RISC Zero keys have it)", () => {
    const { vk } = toyFiles();
    const honestLike = clone(vk);
    honestLike.vk_alpha_1 = g1(123456789);
    honestLike.vk_beta_2 = g2(987654321);
    honestLike.vk_gamma_2 = g2(1);
    honestLike.IC = [g1(55555), g1(77777)];
    expect(assessVerificationKeyStrength(honestLike).strength).toBe("NO_KNOWN_WEAKNESS");
    expect(assessVerificationKeyStrength(R0_GROTH16_VERIFICATION_KEY as any).strength).toBe("NO_KNOWN_WEAKNESS");
  });

  it("CA-ZK-04: the fingerprint covers only the curve points, so a relabelled key keeps its pin", async () => {
    const { vk, inputs, proof } = toyFiles();
    const relabelled = { ...clone(vk), verificationKeyId: "renamed", note: "another note", statementHash: "00".repeat(32) };
    expect(groth16VerificationKeyFingerprint(relabelled)).toBe(groth16VerificationKeyFingerprint(vk));
    expect(legacyDomainDigest(relabelled)).not.toBe(legacyDomainDigest(vk));
    const res = await verifyGroth16Math(relabelled, inputs, proof, { ...TOY, expectedVerificationKeyHash: groth16VerificationKeyFingerprint(vk)! });
    expect(res.verified).toBe(true);
  });

  it("CA-ZK-07: verifyGroth16Math applies the strict key schema too", async () => {
    const { vk, inputs, proof } = toyFiles();
    const res = await verifyGroth16Math({ ...vk, evil: 1 } as any, inputs, proof, TOY);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "ZK_ARTIFACT_SCHEMA_INVALID")).toBe(true);
  });

  it("EXP-02 (c) / HK-04: an attacker-written fixture is coherent but self-attested, and never VERIFIED", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "zk-z-attacker-"));
    try {
      const pub = { schema: "hardkas.zk.groth16.publicInputs.v1", statement: "false: 3 * 11 = 34", publicSignals: ["34"] };
      writeSelfAttestedFixture(d, trapdoorKey(), forgedFor("34"), pub);
      const local = await verifyZkProofLocal(d, os.tmpdir());
      expect(local.status).toBe("ZK_FIXTURE_COHERENCE_PASS");
      const res = await verifyZkProofMath(d, os.tmpdir());
      expect(res.verified).toBe(false);
      expect(res.ok).toBe(false);
      expect(res.status).toBe("ZK_GROTH16_MATH_VALID_UNANCHORED_VK");
      expect(res.summary.binding).toBe("FIXTURE_COHERENCE_SELF_ATTESTED");
      expect(res.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_UNANCHORED_VK");
      const withWeak = await verifyZkProofMath(d, os.tmpdir(), TOY);
      expect(withWeak.verified).toBe(false);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("CA-ZK-05 / CA-EV-10: the corpus pins its key in code; it cannot grant itself allowWeak or ship an unpinned key", async () => {
    const shipped = await verifyZkCorpus(ZK, repoRoot());
    expect(shipped.ok).toBe(true);
    expect(shipped.summary.mathChecked).toBe(1);
    const corpusCopy = fs.mkdtempSync(path.join(os.tmpdir(), "zk-z-corpus-"));
    try {
      fs.cpSync(ZK, corpusCopy, { recursive: true });
      // an attacker fixture added to the corpus with allowWeak and VERIFIED expectations
      const evilDir = path.join(corpusCopy, "groth16-evil");
      fs.mkdirSync(evilDir);
      writeSelfAttestedFixture(evilDir, trapdoorKey(), forgedFor("34"), { schema: "hardkas.zk.groth16.publicInputs.v1", publicSignals: ["34"] });
      const mp = path.join(corpusCopy, "manifest.json");
      const m = rj(mp);
      m.fixtures.push({ id: "groth16-evil", path: "groth16-evil/manifest.json", expectedStatus: "ZK_FIXTURE_COHERENCE_PASS", expectedMathStatus: "ZK_GROTH16_MATH_VERIFIED", allowWeakVerificationKey: true });
      fs.writeFileSync(mp, JSON.stringify(m, null, 2));
      const res = await verifyZkCorpus(corpusCopy, os.tmpdir());
      expect(res.ok).toBe(false);
      expect(res.issues.some((i) => i.code === "ZK_CORPUS_VK_NOT_PINNED")).toBe(true);
      expect(res.issues.some((i) => i.code === "ZK_FIXTURE_MATH_STATUS_MISMATCH")).toBe(true);
      // the shipped toy entry without its registry pin cannot keep allowWeak
      const m2 = rj(mp);
      m2.fixtures = m2.fixtures.filter((f: any) => f.id !== "groth16-evil");
      for (const f of m2.fixtures) delete f.pinnedVerificationKeyId;
      fs.writeFileSync(mp, JSON.stringify(m2, null, 2));
      const res2 = await verifyZkCorpus(corpusCopy, os.tmpdir());
      expect(res2.ok).toBe(false);
      expect(res2.issues.some((i) => i.code === "ZK_CORPUS_WEAK_KEY_NOT_PINNED")).toBe(true);
    } finally {
      fs.rmSync(corpusCopy, { recursive: true, force: true });
    }
  });

  it("capabilities state that VERIFIED needs a pinned key and that fixture coherence is self-attested", () => {
    const caps = createZkCapabilities();
    expect(caps.proofSystems.groth16.verifyMath).toBe("SNARKJS_BN254_PINNED_VK_ONLY");
    expect(caps.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_PINNED_VK_ONLY");
    expect(caps.proofSystems.groth16.trustedSetupProvenance).toBe("NOT_CLAIMED");
  });
});

describe("HK-18 · falsy JSON never passes as a coherent fixture", { timeout: 30000 }, () => {
  it("null, 0, false and \"\" as the manifest of a path containing 'groth16' fail verify and inspect", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "zk-z-falsy-"));
    try {
      for (const literal of ["null", "0", "false", "\"\""]) {
        const f = path.join(d, "evil-groth16.json");
        fs.writeFileSync(f, literal);
        const local = await verifyZkProofLocal(f, d);
        expect(local.ok, literal).toBe(false);
        expect(local.status, literal).toBe("ZK_FIXTURE_COHERENCE_FAIL");
        expect(local.issues.some((i) => i.code === "ZK_FIXTURE_MANIFEST_REQUIRED"), literal).toBe(true);
        const inspect = await inspectZkProof(f, d);
        expect(inspect.ok, literal).toBe(false);
        expect(inspect.issues.some((i) => i.code === "ZK_FIXTURE_MANIFEST_REQUIRED"), literal).toBe(true);
      }
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("a fixture file or a corpus manifest whose JSON is null fails too", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "zk-z-nullfile-"));
    try {
      fs.cpSync(MULT, d, { recursive: true });
      fs.writeFileSync(path.join(d, "proof.json"), "null");
      expect((await verifyZkProofLocal(d, os.tmpdir())).ok).toBe(false);
      expect((await inspectZkProof(d, os.tmpdir())).ok).toBe(false);
      const c = fs.mkdtempSync(path.join(os.tmpdir(), "zk-z-nullcorpus-"));
      try {
        fs.writeFileSync(path.join(c, "manifest.json"), "null");
        const corpus = await verifyZkCorpus(c, os.tmpdir());
        expect(corpus.ok).toBe(false);
        expect(corpus.issues.some((i) => i.code === "ZK_CORPUS_MANIFEST_INVALID")).toBe(true);
      } finally {
        fs.rmSync(c, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("HK-19 · receipt claim digest cross-check", () => {
  it("recomputes the official claim digest a95ac0b3…9dde from (imageId, journalHash)", () => {
    expect(computeR0ReceiptClaimDigest(IMAGE, JOURNAL)).toBe("a95ac0b37bfedcd8136e6c1143086bf5d223ffcb21c6ffcb7c8f60392ca49dde");
    const parsed = parseR0Groth16Receipt(RECEIPT);
    expect(parsed.ok).toBe(true);
    expect(parsed.claimEncoding).toBe("PRUNED_DIGEST");
    expect(parsed.claimDigest).toBe("a95ac0b37bfedcd8136e6c1143086bf5d223ffcb21c6ffcb7c8f60392ca49dde");
    const good = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT });
    expect(good.ok).toBe(true);
    expect((good as any).receiptClaimCrossCheck).toBe("MATCH");
    expect(good.warnings.some((w) => w.code === "ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED")).toBe(false);
  });

  it("a wrong image id or journal hash is rejected instead of yielding a P2SH address", () => {
    for (const [imageId, journalHash] of [["11".repeat(32), JOURNAL], [IMAGE, "88".repeat(32)]]) {
      const res = buildR0Groth16Scripts({ imageId, journalHash, receiptHex: RECEIPT });
      expect(res.ok).toBe(false);
      expect(res.issues.some((i) => i.code === "ZK_RECEIPT_CLAIM_MISMATCH")).toBe(true);
      expect(res.p2shAddresses.simnet).toBe("");
    }
  });
});

describe("HK-16 · the R0 lock binds the image id only: model stated, no public-network addresses for the public vector", () => {
  it("states the authorization model and withholds testnet/mainnet addresses by default", () => {
    const res = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT });
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.code === "ZK_LOCK_BINDS_IMAGE_ID_ONLY")).toBe(true);
    expect(res.p2shAddresses.simnet).toMatch(/^kaspasim:p/);
    expect(res.p2shAddresses.mainnet).toBeUndefined();
    expect(res.p2shAddresses.testnet10).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain("kaspa:prr6mc7myqn2umzt758qhv2gnvahrqapq0d5zwul4y5t55gexw55geyupwjud");
  });

  it("public networks need an explicit acknowledgement, and the public vector is refused even then", () => {
    const noAck = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT, addressNetworks: ["mainnet"] } as any);
    expect(noAck.ok).toBe(false);
    expect(noAck.issues.some((i) => i.code === "ZK_IMAGE_ID_ONLY_LOCK_NOT_ACKNOWLEDGED")).toBe(true);
    const ack = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT, addressNetworks: ["testnet-10", "mainnet"], acknowledgeImageIdOnlyLock: true } as any);
    expect(ack.ok).toBe(false);
    expect(ack.issues.some((i) => i.code === "ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED")).toBe(true);
    expect(ack.p2shAddresses.mainnet).toBeUndefined();
  });

  it("the spend transaction carries the warning and refuses public networks for the public vector", () => {
    const scripts = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT });
    const tx = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: P2PK_SIMNET,
      networkId: "simnet"
    });
    expect(tx.ok).toBe(true);
    expect(tx.warnings.some((w) => w.code === "ZK_LOCK_BINDS_IMAGE_ID_ONLY")).toBe(true);
    const kaspa = loadManagedKaspaWasmSync();
    const mainnetDestination = new kaspa.PrivateKey("33".repeat(32)).toAddress("mainnet").toString();
    const main = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: mainnetDestination,
      networkId: "mainnet"
    });
    expect(main.issues.some((i) => i.code === "ZK_INVALID_DESTINATION_ADDRESS")).toBe(false);
    expect(main.ok).toBe(false);
    expect(main.issues.some((i) => i.code === "ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED")).toBe(true);
  });
});

describe("HK-17 / HK-20 / ZK-09 / ZK-10 · honest ZK facts and states", { timeout: 60000 }, () => {
  const base = () => {
    const scripts = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT });
    return {
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: P2PK_SIMNET,
      networkId: "simnet" as const
    };
  };
  const txStatus = (status: string) => ({
    txId: "aa".repeat(32),
    status,
    policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default", minConfirmations: 10, confirmationUnit: "blue-score" },
    perObserver: [],
    observers: [],
    evidence: { observationArtifactIds: [], ignored: [] },
    reasons: [],
    isFinal: status === "FINALIZED"
  }) as any;

  it("HK-20: the fact records the real image id, the SHA-256 of the proof BYTES and a clock-free identity", () => {
    const params = base();
    const tx = buildR0Groth16Transaction(params);
    expect(tx.ok).toBe(true);
    const f = tx.zkFact!;
    expect(f.imageId).toBe(IMAGE);
    expect(f.journalHash).toBe(JOURNAL);
    expect(f.proofSha256).toBe(createHash("sha256").update(Buffer.from(params.scripts.preparedProof, "hex")).digest("hex"));
    expect(f.p2shAddress).toBe(params.scripts.p2shAddresses.simnet);
    expect(f.redeemScriptHash).toBe(params.scripts.redeemScriptHash);
    const again = buildR0Groth16Transaction(base());
    expect(again.zkFact!.contentHash).toBe(f.contentHash);
    const stamped = buildR0Groth16Transaction({ ...base(), timestamp: "2026-11-06T00:00:00.000Z" } as any);
    expect(stamped.zkFact!.timestamp).toBe("2026-11-06T00:00:00.000Z");
  });

  it("HK-20: no placeholder address: a scripts result without the network's address yields an issue, not a fake", () => {
    const params = base();
    const broken = { ...params, scripts: { ...params.scripts, p2shAddresses: { simnet: "" } } } as any;
    const tx = buildR0Groth16Transaction(broken);
    expect(tx.ok).toBe(false);
    expect(JSON.stringify(tx.issues)).not.toContain("placeholder");
    expect(() => buildR0Groth16Plan(broken)).toThrow(/ZK_P2SH_ADDRESS_UNAVAILABLE/);
  });

  it("HK-17: the caller cannot assert off-chain verification; the default is NOT verified, never a final FAILED", () => {
    const tx = buildR0Groth16Transaction(base());
    expect(tx.zkFact!.verifiedOffChain).toBe(false);
    expect((tx.zkFact as any).offChainVerification).toBe("NOT_PERFORMED");
    const initial = deriveZkOperationStatus({ zkFact: tx.zkFact! });
    expect(initial.kind).toBe("PROOF_NOT_VERIFIED_OFFCHAIN");
    expect(initial.isFinal).toBe(false);
    const accepted = deriveZkOperationStatus({ zkFact: tx.zkFact!, txStatus: txStatus("ACCEPTED") });
    expect(accepted.kind).not.toBe("PROOF_VERIFICATION_FAILED");
    expect(accepted.kind).toBe("TX_ACCEPTED");
    const claimed = buildR0Groth16Transaction({ ...base(), mathVerified: true });
    expect(claimed.zkFact!.verifiedOffChain).toBe(false);
    expect(claimed.warnings.some((w) => w.code === "ZK_CALLER_VERIFICATION_CLAIM_IGNORED")).toBe(true);
    const forged = buildR0Groth16Transaction({ ...base(), localVerification: { verified: true, imageId: IMAGE, journalHash: JOURNAL } } as any);
    expect(forged.zkFact!.verifiedOffChain).toBe(false);
  });

  it("CA-ZK-03 + HK-17: a receipt verified by HardKAS's own R0 verifier sets verifiedOffChain", async () => {
    const local = await verifyR0Groth16ReceiptLocal({ receiptHex: RECEIPT, imageId: IMAGE, journalHash: JOURNAL });
    expect(local.verified).toBe(true);
    const tx = buildR0Groth16Transaction({ ...base(), localVerification: local } as any);
    expect(tx.zkFact!.verifiedOffChain).toBe(true);
    expect((tx.zkFact as any).offChainVerifier).toMatch(/r0-groth16/);
    expect(deriveZkOperationStatus({ zkFact: tx.zkFact! }).kind).toBe("PROOF_VERIFIED_OFFCHAIN");
  });

  it("ZK-10: ACCEPTED is not 'confirmed', and a synthetic execution is never L1 settlement", () => {
    const f = buildR0Groth16Transaction(base()).zkFact!;
    const acc = deriveZkOperationStatus({ zkFact: f, txStatus: txStatus("ACCEPTED") });
    expect(acc.reason).not.toMatch(/confirmed on L1/i);
    const syn = deriveZkOperationStatus({ zkFact: f, txStatus: txStatus("SYNTHETIC_EXECUTED") });
    expect(syn.kind).toBe("SYNTHETIC_ONLY");
    expect(syn.reason).not.toMatch(/L1/);
    expect(deriveZkOperationStatus({ zkFact: f, txStatus: txStatus("CONFIRMED") }).kind).toBe("SETTLED");
    const fin = deriveZkOperationStatus({ zkFact: f, txStatus: txStatus("FINALIZED") });
    expect(fin.kind).toBe("SETTLED");
    expect(fin.isFinal).toBe(true);
  });
});

describe("ZK-07 / ZK-08 · compute budget sufficiency, block compute limit, measured plan mass", () => {
  const scripts = () => buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT });
  const tx = (computeBudget: number, amount = 10n ** 12n) =>
    buildR0Groth16Transaction({
      scripts: scripts(),
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: amount },
      destinationAddress: P2PK_SIMNET,
      networkId: "simnet",
      computeBudget,
      feeOptions: { maxFeeSompi: 10n ** 11n }
    });

  it("prices 250,000 script units per VK element: 6 elements -> minimum budget 1550", () => {
    expect(minimumR0Groth16ComputeBudget(6)).toBe(1550);
    const rules = getToccataPrecompileRules() as any;
    expect(rules.groth16VkElementCostScriptUnits).toBe(250000);
    expect(rules.r0Groth16VkElements).toBe(6);
    expect(rules.minimumR0Groth16ComputeBudget).toBe(1550);
    expect(rules.blockComputeMassLimit).toBe(500000);
    for (const b of [0, 1400, 1549]) {
      const t = tx(b);
      expect(t.ok, String(b)).toBe(false);
      expect(t.issues.some((i) => i.code === "ZK_COMPUTE_BUDGET_INSUFFICIENT"), String(b)).toBe(true);
    }
    expect(tx(1550).ok).toBe(true);
    expect(tx(1600).ok).toBe(true);
  });

  it("refuses budgets whose compute mass cannot fit a block (500,000)", () => {
    for (const b of [5000, 65535]) {
      const t = tx(b);
      expect(t.ok, String(b)).toBe(false);
      expect(t.issues.some((i) => i.code === "ZK_TX_EXCEEDS_BLOCK_COMPUTE_MASS_LIMIT"), String(b)).toBe(true);
    }
  });

  it("ZK-08: the plan's estimated mass is measured for the real shape (P2PK destination), not the 1602 constant", () => {
    const params = {
      scripts: scripts(),
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 200000000n },
      destinationAddress: P2PK_SIMNET,
      networkId: "simnet" as const
    };
    const t = buildR0Groth16Transaction(params);
    expect(t.ok).toBe(true);
    expect(t.mass).not.toBe(1602n);
    const plan = buildR0Groth16Plan(params) as any;
    expect(BigInt(plan.estimatedMass ?? plan.body?.estimatedMass)).toBe(t.computeMass);
  });
});

describe("ZK-11 · RISC0 content hashes are computed, not hard-coded", () => {
  it("reports FAIL when a RISC0 fixture file is tampered", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "zk-z-risc0-"));
    try {
      fs.cpSync(R0, d, { recursive: true });
      const ok = await verifyZkProofLocal(d, os.tmpdir());
      expect(ok.summary.contentHashes).toBe("PASS");
      const jp = path.join(d, "journal.json");
      const j = rj(jp);
      j.journalHash = "88".repeat(32);
      fs.writeFileSync(jp, JSON.stringify(j, null, 2));
      const bad = await verifyZkProofLocal(d, os.tmpdir());
      expect(bad.summary.contentHashes).toBe("FAIL");
      expect(bad.issues.some((i) => i.code === "ZK_CORPUS_HASH_MISMATCH")).toBe(true);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
});

describe("CA-ZK-03 · local RISC Zero Groth16 receipt verification against pinned official constants", { timeout: 60000 }, () => {
  it("the pinned constants match RISC Zero v3.0.4 and the key kaspa-wasm 2.1.0 embeds in the redeem script", () => {
    // risc0 v3.0.4 risc0/circuit/recursion/src/control_id.rs
    expect(R0_GROTH16_CONTROL_ROOT).toBe("a54dc85ac99f851c92d7c96d7318af41dbe7c0194edfcc37eb4d422a998c1f56");
    expect(R0_GROTH16_BN254_CONTROL_ID).toBe("c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404");
    // risc0 v3.0.4 risc0/groth16/src/verifier.rs (ALPHA_X, ALPHA_Y, IC5_X, IC5_Y, DELTA_X1 = imaginary part)
    const vk = R0_GROTH16_VERIFICATION_KEY as any;
    expect(vk.vk_alpha_1[0]).toBe("20491192805390485299153009773594534940189261866228447918068658471970481763042");
    expect(vk.vk_alpha_1[1]).toBe("9383485363053290200918347156157836566562967994039712273449902621266178545958");
    expect(vk.IC[5][0]).toBe("6834578911681792552110317589222010969491336870276623105249474534788043166867");
    expect(vk.IC[5][1]).toBe("15060583660288623605191393599883223885678013570733629274538391874953353488393");
    expect(vk.vk_delta_2[0][1]).toBe("1668323501672964604911431804142266013250380587483576094566949227275849579036");
    // the 424-byte verifying key pushed by the official ZkScriptBuilder
    const s = buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT });
    expect(s.redeemScript.includes(R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX)).toBe(true);
    expect(findPinnedGroth16VerificationKey(groth16VerificationKeyFingerprint(vk)!)?.id).toBe("risc0-groth16-bn254-v3.0.4");
  });

  it("verifies the official receipt and rejects a wrong journal, a wrong image id and a tampered seal", async () => {
    const ok = await verifyR0Groth16ReceiptLocal({ receiptHex: RECEIPT, imageId: IMAGE, journalHash: JOURNAL });
    expect(ok.status).toBe("ZK_R0_GROTH16_RECEIPT_VERIFIED");
    expect(ok.verified).toBe(true);
    expect(ok.claimDigest).toBe("a95ac0b37bfedcd8136e6c1143086bf5d223ffcb21c6ffcb7c8f60392ca49dde");
    expect(ok.compressedProof).toBe(buildR0Groth16Scripts({ imageId: IMAGE, journalHash: JOURNAL, receiptHex: RECEIPT }).preparedProof);
    for (const [imageId, journalHash] of [[IMAGE, "88".repeat(32)], ["11".repeat(32), JOURNAL]]) {
      const bad = await verifyR0Groth16ReceiptLocal({ receiptHex: RECEIPT, imageId, journalHash });
      expect(bad.verified).toBe(false);
      expect(bad.status).toBe("ZK_R0_GROTH16_RECEIPT_REJECTED");
    }
    const tampered = RECEIPT.slice(0, 8) + (RECEIPT[8] === "0" ? "1" : "0") + RECEIPT.slice(9);
    const t = await verifyR0Groth16ReceiptLocal({ receiptHex: tampered, imageId: IMAGE, journalHash: JOURNAL });
    expect(t.verified).toBe(false);
  });
});
