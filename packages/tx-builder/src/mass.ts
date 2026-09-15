import { KASPA_WASM_REFERENCE, getNetworkPrefix, loadManagedKaspaWasmSync } from "@hardkas/core";

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
  /** Minimum fee the node requires for this transaction (meaningless when `standard` is false). */
  readonly minimumFeeSompi: bigint;
  /** False when the mass exceeds the maximum standard transaction mass: the node will not relay it. */
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

function scriptFrom(spk: unknown): { version: number; script: string } | undefined {
  if (spk && typeof spk === "object") {
    const o = spk as { version?: number | string; scriptPublicKey?: string; script?: string };
    const script = String(o.scriptPublicKey || o.script || "");
    return HEX.test(script) ? { version: Number(o.version ?? 0), script } : undefined;
  }
  if (typeof spk !== "string" || !HEX.test(spk)) return undefined;
  // ADJ-002 transport form: 0000 + 34-byte script.
  if (spk.length === 72 && spk.startsWith("0000")) return { version: 0, script: spk.slice(4) };
  return { version: 0, script: spk };
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
 * standard mass (which the node will not relay) is an error.
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
