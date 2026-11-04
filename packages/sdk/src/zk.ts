import fs from "node:fs";
import path from "node:path";
import {
  legacyDomainDigest,
  HardkasSchemas,
  ZkGroth16ProofSchema,
  ZkGroth16VerificationKeySchema,
  ZkGroth16PublicInputsSchema,
  ZkGroth16FixtureSchema,
  ZkRisc0ReceiptSchema,
  ZkRisc0FixtureSchema,
  ZkCorpusSchema,
  ZkProofMathVerificationSchema
} from "@hardkas/artifacts";
import type { Hardkas } from "./index.js";
import {
  verifyGroth16Math,
  type Groth16VerifyMathOptions,
  type Groth16VerificationKeyStrength
} from "./zk/groth16-verifier.js";
import {
  buildR0Groth16Scripts,
  prepareR0Groth16Proof,
  buildR0Groth16Transaction,
  verifyR0Groth16Scripts,
  getToccataPrecompileRules,
  estimateToccataZkFee,
  OP_ZK_PRECOMPILE,
  GROTH16_PROVING_SYSTEM_TAG,
  DEFAULT_ZK_COMPUTE_BUDGET,
  DEFAULT_ZK_FEE_SOMPI,
  HISTORICAL_TRIAL_ZK_FEE_SOMPI,
  DEFAULT_MEMPOOL_SOMPI_PER_MASS,
  DEFAULT_FEE_SAFETY_MARGIN_PERCENT,
  DEFAULT_MAX_FEE_CAP_SOMPI,
  STANDARD_MAX_TRANSACTION_MASS,
  COMPUTE_BUDGET_MAX,
  GRAMS_PER_COMPUTE_BUDGET_UNIT,
  SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT,
  FREE_SCRIPT_UNITS_PER_INPUT,
  GROTH16_PRECOMPILE_COST_GRAMS,
  GROTH16_PRECOMPILE_COST_SCRIPT_UNITS,
  KASPA_WASM_ZK_BUILDER_CLAIM,
  parseKaspaScript,
  type KaspaScriptOp,
  type R0Groth16ScriptParams,
  type R0Groth16ScriptsResult,
  type BuildR0Groth16TxParams,
  type R0Groth16TxResult,
  type R0Groth16VerifyScriptsParams,
  type R0Groth16VerifyScriptsResult,
  type ToccataPrecompileRules,
  type ToccataFeePolicyOptions,
  type ToccataZkFeeEstimate
} from "./zk/toccata.js";

export {
  buildR0Groth16Scripts,
  prepareR0Groth16Proof,
  buildR0Groth16Transaction,
  verifyR0Groth16Scripts,
  getToccataPrecompileRules,
  estimateToccataZkFee,
  OP_ZK_PRECOMPILE,
  GROTH16_PROVING_SYSTEM_TAG,
  DEFAULT_ZK_COMPUTE_BUDGET,
  DEFAULT_ZK_FEE_SOMPI,
  HISTORICAL_TRIAL_ZK_FEE_SOMPI,
  DEFAULT_MEMPOOL_SOMPI_PER_MASS,
  DEFAULT_FEE_SAFETY_MARGIN_PERCENT,
  DEFAULT_MAX_FEE_CAP_SOMPI,
  STANDARD_MAX_TRANSACTION_MASS,
  COMPUTE_BUDGET_MAX,
  GRAMS_PER_COMPUTE_BUDGET_UNIT,
  SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT,
  FREE_SCRIPT_UNITS_PER_INPUT,
  GROTH16_PRECOMPILE_COST_GRAMS,
  GROTH16_PRECOMPILE_COST_SCRIPT_UNITS,
  KASPA_WASM_ZK_BUILDER_CLAIM,
  parseKaspaScript,
  type KaspaScriptOp,
  type R0Groth16ScriptParams,
  type R0Groth16ScriptsResult,
  type BuildR0Groth16TxParams,
  type R0Groth16TxResult,
  type R0Groth16VerifyScriptsParams,
  type R0Groth16VerifyScriptsResult,
  type ToccataPrecompileRules,
  type ToccataFeePolicyOptions,
  type ToccataZkFeeEstimate
};

export const MAX_ZK_FILE_SIZE = 10 * 1024 * 1024; // 10 MB maximum per fixture file

/**
 * ZK corpus digests are domain digests over the SHIPPED fixture files, not
 * artifact identities. The corpus manifests store digests computed with the
 * pre-1.3 algorithm (the canonical-v4 form), so they are verified with the
 * explicit legacy digest (IC-1′.7: legacy digests only for legacy material).
 * Re-issuing the corpus under the current domain digest is a corpus change,
 * not a verifier change.
 */
const corpusDigest = (value: unknown): string => legacyDomainDigest(value);

export type ZkProofSystem = "groth16" | "risc0" | "unknown";

export interface ZkIssue {
  code: string;
  message: string;
  file?: string;
}

/** How a mathematical verification result is bound to its inputs. */
export type ZkMathBinding = "FIXTURE_COHERENCE" | "MATH_ONLY";

export type ZkMathVerificationClaim =
  | "GROTH16_SNARKJS_BN254_FIXTURE_BOUND"
  | "GROTH16_SNARKJS_BN254_MATH_ONLY";

