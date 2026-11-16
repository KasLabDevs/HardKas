import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createEscrow,
  escrowResolution,
  escrowSigners,
  ESCROW_FULL_BRANCHES,
  ESCROW_SPLIT_BRANCHES,
  type EscrowArtifact,
  type EscrowBranch,
  type EscrowCompileProvenance,
  type EscrowConfig,
  type EscrowState
} from "@hardkas/escrow";
import {
  HardkasError,
  HardkasSchemas,
  assertMainnetTransactionsDisabled,
  declaredNetworkIdOf,
  kaspaSighashInputsFromWasm,
  loadManagedKaspaWasmSync,
  plainChildPath,
  systemRuntimeContext,
  verifyKaspaInputSignature,
  withLock
} from "@hardkas/core";
import { addressMatchesNetwork, finalizeSilverSpend, prepareSilverSpend, resolveAccountPrivateKey, signSilverSpend } from "@hardkas/accounts";
import { isNodeNetworkIdentityError, isRpcRequestNotSentError, officialTransactionWithUtxos } from "@hardkas/kaspa-rpc";
import {
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION,
  HARDKAS_VERSION,
  calculateContentHash,
  createLineageTransition,
  createTxPlanArtifact,
  expectedScriptPublicKeyHex,
  recomputeMass,
  submitOutcomeOf,
  verifyFeeSemantics
} from "@hardkas/artifacts";
import type { Hardkas } from "./index.js";
import { assertSdkMayConnect } from "./mainnet-lockdown.js";

/*
 * ESCROW-LIFECYCLE-1 · the v2 escrow (EscrowFull, EscrowSplit) lifecycle outside the dev server.
 *
 * Two layers in one module:
 *  1. The RULES of the lifecycle, moved here unchanged from the dev server's escrow routes (packages/dev-server/src/
 *     routes/escrow.ts), which now call them: what a funding pays (principal + fee budget), the G3 check of every
 *     release's fee against the node's minimum relay fee before funding, one funding per escrow, the fee ceiling and the
 *     node's floor of a prepared release, who must sign which branch, the policy and outputs hashes, BIP340 verification
 *     of every required signature before anything is sent, and the state a node's answer moves a record to. Each
 *     refusal carries the HTTP status and body the routes always answered (`EscrowRefusal`), so the routes keep their
 *     status codes and JSON byte for byte.
 *  2. `sdk.escrow` (HardkasEscrow): the same lifecycle for a workspace — records in `.hardkas/escrows/`, any node the
 *     instance proves (its endpoint; no hard-wired URL), keys of the workspace's accounts (development accounts and
 *     encrypted keystores with their owner's password, as `silver spend`), and every transaction sent through
 *     `sdk.tx.send` (one submission per txId, node identity and sync, the plan check and fee limit, its records). The
 *     funding is a payment planned, signed and sent by the SDK's payment path; the release is the multi-party SilverScript
 *     spend wrapped in a plan and a signed artifact of this workspace. It never signs on its own: each signature is the
 *     caller's explicit act with its own account (the dev server's autosign policy stays the dev server's).
 * Mainnet is refused before any record, key or node is touched (MAINNET_CONNECTION_DISABLED, and the signing and
 * broadcast guards behind it).
 */

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type EscrowDomainState = "CREATED" | "FUNDED" | "PARTIALLY_SIGNED" | "READY_TO_RELEASE" | "RELEASED";

export interface EscrowRecord {
  id: string;
  config: EscrowConfig;
  state: EscrowDomainState;
  artifact: EscrowArtifact;
  p2shState: EscrowState;
  provenance: EscrowCompileProvenance;
  /** sdk.escrow records only (the dev server's journal never writes them): the record's schema, network and times. */
  schema?: string | undefined;
  networkId?: string | undefined;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;

  funding: {
    /**
     * "broadcast" = accepted by the node mempool; "confirmed" only after observing it in the chain;
     * "verification_timeout" = sent, outcome not known yet (ESCROW-SAFETY-2: never funded again before reconcile).
     */
    status: "none" | "broadcast" | "confirmed" | "failed" | "verification_timeout";
    transactionId?: string | undefined;
    outputIndex?: number | undefined;
    amountSompi?: string | undefined;
    feeSompi?: string | undefined;
    utxoEntry?: any;
    /** ESCROW-SAFETY-2: the chain block the node's virtual chain ended at before it was sent (where reconcile looks from). */
    observeFrom?: string | undefined;
  };

  preparedRelease?: {
    branch: string;
    /** hardkas.silver.spendDraft.v1: the one transaction every signer signs. */
    draft: any;
    args: { kind: "signer"; signer: string }[];
    expectedOutputsHash: string;
    policyHash: string;
    /** sdk.escrow: the mutualRelease allocation the release was prepared with, when one was given (sompi, decimal). */
    mutualSplit?: { buyerSompi: string; sellerSompi: string } | undefined;
  };

  /** 65-byte sig values (hex), by role. */
  signatures: {
    buyer?: string;
    seller?: string;
    arbiter?: string;
  };

  release?:
    | {
        transactionId: string;
        fundingOutpoint: string;
        expectedOutputsHash: string;
        actualOutputsHash: string;
        /** Undefined when it cannot be derived from recorded amounts. */
        feeSompi?: string | undefined;
        status: "broadcast" | "confirmed" | "failed" | "verification_timeout";
        /** ESCROW-SAFETY-2: the chain block the node's virtual chain ended at before it was sent. */
        observeFrom?: string | undefined;
      }
    | undefined;
}

/**
 * A refusal of a lifecycle step, with the HTTP answer the dev server's routes always gave for it: `status`, the body's
 * `error` text and, only where the route's body carried one, its `code` field (`bodyCode`). `code` is always set for SDK
 * callers (a HardkasError code).
 */
export interface EscrowRefusal {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly error: string;
  readonly bodyCode?: true | undefined;
}

const refuse = (status: number, code: string, error: string, bodyCode = false): EscrowRefusal => ({
  ok: false,
  status,
  code,
  error,
  ...(bodyCode ? { bodyCode: true as const } : {})
});

/** The dev server's HTTP body of a refusal: `{ ok: false, [code], error }`, as the routes always wrote it. */
export function escrowRefusalBody(r: EscrowRefusal): { ok: false; code?: string; error: string } {
  return { ok: false, ...(r.bodyCode ? { code: r.code } : {}), error: r.error };
}

/** A refusal as the SDK throws it: a HardkasError whose message starts with the code once. */
export function escrowRefusalError(r: EscrowRefusal): HardkasError {
  const text = r.error.startsWith(`${r.code}:`) ? r.error.slice(r.code.length + 1).trim() : r.error;
  return new HardkasError(r.code, text);
}

// ---------------------------------------------------------------------------
// The rules (shared with the dev server's routes, unchanged)
// ---------------------------------------------------------------------------

/** The default fee budget of a v2 escrow: the fee of every release (the contract fixes the outputs). */
export const ESCROW_DEFAULT_FEE_BUDGET_SOMPI = 2_000_000n;
/** The fee ceiling of a release when the escrow sets no budget (0.025 KAS). */
export const ESCROW_DEFAULT_FEE_CEILING_SOMPI = 2_500_000n;

// Who receives what per branch. The arbiter branches are fixed by the contract;
// mutualRelease leaves the destination to the signers and this app pays the buyer.
const resolutionPolicy: Record<string, { requiredSigners: string[]; recipient: string; amountKey: string }> = {
  mutualRelease: { requiredSigners: ["buyer", "seller"], recipient: "buyer", amountKey: "refundAmount" },
  refundBuyer: { requiredSigners: ["buyer", "arbiter"], recipient: "buyer", amountKey: "refundAmount" },
  releaseToSeller: { requiredSigners: ["seller", "arbiter"], recipient: "seller", amountKey: "releaseAmount" }
};

/** sha256 of the JSON of `value`: the outputs hash and the policy hash of a prepared release. */
export const escrowOutputsHash = (outputs: unknown): string => crypto.createHash("sha256").update(JSON.stringify(outputs)).digest("hex");

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A legacy v1 escrow record (no budget: its two branches pay refundAmount and releaseAmount). */
export function escrowIsLegacy(config: EscrowConfig): boolean {
  return config.version === "v1" || (!config.version && !config.principal && !config.mode && !config.feeBudgetSompi);
}

/** The mode a record's release is prepared in: `config.mode`, else split when both split amounts are given. */
export function escrowModeOf(config: EscrowConfig): "full" | "split" {
  return (config.mode ?? (config.buyerAmount !== undefined && config.sellerAmount !== undefined ? "split" : "full")) === "split" ? "split" : "full";
}

/**
 * What a funding pays into the escrow: a legacy v1 escrow its two amounts; a v2 escrow its principal (EscrowFull) or
 * its two allocations (EscrowSplit) plus the fee budget (default 2,000,000 sompi), the fee of every release. The
 * default budget is a few times the node's minimum relay fee of an escrow release (about 300,000–600,000 sompi, 100
 * sompi/g of its compute mass); escrowReleaseFeeCheck refuses a budget under that minimum before anything is sent (G3).
 */
export function escrowFundingAmount(config: EscrowConfig): bigint {
  const splitMode = config.mode === "split" || (config.buyerAmount !== undefined && config.sellerAmount !== undefined);
  if (escrowIsLegacy(config)) {
    return BigInt(config.refundAmount ?? 0) + BigInt(config.releaseAmount ?? 0);
  }
  if (splitMode) {
    const bAmt = BigInt(config.buyerAmount ?? config.refundAmount ?? 0);
    const sAmt = BigInt(config.sellerAmount ?? config.releaseAmount ?? 0);
    const feeBudget = BigInt(config.feeBudgetSompi ?? ESCROW_DEFAULT_FEE_BUDGET_SOMPI);
    return bAmt + sAmt + feeBudget;
  }
  const principal = BigInt(config.principal ?? (config.refundAmount !== undefined ? config.refundAmount : config.releaseAmount) ?? 0);
  const feeBudget = BigInt(config.feeBudgetSompi ?? ESCROW_DEFAULT_FEE_BUDGET_SOMPI);
  return principal + feeBudget;
}

