import { KASPA_WASM_REFERENCE, getNetworkPrefix, loadManagedKaspaWasmSync } from "@hardkas/core";
import { WALLET_MAXIMUM_STANDARD_TRANSACTION_MASS } from "./fee-policy.js";
import {
  V1_MASS_AUTHORITY,
  V1_MASS_PARAMS,
  v1FeeMass,
  v1MassShapeOfWasmTransaction,
  v1MinimumRelayFee,
  v1NonContextualMasses,
  v1StorageMass,
  type V1StorageCell
} from "./v1-mass.js";

/**
 * Transaction mass and minimum fee.
 *
 * HardKAS keeps no mass constants or formulas of its own. Every value here is
 * computed by the pinned official SDK (`calculateTransactionMass` /
 * `calculateTransactionFee`) over an UNSIGNED candidate transaction: the SDK
 * adds `minimumSignatures` expected signatures per input, so feeding it a
 * signed transaction would count the signatures twice.
 */
export const MASS_AUTHORITY = `kaspa-wasm ${KASPA_WASM_REFERENCE.version}`;

export interface MassBreakdown {
  base: bigint;
  inputs: bigint;
  outputs: bigint;
  payload: bigint;
  total: bigint;
}

export interface MassEstimateResult {
  mass: bigint;
  computeMass: bigint;
  transientMass: bigint;
  feeMass: bigint;
  txBytes: bigint;
  feeSompi: bigint;
  breakdown: MassBreakdown;
  assumptions: string[];
  warnings: string[];
}

export interface ConsensusMassInput {
  inputCount: number;
  outputs: readonly { address: string; scriptPublicKey?: string }[];
  payloadBytes?: number;
  signatureScriptBytes?: number;
  hasChange?: boolean;
  networkId?: string;
  version?: 0 | 1;
}

export interface ConsensusMassResult {
  computeMass: bigint;
  transientMass: bigint;
  feeMass: bigint;
  storageMass: bigint;
}

export interface UpstreamMassInput {
  readonly networkId?: string | undefined;
  readonly inputs: readonly {
    readonly amountSompi: bigint;
    readonly outpoint?: { readonly transactionId: string; readonly index: number } | undefined;
    readonly scriptPublicKey?: unknown;
  }[];
  readonly outputs: readonly {
    readonly amountSompi: bigint;
    readonly address?: string | undefined;
    readonly scriptPublicKey?: string | undefined;
  }[];
  readonly payloadBytes?: number | undefined;
  readonly version?: 0 | 1 | undefined;
  /** Signatures expected per input; the SDK adds their size to the unsigned transaction. */
  readonly minimumSignatures?: number | undefined;
}

export interface UpstreamMassResult {
  /** Mass as the node computes it (compute or storage mass, whichever binds). */
  readonly mass: bigint;
  /**
   * The SDK's `calculateTransactionFee`: the network's minimum rate over the overall
   * mass (meaningless when `standard` is false). When storage mass binds it is above
   * what the node requires (see {@link measureRelayFee}); a fee that pays it is always
   * relayed.
   */
  readonly minimumFeeSompi: bigint;
  /**
   * False when the mass exceeds the wallet's maximum standard transaction mass (100,000 g, wallet/core/src/tx/mass.rs).
   * L1-08: a wallet policy the kaspa-wasm Generator applies, not a node relay rule (the v2.1.0 mempool bounds masses by the
   * block limits); HardKAS does not build such a transaction.
   */
  readonly standard: boolean;
  readonly maximumStandardMass: bigint;
  readonly authority: string;
  readonly assumptions: string[];
}

/** 34-byte P2PK-sized script: same mass as a real P2PK output. */
const P2PK_SIZED_SCRIPT = "20" + "00".repeat(32) + "ac";
const ZERO_TXID = "00".repeat(32);
const HEX = /^(?:[0-9a-fA-F]{2})+$/;

function sdkNetwork(networkId: string | undefined): string {
  const net = getNetworkPrefix(networkId ?? "simnet");
  if (net === "simnet" || net === "mainnet" || net === "testnet-10" || net === "devnet") return net;
  const err = new Error(`MASS_NETWORK_UNSUPPORTED: no Kaspa mass parameters for network '${networkId}'`);
  (err as any).code = "MASS_NETWORK_UNSUPPORTED";
  throw err;
}