export interface ZkCapabilities {
  schema: typeof HardkasSchemas.ZkCapabilitiesV1;
  experimental: true;
  proofSystems: {
    groth16: {
      inspect: true;
      verifyLocal: "FIXTURE_COHERENCE_ONLY";
      /** Pairing check (snarkjs, BN254) over the fixture's own key, bound to the fixture's content hashes by default. */
      verifyMath?: "SNARKJS_BN254_FIXTURE_BOUND";
      proofGeneration: "NOT_CLAIMED";
      trustedSetupProvenance: "NOT_CLAIMED";
    };
    risc0: {
      inspect: true;
      verifyLocal: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED";
      /** Scripts come from the ZkScriptBuilder shipped in the pinned kaspa-wasm (rusty-kaspa 2.1.0). */
      toccataL1Scripts?: "KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0";
      proofGeneration: "NOT_CLAIMED";
    };
  };
  claims: {
    zkArtifactCoherence: "EXPERIMENTAL";
    zkLocalVerification: "EXPERIMENTAL_FIXTURE_ONLY";
    zkMathematicalVerification?: ZkMathVerificationClaim;
    zkToccataL1ScriptBuilding?: "KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0";
    zkOnchainVerification: "NOT_CLAIMED";
    vmConsensusEquivalence: "NOT_CLAIMED";
    mainnet: "BLOCKED_BY_POLICY";
  };
  errors: string[];
}

export interface ZkProofInspectResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkProofInspectV1;
  path: string;
  proofSystem: ZkProofSystem;
  status: "ZK_PROOF_INSPECTED" | "ZK_PROOF_INSPECT_FAILED";
  experimental: true;
  summary: {
    files: string[];
    contentHashes: Record<string, string>;
    verifierAdapter?: string;
    expectedStatus?: string;
  };
  claims: ZkCapabilities["claims"];
  issues: ZkIssue[];
}

export interface ZkProofVerifyResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkProofVerificationV1;
  path: string;
  proofSystem: ZkProofSystem;
  status:
    | "ZK_FIXTURE_COHERENCE_PASS"
    | "ZK_FIXTURE_COHERENCE_FAIL"
    | "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED"
    | "ZK_VERIFIER_UNSUPPORTED"
    | "ZK_VERIFIER_UNAVAILABLE";
  experimental: true;
  summary: {
    verifierAdapter?: string;
    contentHashes: "PASS" | "FAIL";
    localVerification: "PASS" | "FAIL" | "NOT_IMPLEMENTED";
  };
  claims: ZkCapabilities["claims"];
  issues: ZkIssue[];
}

export interface ZkProofMathOptions extends Groth16VerifyMathOptions {
  /**
   * Skip the fixture-coherence binding. The result then carries binding "MATH_ONLY" and the claim
   * GROTH16_SNARKJS_BN254_MATH_ONLY: "this proof is consistent with the key found next to it",
   * nothing about where that key came from.
   */
  mathOnly?: boolean;
}

export interface ZkProofMathVerifyResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkProofMathVerificationV1;
  path: string;
  proofSystem: ZkProofSystem;
  engine: "snarkjs-bn254";
  curve: string;
  status:
    | "ZK_GROTH16_MATH_VERIFIED"
    | "ZK_GROTH16_MATH_REJECTED"
    | "ZK_GROTH16_VERIFIER_ERROR";
  verified: boolean;
  durationMs: number;
  experimental: true;
  summary: {
    proofSystem: string;
    curve: string;
    publicSignals: string[];
    mathCheck: "PASS" | "FAIL" | "ERROR";
    /** Legacy corpus digest of the verification key object actually used ("" when it could not be read). */
    verificationKeyHash: string;
    publicInputsHash: string;
    proofHash: string;
    verificationKeyStrength: Groth16VerificationKeyStrength;
    binding: ZkMathBinding;
  };
  claims: ZkCapabilities["claims"];
  issues: ZkIssue[];
}

export interface ZkCorpusVerifyResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkCorpusVerificationV1;
  path: string;
  experimental: true;
  status: "ZK_CORPUS_VERIFICATION_PASS" | "ZK_CORPUS_VERIFICATION_FAIL";
  summary: {
    proofSystems: string[];
    fixturesChecked: number;
    artifactsChecked: number;
    /** Fixtures whose cryptographic claim was exercised with the pairing check. */
    mathChecked: number;
    contentHashes: "PASS" | "FAIL";
    localVerification: "PASS" | "FAIL" | "PARTIAL";
    knownLimitations: string[];
  };
  claims: {
    zkArtifactCoherence: "READY_MATCH" | "INVALID";
    zkLocalVerification: "READY_GROTH16_FIXTURE_COHERENCE" | "INVALID";
    zkOnchainVerification: "NOT_CLAIMED" | "INVALID";
    runtimeOutcome: "PARTIAL" | "INVALID";
    vmConsensusEquivalence: "NOT_CLAIMED" | "INVALID";
    mainnet: "BLOCKED_BY_POLICY" | "INVALID";
  };
  issues: ZkIssue[];
}

const ZK_KNOWN_LIMITATIONS = [
  "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
  "PARTIAL_VM_SIMULATION"
];

export class HardkasZk {
  public readonly proof: {
    inspect: (targetPath: string) => Promise<ZkProofInspectResult>;
    verifyLocal: (targetPath: string) => Promise<ZkProofVerifyResult>;
    verifyMath: (
      targetPath: string,
      options?: ZkProofMathOptions
    ) => Promise<ZkProofMathVerifyResult>;
  };
  public readonly corpus: {
    verify: (targetPath: string) => Promise<ZkCorpusVerifyResult>;
  };
  public readonly toccata: {
    buildScripts: typeof buildR0Groth16Scripts;
    prepareProof: typeof prepareR0Groth16Proof;
    buildTransaction: typeof buildR0Groth16Transaction;
    verifyScripts: typeof verifyR0Groth16Scripts;
    rules: typeof getToccataPrecompileRules;
  };