/** A node UTXO entry (or a recorded funding entry) as the SilverScript spend builders take it. */
export function toEscrowContractUtxo(entry: any) {
  const u = entry.utxoEntry ?? entry;
  const spk = u.scriptPublicKey;
  const scriptPublicKey =
    spk && typeof spk === "object"
      ? { version: Number(spk.version ?? 0), script: String(spk.scriptPublicKey ?? spk.script ?? "") }
      : { version: parseInt(String(spk).slice(0, 4), 16) || 0, script: String(spk).slice(4) };
  return {
    outpoint: { transactionId: entry.outpoint.transactionId, index: Number(entry.outpoint.index) },
    amountSompi: BigInt(u.amount),
    scriptPublicKey,
    blockDaaScore: BigInt(u.blockDaaScore ?? 0),
    isCoinbase: !!u.isCoinbase
  };
}

/**
 * G3 · before an escrow is funded, each branch of its contract, with the outputs the lifecycle prepares for it (the
 * default resolution), is drafted against the funding it would receive (prepareSilverSpend, offline: the node's
 * minimum relay fee and mass limits). The contract pins the outputs, so the fee of every release is what the funding
 * adds to them (the fee budget): below the node's minimum, the escrow could never be released by its one input, and it
 * is not funded. A branch whose default outputs are above the node's storage-mass limit (a small allocation) is only a
 * warning: another split or another branch still releases the escrow. Legacy v1 escrows (no budget) are not checked.
 */
export function escrowReleaseFeeCheck(
  record: EscrowRecord,
  totalAmount: bigint,
  mode: "full" | "split",
  networkId = "simnet"
): { refusal?: string; warnings: string[] } {
  const branches = Object.keys(mode === "split" ? ESCROW_SPLIT_BRANCHES : ESCROW_FULL_BRANCHES) as EscrowBranch[];
  const contractName = record.provenance?.contractName || (mode === "split" ? "EscrowSplit" : "EscrowFull");
  const warnings: string[] = [];
  for (const branch of branches) {
    let resolution: ReturnType<typeof escrowResolution>;
    try {
      resolution = escrowResolution(record.config, branch);
    } catch {
      continue;
    }
    if (!resolution.requiredOutputs || resolution.requiredOutputs.length === 0) continue;
    try {
      prepareSilverSpend({
        artifact: record.artifact,
        contractName,
        entry: branch,
        args: resolution.args,
        sigOpCount: mode === "split" ? 4 : undefined,
        utxo: {
          outpoint: { transactionId: "00".repeat(32), index: 0 },
          amountSompi: totalAmount,
          scriptPublicKey: { version: 0, script: record.p2shState.lockingScriptHex },
          blockDaaScore: 0n,
          isCoinbase: false
        },
        outputs: resolution.requiredOutputs.map((o) => ({ amountSompi: o.amountSompi, scriptPublicKey: o.scriptPublicKey })),
        networkId
      });
    } catch (e: any) {
      if (e?.code === "FEE_BELOW_NETWORK_MINIMUM") {
        return {
          refusal:
            `ESCROW_FEE_BUDGET_BELOW_MINIMUM: this escrow's release fee is its fee budget (${e.feeSompi} sompi: the contract fixes the outputs, the funding adds the fee), ` +
            `below the node's minimum relay fee for its ${branch} release (${e.minimumFeeSompi} sompi). Funded, it could not be released. ` +
            `Create the escrow with feeBudgetSompi of at least ${e.minimumFeeSompi}. Nothing was signed or sent.`,
          warnings
        };
      }
      if (e?.code === "TX_MASS_ABOVE_STANDARD_LIMIT") warnings.push(`${branch} with its default outputs cannot be released: ${messageOf(e)}`);
      // anything else (a record whose artifact does not rebuild its lock) is release/prepare's to report
    }
  }
  return { warnings };
}

/** ESCROW-SAFETY-2: an escrow is funded once; a funding whose outcome is unknown is reconciled, never followed by another. */
export function escrowFundingRefusal(record: EscrowRecord): EscrowRefusal | undefined {
  if (record.funding.status === "none") return undefined;
  return record.funding.status === "verification_timeout"
    ? refuse(
        409,
        "ESCROW_FUNDING_OUTCOME_UNKNOWN",
        `ESCROW_FUNDING_OUTCOME_UNKNOWN: funding ${record.funding.transactionId} was sent and its outcome is not known; reconcile it before funding again. Nothing was sent.`
      )
    : refuse(
        409,
        "ESCROW_ALREADY_FUNDED",
        `ESCROW_ALREADY_FUNDED: this escrow already has a funding (${record.funding.transactionId}, ${record.funding.status}). Nothing was sent.`
      );
}

/** G3 for a record about to be funded: the funding amount, and the refusal or the warnings of escrowReleaseFeeCheck. */
export function escrowFundingCheck(record: EscrowRecord, networkId = "simnet"): { totalAmount: bigint; refusal?: EscrowRefusal; warnings: string[] } {
  const totalAmount = escrowFundingAmount(record.config);
  // (the mode as release/prepare reads it)
  const releases = escrowIsLegacy(record.config) ? { warnings: [] as string[] } : escrowReleaseFeeCheck(record, totalAmount, escrowModeOf(record.config), networkId);
  return {
    totalAmount,
    warnings: releases.warnings,
    ...(releases.refusal ? { refusal: refuse(400, "ESCROW_FEE_BUDGET_BELOW_MINIMUM", releases.refusal, true) } : {})
  };
}

/** Anti-replay / uniqueness guard: an active (not released) escrow already at `address`. */
export function escrowAddressRefusal(records: Iterable<EscrowRecord>, address: string): EscrowRefusal | undefined {
  const duplicate = Array.from(records).find((r) => r.p2shState.address === address && r.state !== "RELEASED");
  if (!duplicate) return undefined;
  return refuse(
    409,
    "ESCROW_ADDRESS_ALREADY_ACTIVE",
    `ESCROW_ADDRESS_ALREADY_ACTIVE: active escrow ${duplicate.id} already exists for address ${address}. Escrow nonce ensures uniqueness; do not reuse parameters without nonce.`
  );
}

/** A new record for a compiled escrow (createEscrow's result), CREATED and unfunded. */
export function newEscrowRecord(id: string, result: Awaited<ReturnType<typeof createEscrow>>, config: EscrowConfig): EscrowRecord {
  return {
    id,
    config: result.effectiveConfig ?? config,
    state: "CREATED",
    artifact: result.artifact,
    p2shState: result.state,
    provenance: result.provenance,
    funding: { status: "none" },
    signatures: {}
  };
}

/** The signers a branch requires (a legacy record's own policy, else the contract's branch table). */
export function escrowPolicyOf(record: EscrowRecord, branch: string): { requiredSigners: string[]; recipient?: string; amountKey?: string } {
  const legPolicy = escrowIsLegacy(record.config) ? resolutionPolicy[branch] : undefined;
  if (legPolicy) return legPolicy;
  return { requiredSigners: [...escrowSigners(branch as any, escrowModeOf(record.config))] };
}

export interface EscrowPreparedRelease {
  readonly ok: true;
  readonly preparedRelease: NonNullable<EscrowRecord["preparedRelease"]>;
}

/**
 * The release of `branch` (and, for mutualRelease, the allocation `mutualSplit`), drafted over the recorded funding:
 * the outputs the branch pays, the fee they leave (at most the escrow's fee budget, or 2,500,000 sompi without one:
 * ESCROW_FEE_EXCESSIVE_REFUSED; at least the node's minimum relay fee for this very release: ESCROW_FEE_BELOW_MINIMUM)
 * and the one draft every required signer signs. The record is not changed (applyEscrowPreparedRelease does).
 */
