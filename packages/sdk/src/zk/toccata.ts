import { createHash, randomBytes } from "node:crypto";
import { loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import type { KaspaRpcClient } from "@hardkas/kaspa-rpc";
import {
  HardkasSchemas,
  createV1TxPlanArtifact,
  createZkVerificationFactArtifact,
  checkArtifactIdentity,
  deriveTxStatus,
  deriveZkOperationStatus,
  type ZkToccataScriptsType,
  type ZkToccataTxType,
  type TxPlanArtifact,
  type ZkVerificationFact,
  type ZkOperationStatusResult,
  type DerivedTxStatus,
  type TxObservation
} from "@hardkas/artifacts";
import { observeTxOnce, rpcObserverFor } from "../tx-observer.js";
import type { ZkIssue } from "../zk.js";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export const OP_ZK_PRECOMPILE = "0xa6";
export const GROTH16_PROVING_SYSTEM_TAG = "0x20";
export const DEFAULT_ZK_COMPUTE_BUDGET = 1600;

/**
 * Where the Toccata scripts come from. HardKAS does not assemble ZK scripts itself: it calls the
 * `ZkScriptBuilder` shipped inside the pinned kaspa-wasm (rusty-kaspa 2.1.0). There is no upstream
 * package named "kaspa-txscript-zk-sdk"; the earlier claim label was imprecise (audit L-08).
 */
export const KASPA_WASM_ZK_BUILDER_CLAIM = "KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0" as const;

/**
 * Consensus / mempool constants, cross-checked against rusty-kaspa 2.1.0
 * (`crypto/txscript/src/zk_precompiles/tags.rs`, `consensus/core/src/mass/mod.rs`) and the
 * Toccata Script Pricing page:
 *   allowed script units per input = compute_budget * 10_000 + 9_999
 *   1 compute_budget unit            = 100 grams of compute mass = 10_000 script units
 *   Groth16 precompile (tag 0x20)    = 140_000 grams = 14_000_000 script units (+ pushes)
 *   compute mass                     = tx bytes + 10 * script-public-key bytes + 100 * sum(compute_budget)
 */
export const COMPUTE_BUDGET_MAX = 65535; // u16 field of a version-1 input
export const GRAMS_PER_COMPUTE_BUDGET_UNIT = 100n;
export const SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT = 10000n;
export const FREE_SCRIPT_UNITS_PER_INPUT = 9999n;
export const GROTH16_PRECOMPILE_COST_GRAMS = 140000n;
export const GROTH16_PRECOMPILE_COST_SCRIPT_UNITS = 14000000n;

/**
 * Historical trial fee used in the Phase 4 local simnet trial (20,000,000 sompi = 0.2 KAS).
 * It covered the 16,152,700 sompi minimum the node demanded for that transaction (compute mass
 * 161,527 at 100 sompi/gram). It is historical test evidence, not a universal constant.
 */
export const HISTORICAL_TRIAL_ZK_FEE_SOMPI = 20000000n;

/** Standard Kaspa mempool fee rate for compute mass (sompi per gram). */
export const DEFAULT_MEMPOOL_SOMPI_PER_MASS = 100n;

/** Default safety margin percent applied above the minimum mempool fee requirement. */
export const DEFAULT_FEE_SAFETY_MARGIN_PERCENT = 20;

/** Default safety cap to prevent runaway fee expenditure (0.5 KAS = 50,000,000 sompi). */
export const DEFAULT_MAX_FEE_CAP_SOMPI = 50000000n;

/** The base compute mass kaspa-wasm reports for the official RISC Zero vector spend (one input, one output). */
export const REFERENCE_BASE_COMPUTE_MASS = 1602n;

export interface ToccataFeePolicyOptions {
  feerateSompiPerMass?: bigint;
  marginPercent?: number;
  maxFeeSompi?: bigint;
}

export interface ToccataZkFeeEstimate {
  minimumRequiredSompi: bigint;
  recommendedSompi: bigint;
  /** base compute mass + compute budget * 100 grams */
  computeMass: bigint;
  /** Non-contextual compute mass of the transaction WITHOUT the compute budget term (bytes + 10 * spk bytes). */
  baseComputeMass: bigint;
  /** @deprecated alias of baseComputeMass kept for one release */
  baseTxMass: bigint;
  computeBudgetMass: bigint;
  effectiveMass: bigint;
  feerateSompiPerMass: bigint;
  marginPercent: number;
  /** True when the recommended fee was clamped by maxFeeSompi below the minimum the mempool demands. */
  cappedBelowMinimum: boolean;
  formula: "baseComputeMass + computeBudget * 100 grams; fee = feerate * computeMass";
}

export function isValidComputeBudget(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= COMPUTE_BUDGET_MAX;
}

/**
 * Minimum and recommended fee for a Toccata transaction with one ZK input.
 * The base compute mass must come from the real transaction (see buildR0Groth16Transaction, which
 * measures it with kaspa-wasm); no shape-specific constant is assumed (audit M-04).
 */
export function estimateToccataZkFee(
  computeBudget: number = DEFAULT_ZK_COMPUTE_BUDGET,
  baseComputeMass: bigint = REFERENCE_BASE_COMPUTE_MASS,
  options: ToccataFeePolicyOptions = {}
): ToccataZkFeeEstimate {
  if (!isValidComputeBudget(computeBudget)) {
    throw new RangeError(`computeBudget must be an integer in [0, ${COMPUTE_BUDGET_MAX}], got ${String(computeBudget)}`);
  }
  if (typeof baseComputeMass !== "bigint" || baseComputeMass < 0n) {
    throw new RangeError("baseComputeMass must be a non-negative bigint (grams)");
  }
  const feerate = options.feerateSompiPerMass ?? DEFAULT_MEMPOOL_SOMPI_PER_MASS;
  const margin = options.marginPercent ?? DEFAULT_FEE_SAFETY_MARGIN_PERCENT;
  const maxCap = options.maxFeeSompi ?? DEFAULT_MAX_FEE_CAP_SOMPI;
  if (!Number.isInteger(margin) || margin < 0) throw new RangeError("marginPercent must be a non-negative integer");

  const computeBudgetMass = BigInt(computeBudget) * GRAMS_PER_COMPUTE_BUDGET_UNIT;
  const computeMass = baseComputeMass + computeBudgetMass;
  const effectiveMass = computeMass;
  const minimumRequiredSompi = effectiveMass * feerate;
  const marginSompi = (minimumRequiredSompi * BigInt(margin)) / 100n;
  let recommendedSompi = minimumRequiredSompi + marginSompi;
  let cappedBelowMinimum = false;
  if (recommendedSompi > maxCap) {
    recommendedSompi = maxCap;
    cappedBelowMinimum = maxCap < minimumRequiredSompi;
  }

  return {
    minimumRequiredSompi,
    recommendedSompi,
    computeMass,
    baseComputeMass,
    baseTxMass: baseComputeMass,
    computeBudgetMass,
    effectiveMass,
    feerateSompiPerMass: feerate,
    marginPercent: margin,
    cappedBelowMinimum,
    formula: "baseComputeMass + computeBudget * 100 grams; fee = feerate * computeMass"
  };
}

/** Default fee for the reference vector shape. Computed, never hand-tuned. */
export const DEFAULT_ZK_FEE_SOMPI = estimateToccataZkFee(DEFAULT_ZK_COMPUTE_BUDGET, REFERENCE_BASE_COMPUTE_MASS)
  .recommendedSompi;
export const STANDARD_MAX_TRANSACTION_MASS = 100000n;
export const ZERO_TXID = "0000000000000000000000000000000000000000000000000000000000000000";


export const ZK_OUTPUT_BINDING_DOMAIN = "HARDKAS_ZK_OUTPUT_BINDING_V1" as const;
export const ZK_OUTPUT_BINDING_MAGIC = "484b5a31"; // "HKZ1"

export type ZkBindingMode = "proof-only" | "proof-and-output-bound";

export interface ZkOutputTarget {
  address: string;
  amountSompi: bigint;
}

export interface ZkReplayBinding {
  transactionId: string;
  index: number;
}

export interface ZkOutputBindingPolicy {
  mode: ZkBindingMode;
  payout: ZkOutputTarget;
  change?: ZkOutputTarget;
  utxoBinding?: ZkReplayBinding;
}

export interface ZkJournalBindingParams {
  payoutAddress: string;
  amountSompi: bigint;
  utxoOutpoint?: { transactionId: string; index: number };
  nonceHex?: string;
}

export interface ZkJournalBindingResult {
  domain: typeof ZK_OUTPUT_BINDING_DOMAIN;
  journalHex: string;
  journalHash: string;
  recipientSpkHex: string;
  amountSompi: bigint;
  nonceHex: string;
}

/**
 * Creates a canonical, domain-separated journal for zkVM applications committing to transaction outputs.
 * Domain: HARDKAS_ZK_OUTPUT_BINDING_V1
 * Layout: [0..4] "HKZ1" | [4..36] SPK SHA-256 | [36..44] Amount u64 LE | [44..76] Outpoint Digest | [76..108] Nonce
 */
export function createZkOutputBindingJournal(params: ZkJournalBindingParams): ZkJournalBindingResult {
  const kaspa = loadManagedKaspaWasmSync();
  if (!kaspa.Address.validate(params.payoutAddress)) {
    throw new Error(`Invalid payoutAddress: '${params.payoutAddress}'`);
  }
  const addr = new kaspa.Address(params.payoutAddress);
  const spk = kaspa.payToAddressScript(addr);
  const spkBytes = Buffer.from(spk.script, "hex");
  const spkDigest = createHash("sha256").update(spkBytes).digest();

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(params.amountSompi, 0);

  let utxoDigest: Buffer;
  if (params.utxoOutpoint) {
    const txIdBytes = Buffer.from(params.utxoOutpoint.transactionId, "hex");
    const idxBuf = Buffer.alloc(4);
    idxBuf.writeUInt32LE(params.utxoOutpoint.index, 0);
    utxoDigest = createHash("sha256").update(Buffer.concat([txIdBytes, idxBuf])).digest();
  } else {
    utxoDigest = Buffer.alloc(32, 0);
  }

  const nonce = params.nonceHex ? Buffer.from(params.nonceHex, "hex") : randomBytes(32);
  const magic = Buffer.from(ZK_OUTPUT_BINDING_MAGIC, "hex");

  const journalBuf = Buffer.concat([magic, spkDigest, amountBuf, utxoDigest, nonce]);
  const journalHex = journalBuf.toString("hex");
  const journalHash = createHash("sha256").update(journalBuf).digest("hex");

  return {
    domain: ZK_OUTPUT_BINDING_DOMAIN,
    journalHex,
    journalHash,
    recipientSpkHex: spk.script,
    amountSompi: params.amountSompi,
    nonceHex: nonce.toString("hex")
  };
}

export interface R0Groth16ScriptParams {
  imageId: string;
  journalHash: string;
  receiptHex: string;
  bindingPolicy?: ZkOutputBindingPolicy;
}

export interface R0Groth16ScriptsResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkToccataScriptsV1;
  imageId: string;
  journalHash: string;
  preparedProof: string;
  redeemScript: string;
  sigScript: string;
  fullSignatureScript: string;
  redeemScriptHash: string;
  p2shScriptPublicKey: {
    version: number;
    script: string;
  };
  p2shAddresses: {
    simnet: string;
    testnet10: string;
    mainnet: string;
  };
  precompileOpcode: typeof OP_ZK_PRECOMPILE;
  provingSystemTag: typeof GROTH16_PROVING_SYSTEM_TAG;
  bindingMode: ZkBindingMode;
  bindingPolicy?: ZkOutputBindingPolicy;
  consensusEnforced: boolean;
  boundPayoutAddress?: string;
  boundPayoutAmount?: bigint;
  experimental: true;
  warnings: ZkIssue[];
  issues: ZkIssue[];
}

