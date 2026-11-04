import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyGroth16Math,
  verifyZkProofMath,
  verifyZkProofLocal,
  verifyZkCorpus,
  inspectZkProof,
  createZkCapabilities,
  assessVerificationKeyStrength,
  normalizeVerifyTimeout,
  verifyR0Groth16Scripts,
  parseKaspaScript,
  estimateToccataZkFee
} from "../src/index.js";
import {
  identityCategoryOf,
  ZkExecutionEvidenceSchema,
  ZkGroth16ProofSchema,
  ZkGroth16VerificationKeySchema,
  legacyDomainDigest,
  verifyArtifactIntegritySync,
  HardkasSchemas
} from "@hardkas/artifacts";

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
const rj = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const TOY = { allowWeakVerificationKey: true };

function tmpCopy(src: string, prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(src, d, { recursive: true });
  return d;
}

// The forged proof the independent audit built from the toy key's trapdoor (c = 34, no witness):
// A = (1 - c)·G1, B = G2, C = ∞. It is kept here so the trapdoor check is tested against the real thing.
const FORGED_34 = {
  schema: "hardkas.zk.groth16.proof.v1",
  protocol: "groth16",
  curve: "bn128",
  proofId: "forged",
  pi_a: [
    "12643418736033227053786352010911706350519409749146221098915102879679320422546",
    "1643331929430297214696398814191134477038713807435084486755124828604813063062",
    "1"
  ],
  pi_b: [
    [
      "10857046999023057135944570762232829481370756359578518086990519993285655852781",
      "11559732032986387107991004021392285783925812861821192530917403151452391805634"
    ],
    [
      "8495653923123431417604973247489272438418190587263600148770280649306958101930",
      "4082367875863433681332203403145435568316851327593401208105741076214120093531"
    ],
    ["1", "0"]
  ],
  pi_c: ["0", "1", "0"]
};