export function prepareEscrowRelease(
  record: EscrowRecord | undefined,
  request: { branch: string; mutualSplit?: { buyerSompi: bigint | string; sellerSompi: bigint | string } | undefined },
  networkId = "simnet"
): EscrowRefusal | EscrowPreparedRelease {
  const branch = request.branch as EscrowBranch;
  const mutualSplit = request.mutualSplit;
  if (!record || !["FUNDED", "PARTIALLY_SIGNED", "READY_TO_RELEASE"].includes(record.state)) return refuse(400, "ESCROW_NOT_FUNDED", "Not funded");

  const fundingUtxo = record.funding.utxoEntry;
  if (!fundingUtxo || record.funding.transactionId === undefined || record.funding.outputIndex === undefined) {
    return refuse(409, "ESCROW_FUNDING_UTXO_UNKNOWN", "ESCROW_FUNDING_UTXO_UNKNOWN: no recorded funding UTXO to spend");
  }

  const mode = escrowModeOf(record.config);
  const isLegacy = escrowIsLegacy(record.config);

  const legPolicy = isLegacy ? resolutionPolicy[branch] : undefined;
  let policy: any;
  if (legPolicy) {
    policy = legPolicy;
  } else {
    let signers: readonly string[];
    try {
      signers = escrowSigners(branch as any, mode);
    } catch {
      return refuse(400, "ESCROW_BRANCH_UNKNOWN", "Invalid branch");
    }
    policy = { requiredSigners: [...signers] };
  }

  let resolution: ReturnType<typeof escrowResolution>;
  try {
    resolution = escrowResolution(
      record.config,
      branch,
      mutualSplit ? { mutualSplit: { buyerSompi: BigInt(mutualSplit.buyerSompi), sellerSompi: BigInt(mutualSplit.sellerSompi) } } : undefined
    );
  } catch (e: any) {
    const text = e?.message || "Invalid branch";
    const code = /^([A-Z][A-Z0-9_]+):/.exec(String(text))?.[1] ?? "ESCROW_BRANCH_UNKNOWN";
    return refuse(400, code, text);
  }

  let outputs: any[];
  if (resolution.requiredOutputs && resolution.requiredOutputs.length > 0) {
    outputs = resolution.requiredOutputs.map((o) => ({
      amountSompi: o.amountSompi,
      scriptPublicKey: o.scriptPublicKey
    }));
  } else {
    const targetSpk = (policy.recipient === "buyer" ? record.config.buyerDestinationSpk : record.config.sellerDestinationSpk) ?? "";
    const rawAmount = policy.amountKey === "refundAmount" ? record.config.refundAmount : record.config.releaseAmount;
    const amount = BigInt(rawAmount ?? 0);
    outputs = [{ amountSompi: amount, scriptPublicKey: { version: 0 as const, script: targetSpk } }];
  }

  // Safety checks on fee: inputs - outputs = miner fee
  const fundingAmountSompi = BigInt(record.funding.amountSompi ?? fundingUtxo.amount ?? fundingUtxo.amountSompi ?? 0);
  const totalOutputsSompi = outputs.reduce((sum, out) => sum + BigInt(out.amountSompi ?? out.valueSompi ?? 0), 0n);
  const effectiveFeeSompi = fundingAmountSompi - totalOutputsSompi;

  // Reject excessive fee: any fee exceeding the explicitly authorized feeBudgetSompi
  // (or default safe ceiling of 2,500,000 sompi / 0.025 KAS if unconfigured) is strictly refused.
  // This prevents silent fund inflation or user fund leakage into miner fees. G3: the ceiling is several times the
  // node's minimum relay fee of an escrow release (about 300,000–600,000 sompi); a budget below that minimum is refused
  // before funding (escrowReleaseFeeCheck) and a fee below it here, with the node's figure (ESCROW_FEE_BELOW_MINIMUM).
  const authorizedFeeCeilingSompi = record.config.feeBudgetSompi ? BigInt(record.config.feeBudgetSompi) : ESCROW_DEFAULT_FEE_CEILING_SOMPI;

  if (effectiveFeeSompi > authorizedFeeCeilingSompi) {
    return refuse(
      400,
      "ESCROW_FEE_EXCESSIVE_REFUSED",
      `ESCROW_FEE_EXCESSIVE_REFUSED: effective release fee (${effectiveFeeSompi} sompi) exceeds authorized fee budget of ${authorizedFeeCeilingSompi} sompi (${record.config.feeBudgetSompi ? "explicitly budgeted" : "default safe limit"}). Outputs sum ${totalOutputsSompi} sompi from ${fundingAmountSompi} sompi funding.`
    );
  }
  // G3: the minimum is the node's relay fee for this very release, measured by prepareSilverSpend below (it used to be a
  // fixed 10,000 sompi here, and the SDK's storage-inclusive figure in the builder)
  const belowMinimum = (minimum: string) =>
    refuse(
      400,
      "ESCROW_FEE_BELOW_MINIMUM",
      `ESCROW_FEE_BELOW_MINIMUM: effective release fee (${effectiveFeeSompi} sompi) is below ${minimum}. ` +
        `Outputs sum ${totalOutputsSompi} sompi from ${fundingAmountSompi} sompi funding.` +
        (record.config.feeBudgetSompi && !isLegacy ? ` The fee is this escrow's fee budget (feeBudgetSompi ${record.config.feeBudgetSompi}): the contract fixes the outputs.` : ""),
      true
    );
  if (effectiveFeeSompi <= 0n) return belowMinimum("zero: the outputs take the whole funding or more");

  const contractName = record.provenance?.contractName || (isLegacy ? "Escrow" : mode === "split" ? "EscrowSplit" : "EscrowFull");
  let draft: any;
  try {
    draft = prepareSilverSpend({
      artifact: record.artifact,
      contractName,
      entry: branch,
      args: resolution.args,
      sigOpCount: mode === "split" ? 4 : undefined,
      utxo: toEscrowContractUtxo({ outpoint: { transactionId: record.funding.transactionId, index: record.funding.outputIndex }, utxoEntry: fundingUtxo }),
      outputs,
      networkId
    });
  } catch (e: any) {
    if (e?.code === "FEE_BELOW_NETWORK_MINIMUM" && typeof e.minimumFeeSompi === "string") {
      return belowMinimum(`the node's minimum relay fee for this release (${e.minimumFeeSompi} sompi: 100 sompi/g of its compute mass)`);
    }
    return refuse(400, "ESCROW_PREPARE_FAILED", `ESCROW_PREPARE_FAILED: ${e?.message || String(e)}`);
  }

  return {
    ok: true,
    preparedRelease: {
      branch,
      draft,
      args: resolution.args.map((a) => ({ kind: "signer", signer: a.signer })),
      expectedOutputsHash: escrowOutputsHash(draft.outputs),
      policyHash: escrowOutputsHash(policy)
    }
  };
}

/** A prepared release becomes the record's: PARTIALLY_SIGNED, every earlier signature dropped (they signed another draft). */
export function applyEscrowPreparedRelease(record: EscrowRecord, prepared: EscrowPreparedRelease["preparedRelease"]): void {
  record.preparedRelease = prepared;
  record.state = "PARTIALLY_SIGNED";
  record.signatures = {};
}

/**
 * Whether `role` may sign the prepared release of `record`: a release is prepared, the branch requires the role, and
 * the funding UTXO the draft spends is recorded. Returns the branch's policy and the key the escrow names for the role.
 */
export function escrowSignCheck(
  record: EscrowRecord | undefined,
  role: string
): EscrowRefusal | { ok: true; policy: { requiredSigners: readonly string[] }; publicKeyHex: string } {
  if (!record || !record.preparedRelease) return refuse(400, "ESCROW_NOT_PREPARED", "Not prepared");
  const policy = escrowPolicyOf(record, record.preparedRelease.branch);
  if (!policy.requiredSigners.includes(role)) {
    return refuse(400, "ESCROW_ROLE_NOT_REQUIRED", `Role ${role} is not required for branch ${record.preparedRelease.branch}`);
  }
  const fundingUtxo = record.funding.utxoEntry;
  const fundingSpkHex = fundingUtxo?.scriptPublicKey?.scriptPublicKey || fundingUtxo?.scriptPublicKey?.script;
  if (!fundingUtxo || fundingUtxo.amount === undefined || !fundingSpkHex) {
    return refuse(409, "ESCROW_FUNDING_UTXO_UNKNOWN", "ESCROW_FUNDING_UTXO_UNKNOWN: no recorded funding UTXO to sign against");
  }
  return { ok: true, policy, publicKeyHex: String((record.config as any)[role]?.publicKeyHex ?? "") };
}

/** One signer's `sig` value over the prepared draft (signSilverSpend: the draft must rebuild to its id). */
export function escrowSignatureOf(record: EscrowRecord, privateKey: string): EscrowRefusal | { ok: true; signature: string } {
  try {
    return { ok: true, signature: signSilverSpend(record.preparedRelease!.draft, privateKey) };
  } catch (e: any) {
    return refuse(400, "ESCROW_SIGNER_FAILED", `ESCROW_SIGNER_FAILED: ${e?.message || String(e)}`);
  }
}

/** The role's signature in the record; READY_TO_RELEASE once every required signer signed. */
export function recordEscrowSignature(record: EscrowRecord, role: string, signature: string, policy: { requiredSigners: readonly string[] }): void {
  (record.signatures as any)[role] = signature;
  if (policy.requiredSigners.every((r) => !!(record.signatures as any)[r])) record.state = "READY_TO_RELEASE";
}

/**
 * Whether every signer the branch requires signed this spend: each signature valid (BIP340, SIGHASH_ALL) for the
 * finalized transaction, as it is sent, and the recorded funding output, by the key the escrow names for that role.
 * The reason it is not, otherwise.
 */
export function invalidEscrowReleaseSignature(
  record: EscrowRecord,
  requiredSigners: readonly string[],
  finalized: { rpcTransaction: any; txId: string }
): string | undefined {
  const input = record.preparedRelease!.draft.input;
  const script = { version: Number(input.scriptPublicKey.version), script: String(input.scriptPublicKey.script).toLowerCase() };
  const amount = BigInt(input.amountSompi);
  let tx: ReturnType<typeof kaspaSighashInputsFromWasm>["tx"];
  try {
    const built = officialTransactionWithUtxos(finalized.rpcTransaction, [{ amount, scriptPublicKey: script.version.toString(16).padStart(4, "0") + script.script }]);
    if (built.id !== String(finalized.txId).toLowerCase()) return `the finalized spend rebuilds to ${built.id}, not ${finalized.txId}`;
    tx = kaspaSighashInputsFromWasm(built.serialized).tx;
  } catch (e) {
    return `the finalized spend cannot be rebuilt to check its signatures (${messageOf(e)})`;
  }
  for (const role of requiredSigners) {
    const signature = String((record.signatures as Record<string, string | undefined>)[role] ?? "").toLowerCase();
    const publicKey = String((record.config as any)[role]?.publicKeyHex ?? "").toLowerCase();
    if (!verifyKaspaInputSignature({ tx, inputIndex: 0, utxo: { amount, scriptPublicKey: script }, publicKey, signature })) {
      return `the ${role}'s signature is not valid for this spend (BIP340, SIGHASH_ALL) by the ${role}'s key`;
    }
  }
  return undefined;
}

export interface EscrowReleaseReady {
  readonly ok: true;
  readonly prepared: NonNullable<EscrowRecord["preparedRelease"]>;
  readonly policy: { requiredSigners: string[] };
  readonly finalized: { rpcTransaction: any; txId: string; signatureScriptHex: string };
  readonly actualOutputsHash: string;
}