  constructor(private sdk: Hardkas) {
    this.proof = {
      inspect: (targetPath: string) => inspectZkProof(targetPath, this.sdk.cwd),
      verifyLocal: (targetPath: string) => verifyZkProofLocal(targetPath, this.sdk.cwd),
      verifyMath: (targetPath: string, options?: ZkProofMathOptions) =>
        verifyZkProofMath(targetPath, this.sdk.cwd, options)
    };
    this.corpus = {
      verify: (targetPath: string) => verifyZkCorpus(targetPath, this.sdk.cwd)
    };
    this.toccata = {
      buildScripts: buildR0Groth16Scripts,
      prepareProof: prepareR0Groth16Proof,
      buildTransaction: buildR0Groth16Transaction,
      verifyScripts: verifyR0Groth16Scripts,
      rules: getToccataPrecompileRules
    };
  }

  async capabilities(): Promise<ZkCapabilities> {
    return createZkCapabilities();
  }
}

export function createZkCapabilities(): ZkCapabilities {
  return {
    schema: HardkasSchemas.ZkCapabilitiesV1,
    experimental: true,
    proofSystems: {
      groth16: {
        inspect: true,
        verifyLocal: "FIXTURE_COHERENCE_ONLY",
        verifyMath: "SNARKJS_BN254_FIXTURE_BOUND",
        proofGeneration: "NOT_CLAIMED",
        trustedSetupProvenance: "NOT_CLAIMED"
      },
      risc0: {
        inspect: true,
        verifyLocal: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
        toccataL1Scripts: KASPA_WASM_ZK_BUILDER_CLAIM,
        proofGeneration: "NOT_CLAIMED"
      }
    },
    claims: {
      ...zkClaims(),
      zkMathematicalVerification: "GROTH16_SNARKJS_BN254_FIXTURE_BOUND",
      zkToccataL1ScriptBuilding: KASPA_WASM_ZK_BUILDER_CLAIM
    },
    errors: [
      "SDK_ZK_ONCHAIN_VERIFICATION_UNSUPPORTED",
      "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
      "ZK_VERIFIER_UNSUPPORTED",
      "ZK_VERIFIER_UNAVAILABLE",
      "ZK_CORPUS_MANIFEST_INVALID",
      "ZK_CORPUS_HASH_MISMATCH",
      "RISC0_VERIFIER_UNAVAILABLE",
      "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
      "ZK_FILE_TOO_LARGE",
      "ZK_PATH_TRAVERSAL_DETECTED",
      "ZK_ARTIFACT_SCHEMA_INVALID",
      "ZK_GROTH16_PAIRING_FAILED",
      "ZK_SCALAR_OUT_OF_RANGE",
      "ZK_SCALAR_MALFORMED",
      "ZK_POINT_COORDINATE_OUT_OF_RANGE",
      "ZK_POINT_MALFORMED",
      "ZK_PUBLIC_INPUT_ARITY_MISMATCH",
      "ZK_VERIFICATION_KEY_INCOMPLETE",
      "ZK_VERIFICATION_KEY_WEAK_TRAPDOOR",
      "ZK_VERIFICATION_KEY_HASH_MISMATCH",
      "ZK_FIXTURE_INCOHERENT",
      "ZK_FIXTURE_MANIFEST_REQUIRED",
      "ZK_VERIFY_TIMEOUT_INVALID",
      "ZK_FIXTURE_MATH_STATUS_MISMATCH",
      "ZK_FIXTURE_CLAIM_OVERSTATED",
      "ZK_SCRIPT_PARSE_ERROR",
      "ZK_COMPUTE_BUDGET_OUT_OF_RANGE"
    ]
  };
}

export async function inspectZkProof(
  targetPath: string,
  workspaceRoot = process.cwd()
): Promise<ZkProofInspectResult> {
  const resolved = path.resolve(workspaceRoot, targetPath);
  const issues: ZkIssue[] = [];
  const manifestPath = resolveManifestPath(resolved, issues);
  const manifest = manifestPath ? readJson(manifestPath, issues) : undefined;
  const dir = manifestPath ? path.dirname(manifestPath) : path.dirname(resolved);
  const proofSystem = detectProofSystem(manifest, resolved);
  const fixtureFiles = collectFixtureFiles(manifest);
  const files = fixtureFiles.map((entry) => entry.file);
  const contentHashes: Record<string, string> = {};

  for (const { key, file } of fixtureFiles) {
    const filePath = path.join(dir, file);
    const value = readJson(filePath, issues, dir);
    if (!value) continue;
    const actual = corpusDigest(value);
    contentHashes[file] = actual;
    const expected = manifest?.contentHashes?.[key];
    if (typeof expected === "string" && expected !== actual) {
      issues.push({
        code: "ZK_CORPUS_HASH_MISMATCH",
        message: `Expected ${expected}, got ${actual}.`,
        file: filePath
      });
    }
  }

  const ok = issues.length === 0 && proofSystem !== "unknown";
  if (proofSystem === "unknown") {
    issues.push({
      code: "ZK_VERIFIER_UNSUPPORTED",
      message: "Could not determine proof system from artifact or manifest.",
      file: resolved
    });
  }

  return {
    ok,
    schema: HardkasSchemas.ZkProofInspectV1,
    path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
    proofSystem,
    status: ok ? "ZK_PROOF_INSPECTED" : "ZK_PROOF_INSPECT_FAILED",
    experimental: true,
    summary: {
      files,
      contentHashes,
      verifierAdapter: manifest?.verifierAdapter,
      expectedStatus: manifest?.expectedStatus
    },
    claims: zkClaims(),
    issues
  };
}