/**
 * L1-12 · a scriptPublicKey given as a hex string (ADJ-002 transport rule): the node's JSON form "<2-byte version as 4 hex>
 * <script>" when it starts with `0000` (version 0, a script of ANY length: P2PK Schnorr 34 bytes, P2PK ECDSA 35, P2SH 35,
 * ...); any other hex string is a bare version-0 script. The same rule as the Generator planner (generator-plan.ts
 * `ownScriptHex`). It used to apply to 72-hex strings (a 34-byte script) only, so a versioned P2SH or ECDSA string was
 * read as a 37-byte bare script. Not hex (or an odd length): undefined.
 */
export function scriptPublicKeyFromHex(spk: string): { version: number; script: string } | undefined {
  if (typeof spk !== "string" || !HEX.test(spk)) return undefined;
  return spk.startsWith("0000") ? { version: 0, script: spk.slice(4) } : { version: 0, script: spk };
}

function scriptFrom(spk: unknown): { version: number; script: string } | undefined {
  if (spk && typeof spk === "object") {
    const o = spk as { version?: number | string; scriptPublicKey?: string; script?: string };
    const script = String(o.scriptPublicKey || o.script || "");
    return HEX.test(script) ? { version: Number(o.version ?? 0), script } : undefined;
  }
  return typeof spk === "string" ? scriptPublicKeyFromHex(spk) : undefined;
}

/**
 * Mass and minimum fee of a candidate transaction, from the pinned SDK.
 *
 * Fields that do not affect mass may be placeholders: outpoint identifiers
 * (fixed size) and, for identities the SDK cannot parse (simulated or mock
 * addresses), a P2PK-sized script. Each substitution is listed in
 * `assumptions`. Amounts are always the real ones: storage mass depends on them.
 *
 * Reports, without throwing, whether the mass is within the standard limit.
 */
export function measureUpstreamMass(input: UpstreamMassInput): UpstreamMassResult {
  if (input.inputs.length === 0) {
    // The SDK aborts (wasm `unreachable`) on a transaction without inputs.
    const err = new Error("MASS_REQUIRES_INPUTS: a transaction needs at least one input to have a mass");
    (err as any).code = "MASS_REQUIRES_INPUTS";
    throw err;
  }
  const k = loadManagedKaspaWasmSync();
  const network = sdkNetwork(input.networkId);
  const assumptions: string[] = [];
  const version = input.version ?? 0;

  const inputs = input.inputs.map((i, index) => {
    const txid = i.outpoint && /^[0-9a-fA-F]{64}$/.test(i.outpoint.transactionId) ? i.outpoint.transactionId : ZERO_TXID;
    if (txid === ZERO_TXID && i.outpoint) assumptions.push(`input ${index}: outpoint id is not a txid, zero id used (mass-neutral)`);
    const outpoint = { transactionId: txid, index: i.outpoint?.index ?? index };
    const spk = scriptFrom(i.scriptPublicKey);
    if (!spk) assumptions.push(`input ${index}: script not parseable, P2PK-sized script used`);
    const s = spk ?? { version: 0, script: P2PK_SIZED_SCRIPT };
    return {
      previousOutpoint: outpoint,
      signatureScript: "",
      sequence: 0n,
      sigOpCount: version === 1 ? 0 : 1,
      utxo: {
        outpoint,
        amount: i.amountSompi,
        scriptPublicKey: new k.ScriptPublicKey(s.version, s.script),
        blockDaaScore: 0n,
        isCoinbase: false
      }
    };
  });

  const outputs = input.outputs.map((o, index) => {
    let spk: any;
    if (o.address && k.Address.validate(o.address)) {
      spk = k.payToAddressScript(new k.Address(o.address));
    } else {
      const s = scriptFrom(o.scriptPublicKey);
      if (s) spk = new k.ScriptPublicKey(s.version, s.script);
      else {
        assumptions.push(`output ${index}: '${o.address ?? "?"}' is not a Kaspa address, P2PK-sized script used`);
        spk = new k.ScriptPublicKey(0, P2PK_SIZED_SCRIPT);
      }
    }
    return { value: o.amountSompi, scriptPublicKey: spk };
  });

  const tx = new k.Transaction({
    version,
    inputs,
    outputs,
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: "00".repeat(input.payloadBytes ?? 0)
  });

  const minimumSignatures = input.minimumSignatures ?? 1;
  const mass: bigint = k.calculateTransactionMass(network, tx, minimumSignatures);
  const fee: bigint | undefined = k.calculateTransactionFee(network, tx, minimumSignatures);
  return {
    mass,
    // The SDK returns no fee when the mass exceeds the maximum standard mass.
    minimumFeeSompi: fee as bigint,
    standard: fee !== undefined,
    maximumStandardMass: k.maximumStandardTransactionMass(),
    authority: MASS_AUTHORITY,
    assumptions
  };
}