/**
 * Everything checked before a release is sent: not released, no release sent and unreconciled (ESCROW-SAFETY-2), every
 * signature in place, the branch's policy unchanged since preparation, the finalized spend's outputs those prepared,
 * and every required signature valid (BIP340) by the escrow's keys. Throws only for outputs mutated after preparation.
 */
export function checkEscrowRelease(record: EscrowRecord | undefined, id: string): EscrowRefusal | EscrowReleaseReady {
  if (!record) return refuse(404, "ESCROW_NOT_FOUND", "Not found");
  if (record.state === "RELEASED") {
    return refuse(
      409,
      "ESCROW_ALREADY_RELEASED",
      `ESCROW_ALREADY_RELEASED: escrow ${id} is already released (txid: ${record.release?.transactionId ?? "unknown"}, status: ${record.release?.status ?? "confirmed"}). Nothing was sent.`
    );
  }
  // ESCROW-SAFETY-2: a release already sent is reconciled, never sent again
  if (record.release && record.release.status !== "failed") {
    return refuse(
      409,
      "ESCROW_RELEASE_PENDING",
      `ESCROW_RELEASE_PENDING: release ${record.release.transactionId} was already sent (${record.release.status}); reconcile it instead of sending it again. Nothing was sent.`
    );
  }
  if (record.state !== "READY_TO_RELEASE") return refuse(400, "ESCROW_NOT_READY", "Not ready");

  const prepared = record.preparedRelease!;
  const policy = escrowPolicyOf(record, prepared.branch);
  if (escrowOutputsHash(policy) !== prepared.policyHash) {
    return refuse(400, "ESCROW_POLICY_CHANGED", "Policy hash mismatch. The node configuration changed since preparation.");
  }

  let finalized: { rpcTransaction: any; txId: string; signatureScriptHex: string };
  try {
    finalized = finalizeSilverSpend(prepared.draft, record.artifact, prepared.args, record.signatures as Record<string, string>);
  } catch (e: any) {
    return refuse(400, "ESCROW_UNLOCK_FAILED", `ESCROW_UNLOCK_FAILED: ${e?.message || String(e)}`);
  }

  const actualOutputsHash = escrowOutputsHash(prepared.draft.outputs);
  if (actualOutputsHash !== prepared.expectedOutputsHash) {
    throw new Error("Outputs were mutated before broadcast!");
  }

  // ESCROW-SAFETY-2: every required signature verified before anything is sent
  const invalid = invalidEscrowReleaseSignature(record, policy.requiredSigners, finalized);
  if (invalid) return refuse(400, "ESCROW_SIGNATURE_INVALID", `ESCROW_SIGNATURE_INVALID: ${invalid}. Nothing was sent.`);
  return { ok: true, prepared, policy, finalized, actualOutputsHash };
}

/** Findings of the SDK's observer that mean a chain block of this node accepted the transaction. */
export const ESCROW_CHAIN_ACCEPTED: ReadonlySet<string> = new Set(["chain_accepted", "finality_reached"]);

/** What one look at the funding transaction moves the record to (never back: an unknown outcome stays until seen). */
export function applyEscrowFundingFinding(record: EscrowRecord, finding: string): void {
  if (ESCROW_CHAIN_ACCEPTED.has(finding)) {
    record.funding.status = "confirmed";
  } else if (finding === "mempool_entry" && record.funding.status === "verification_timeout") {
    record.funding.status = "broadcast";
  }
  if (record.state === "CREATED" && (record.funding.status === "confirmed" || record.funding.status === "broadcast")) {
    record.state = "FUNDED";
  }
}

/** What one look at the release transaction moves the record to. */
export function applyEscrowReleaseFinding(record: EscrowRecord, finding: string): void {
  const release = record.release!;
  if (ESCROW_CHAIN_ACCEPTED.has(finding)) {
    release.status = "confirmed";
    record.state = "RELEASED";
  } else if (finding === "mempool_entry" && release.status === "verification_timeout") {
    release.status = "broadcast";
  }
}

// ---------------------------------------------------------------------------
// sdk.escrow
// ---------------------------------------------------------------------------

/** A prepared escrow release as a file: what each signer checks and signs in their own workspace. */
export interface EscrowReleaseRequest {
  readonly schema: string;
  readonly hardkasVersion: string;
  readonly createdAt: string;
  readonly networkId: string;
  readonly escrowId: string;
  readonly escrow: {
    readonly address: string;
    readonly lockingScriptHex: string;
    readonly contractName: string;
    readonly artifactSha256?: string | undefined;
    /** The escrow's terms (its nonce included): a signer recompiles the contract from them. Amounts in sompi, decimal. */
    readonly config: Record<string, unknown>;
  };
  readonly funding: { readonly outpoint: string; readonly amountSompi: string };
  readonly branch: string;
  readonly mutualSplit?: { readonly buyerSompi: string; readonly sellerSompi: string } | undefined;
  readonly requiredSigners: readonly string[];
  /** What the release pays (from the draft): address, amount, script. */
  readonly outputs: ReadonlyArray<{ readonly address?: string | undefined; readonly amountSompi: string; readonly scriptPublicKey: string }>;
  readonly feeSompi: string;
  readonly draft: any;
  readonly expectedOutputsHash: string;
  readonly policyHash: string;
  /** 65-byte signatures (hex) by role, as each signer added them. */
  readonly signatures: Readonly<Record<string, string>>;
}

export interface EscrowSignOptions {
  /** The role this signature is for (buyer, seller or arbiter): the branch must require it. */
  readonly role: string;
  /** The workspace account that signs: its key must be the one the escrow names for the role. */
  readonly account: string;
  /** The password of that account's encrypted keystore, in memory only (development accounts need none). */
  readonly keystorePassword?: string | undefined;
}

export interface EscrowSendResult {
  readonly id: string;
  readonly txId: string;
  /** broadcast (the node took it), confirmed (a chain block accepted it, when waited for). */
  readonly status: "broadcast" | "confirmed";
  readonly submissionArtifactId?: string | undefined;
  readonly warnings?: readonly string[] | undefined;
  readonly record: EscrowRecord;
}

const ESCROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bigintToString = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);
/** A record as JSON (bigints as decimal strings, as the dev server's journal writes them). */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value, bigintToString));

type SendOutcome =
  | { readonly outcome: "accepted"; readonly txId: string; readonly submissionArtifactId?: string | undefined; readonly sinkHash?: string | undefined }
  | { readonly outcome: "not-sent" | "rejected" | "unknown"; readonly message: string; readonly code?: string | undefined };

/** The x-only key a Schnorr P2PK address pays (undefined for any other address). */
function xOnlyKeyOf(address: string): string | undefined {
  const script = expectedScriptPublicKeyHex(address);
  const m = script ? /^20([0-9a-f]{64})ac$/.exec(script) : null;
  return m ? m[1] : undefined;
}

/**
 * `sdk.escrow` · the escrow lifecycle on this instance's node network, with the rules of the dev server's escrow (the
 * functions above): create → fund → prepare → sign (each required signer, here or in their own workspace with the
 * release request) → release → reconcile. Records live in `.hardkas/escrows/<id>.json`.
 */
export class HardkasEscrow {
  constructor(private readonly sdk: Hardkas) {}

  /** The network records of this instance are for: the one its config entry declares, else its name. */
  get networkId(): string {
    return declaredNetworkIdOf(this.sdk.config.config, this.sdk.network) ?? String(this.sdk.network);
  }

  // ------------------------------------------------------------------ guards

  /** Mainnet first (nothing read), then a Kaspa node world (never the simulator). */
  private guard(operation: string, ...networks: unknown[]): void {
    assertSdkMayConnect(this.sdk, `sdk.escrow.${operation}`, ...networks);
    const e = this.sdk.execution;
    if (e.mode === "simulator" || e.domain !== "kaspa-l1") {
      throw new HardkasError(
        "ESCROW_NETWORK_NOT_SUPPORTED",
        `sdk.escrow.${operation}: the escrow lifecycle runs on a Kaspa node network (simnet, devnet, testnet-<n>); this instance runs ${e.mode} ${e.domain} ${e.network}. Nothing was read or written.`
      );
    }
  }

  private assertRecordNetwork(record: EscrowRecord, operation: string): void {
    const network = record.networkId ?? "simnet";
    if (network !== this.networkId) {
      throw new HardkasError(
        "ESCROW_NETWORK_MISMATCH",
        `sdk.escrow.${operation}: escrow ${record.id} is for ${network}; this instance runs on ${this.networkId}. Open the SDK on ${network}. Nothing was signed or sent.`
      );
    }
  }

  // ------------------------------------------------------------------ store

  private get dir(): string {
    return path.join(this.sdk.workspace.hardkasDir, "escrows");
  }

  private fileOf(id: string): string {
    const file = typeof id === "string" && ESCROW_ID.test(id) ? plainChildPath(this.dir, `${id}.json`) : undefined;
    if (!file) throw new HardkasError("ESCROW_NOT_FOUND", `${JSON.stringify(id)} is not an escrow id of this workspace (a UUID). Nothing was read.`);
    return file;
  }

  private read(id: string): EscrowRecord | undefined {
    const file = this.fileOf(id);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (e: any) {
      if (e?.code === "ENOENT") return undefined;
      throw e;
    }
    const record = JSON.parse(text) as EscrowRecord;
    if (record?.schema !== HardkasSchemas.EscrowRecordV1 || record.id !== id) {
      throw new HardkasError("ESCROW_RECORD_INVALID", `${file} is not the ${HardkasSchemas.EscrowRecordV1} record of escrow ${id}. Nothing was changed.`);
    }
    return record;
  }