export async function verifyZkProofLocal(
  targetPath: string,
  workspaceRoot = process.cwd()
): Promise<ZkProofVerifyResult> {
  const resolved = path.resolve(workspaceRoot, targetPath);
  const issues: ZkIssue[] = [];
  const manifestPath = resolveManifestPath(resolved, issues);
  const manifest = manifestPath ? readJson(manifestPath, issues) : undefined;
  const dir = manifestPath ? path.dirname(manifestPath) : path.dirname(resolved);
  const proofSystem = detectProofSystem(manifest, resolved);

  if (proofSystem === "risc0") {
    if (manifest) {
      const risc0Parsed = ZkRisc0FixtureSchema.safeParse(manifest);
      if (!risc0Parsed.success) {
        issues.push({
          code: "ZK_ARTIFACT_SCHEMA_INVALID",
          message: `Invalid RISC0 fixture manifest: ${risc0Parsed.error.message}`,
          file: manifestPath ?? resolved
        });
      }
    }
    return {
      ok: false,
      schema: HardkasSchemas.ZkProofVerificationV1,
      path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
      proofSystem,
      status: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
      experimental: true,
      summary: {
        verifierAdapter: manifest?.verifierAdapter ?? "risc0-helper",
        contentHashes: "PASS",
        localVerification: "NOT_IMPLEMENTED"
      },
      claims: zkClaims(),
      issues: [
        {
          code: "RISC0_VERIFIER_UNAVAILABLE",
          message:
            "RISC0 local receipt verification helper is not bundled in 0.13.0-rc.1."
        },
        {
          code: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
          message: "RISC0 is inspect-only in this experimental lab scaffold."
        }
      ]
    };
  }

  if (proofSystem !== "groth16") {
    return unsupportedVerification(
      resolved,
      workspaceRoot,
      proofSystem,
      issues,
      manifest?.verifierAdapter
    );
  }

  verifyGroth16Fixture(dir, manifest, issues);
  const ok = issues.length === 0;
  return {
    ok,
    schema: HardkasSchemas.ZkProofVerificationV1,
    path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
    proofSystem,
    status: ok ? "ZK_FIXTURE_COHERENCE_PASS" : "ZK_FIXTURE_COHERENCE_FAIL",
    experimental: true,
    summary: {
      verifierAdapter:
        manifest?.verifierAdapter ?? "hardkas-groth16-fixture-coherence-v1",
      contentHashes: issues.some((issue) => issue.code.includes("HASH"))
        ? "FAIL"
        : "PASS",
      localVerification: ok ? "PASS" : "FAIL"
    },
    claims: zkClaims(),
    issues
  };
}

/**
 * Mathematical (pairing) verification of a Groth16 fixture.
 *
 * Default binding = FIXTURE_COHERENCE: the proof, public inputs and verification key must first
 * pass the fixture's own coherence check (manifest content hashes, cross hashes, coherence digest).
 * Only then is the pairing computed, and the result names the digests of the three objects it used.
 * `mathOnly` skips the binding and says so in `summary.binding` and in the claim.
 *
 * A verification key from a provably weak trusted setup is rejected unless
 * `allowWeakVerificationKey` is passed (toy fixtures). `expectedVerificationKeyHash` lets a caller
 * with key provenance pin the key. None of this says anything about on-chain acceptance.
 */