export interface BuildR0Groth16TxParams {
  scripts: R0Groth16ScriptsResult;
  utxo: {
    transactionId: string;
    index: number;
    amountSompi: bigint;
  };
  destinationAddress: string;
  feeSompi?: bigint;
  feeOptions?: ToccataFeePolicyOptions;
  computeBudget?: number;
  networkId?: "simnet" | "testnet-10" | "mainnet";
  /** Whether the Groth16 mathematical verification succeeded off-chain */
  mathVerified?: boolean | undefined;
  bindingPolicy?: ZkOutputBindingPolicy;
}

export interface R0Groth16TxResult {
  ok: boolean;
  schema: typeof HardkasSchemas.ZkToccataTxV1;
  transaction: any;
  transactionId: string;
  /** Non-contextual mass reported by kaspa-wasm for the built transaction (no compute-budget term). */
  mass: bigint;
  /** mass + computeBudget * 100 grams: what the mempool prices. */
  computeMass: bigint;
  feeEstimate: ToccataZkFeeEstimate;
  standardMaxMass: bigint;
  withinStandardMaxMass: boolean;
  computeBudget: number;
  txVersion: number;
  feeSompi: bigint;
  destinationAddress: string;
  networkId: "simnet" | "testnet-10" | "mainnet";
  bindingMode: ZkBindingMode;
  consensusEnforced: boolean;
  experimental: true;
  warnings: ZkIssue[];
  issues: ZkIssue[];
  /** Unified V1 transaction plan artifact for this ZK spend */
  planArtifact?: TxPlanArtifact | undefined;
  /** Immutable ZK verification fact binding proof, verification key, inputs and outputs */
  zkFact?: ZkVerificationFact | undefined;
}

export interface R0Groth16VerifyScriptsParams {
  redeemScript: string;
  sigScript: string;
  imageId?: string | undefined;
  journalHash?: string | undefined;
  expectedBindingMode?: ZkBindingMode | undefined;
  expectedPayoutAddress?: string | undefined;
  expectedPayoutAmount?: bigint | undefined;
}

export interface KaspaScriptOp {
  /** Byte offset of the opcode within the script. */
  offset: number;
  opcode: number;
  /** Present for data pushes (OP_0, OP_DATA_1..75, OP_PUSHDATA1/2/4); hex of the pushed bytes. */
  data?: string;
}

export interface R0Groth16VerifyScriptsResult {
  ok: boolean;
  /** The redeem script's LAST opcode is OpZkPrecompile (0xa6). */
  hasOpZkPrecompile: boolean;
  /** The opcode before it is a 1-byte push of the Groth16 tag 0x20. */
  hasGroth16Tag: boolean;
  redeemScriptLength: number;
  sigScriptLength: number;
  redeemOps: number;
  sigOps: number;
  /** The signature script contains a 128-byte push (the compressed Groth16 proof). */
  proofPushFound: boolean;
  /** The signature script's last push equals the redeem script (P2SH spend shape). */
  redeemScriptEmbedded: boolean;
  /** Largest single data push in the redeem script (the embedded RISC Zero verifying key), in bytes. */
  largestRedeemPushBytes: number;
  imageIdFound?: boolean;
  journalHashFound?: boolean;
  bindingMode?: ZkBindingMode;
  consensusEnforced?: boolean;
  hasOutputIntrospection?: boolean;
  enforcesOutputCount?: boolean;
  enforcesPayoutSpk?: boolean;
  enforcesPayoutAmount?: boolean;
  enforcesUtxoBinding?: boolean;
  boundPayoutSpk?: string;
  boundPayoutAmount?: bigint;
  issues: ZkIssue[];
}