describe("Phase 3 remediation · H-01 weak trusted setup", { timeout: 20000 }, () => {
  const vk = rj(path.join(MULT, "verification-key.json"));
  const inputs = rj(path.join(MULT, "public-inputs.json"));
  const proof = rj(path.join(MULT, "proof.json"));

  it("flags the toy key: alpha = G1, beta = gamma = G2, IC[0] = infinity", () => {
    const report = assessVerificationKeyStrength(vk);
    expect(report.strength).toBe("WEAK_TRAPDOOR_SUSPECTED");
    expect(report.reasons.length).toBeGreaterThanOrEqual(3);
    const healthy = clone(vk);
    healthy.vk_alpha_1 = ["3", "4", "1"];
    healthy.vk_beta_2 = clone(vk.vk_delta_2);
    healthy.IC[0] = ["5", "6", "1"];
    expect(assessVerificationKeyStrength(healthy).strength).toBe("NO_KNOWN_WEAKNESS");
    // The check is best-effort: a key with alpha = 2·G1 (discrete log known to its maker) is not detectable.
    const twoG = clone(healthy);
    twoG.vk_alpha_1 = [
      "1368015179489954701390400359078579693043519447331113978918064868415326638035",
      "9918110051302171585080402603319702774565515993150576347155970296011118125764",
      "1"
    ];
    expect(assessVerificationKeyStrength(twoG).strength).toBe("NO_KNOWN_WEAKNESS");
  });

  it("re-audit RA-3: a bare proof file verifies in mathOnly mode and is refused in bound mode", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "zk-bare-"));
    try {
      for (const f of ["proof.json", "verification-key.json", "public-inputs.json"]) fs.copyFileSync(path.join(MULT, f), path.join(d, f));
      const bound = await verifyZkProofMath(path.join(d, "proof.json"), os.tmpdir(), TOY);
      expect(bound.ok).toBe(false);
      expect(bound.issues.some((i) => i.code === "ZK_FIXTURE_MANIFEST_REQUIRED")).toBe(true);
      const unbound = await verifyZkProofMath(path.join(d, "proof.json"), os.tmpdir(), { ...TOY, mathOnly: true });
      expect(unbound.ok).toBe(true);
      expect(unbound.summary.binding).toBe("MATH_ONLY");
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("the forged proof for 34 is rejected by default and only passes when the weak key is explicitly allowed", async () => {
    const byDefault = await verifyGroth16Math(vk, { ...inputs, publicSignals: ["34"] }, FORGED_34 as any);
    expect(byDefault.ok).toBe(false);
    expect(byDefault.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_WEAK_TRAPDOOR")).toBe(true);
    // Documented reality: with the trapdoor known, the forgery verifies. That is why the key is a TOY.
    const allowed = await verifyGroth16Math(vk, { ...inputs, publicSignals: ["34"] }, FORGED_34 as any, TOY);
    expect(allowed.status).toBe("ZK_GROTH16_MATH_VERIFIED");
    expect(allowed.summary.verificationKeyStrength).toBe("WEAK_TRAPDOOR_SUSPECTED");
  });

  it("the shipped fixture declares itself a toy and the corpus holds it to that claim", async () => {
    const manifest = rj(path.join(MULT, "manifest.json"));
    expect(manifest.claims.cryptographicVerification).toBe("TOY_KNOWN_TRAPDOOR");
    expect(manifest.claims.trustedSetup).toBe("INSECURE_UNCONTRIBUTED_TAU");
    const readme = fs.readFileSync(path.join(MULT, "README.md"), "utf8");
    expect(readme).toMatch(/KNOWN TRAPDOOR/);
    expect(readme).not.toMatch(/powersoftau contribute/);
    const corpus = await verifyZkCorpus(ZK, repoRoot());
    expect(corpus.ok).toBe(true);
    expect(corpus.summary.fixturesChecked).toBe(4);
    expect(corpus.summary.mathChecked).toBe(1);
    expect(proof.note).toMatch(/TOY/);
  });

  it("a fixture that overstates a weak key is rejected by the corpus", async () => {
    const corpusCopy = tmpCopy(ZK, "hardkas-zk-corpus-claim-");
    try {
      const mp = path.join(corpusCopy, "groth16-multiplier", "manifest.json");
      const m = rj(mp);
      m.claims.cryptographicVerification = "CLAIMED";
      fs.writeFileSync(mp, JSON.stringify(m, null, 2));
      const corpus = await verifyZkCorpus(corpusCopy, os.tmpdir());
      expect(corpus.ok).toBe(false);
      expect(corpus.issues.some((i) => i.code === "ZK_FIXTURE_CLAIM_OVERSTATED")).toBe(true);
    } finally {
      fs.rmSync(corpusCopy, { recursive: true, force: true });
    }
  });
});

describe("Phase 3 remediation · M-01 binding and provenance", { timeout: 20000 }, () => {
  it("verify-math is bound to the fixture: a swapped key file is refused before any pairing", async () => {
    const d = tmpCopy(MULT, "hardkas-zk-bind-");
    try {
      const vkPath = path.join(d, "verification-key.json");
      const vk = rj(vkPath);
      vk.vk_delta_2 = clone(vk.vk_gamma_2);
      fs.writeFileSync(vkPath, JSON.stringify(vk, null, 2));
      const bound = await verifyZkProofMath(d, os.tmpdir(), TOY);
      expect(bound.ok).toBe(false);
      expect(bound.summary.binding).toBe("FIXTURE_COHERENCE");
      expect(bound.issues.some((i) => i.code === "ZK_FIXTURE_INCOHERENT")).toBe(true);
      expect(bound.issues.some((i) => i.code === "ZK_CORPUS_HASH_MISMATCH")).toBe(true);
      const unbound = await verifyZkProofMath(d, os.tmpdir(), { ...TOY, mathOnly: true });
      expect(unbound.summary.binding).toBe("MATH_ONLY");
      expect(unbound.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_MATH_ONLY");
      expect(unbound.issues.some((i) => i.code === "ZK_GROTH16_PAIRING_FAILED")).toBe(true);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("the result names the digests it used and can be pinned to an expected key digest", async () => {
    const vk = rj(path.join(MULT, "verification-key.json"));
    const result = await verifyZkProofMath(MULT, repoRoot(), TOY);
    expect(result.ok).toBe(true);
    expect(result.summary.verificationKeyHash).toBe(legacyDomainDigest(vk));
    expect(result.summary.publicInputsHash).toBe(legacyDomainDigest(rj(path.join(MULT, "public-inputs.json"))));
    expect(result.summary.proofHash).toBe(legacyDomainDigest(rj(path.join(MULT, "proof.json"))));
    const pinned = await verifyZkProofMath(MULT, repoRoot(), { ...TOY, expectedVerificationKeyHash: result.summary.verificationKeyHash });
    expect(pinned.ok).toBe(true);
    const wrong = await verifyZkProofMath(MULT, repoRoot(), { ...TOY, expectedVerificationKeyHash: "0".repeat(64) });
    expect(wrong.ok).toBe(false);
    expect(wrong.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_HASH_MISMATCH")).toBe(true);
  });

  it("a replayed proof keeps its own digests: moving files between fixtures breaks the binding", async () => {
    const smokeCopy = tmpCopy(path.join(ZK, "groth16"), "hardkas-zk-replay-");
    try {
      for (const f of ["proof.json", "verification-key.json", "public-inputs.json"]) {
        fs.copyFileSync(path.join(MULT, f), path.join(smokeCopy, f));
      }
      const result = await verifyZkProofMath(smokeCopy, os.tmpdir(), TOY);
      expect(result.ok).toBe(false);
      expect(result.issues.some((i) => i.code === "ZK_FIXTURE_INCOHERENT")).toBe(true);
    } finally {
      fs.rmSync(smokeCopy, { recursive: true, force: true });
    }
  });
});

describe("Phase 3 remediation · L-01 / L-02 / L-09 canonical and strict validation", () => {
  const vk = rj(path.join(MULT, "verification-key.json"));
  const inputs = rj(path.join(MULT, "public-inputs.json"));
  const proof = rj(path.join(MULT, "proof.json"));

  it("rejects non-canonical scalars and points", async () => {
    const cases: Array<[string, () => Promise<any>, string]> = [
      ["leading zeros", () => verifyGroth16Math(vk, { ...inputs, publicSignals: ["0033"] }, proof, TOY), "ZK_SCALAR_MALFORMED"],
      ["two-coordinate pi_a", () => verifyGroth16Math(vk, inputs, { ...proof, pi_a: proof.pi_a.slice(0, 2) }, TOY), "ZK_POINT_MALFORMED"],
      ["four-coordinate pi_a", () => verifyGroth16Math(vk, inputs, { ...proof, pi_a: [...proof.pi_a, "1"] }, TOY), "ZK_POINT_MALFORMED"],
      ["pi_b row of three", () => verifyGroth16Math(vk, inputs, { ...proof, pi_b: [[...proof.pi_b[0], "7"], proof.pi_b[1], proof.pi_b[2]] }, TOY), "ZK_POINT_MALFORMED"],
      ["vk alpha of two", () => verifyGroth16Math({ ...vk, vk_alpha_1: ["1", "2"] }, inputs, proof, TOY), "ZK_POINT_MALFORMED"],
      ["pi_b without z", () => verifyGroth16Math(vk, inputs, { ...proof, pi_b: proof.pi_b.slice(0, 2) }, TOY), "ZK_POINT_MALFORMED"]
    ];
    for (const [name, run, code] of cases) {
      const r = await run();
      expect(r.ok, name).toBe(false);
      expect(r.status, name).toBe("ZK_GROTH16_MATH_REJECTED");
      expect(r.issues.some((i: any) => i.code === code), `${name} -> ${code}`).toBe(true);
    }
  });

  it("checks the public-input arity against the key (REJECTED, not an engine error)", async () => {
    const extra = await verifyGroth16Math(vk, { ...inputs, publicSignals: ["33", "1"] }, proof, TOY);
    expect(extra.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(extra.issues.some((i) => i.code === "ZK_PUBLIC_INPUT_ARITY_MISMATCH")).toBe(true);
    const none = await verifyGroth16Math(vk, { ...inputs, publicSignals: [] }, proof, TOY);
    expect(none.issues.some((i) => i.code === "ZK_PUBLIC_INPUT_ARITY_MISMATCH")).toBe(true);
    const nullPoint = await verifyGroth16Math(vk, inputs, { ...proof, pi_a: null }, TOY);
    expect(nullPoint.status).toBe("ZK_GROTH16_MATH_REJECTED");
    const wrongNPublic = await verifyGroth16Math({ ...vk, nPublic: 3 }, inputs, proof, TOY);
    expect(wrongNPublic.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_ARITY_MISMATCH")).toBe(true);
  });

  it("strict schemas refuse unknown fields and non-canonical digests", () => {
    expect(ZkGroth16ProofSchema.safeParse({ ...proof, evil: "x" }).success).toBe(false);
    expect(ZkGroth16ProofSchema.safeParse(proof).success).toBe(true);
    expect(ZkGroth16VerificationKeySchema.safeParse({ ...vk, extra: 1 }).success).toBe(false);
    expect(ZkGroth16ProofSchema.safeParse({ ...proof, publicInputsHash: "ABC" }).success).toBe(false);
    const d = tmpCopy(MULT, "hardkas-zk-strict-");
    try {
      const pp = path.join(d, "proof.json");
      const p = rj(pp);
      p.evil = "x".repeat(10);
      fs.writeFileSync(pp, JSON.stringify(p, null, 2));
      return verifyZkProofMath(d, os.tmpdir(), { ...TOY, mathOnly: true }).then((r) => {
        expect(r.ok).toBe(false);
        expect(r.issues.some((i) => i.code === "ZK_ARTIFACT_SCHEMA_INVALID")).toBe(true);
      });
    } finally {
      // the promise above still reads from d before this runs? No: readJson is synchronous inside verifyZkProofMath
      // before the first await, so the directory can be removed afterwards by the caller of the returned promise.
    }
  });

  it("has no curve escape hatch: only bn128/bn254 reach the engine", async () => {
    const bls = await verifyGroth16Math({ ...vk, curve: "bls12381" }, inputs, proof, { ...TOY, expectedCurve: "bls12381" } as any);
    expect(bls.ok).toBe(false);
    expect(bls.issues.some((i) => i.code === "ZK_CURVE_UNSUPPORTED")).toBe(true);
    const upper = await verifyGroth16Math({ ...vk, curve: "BN254" }, inputs, proof, TOY);
    expect(upper.ok).toBe(true);
  });
});

describe("Phase 3 remediation · M-05 workspace authority, M-07 cancellation", () => {
  it("never resolves fixture paths against process.cwd()", async () => {
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-zk-fakeroot-"));
    try {
      const rel = path.relative(process.cwd(), MULT);
      const math = await verifyZkProofMath(rel, fakeRoot, TOY);
      expect(math.ok).toBe(false);
      expect(math.issues.some((i) => i.code === "ZK_PROOF_FILE_MISSING")).toBe(true);
      const local = await verifyZkProofLocal(rel, fakeRoot);
      expect(local.ok).toBe(false);
      const inspect = await inspectZkProof(rel, fakeRoot);
      expect(inspect.ok).toBe(false);
      const corpus = await verifyZkCorpus(path.relative(process.cwd(), ZK), fakeRoot);
      expect(corpus.ok).toBe(false);
      expect(corpus.issues.some((i) => i.code === "ZK_FILE_MISSING")).toBe(true);
    } finally {
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it("a 1 ms timeout returns a controlled error promptly and validates the option", async () => {
    const vk = rj(path.join(MULT, "verification-key.json"));
    const inputs = rj(path.join(MULT, "public-inputs.json"));
    const proof = rj(path.join(MULT, "proof.json"));
    const t0 = Date.now();
    const r = await verifyGroth16Math(vk, inputs, proof, { ...TOY, timeoutMs: 1 });
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.status).toBe("ZK_GROTH16_VERIFIER_ERROR");
    expect(r.verified).toBe(false);
    for (const bad of [NaN, 0, -1, 1.5, 10 ** 9]) {
      const rr = await verifyGroth16Math(vk, inputs, proof, { ...TOY, timeoutMs: bad });
      expect(rr.status, String(bad)).toBe("ZK_GROTH16_VERIFIER_ERROR");
      expect(rr.issues.some((i) => i.code === "ZK_VERIFY_TIMEOUT_INVALID"), String(bad)).toBe(true);
    }
    expect(normalizeVerifyTimeout(undefined)).toBe(10000);
    expect(() => normalizeVerifyTimeout("5" as any)).toThrow(RangeError);
  });
});

describe("Phase 3 remediation · M-03 / M-04 Toccata helpers (pure, no WASM)", () => {
  it("parses pushes and opcodes and refuses truncated pushes", () => {
    const ok = parseKaspaScript("0120a6");
    expect(ok.error).toBeUndefined();
    expect(ok.ops).toEqual([{ offset: 0, opcode: 0x01, data: "20" }, { offset: 2, opcode: 0xa6 }]);
    const truncated = parseKaspaScript("2075641a540ee2ad9e012000");
    expect(truncated.error).toMatch(/exceeds the script/);
    expect(parseKaspaScript("abc").error).toMatch(/hex/);
    const pushdata1 = parseKaspaScript("4c02aabb");
    expect(pushdata1.ops[0].data).toBe("aabb");
  });

  it("structural verification is opcode-based, not substring-based", () => {
    expect(verifyR0Groth16Scripts({ redeemScript: "0120a6", sigScript: "" }).ok).toBe(false);
    expect(verifyR0Groth16Scripts({ redeemScript: "aa6b0120", sigScript: "00" }).hasOpZkPrecompile).toBe(false);
    const v = verifyR0Groth16Scripts({ redeemScript: "0120a6", sigScript: "0120a6" });
    expect(v.issues.some((i) => i.code === "ZK_MISSING_PROOF_PUSH")).toBe(true);
    expect(v.issues.some((i) => i.code === "ZK_SIG_SCRIPT_NOT_PUSH_ONLY")).toBe(true);
  });

  it("fee estimate = baseComputeMass + budget * 100 grams; budget validated as u16", () => {
    expect(estimateToccataZkFee(1600, 1527n).computeMass).toBe(161527n);
    expect(estimateToccataZkFee(1600, 1527n).minimumRequiredSompi).toBe(16152700n);
    expect(() => estimateToccataZkFee(65536, 1527n)).toThrow(RangeError);
    expect(estimateToccataZkFee(65535, 0n).computeMass).toBe(6553500n);
  });
});

describe("Phase 3 remediation · M-08 identity categories, L-07 evidence schema, claims", () => {
  it("registers every identifier-shaped ZK field", () => {
    expect(identityCategoryOf("contentHashes")).toBe("DOMAIN_DIGEST");
    expect(identityCategoryOf("journalHash")).toBe("DOMAIN_DIGEST");
    expect(identityCategoryOf("imageIdHash")).toBe("DOMAIN_DIGEST");
    expect(identityCategoryOf("proofId")).toBe("LABEL");
    expect(identityCategoryOf("verificationKeyId")).toBe("LABEL");
    expect(identityCategoryOf("receiptId")).toBe("LABEL");
  });

  it("the execution-evidence schema can express failure and is registered with the artifact verifier", () => {
    const evidence = {
      schema: HardkasSchemas.ZkExecutionEvidenceV1,
      networkId: "simnet",
      node: { rpcUrl: "ws://127.0.0.1:1", serverVersion: "unknown", source: "simnet-harness", harnessRunId: "run-1" },
      precompile: { opcode: "0xa6", opcodeName: "OpZkPrecompile", tag: "0x20", curve: "BN254", provingSystem: "Groth16" },
      guestSystem: "RISC Zero",
      imageId: "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0",
      journalHash: "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456",
      p2shAddress: "kaspasim:x",
      redeemScriptHash: "c7ade3db2026ae6c4bf50e0bb1489b3b7183a103db413b9fa928ba511933a944",
      funding: { txId: "", outputIndex: 0, amountSompi: "0", accepted: false, utxoObserved: false },
      spend: { computeBudget: 1600, feeSompi: "0", payoutAddress: "kaspasim:y", payoutSompi: "0", accepted: false, payoutUtxoObserved: false, rawError: "node unreachable" },
      negativeCases: [],
      outcome: "DEVIATIONS",
      timestamp: new Date().toISOString(),
      notes: ["no node"]
    };
    expect(ZkExecutionEvidenceSchema.safeParse(evidence).success).toBe(true);
    expect((ZkExecutionEvidenceSchema.shape as any).maturityScore).toBeUndefined();
    const integrity = verifyArtifactIntegritySync(evidence as any, { skipHash: true } as any);
    expect(integrity).toBeDefined();
  });

  it("capabilities name the real sources and never a cryptographic provenance", () => {
    const caps = createZkCapabilities();
    expect(caps.proofSystems.groth16.verifyMath).toBe("SNARKJS_BN254_FIXTURE_BOUND");
    expect(caps.proofSystems.groth16.trustedSetupProvenance).toBe("NOT_CLAIMED");
    expect(caps.proofSystems.risc0.toccataL1Scripts).toBe("KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0");
    expect(caps.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_FIXTURE_BOUND");
    expect(caps.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
    expect(caps.errors).toContain("ZK_VERIFICATION_KEY_WEAK_TRAPDOOR");
  });
});