  private load(id: string): EscrowRecord {
    const record = this.read(id);
    if (!record) throw new HardkasError("ESCROW_NOT_FOUND", `escrow ${id} is not recorded in this workspace (${this.dir}). Nothing was read or written.`);
    return record;
  }

  private save(record: EscrowRecord): void {
    const file = this.fileOf(record.id);
    fs.mkdirSync(this.dir, { recursive: true });
    record.updatedAt = new Date(systemRuntimeContext.clock.now()).toISOString();
    const tmp = `${file}.tmp.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
    fs.writeFileSync(tmp, JSON.stringify(record, bigintToString, 2), "utf8");
    fs.renameSync(tmp, file);
  }

  private list_(): EscrowRecord[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir);
    } catch {
      return [];
    }
    const out: EscrowRecord[] = [];
    for (const n of names) {
      const id = n.endsWith(".json") ? n.slice(0, -5) : "";
      if (!ESCROW_ID.test(id)) continue;
      try {
        const r = this.read(id);
        if (r) out.push(r);
      } catch {
        // a record that is not one is skipped by the listing (status names it)
      }
    }
    return out;
  }

  /** One operation of escrow `id` at a time in this workspace (two processes never fund or release it both). */
  private locked<T>(id: string, operation: string, fn: () => Promise<T>): Promise<T> {
    this.fileOf(id);
    return withLock({ rootDir: this.sdk.workspace.root, name: `escrow-${id}`, command: `escrow ${operation}`, wait: true, timeoutMs: 120_000 }, fn);
  }

  // ------------------------------------------------------------------ parties

  /**
   * An escrow party from what a caller names: a 32-byte x-only key (hex; destination its own P2PK), a Schnorr P2PK
   * address of this network, or an account of this workspace (its address). No key is read.
   */
  async partyOf(nameAddressOrKey: string): Promise<{ publicKeyHex: string; destinationSpk: string; address?: string | undefined }> {
    this.guard("partyOf");
    const v = String(nameAddressOrKey ?? "").trim();
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(v)) {
      const key = v.replace(/^0x/i, "").toLowerCase();
      return { publicKeyHex: key, destinationSpk: `20${key}ac` };
    }
    let address = v;
    if (!v.includes(":")) {
      const account: any = await this.sdk.accounts.resolve(v);
      address = String(account?.address ?? "");
    }
    const k: any = loadManagedKaspaWasmSync();
    if (!k.Address.validate(address) || !addressMatchesNetwork(address, this.networkId)) {
      throw new HardkasError("ESCROW_CONFIG_INVALID", `'${v}' is not a Kaspa address of ${this.networkId}, an account of this workspace on it, or a 32-byte x-only public key. Nothing was created.`);
    }
    const key = xOnlyKeyOf(address);
    if (!key) {
      throw new HardkasError("ESCROW_CONFIG_INVALID", `${address} is not a Schnorr P2PK address: an escrow party signs with a 32-byte x-only key. Nothing was created.`);
    }
    return { publicKeyHex: key, destinationSpk: `20${key}ac`, address };
  }

  /** A destination: an address of this network (its script, without the version) or a script public key in hex. */
  destinationOf(addressOrSpk: string): string {
    this.guard("destinationOf");
    const v = String(addressOrSpk ?? "").trim();
    if (v.includes(":")) {
      const k: any = loadManagedKaspaWasmSync();
      if (!k.Address.validate(v) || !addressMatchesNetwork(v, this.networkId)) {
        throw new HardkasError("ESCROW_CONFIG_INVALID", `destination '${v}' is not a Kaspa address of ${this.networkId}. Nothing was created.`);
      }
      return String(k.payToAddressScript(new k.Address(v)).script).toLowerCase();
    }
    const spk = v.replace(/^0x/i, "");
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(spk)) throw new HardkasError("ESCROW_CONFIG_INVALID", `destination '${v}' is not an address or a script public key in hex. Nothing was created.`);
    return spk.toLowerCase();
  }

  // ------------------------------------------------------------------ lifecycle

  /**
   * Compiles the escrow for `config` (the pinned silverc; EscrowFull, EscrowSplit, or a legacy v1 with version "v1") on
   * this instance's network and records it CREATED. An active escrow at the same address is refused (409 in the dev
   * server: ESCROW_ADDRESS_ALREADY_ACTIVE). Nothing is sent.
   */
  async create(config: EscrowConfig): Promise<EscrowRecord> {
    this.guard("create");
    const result = await createEscrow(config, { networkId: this.networkId });
    const duplicate = escrowAddressRefusal(this.list_(), result.state.address);
    if (duplicate) throw escrowRefusalError(duplicate);
    const id = crypto.randomUUID();
    const now = new Date(systemRuntimeContext.clock.now()).toISOString();
    const record: EscrowRecord = plain({
      schema: HardkasSchemas.EscrowRecordV1,
      ...newEscrowRecord(id, result, config),
      networkId: this.networkId,
      createdAt: now,
      updatedAt: now
    });
    await this.locked(id, "create", async () => this.save(record));
    return record;
  }

  /** The record of escrow `id` in this workspace (no node is contacted). */
  async status(id: string): Promise<EscrowRecord> {
    assertSdkMayConnect(this.sdk, "sdk.escrow.status");
    return this.load(id);
  }

  /** Every escrow recorded in this workspace. */
  async list(): Promise<EscrowRecord[]> {
    assertSdkMayConnect(this.sdk, "sdk.escrow.list");
    return this.list_();
  }

  /**
   * Funds escrow `id` from the buyer's account (its key must be the buyer's of the escrow): one payment of the escrow's
   * funding amount (principal + fee budget) to its address, planned, signed and sent by the SDK's payment path (mature
   * coins, never a covenant's, none the mempool is spending; the fee limit; one submission per txId). The G3 check
   * comes first: a fee budget under the node's minimum for any release is refused before anything is read or signed.
   * An unknown outcome is recorded with its txId (never funded again before reconcile).
   */
  async fund(id: string, options: { account: string; keystorePassword?: string | undefined; waitMs?: number | undefined }): Promise<EscrowSendResult> {
    this.guard("fund");
    return this.locked(id, "fund", async () => {
      const record = this.load(id);
      this.assertRecordNetwork(record, "fund");
      assertMainnetTransactionsDisabled("broadcast", [record.networkId, this.sdk.network, this.networkId], "sdk.escrow.fund");
      const already = escrowFundingRefusal(record);
      if (already) throw escrowRefusalError(already);
      const account: any = await this.sdk.accounts.resolve(options.account);
      if (xOnlyKeyOf(String(account?.address ?? "")) !== String(record.config.buyer.publicKeyHex).toLowerCase()) {
        throw new HardkasError(
          "ESCROW_BUYER_ACCOUNT_NOT_FOUND",
          `account '${options.account}' (${String(account?.address)}) is not the buyer of escrow ${id}: the escrow names the buyer's key ${record.config.buyer.publicKeyHex}. Nothing was signed or sent.`
        );
      }
      const check = escrowFundingCheck(record, this.networkId);
      if (check.refusal) throw escrowRefusalError(check.refusal);
      const plan: any = await this.sdk.tx.plan({ from: account, to: record.p2shState.address, amount: check.totalAmount });
      const out0 = plan.outputs?.[0];
      if (out0?.address !== record.p2shState.address || BigInt(out0?.amountSompi ?? -1) !== check.totalAmount) {
        throw new HardkasError("ESCROW_FUNDING_FAILED", `ESCROW_FUNDING_FAILED: the payment plan does not pay ${check.totalAmount} sompi to ${record.p2shState.address} in its first output. Nothing was signed or sent.`);
      }
      const signed: any = await this.sdk.tx.sign(plan, { account, ...(options.keystorePassword !== undefined ? { keystorePassword: options.keystorePassword } : {}) });
      const txId = String(signed.txId).toLowerCase();
      const fundingEntry = {
        amount: check.totalAmount.toString(),
        scriptPublicKey: { version: 0, scriptPublicKey: record.p2shState.lockingScriptHex },
        // Not observed yet; the signature hash does not cover it.
        blockDaaScore: "0",
        isCoinbase: false
      };
      // Write-ahead intent before network transmission
      record.funding = {
        status: "verification_timeout",
        transactionId: txId,
        outputIndex: 0,
        amountSompi: check.totalAmount.toString(),
        feeSompi: String(plan.estimatedFeeSompi),
        utxoEntry: fundingEntry
      };
      this.save(record);
      const sent = await this.sendOnce(signed);
      if (sent.outcome !== "accepted") {
        if (sent.outcome === "unknown") {
          throw new HardkasError(
            "ESCROW_FUNDING_OUTCOME_UNKNOWN",
            `${sent.message}. The node may hold funding ${txId}; it was not sent again. Reconcile it before anything else (sdk.escrow.reconcile / hardkas escrow reconcile).`
          );
        }
        record.funding = { status: "none" };
        this.save(record);
        throw new HardkasError("ESCROW_FUNDING_FAILED", `${sent.outcome === "not-sent" ? "nothing was sent" : "the node refused it"}: ${sent.message}`);
      }
      record.funding.status = "broadcast";
      if (sent.sinkHash) record.funding.observeFrom = sent.sinkHash;
      record.state = "FUNDED";
      this.save(record);
      const confirmed = options.waitMs ? await this.waitAccepted(record, "funding", options.waitMs) : false;
      return {
        id,
        txId,
        status: confirmed ? "confirmed" : "broadcast",
        ...(sent.submissionArtifactId ? { submissionArtifactId: sent.submissionArtifactId } : {}),
        ...(check.warnings.length > 0 ? { warnings: check.warnings } : {}),
        record
      };
    });
  }

  /**
   * Prepares the release of `branch` over the recorded funding (the rules of prepareEscrowRelease) and returns its
   * release request: the file each required signer checks and signs. Signatures of an earlier preparation are dropped.
   */
  async prepare(id: string, options: { branch: string; mutualSplit?: { buyerSompi: bigint | string; sellerSompi: bigint | string } | undefined }): Promise<EscrowReleaseRequest> {
    this.guard("prepare");
    return this.locked(id, "prepare", async () => {
      const record = this.load(id);
      this.assertRecordNetwork(record, "prepare");
      const prepared = prepareEscrowRelease(record, options, this.networkId);
      if (!prepared.ok) throw escrowRefusalError(prepared);
      applyEscrowPreparedRelease(record, {
        ...prepared.preparedRelease,
        ...(options.mutualSplit ? { mutualSplit: { buyerSompi: BigInt(options.mutualSplit.buyerSompi).toString(), sellerSompi: BigInt(options.mutualSplit.sellerSompi).toString() } } : {})
      });
      this.save(record);
      return this.requestOf(record);
    });
  }

  /** The release request of escrow `id`'s prepared release, with the signatures recorded so far. */
  async releaseRequest(id: string): Promise<EscrowReleaseRequest> {
    this.guard("releaseRequest");
    const record = this.load(id);
    if (!record.preparedRelease) throw escrowRefusalError(refuse(400, "ESCROW_NOT_PREPARED", "Not prepared"));
    return this.requestOf(record);
  }

  private requestOf(record: EscrowRecord): EscrowReleaseRequest {
    const prepared = record.preparedRelease!;
    const k: any = loadManagedKaspaWasmSync();
    const network = record.networkId ?? this.networkId;
    const outputs = (prepared.draft.outputs as any[]).map((o) => {
      let address: string | undefined;
      try {
        address = String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(Number(o.scriptPublicKey.version), String(o.scriptPublicKey.script)), network));
      } catch {
        address = undefined;
      }
      return { ...(address ? { address } : {}), amountSompi: String(o.valueSompi), scriptPublicKey: String(o.scriptPublicKey.script) };
    });
    return plain({
      schema: HardkasSchemas.EscrowReleaseRequestV1,
      hardkasVersion: HARDKAS_VERSION,
      createdAt: new Date(systemRuntimeContext.clock.now()).toISOString(),
      networkId: network,
      escrowId: record.id,
      escrow: {
        address: record.p2shState.address,
        lockingScriptHex: record.p2shState.lockingScriptHex,
        contractName: String(record.provenance?.contractName ?? ""),
        ...((record.provenance as any)?.artifactSha256 ? { artifactSha256: String((record.provenance as any).artifactSha256) } : {}),
        config: record.config as unknown as Record<string, unknown>
      },
      funding: { outpoint: `${record.funding.transactionId}:${record.funding.outputIndex}`, amountSompi: String(record.funding.amountSompi) },
      branch: prepared.branch,
      ...(prepared.mutualSplit ? { mutualSplit: prepared.mutualSplit } : {}),
      requiredSigners: escrowPolicyOf(record, prepared.branch).requiredSigners,
      outputs,
      feeSompi: String(prepared.draft.feeSompi),
      draft: prepared.draft,
      expectedOutputsHash: prepared.expectedOutputsHash,
      policyHash: prepared.policyHash,
      signatures: { ...(record.signatures as Record<string, string>) }
    });
  }

  /**
   * Signs the prepared release of escrow `id` (recorded here) as `role` with `account`, whose key must be the one the
   * escrow names for that role (ESCROW_SIGNER_NOT_FOUND before any key is read otherwise).
   */
  async sign(id: string, options: EscrowSignOptions): Promise<{ id: string; role: string; signature: string; record: EscrowRecord }> {
    this.guard("sign");
    return this.locked(id, "sign", async () => {
      const record = this.load(id);
      this.assertRecordNetwork(record, "sign");
      assertMainnetTransactionsDisabled("sign", [record.networkId, this.sdk.network, this.networkId], "sdk.escrow.sign");
      const check = escrowSignCheck(record, options.role);
      if (!check.ok) throw escrowRefusalError(check);
      const privateKey = await this.keyOf(options, check.publicKeyHex, id);
      const signed = escrowSignatureOf(record, privateKey);
      if (!signed.ok) throw escrowRefusalError(signed);
      recordEscrowSignature(record, options.role, signed.signature, check.policy);
      this.save(record);
      return { id, role: options.role, signature: signed.signature, record };
    });
  }

  /** The private key of the signing account, after its address shows it is the role's key (no key read otherwise). */
  private async keyOf(options: EscrowSignOptions, publicKeyHex: string, id: string): Promise<string> {
    const account: any = await this.sdk.accounts.resolve(options.account);
    if (xOnlyKeyOf(String(account?.address ?? "")) !== String(publicKeyHex).toLowerCase()) {
      throw new HardkasError(
        "ESCROW_SIGNER_NOT_FOUND",
        `account '${options.account}' (${String(account?.address)}) is not the ${options.role} of escrow ${id}: the escrow names the ${options.role}'s key ${publicKeyHex}. Nothing was signed.`
      );
    }
    return resolveAccountPrivateKey(account, { networkId: this.networkId, keystorePassword: options.keystorePassword });
  }

  /**
   * Checks a release request in a workspace that does not hold the escrow (a signer's own): the contract recompiled
   * from the terms it carries (the pinned silverc) is at its address and lock; the draft is the one those terms, the
   * branch and the funding give (prepared again here, with the same fee ceiling and node floor, and compared field by
   * field); the policy and outputs hashes are its own. ESCROW_REQUEST_INVALID / ESCROW_REQUEST_MISMATCH otherwise.
   * Returns what the request pays, for the signer to see.
   */
  async verifyRequest(request: EscrowReleaseRequest): Promise<{ requiredSigners: string[]; outputs: EscrowReleaseRequest["outputs"]; feeSompi: string; record: EscrowRecord }> {
    this.guard("verifyRequest", (request as any)?.networkId);
    const invalid = (why: string) => new HardkasError("ESCROW_REQUEST_INVALID", `the release request ${why}. Nothing was signed.`);
    const mismatch = (why: string) => new HardkasError("ESCROW_REQUEST_MISMATCH", `the release request does not do what its escrow's terms say: ${why}. Nothing was signed.`);
    if (request?.schema !== HardkasSchemas.EscrowReleaseRequestV1) throw invalid(`is not a ${HardkasSchemas.EscrowReleaseRequestV1} file`);
    if (request.networkId !== this.networkId) {
      throw new HardkasError("ESCROW_NETWORK_MISMATCH", `the release request is for ${String(request.networkId)}; this instance runs on ${this.networkId}. Nothing was signed.`);
    }
    if (request.draft?.networkId !== request.networkId) throw mismatch(`its draft is for ${String(request.draft?.networkId)}`);
    const config = request.escrow?.config as unknown as EscrowConfig;
    if (!config || typeof config !== "object") throw invalid("carries no escrow terms");
    const [fundingTx, fundingIndex] = String(request.funding?.outpoint ?? "").split(":");
    if (!fundingTx || !/^[0-9a-f]{64}$/.test(fundingTx) || !/^\d+$/.test(String(fundingIndex ?? ""))) throw invalid("names no funding outpoint");
    let compiled: Awaited<ReturnType<typeof createEscrow>>;
    try {
      compiled = await createEscrow(config, { networkId: this.networkId });
    } catch (e: any) {
      if (typeof e?.code === "string" && e.code !== "ESCROW_CONFIG_INVALID") throw e;
      throw mismatch(`its terms do not compile (${messageOf(e)})`);
    }
    if (compiled.state.address !== request.escrow.address || compiled.state.lockingScriptHex !== request.escrow.lockingScriptHex) {
      throw mismatch(`its terms compile to ${compiled.state.address}, not to the escrow it names (${request.escrow.address})`);
    }
    if (request.escrow.artifactSha256 && (compiled.provenance as any)?.artifactSha256 !== request.escrow.artifactSha256) {
      throw mismatch("its terms compile to another artifact than the one it names");
    }
    const input = request.draft?.input ?? {};
    if (`${String(input.outpoint?.transactionId)}:${Number(input.outpoint?.index)}` !== `${fundingTx}:${Number(fundingIndex)}`) throw mismatch("its draft spends another outpoint than the funding it names");
    if (String(input.amountSompi) !== String(request.funding.amountSompi)) throw mismatch("its draft spends another amount than the funding it names");
    const record: EscrowRecord = {
      id: String(request.escrowId),
      config: compiled.effectiveConfig,
      state: "FUNDED",
      artifact: compiled.artifact,
      p2shState: compiled.state,
      provenance: compiled.provenance,
      networkId: this.networkId,
      funding: {
        status: "confirmed",
        transactionId: fundingTx,
        outputIndex: Number(fundingIndex),
        amountSompi: String(request.funding.amountSompi),
        utxoEntry: {
          amount: String(request.funding.amountSompi),
          scriptPublicKey: { version: 0, scriptPublicKey: compiled.state.lockingScriptHex },
          blockDaaScore: String(input.blockDaaScore ?? "0"),
          isCoinbase: Boolean(input.isCoinbase)
        }
      },
      signatures: {}
    };
    const prepared = prepareEscrowRelease(record, { branch: request.branch, ...(request.mutualSplit ? { mutualSplit: request.mutualSplit } : {}) }, this.networkId);
    if (!prepared.ok) throw mismatch(prepared.error);
    const p = prepared.preparedRelease;
    if (JSON.stringify(plain(p.draft)) !== JSON.stringify(request.draft)) throw mismatch(`its draft is not the ${request.branch} release of these terms (expected transaction ${p.draft.unsignedTxId}, the request carries ${String(request.draft?.unsignedTxId)})`);
    if (p.policyHash !== request.policyHash || p.expectedOutputsHash !== request.expectedOutputsHash) throw mismatch("its policy or outputs hash is not the draft's");
    const requiredSigners = escrowPolicyOf(record, request.branch).requiredSigners;
    if (JSON.stringify(requiredSigners) !== JSON.stringify(request.requiredSigners)) throw mismatch(`the ${request.branch} branch is signed by ${requiredSigners.join(" and ")}, not ${String(request.requiredSigners)}`);
    applyEscrowPreparedRelease(record, p);
    return { requiredSigners, outputs: request.outputs, feeSompi: String(p.draft.feeSompi), record };
  }

  /**
   * Signs a release request in this workspace (a signer that does not hold the escrow): verifyRequest first, then the
   * signature of `role` by `account` (its key must be the role's). Returns the request with the signature added.
   */
  async signRequest(request: EscrowReleaseRequest, options: EscrowSignOptions): Promise<{ request: EscrowReleaseRequest; role: string; signature: string }> {
    this.guard("signRequest", (request as any)?.networkId);
    assertMainnetTransactionsDisabled("sign", [(request as any)?.networkId, (request as any)?.draft?.networkId, this.sdk.network, this.networkId], "sdk.escrow.signRequest");
    const { record } = await this.verifyRequest(request);
    const check = escrowSignCheck(record, options.role);
    if (!check.ok) throw escrowRefusalError(check);
    const privateKey = await this.keyOf(options, check.publicKeyHex, record.id);
    const signed = escrowSignatureOf(record, privateKey);
    if (!signed.ok) throw escrowRefusalError(signed);
    return { request: { ...request, signatures: { ...request.signatures, [options.role]: signed.signature } }, role: options.role, signature: signed.signature };
  }

  /**
   * Adds the signatures a release request carries to escrow `id`'s prepared release: the request must be of that very
   * draft, and each signature of a required role valid (BIP340, SIGHASH_ALL) by the key the escrow names for it
   * (ESCROW_SIGNATURE_INVALID: nothing is added). READY_TO_RELEASE once every required signer signed.
   */
  async addSignatures(id: string, request: EscrowReleaseRequest): Promise<EscrowRecord> {
    this.guard("addSignatures", (request as any)?.networkId);
    return this.locked(id, "sign", async () => {
      const record = this.load(id);
      this.assertRecordNetwork(record, "addSignatures");
      if (!record.preparedRelease) throw escrowRefusalError(refuse(400, "ESCROW_NOT_PREPARED", "Not prepared"));
      if (request?.schema !== HardkasSchemas.EscrowReleaseRequestV1 || request.escrowId !== id) {
        throw new HardkasError("ESCROW_REQUEST_MISMATCH", `the release request is not one of escrow ${id}. Nothing was added.`);
      }
      if (String(request.draft?.unsignedTxId) !== String(record.preparedRelease.draft.unsignedTxId) || request.branch !== record.preparedRelease.branch) {
        throw new HardkasError(
          "ESCROW_REQUEST_MISMATCH",
          `the release request signs transaction ${String(request.draft?.unsignedTxId)} (${String(request.branch)}); escrow ${id}'s prepared release is ${record.preparedRelease.draft.unsignedTxId} (${record.preparedRelease.branch}): prepared again since. Nothing was added.`
        );
      }
      const policy = escrowPolicyOf(record, record.preparedRelease.branch);
      const draft = record.preparedRelease.draft;
      for (const [role, signature] of Object.entries(request.signatures ?? {})) {
        if (!policy.requiredSigners.includes(role)) continue;
        const publicKey = String((record.config as any)[role]?.publicKeyHex ?? "");
        if (!draftSignatureValid(draft, publicKey, String(signature))) {
          throw new HardkasError("ESCROW_SIGNATURE_INVALID", `the ${role}'s signature in the release request is not valid for this spend (BIP340, SIGHASH_ALL) by the ${role}'s key. Nothing was added.`);
        }
      }
      for (const [role, signature] of Object.entries(request.signatures ?? {})) {
        if (policy.requiredSigners.includes(role)) recordEscrowSignature(record, role, String(signature).toLowerCase(), policy);
      }
      this.save(record);
      return record;
    });
  }

  /**
   * Sends escrow `id`'s release once every required signer signed (checkEscrowRelease: every signature verified before
   * anything is sent), through sdk.tx.send: a plan of this workspace (the funding outpoint in, the contract's outputs
   * out, the fee limit the escrow's fee ceiling) and its signed transaction. An unknown outcome is recorded with its txId
   * and never sent again before reconcile. With `waitMs`, waits for a chain block to accept it (RELEASED).
   */
  async release(id: string, options: { waitMs?: number | undefined } = {}): Promise<EscrowSendResult> {
    this.guard("release");
    return this.locked(id, "release", async () => {
      const record = this.load(id);
      this.assertRecordNetwork(record, "release");
      assertMainnetTransactionsDisabled("broadcast", [record.networkId, this.sdk.network, this.networkId], "sdk.escrow.release");
      const ready = checkEscrowRelease(record, id);
      if (!ready.ok) throw escrowRefusalError(ready);
      // the funding the release spends is in the node's UTXO set as recorded: a release is never sent ahead of its
      // funding (the node would refuse it as an orphan, and that refusal is final for this one transaction id)
      await this.assertFundingUnspent(record);
      const { plan, signed } = await this.releaseArtifacts(record, ready);
      const txId = ready.finalized.txId;
      // Write-ahead pre-commit BEFORE the send
      record.release = {
        transactionId: txId,
        fundingOutpoint: `${record.funding.transactionId}:${record.funding.outputIndex}`,
        expectedOutputsHash: ready.prepared.expectedOutputsHash,
        actualOutputsHash: ready.actualOutputsHash,
        feeSompi: ready.prepared.draft.feeSompi,
        status: "verification_timeout"
      };
      this.save(record);
      void plan;
      const sent = await this.sendOnce(signed);
      if (sent.outcome !== "accepted") {
        if (sent.outcome === "unknown") {
          throw new HardkasError(
            "ESCROW_RELEASE_OUTCOME_UNKNOWN",
            `${sent.message}. The node may hold release ${txId}; it was not sent again. Reconcile it (sdk.escrow.reconcile / hardkas escrow reconcile).`
          );
        }
        delete record.release;
        this.save(record);
        throw new HardkasError("ESCROW_RELEASE_FAILED", `${sent.outcome === "not-sent" ? "nothing was sent" : "the node refused it"}: ${sent.message}`);
      }
      record.release!.status = "broadcast";
      if (sent.sinkHash) record.release!.observeFrom = sent.sinkHash;
      this.save(record);
      const confirmed = options.waitMs ? await this.waitAccepted(record, "release", options.waitMs) : false;
      return { id, txId, status: confirmed ? "confirmed" : "broadcast", ...(sent.submissionArtifactId ? { submissionArtifactId: sent.submissionArtifactId } : {}), record };
    });
  }

  /**
   * One look at the node about escrow `id`'s pending funding and release (sdk.tx.observe: its mempool, then its virtual
   * chain from the submission's point), and the state that moves the record to: a chain block accepted it → confirmed
   * (FUNDED / RELEASED); the mempool holds an unknown outcome → broadcast. Never back.
   */
  async reconcile(id: string): Promise<{ record: EscrowRecord; observations: Record<string, { state: string; finding: string; error?: string }> }> {
    this.guard("reconcile");
    return this.locked(id, "reconcile", async () => {
      const record = this.load(id);
      this.assertRecordNetwork(record, "reconcile");
      const observations: Record<string, { state: string; finding: string; error?: string }> = {};
      const fundingPending = record.funding.transactionId !== undefined && (record.funding.status === "verification_timeout" || record.funding.status === "broadcast");
      const releasePending = record.release !== undefined && (record.release.status === "verification_timeout" || record.release.status === "broadcast");
      if (fundingPending) {
        const look = await this.look(record.funding.transactionId!);
        observations.funding = look;
        applyEscrowFundingFinding(record, look.finding);
      }
      if (releasePending) {
        const look = await this.look(record.release!.transactionId);
        observations.release = look;
        applyEscrowReleaseFinding(record, look.finding);
      }
      this.save(record);
      return { record, observations };
    });
  }

  // ------------------------------------------------------------------ node

  /**
   * The escrow's funding output is listed unspent at the escrow's address by the node, with the recorded amount and the
   * escrow's lock (read-only). ESCROW_FUNDING_NOT_UNSPENT otherwise: not accepted by a chain block yet (reconcile it
   * first), spent already (another release), or a node that could not be asked. Nothing is sent.
   */
  private async assertFundingUnspent(record: EscrowRecord): Promise<void> {
    const outpoint = `${String(record.funding.transactionId).toLowerCase()}:${Number(record.funding.outputIndex)}`;
    const refuse = (why: string) =>
      new HardkasError("ESCROW_FUNDING_NOT_UNSPENT", `the escrow's funding ${outpoint} ${why}. The release was not sent; nothing was recorded.`);
    let listed: any[];
    try {
      listed = await (this.sdk.rpc as any).getUtxosByAddress(record.p2shState.address);
    } catch (e) {
      throw refuse(`could not be looked up at ${record.p2shState.address} (${messageOf(e)})`);
    }
    const u = (Array.isArray(listed) ? listed : []).find((x: any) => `${String(x?.outpoint?.transactionId).toLowerCase()}:${Number(x?.outpoint?.index)}` === outpoint);
    if (!u) {
      throw refuse(`is not listed unspent at ${record.p2shState.address} by the node: not accepted by a chain block yet (reconcile it, then release) or already spent`);
    }
    const spk = String(u.scriptPublicKey ?? "").toLowerCase();
    const lock = record.p2shState.lockingScriptHex.toLowerCase();
    if (BigInt(u.amountSompi ?? -1) !== BigInt(record.funding.amountSompi ?? -2) || (spk !== lock && spk !== `0000${lock}`)) {
      throw refuse(`is listed with another amount or script (${String(u.amountSompi)} sompi, ${spk}) than the escrow recorded (${record.funding.amountSompi} sompi to its lock)`);
    }
  }

  /** One observation of `txId` (persisted), as the finding the shared rules read. */
  private async look(txId: string): Promise<{ state: string; finding: string; error?: string }> {
    try {
      const { derived, observation } = await this.sdk.tx.observe(txId);
      const state = String(derived.status);
      const finding = state === "ACCEPTED" || state === "CONFIRMED" || state === "FINALIZED" ? "chain_accepted" : state === "MEMPOOL_ACCEPTED" || state === "MEMPOOL_ORPHAN" ? "mempool_entry" : String((observation as any)?.finding?.type ?? "not_found");
      return { state, finding };
    } catch (e) {
      return { state: "UNOBSERVABLE", finding: "unobservable", error: messageOf(e) };
    }
  }

  private async waitAccepted(record: EscrowRecord, which: "funding" | "release", waitMs: number): Promise<boolean> {
    const txId = which === "funding" ? record.funding.transactionId! : record.release!.transactionId;
    const end = Date.now() + Math.max(0, waitMs);
    for (;;) {
      const look = await this.look(txId);
      if (ESCROW_CHAIN_ACCEPTED.has(look.finding)) {
        if (which === "funding") applyEscrowFundingFinding(record, look.finding);
        else applyEscrowReleaseFinding(record, look.finding);
        this.save(record);
        return true;
      }
      if (Date.now() >= end) return false;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  /**
   * TX-SEND machinery: one sdk.tx.send of a signed artifact, and what it established. Thrown refusals that say nothing
   * was sent (or are typed as such) are "not-sent"; the node holding it already (ALREADY_SUBMITTED) is "accepted"; any
   * other failure may have left the process: "unknown", never "not sent".
   */
  private async sendOnce(signed: any): Promise<SendOutcome> {
    const txId = String(signed?.txId ?? "").toLowerCase();
    let r: any;
    try {
      r = await this.sdk.tx.send(signed);
    } catch (e: any) {
      const message = messageOf(e);
      const code = typeof e?.code === "string" ? e.code : undefined;
      if (code === "ALREADY_SUBMITTED") return { outcome: "accepted", txId };
      // one submission per txId: a transaction the node already refused (recorded) is final, never sent again
      if (code === "TX_ALREADY_SUBMITTED" && typeof e?.metadata?.recordedRejection === "string") return { outcome: "rejected", message, code };
      if (code === "TX_ALREADY_SUBMITTED" || code === "EVENT_LEDGER_APPEND_FAILED") return { outcome: "unknown", message, code };
      if (code === "SUBMIT_NOT_SENT" || isRpcRequestNotSentError(e) || isNodeNetworkIdentityError(e) || /nothing was sent/i.test(message)) {
        return { outcome: "not-sent", message, ...(code ? { code } : {}) };
      }
      return { outcome: "unknown", message, ...(code ? { code } : {}) };
    }
    const submission: any = r?.submission;
    const named = typeof r?.txId === "string" ? r.txId.toLowerCase() : undefined;
    if ((r?.submitted === true || r?.alreadySubmitted === true) && named === txId) {
      return {
        outcome: "accepted",
        txId,
        ...(typeof submission?.contentHash === "string" ? { submissionArtifactId: submission.contentHash } : {}),
        ...(typeof submission?.submitPoint?.sinkHash === "string" ? { sinkHash: submission.submitPoint.sinkHash } : {})
      };
    }
    const result = submission?.submitResult ?? {};
    if (submitOutcomeOf(result) === "rejected") return { outcome: "rejected", message: String(result.error ?? "the node refused the transaction") };
    return { outcome: "unknown", message: String(result.error ?? "the node's answer names no transaction") };
  }

  /**
   * The release as this workspace's send machinery takes it: a v0 plan (the escrow's funding outpoint in, the release's
   * outputs out, no change; its fee limit the escrow's fee ceiling) written to the store, and the signed artifact of the
   * finalized spend, its lineage parent that plan.
   */
  private async releaseArtifacts(record: EscrowRecord, ready: EscrowReleaseReady): Promise<{ plan: any; signed: any }> {
    const k: any = loadManagedKaspaWasmSync();
    const network = this.networkId;
    const draft = ready.prepared.draft;
    const addressOf = (spk: { version: number; script: string }) => {
      try {
        return String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(Number(spk.version), String(spk.script)), network));
      } catch (e) {
        throw new HardkasError("ESCROW_DESTINATION_NOT_ADDRESS", `the release pays script ${spk.script}, which is no standard Kaspa address of ${network}: the send machinery checks outputs by address. Nothing was sent.`);
      }
    };
    const outputs = (draft.outputs as any[]).map((o) => ({ address: addressOf(o.scriptPublicKey), amountSompi: BigInt(o.valueSompi) }));
    const total = outputs.reduce((s, o) => s + o.amountSompi, 0n);
    const ceiling = record.config.feeBudgetSompi ? BigInt(record.config.feeBudgetSompi) : ESCROW_DEFAULT_FEE_CEILING_SOMPI;
    const escrowAddress = record.p2shState.address;
    const planWithMass = (estimatedMass: bigint) =>
      createTxPlanArtifact({
        networkId: network as any,
        mode: this.sdk.execution.mode as any,
        from: { input: escrowAddress, address: escrowAddress },
        to: { input: outputs[0]!.address, address: outputs[0]!.address },
        amountSompi: total,
        plan: {
          inputs: [
            {
              outpoint: { transactionId: String(draft.input.outpoint.transactionId), index: Number(draft.input.outpoint.index) },
              amountSompi: BigInt(draft.input.amountSompi),
              address: escrowAddress,
              scriptPublicKey: `0000${String(draft.input.scriptPublicKey.script)}`
            }
          ],
          outputs,
          estimatedFeeSompi: BigInt(draft.feeSompi),
          estimatedMass
        } as any,
        ctx: systemRuntimeContext,
        maxFeeSompi: ceiling
      });
    // A v0 plan's mass is the SDK's figure for the plan's own unsigned transaction: the send verifies it strictly
    // (verifyFeeSemantics recomputes it) and the SDK does not know the contract's unlock. The plan used to state the
    // draft's real mass, so a release whose compute mass outweighs its storage mass (one large output: 10 KAS to the
    // seller) was refused at send ("Mass mismatch", ECONOMIC_VIOLATION) and could never go out. The real signed shape was
    // priced against the node's minimum relay fee when the draft was prepared, and the send derives the fee it records
    // from the signed transaction itself.
    const plan = planWithMass(recomputeMass(planWithMass(BigInt(draft.mass ?? 0)) as any));
    const audit = verifyFeeSemantics(plan);
    if (!audit.ok) {
      throw new HardkasError("ESCROW_RELEASE_UNPRICED", `the send's economic check refuses this release's plan (${audit.issues.join("; ")}). Nothing was sent.`);
    }
    const storedPlan: any = (await this.sdk.artifacts.write(plan as any)).artifact ?? plan;
    const signed: any = {
      schema: HardkasSchemas.SignedTx,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      status: "signed",
      createdAt: new Date(systemRuntimeContext.clock.now()).toISOString(),
      txId: ready.finalized.txId,
      sourcePlanId: storedPlan.planId,
      networkId: storedPlan.networkId,
      mode: storedPlan.mode,
      from: { address: storedPlan.from.address },
      to: { address: storedPlan.to.address },
      amountSompi: storedPlan.amountSompi,
      signedTransaction: { format: "hex", payload: JSON.stringify(ready.finalized.rpcTransaction, bigintToString) },
      lineage: createLineageTransition(storedPlan, HardkasSchemas.SignedTx),
      ...(storedPlan.execution ? { execution: storedPlan.execution } : {}),
      ...(storedPlan.workflowId ? { workflowId: storedPlan.workflowId } : {})
    };
    const contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);
    signed.signedId = `signed-${contentHash.slice(0, 16)}`;
    signed.contentHash = contentHash;
    if (signed.lineage) signed.lineage.artifactId = contentHash;
    const storedSigned: any = (await this.sdk.artifacts.write(signed)).artifact ?? signed;
    return { plan: storedPlan, signed: storedSigned };
  }
}