export interface ToccataPrecompileRules {
  opcode: typeof OP_ZK_PRECOMPILE;
  opcodeName: "OpZkPrecompile";
  tag: typeof GROTH16_PROVING_SYSTEM_TAG;
  curve: "BN254";
  proofFormat: "Arkworks Compressed (128 bytes: G1[32] + G2[64] + G1[32])";
  /** Cost charged by the Groth16 precompile itself (rusty-kaspa tags.rs: Gram(1000 * 140)). */
  groth16PrecompileCostGrams: number;
  groth16PrecompileCostScriptUnits: number;
  gramsPerComputeBudgetUnit: number;
  scriptUnitsPerComputeBudgetUnit: number;
  freeScriptUnitsPerInput: number;
  /** allowedScriptUnits(computeBudget) = computeBudget * scriptUnitsPerComputeBudgetUnit + freeScriptUnitsPerInput */
  recommendedComputeBudget: number;
  recommendedComputeBudgetGrams: number;
  computeBudgetMax: number;
  requiredTransactionVersion: 1;
  sigOpCountRequirement: 0;
  maxStandardMass: bigint;
  consensusActivation: "KIP-16 (Toccata Hardfork)";
  scriptSource: typeof KASPA_WASM_ZK_BUILDER_CLAIM;
}

const HEX_RE = /^[0-9a-f]*$/;

function normalizeHex(value: unknown, what: string): string {
  if (typeof value !== "string") throw new Error(`${what}: expected a hex string`);
  const hex = value.trim().toLowerCase();
  if (hex.length % 2 !== 0 || !HEX_RE.test(hex)) throw new Error(`${what}: not a valid even-length hex string`);
  return hex;
}

/**
 * Tokenises a Kaspa txscript into opcodes and data pushes. Pure, no WASM. Returns an error instead
 * of a partial token list when a push runs past the end of the script.
 */
export function parseKaspaScript(scriptHex: string): { ops: KaspaScriptOp[]; error?: string } {
  let hex: string;
  try {
    hex = normalizeHex(scriptHex, "script");
  } catch (error: any) {
    return { ops: [], error: error.message };
  }
  const bytes = Buffer.from(hex, "hex");
  const ops: KaspaScriptOp[] = [];
  let i = 0;
  while (i < bytes.length) {
    const offset = i;
    const opcode = bytes[i] as number;
    i += 1;
    let dataLength = -1;
    let lengthBytes = 0;
    if (opcode <= 0x4b) {
      dataLength = opcode; // OP_0 pushes an empty item; OP_DATA_1..OP_DATA_75 push that many bytes
    } else if (opcode === 0x4c) {
      lengthBytes = 1;
    } else if (opcode === 0x4d) {
      lengthBytes = 2;
    } else if (opcode === 0x4e) {
      lengthBytes = 4;
    }
    if (lengthBytes > 0) {
      if (i + lengthBytes > bytes.length) {
        return { ops, error: `OP_PUSHDATA at offset ${offset} is missing its length bytes` };
      }
      dataLength = bytes.readUIntLE(i, lengthBytes);
      i += lengthBytes;
    }
    if (dataLength >= 0) {
      if (i + dataLength > bytes.length) {
        return {
          ops,
          error: `push of ${dataLength} bytes at offset ${offset} exceeds the script (only ${bytes.length - i} bytes remain)`
        };
      }
      ops.push({ offset, opcode, data: bytes.subarray(i, i + dataLength).toString("hex") });
      i += dataLength;
    } else {
      ops.push({ offset, opcode });
    }
  }
  return { ops };
}

/**
 * Extracts and compresses the Groth16 proof (128 bytes = 256 hex chars)
 * from a RISC Zero Borsh-encoded receipt using the pinned kaspa-wasm.
 */