/**
 * Mass and minimum fee of a transaction the caller has already built as a WASM
 * `Transaction` — for inputs whose signature script is not P2PK (P2SH
 * contracts), filled in at its final length so the SDK prices its real size.
 *
 * The SDK always adds one expected-signature allowance per input, even to a
 * filled signature script, so the result is above the node's figure by that
 * allowance: the fee never falls short of the node's minimum.
 */
export function measureBuiltTransactionMass(tx: unknown, networkId?: string | undefined): UpstreamMassResult {
  const k = loadManagedKaspaWasmSync();
  const network = sdkNetwork(networkId);
  const mass: bigint = k.calculateTransactionMass(network, tx, 1);
  const fee: bigint | undefined = k.calculateTransactionFee(network, tx, 1);
  return {
    mass,
    minimumFeeSompi: fee as bigint,
    standard: fee !== undefined,
    maximumStandardMass: k.maximumStandardTransactionMass(),
    authority: MASS_AUTHORITY,
    assumptions: ["signature scripts measured at their final length; the SDK adds one signature allowance per input on top"]
  };
}

/** The node's figures for a built transaction, and whether the node relays it at those masses. */
export interface BuiltTransactionNodeMass {
  readonly version: number;
  readonly computeMass: bigint;
  readonly transientMass: bigint;
  readonly storageMass: bigint;
  /** max(compute, transient normalized to the compute limit): the mass the relay fee is charged on. */
  readonly feeMass: bigint;
  /** The node's minimum relay fee: 100 sompi per gram of `feeMass`. The storage mass has no fee floor of its own. */
  readonly minimumFeeSompi: bigint;
  /**
   * The limits checked: compute mass within the standard 100,000 g for v0 (the v1 engine's block limit for v1), storage
   * and transient mass within the block limits (500,000 g and 1,000,000 g).
   */
  readonly limits: { readonly compute: bigint; readonly storage: bigint; readonly transient: bigint };
  /** False when a mass is above its limit: the node never relays the transaction. */
  readonly relayable: boolean;
  /** The first mass above its limit, when not relayable, and the same in words. */
  readonly exceeded?: { readonly mass: "compute" | "storage" | "transient"; readonly value: bigint; readonly limit: bigint } | undefined;
  readonly exceededText?: string | undefined;
  readonly authority: string;
}

/**
 * G3 · the node's relay floor and mass limits of a transaction the caller has built as a WASM `Transaction`, for a
 * minimum fee and a refusal that are the node's, not the SDK's.
 *
 * {@link measureBuiltTransactionMass} prices the SDK's max(compute, storage) mass: when storage mass binds (a small
 * output) its minimum fee is far above what the node requires, and its `standard` flag refuses storage mass above
 * 100,000 g, where the node's limit is the block's 500,000 g. Proven on rusty-kaspad 2.1.0 (simnet,
 * silver-v0-node-floor-g3.simnet.test.ts): v0 transactions with storage mass 125,000 g (P2PK) and 395,886 g (a two-
 * signature P2SH spend) are accepted at 100 sompi/g of the compute mass and refused one sompi under it; storage mass
 * 703,499 g is refused ("larger than max allowed size of 500000"). HK-09 certified the same floor for a v0 payment.
 *
 * The masses are the node's (v1-mass.ts, term by term: the v0 sig-op count at 1000 g, v1 compute budgets at 100 g),
 * read from the transaction's own fields: its signature scripts must be at their FINAL length (fill unsigned P2PK
 * inputs with a 66-byte placeholder), unlike {@link measureBuiltTransactionMass}, which adds a signature per input. The
 * storage mass is given: the spent and created cells (KIP-9 with the Toccata plurality, {@link v1StorageMass}), or the
 * value already computed by that rule. Nothing is signed or rounded up: the fee is the node's floor, exactly.
 */