/** Whether `signature` (65 bytes hex) is a valid SIGHASH_ALL signature of input 0 of the unsigned draft by `publicKey`. */
function draftSignatureValid(draft: any, publicKey: string, signature: string): boolean {
  try {
    const k: any = loadManagedKaspaWasmSync();
    const i = draft.input;
    const tx = new k.Transaction({
      version: 0,
      inputs: [
        {
          previousOutpoint: i.outpoint,
          signatureScript: "",
          sequence: BigInt(i.sequence),
          sigOpCount: i.sigOpCount,
          utxo: {
            outpoint: i.outpoint,
            amount: BigInt(i.amountSompi),
            scriptPublicKey: new k.ScriptPublicKey(i.scriptPublicKey.version, i.scriptPublicKey.script),
            blockDaaScore: BigInt(i.blockDaaScore),
            isCoinbase: i.isCoinbase
          }
        }
      ],
      outputs: draft.outputs.map((o: any) => ({ value: BigInt(o.valueSompi), scriptPublicKey: new k.ScriptPublicKey(o.scriptPublicKey.version, o.scriptPublicKey.script) })),
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    if (String(tx.id) !== String(draft.unsignedTxId)) return false;
    const sighash = kaspaSighashInputsFromWasm(tx.serializeToObject()).tx;
    return verifyKaspaInputSignature({
      tx: sighash,
      inputIndex: 0,
      utxo: { amount: BigInt(i.amountSompi), scriptPublicKey: { version: Number(i.scriptPublicKey.version), script: String(i.scriptPublicKey.script).toLowerCase() } },
      publicKey: String(publicKey).toLowerCase(),
      signature: String(signature).toLowerCase()
    });
  } catch {
    return false;
  }
}