export function prepareR0Groth16Proof(receiptHex: string): string {
  if (!receiptHex || typeof receiptHex !== "string") {
    throw new Error("Invalid receipt hex: expected a non-empty hex string");
  }
  let cleanHex: string;
  try {
    cleanHex = normalizeHex(receiptHex, "receipt");
  } catch (error: any) {
    throw new Error(`Failed to extract R0 Groth16 proof: ${error.message}`);
  }
  const kaspa = loadManagedKaspaWasmSync();
  try {
    const proof = kaspa.prepareR0Groth16Proof(cleanHex);
    if (!proof || proof.length !== 256) {
      throw new Error(
        `Extracted proof length mismatch: expected 256 hex characters (128 bytes), got ${proof?.length ?? 0}`
      );
    }
    return proof;
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract R0 Groth16 proof: ${msg}`);
  }
}

function emptyScriptsResult(
  imageId: string,
  journalHash: string,
  preparedProof: string,
  warnings: ZkIssue[],
  issues: ZkIssue[],
  bindingPolicy?: ZkOutputBindingPolicy
): R0Groth16ScriptsResult {
  const mode = bindingPolicy?.mode ?? "proof-only";
  return {
    ok: false,
    schema: HardkasSchemas.ZkToccataScriptsV1,
    imageId,
    journalHash,
    preparedProof,
    redeemScript: "",
    sigScript: "",
    fullSignatureScript: "",
    redeemScriptHash: "",
    p2shScriptPublicKey: { version: 0, script: "" },
    p2shAddresses: { simnet: "", testnet10: "", mainnet: "" },
    precompileOpcode: OP_ZK_PRECOMPILE,
    provingSystemTag: GROTH16_PROVING_SYSTEM_TAG,
    bindingMode: mode,
    ...(bindingPolicy ? { bindingPolicy } : {}),
    consensusEnforced: mode === "proof-and-output-bound",
    ...(bindingPolicy?.payout ? { boundPayoutAddress: bindingPolicy.payout.address, boundPayoutAmount: bindingPolicy.payout.amountSompi } : {}),
    experimental: true,
    warnings,
    issues
  };
}

/**
 * Builds the Kaspa Toccata P2SH redeem script (locking) and signature script (unlocking) for a
 * RISC Zero Groth16 receipt, through kaspa-wasm's ZkScriptBuilder.
 *
 * Known limit (audit L-04): the receipt's ReceiptClaim is pruned to a digest inside the Borsh
 * encoding, so the image id and journal hash given here CANNOT be cross-checked against the receipt
 * locally. A mismatching pair builds a script the node will never accept; `warnings` says so.
 */
export function buildR0Groth16Scripts(params: R0Groth16ScriptParams): R0Groth16ScriptsResult {
  const issues: ZkIssue[] = [];
  const warnings: ZkIssue[] = [
    {
      code: "ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED",
      message:
        "imageId and journalHash are not cross-checked against the receipt (its claim is a digest): the node decides. A wrong pair yields an unspendable P2SH address."
    }
  ];
  const imageId = typeof params.imageId === "string" ? params.imageId.trim().toLowerCase() : "";
  const journalHash = typeof params.journalHash === "string" ? params.journalHash.trim().toLowerCase() : "";
  const receiptHex = typeof params.receiptHex === "string" ? params.receiptHex.trim() : "";
  const bindingMode: ZkBindingMode = params.bindingPolicy?.mode ?? "proof-only";

  if (params.bindingPolicy?.mode === "proof-only") {
    warnings.push({
      code: "ZK_UNBOUND_OUTPUTS_POLICY",
      message:
        "proof-only mode does not enforce destination address or amount in the L1 consensus script. Anyone possessing the proof can construct a valid transaction redirecting the funds. Use proof-and-output-bound mode for secure payments."
    });
  }

  if (!/^[0-9a-f]{64}$/.test(imageId)) {
    issues.push({
      code: "ZK_INVALID_IMAGE_ID",
      message: `Invalid imageId: expected 64 hex characters (32 bytes), got '${imageId}'`
    });
  }
  if (!/^[0-9a-f]{64}$/.test(journalHash)) {
    issues.push({
      code: "ZK_INVALID_JOURNAL_HASH",
      message: `Invalid journalHash: expected 64 hex characters (32 bytes), got '${journalHash}'`
    });
  }

  let preparedProof = "";
  try {
    preparedProof = prepareR0Groth16Proof(receiptHex);
  } catch (error: any) {
    issues.push({
      code: "ZK_RECEIPT_EXTRACTION_FAILED",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const kaspa = loadManagedKaspaWasmSync();

  if (bindingMode === "proof-and-output-bound") {
    const policy = params.bindingPolicy!;
    if (!policy.payout?.address) {
      issues.push({
        code: "ZK_BINDING_POLICY_INVALID",
        message: "bindingPolicy.payout.address is required in proof-and-output-bound mode"
      });
    } else if (!kaspa.Address.validate(policy.payout.address)) {
      issues.push({
        code: "ZK_INVALID_DESTINATION_ADDRESS",
        message: `Invalid payout address in binding policy: '${policy.payout.address}'`
      });
    }
    if (typeof policy.payout?.amountSompi !== "bigint" || policy.payout.amountSompi <= 0n) {
      issues.push({
        code: "ZK_BINDING_POLICY_INVALID",
        message: "bindingPolicy.payout.amountSompi must be a positive bigint"
      });
    }
    if (policy.change) {
      if (!policy.change.address || !kaspa.Address.validate(policy.change.address)) {
        issues.push({
          code: "ZK_BINDING_POLICY_INVALID",
          message: `Invalid change address in binding policy: '${policy.change?.address}'`
        });
      }
      if (typeof policy.change.amountSompi !== "bigint" || policy.change.amountSompi <= 0n) {
        issues.push({
          code: "ZK_BINDING_POLICY_INVALID",
          message: "bindingPolicy.change.amountSompi must be a positive bigint"
        });
      }
    }
    if (policy.utxoBinding) {
      if (!/^[0-9a-fA-F]{64}$/.test(policy.utxoBinding.transactionId)) {
        issues.push({
          code: "ZK_BINDING_POLICY_INVALID",
          message: "bindingPolicy.utxoBinding.transactionId must be a 32-byte hex transaction id"
        });
      }
      if (!Number.isInteger(policy.utxoBinding.index) || policy.utxoBinding.index < 0) {
        issues.push({
          code: "ZK_BINDING_POLICY_INVALID",
          message: "bindingPolicy.utxoBinding.index must be a non-negative integer"
        });
      }
    }
  }

  if (issues.length > 0) return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues, params.bindingPolicy);

  try {
    let redeemScript = "";
    let sigScript = "";

    if (bindingMode === "proof-and-output-bound") {
      const policy = params.bindingPolicy!;
      const payoutAddr = new kaspa.Address(policy.payout.address);
      const payoutSpk = kaspa.payToAddressScript(payoutAddr);

      const zkBuilder = kaspa.ZkScriptBuilder.newR0();
      zkBuilder.appendR0Groth16Verifier(imageId);
      const zkPart = zkBuilder.drain();

      const sb = new kaspa.ScriptBuilder();
      sb.addOps(Buffer.from(zkPart, "hex"));
      sb.addOp(kaspa.Opcodes.OpVerify);

      const expectedOutputCount = policy.change ? 2n : 1n;
      sb.addOp(kaspa.Opcodes.OpTxOutputCount);
      sb.addI64(expectedOutputCount);
      sb.addOp(kaspa.Opcodes.OpEqualVerify);

      // Enforce output 0 recipient
      sb.addI64(0n);
      sb.addOp(kaspa.Opcodes.OpTxOutputSpk);
      sb.addData(Buffer.from(payoutSpk.script, "hex"));
      sb.addOp(kaspa.Opcodes.OpEqualVerify);

      // Enforce output 0 amount
      sb.addI64(0n);
      sb.addOp(kaspa.Opcodes.OpTxOutputAmount);
      sb.addI64(policy.payout.amountSompi);
      sb.addOp(kaspa.Opcodes.OpNumEqualVerify);

      // Enforce change output if configured
      if (policy.change) {
        const changeAddr = new kaspa.Address(policy.change.address);
        const changeSpk = kaspa.payToAddressScript(changeAddr);
        sb.addI64(1n);
        sb.addOp(kaspa.Opcodes.OpTxOutputSpk);
        sb.addData(Buffer.from(changeSpk.script, "hex"));
        sb.addOp(kaspa.Opcodes.OpEqualVerify);

        sb.addI64(1n);
        sb.addOp(kaspa.Opcodes.OpTxOutputAmount);
        sb.addI64(policy.change.amountSompi);
        sb.addOp(kaspa.Opcodes.OpNumEqualVerify);
      }

      // Enforce UTXO outpoint binding if configured
      if (policy.utxoBinding) {
        sb.addOp(kaspa.Opcodes.OpTxInputIndex);
        sb.addOp(kaspa.Opcodes.OpDup);
        sb.addOp(kaspa.Opcodes.OpOutpointTxId);
        sb.addData(Buffer.from(policy.utxoBinding.transactionId, "hex"));
        sb.addOp(kaspa.Opcodes.OpEqualVerify);

        sb.addOp(kaspa.Opcodes.OpOutpointIndex);
        sb.addI64(BigInt(policy.utxoBinding.index));
        sb.addOp(kaspa.Opcodes.OpEqualVerify);
      }

      sb.addOp(kaspa.Opcodes.OpTrue);
      redeemScript = String(sb.drain()).toLowerCase();

      const sigBuilder = new kaspa.ScriptBuilder();
      sigBuilder.addData(Buffer.from(journalHash, "hex"));
      sigBuilder.addData(Buffer.from(preparedProof, "hex"));
      sigBuilder.addData(Buffer.from(redeemScript, "hex"));
      sigScript = String(sigBuilder.drain()).toLowerCase();
    } else {
      const builder = kaspa.ZkScriptBuilder.newR0();
      builder.commitToGroth16(imageId);
      const finalized = builder.finalizeWithGroth16Proof(receiptHex.toLowerCase(), journalHash);
      redeemScript = String(finalized.redeemScript).toLowerCase();
      sigScript = String(finalized.sigScript).toLowerCase();
    }

    const spk = kaspa.payToScriptHashScript(redeemScript);
    const fullSignatureScript = sigScript;
    const redeemScriptHash =
      spk.script.startsWith("aa20") && spk.script.endsWith("87") ? spk.script.slice(4, -2) : "";

    const simnetAddr = kaspa.addressFromScriptPublicKey(spk, "simnet")?.toString() ?? "";
    const testnet10Addr = kaspa.addressFromScriptPublicKey(spk, "testnet-10")?.toString() ?? "";
    const mainnetAddr = kaspa.addressFromScriptPublicKey(spk, "mainnet")?.toString() ?? "";

    const structural = verifyR0Groth16Scripts({
      redeemScript,
      sigScript,
      imageId,
      journalHash,
      expectedBindingMode: bindingMode,
      ...(params.bindingPolicy?.payout ? {
        expectedPayoutAddress: params.bindingPolicy.payout.address,
        expectedPayoutAmount: params.bindingPolicy.payout.amountSompi
      } : {})
    });
    if (!structural.ok) {
      issues.push({
        code: "ZK_REDEEM_SCRIPT_INVALID_STRUCTURE",
        message: `Built scripts failed structural verification: ${structural.issues.map((i) => i.code).join(", ")}`
      });
    }

    return {
      ok: issues.length === 0,
      schema: HardkasSchemas.ZkToccataScriptsV1,
      imageId,
      journalHash,
      preparedProof,
      redeemScript,
      sigScript,
      fullSignatureScript,
      redeemScriptHash,
      p2shScriptPublicKey: { version: spk.version, script: spk.script },
      p2shAddresses: { simnet: simnetAddr, testnet10: testnet10Addr, mainnet: mainnetAddr },
      precompileOpcode: OP_ZK_PRECOMPILE,
      provingSystemTag: GROTH16_PROVING_SYSTEM_TAG,
      bindingMode,
      ...(params.bindingPolicy ? { bindingPolicy: params.bindingPolicy } : {}),
      consensusEnforced: bindingMode === "proof-and-output-bound",
      ...(params.bindingPolicy?.payout ? {
        boundPayoutAddress: params.bindingPolicy.payout.address,
        boundPayoutAmount: params.bindingPolicy.payout.amountSompi
      } : {}),
      experimental: true,
      warnings,
      issues
    };
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    issues.push({
      code: "ZK_SCRIPT_BUILD_FAILED",
      message: `Failed to build R0 Groth16 scripts: ${msg}`
    });
    return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues, params.bindingPolicy);
  }
}

function emptyTxResult(
  feeEstimate: ToccataZkFeeEstimate,
  computeBudget: number,
  feeSompi: bigint,
  destinationAddress: string,
  networkId: "simnet" | "testnet-10" | "mainnet",
  warnings: ZkIssue[],
  issues: ZkIssue[],
  bindingMode: ZkBindingMode = "proof-only"
): R0Groth16TxResult {
  return {
    ok: false,
    schema: HardkasSchemas.ZkToccataTxV1,
    transaction: null,
    transactionId: "",
    mass: 0n,
    computeMass: feeEstimate.computeMass,
    feeEstimate,
    standardMaxMass: STANDARD_MAX_TRANSACTION_MASS,
    withinStandardMaxMass: false,
    computeBudget,
    txVersion: 1,
    feeSompi,
    destinationAddress,
    networkId,
    bindingMode,
    consensusEnforced: bindingMode === "proof-and-output-bound",
    experimental: true,
    warnings,
    issues
  };
}

/**
 * Builds a TxPlanArtifact (hardkas.txPlan.v1) for a Toccata ZK Groth16 spend.
 * Integrates ZK transactions directly into HardKAS's deterministic plan pipeline.
 */
export function buildR0Groth16Plan(params: BuildR0Groth16TxParams): TxPlanArtifact {
  const computeBudget = params.computeBudget ?? DEFAULT_ZK_COMPUTE_BUDGET;
  const feeEstimate = estimateToccataZkFee(computeBudget, REFERENCE_BASE_COMPUTE_MASS, params.feeOptions);
  const feeSompi = params.feeSompi ?? feeEstimate.recommendedSompi;
  const spkHex = params.scripts.p2shScriptPublicKey
    ? `${Number(params.scripts.p2shScriptPublicKey.version).toString(16).padStart(4, "0")}${params.scripts.p2shScriptPublicKey.script}`
    : "0008" + "00".repeat(32);
  const netKey = (params.networkId ?? "simnet") as "simnet" | "testnet-10" | "mainnet";
  const p2shAddress =
    (netKey === "testnet-10" ? params.scripts.p2shAddresses?.testnet10 : params.scripts.p2shAddresses?.[netKey]) ||
    params.scripts.p2shAddresses?.simnet ||
    "kaspasim:p2sh_zk_placeholder";
  const outputAmount = params.utxo.amountSompi > feeSompi ? params.utxo.amountSompi - feeSompi : 0n;

  return createV1TxPlanArtifact({
    networkId: (params.networkId ?? "simnet") as any,
    mode: "rpc",
    from: { input: p2shAddress, address: p2shAddress },
    to: { input: params.destinationAddress, address: params.destinationAddress },
    amountSompi: outputAmount,
    body: {
      txVersion: 1,
      inputs: [
        {
          outpoint: { transactionId: params.utxo.transactionId, index: params.utxo.index },
          amountSompi: String(params.utxo.amountSompi),
          address: p2shAddress,
          scriptPublicKey: spkHex,
          kind: "p2sh",
          computeBudget
        }
      ],
      outputs: [
        {
          address: params.destinationAddress,
          amountSompi: String(outputAmount),
          role: "payment"
        }
      ],
      estimatedFeeSompi: String(feeSompi),
      estimatedMass: String(feeEstimate.computeMass),
      storageMass: "0",
      maxFeeSompi: String(
        params.feeOptions?.maxFeeSompi ??
        (feeSompi > DEFAULT_MAX_FEE_CAP_SOMPI ? feeSompi : DEFAULT_MAX_FEE_CAP_SOMPI)
      )
    },
    ctx: systemRuntimeContext,
    purpose: "ZK Groth16 spend"
  }) as any;
}

/**
 * Builds (does not sign or broadcast) a version-1 transaction spending a P2SH UTXO locked by a
 * RISC Zero Groth16 covenant. The compute budget must be a u16; the fee is derived from the mass
 * kaspa-wasm reports for the real transaction plus the compute-budget term.
 */
export function buildR0Groth16Transaction(params: BuildR0Groth16TxParams): R0Groth16TxResult {
  const issues: ZkIssue[] = [];
  const warnings: ZkIssue[] = [];
  const networkId = params.networkId ?? "simnet";
  const computeBudget = params.computeBudget ?? DEFAULT_ZK_COMPUTE_BUDGET;
  const destinationAddress = String(params.destinationAddress ?? "").trim();
  const bindingMode = params.scripts?.bindingMode ?? "proof-only";
  const bindingPolicy = params.scripts?.bindingPolicy;

  if (params.scripts?.bindingPolicy?.mode === "proof-only") {
    warnings.push({
      code: "ZK_TRANSACTION_OUTPUTS_UNBOUND",
      message:
        "Transaction was built from a proof-only script: the consensus script does NOT bind destination address or amount. Funds can be redirected by anyone possessing the proof."
    });
  }

  if (!isValidComputeBudget(computeBudget)) {
    issues.push({
      code: "ZK_COMPUTE_BUDGET_OUT_OF_RANGE",
      message: `computeBudget must be an integer in [0, ${COMPUTE_BUDGET_MAX}] (u16), got ${String(computeBudget)}`
    });
    const estimate = estimateToccataZkFee(DEFAULT_ZK_COMPUTE_BUDGET, REFERENCE_BASE_COMPUTE_MASS, params.feeOptions);
    const empty = emptyTxResult(estimate, Number(computeBudget), params.feeSompi ?? 0n, destinationAddress, networkId, warnings, issues);
    empty.bindingMode = bindingMode;
    empty.consensusEnforced = bindingMode === "proof-and-output-bound";
    return empty;
  }
  if (networkId === "mainnet") {
    warnings.push({
      code: "ZK_MAINNET_BUILD_UNGUARDED",
      message:
        "Transaction built for mainnet. This tool never broadcasts; mainnet broadcasting is governed by the send guards (BLOCKED_BY_POLICY)."
    });
  }

  const kaspa = loadManagedKaspaWasmSync();
  if (!kaspa.Address.validate(destinationAddress)) {
    issues.push({
      code: "ZK_INVALID_DESTINATION_ADDRESS",
      message: `Invalid destination address: '${destinationAddress}'`
    });
  } else {
    const expectedPrefix = networkId === "mainnet" ? "kaspa:" : networkId === "testnet-10" ? "kaspatest:" : "kaspasim:";
    if (!destinationAddress.toLowerCase().startsWith(expectedPrefix)) {
      issues.push({
        code: "ZK_DESTINATION_NETWORK_MISMATCH",
        message: `Destination address '${destinationAddress}' does not belong to network '${networkId}' (expected prefix '${expectedPrefix}')`
      });
    }
  }
  if (!params.scripts?.ok || !params.scripts.sigScript) {
    issues.push({ code: "ZK_SCRIPTS_INVALID", message: "params.scripts must be a successful buildR0Groth16Scripts result" });
  }

  // Cross-check consensus binding policy if script is bound
  if (bindingMode === "proof-and-output-bound" && bindingPolicy) {
    if (destinationAddress.toLowerCase() !== bindingPolicy.payout.address.toLowerCase()) {
      issues.push({
        code: "ZK_BINDING_DESTINATION_MISMATCH",
        message: `Specified destinationAddress '${destinationAddress}' does not match the covenant's consensus-bound payout address '${bindingPolicy.payout.address}'`
      });
    }
    if (bindingPolicy.utxoBinding) {
      const expectedTxId = bindingPolicy.utxoBinding.transactionId.toLowerCase();
      const actualTxId = String(params.utxo?.transactionId ?? "").toLowerCase();
      if (expectedTxId !== actualTxId || bindingPolicy.utxoBinding.index !== params.utxo?.index) {
        issues.push({
          code: "ZK_BINDING_UTXO_MISMATCH",
          message: `Spent UTXO ${params.utxo?.transactionId}:${params.utxo?.index} does not match the covenant's bound outpoint ${bindingPolicy.utxoBinding.transactionId}:${bindingPolicy.utxoBinding.index}`
        });
      }
    }
  }

  if (issues.length > 0) {
    const estimate = estimateToccataZkFee(computeBudget, REFERENCE_BASE_COMPUTE_MASS, params.feeOptions);
    const empty = emptyTxResult(estimate, computeBudget, params.feeSompi ?? estimate.recommendedSompi, destinationAddress, networkId, warnings, issues);
    empty.bindingMode = bindingMode;
    empty.consensusEnforced = bindingMode === "proof-and-output-bound";
    return empty;
  }

  const makeTx = (fee: bigint) => {
    const destAddr = new kaspa.Address(destinationAddress);
    const destSpk = kaspa.payToAddressScript(destAddr);
    const utxoOutpoint = { transactionId: params.utxo.transactionId, index: params.utxo.index };
    const spk = params.scripts.p2shScriptPublicKey;
    const utxoEntry = {
      outpoint: utxoOutpoint,
      amount: params.utxo.amountSompi,
      scriptPublicKey: new kaspa.ScriptPublicKey(spk.version, spk.script),
      blockDaaScore: 0n,
      isCoinbase: false
    };

    const outputs: any[] = [];
    if (bindingMode === "proof-and-output-bound" && bindingPolicy?.change) {
      outputs.push({
        value: bindingPolicy.payout.amountSompi,
        scriptPublicKey: new kaspa.ScriptPublicKey(destSpk.version, destSpk.script)
      });
      const changeAddr = new kaspa.Address(bindingPolicy.change.address);
      const changeSpk = kaspa.payToAddressScript(changeAddr);
      outputs.push({
        value: bindingPolicy.change.amountSompi,
        scriptPublicKey: new kaspa.ScriptPublicKey(changeSpk.version, changeSpk.script)
      });
    } else {
      const outputAmount = bindingMode === "proof-and-output-bound" && bindingPolicy
        ? bindingPolicy.payout.amountSompi
        : params.utxo.amountSompi - fee;
      outputs.push({
        value: outputAmount,
        scriptPublicKey: new kaspa.ScriptPublicKey(destSpk.version, destSpk.script)
      });
    }

    return new kaspa.Transaction({
      version: 1,
      inputs: [
        {
          previousOutpoint: utxoOutpoint,
          signatureScript: params.scripts.sigScript,
          sequence: 0n,
          sigOpCount: 0,
          computeBudget,
          utxo: utxoEntry
        }
      ],
      outputs,
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });
  };

  try {
    const probe = makeTx(0n);
    const mass: bigint = kaspa.calculateTransactionMass(networkId, probe);
    const feeEstimate = estimateToccataZkFee(computeBudget, mass, params.feeOptions);

    let feeSompi: bigint;
    if (bindingMode === "proof-and-output-bound" && bindingPolicy) {
      const requiredPayoutTotal = bindingPolicy.payout.amountSompi + (bindingPolicy.change?.amountSompi ?? 0n);
      if (params.utxo.amountSompi <= requiredPayoutTotal) {
        issues.push({
          code: "ZK_INSUFFICIENT_INPUT_AMOUNT",
          message: `UTXO amount ${params.utxo.amountSompi} sompi is insufficient to cover covenant payout total of ${requiredPayoutTotal} sompi plus transaction fee`
        });
        return emptyTxResult(feeEstimate, computeBudget, 0n, destinationAddress, networkId, warnings, issues, bindingMode);
      }
      feeSompi = params.utxo.amountSompi - requiredPayoutTotal;
      if (params.feeSompi !== undefined && params.feeSompi !== feeSompi) {
        issues.push({
          code: "ZK_BINDING_AMOUNT_MISMATCH",
          message: `Specified feeSompi (${params.feeSompi}) does not match the covenant's implied fee (${feeSompi} sompi: UTXO ${params.utxo.amountSompi} - payout total ${requiredPayoutTotal})`
        });
        return emptyTxResult(feeEstimate, computeBudget, feeSompi, destinationAddress, networkId, warnings, issues, bindingMode);
      }
    } else {
      feeSompi = params.feeSompi ?? feeEstimate.recommendedSompi;
    }

    if (feeSompi < feeEstimate.minimumRequiredSompi) {
      warnings.push({
        code: "ZK_FEE_BELOW_MEMPOOL_MINIMUM",
        message: `Fee of ${feeSompi} sompi is below the standard mempool minimum of ${feeEstimate.minimumRequiredSompi} sompi for compute mass ${feeEstimate.computeMass}`
      });
    }
    if (params.feeSompi === undefined && feeEstimate.cappedBelowMinimum) {
      warnings.push({
        code: "ZK_FEE_CAP_BELOW_MINIMUM",
        message: `The fee cap (${feeEstimate.recommendedSompi} sompi) is below the mempool minimum of ${feeEstimate.minimumRequiredSompi} sompi: the node will reject this transaction as non-standard`
      });
    }
    if (params.utxo.amountSompi <= feeSompi) {
      issues.push({
        code: "ZK_INSUFFICIENT_INPUT_AMOUNT",
        message: `UTXO amount ${params.utxo.amountSompi} sompi is insufficient to cover fee of ${feeSompi} sompi`
      });
      return emptyTxResult(feeEstimate, computeBudget, feeSompi, destinationAddress, networkId, warnings, issues, bindingMode);
    }

    const tx = makeTx(feeSompi);
    const withinStandardMaxMass = mass <= STANDARD_MAX_TRANSACTION_MASS;
    if (mass > STANDARD_MAX_TRANSACTION_MASS) {
      issues.push({
        code: "ZK_TX_EXCEEDS_MAX_STANDARD_MASS",
        message: `Transaction mass ${mass} exceeds standard max mass ${STANDARD_MAX_TRANSACTION_MASS}`
      });
    }

    let planArtifact: any;
    let planArtifactId: string | undefined;
    try {
      planArtifact = buildR0Groth16Plan({
        ...params,
        feeSompi
      });
      const planIdCheck = checkArtifactIdentity(planArtifact);
      planArtifactId = planIdCheck.ok ? planIdCheck.artifactId : undefined;
    } catch {
      // Ignore plan generation failures so tx building succeeds
    }
    const finalOutputAmount = params.utxo.amountSompi - feeSompi;

    let zkFact: ZkVerificationFact | undefined;
    try {
      const vkHash = params.scripts.imageId
        ? sha256Hex(params.scripts.imageId)
        : "00".repeat(32);
      const rawJournal = params.scripts.journalHash ?? "";
      const journalHash = rawJournal.startsWith("0x") ? rawJournal.slice(2) : rawJournal;
      const rawProof = typeof params.scripts.preparedProof === "string" ? params.scripts.preparedProof : "";
      const proofHash = rawProof ? sha256Hex(rawProof) : "00".repeat(32);
      const redeemHash = params.scripts.redeemScriptHash || sha256Hex(params.scripts.redeemScript || "");
      const netKey = (networkId ?? "simnet") as "simnet" | "testnet-10" | "mainnet";
      const p2shAddress =
        (netKey === "testnet-10" ? params.scripts.p2shAddresses?.testnet10 : params.scripts.p2shAddresses?.[netKey]) ||
        params.scripts.p2shAddresses?.simnet ||
        "kaspasim:p2sh_zk_placeholder";

      zkFact = createZkVerificationFactArtifact({
        networkId,
        provingSystem: "Groth16",
        curve: "BN254",
        guestSystem: "RISC Zero",
        imageId: vkHash.padEnd(64, "0").slice(0, 64),
        journalHash: (journalHash || "00".repeat(32)).padEnd(64, "0").slice(0, 64),
        proofSha256: proofHash.padEnd(64, "0").slice(0, 64),
        verifiedOffChain: params.mathVerified ?? false,
        spendUtxo: {
          transactionId: params.utxo.transactionId,
          index: params.utxo.index,
          amountSompi: String(params.utxo.amountSompi)
        },
        p2shAddress,
        redeemScriptHash: redeemHash.padEnd(64, "0").slice(0, 64),
        payoutAddress: destinationAddress,
        payoutSompi: String(finalOutputAmount),
        computeBudget,
        feeSompi: String(feeSompi),
        txId: String(tx.id),
        ...(planArtifactId ? { planArtifactId } : {})
      });
    } catch {
      // Ignore fact creation errors to avoid breaking tx building
    }

    return {
      ok: issues.length === 0,
      schema: HardkasSchemas.ZkToccataTxV1,
      transaction: tx,
      transactionId: tx.id,
      mass,
      computeMass: feeEstimate.computeMass,
      feeEstimate,
      standardMaxMass: STANDARD_MAX_TRANSACTION_MASS,
      withinStandardMaxMass,
      computeBudget,
      txVersion: 1,
      feeSompi,
      destinationAddress,
      networkId,
      bindingMode,
      consensusEnforced: bindingMode === "proof-and-output-bound",
      experimental: true,
      warnings,
      issues,
      planArtifact,
      zkFact
    };
  } catch (error: any) {
    const msg = error instanceof Error ? error.message : String(error);
    issues.push({
      code: "ZK_TX_BUILD_FAILED",
      message: `Failed to build R0 Groth16 transaction: ${msg}`
    });
    const estimate = estimateToccataZkFee(computeBudget, REFERENCE_BASE_COMPUTE_MASS, params.feeOptions);
    const empty = emptyTxResult(estimate, computeBudget, params.feeSompi ?? estimate.recommendedSompi, destinationAddress, networkId, warnings, issues);
    empty.bindingMode = bindingMode;
    empty.consensusEnforced = bindingMode === "proof-and-output-bound";
    return empty;
  }
}