export function measureBuiltTransactionNodeMass(
  tx: unknown,
  storage: { readonly inputs: readonly V1StorageCell[]; readonly outputs: readonly V1StorageCell[] } | { readonly storageMass: bigint }
): BuiltTransactionNodeMass {
  const shape = v1MassShapeOfWasmTransaction(tx);
  const masses = v1NonContextualMasses(shape);
  const storageMass = "storageMass" in storage ? storage.storageMass : v1StorageMass(storage.inputs, storage.outputs);
  if (storageMass === undefined) {
    const err = new Error("TX_MASS_ABOVE_STANDARD_LIMIT: storage mass overflows (an output is far too small): the node refuses the transaction");
    (err as any).code = "TX_MASS_ABOVE_STANDARD_LIMIT";
    throw err;
  }
  const feeMass = v1FeeMass(masses);
  const block = V1_MASS_PARAMS.blockLimits;
  const limits = { compute: shape.version >= 1 ? block.compute : WALLET_MAXIMUM_STANDARD_TRANSACTION_MASS, storage: block.storage, transient: block.transient };
  const exceeded =
    masses.computeMass > limits.compute
      ? { mass: "compute" as const, value: masses.computeMass, limit: limits.compute }
      : storageMass > limits.storage
        ? { mass: "storage" as const, value: storageMass, limit: limits.storage }
        : masses.transientMass > limits.transient
          ? { mass: "transient" as const, value: masses.transientMass, limit: limits.transient }
          : undefined;
  return {
    version: shape.version,
    computeMass: masses.computeMass,
    transientMass: masses.transientMass,
    storageMass,
    feeMass,
    minimumFeeSompi: v1MinimumRelayFee(feeMass),
    limits,
    relayable: exceeded === undefined,
    ...(exceeded
      ? {
          exceeded,
          exceededText:
            exceeded.mass === "storage"
              ? `storage mass ${exceeded.value} g is above the node's limit of ${exceeded.limit} g (KIP-9: an output is too small for the value it comes from)`
              : `${exceeded.mass} mass ${exceeded.value} g is above the ${exceeded.mass === "compute" && shape.version < 1 ? "standard" : "block"} limit of ${exceeded.limit} g`
        }
      : {}),
    authority: V1_MASS_AUTHORITY
  };
}

/** Storage mass the transaction must commit to (KIP-9), from the SDK. */
export function calculateUpstreamStorageMass(
  inputAmounts: readonly bigint[],
  outputAmounts: readonly bigint[],
  networkId?: string | undefined
): bigint {
  const k = loadManagedKaspaWasmSync();
  const toNumber = (v: bigint) => {
    if (v < 0n || v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`MASS_AMOUNT_OUT_OF_RANGE: ${v}`);
    return Number(v);
  };
  const mass: bigint | undefined = k.calculateStorageMass(sdkNetwork(networkId), inputAmounts.map(toNumber), outputAmounts.map(toNumber));
  if (mass === undefined) {
    const err = new Error("MASS_INCOMPUTABLE: the SDK could not compute the storage mass of these amounts");
    (err as any).code = "MASS_INCOMPUTABLE";
    throw err;
  }
  return mass;
}

/**
 * Like {@link measureUpstreamMass}, but a transaction above the maximum
 * standard mass (the wallet's policy, 100,000 g; L1-08: not a node relay rule) is an error.
 */
export function calculateUpstreamMass(input: UpstreamMassInput): UpstreamMassResult {
  const r = measureUpstreamMass(input);
  if (!r.standard) {
    const err = new Error(
      `TX_MASS_ABOVE_STANDARD_LIMIT: mass ${r.mass} exceeds the maximum standard transaction mass ${r.maximumStandardMass}`
    );
    (err as any).code = "TX_MASS_ABOVE_STANDARD_LIMIT";
    throw err;
  }
  return r;
}

/**
 * Amount used when a caller only knows the transaction's shape. Large enough
 * that storage mass is negligible, so the result is the shape's compute mass.
 */
const SHAPE_ONLY_AMOUNT = 100_000_000_000_000n;