export async function verifyZkProofMath(
  targetPath: string,
  workspaceRoot = process.cwd(),
  options: ZkProofMathOptions = {}
): Promise<ZkProofMathVerifyResult> {
  const start = Date.now();
  const resolved = path.resolve(workspaceRoot, targetPath);
  const relPath = path.relative(workspaceRoot, resolved).replace(/\\/g, "/");
  const issues: ZkIssue[] = [];
  const binding: ZkMathBinding = options.mathOnly ? "MATH_ONLY" : "FIXTURE_COHERENCE";
  const claims = (): ZkCapabilities["claims"] => ({
    ...zkClaims(),
    zkMathematicalVerification:
      binding === "MATH_ONLY" ? "GROTH16_SNARKJS_BN254_MATH_ONLY" : "GROTH16_SNARKJS_BN254_FIXTURE_BOUND"
  });
  const emptySummary = (
    ps: string,
    curve: string,
    mathCheck: "FAIL" | "ERROR",
    publicSignals: string[] = []
  ): ZkProofMathVerifyResult["summary"] => ({
    proofSystem: ps,
    curve,
    publicSignals,
    mathCheck,
    verificationKeyHash: "",
    publicInputsHash: "",
    proofHash: "",
    verificationKeyStrength: "NO_KNOWN_WEAKNESS",
    binding
  });
  const fail = (
    status: "ZK_GROTH16_MATH_REJECTED" | "ZK_GROTH16_VERIFIER_ERROR",
    ps: ZkProofSystem,
    curve = "unknown",
    publicSignals: string[] = []
  ): ZkProofMathVerifyResult => ({
    ok: false,
    schema: HardkasSchemas.ZkProofMathVerificationV1,
    path: relPath,
    proofSystem: ps,
    engine: "snarkjs-bn254",
    curve,
    status,
    verified: false,
    durationMs: Date.now() - start,
    experimental: true,
    summary: emptySummary(ps, curve, status === "ZK_GROTH16_MATH_REJECTED" ? "FAIL" : "ERROR", publicSignals),
    claims: claims(),
    issues
  });

  const manifestPath = resolveManifestPath(resolved, issues);
  const target = manifestPath ? readJson(manifestPath, issues) : undefined;
  const dir = manifestPath ? path.dirname(manifestPath) : path.dirname(resolved);
  // The target may be the fixture manifest (directory or manifest.json) or a bare proof file.
  // Only a real fixture manifest can bind the verification; a bare proof file detects its system
  // from its own `protocol` and needs mathOnly.
  const manifest =
    target && (target.schema === HardkasSchemas.ZkGroth16FixtureV1 || target.schema === HardkasSchemas.ZkRisc0FixtureV1)
      ? target
      : undefined;
  let proofSystem = detectProofSystem(manifest, resolved);
  if (proofSystem === "unknown" && target?.protocol === "groth16") proofSystem = "groth16";

  if (proofSystem === "risc0") {
    issues.push({
      code: "ZK_VERIFIER_UNSUPPORTED",
      message: "Mathematical verification for RISC0 zkVM receipts is not implemented."
    });
    return fail("ZK_GROTH16_VERIFIER_ERROR", proofSystem);
  }
  if (proofSystem !== "groth16") {
    issues.push({
      code: "ZK_VERIFIER_UNSUPPORTED",
      message: `Unsupported proof system '${proofSystem}'. Mathematical verification engine supports 'groth16'.`
    });
    return fail("ZK_GROTH16_VERIFIER_ERROR", proofSystem);
  }

  const proofPath = path.join(dir, manifest?.proof ?? "proof.json");
  const inputsPath = path.join(dir, manifest?.publicInputs ?? "public-inputs.json");
  const keyPath = path.join(dir, manifest?.verificationKey ?? "verification-key.json");
  const proof = readJson(proofPath, issues, dir);
  const publicInputs = readJson(inputsPath, issues, dir);
  const verificationKey = readJson(keyPath, issues, dir);
  if (!proof || !publicInputs || !verificationKey) {
    return fail("ZK_GROTH16_VERIFIER_ERROR", "groth16");
  }
  const curve = typeof verificationKey.curve === "string" ? verificationKey.curve : "bn128";
  const signals: string[] = Array.isArray(publicInputs.publicSignals) ? publicInputs.publicSignals : [];

  // Strict schemas (canonical points, no unknown keys).
  const proofParse = ZkGroth16ProofSchema.safeParse(proof);
  if (!proofParse.success) {
    issues.push({
      code: "ZK_ARTIFACT_SCHEMA_INVALID",
      message: `Invalid Groth16 proof schema: ${proofParse.error.message}`,
      file: proofPath
    });
  }
  const inputsParse = ZkGroth16PublicInputsSchema.safeParse(publicInputs);
  if (!inputsParse.success) {
    issues.push({
      code: "ZK_ARTIFACT_SCHEMA_INVALID",
      message: `Invalid Groth16 public inputs schema: ${inputsParse.error.message}`,
      file: inputsPath
    });
  }
  const keyParse = ZkGroth16VerificationKeySchema.safeParse(verificationKey);
  if (!keyParse.success) {
    issues.push({
      code: "ZK_ARTIFACT_SCHEMA_INVALID",
      message: `Invalid Groth16 verification key schema: ${keyParse.error.message}`,
      file: keyPath
    });
  }
  if (issues.length > 0) return fail("ZK_GROTH16_MATH_REJECTED", "groth16", curve, signals);

  // Binding: the key, inputs and proof must be the ones the fixture manifest commits to.
  if (binding === "FIXTURE_COHERENCE") {
    if (!manifest) {
      issues.push({
        code: "ZK_FIXTURE_MANIFEST_REQUIRED",
        message:
          "Fixture-bound verification needs the fixture manifest (manifest.json) next to the proof; pass mathOnly to verify an unbound proof."
      });
      return fail("ZK_GROTH16_MATH_REJECTED", "groth16", curve, signals);
    }
    const coherence: ZkIssue[] = [];
    verifyGroth16Fixture(dir, manifest, coherence);
    if (coherence.length > 0) {
      issues.push(
        {
          code: "ZK_FIXTURE_INCOHERENT",
          message:
            "Fixture coherence failed: the proof, public inputs or verification key do not match the manifest's content hashes, so no pairing was computed (mathOnly skips this binding)."
        },
        ...coherence
      );
      return fail("ZK_GROTH16_MATH_REJECTED", "groth16", curve, signals);
    }
  }

  const mathOptions: Groth16VerifyMathOptions = {};
  if (options.timeoutMs !== undefined) mathOptions.timeoutMs = options.timeoutMs;
  if (options.allowWeakVerificationKey !== undefined) mathOptions.allowWeakVerificationKey = options.allowWeakVerificationKey;
  if (options.expectedVerificationKeyHash !== undefined) mathOptions.expectedVerificationKeyHash = options.expectedVerificationKeyHash;
  const mathResult = await verifyGroth16Math(verificationKey, publicInputs, proof, mathOptions);

  return {
    ok: mathResult.ok,
    schema: HardkasSchemas.ZkProofMathVerificationV1,
    path: relPath,
    proofSystem: "groth16",
    engine: "snarkjs-bn254",
    curve: mathResult.summary.curve,
    status: mathResult.status,
    verified: mathResult.verified,
    durationMs: Date.now() - start,
    experimental: true,
    summary: { ...mathResult.summary, binding },
    claims: claims(),
    issues: mathResult.issues
  };
}