/**
 * Structural verification of RISC Zero Groth16 redeem and signature scripts by opcode parsing
 * (audit M-03 replaced the substring heuristics). It proves shape, not spendability: only the node
 * runs the precompile.
 */
export function verifyR0Groth16Scripts(
  params: R0Groth16VerifyScriptsParams
): R0Groth16VerifyScriptsResult {
  const issues: ZkIssue[] = [];
  const redeemHex = typeof params.redeemScript === "string" ? params.redeemScript.trim().toLowerCase() : "";
  const sigHex = typeof params.sigScript === "string" ? params.sigScript.trim().toLowerCase() : "";

  const redeem = parseKaspaScript(redeemHex);
  const sig = parseKaspaScript(sigHex);
  if (redeem.error) issues.push({ code: "ZK_SCRIPT_PARSE_ERROR", message: `redeemScript: ${redeem.error}` });
  if (sig.error) issues.push({ code: "ZK_SCRIPT_PARSE_ERROR", message: `sigScript: ${sig.error}` });

  const ops = redeem.ops;
  const zkPrecompileIndex = ops.findIndex(
    (op, idx) => op.opcode === 0xa6 && idx > 0 && ops[idx - 1]!.opcode === 0x01 && ops[idx - 1]!.data === "20"
  );
  const hasOpZkPrecompile = zkPrecompileIndex !== -1;
  const hasGroth16Tag = hasOpZkPrecompile;

  if (!hasOpZkPrecompile) {
    issues.push({
      code: "ZK_MISSING_PRECOMPILE_OPCODE",
      message: "Redeem script does not contain OpZkPrecompile (0xa6) preceded by Groth16 tag (0x20)"
    });
  }

  const isBoundMode = zkPrecompileIndex !== -1 && zkPrecompileIndex < ops.length - 1;
  const bindingMode: ZkBindingMode = isBoundMode ? "proof-and-output-bound" : "proof-only";
  let hasOutputIntrospection = false;
  let enforcesOutputCount = false;
  let enforcesPayoutSpk = false;
  let enforcesPayoutAmount = false;
  let enforcesUtxoBinding = false;
  let boundPayoutSpk: string | undefined;
  let boundPayoutAmount: bigint | undefined;

  if (isBoundMode) {
    const afterZk = ops.slice(zkPrecompileIndex + 1);
    const hasVerifyAfterZk = afterZk.length > 0 && afterZk[0]!.opcode === 0x69; // OpVerify
    if (!hasVerifyAfterZk) {
      issues.push({
        code: "ZK_BINDING_MISSING_VERIFY",
        message: "OpZkPrecompile in bound mode must be immediately followed by OpVerify (0x69)"
      });
    }

    const outputCountIdx = ops.findIndex((op) => op.opcode === 0xb4);
    if (outputCountIdx !== -1) enforcesOutputCount = true;

    const outputSpkIdx = ops.findIndex((op) => op.opcode === 0xc3);
    if (outputSpkIdx !== -1 && outputSpkIdx + 1 < ops.length && ops[outputSpkIdx + 1]!.data) {
      enforcesPayoutSpk = true;
      boundPayoutSpk = ops[outputSpkIdx + 1]!.data;
    }

    const outputAmountIdx = ops.findIndex((op) => op.opcode === 0xc2);
    if (outputAmountIdx !== -1 && outputAmountIdx + 1 < ops.length && ops[outputAmountIdx + 1]!.data) {
      enforcesPayoutAmount = true;
      const dataHex = ops[outputAmountIdx + 1]!.data!;
      const buf = Buffer.from(dataHex, "hex");
      let val = 0n;
      for (let b = buf.length - 1; b >= 0; b--) {
        val = (val << 8n) | BigInt(b === buf.length - 1 ? buf[b]! & 0x7f : buf[b]!);
      }
      boundPayoutAmount = (buf[buf.length - 1]! & 0x80) !== 0 ? -val : val;
    }

    const outpointTxIdIdx = ops.findIndex((op) => op.opcode === 0xba);
    if (outpointTxIdIdx !== -1) enforcesUtxoBinding = true;

    hasOutputIntrospection = enforcesOutputCount && enforcesPayoutSpk && enforcesPayoutAmount;
  }

  if (params.expectedBindingMode && params.expectedBindingMode !== bindingMode) {
    issues.push({
      code: "ZK_BINDING_MODE_MISMATCH",
      message: `Expected script binding mode '${params.expectedBindingMode}' but script is '${bindingMode}'`
    });
  }

  if (params.expectedPayoutAddress && boundPayoutSpk) {
    try {
      const kaspa = loadManagedKaspaWasmSync();
      const expectedAddr = new kaspa.Address(params.expectedPayoutAddress);
      const expectedSpk = kaspa.payToAddressScript(expectedAddr);
      if (boundPayoutSpk.toLowerCase() !== expectedSpk.script.toLowerCase()) {
        issues.push({
          code: "ZK_BOUND_PAYOUT_SPK_MISMATCH",
          message: `Script binds SPK '${boundPayoutSpk}' which does not match expected address '${params.expectedPayoutAddress}' (${expectedSpk.script})`
        });
      }
    } catch (e: any) {
      issues.push({
        code: "ZK_EXPECTED_ADDRESS_INVALID",
        message: `Invalid expected payout address: ${e?.message ?? String(e)}`
      });
    }
  }

  if (params.expectedPayoutAmount !== undefined && boundPayoutAmount !== undefined) {
    if (boundPayoutAmount !== params.expectedPayoutAmount) {
      issues.push({
        code: "ZK_BOUND_PAYOUT_AMOUNT_MISMATCH",
        message: `Script binds payout amount ${boundPayoutAmount} sompi which does not match expected ${params.expectedPayoutAmount} sompi`
      });
    }
  }

  const redeemPushes = ops.filter((op) => op.data !== undefined).map((op) => op.data as string);
  const sigPushes = sig.ops.filter((op) => op.data !== undefined).map((op) => op.data as string);
  const largestRedeemPushBytes = redeemPushes.reduce((max, d) => Math.max(max, d.length / 2), 0);
  const proofPushFound = sigPushes.some((d) => d.length === 256);
  if (!sig.error && !proofPushFound) {
    issues.push({
      code: "ZK_MISSING_PROOF_PUSH",
      message: "Signature script has no 128-byte push (compressed Groth16 proof)"
    });
  }
  const redeemScriptEmbedded =
    !sig.error && sigPushes.length > 0 && redeemHex.length > 0 && sigPushes[sigPushes.length - 1] === redeemHex;
  if (!sig.error && !redeemScriptEmbedded) {
    issues.push({
      code: "ZK_REDEEM_SCRIPT_NOT_EMBEDDED",
      message: "Signature script's last push is not the redeem script (P2SH spend shape)"
    });
  }
  if (!sig.error && sig.ops.some((op) => op.data === undefined)) {
    issues.push({
      code: "ZK_SIG_SCRIPT_NOT_PUSH_ONLY",
      message: "Signature script contains non-push opcodes"
    });
  }

  let imageIdFound: boolean | undefined;
  if (params.imageId) {
    const targetImageId = params.imageId.trim().toLowerCase();
    imageIdFound = redeemPushes.some((d) => d === targetImageId);
    if (!imageIdFound) {
      issues.push({
        code: "ZK_IMAGE_ID_MISMATCH",
        message: `Image ID '${targetImageId}' is not pushed as a 32-byte item in the redeem script`
      });
    }
  }

  let journalHashFound: boolean | undefined;
  if (params.journalHash) {
    const targetJournalHash = params.journalHash.trim().toLowerCase();
    journalHashFound = sigPushes.some((d) => d === targetJournalHash);
    if (!journalHashFound) {
      issues.push({
        code: "ZK_JOURNAL_HASH_MISMATCH",
        message: `Journal hash '${targetJournalHash}' is not pushed as a 32-byte item in the signature script`
      });
    }
  }

  return {
    ok: issues.length === 0,
    hasOpZkPrecompile,
    hasGroth16Tag,
    redeemScriptLength: redeemHex.length / 2,
    sigScriptLength: sigHex.length / 2,
    redeemOps: ops.length,
    sigOps: sig.ops.length,
    proofPushFound,
    redeemScriptEmbedded,
    largestRedeemPushBytes,
    ...(imageIdFound !== undefined ? { imageIdFound } : {}),
    ...(journalHashFound !== undefined ? { journalHashFound } : {}),
    bindingMode,
    consensusEnforced: isBoundMode && hasOutputIntrospection,
    hasOutputIntrospection,
    enforcesOutputCount,
    enforcesPayoutSpk,
    enforcesPayoutAmount,
    enforcesUtxoBinding,
    ...(boundPayoutSpk ? { boundPayoutSpk } : {}),
    ...(boundPayoutAmount !== undefined ? { boundPayoutAmount } : {}),
    issues
  };
}