/**
 * The fee the node relays this transaction at: the network's minimum rate per gram
 * of COMPUTE mass, priced by the SDK on the same transaction with amounts so large
 * that storage mass vanishes. rusty-kaspad 2.1.0 rejects below it ("…required amount
 * of N for compute mass M") and relayed storage-bound transactions paying only this
 * when measured on 2026-09-29; the Generator never pays less. Storage mass still
 * bounds standardness ({@link measureUpstreamMass}'s `standard`).
 */
export function measureRelayFee(input: UpstreamMassInput): { computeMass: bigint; relayFeeSompi: bigint } {
  const outputAmount = (SHAPE_ONLY_AMOUNT * BigInt(input.inputs.length)) / BigInt(input.outputs.length + 1);
  const shape = measureUpstreamMass({
    ...input,
    inputs: input.inputs.map((i) => ({ ...i, amountSompi: SHAPE_ONLY_AMOUNT })),
    outputs: input.outputs.map((o) => ({ ...o, amountSompi: outputAmount }))
  });
  return { computeMass: shape.mass, relayFeeSompi: shape.minimumFeeSompi };
}

function shapeMass(
  inputCount: number,
  outputs: readonly { address?: string; scriptPublicKey?: string }[],
  payloadBytes: number,
  networkId?: string,
  version?: 0 | 1
) {
  const outCount = Math.max(outputs.length, 1);
  return calculateUpstreamMass({
    networkId,
    version,
    inputs: Array.from({ length: inputCount }, () => ({ amountSompi: SHAPE_ONLY_AMOUNT })),
    outputs: outputs.map((o) => ({ ...o, amountSompi: (SHAPE_ONLY_AMOUNT * BigInt(inputCount || 1)) / BigInt(outCount + 1) })),
    payloadBytes
  });
}

/**
 * Mass of a transaction known only by its shape (input count, outputs,
 * payload). Computed by the SDK; amounts are unknown, so storage mass is not
 * included. The breakdown is derived by differencing SDK totals.
 */
export function estimateTransactionMass(input: ConsensusMassInput): MassEstimateResult {
  const outputs = [...(input.outputs || [])];
  if (input.hasChange) outputs.push({ address: "(change)" });
  const payloadBytes = input.payloadBytes ?? 0;

  const { networkId, version } = input;
  const full = shapeMass(input.inputCount, outputs, payloadBytes, networkId, version);
  const noPayload = payloadBytes > 0 ? shapeMass(input.inputCount, outputs, 0, networkId, version).mass : full.mass;
  const inputsOnly = shapeMass(input.inputCount, [], 0, networkId, version).mass;
  // The SDK cannot price a transaction without inputs, so the fixed part is
  // extrapolated from one and two inputs: base = 2*m(1) - m(2).
  const oneInput = shapeMass(1, [], 0, networkId, version).mass;
  const twoInputs = shapeMass(2, [], 0, networkId, version).mass;
  const base = 2n * oneInput - twoInputs;

  const assumptions = [
    `Mass computed by ${MASS_AUTHORITY} over an unsigned candidate (1 expected signature per input)`,
    "Amounts unknown: storage mass not included",
    ...new Set(full.assumptions.map((a) => a.replace(/^(input|output) \d+: /, "$1: ")))
  ];

  return {
    mass: full.mass,
    computeMass: full.mass,
    transientMass: full.mass - noPayload,
    feeMass: full.mass,
    txBytes: full.mass,
    feeSompi: full.minimumFeeSompi,
    breakdown: {
      base,
      inputs: inputsOnly - base,
      outputs: noPayload - inputsOnly,
      payload: full.mass - noPayload,
      total: full.mass
    },
    assumptions,
    warnings: []
  };
}

/** Shape-only mass as a consensus-mass record (see estimateTransactionMass). */
export function calculateConsensusNonContextualMass(input: ConsensusMassInput): ConsensusMassResult {
  const r = estimateTransactionMass(input);
  return { computeMass: r.computeMass, transientMass: r.transientMass, feeMass: r.feeMass, storageMass: 0n };
}

/** Fee at a chosen rate. The rate is policy; the mass comes from the SDK. */
export function estimateFeeFromMass(mass: bigint, feeRateSompiPerMass: bigint): bigint {
  return mass * feeRateSompiPerMass;
}