export async function verifyZkCorpus(
  targetPath: string,
  workspaceRoot = process.cwd()
): Promise<ZkCorpusVerifyResult> {
  const corpusPath = path.resolve(workspaceRoot, targetPath);
  const issues: ZkIssue[] = [];
  // Paths resolve against the given workspace root only: never against process.cwd() (M-05).
  const manifestPath = path.join(corpusPath, "manifest.json");
  const manifest = readJson(manifestPath, issues);

  if (manifest) {
    const corpusParsed = ZkCorpusSchema.safeParse(manifest);
    if (!corpusParsed.success) {
      issues.push({
        code: "ZK_ARTIFACT_SCHEMA_INVALID",
        message: `Invalid ZK corpus manifest schema: ${corpusParsed.error.message}`,
        file: manifestPath
      });
    }
    expectEqual(
      manifest.schema,
      HardkasSchemas.ZkCorpusV1,
      issues,
      "ZK_CORPUS_MANIFEST_INVALID",
      manifestPath
    );
    expectEqual(
      manifest.network,
      "simnet",
      issues,
      "ZK_NETWORK_UNSUPPORTED",
      manifestPath
    );
    expectEqual(
      manifest.profile,
      "toccata-v2",
      issues,
      "ZK_PROFILE_UNSUPPORTED",
      manifestPath
    );
    expectEqual(
      manifest.claims?.zkOnchainVerification,
      "NOT_CLAIMED",
      issues,
      "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
      manifestPath
    );
    expectEqual(
      manifest.claims?.vmConsensusEquivalence,
      "NOT_CLAIMED",
      issues,
      "ZK_VM_CONSENSUS_CLAIM_INVALID",
      manifestPath
    );
    expectEqual(
      manifest.claims?.mainnet,
      "BLOCKED_BY_POLICY",
      issues,
      "ZK_MAINNET_GUARD_INVALID",
      manifestPath
    );
    for (const limitation of ZK_KNOWN_LIMITATIONS) {
      if (
        !Array.isArray(manifest.expectedKnownLimitations) ||
        !manifest.expectedKnownLimitations.includes(limitation)
      ) {
        issues.push({
          code: "ZK_LIMITATION_NOT_DECLARED",
          message: `ZK corpus must declare ${limitation}.`,
          file: manifestPath
        });
      }
    }
  }

  let fixturesChecked = 0;
  let artifactsChecked = 0;
  let mathChecked = 0;
  const proofSystems = new Set<string>();

  if (Array.isArray(manifest?.fixtures)) {
    for (const fixture of manifest.fixtures) {
      fixturesChecked += 1;
      const fixturePath = path.join(corpusPath, fixture.path);
      if (!isPathInside(corpusPath, fixturePath)) {
        issues.push({
          code: "ZK_PATH_TRAVERSAL_DETECTED",
          message: `Path traversal attempt detected in corpus fixture: ${fixture.path}`,
          file: fixturePath
        });
        continue;
      }
      const inspect = await inspectZkProof(fixturePath, workspaceRoot);
      artifactsChecked += inspect.summary.files.length;
      if (inspect.proofSystem !== "unknown") proofSystems.add(inspect.proofSystem);
      issues.push(...inspect.issues);

      if (inspect.proofSystem === "groth16") {
        const verified = await verifyZkProofLocal(fixturePath, workspaceRoot);
        issues.push(...verified.issues);
        expectEqual(
          verified.status,
          fixture.expectedStatus,
          issues,
          "ZK_FIXTURE_STATUS_MISMATCH",
          fixturePath
        );
        // A fixture that claims any cryptographic verification is held to it (M-02): the corpus
        // entry must declare the expected math status and the pairing is actually run.
        const fixtureManifest = readJson(fixturePath, []);
        const mathClaim = fixtureManifest?.claims?.cryptographicVerification;
        if (typeof mathClaim === "string" && mathClaim !== "NOT_CLAIMED") {
          if (typeof fixture.expectedMathStatus !== "string") {
            issues.push({
              code: "ZK_MATH_EXPECTATION_MISSING",
              message: `Fixture ${fixture.id} claims cryptographicVerification=${mathClaim} but the corpus entry declares no expectedMathStatus.`,
              file: fixturePath
            });
          } else {
            mathChecked += 1;
            const math = await verifyZkProofMath(fixturePath, workspaceRoot, {
              allowWeakVerificationKey: fixture.allowWeakVerificationKey === true
            });
            if (math.status !== fixture.expectedMathStatus) {
              issues.push({
                code: "ZK_FIXTURE_MATH_STATUS_MISMATCH",
                message: `Expected ${fixture.expectedMathStatus}, got ${math.status}.`,
                file: fixturePath
              });
              issues.push(...math.issues);
            }
            if (
              math.summary.verificationKeyStrength === "WEAK_TRAPDOOR_SUSPECTED" &&
              !/TOY|TRAPDOOR|INSECURE/i.test(mathClaim)
            ) {
              issues.push({
                code: "ZK_FIXTURE_CLAIM_OVERSTATED",
                message: `Fixture ${fixture.id} has a verification key with a known trapdoor but claims cryptographicVerification=${mathClaim}.`,
                file: fixturePath
              });
            }
          }
        }
      } else if (inspect.proofSystem === "risc0") {
        const verified = await verifyZkProofLocal(fixturePath, workspaceRoot);
        expectEqual(
          verified.status,
          fixture.expectedStatus,
          issues,
          "ZK_FIXTURE_STATUS_MISMATCH",
          fixturePath
        );
      }
    }
  } else if (manifest) {
    issues.push({
      code: "ZK_CORPUS_MANIFEST_INVALID",
      message: "ZK corpus manifest must include fixtures array.",
      file: manifestPath
    });
  }

  const ok = issues.length === 0;
  return {
    ok,
    schema: HardkasSchemas.ZkCorpusVerificationV1,
    path: path.relative(workspaceRoot, corpusPath).replace(/\\/g, "/"),
    experimental: true,
    status: ok ? "ZK_CORPUS_VERIFICATION_PASS" : "ZK_CORPUS_VERIFICATION_FAIL",
    summary: {
      proofSystems: Array.from(proofSystems).sort(),
      fixturesChecked,
      artifactsChecked,
      mathChecked,
      contentHashes: issues.some((issue) => issue.code.includes("HASH"))
        ? "FAIL"
        : "PASS",
      localVerification: ok ? "PARTIAL" : "FAIL",
      knownLimitations: Array.isArray(manifest?.expectedKnownLimitations)
        ? manifest.expectedKnownLimitations
        : []
    },
    claims: {
      zkArtifactCoherence: ok ? "READY_MATCH" : "INVALID",
      zkLocalVerification: ok ? "READY_GROTH16_FIXTURE_COHERENCE" : "INVALID",
      zkOnchainVerification: ok ? "NOT_CLAIMED" : "INVALID",
      runtimeOutcome: ok ? "PARTIAL" : "INVALID",
      vmConsensusEquivalence: ok ? "NOT_CLAIMED" : "INVALID",
      mainnet: ok ? "BLOCKED_BY_POLICY" : "INVALID"
    },
    issues
  };
}

