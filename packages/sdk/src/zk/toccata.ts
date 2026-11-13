import { createHash, randomBytes } from "node:crypto";
import { assertMainnetTransactionsDisabled, loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import { rpcEndpointOf, type KaspaRpcClient } from "@hardkas/kaspa-rpc";
import {
  HardkasSchemas,
  createV1TxPlanArtifact,
  createZkVerificationFactArtifact,
  checkArtifactIdentity,
  deriveObserverId,
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
import {
  computeR0ReceiptClaimDigest,
  findPublicR0TestVector,
  isHardkasR0Groth16Verification,
  parseR0Groth16Receipt,
  R0_GROTH16_BN254_CONTROL_ID,
  R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX,
  R0_GROTH16_CONTROL_ROOT,
  R0_GROTH16_VERIFIER_ID,
  r0VerifierParametersIssue,
  type R0Groth16LocalVerificationResult
} from "./risc0-groth16.js";

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export const OP_ZK_PRECOMPILE = "0xa6";
export const GROTH16_PROVING_SYSTEM_TAG = "0x20";
export const DEFAULT_ZK_COMPUTE_BUDGET = 1600;

/**
 * Where the Toccata scripts come from. HardKAS does not assemble the RISC Zero Groth16 verifier itself: it calls the
 * `ZkScriptBuilder` shipped inside the pinned kaspa-wasm (rusty-kaspa 2.1.0). Upstream also publishes that builder as
 * the Rust crate `kaspa-txscript-zk-sdk` 2.1.0 (crates.io, 2026-10-04; rusty-kaspa v2.1.0 crypto/txscript/zk-sdk).
 * HardKAS does not use that crate: it uses the same builder compiled into kaspa-wasm. Only the output-bound
 * introspection that follows the verifier in proof-and-output-bound mode is HardKAS's own (r0BoundRedeemScript).
 * (Audit L-08 corrected the claim label; the crypto review's H3 corrected this comment, which said the crate did not exist.)
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
 * Per-element price of the verifying key's gamma_abc_g1 (IC) vector, charged by the Groth16 precompile on
 * top of the tag cost (rusty-kaspa 2.1.0 zk_precompiles/groth16/mod.rs GROTH16_GAMMA_ABC_G1_ELEMENT_SCRIPT_UNITS).
 */
export const GROTH16_VK_ELEMENT_COST_SCRIPT_UNITS = 250000n;
/** IC elements of the RISC Zero Groth16 wrapper key (5 public inputs + 1). */
export const R0_GROTH16_VK_ELEMENTS = 6;
/**
 * Script units the R0 redeem/signature scripts spend BEFORE the precompile (pushes and the claim-digest
 * logic). OBSERVED, not derived: rusty-kaspad 2.1.0 simnet reported "used=14002811" when the 14,000,000 SU
 * tag cost was charged (fixtures/toccata-v2/zk/r0-groth16-official/evidence.json).
 */
export const R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS = 2811n;
/** Consensus block compute-mass limit (rusty-kaspa 2.1.0 config/params.rs block_mass_limits.compute). */
export const BLOCK_COMPUTE_MASS_LIMIT = 500000n;

/**
 * Smallest compute budget whose allowance (budget * 10,000 + 9,999 script units) covers the observed script
 * overhead, the Groth16 tag cost and the per-element VK cost: 1550 for the RISC Zero wrapper (6 elements).
 */
export function minimumR0Groth16ComputeBudget(
  vkElements: number = R0_GROTH16_VK_ELEMENTS,
  overheadScriptUnits: bigint = R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS
): number {
  const needed =
    overheadScriptUnits +
    GROTH16_PRECOMPILE_COST_SCRIPT_UNITS +
    BigInt(vkElements) * GROTH16_VK_ELEMENT_COST_SCRIPT_UNITS -
    FREE_SCRIPT_UNITS_PER_INPUT;
  if (needed <= 0n) return 0;
  return Number((needed + SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT - 1n) / SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT);
}

/** Reads the IC element count of the 424-byte-class verifying key pushed in a Groth16 redeem script. */
export function groth16VkElementsInRedeemScript(redeemScriptHex: string): number | undefined {
  const parsed = parseKaspaScript(redeemScriptHex);
  if (parsed.error) return undefined;
  for (const op of parsed.ops) {
    if (op.data === undefined || op.data.length < 2 * 232) continue;
    const bytes = Buffer.from(op.data, "hex");
    const n = Number(bytes.readBigUInt64LE(224));
    if (n > 0 && n < 1024 && bytes.length === 232 + 32 * n) return n;
  }
  return undefined;
}

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

/**
 * The base compute mass kaspa-wasm 2.1.0 reports for ONE reference shape only: the official RISC Zero vector
 * spent from one P2SH input to one P2SH output. It feeds DEFAULT_ZK_FEE_SOMPI and the fee estimate of error
 * results; plans and transactions measure the real shape (ZK-08). kaspa-wasm overestimates consensus by
 * ~64-75 g for this shape (the node measured 161,527 for a P2PK destination), a safe direction.
 */
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
/** What a lock requires from a spender: a receipt of the image id only, or also exactly the bound outputs. */
export type ZkLockAuthorizationModel = "IMAGE_ID_ONLY" | "IMAGE_ID_AND_OUTPUTS";

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
  /**
   * The most the lock may pay as fee. The redeem script refuses an input holding more than the bound outputs plus
   * this amount, so a larger deposit cannot be burnt as fee by whoever triggers the spend. Default
   * DEFAULT_MAX_FEE_CAP_SOMPI.
   */
  maxFeeSompi?: bigint;
  /**
   * @deprecated Refused (ZK_UTXO_BINDING_UNSATISFIABLE): binding the spent outpoint is circular. The funding
   * transaction's id commits to its outputs, this P2SH among them, so no redeem script can name that outpoint in
   * advance; a lock that did would be unspendable. Replay across UTXOs is limited by the one-input rule instead.
   */
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
 *
 * OFF-CHAIN CONVENTION ONLY: no HardKAS lock checks this journal. The redeem scripts verify a receipt of the image id
 * for whatever journal hash the spender supplies; the outputs are bound by introspection in proof-and-output-bound
 * mode, not through the journal. The fields mean something only if the guest program enforces them.
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
export type ZkAddressNetwork = "simnet" | "testnet-10" | "mainnet";

export interface R0Groth16ScriptParams {
  imageId: string;
  journalHash: string;
  receiptHex: string;
  bindingPolicy?: ZkOutputBindingPolicy;
  /**
   * Networks whose P2SH address is returned. The simnet address is always returned; "testnet-10" is returned
   * only when listed here AND acknowledgeImageIdOnlyLock is true, and never for a public test vector
   * (PUBLIC_R0_TEST_VECTORS), whose lock anyone can spend (HK-16). "mainnet" (any spelling) throws
   * MAINNET_SIGNING_DISABLED while mainnet is locked down (P37): nothing is built.
   */
  addressNetworks?: ZkAddressNetwork[];
  /**
   * Explicit confirmation of the proof-only authorization model: the lock binds ONLY the image id, so whoever
   * holds a valid receipt of that program spends the UTXO, to any outputs, on any network, and can replay or
   * front-run a spend seen in the mempool. Not needed in proof-and-output-bound mode.
   */
  acknowledgeImageIdOnlyLock?: boolean;
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
  /** testnet10 is present only on explicit, acknowledged request (see R0Groth16ScriptParams); mainnet never while locked down. */
  p2shAddresses: {
    simnet: string;
    testnet10?: string;
    mainnet?: string;
  };
  /** The lock's authorization model, stated on every result (IMAGE_ID_AND_OUTPUTS in proof-and-output-bound mode). */
  authorizationModel: ZkLockAuthorizationModel;
  /** MATCH: the receipt's pruned claim digest equals the claim of (imageId, journalHash) (HK-19). */
  receiptClaimCrossCheck: "MATCH" | "NOT_CHECKED";
  receiptClaimDigest?: string;
  precompileOpcode: typeof OP_ZK_PRECOMPILE;
  provingSystemTag: typeof GROTH16_PROVING_SYSTEM_TAG;
  bindingMode: ZkBindingMode;
  bindingPolicy?: ZkOutputBindingPolicy;
  /** true only for a successful proof-and-output-bound build (the redeem script enforces the outputs). */
  consensusEnforced: boolean;
  boundPayoutAddress?: string;
  boundPayoutAmount?: bigint;
  /**
   * proof-and-output-bound: the amount to lock at the P2SH. The bound outputs plus the recommended fee for the
   * measured spend (default compute budget). The fee is fixed once funded: the outputs are bound on-chain.
   */
  requiredFundingSompi?: bigint;
  /** proof-and-output-bound: the largest UTXO the redeem script accepts (bound outputs + maxFeeSompi). */
  maxInputSompi?: bigint;
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
  /**
   * @deprecated Ignored (HK-17): the caller cannot assert off-chain verification. Passing true only adds the
   * warning ZK_CALLER_VERIFICATION_CLAIM_IGNORED. Pass `localVerification` instead.
   */
  mathVerified?: boolean | undefined;
  bindingPolicy?: ZkOutputBindingPolicy;
  /**
   * The result of verifyR0Groth16ReceiptLocal for this receipt. Only a genuine, verified result produced
   * in this process for the same image id, journal and proof sets the fact's verifiedOffChain.
   */
  localVerification?: R0Groth16LocalVerificationResult | undefined;
  /** Optional timestamp recorded in the ZK fact. It is not part of the fact's identity unless given. */
  timestamp?: string | undefined;
  /** Measured non-contextual mass of the spend; measured with kaspa-wasm when omitted. */
  baseComputeMass?: bigint | undefined;
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
  /**
   * Record of this ZK spend (image id, journal hash, SHA-256 of the proof bytes, scripts, outpoint, payout,
   * off-chain verification status). It is an unkeyed RECORD, not a binding: a proof-only lock binds only the
   * image id and nothing ties the proof to these outputs (HK-16); a proof-and-output-bound lock binds the outputs
   * in its redeem script, not through this record.
   */
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
  /** Expected change output (output 1) of a proof-and-output-bound lock. */
  expectedChangeAddress?: string | undefined;
  expectedChangeAmount?: bigint | undefined;
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
  /**
   * The redeem script is byte-identical to the script HardKAS builds for the parameters read back from it (the image id;
   * in output-bound mode the outputs and the input limit), with the builders buildR0Groth16Scripts uses (crypto review H2).
   */
  redeemScriptCanonical: boolean;
  /** The image id a canonical redeem script commits to. */
  scriptImageId?: string;
  /**
   * The verifying key handed to OpZkPrecompile (the push right before the Groth16 tag) is the pinned RISC Zero key,
   * R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX (crypto review H1).
   */
  verifyingKeyPinned: boolean;
  /** The script pushes split_digest(R0_GROTH16_CONTROL_ROOT): both 16-byte halves, zero-padded to 32 bytes. */
  controlRootPinned: boolean;
  /** The script pushes R0_GROTH16_BN254_CONTROL_ID. */
  controlIdPinned: boolean;
  bindingMode?: ZkBindingMode;
  /**
   * true only for a canonical proof-and-output-bound lock over the pinned verifier with no issue. Never inferred from the
   * presence of opcodes. The `enforces*` and `bound*` fields below are set from that byte-exact reconstruction only.
   */
  consensusEnforced?: boolean;
  hasOutputIntrospection?: boolean;
  enforcesOutputCount?: boolean;
  enforcesPayoutSpk?: boolean;
  enforcesPayoutAmount?: boolean;
  enforcesChangeSpk?: boolean;
  enforcesChangeAmount?: boolean;
  /** The script contains OpOutpointTxId (a defect: no spend can satisfy an outpoint binding). */
  enforcesUtxoBinding?: boolean;
  /** OpTxInputCount: the spend has exactly one input. */
  enforcesSingleInput?: boolean;
  /** OpTxInputAmount .. OpLessThanOrEqual: the spent UTXO is at most the bound outputs plus the fee cap. */
  enforcesInputAmountLimit?: boolean;
  /** 1 (payout) or 2 (payout and change). */
  boundOutputCount?: number;
  boundPayoutSpk?: string;
  boundPayoutAmount?: bigint;
  boundChangeSpk?: string;
  boundChangeAmount?: bigint;
  /** The largest input the lock accepts (bound outputs plus the fee cap it was built with). */
  boundMaxInputSompi?: bigint;
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
  /** Price of each gamma_abc_g1 (IC) element of the verifying key, on top of the tag cost. */
  groth16VkElementCostScriptUnits: number;
  /** IC elements of the RISC Zero Groth16 wrapper key. */
  r0Groth16VkElements: number;
  /** Observed script units spent before the precompile by the R0 scripts (simnet evidence). */
  r0Groth16ObservedOverheadScriptUnits: number;
  /** Smallest compute budget that covers the R0 Groth16 spend (overhead + tag + VK elements). */
  minimumR0Groth16ComputeBudget: number;
  /** Largest compute budget whose compute mass still fits a block, for the reference spend shape. */
  maximumComputeBudgetForBlockReferenceShape: number;
  /** Consensus block compute-mass limit. */
  blockComputeMassLimit: number;
  /**
   * The default (proof-only) lock binds the image id only: any holder of a valid receipt of that program can spend
   * (HK-16). A proof-and-output-bound lock also binds the outputs (IMAGE_ID_AND_OUTPUTS, see buildR0Groth16Scripts).
   */
  authorizationModel: "IMAGE_ID_ONLY";
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
    p2shAddresses: { simnet: "" },
    authorizationModel: zkLockAuthorizationModel(mode),
    receiptClaimCrossCheck: "NOT_CHECKED",
    precompileOpcode: OP_ZK_PRECOMPILE,
    provingSystemTag: GROTH16_PROVING_SYSTEM_TAG,
    bindingMode: mode,
    ...(bindingPolicy ? { bindingPolicy } : {}),
    consensusEnforced: false,
    ...(bindingPolicy?.payout ? { boundPayoutAddress: bindingPolicy.payout.address, boundPayoutAmount: bindingPolicy.payout.amountSompi } : {}),
    experimental: true,
    warnings,
    issues
  };
}

/** Warning attached to every R0 script and transaction result: the lock's authorization model (HK-16). */
export const ZK_LOCK_BINDS_IMAGE_ID_ONLY_WARNING: ZkIssue = Object.freeze({
  code: "ZK_LOCK_BINDS_IMAGE_ID_ONLY",
  message:
    "Authorization model: this P2SH lock binds ONLY the RISC Zero image id (the upstream ZkScriptBuilder's minimal flow). " +
    "Anyone holding a valid receipt of that program can spend every UTXO at this address, on any network, to outputs of their choosing; " +
    "a spend seen in the mempool can be copied (replay / front-running). Nothing binds the proof to the transaction, its outputs, " +
    "the outpoint or the network: security is whatever the guest program enforces through its journal."
}) as ZkIssue;

/** Authorization model of a lock built in proof-and-output-bound mode. */
export const ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS_WARNING: ZkIssue = Object.freeze({
  code: "ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS",
  message:
    "Authorization model: this P2SH lock requires a valid receipt of the RISC Zero image id AND, by output introspection, " +
    "exactly the bound outputs (count, script and amount of the payout, and of the change when set). Anyone holding a valid receipt " +
    "of that program can trigger the spend, but only to those outputs. The journal is supplied by the unlocking script and is not " +
    "checked on-chain. The spend has exactly one input; every UTXO at this address is spendable the same way, one at a time; whatever " +
    "a UTXO holds beyond the bound outputs is the fee, and a UTXO holding more than the outputs plus the fee cap stays locked. " +
    "Fund it with requiredFundingSompi."
}) as ZkIssue;

/** The authorization-model warning for a lock of this mode (attached to every script and transaction result). */
export function zkLockAuthorizationWarning(mode: ZkBindingMode, _policy?: ZkOutputBindingPolicy): ZkIssue {
  return mode === "proof-and-output-bound" ? ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS_WARNING : ZK_LOCK_BINDS_IMAGE_ID_ONLY_WARNING;
}

/** proof-and-output-bound: the largest input the redeem script accepts (bound outputs plus the fee cap). */
export function boundMaxInputSompi(policy: ZkOutputBindingPolicy): bigint {
  return policy.payout.amountSompi + (policy.change?.amountSompi ?? 0n) + (policy.maxFeeSompi ?? DEFAULT_MAX_FEE_CAP_SOMPI);
}

/** The authorization model a lock of this mode carries. */
export function zkLockAuthorizationModel(mode: ZkBindingMode): ZkLockAuthorizationModel {
  return mode === "proof-and-output-bound" ? "IMAGE_ID_AND_OUTPUTS" : "IMAGE_ID_ONLY";
}

/**
 * The bytes OpTxOutputSpk / OpTxInputSpk push for a script public key: the version as u16 big-endian, then the
 * script (rusty-kaspa v2.1.0 crypto/txscript/src/lib.rs, SpkEncoding::to_bytes). Hex.
 */
export function spkIntrospectionBytesHex(spk: { version: number | bigint; script: string }): string {
  const version = Number(spk.version);
  if (!Number.isInteger(version) || version < 0 || version > 0xffff) throw new Error(`invalid script public key version ${String(spk.version)}`);
  return version.toString(16).padStart(4, "0") + String(spk.script).toLowerCase();
}

/** One output a proof-and-output-bound lock checks: the bytes OpTxOutputSpk pushes for it (hex) and its amount. */
interface R0BoundOutputCheck {
  spkIntrospectionHex: string;
  amountSompi: bigint;
}

/** kaspa-wasm's R0-over-Groth16 verifier fragment for an image id: the whole redeem script of a proof-only lock. */
function r0Groth16VerifierFragment(kaspa: any, imageId: string): string {
  const zkBuilder = kaspa.ZkScriptBuilder.newR0();
  zkBuilder.appendR0Groth16Verifier(imageId);
  return String(zkBuilder.drain()).toLowerCase();
}

/**
 * The redeem script of a proof-and-output-bound lock: the upstream verifier fragment for `imageId`, OpVerify, then the
 * output and input checks by introspection. The ONE builder of this script: buildR0Groth16Scripts locks funds with it,
 * and verifyR0Groth16Scripts rebuilds a script with it from the parameters it reads back and compares the bytes (H2).
 */
function r0BoundRedeemScript(kaspa: any, imageId: string, outputs: readonly R0BoundOutputCheck[], maxInputSompi: bigint): string {
  const sb = new kaspa.ScriptBuilder();
  sb.addOps(Buffer.from(r0Groth16VerifierFragment(kaspa, imageId), "hex"));
  sb.addOp(kaspa.Opcodes.OpVerify);

  sb.addOp(kaspa.Opcodes.OpTxOutputCount);
  sb.addI64(BigInt(outputs.length));
  sb.addOp(kaspa.Opcodes.OpNumEqualVerify);

  // Output i (0 = payout, 1 = change): its SPK as OpTxOutputSpk pushes it (version u16 big-endian, then the script;
  // rusty-kaspa v2.1.0 txscript SpkEncoding::to_bytes), then its amount.
  outputs.forEach((output, index) => {
    sb.addI64(BigInt(index));
    sb.addOp(kaspa.Opcodes.OpTxOutputSpk);
    sb.addData(Buffer.from(output.spkIntrospectionHex, "hex"));
    sb.addOp(kaspa.Opcodes.OpEqualVerify);

    sb.addI64(BigInt(index));
    sb.addOp(kaspa.Opcodes.OpTxOutputAmount);
    sb.addI64(output.amountSompi);
    sb.addOp(kaspa.Opcodes.OpNumEqualVerify);
  });

  // One input only: several UTXOs of this lock spent together would satisfy the same output checks and send
  // their whole excess to the fee.
  sb.addOp(kaspa.Opcodes.OpTxInputCount);
  sb.addI64(1n);
  sb.addOp(kaspa.Opcodes.OpNumEqualVerify);

  // This input holds at most the bound outputs plus the fee cap: a larger deposit cannot be burnt as fee by
  // whoever triggers the spend (it stays locked instead).
  sb.addOp(kaspa.Opcodes.OpTxInputIndex);
  sb.addOp(kaspa.Opcodes.OpTxInputAmount);
  sb.addI64(maxInputSompi);
  sb.addOp(kaspa.Opcodes.OpLessThanOrEqual);
  sb.addOp(kaspa.Opcodes.OpVerify);

  sb.addOp(kaspa.Opcodes.OpTrue);
  return String(sb.drain()).toLowerCase();
}

/** A mainnet address (`kaspa:`, not a simulator identity `kaspa:sim_`) names the mainnet network; any other value, none. */
function mainnetOfAddress(address: unknown): string | undefined {
  if (typeof address !== "string") return undefined;
  const a = address.trim().toLowerCase();
  return a.startsWith("kaspa:") && !a.startsWith("kaspa:sim_") ? "mainnet" : undefined;
}

/**
 * P37 · every network a scripts request involves: each `addressNetworks` entry as given (any spelling), and the network
 * of the bound payout and change addresses. The mainnet guard decides on all of them.
 */
function scriptsRequestNetworks(params: R0Groth16ScriptParams | undefined): unknown[] {
  const asked: unknown[] = Array.isArray(params?.addressNetworks) ? [...params!.addressNetworks] : [];
  const policy = params?.bindingPolicy as { payout?: { address?: unknown }; change?: { address?: unknown } } | undefined;
  return [...asked, mainnetOfAddress(policy?.payout?.address), mainnetOfAddress(policy?.change?.address)];
}

/**
 * Builds the Kaspa Toccata P2SH redeem script (locking) and signature script (unlocking) for a
 * RISC Zero Groth16 receipt, through kaspa-wasm's ZkScriptBuilder (upstream minimal flow:
 * commitToGroth16(imageId) + finalizeWithGroth16Proof(receipt, journalHash)).
 *
 * Authorization model, proof-only (the default; HK-16, by upstream design): the lock binds the image id only.
 * "Whoever holds a valid receipt of that program spends." The journal is supplied by the unlocking script;
 * outputs, outpoint and network are not bound, so replay across UTXOs/networks and front-running of a mempool
 * spend are properties of the design. Every result carries the warning ZK_LOCK_BINDS_IMAGE_ID_ONLY.
 *
 * proof-and-output-bound (`bindingPolicy`): after the Groth16 verifier, the redeem script checks by output
 * introspection the output count and the payout's (and change's) script public key and amount, then requires exactly
 * one input and an input of at most the bound outputs plus `maxFeeSompi`. A valid receipt can only send the funds to
 * those outputs. The spent outpoint is never bound (circular: `utxoBinding` is refused). The bound script public key is
 * the version-prefixed encoding OpTxOutputSpk pushes. Results carry ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS.
 *
 * Addresses: the simnet address is always returned. A testnet-10 address is returned only when requested in
 * `addressNetworks` (proof-only also needs `acknowledgeImageIdOnlyLock: true`), and never for a public test vector.
 *
 * Mainnet (MAINNET TOTAL LOCKDOWN, P37): a lock's signature script IS the authorization of its spend (a ZK spend
 * carries no signature), so no lock is built for mainnet. A mainnet entry in `addressNetworks`, in any spelling
 * (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case), or a bound payout or change address of mainnet
 * (`kaspa:`) throws MAINNET_SIGNING_DISABLED before the receipt is read: no mainnet P2SH address and no signature script.
 *
 * Receipt cross-check (HK-19): when the receipt carries its claim pruned to a digest (the usual Borsh
 * encoding), the digest is recomputed from (imageId, journalHash) and a mismatch is rejected
 * (ZK_RECEIPT_CLAIM_MISMATCH): a wrong image id would lock funds to a program with no such receipt, a wrong
 * journal would make the unlocking script fail.
 */
export function buildR0Groth16Scripts(params: R0Groth16ScriptParams): R0Groth16ScriptsResult {
  // ESCALÓN 4 · P37 · MAINNET TOTAL LOCKDOWN: refused like a signature, first (see above).
  assertMainnetTransactionsDisabled("sign", scriptsRequestNetworks(params), "buildR0Groth16Scripts");
  const issues: ZkIssue[] = [];
  const bindingMode: ZkBindingMode = params.bindingPolicy?.mode ?? "proof-only";
  const warnings: ZkIssue[] = [{ ...zkLockAuthorizationWarning(bindingMode, params.bindingPolicy) }];
  const imageId = typeof params.imageId === "string" ? params.imageId.trim().toLowerCase() : "";
  const journalHash = typeof params.journalHash === "string" ? params.journalHash.trim().toLowerCase() : "";
  const receiptHex = typeof params.receiptHex === "string" ? params.receiptHex.trim() : "";

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

  // Which public-network addresses were asked for (HK-16).
  const requested = Array.isArray(params.addressNetworks) ? params.addressNetworks : [];
  const publicNetworks: Array<"testnet-10" | "mainnet"> = [];
  for (const net of requested) {
    if (net === "simnet") continue;
    if (net === "testnet-10" || net === "mainnet") {
      if (!publicNetworks.includes(net)) publicNetworks.push(net);
    } else {
      issues.push({ code: "ZK_ADDRESS_NETWORK_UNSUPPORTED", message: `Unsupported address network '${String(net)}' (simnet, testnet-10, mainnet).` });
    }
  }
  // The acknowledgement covers the image-id-only lock; an output-bound lock sends the funds only to the bound outputs.
  if (publicNetworks.length > 0 && bindingMode !== "proof-and-output-bound" && params.acknowledgeImageIdOnlyLock !== true) {
    issues.push({
      code: "ZK_IMAGE_ID_ONLY_LOCK_NOT_ACKNOWLEDGED",
      message: `Addresses for ${publicNetworks.join(", ")} were requested without acknowledgeImageIdOnlyLock: the lock binds only the image id, so anyone with a valid receipt of this program can spend it. Nothing was built.`
    });
  }
  const publicVector = findPublicR0TestVector(imageId, journalHash);
  if (publicNetworks.length > 0 && publicVector) {
    issues.push({
      code: "ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED",
      message: `(${imageId}, ${journalHash}) is a PUBLIC test vector (${publicVector.name}): its receipt is published, so a ${publicNetworks.join("/")} address would be anyone-can-spend. HardKAS never returns it.`
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

  if (issues.length > 0) return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues, params.bindingPolicy);

  // Receipt claim cross-check (HK-19).
  let receiptClaimCrossCheck: "MATCH" | "NOT_CHECKED" = "NOT_CHECKED";
  let receiptClaimDigest: string | undefined;
  const parsedReceipt = parseR0Groth16Receipt(receiptHex);
  if (parsedReceipt.ok && parsedReceipt.claimEncoding === "PRUNED_DIGEST" && parsedReceipt.claimDigest) {
    receiptClaimDigest = parsedReceipt.claimDigest;
    const computed = computeR0ReceiptClaimDigest(imageId, journalHash);
    if (computed !== parsedReceipt.claimDigest) {
      issues.push({
        code: "ZK_RECEIPT_CLAIM_MISMATCH",
        message:
          `The receipt proves claim ${parsedReceipt.claimDigest}, but (imageId, journalHash) gives claim ${computed}. ` +
          "A wrong image id would lock funds to a program with no such receipt (unspendable); a wrong journal hash makes the unlocking script fail. Nothing was built."
      });
      return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues, params.bindingPolicy);
    }
    // H7: a receipt made for another RISC Zero verifier would never unlock this lock (its key and control root are pinned)
    const paramsIssue = r0VerifierParametersIssue(parsedReceipt.verifierParameters);
    if (paramsIssue) {
      issues.push({ ...paramsIssue, message: `${paramsIssue.message} Nothing was built.` });
      return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues, params.bindingPolicy);
    }
    receiptClaimCrossCheck = "MATCH";
  } else {
    warnings.push({
      code: "ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED",
      message:
        "The receipt does not carry its claim as a pruned digest (or could not be parsed here), so imageId/journalHash were not cross-checked against it. verifyR0Groth16ReceiptLocal checks the proof against the claim of (imageId, journalHash)."
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
    if (policy.utxoBinding !== undefined) {
      issues.push({
        code: "ZK_UTXO_BINDING_UNSATISFIABLE",
        message:
          "bindingPolicy.utxoBinding is refused: binding the spent outpoint is circular (the funding transaction's id commits to this P2SH), so the lock could never be spent. Nothing was built."
      });
    }
    if (policy.maxFeeSompi !== undefined && (typeof policy.maxFeeSompi !== "bigint" || policy.maxFeeSompi <= 0n)) {
      issues.push({ code: "ZK_BINDING_POLICY_INVALID", message: "bindingPolicy.maxFeeSompi must be a positive bigint" });
    }
  }

  if (issues.length > 0) return emptyScriptsResult(imageId, journalHash, preparedProof, warnings, issues, params.bindingPolicy);

  try {
    let redeemScript = "";
    let sigScript = "";

    if (bindingMode === "proof-and-output-bound") {
      const policy = params.bindingPolicy!;
      // The bound SPK is what OpTxOutputSpk pushes (version too), or no spend matches.
      const outputs: R0BoundOutputCheck[] = [policy.payout, ...(policy.change ? [policy.change] : [])].map((o) => ({
        spkIntrospectionHex: spkIntrospectionBytesHex(kaspa.payToAddressScript(new kaspa.Address(o.address))),
        amountSompi: o.amountSompi
      }));
      redeemScript = r0BoundRedeemScript(kaspa, imageId, outputs, boundMaxInputSompi(policy));

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

    const p2shAddresses: R0Groth16ScriptsResult["p2shAddresses"] = {
      simnet: kaspa.addressFromScriptPublicKey(spk, "simnet")?.toString() ?? ""
    };
    if (publicNetworks.includes("testnet-10")) {
      p2shAddresses.testnet10 = kaspa.addressFromScriptPublicKey(spk, "testnet-10")?.toString() ?? "";
    }
    if (publicNetworks.includes("mainnet")) {
      p2shAddresses.mainnet = kaspa.addressFromScriptPublicKey(spk, "mainnet")?.toString() ?? "";
    }

    // The outputs are an expectation only in output-bound mode (a proof-only lock binds none).
    const boundPolicy = bindingMode === "proof-and-output-bound" ? params.bindingPolicy : undefined;
    const structural = verifyR0Groth16Scripts({
      redeemScript,
      sigScript,
      imageId,
      journalHash,
      expectedBindingMode: bindingMode,
      ...(boundPolicy?.payout ? {
        expectedPayoutAddress: boundPolicy.payout.address,
        expectedPayoutAmount: boundPolicy.payout.amountSompi
      } : {}),
      ...(boundPolicy?.change ? {
        expectedChangeAddress: boundPolicy.change.address,
        expectedChangeAmount: boundPolicy.change.amountSompi
      } : {})
    });
    if (!structural.ok) {
      issues.push({
        code: "ZK_REDEEM_SCRIPT_INVALID_STRUCTURE",
        message: `Built scripts failed structural verification: ${structural.issues.map((i) => i.code).join(", ")}`
      });
    }

    // proof-and-output-bound: the fee is fixed by the funding amount, so the funder needs it now (M1).
    let funding: { requiredFundingSompi: bigint; maxInputSompi: bigint } | undefined;
    if (bindingMode === "proof-and-output-bound" && issues.length === 0) {
      const policy = params.bindingPolicy!;
      const outputsTotal = policy.payout.amountSompi + (policy.change?.amountSompi ?? 0n);
      const probeScripts = { ok: true, bindingMode, bindingPolicy: policy, sigScript, redeemScript, p2shScriptPublicKey: { version: spk.version, script: spk.script } } as unknown as R0Groth16ScriptsResult;
      const probeMass = BigInt(
        kaspa.calculateTransactionMass(
          "simnet",
          makeR0Groth16SpendTx(
            kaspa,
            { scripts: probeScripts, utxo: { transactionId: ZERO_TXID, index: 0, amountSompi: outputsTotal + 1n }, destinationAddress: policy.payout.address } as unknown as BuildR0Groth16TxParams,
            DEFAULT_ZK_COMPUTE_BUDGET,
            0n
          )
        )
      );
      const fee = estimateToccataZkFee(DEFAULT_ZK_COMPUTE_BUDGET, probeMass, policy.maxFeeSompi !== undefined ? { maxFeeSompi: policy.maxFeeSompi } : undefined);
      if (fee.cappedBelowMinimum) {
        issues.push({
          code: "ZK_FEE_CAP_BELOW_REQUIRED_FEE",
          message: `The fee cap (${policy.maxFeeSompi ?? DEFAULT_MAX_FEE_CAP_SOMPI} sompi) is below the minimum fee ${fee.minimumRequiredSompi} sompi of this spend: no funding amount could be spent. Nothing was built.`
        });
      } else {
        funding = { requiredFundingSompi: outputsTotal + fee.recommendedSompi, maxInputSompi: boundMaxInputSompi(policy) };
      }
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
      p2shAddresses,
      authorizationModel: zkLockAuthorizationModel(bindingMode),
      receiptClaimCrossCheck,
      ...(receiptClaimDigest ? { receiptClaimDigest } : {}),
      precompileOpcode: OP_ZK_PRECOMPILE,
      provingSystemTag: GROTH16_PROVING_SYSTEM_TAG,
      bindingMode,
      ...(params.bindingPolicy ? { bindingPolicy: params.bindingPolicy } : {}),
      consensusEnforced: bindingMode === "proof-and-output-bound" && structural.consensusEnforced === true && issues.length === 0,
      ...(params.bindingPolicy?.payout ? {
        boundPayoutAddress: params.bindingPolicy.payout.address,
        boundPayoutAmount: params.bindingPolicy.payout.amountSompi
      } : {}),
      ...(funding ?? {}),
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
    consensusEnforced: false,
    experimental: true,
    warnings,
    issues
  };
}

/** The scripts' P2SH address for a network, or undefined when it was not built (never a placeholder). */
function p2shAddressFor(
  scripts: R0Groth16ScriptsResult,
  networkId: "simnet" | "testnet-10" | "mainnet"
): string | undefined {
  const a = scripts?.p2shAddresses;
  const v = networkId === "testnet-10" ? a?.testnet10 : networkId === "mainnet" ? a?.mainnet : a?.simnet;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** The bound outputs of a proof-and-output-bound lock, or undefined for a proof-only lock. */
function boundPolicyOf(scripts: R0Groth16ScriptsResult | undefined): ZkOutputBindingPolicy | undefined {
  return scripts?.bindingMode === "proof-and-output-bound" && scripts.bindingPolicy?.mode === "proof-and-output-bound"
    ? scripts.bindingPolicy
    : undefined;
}

/**
 * The outputs of the spend. proof-and-output-bound: exactly the bound payout (and change), as the redeem script checks
 * them; the fee is whatever the UTXO holds beyond them. proof-only: one output to the destination, UTXO minus fee.
 */
function r0SpendOutputs(params: BuildR0Groth16TxParams, fee: bigint): Array<{ address: string; amountSompi: bigint; role: "payment" | "change" }> {
  const policy = boundPolicyOf(params.scripts);
  if (policy) {
    return [
      { address: policy.payout.address, amountSompi: policy.payout.amountSompi, role: "payment" },
      ...(policy.change ? [{ address: policy.change.address, amountSompi: policy.change.amountSompi, role: "change" as const }] : [])
    ];
  }
  return [{ address: String(params.destinationAddress ?? "").trim(), amountSompi: params.utxo.amountSompi - fee, role: "payment" }];
}

/** proof-and-output-bound: the fee the bound outputs leave (UTXO minus payout and change). */
function impliedBoundFee(params: BuildR0Groth16TxParams, policy: ZkOutputBindingPolicy): bigint {
  return params.utxo.amountSompi - policy.payout.amountSompi - (policy.change?.amountSompi ?? 0n);
}

function makeR0Groth16SpendTx(kaspa: any, params: BuildR0Groth16TxParams, computeBudget: number, fee: bigint) {
  const outputs = r0SpendOutputs(params, fee).map((o) => {
    const spk = kaspa.payToAddressScript(new kaspa.Address(o.address));
    return { value: o.amountSompi, scriptPublicKey: new kaspa.ScriptPublicKey(spk.version, spk.script) };
  });
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
    outputs,
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: "",
    storageMass: 0n
  });
}

/** Non-contextual mass kaspa-wasm reports for THIS spend shape (the output value is 8 bytes whatever the fee). */
function measureR0Groth16SpendMass(params: BuildR0Groth16TxParams, computeBudget: number): bigint {
  const kaspa = loadManagedKaspaWasmSync();
  return kaspa.calculateTransactionMass(params.networkId ?? "simnet", makeR0Groth16SpendTx(kaspa, params, computeBudget, 0n));
}

/**
 * Builds a TxPlanArtifact (hardkas.txPlan.v1) for a Toccata ZK Groth16 spend.
 * Integrates ZK transactions directly into HardKAS's deterministic plan pipeline. The estimated mass is
 * measured for the real shape with kaspa-wasm (ZK-08), never the 1602 reference constant. Throws
 * `ZK_P2SH_ADDRESS_UNAVAILABLE` when the scripts carry no address for the plan's network (no placeholder), and
 * `MAINNET_SIGNING_DISABLED` for mainnet, before anything is read (see buildR0Groth16Transaction).
 */
export function buildR0Groth16Plan(params: BuildR0Groth16TxParams): TxPlanArtifact {
  // MAINNET TOTAL LOCKDOWN (crypto review H5): the caller already holds this spend's signature script, so the plan
  // describes a complete, authorized mainnet transaction. Refused like a signature, first.
  assertMainnetTransactionsDisabled("sign", [params?.networkId], "buildR0Groth16Plan");
  const computeBudget = params.computeBudget ?? DEFAULT_ZK_COMPUTE_BUDGET;
  const netKey = (params.networkId ?? "simnet") as "simnet" | "testnet-10" | "mainnet";
  const p2shAddress = p2shAddressFor(params.scripts, netKey);
  if (!p2shAddress) {
    throw new Error(
      `ZK_P2SH_ADDRESS_UNAVAILABLE: the scripts carry no P2SH address for '${netKey}' (public-network addresses need addressNetworks, + acknowledgeImageIdOnlyLock for a proof-only lock, and are never built for a public test vector)`
    );
  }
  const baseComputeMass = params.baseComputeMass ?? measureR0Groth16SpendMass(params, computeBudget);
  const feeEstimate = estimateToccataZkFee(computeBudget, baseComputeMass, params.feeOptions);
  const policy = boundPolicyOf(params.scripts);
  const feeSompi = policy ? impliedBoundFee(params, policy) : params.feeSompi ?? feeEstimate.recommendedSompi;
  // Fails closed: the plan never carries a fee cap below its own fee, nor a fee above the cap (N-6).
  const maxFeeSompi = policy?.maxFeeSompi ?? params.feeOptions?.maxFeeSompi ?? DEFAULT_MAX_FEE_CAP_SOMPI;
  if (feeSompi <= 0n) {
    throw new Error(`ZK_INSUFFICIENT_INPUT_AMOUNT: UTXO ${params.utxo.amountSompi} sompi does not cover the bound outputs and a fee`);
  }
  if (feeSompi > maxFeeSompi) {
    throw new Error(`ZK_FEE_ABOVE_CAP: fee ${feeSompi} sompi exceeds the cap ${maxFeeSompi} (raise feeOptions.maxFeeSompi explicitly)`);
  }
  const spkHex = `${Number(params.scripts.p2shScriptPublicKey.version).toString(16).padStart(4, "0")}${params.scripts.p2shScriptPublicKey.script}`;
  const outputs = r0SpendOutputs(params, feeSompi);
  const payment = outputs[0]!;

  return createV1TxPlanArtifact({
    networkId: (params.networkId ?? "simnet") as any,
    mode: "rpc",
    from: { input: p2shAddress, address: p2shAddress },
    to: { input: payment.address, address: payment.address },
    amountSompi: payment.amountSompi > 0n ? payment.amountSompi : 0n,
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
      outputs: outputs.map((o) => ({ address: o.address, amountSompi: String(o.amountSompi), role: o.role })),
      estimatedFeeSompi: String(feeSompi),
      estimatedMass: String(feeEstimate.computeMass),
      storageMass: "0",
      maxFeeSompi: String(maxFeeSompi)
    },
    ctx: systemRuntimeContext,
    purpose: "ZK Groth16 spend"
  }) as any;
}

/**
 * Builds (does not sign or broadcast) a version-1 transaction spending a P2SH UTXO locked by a
 * RISC Zero Groth16 lock. The compute budget must be a u16 that covers the precompile (tag cost + 250,000
 * script units per VK element + the observed script overhead; ZK-07) and whose compute mass fits a block;
 * the fee is derived from the mass kaspa-wasm reports for the real transaction plus the compute-budget term.
 * Every result carries the lock's authorization-model warning (ZK_LOCK_BINDS_IMAGE_ID_ONLY, HK-16, or
 * ZK_LOCK_BINDS_IMAGE_ID_AND_OUTPUTS); public networks are refused for public vectors. In proof-and-output-bound
 * mode the outputs are exactly the bound ones and the fee is what the UTXO holds beyond them; any fee above the cap
 * (feeOptions.maxFeeSompi, default DEFAULT_MAX_FEE_CAP_SOMPI) is refused (ZK_FEE_ABOVE_CAP).
 * The emitted ZK fact records the real image id, the SHA-256 of the proof BYTES, no placeholder and no
 * clock (HK-20); verifiedOffChain is true only with a genuine verifyR0Groth16ReceiptLocal result (HK-17).
 *
 * Mainnet (any spelling: `mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case) throws MAINNET_SIGNING_DISABLED
 * before anything is read or built (MAINNET TOTAL LOCKDOWN, crypto review H5): a ZK spend carries no signature, its
 * signature script (journal hash, proof, redeem script) IS the authorization, so the transaction this returns is complete
 * and any tool could broadcast it. The guard decides from the declared network (a Kaspa transaction does not commit to one).
 */
export function buildR0Groth16Transaction(params: BuildR0Groth16TxParams): R0Groth16TxResult {
  assertMainnetTransactionsDisabled("sign", [params?.networkId], "buildR0Groth16Transaction");
  const issues: ZkIssue[] = [];
  const bindingMode = params.scripts?.bindingMode ?? "proof-only";
  const bindingPolicy = params.scripts?.bindingPolicy;
  const warnings: ZkIssue[] = [{ ...zkLockAuthorizationWarning(bindingMode, bindingPolicy) }];
  const networkId = params.networkId ?? "simnet";
  const computeBudget = params.computeBudget ?? DEFAULT_ZK_COMPUTE_BUDGET;
  const destinationAddress = String(params.destinationAddress ?? "").trim();

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
    empty.consensusEnforced = false;
    return empty;
  }
  if (params.mathVerified === true) {
    warnings.push({
      code: "ZK_CALLER_VERIFICATION_CLAIM_IGNORED",
      message:
        "mathVerified is ignored: the caller cannot assert off-chain verification of a RISC Zero receipt. Pass the result of verifyR0Groth16ReceiptLocal as localVerification."
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
    // The redeem script refuses an input above the bound outputs plus the fee cap: such a UTXO stays locked.
    if (typeof params.utxo?.amountSompi === "bigint" && params.utxo.amountSompi > boundMaxInputSompi(bindingPolicy)) {
      issues.push({
        code: "ZK_BOUND_INPUT_ABOVE_LOCK_LIMIT",
        message: `The UTXO holds ${params.utxo.amountSompi} sompi, above the ${boundMaxInputSompi(bindingPolicy)} sompi the lock accepts (bound outputs + fee cap): the node would reject the spend.`
      });
    }
  }

  const publicVector = params.scripts ? findPublicR0TestVector(params.scripts.imageId, params.scripts.journalHash) : undefined;
  if (publicVector && networkId !== "simnet") {
    issues.push({
      code: "ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED",
      message: `This is a PUBLIC test vector (${publicVector.name}): anyone can spend its lock, so HardKAS builds it for simnet only.`
    });
  }
  const p2shAddress = params.scripts ? p2shAddressFor(params.scripts, networkId) : undefined;
  if (!p2shAddress && !publicVector) {
    issues.push({
      code: "ZK_P2SH_ADDRESS_UNAVAILABLE",
      message:
        bindingMode === "proof-and-output-bound"
          ? `The scripts carry no P2SH address for '${networkId}': build them with addressNetworks including it.`
          : `The scripts carry no P2SH address for '${networkId}': build them with addressNetworks including it and acknowledgeImageIdOnlyLock.`
    });
  }
  if (issues.length > 0) {
    const estimate = estimateToccataZkFee(computeBudget, REFERENCE_BASE_COMPUTE_MASS, params.feeOptions);
    const empty = emptyTxResult(estimate, computeBudget, params.feeSompi ?? estimate.recommendedSompi, destinationAddress, networkId, warnings, issues);
    empty.bindingMode = bindingMode;
    empty.consensusEnforced = false;
    return empty;
  }

  try {
    // Pass 1: measure the real non-contextual mass (the output value is 8 bytes whatever the fee).
    const mass: bigint = params.baseComputeMass ?? measureR0Groth16SpendMass({ ...params, networkId }, computeBudget);
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

    // Fee cap, fail closed (N-6). In bound mode a UTXO funded beyond the bound outputs would hand the excess to the miner.
    const maxFeeSompi =
      (bindingMode === "proof-and-output-bound" ? bindingPolicy?.maxFeeSompi : undefined) ??
      params.feeOptions?.maxFeeSompi ??
      DEFAULT_MAX_FEE_CAP_SOMPI;
    if (feeSompi > maxFeeSompi) {
      issues.push({
        code: "ZK_FEE_ABOVE_CAP",
        message:
          bindingMode === "proof-and-output-bound"
            ? `The UTXO (${params.utxo.amountSompi} sompi) holds ${feeSompi} sompi beyond the bound outputs; as a fee that exceeds the cap ${maxFeeSompi}. Fund the lock with the bound outputs plus the fee, or raise feeOptions.maxFeeSompi explicitly.`
            : `Fee ${feeSompi} sompi exceeds the cap ${maxFeeSompi}; raise feeOptions.maxFeeSompi explicitly.`
      });
      return emptyTxResult(feeEstimate, computeBudget, feeSompi, destinationAddress, networkId, warnings, issues, bindingMode);
    }

    if (feeSompi < feeEstimate.minimumRequiredSompi) {
      const belowMinimum = {
        code: bindingMode === "proof-and-output-bound" ? "ZK_BOUND_FEE_BELOW_MEMPOOL_MINIMUM" : "ZK_FEE_BELOW_MEMPOOL_MINIMUM",
        message:
          bindingMode === "proof-and-output-bound"
            ? `The UTXO leaves ${feeSompi} sompi of fee beyond the bound outputs, below the mempool minimum ${feeEstimate.minimumRequiredSompi} sompi for compute mass ${feeEstimate.computeMass}: the node will not relay this spend, and the bound outputs cannot change. Fund the lock with requiredFundingSompi.`
            : `Fee of ${feeSompi} sompi is below the standard mempool minimum of ${feeEstimate.minimumRequiredSompi} sompi for compute mass ${feeEstimate.computeMass}`
      };
      // proof-only: the caller can raise the fee, so it stays a warning; bound: nothing can fix it, so it is an issue.
      if (bindingMode === "proof-and-output-bound") issues.push(belowMinimum);
      else warnings.push(belowMinimum);
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

    // Consensus allowance and block limit (ZK-07).
    const vkElements = groth16VkElementsInRedeemScript(params.scripts.redeemScript) ?? R0_GROTH16_VK_ELEMENTS;
    const minimumBudget = minimumR0Groth16ComputeBudget(vkElements);
    if (computeBudget < minimumBudget) {
      issues.push({
        code: "ZK_COMPUTE_BUDGET_INSUFFICIENT",
        message:
          `computeBudget ${computeBudget} allows ${BigInt(computeBudget) * SCRIPT_UNITS_PER_COMPUTE_BUDGET_UNIT + FREE_SCRIPT_UNITS_PER_INPUT} script units, ` +
          `but the spend needs about ${R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS + GROTH16_PRECOMPILE_COST_SCRIPT_UNITS + BigInt(vkElements) * GROTH16_VK_ELEMENT_COST_SCRIPT_UNITS} ` +
          `(Groth16 tag ${GROTH16_PRECOMPILE_COST_SCRIPT_UNITS} + ${vkElements} VK elements x ${GROTH16_VK_ELEMENT_COST_SCRIPT_UNITS} + observed overhead ${R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS}): minimum ${minimumBudget}. The node would reject it.`
      });
    }
    if (feeEstimate.computeMass > BLOCK_COMPUTE_MASS_LIMIT) {
      issues.push({
        code: "ZK_TX_EXCEEDS_BLOCK_COMPUTE_MASS_LIMIT",
        message: `Compute mass ${feeEstimate.computeMass} (budget term included) exceeds the block compute-mass limit ${BLOCK_COMPUTE_MASS_LIMIT}: no block can include this transaction.`
      });
    }

    // Pass 2: the real transaction with the final fee.
    const tx = makeR0Groth16SpendTx(kaspa, { ...params, destinationAddress }, computeBudget, feeSompi);
    // The non-contextual mass is checked against the standard limit; the compute mass (budget term
    // included) against the block limit above.
    const withinStandardMaxMass = mass <= STANDARD_MAX_TRANSACTION_MASS;
    if (mass > STANDARD_MAX_TRANSACTION_MASS) {
      issues.push({
        code: "ZK_TX_EXCEEDS_MAX_STANDARD_MASS",
        message: `Transaction mass ${mass} exceeds standard max mass ${STANDARD_MAX_TRANSACTION_MASS}`
      });
    }

    const planArtifact = buildR0Groth16Plan({
      ...params,
      networkId,
      destinationAddress,
      feeSompi,
      baseComputeMass: mass
    });
    const planIdCheck = checkArtifactIdentity(planArtifact);
    const planArtifactId = planIdCheck.ok ? planIdCheck.artifactId : undefined;
    // What the payout output receives: the bound payout amount, or the UTXO minus the fee.
    const finalOutputAmount = r0SpendOutputs({ ...params, destinationAddress }, feeSompi)[0]!.amountSompi;

    // Off-chain verification status: only HardKAS's own verifier can set it (HK-17).
    let offChainVerification: "VERIFIED" | "NOT_PERFORMED" = "NOT_PERFORMED";
    const lv = params.localVerification;
    if (lv !== undefined) {
      if (
        isHardkasR0Groth16Verification(lv) &&
        lv.verified &&
        lv.imageId === params.scripts.imageId &&
        lv.journalHash === params.scripts.journalHash &&
        lv.compressedProof === params.scripts.preparedProof
      ) {
        offChainVerification = "VERIFIED";
      } else {
        warnings.push({
          code: "ZK_LOCAL_VERIFICATION_NOT_ACCEPTED",
          message:
            "localVerification is not a verified verifyR0Groth16ReceiptLocal result for this image id, journal and proof: the fact records NOT_PERFORMED."
        });
      }
    }

    let zkFact: ZkVerificationFact | undefined;
    if (issues.length === 0) {
      try {
        zkFact = createZkVerificationFactArtifact({
          networkId,
          provingSystem: "Groth16",
          curve: "BN254",
          guestSystem: "RISC Zero",
          imageId: params.scripts.imageId,
          journalHash: params.scripts.journalHash,
          // H6: a record of these bytes, never an identity — Groth16 is malleable ((A,B,C) → (r⁻¹A, rB, C) is valid too)
          proofSha256: sha256Hex(Buffer.from(params.scripts.preparedProof, "hex")),
          verifiedOffChain: offChainVerification === "VERIFIED",
          offChainVerification,
          ...(offChainVerification === "VERIFIED" ? { offChainVerifier: R0_GROTH16_VERIFIER_ID } : {}),
          spendUtxo: {
            transactionId: params.utxo.transactionId,
            index: params.utxo.index,
            amountSompi: String(params.utxo.amountSompi)
          },
          p2shAddress: p2shAddress as string,
          redeemScriptHash: params.scripts.redeemScriptHash,
          payoutAddress: destinationAddress,
          payoutSompi: String(finalOutputAmount),
          computeBudget,
          feeSompi: String(feeSompi),
          txId: String(tx.id),
          ...(planArtifactId ? { planArtifactId } : {}),
          ...(params.timestamp !== undefined ? { timestamp: params.timestamp } : {})
        });
      } catch (error: any) {
        issues.push({
          code: "ZK_FACT_BUILD_FAILED",
          message: `The ZK fact could not be built: ${error instanceof Error ? error.message : String(error)}`
        });
      }
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
      consensusEnforced: bindingMode === "proof-and-output-bound" && issues.length === 0,
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
    empty.consensusEnforced = false;
    return empty;
  }
}

/** split_digest(R0_GROTH16_CONTROL_ROOT) as the R0 Groth16 verifier fragment pushes it: each 16-byte half, zero-padded. */
const R0_CONTROL_ROOT_HALF_PUSHES: readonly string[] = [
  R0_GROTH16_CONTROL_ROOT.slice(0, 32) + "00".repeat(16),
  R0_GROTH16_CONTROL_ROOT.slice(32) + "00".repeat(16)
];

/**
 * The integer an op pushes as a script number: OP_0, OP_1NEGATE, OP_1..OP_16, or a data push of at most 8 bytes
 * (little-endian magnitude, sign in the top bit of the last byte). Undefined for anything else.
 */
function scriptNumberOf(op: KaspaScriptOp | undefined): bigint | undefined {
  if (!op) return undefined;
  if (op.opcode === 0x4f) return -1n;
  if (op.opcode >= 0x51 && op.opcode <= 0x60) return BigInt(op.opcode - 0x50);
  if (op.data === undefined) return undefined;
  const buf = Buffer.from(op.data, "hex");
  if (buf.length === 0) return 0n;
  if (buf.length > 8) return undefined;
  let value = 0n;
  for (let b = buf.length - 1; b >= 0; b--) value = (value << 8n) | BigInt(b === buf.length - 1 ? buf[b]! & 0x7f : buf[b]!);
  return (buf[buf.length - 1]! & 0x80) !== 0 ? -value : value;
}

interface R0BoundLockParameters {
  outputs: R0BoundOutputCheck[];
  maxInputSompi: bigint;
}

/**
 * Reads back the parameters of the output-bound part of a redeem script (the ops after the verifier fragment), in the
 * layout r0BoundRedeemScript writes. A string says why it cannot: then nothing is claimed about the lock's outputs. The
 * reading only proposes parameters; the decision is the byte comparison with the rebuilt script.
 */
function readR0BoundTail(ops: readonly KaspaScriptOp[]): R0BoundLockParameters | string {
  let i = 0;
  const next = () => ops[i++];
  const opIs = (code: number) => {
    const op = next();
    return op !== undefined && op.opcode === code && op.data === undefined;
  };
  const num = () => scriptNumberOf(next());
  if (!opIs(0x69)) return "the Groth16 verifier is not followed by OpVerify";
  if (!opIs(0xb4)) return "no OpTxOutputCount check";
  const count = num();
  if (count !== 1n && count !== 2n) return "the output count is neither 1 (payout) nor 2 (payout and change)";
  if (!opIs(0x9d)) return "the output count is not compared (OpNumEqualVerify)";
  const outputs: R0BoundOutputCheck[] = [];
  for (let k = 0n; k < count; k++) {
    const what = k === 0n ? "payout (output 0)" : "change (output 1)";
    if (num() !== k || !opIs(0xc3)) return `no OpTxOutputSpk check of the ${what}`;
    const spk = next();
    if (spk?.data === undefined || !opIs(0x88)) return `the ${what} script public key is not compared (OpEqualVerify)`;
    if (num() !== k || !opIs(0xc2)) return `no OpTxOutputAmount check of the ${what}`;
    const amount = num();
    if (amount === undefined || !opIs(0x9d)) return `the ${what} amount is not compared (OpNumEqualVerify)`;
    outputs.push({ spkIntrospectionHex: spk.data, amountSompi: amount });
  }
  if (!opIs(0xb3) || num() !== 1n || !opIs(0x9d)) return "no one-input rule (OpTxInputCount 1 OpNumEqualVerify)";
  if (!opIs(0xb9) || !opIs(0xbe)) return "no input-amount limit (OpTxInputIndex OpTxInputAmount)";
  const maxInputSompi = num();
  if (maxInputSompi === undefined || !opIs(0xa1) || !opIs(0x69)) return "the input amount is not limited (OpLessThanOrEqual OpVerify)";
  if (!opIs(0x51)) return "the script does not end with OpTrue";
  if (i !== ops.length) return `${ops.length - i} opcode(s) follow OpTrue`;
  return { outputs, maxInputSompi };
}

/**
 * Verification of RISC Zero Groth16 redeem and signature scripts. It proves what the scripts ARE, not that they spend:
 * only the node runs the precompile.
 *  - Pinned verifier (crypto review H1): the verifying key handed to OpZkPrecompile (the push right before the Groth16
 *    tag) must be R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX, and the script must push the pinned control root (split
 *    into its two 16-byte halves) and BN254 control id (risc0 v3.0.4). Any other key is refused even when the script
 *    pushes the right image id: whoever knows its trapdoor forges receipts (ZK_VERIFYING_KEY_NOT_PINNED,
 *    ZK_CONTROL_ROOT_NOT_PINNED, ZK_CONTROL_ID_NOT_PINNED).
 *  - Byte-exact reconstruction (H2): the image id is read from the script's first push and, in output-bound mode, the
 *    outputs and the input limit from what follows the verifier; the script is then rebuilt with the builders
 *    buildR0Groth16Scripts uses (kaspa-wasm's verifier fragment, r0BoundRedeemScript) and compared byte for byte. Only
 *    an identical script is `redeemScriptCanonical`; only a canonical output-bound lock over the pinned verifier, with
 *    no issue, is `consensusEnforced` and gets its `enforces*` / `bound*` fields. Anything else is
 *    ZK_REDEEM_SCRIPT_NOT_CANONICAL: nothing is inferred from the presence of opcodes.
 *  - Expected outputs (payout, change) are compared with what a canonical output-bound lock binds; asked of any other
 *    script they are ZK_EXPECTED_BINDING_NOT_ENFORCED, never satisfied vacuously.
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
  const redeemPushes = ops.filter((op) => op.data !== undefined).map((op) => op.data as string);

  // H1 · the pinned RISC Zero verifier: the key the precompile is handed, the control root and the BN254 control id.
  const verifyingKeyHex = zkPrecompileIndex >= 2 ? ops[zkPrecompileIndex - 2]!.data : undefined;
  const verifyingKeyPinned = verifyingKeyHex === R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX;
  const controlRootPinned = R0_CONTROL_ROOT_HALF_PUSHES.every((half) => redeemPushes.includes(half));
  const controlIdPinned = redeemPushes.includes(R0_GROTH16_BN254_CONTROL_ID);
  if (hasOpZkPrecompile && !redeem.error) {
    if (verifyingKeyHex === undefined) {
      issues.push({
        code: "ZK_VERIFYING_KEY_NOT_FOUND",
        message: "No verifying key is pushed right before the Groth16 tag: the key the precompile verifies against is not in the script"
      });
    } else if (!verifyingKeyPinned) {
      issues.push({
        code: "ZK_VERIFYING_KEY_NOT_PINNED",
        message:
          `The verifying key handed to OpZkPrecompile (${verifyingKeyHex.length / 2} bytes) is not the pinned RISC Zero Groth16 key ` +
          "(R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX, risc0 v3.0.4 as rusty-kaspa 2.1.0 embeds it): whoever knows the trapdoor of " +
          "that key can forge a receipt for this image id. Do not fund this lock."
      });
    }
    if (!controlRootPinned) {
      issues.push({
        code: "ZK_CONTROL_ROOT_NOT_PINNED",
        message: `The redeem script does not push the pinned RISC Zero control root ${R0_GROTH16_CONTROL_ROOT} (as its two 16-byte halves): it verifies receipts of another recursion circuit set`
      });
    }
    if (!controlIdPinned) {
      issues.push({
        code: "ZK_CONTROL_ID_NOT_PINNED",
        message: `The redeem script does not push the pinned BN254 control id ${R0_GROTH16_BN254_CONTROL_ID}`
      });
    }
  }

  const isBoundMode = zkPrecompileIndex !== -1 && zkPrecompileIndex < ops.length - 1;
  const bindingMode: ZkBindingMode = isBoundMode ? "proof-and-output-bound" : "proof-only";
  if (isBoundMode && ops[zkPrecompileIndex + 1]!.opcode !== 0x69) {
    issues.push({
      code: "ZK_BINDING_MISSING_VERIFY",
      message: "OpZkPrecompile in bound mode must be immediately followed by OpVerify (0x69)"
    });
  }
  const enforcesUtxoBinding = isBoundMode && ops.some((op) => op.opcode === 0xba);
  if (enforcesUtxoBinding) {
    issues.push({
      code: "ZK_UTXO_BINDING_UNSATISFIABLE",
      message:
        "The redeem script binds the spent outpoint (OpOutpointTxId): the funding transaction's id commits to this P2SH, so no spend can satisfy it."
    });
  }

  // H2 · byte-exact reconstruction with the builders buildR0Groth16Scripts uses.
  let redeemScriptCanonical = false;
  let scriptImageId: string | undefined;
  let bound: R0BoundLockParameters | undefined;
  let notCanonical: string | undefined;
  const first = ops[0];
  if (hasOpZkPrecompile && !redeem.error) {
    if (first === undefined || first.opcode !== 0x20 || first.data?.length !== 64) {
      notCanonical = "it does not start with the 32-byte image id push of the RISC Zero Groth16 verifier";
    } else {
      try {
        const kaspa = loadManagedKaspaWasmSync();
        const candidateImageId = first.data;
        const fragment = r0Groth16VerifierFragment(kaspa, candidateImageId);
        if (!redeemHex.startsWith(fragment)) {
          notCanonical = "it is not the kaspa-wasm 2.1.0 RISC Zero Groth16 verifier for the image id it pushes";
        } else if (redeemHex.length === fragment.length) {
          redeemScriptCanonical = true;
          scriptImageId = candidateImageId;
        } else {
          const tail = parseKaspaScript(redeemHex.slice(fragment.length));
          const read = tail.error ?? readR0BoundTail(tail.ops);
          if (typeof read === "string") {
            notCanonical = `its output-bound part cannot be read back unambiguously (${read})`;
          } else if (r0BoundRedeemScript(kaspa, candidateImageId, read.outputs, read.maxInputSompi) !== redeemHex) {
            notCanonical = "its bytes differ from the output-bound lock HardKAS builds for the outputs and the input limit it carries";
          } else {
            redeemScriptCanonical = true;
            scriptImageId = candidateImageId;
            bound = read;
          }
        }
      } catch (error: any) {
        issues.push({
          code: "ZK_SCRIPT_RECONSTRUCTION_FAILED",
          message: `The redeem script could not be rebuilt with the pinned kaspa-wasm builder (${error instanceof Error ? error.message : String(error)}): nothing about it is claimed.`
        });
      }
    }
  }
  if (notCanonical !== undefined) {
    issues.push({
      code: "ZK_REDEEM_SCRIPT_NOT_CANONICAL",
      message:
        `The redeem script is not byte-identical to the script HardKAS builds for the parameters it carries: ${notCanonical}. ` +
        "consensusEnforced cannot be asserted, and nothing about its verifier, outputs or inputs is claimed."
    });
  }

  const payout = bound?.outputs[0];
  const change = bound?.outputs[1];
  const canonicalBound = bound !== undefined;
  for (const [what, output] of [["payout", payout], ["change", change]] as const) {
    // A bound SPK that is not the version-prefixed introspection encoding can never match a standard output.
    if (output && !/^0000/.test(output.spkIntrospectionHex)) {
      issues.push({
        code: "ZK_BOUND_SPK_NOT_INTROSPECTION_ENCODED",
        message: `The bound ${what} SPK '${output.spkIntrospectionHex}' does not start with the u16 version OpTxOutputSpk pushes: no standard output matches it`
      });
    }
  }

  if (params.expectedBindingMode && params.expectedBindingMode !== bindingMode) {
    issues.push({
      code: "ZK_BINDING_MODE_MISMATCH",
      message: `Expected script binding mode '${params.expectedBindingMode}' but script is '${bindingMode}'`
    });
  }

  const expectsPayoutAddress = typeof params.expectedPayoutAddress === "string" && params.expectedPayoutAddress !== "";
  const expectsChangeAddress = typeof params.expectedChangeAddress === "string" && params.expectedChangeAddress !== "";
  const expectsOutputs =
    expectsPayoutAddress || expectsChangeAddress || params.expectedPayoutAmount !== undefined || params.expectedChangeAmount !== undefined;
  if (expectsOutputs && !canonicalBound) {
    issues.push({
      code: "ZK_EXPECTED_BINDING_NOT_ENFORCED",
      message:
        "Expected outputs were given, but this redeem script is not an output-bound lock HardKAS can rebuild byte for byte: it enforces none of them."
    });
  }
  const compareSpk = (what: "payout" | "change", address: string, boundSpk: string, code: string) => {
    try {
      const kaspa = loadManagedKaspaWasmSync();
      const expectedSpk = spkIntrospectionBytesHex(kaspa.payToAddressScript(new kaspa.Address(address)));
      // The bound value must be what OpTxOutputSpk pushes: version (u16 BE) ++ script. A script-only value never matches.
      if (boundSpk.toLowerCase() !== expectedSpk) {
        issues.push({
          code,
          message: `Script binds ${what} SPK '${boundSpk}' which is not the introspection encoding of '${address}' (${expectedSpk})`
        });
      }
    } catch (e: any) {
      issues.push({ code: "ZK_EXPECTED_ADDRESS_INVALID", message: `Invalid expected ${what} address: ${e?.message ?? String(e)}` });
    }
  };
  if (expectsPayoutAddress && payout) compareSpk("payout", params.expectedPayoutAddress!, payout.spkIntrospectionHex, "ZK_BOUND_PAYOUT_SPK_MISMATCH");
  if (params.expectedPayoutAmount !== undefined && payout && payout.amountSompi !== params.expectedPayoutAmount) {
    issues.push({
      code: "ZK_BOUND_PAYOUT_AMOUNT_MISMATCH",
      message: `Script binds payout amount ${payout.amountSompi} sompi which does not match expected ${params.expectedPayoutAmount} sompi`
    });
  }
  if (canonicalBound && (expectsChangeAddress || params.expectedChangeAmount !== undefined) && !change) {
    issues.push({ code: "ZK_BOUND_CHANGE_MISSING", message: "A change output was expected, but the lock binds a single output (no change)" });
  }
  if (expectsChangeAddress && change) compareSpk("change", params.expectedChangeAddress!, change.spkIntrospectionHex, "ZK_BOUND_CHANGE_SPK_MISMATCH");
  if (params.expectedChangeAmount !== undefined && change && change.amountSompi !== params.expectedChangeAmount) {
    issues.push({
      code: "ZK_BOUND_CHANGE_AMOUNT_MISMATCH",
      message: `Script binds change amount ${change.amountSompi} sompi which does not match expected ${params.expectedChangeAmount} sompi`
    });
  }

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
    imageIdFound = scriptImageId !== undefined ? scriptImageId === targetImageId : redeemPushes.some((d) => d === targetImageId);
    if (!imageIdFound) {
      issues.push({
        code: "ZK_IMAGE_ID_MISMATCH",
        message:
          scriptImageId !== undefined
            ? `The redeem script commits to image id '${scriptImageId}', not '${targetImageId}'`
            : `Image ID '${targetImageId}' is not pushed as a 32-byte item in the redeem script`
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
    redeemScriptCanonical,
    ...(scriptImageId !== undefined ? { scriptImageId } : {}),
    verifyingKeyPinned,
    controlRootPinned,
    controlIdPinned,
    bindingMode,
    consensusEnforced:
      canonicalBound && verifyingKeyPinned && controlRootPinned && controlIdPinned && issues.length === 0,
    enforcesSingleInput: canonicalBound,
    enforcesInputAmountLimit: canonicalBound,
    hasOutputIntrospection: canonicalBound,
    enforcesOutputCount: canonicalBound,
    enforcesPayoutSpk: canonicalBound,
    enforcesPayoutAmount: canonicalBound,
    enforcesChangeSpk: change !== undefined,
    enforcesChangeAmount: change !== undefined,
    enforcesUtxoBinding,
    ...(bound ? { boundOutputCount: bound.outputs.length, boundMaxInputSompi: bound.maxInputSompi } : {}),
    ...(payout ? { boundPayoutSpk: payout.spkIntrospectionHex, boundPayoutAmount: payout.amountSompi } : {}),
    ...(change ? { boundChangeSpk: change.spkIntrospectionHex, boundChangeAmount: change.amountSompi } : {}),
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
    groth16VkElementCostScriptUnits: Number(GROTH16_VK_ELEMENT_COST_SCRIPT_UNITS),
    r0Groth16VkElements: R0_GROTH16_VK_ELEMENTS,
    r0Groth16ObservedOverheadScriptUnits: Number(R0_GROTH16_OBSERVED_SCRIPT_OVERHEAD_SCRIPT_UNITS),
    minimumR0Groth16ComputeBudget: minimumR0Groth16ComputeBudget(),
    maximumComputeBudgetForBlockReferenceShape: Number(
      (BLOCK_COMPUTE_MASS_LIMIT - REFERENCE_BASE_COMPUTE_MASS) / GRAMS_PER_COMPUTE_BUDGET_UNIT
    ),
    blockComputeMassLimit: Number(BLOCK_COMPUTE_MASS_LIMIT),
    authorizationModel: "IMAGE_ID_ONLY",
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
  // The network is the caller's or the fact's, never assumed (an observation attributed to simnet by default would be
  // evidence for the wrong network). The observer is this client's endpoint on that network, as sdk.tx derives it.
  const networkId = params.networkId ?? (params.zkFact?.networkId as TxObservation["networkId"] | undefined);
  if (!networkId) {
    throw new Error("ZK_OBSERVE_NETWORK_REQUIRED: observeZkSpendOnce needs networkId (or a zkFact that records it)");
  }
  const locator = rpcEndpointOf(client);
  const observation = await observeTxOnce(
    recorder,
    {
      txId: params.txId,
      observerId: params.observerId ?? deriveObserverId({ kind: "rpc", target: String(networkId), ...(locator !== undefined ? { locator } : {}) }),
      networkId,
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