/**
 * The consensus / pricing facts HardKAS relies on, with their upstream sources.
 */
export function getToccataPrecompileRules(): ToccataPrecompileRules {
  return {
    opcode: OP_ZK_PRECOMPILE,
    opcodeName: "OpZkPrecompile",
    tag: GROTH16_PROVING_SYSTEM_TAG,
    curve: "BN254",
    proofFormat: "Arkworks Compressed (128 bytes: G1[32] + G2[64] + G1[32])",
    groth16PrecompileCostGrams: Number(GROTH16_PRECOMPILE_COST_GRAMS),
    groth16PrecompileCostScriptUnits: Number(GROTH16_PRECOMPILE_COST_SCRIPT_UNITS),
    gramsPerComputeBudgetUnit: Number(GRAMS_PER_COMPUTE_BUDGET_UNIT),
    scriptUnitsPerComputeBudgetUnit: Number(SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT),
    freeScriptUnitsPerInput: Number(FREE_SCRIPT_UNITS_PER_INPUT),
    recommendedComputeBudget: DEFAULT_ZK_COMPUTE_BUDGET,
    recommendedComputeBudgetGrams: DEFAULT_ZK_COMPUTE_BUDGET * Number(GRAMS_PER_COMPUTE_BUDGET_UNIT),
    computeBudgetMax: COMPUTE_BUDGET_MAX,
    requiredTransactionVersion: 1,
    sigOpCountRequirement: 0,
    maxStandardMass: STANDARD_MAX_TRANSACTION_MASS,
    consensusActivation: "KIP-16 (Toccata Hardfork)",
    scriptSource: KASPA_WASM_ZK_BUILDER_CLAIM
  };
}

