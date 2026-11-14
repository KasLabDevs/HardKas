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
  findPinnedGroth16VerificationKey,
  type Groth16VerifyMathOptions,
  type Groth16VerificationKeyStrength,
  type Groth16VerificationKeyAnchor
} from "./zk/groth16-verifier.js";
import {
  verifyR0Groth16ReceiptLocal,
  computeR0ReceiptClaimDigest,
  parseR0Groth16Receipt,
  r0Groth16PublicSignals,
  findPublicR0TestVector,
  isHardkasR0Groth16Verification,
  PUBLIC_R0_TEST_VECTORS,
  R0_GROTH16_VERIFICATION_KEY,
  R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX,
  R0_GROTH16_CONTROL_ROOT,
  R0_GROTH16_BN254_CONTROL_ID,
  R0_GROTH16_VERIFIER_PARAMETERS_DIGEST,
  r0VerifierParametersIssue,
  R0_GROTH16_VERIFIER_ID,
  R0_GROTH16_PINNED_KEY_ID,
  type R0Groth16LocalVerificationResult,
  type R0Groth16ReceiptParse
} from "./zk/risc0-groth16.js";
import {
  minimumR0Groth16ComputeBudget,
  groth16VkElementsInRedeemScript,
  GROTH16_VK_ELEMENT_COST_SCRIPT_UNITS,
  R0_GROTH16_VK_ELEMENTS,
  R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS,
  BLOCK_COMPUTE_MASS_LIMIT,
  ZK_LOCK_BINDS_IMAGE_ID_ONLY_WARNING,
  type ZkAddressNetwork
} from "./zk/toccata.js";
import {
  buildR0Groth16Plan,
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
  observeZkSpendOnce,
  type KaspaScriptOp,
  type R0Groth16ScriptParams,
  type R0Groth16ScriptsResult,
  type BuildR0Groth16TxParams,
  type R0Groth16TxResult,
  type R0Groth16VerifyScriptsParams,
  type R0Groth16VerifyScriptsResult,
  type ToccataPrecompileRules,
  type ToccataFeePolicyOptions,
  type ToccataZkFeeEstimate,
  ZK_OUTPUT_BINDING_DOMAIN,
  ZK_OUTPUT_BINDING_MAGIC,
  createZkOutputBindingJournal,
  type ZkBindingMode,
  type ZkOutputTarget,
  type ZkReplayBinding,
  type ZkOutputBindingPolicy,
  type ZkJournalBindingParams,
  type ZkJournalBindingResult
} from "./zk/toccata.js";
import {
  deriveZkOperationStatus,
  createZkVerificationFactArtifact,
  type ZkVerificationFact,
  type ZkOperationStatusResult
} from "@hardkas/artifacts";