function verifyGroth16Fixture(dir: string, manifest: any, issues: ZkIssue[]) {
  if (!manifest) return;
  const manifestParse = ZkGroth16FixtureSchema.safeParse(manifest);
  if (!manifestParse.success) {
    issues.push({
      code: "ZK_ARTIFACT_SCHEMA_INVALID",
      message: `Invalid Groth16 fixture manifest: ${manifestParse.error.message}`,
      file: path.join(dir, "manifest.json")
    });
    return;
  }
  const proofPath = path.join(dir, manifest.proof ?? "proof.json");
  const inputsPath = path.join(dir, manifest.publicInputs ?? "public-inputs.json");
  const keyPath = path.join(dir, manifest.verificationKey ?? "verification-key.json");
  const metadataPath = path.join(
    dir,
    manifest.verifierMetadata ?? "verifier-metadata.json"
  );
  const reportPath = path.join(dir, manifest.verifyReport ?? "verify-report.json");
  const proof = readJson(proofPath, issues, dir);
  const publicInputs = readJson(inputsPath, issues, dir);
  const verificationKey = readJson(keyPath, issues, dir);
  const metadata = readJson(metadataPath, issues, dir);
  const report = readJson(reportPath, issues, dir);

  if (!proof || !publicInputs || !verificationKey || !metadata || !report) return;

  const proofParse = ZkGroth16ProofSchema.safeParse(proof);
  if (!proofParse.success) {
    issues.push({
      code: "ZK_ARTIFACT_SCHEMA_INVALID",
      message: `Invalid Groth16 proof schema: ${proofParse.error.message}`,
      file: proofPath
    });
  }

  const inputsParse = ZkGroth16PublicInputsSchema.safeParse(publicInputs);
  if (!inputsParse.success) {
    issues.push({
      code: "ZK_ARTIFACT_SCHEMA_INVALID",
      message: `Invalid Groth16 public inputs schema: ${inputsParse.error.message}`,
      file: inputsPath
    });
  }

  const keyParse = ZkGroth16VerificationKeySchema.safeParse(verificationKey);
  if (!keyParse.success) {
    issues.push({
      code: "ZK_ARTIFACT_SCHEMA_INVALID",
      message: `Invalid Groth16 verification key schema: ${keyParse.error.message}`,
      file: keyPath
    });
  }

  verifyManifestHash(manifest, "proof", proof, issues, proofPath);
  verifyManifestHash(manifest, "publicInputs", publicInputs, issues, inputsPath);
  verifyManifestHash(manifest, "verificationKey", verificationKey, issues, keyPath);
  verifyManifestHash(manifest, "verifierMetadata", metadata, issues, metadataPath);
  verifyManifestHash(manifest, "verifyReport", report, issues, reportPath);

  const publicInputsHash = corpusDigest(publicInputs);
  const verificationKeyHash = corpusDigest(verificationKey);
  const proofHash = corpusDigest(proof);
  expectEqual(
    proof.publicInputsHash,
    publicInputsHash,
    issues,
    "ZK_GROTH16_PUBLIC_INPUTS_HASH_MISMATCH",
    proofPath
  );
  expectEqual(
    proof.verificationKeyHash,
    verificationKeyHash,
    issues,
    "ZK_GROTH16_VERIFICATION_KEY_HASH_MISMATCH",
    proofPath
  );
  expectEqual(
    metadata.proofHash,
    proofHash,
    issues,
    "ZK_GROTH16_PROOF_HASH_MISMATCH",
    metadataPath
  );
  expectEqual(
    metadata.publicInputsHash,
    publicInputsHash,
    issues,
    "ZK_GROTH16_PUBLIC_INPUTS_HASH_MISMATCH",
    metadataPath
  );
  expectEqual(
    metadata.verificationKeyHash,
    verificationKeyHash,
    issues,
    "ZK_GROTH16_VERIFICATION_KEY_HASH_MISMATCH",
    metadataPath
  );
  expectEqual(
    report.status,
    "ZK_FIXTURE_COHERENCE_PASS",
    issues,
    "ZK_GROTH16_REPORT_STATUS_INVALID",
    reportPath
  );
  expectEqual(
    report.claims?.zkOnchainVerification,
    "NOT_CLAIMED",
    issues,
    "ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED",
    reportPath
  );

  const coherenceDigest = corpusDigest({
    proofSystem: "groth16",
    proofHash,
    publicInputsHash,
    verificationKeyHash,
    statementHash: publicInputs.statementHash,
    verifierAdapter: manifest.verifierAdapter
  });
  expectEqual(
    metadata.coherenceDigest,
    coherenceDigest,
    issues,
    "ZK_GROTH16_COHERENCE_MISMATCH",
    metadataPath
  );
  expectEqual(
    report.coherenceDigest,
    coherenceDigest,
    issues,
    "ZK_GROTH16_COHERENCE_MISMATCH",
    reportPath
  );
}