/**
 * Observes a Toccata ZK transaction using HardKAS's common TxObserver pipeline and
 * derives both the base transaction status and the unified ZK operation status.
 */
export async function observeZkSpendOnce(
  client: KaspaRpcClient,
  params: {
    readonly txId: string;
    readonly zkFact?: ZkVerificationFact | undefined;
    readonly observerId?: string | undefined;
    readonly networkId?: TxObservation["networkId"] | undefined;
    readonly mode?: TxObservation["mode"] | undefined;
  }
): Promise<{
  readonly observation: TxObservation;
  readonly derivedStatus: DerivedTxStatus;
  readonly zkStatus?: ZkOperationStatusResult | undefined;
}> {
  const recorder = rpcObserverFor(client);
  const defaultObserverId = "obs_" + sha256Hex("zk-toccata-observer");
  const observation = await observeTxOnce(
    recorder,
    {
      txId: params.txId,
      observerId: params.observerId ?? defaultObserverId,
      networkId: params.networkId ?? "simnet",
      mode: params.mode ?? "rpc"
    },
    systemRuntimeContext
  );
  const derivedStatus = deriveTxStatus({
    txId: params.txId,
    observations: [observation]
  });
  const zkStatus = params.zkFact
    ? deriveZkOperationStatus({
        zkFact: params.zkFact,
        txStatus: derivedStatus
      })
    : undefined;

  return {
    observation,
    derivedStatus,
    ...(zkStatus ? { zkStatus } : {})
  };
}