export {
  verifyR0Groth16ReceiptLocal,
  computeR0ReceiptClaimDigest,
  parseR0Groth16Receipt,
  r0Groth16PublicSignals,
  findPublicR0TestVector,
  isHardkasR0Groth16Verification,
  PUBLIC_R0_TEST_VECTORS,
  R0_GROTH16_VERIFICATION_KEY,
  R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX,
  R0_GROTH16_CONTROL_ROOT,
  R0_GROTH16_BN254_CONTROL_ID,
  R0_GROTH16_VERIFIER_PARAMETERS_DIGEST,
  r0VerifierParametersIssue,
  R0_GROTH16_VERIFIER_ID,
  R0_GROTH16_PINNED_KEY_ID,
  type R0Groth16LocalVerificationResult,
  type R0Groth16ReceiptParse,
  minimumR0Groth16ComputeBudget,
  groth16VkElementsInRedeemScript,
  GROTH16_VK_ELEMENT_COST_SCRIPT_UNITS,
  R0_GROTH16_VK_ELEMENTS,
  R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS,
  BLOCK_COMPUTE_MASS_LIMIT,
  ZK_LOCK_BINDS_IMAGE_ID_ONLY_WARNING,
  type ZkAddressNetwork,
  buildR0Groth16Plan,
  buildR0Groth16Scripts,
  prepareR0Groth16Proof,
  buildR0Groth16Transaction,
  verifyR0Groth16Scripts,
  getToccataPrecompileRules,
  estimateToccataZkFee,
  deriveZkOperationStatus,
  createZkVerificationFactArtifact,
  type ZkVerificationFact,
  type ZkOperationStatusResult,
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
  observeZkSpendOnce,
  type KaspaScriptOp,
  type R0Groth16ScriptParams,
  type R0Groth16ScriptsResult,
  type BuildR0Groth16TxParams,
  type R0Groth16TxResult,
  type R0Groth16VerifyScriptsParams,
  type R0Groth16VerifyScriptsResult,
  type ToccataPrecompileRules,
  type ToccataFeePolicyOptions,
  type ToccataZkFeeEstimate,
  ZK_OUTPUT_BINDING_DOMAIN,
  ZK_OUTPUT_BINDING_MAGIC,
  createZkOutputBindingJournal,
  type ZkBindingMode,
  type ZkOutputTarget,
  type ZkReplayBinding,
  type ZkOutputBindingPolicy,
  type ZkJournalBindingParams,
  type ZkJournalBindingResult
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

/**
 * How a mathematical verification result is tied to its input files.
 *   FIXTURE_COHERENCE_SELF_ATTESTED  the proof, inputs and key match the fixture manifest's content hashes.
 *                                    The digests are unkeyed and the manifest lives in the same directory,
 *                                    so whoever writes the directory writes the binding: it is coherence,
 *                                    never provenance, and never an anchor for the key (HK-04).
 *   MATH_ONLY                        no fixture binding at all.
 */
export type ZkMathBinding = "FIXTURE_COHERENCE_SELF_ATTESTED" | "MATH_ONLY";

/**
 * What a mathematical verification result claims.
 *   GROTH16_SNARKJS_BN254_PINNED_VK       pairing checked against an anchored (pinned) key;
 *   GROTH16_SNARKJS_BN254_UNANCHORED_VK   pairing checked against a key nobody vouched for;
 *   GROTH16_SNARKJS_BN254_PINNED_VK_ONLY  capability: VERIFIED is only ever claimed for a pinned key.
 */
export type ZkMathVerificationClaim =
  | "GROTH16_SNARKJS_BN254_PINNED_VK"
  | "GROTH16_SNARKJS_BN254_UNANCHORED_VK"
  | "GROTH16_SNARKJS_BN254_PINNED_VK_ONLY";

export interface ZkCapabilities {
  schema: typeof HardkasSchemas.ZkCapabilitiesV1;
  experimental: true;
  proofSystems: {
    groth16: {
      inspect: true;
      verifyLocal: "FIXTURE_COHERENCE_ONLY";
      /**
       * Pairing check (snarkjs, BN254). VERIFIED only against a pinned key (caller pin or the in-code
       * registry); otherwise the result is ZK_GROTH16_MATH_VALID_UNANCHORED_VK.
       */
      verifyMath?: "SNARKJS_BN254_PINNED_VK_ONLY";
      proofGeneration: "NOT_CLAIMED";
      trustedSetupProvenance: "NOT_CLAIMED";
    };
    risc0: {
      inspect: true;
      /** Generic zkVM receipts (succinct/composite) are inspect-only. */
      verifyLocal: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED";
      /** RISC Zero GROTH16 receipts: local snarkjs check against the pinned official RISC Zero key (CA-ZK-03). */
      groth16ReceiptVerifyLocal?: "SNARKJS_BN254_PINNED_RISC0_VK_3_0_4";
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
   * Skip the (self-attested) fixture-coherence check. The result then carries binding "MATH_ONLY".
   * Trust in the key still comes only from an anchor (expectedVerificationKeyHash or the in-code
   * registry): without one a passing pairing is ZK_GROTH16_MATH_VALID_UNANCHORED_VK.
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
  /** See Groth16MathVerificationOutput.status: VERIFIED needs an anchored key. */
  status:
    | "ZK_GROTH16_MATH_VERIFIED"
    | "ZK_GROTH16_MATH_VALID_UNANCHORED_VK"
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
    /** Portable fingerprint of the key's curve points ("" when unavailable). */
    verificationKeyFingerprint: string;
    verificationKeyAnchor: Groth16VerificationKeyAnchor;
    pinnedVerificationKeyId?: string;
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
    buildPlan: typeof buildR0Groth16Plan;
    buildScripts: typeof buildR0Groth16Scripts;
    prepareProof: typeof prepareR0Groth16Proof;
    buildTransaction: typeof buildR0Groth16Transaction;
    verifyScripts: typeof verifyR0Groth16Scripts;
    verifyReceipt: typeof verifyR0Groth16ReceiptLocal;
    rules: typeof getToccataPrecompileRules;
    deriveStatus: typeof deriveZkOperationStatus;
    observeSpendOnce: (txId: string, zkFact?: ZkVerificationFact) => Promise<{ observation: any; derivedStatus: any; zkStatus?: any }>;
    createJournal: typeof createZkOutputBindingJournal;
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
      buildPlan: buildR0Groth16Plan,
      buildScripts: buildR0Groth16Scripts,
      prepareProof: prepareR0Groth16Proof,
      buildTransaction: buildR0Groth16Transaction,
      verifyScripts: verifyR0Groth16Scripts,
      verifyReceipt: verifyR0Groth16ReceiptLocal,
      rules: getToccataPrecompileRules,
      deriveStatus: deriveZkOperationStatus,
      observeSpendOnce: (txId: string, zkFact?: ZkVerificationFact) =>
        observeZkSpendOnce(this.sdk.rpc, {
          txId,
          zkFact,
          networkId: (zkFact?.networkId ?? this.sdk.network) as any,
          observerId: this.sdk.tx.observerId()
        }),
      createJournal: createZkOutputBindingJournal
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
        verifyMath: "SNARKJS_BN254_PINNED_VK_ONLY",
        proofGeneration: "NOT_CLAIMED",
        trustedSetupProvenance: "NOT_CLAIMED"
      },
      risc0: {
        inspect: true,
        verifyLocal: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
        groth16ReceiptVerifyLocal: "SNARKJS_BN254_PINNED_RISC0_VK_3_0_4",
        toccataL1Scripts: KASPA_WASM_ZK_BUILDER_CLAIM,
        proofGeneration: "NOT_CLAIMED"
      }
    },
    claims: {
      ...zkClaims(),
      zkMathematicalVerification: "GROTH16_SNARKJS_BN254_PINNED_VK_ONLY",
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
      "ZK_COMPUTE_BUDGET_OUT_OF_RANGE",
      "ZK_POINT_NOT_CANONICAL",
      "ZK_POINT_NOT_ON_CURVE",
      "ZK_POINT_NOT_IN_SUBGROUP",
      "ZK_VERIFICATION_KEY_UNANCHORED",
      "ZK_CORPUS_VK_NOT_PINNED",
      "ZK_CORPUS_WEAK_KEY_NOT_PINNED",
      "ZK_CORPUS_PINNED_KEY_UNKNOWN",
      "ZK_JSON_NOT_OBJECT",
      "ZK_RECEIPT_CLAIM_MISMATCH",
      "ZK_LOCK_BINDS_IMAGE_ID_ONLY",
      "ZK_IMAGE_ID_ONLY_LOCK_NOT_ACKNOWLEDGED",
      "ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED",
      "ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE",
      "ZK_BINDING_LABEL_NOT_ENFORCED",
      "ZK_BOUND_LOCK_UNSPENDABLE",
      "ZK_RECEIPT_CLAIM_UNCHECKED_PUBLIC_NETWORK_REFUSED",
      "ZK_P2SH_ADDRESS_UNAVAILABLE",
      "ZK_COMPUTE_BUDGET_INSUFFICIENT",
      "ZK_TX_EXCEEDS_BLOCK_COMPUTE_MASS_LIMIT",
      "ZK_CALLER_VERIFICATION_CLAIM_IGNORED",
      "ZK_FACT_BUILD_FAILED"
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
  const manifest = manifestPath ? readManifestObject(manifestPath, issues) : undefined;
  const dir = manifestPath ? path.dirname(manifestPath) : path.dirname(resolved);
  const proofSystem = detectProofSystem(manifest, resolved);
  const fixtureFiles = collectFixtureFiles(manifest);
  const files = fixtureFiles.map((entry) => entry.file);
  const contentHashes: Record<string, string> = {};

  for (const { key, file } of fixtureFiles) {
    const filePath = path.join(dir, file);
    const value = readJsonObject(filePath, issues, dir);
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
  const manifest = manifestPath ? readManifestObject(manifestPath, issues) : undefined;
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
    // ZK-11: the content hashes are actually checked, never reported as a constant PASS.
    if (manifest) {
      for (const { key, file } of collectFixtureFiles(manifest)) {
        const filePath = path.join(dir, file);
        const value = readJsonObject(filePath, issues, dir);
        if (value) verifyManifestHash(manifest, key, value, issues, filePath);
      }
    } else if (manifestPath) {
      issues.push({
        code: "ZK_FIXTURE_MANIFEST_REQUIRED",
        message: "A RISC0 fixture needs its manifest to check content hashes.",
        file: manifestPath
      });
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
        contentHashes:
          issues.some((issue) => issue.code.includes("HASH") || issue.code.includes("MANIFEST") || issue.code.includes("FILE") || issue.code.includes("JSON"))
            ? "FAIL"
            : "PASS",
        localVerification: "NOT_IMPLEMENTED"
      },
      claims: zkClaims(),
      issues: [
        ...issues,
        {
          code: "RISC0_VERIFIER_UNAVAILABLE",
          message:
            "No local verifier for generic RISC Zero zkVM receipts (succinct/composite). RISC Zero GROTH16 receipts are verified with `hardkas zk toccata verify-receipt` / verifyR0Groth16ReceiptLocal."
        },
        {
          code: "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED",
          message: "RISC0 fixtures are inspect-only through this command."
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
 * Default binding = FIXTURE_COHERENCE_SELF_ATTESTED: the proof, public inputs and verification key must
 * first pass the fixture's own coherence check (manifest content hashes, cross hashes, coherence digest).
 * That binding is SELF-ATTESTED: the digests are unkeyed and the manifest sits in the same directory, so
 * whoever writes the directory writes the binding. It catches accidents and swapped files; it is never
 * provenance and never anchors the key. `mathOnly` skips it and says so in `summary.binding`.
 *
 * Trust in the key comes only from an ANCHOR: `expectedVerificationKeyHash` (a pin the caller obtained from
 * a trusted source: the key fingerprint or its legacy digest) or the in-code registry
 * PINNED_GROTH16_VERIFICATION_KEYS. A passing pairing against an unanchored key is reported as
 * ZK_GROTH16_MATH_VALID_UNANCHORED_VK (ok/verified false), never ZK_GROTH16_MATH_VERIFIED (HK-04).
 * Non-canonical encodings, off-curve and non-subgroup points are rejected before the weak-key heuristic
 * and before snarkjs; the heuristic itself only detects accidents (allowWeakVerificationKey for toys).
 * None of this says anything about on-chain acceptance.
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
  const binding: ZkMathBinding = options.mathOnly ? "MATH_ONLY" : "FIXTURE_COHERENCE_SELF_ATTESTED";
  const claims = (anchor: Groth16VerificationKeyAnchor = "UNANCHORED"): ZkCapabilities["claims"] => ({
    ...zkClaims(),
    zkMathematicalVerification:
      anchor === "UNANCHORED" ? "GROTH16_SNARKJS_BN254_UNANCHORED_VK" : "GROTH16_SNARKJS_BN254_PINNED_VK"
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
    verificationKeyFingerprint: "",
    verificationKeyAnchor: "UNANCHORED",
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
  const target = manifestPath ? readManifestObject(manifestPath, issues) : undefined;
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
  const proof = readJsonObject(proofPath, issues, dir);
  const publicInputs = readJsonObject(inputsPath, issues, dir);
  const verificationKey = readJsonObject(keyPath, issues, dir);
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

  // Binding (self-attested): the key, inputs and proof must be the ones the fixture manifest commits to.
  if (binding === "FIXTURE_COHERENCE_SELF_ATTESTED") {
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
    claims: claims(mathResult.summary.verificationKeyAnchor),
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
  const rawManifest = readJson(manifestPath, issues);
  // HK-18: a corpus manifest that is not an object (null, 0, false, "") is invalid, never an empty PASS.
  const manifest = isPlainObject(rawManifest) ? rawManifest : undefined;
  if (rawManifest !== undefined && !manifest) {
    issues.push({
      code: "ZK_CORPUS_MANIFEST_INVALID",
      message: `ZK corpus manifest must be a JSON object, got ${rawManifest === null ? "null" : JSON.stringify(rawManifest)}.`,
      file: manifestPath
    });
  }

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
            // CA-ZK-05 / CA-EV-10: the corpus does not decide its own tolerance. The key must be pinned IN
            // CODE (PINNED_GROTH16_VERIFICATION_KEYS) and allowWeak is honoured only for a key pinned there
            // as a known-trapdoor toy; the pin is passed to the verifier, so VERIFIED means "this exact key".
            const pinId = typeof fixture.pinnedVerificationKeyId === "string" ? fixture.pinnedVerificationKeyId : undefined;
            const pinned = pinId ? findPinnedGroth16VerificationKey(pinId) : undefined;
            if (pinId && !pinned) {
              issues.push({
                code: "ZK_CORPUS_PINNED_KEY_UNKNOWN",
                message: `Fixture ${fixture.id} names pinnedVerificationKeyId '${pinId}', which is not pinned in code.`,
                file: fixturePath
              });
            }
            if (!pinned) {
              issues.push({
                code: "ZK_CORPUS_VK_NOT_PINNED",
                message: `Fixture ${fixture.id} claims cryptographicVerification=${mathClaim} without a verification key pinned in code: its result can never be VERIFIED.`,
                file: fixturePath
              });
            }
            if (fixture.allowWeakVerificationKey === true && pinned?.knownTrapdoor !== true) {
              issues.push({
                code: "ZK_CORPUS_WEAK_KEY_NOT_PINNED",
                message: `Fixture ${fixture.id} asks for allowWeakVerificationKey, which the corpus may only use for a key pinned in code as a known-trapdoor toy.`,
                file: fixturePath
              });
            }
            const math = await verifyZkProofMath(fixturePath, workspaceRoot, {
              allowWeakVerificationKey: fixture.allowWeakVerificationKey === true && pinned?.knownTrapdoor === true,
              ...(pinned ? { expectedVerificationKeyHash: pinned.fingerprint } : {})
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
              (math.summary.verificationKeyStrength === "WEAK_TRAPDOOR_SUSPECTED" || pinned?.knownTrapdoor === true) &&
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
  // HK-18: a missing or non-object manifest (null, 0, false, "") is a failure, never a silent pass.
  if (!isPlainObject(manifest)) {
    if (!issues.some((issue) => issue.code === "ZK_FIXTURE_MANIFEST_REQUIRED")) {
      issues.push({
        code: "ZK_FIXTURE_MANIFEST_REQUIRED",
        message: "Groth16 fixture coherence needs a fixture manifest object; nothing was checked.",
        file: path.join(dir, "manifest.json")
      });
    }
    return;
  }
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
  const proof = readJsonObject(proofPath, issues, dir);
  const publicInputs = readJsonObject(inputsPath, issues, dir);
  const verificationKey = readJsonObject(keyPath, issues, dir);
  const metadata = readJsonObject(metadataPath, issues, dir);
  const report = readJsonObject(reportPath, issues, dir);

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

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a JSON file that must hold an object; any other JSON value (null, 0, false, "", [...]) is an issue. */
function readJsonObject(filePath: string, issues: ZkIssue[], baseDir?: string): any | undefined {
  const before = issues.length;
  const value = readJson(filePath, issues, baseDir);
  if (issues.length > before) return undefined;
  if (!isPlainObject(value)) {
    issues.push({
      code: "ZK_JSON_NOT_OBJECT",
      message: `${filePath} must contain a JSON object, got ${value === null ? "null" : Array.isArray(value) ? "an array" : typeof value}.`,
      file: filePath
    });
    return undefined;
  }
  return value;
}

/** Reads a fixture manifest: anything but a JSON object is ZK_FIXTURE_MANIFEST_REQUIRED (HK-18). */
function readManifestObject(filePath: string, issues: ZkIssue[]): Record<string, any> | undefined {
  const before = issues.length;
  const value = readJson(filePath, issues);
  if (issues.length > before) return undefined;
  if (!isPlainObject(value)) {
    issues.push({
      code: "ZK_FIXTURE_MANIFEST_REQUIRED",
      message: `${filePath} must contain a JSON object (a fixture manifest or proof), got ${value === null ? "null" : Array.isArray(value) ? "an array" : JSON.stringify(value)}.`,
      file: filePath
    });
    return undefined;
  }
  return value;
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