function unsupportedVerification(
  resolved: string,
  workspaceRoot: string,
  proofSystem: ZkProofSystem,
  issues: ZkIssue[],
  verifierAdapter?: string
): ZkProofVerifyResult {
  return {
    ok: false,
    schema: HardkasSchemas.ZkProofVerificationV1,
    path: path.relative(workspaceRoot, resolved).replace(/\\/g, "/"),
    proofSystem,
    status: "ZK_VERIFIER_UNSUPPORTED",
    experimental: true,
    summary: {
      ...(verifierAdapter ? { verifierAdapter } : {}),
      contentHashes: issues.some((issue) => issue.code.includes("HASH"))
        ? "FAIL"
        : "PASS",
      localVerification: "FAIL"
    },
    claims: zkClaims(),
    issues: [
      ...issues,
      {
        code: "ZK_VERIFIER_UNSUPPORTED",
        message: `No local verifier is available for proof system ${proofSystem}.`
      }
    ]
  };
}

function isPathInside(baseDir: string, targetFile: string): boolean {
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetFile));
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Resolves the manifest for a fixture path. Never falls back to process.cwd() (M-05). */
function resolveManifestPath(resolved: string, issues: ZkIssue[]): string | undefined {
  if (!fs.existsSync(resolved)) {
    issues.push({
      code: "ZK_PROOF_FILE_MISSING",
      message: `Missing ${resolved}.`,
      file: resolved
    });
    return undefined;
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) return path.join(resolved, "manifest.json");
  return resolved;
}

function collectFixtureFiles(manifest: any): Array<{ key: string; file: string }> {
  if (!manifest) return [];
  return [
    ["proof", manifest.proof],
    ["publicInputs", manifest.publicInputs],
    ["verificationKey", manifest.verificationKey],
    ["verifierMetadata", manifest.verifierMetadata],
    ["verifyReport", manifest.verifyReport],
    ["receipt", manifest.receipt],
    ["journal", manifest.journal],
    ["imageId", manifest.imageId]
  ]
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, file]) => ({ key, file }));
}

function detectProofSystem(manifest: any, resolved: string): ZkProofSystem {
  const declared = manifest?.proofSystem;
  if (declared === "groth16" || declared === "risc0") return declared;
  const lower = resolved.toLowerCase();
  if (lower.includes("groth16")) return "groth16";
  if (lower.includes("risc0")) return "risc0";
  return "unknown";
}

function verifyManifestHash(
  manifest: any,
  key: string,
  value: any,
  issues: ZkIssue[],
  filePath: string
) {
  const expected = manifest.contentHashes?.[key];
  if (typeof expected !== "string") {
    issues.push({
      code: "ZK_CORPUS_HASH_MISSING",
      message: `Missing content hash for ${key}.`,
      file: filePath
    });
    return;
  }
  const actual = corpusDigest(value);
  if (actual !== expected) {
    issues.push({
      code: "ZK_CORPUS_HASH_MISMATCH",
      message: `Expected ${expected}, got ${actual}.`,
      file: filePath
    });
  }
}

function readJson(filePath: string, issues: ZkIssue[], baseDir?: string): any | undefined {
  if (baseDir && !isPathInside(baseDir, filePath)) {
    issues.push({
      code: "ZK_PATH_TRAVERSAL_DETECTED",
      message: `Path traversal attempt detected: ${filePath} is outside ${baseDir}.`,
      file: filePath
    });
    return undefined;
  }
  if (!fs.existsSync(filePath)) {
    issues.push({
      code: "ZK_FILE_MISSING",
      message: `Missing ${filePath}.`,
      file: filePath
    });
    return undefined;
  }
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_ZK_FILE_SIZE) {
      issues.push({
        code: "ZK_FILE_TOO_LARGE",
        message: `File ${filePath} (${stat.size} bytes) exceeds maximum allowed size of ${MAX_ZK_FILE_SIZE} bytes.`,
        file: filePath
      });
      return undefined;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error: any) {
    issues.push({
      code: "ZK_JSON_INVALID",
      message: error?.message || `Invalid JSON in ${filePath}.`,
      file: filePath
    });
    return undefined;
  }
}

function expectEqual(
  actual: unknown,
  expected: unknown,
  issues: ZkIssue[],
  code: string,
  file: string
) {
  if (actual !== expected) {
    issues.push({
      code,
      message: `Expected ${String(expected)}, got ${String(actual)}.`,
      file
    });
  }
}

function zkClaims(): ZkCapabilities["claims"] {
  return {
    zkArtifactCoherence: "EXPERIMENTAL",
    zkLocalVerification: "EXPERIMENTAL_FIXTURE_ONLY",
    zkOnchainVerification: "NOT_CLAIMED",
    vmConsensusEquivalence: "NOT_CLAIMED",
    mainnet: "BLOCKED_BY_POLICY"
  };
}
