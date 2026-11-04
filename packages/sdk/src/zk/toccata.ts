import { createHash } from "node:crypto";
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

export interface R0Groth16ScriptParams {
  imageId: string;
  journalHash: string;
  receiptHex: string;
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
  imageId?: string;
  journalHash?: string;
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
  issues: ZkIssue[]
): R0Groth16ScriptsResult {
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

  if (issues.length > 0) return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues);

  const kaspa = loadManagedKaspaWasmSync();
  try {
    const builder = kaspa.ZkScriptBuilder.newR0();
    builder.commitToGroth16(imageId);
    const finalized = builder.finalizeWithGroth16Proof(receiptHex.toLowerCase(), journalHash);

    const redeemScript = String(finalized.redeemScript).toLowerCase();
    const sigScript = String(finalized.sigScript).toLowerCase();
    const spk = kaspa.payToScriptHashScript(redeemScript);

    // finalizeWithGroth16Proof already returns the complete P2SH scriptSig
    // ([push journalHash] [push proof] [push redeemScript]); appending the redeem script again
    // through payToScriptHashSignatureScript would double-push it.
    const fullSignatureScript = sigScript;

    const redeemScriptHash =
      spk.script.startsWith("aa20") && spk.script.endsWith("87") ? spk.script.slice(4, -2) : "";

    const simnetAddr = kaspa.addressFromScriptPublicKey(spk, "simnet")?.toString() ?? "";
    const testnet10Addr = kaspa.addressFromScriptPublicKey(spk, "testnet-10")?.toString() ?? "";
    const mainnetAddr = kaspa.addressFromScriptPublicKey(spk, "mainnet")?.toString() ?? "";

    const structural = verifyR0Groth16Scripts({ redeemScript, sigScript, imageId, journalHash });
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
    return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues);
  }
}

function emptyTxResult(
  feeEstimate: ToccataZkFeeEstimate,
  computeBudget: number,
  feeSompi: bigint,
  destinationAddress: string,
  networkId: "simnet" | "testnet-10" | "mainnet",
  warnings: ZkIssue[],
  issues: ZkIssue[]
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
      maxFeeSompi: String(params.feeOptions?.maxFeeSompi ?? DEFAULT_MAX_FEE_CAP_SOMPI)
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

  if (!isValidComputeBudget(computeBudget)) {
    issues.push({
      code: "ZK_COMPUTE_BUDGET_OUT_OF_RANGE",
      message: `computeBudget must be an integer in [0, ${COMPUTE_BUDGET_MAX}] (u16), got ${String(computeBudget)}`
    });
    const estimate = estimateToccataZkFee(DEFAULT_ZK_COMPUTE_BUDGET, REFERENCE_BASE_COMPUTE_MASS, params.feeOptions);
    return emptyTxResult(estimate, Number(computeBudget), params.feeSompi ?? 0n, destinationAddress, networkId, warnings, issues);
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
  if (issues.length > 0) {
    const estimate = estimateToccataZkFee(computeBudget, REFERENCE_BASE_COMPUTE_MASS, params.feeOptions);
    return emptyTxResult(estimate, computeBudget, params.feeSompi ?? estimate.recommendedSompi, destinationAddress, networkId, warnings, issues);
  }

  const makeTx = (fee: bigint) => {
    const destAddr = new kaspa.Address(destinationAddress);
    const destSpk = kaspa.payToAddressScript(destAddr);
    const outputAmount = params.utxo.amountSompi - fee;
    const utxoOutpoint = { transactionId: params.utxo.transactionId, index: params.utxo.index };
    const spk = params.scripts.p2shScriptPublicKey;
    const utxoEntry = {
      outpoint: utxoOutpoint,
      amount: params.utxo.amountSompi,
      scriptPublicKey: new kaspa.ScriptPublicKey(spk.version, spk.script),
      blockDaaScore: 0n,
      isCoinbase: false
    };
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
      outputs: [
        {
          value: outputAmount,
          scriptPublicKey: new kaspa.ScriptPublicKey(destSpk.version, destSpk.script)
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: "",
      storageMass: 0n
    });
  };

  try {
    // Pass 1: measure the real non-contextual mass (the output value is 8 bytes whatever the fee).
    const probe = makeTx(0n);
    const mass: bigint = kaspa.calculateTransactionMass(networkId, probe);
    const feeEstimate = estimateToccataZkFee(computeBudget, mass, params.feeOptions);
    const feeSompi = params.feeSompi ?? feeEstimate.recommendedSompi;

    if (params.feeSompi !== undefined && params.feeSompi < feeEstimate.minimumRequiredSompi) {
      warnings.push({
        code: "ZK_FEE_BELOW_MEMPOOL_MINIMUM",
        message: `Specified fee of ${params.feeSompi} sompi is below the standard mempool minimum of ${feeEstimate.minimumRequiredSompi} sompi for compute mass ${feeEstimate.computeMass}`
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
      return emptyTxResult(feeEstimate, computeBudget, feeSompi, destinationAddress, networkId, warnings, issues);
    }

    // Pass 2: the real transaction with the final fee.
    const tx = makeTx(feeSompi);
    // Only the non-contextual mass is checked against the standard limit here. The node's limit on
    // compute mass (budget term included) is not enforced locally: the mempool prices it (fee) and
    // the consensus allowance is `budget * 10_000 + 9_999` script units per input.
    const withinStandardMaxMass = mass <= STANDARD_MAX_TRANSACTION_MASS;
    if (mass > STANDARD_MAX_TRANSACTION_MASS) {
      issues.push({
        code: "ZK_TX_EXCEEDS_MAX_STANDARD_MASS",
        message: `Transaction mass ${mass} exceeds standard max mass ${STANDARD_MAX_TRANSACTION_MASS}`
      });
    }

    const planArtifact = buildR0Groth16Plan({
      ...params,
      feeSompi
    });
    const planIdCheck = checkArtifactIdentity(planArtifact);
    const planArtifactId = planIdCheck.ok ? planIdCheck.artifactId : undefined;
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
    return emptyTxResult(estimate, computeBudget, params.feeSompi ?? estimate.recommendedSompi, destinationAddress, networkId, warnings, issues);
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
  const last = ops[ops.length - 1];
  const beforeLast = ops[ops.length - 2];
  const hasOpZkPrecompile = !redeem.error && last !== undefined && last.opcode === 0xa6 && last.data === undefined;
  const hasGroth16Tag =
    !redeem.error && beforeLast !== undefined && beforeLast.opcode === 0x01 && beforeLast.data === "20";

  if (!hasOpZkPrecompile) {
    issues.push({
      code: "ZK_MISSING_PRECOMPILE_OPCODE",
      message: "Redeem script does not end with OpZkPrecompile (0xa6)"
    });
  }
  if (!hasGroth16Tag) {
    issues.push({
      code: "ZK_MISSING_GROTH16_TAG",
      message: "Redeem script does not push the Groth16 tag (OP_DATA_1 0x20) right before OpZkPrecompile"
    });
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
