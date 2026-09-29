import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildTransactions } from "./kaspa-wallet-adapter.js";
import type { Utxo, TxPlan } from "./index.js";

/*
 * HardKAS's one transaction planner: the pinned kaspa-wasm Generator selects the
 * inputs, prices the transaction and makes the change. This module adapts HardKAS
 * UTXOs to it and back, turns its refusals into HardKAS errors, and refuses what a
 * single-transaction plan cannot represent:
 *
 * - more than one transaction (the Generator compounds when the inputs do not fit
 *   in one standard transaction) → MULTI_TRANSACTION_PLAN_REQUIRED, until HardKAS
 *   has a lifecycle for transaction batches;
 * - a transaction above the storage-mass limit (KIP-9) because of a small change
 *   output → CHANGE_BELOW_STANDARD_OUTPUT, or of a small payment output →
 *   OUTPUT_BELOW_STANDARD_AMOUNT. The Generator only turns dust change into fee;
 *   any larger remainder stays the sender's, so the plan is refused instead.
 */

export class GeneratorPlanError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = "GeneratorPlanError";
  }
}

export interface GeneratorPlanRequest {
  readonly networkId?: string | undefined;
  readonly utxos: readonly Utxo[];
  /** Payment outputs. Empty for a consolidation: every selected input goes to `changeAddress`. */
  readonly outputs: readonly { readonly address: string; readonly amountSompi: bigint }[];
  readonly changeAddress: string;
  /** Sompi per gram; the Generator never charges less than the network minimum. */
  readonly feeRate?: bigint | undefined;
  /** Transaction payload (hex); the Generator prices its mass. */
  readonly payload?: string | undefined;
  /**
   * Plans the simulator's identities (aliases such as `kaspa:sim_alice`, `mock-script`,
   * transaction ids that are not 64-hex, addresses of any network) under mass-equivalent
   * simnet stand-ins and maps them back. Only for the simulator: on a real network an
   * invalid identity must fail.
   */
  readonly syntheticIdentities?: boolean | undefined;
}

export interface GeneratorPlanOutcome {
  readonly inputs: readonly Utxo[];
  readonly outputs: readonly { readonly address: string; readonly amountSompi: bigint }[];
  /** What the transaction sends to `changeAddress` (all of it, for a consolidation). */
  readonly changeSompi: bigint;
  readonly feeSompi: bigint;
  readonly mass: bigint;
}

const HEX64 = /^[0-9a-fA-F]{64}$/;

let standIn: string | undefined;
/** A fixed P2PK simnet address: same script size, hence same mass, as any simulated account. */
function standInAddress(k: any): string {
  if (standIn === undefined) {
    const address: string = new k.PrivateKey("01".repeat(32)).toPublicKey().toAddress("simnet").toString();
    standIn = address;
  }
  return standIn;
}

function scriptHexOf(k: any, address: string): string {
  const spk = k.payToAddressScript(address);
  return Number(spk.version).toString(16).padStart(4, "0") + String(spk.script);
}

const HEX = /^(?:[0-9a-fA-F]{2})+$/;
/** A UTXO's own script as the Generator takes it ("<2-byte version><script>" hex), when it has one. */
function ownScriptHex(spk: unknown): string | undefined {
  if (spk && typeof spk === "object") {
    const o = spk as { version?: number | string; script?: string; scriptPublicKey?: string };
    const script = String(o.script ?? o.scriptPublicKey ?? "");
    return HEX.test(script) ? Number(o.version ?? 0).toString(16).padStart(4, "0") + script : undefined;
  }
  if (typeof spk !== "string" || !HEX.test(spk)) return undefined;
  // The node's JSON form carries the version first; a bare script is version 0.
  return spk.startsWith("0000") ? spk : "0000" + spk;
}

/**
 * Plans ONE transaction with the Generator, or refuses with a HardKAS error. The
 * Generator takes the UTXOs in the order given, which is the order their source
 * listed them in: HardKAS adds no selection policy of its own.
 */
export async function planWithGenerator(request: GeneratorPlanRequest): Promise<GeneratorPlanOutcome> {
  const k = loadManagedKaspaWasmSync();
  const synthetic = request.syntheticIdentities === true;
  // The simulator models simnet; a real network id goes to the Generator as given.
  const networkId = synthetic ? "simnet" : (request.networkId ?? "simnet");
  const valid = (address: string) => {
    try {
      return k.Address.validate(address) === true;
    } catch {
      return false;
    }
  };
  // The Generator refuses an address of another network; the simulator's addresses are
  // re-encoded on simnet (same script, hence same mass), and its aliases get the stand-in.
  const addressFor = (address: string) => {
    if (!synthetic) return address;
    if (!valid(address)) return standInAddress(k);
    const a = new k.Address(address);
    if (a.prefix === "kaspasim") return address;
    a.setPrefix = "kaspasim";
    return a.toString();
  };

  // Entries keyed by the outpoint the Generator sees, so the selection maps back to HardKAS UTXOs.
  const byKey = new Map<string, Utxo>();
  const entries = request.utxos.map((u) => {
    const txid = u.outpoint.transactionId;
    const transactionId = synthetic && !HEX64.test(txid) ? createHash("sha256").update(txid).digest("hex") : txid;
    byKey.set(`${transactionId.toLowerCase()}:${u.outpoint.index}`, u);
    const address = synthetic ? addressFor(u.address) : u.address;
    // A real UTXO is spent under its own script; the simulator's mock scripts give way to
    // the script of the identity's stand-in.
    const scriptPublicKey = (!synthetic && ownScriptHex(u.scriptPublicKey)) || scriptHexOf(k, address);
    return {
      ...(address ? { address } : {}),
      outpoint: { transactionId, index: u.outpoint.index },
      amount: u.amountSompi,
      scriptPublicKey,
      blockDaaScore: u.blockDaaScore ?? 0n,
      isCoinbase: Boolean(u.isCoinbase)
    };
  });

  const txs: any[] = [];
  try {
    for await (const pt of buildTransactions({
      networkId,
      entries,
      changeAddress: addressFor(request.changeAddress),
      // A payment needs a priority fee (even 0); a sweep takes neither outputs nor a priority fee.
      ...(request.outputs.length > 0
        ? { outputs: request.outputs.map((o) => ({ address: addressFor(o.address), amount: o.amountSompi })), priorityFee: 0n }
        : {}),
      ...(request.feeRate !== undefined ? { feeRate: Number(request.feeRate) } : {}),
      ...(request.payload ? { payload: request.payload } : {})
    })) {
      txs.push(pt);
    }
  } catch (e: unknown) {
    throw refusal(e, request);
  }

  if (txs.length === 0) {
    throw new GeneratorPlanError("UPSTREAM_PLANNER_EMPTY", "the Generator produced no transaction");
  }
  if (txs.length > 1) {
    throw new GeneratorPlanError(
      "MULTI_TRANSACTION_PLAN_REQUIRED",
      `this spend needs ${txs.length} transactions: its inputs do not fit in one standard transaction. ` +
        "HardKAS plans one transaction at a time; " +
        (request.outputs.length === 0
          ? "consolidate these UTXOs in smaller batches."
          : "consolidate the UTXOs first (hardkas accounts consolidate), then plan again.")
    );
  }

  const pt = txs[0];
  const tx = pt.transaction;
  const inputs: Utxo[] = tx.inputs.map((input: any) => {
    const prev = input.previousOutpoint;
    const key = `${String(prev.transactionId).toLowerCase()}:${Number(prev.index)}`;
    const original = byKey.get(key);
    if (!original) {
      throw new GeneratorPlanError("UPSTREAM_PLANNER_UTXO_MISSING", `the Generator selected outpoint ${key}, which is not a candidate`);
    }
    return original;
  });
  const outcome: GeneratorPlanOutcome = {
    inputs,
    outputs: request.outputs.map((o) => ({ address: o.address, amountSompi: o.amountSompi })),
    changeSompi: BigInt(pt.changeAmount ?? 0n),
    feeSompi: BigInt(pt.feeAmount),
    mass: BigInt(pt.mass)
  };

  // A plan that does not conserve value is a bug to surface, never to sign.
  const inSum = inputs.reduce((s, u) => s + u.amountSompi, 0n);
  const outSum = outcome.outputs.reduce((s, o) => s + o.amountSompi, 0n);
  if (inSum !== outSum + outcome.changeSompi + outcome.feeSompi) {
    throw new GeneratorPlanError(
      "GENERATOR_PLAN_INCONSISTENT",
      `inputs ${inSum} != outputs ${outSum} + change ${outcome.changeSompi} + fee ${outcome.feeSompi}`
    );
  }
  return outcome;
}

function refusal(e: unknown, request: GeneratorPlanRequest): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (/insufficient/i.test(message)) {
    const total = request.outputs.reduce((s, o) => s + o.amountSompi, 0n);
    const err = new Error(`Insufficient funds: upstream Generator could not build a transaction for ${total} sompi total. (${message})`);
    (err as any).code = "INSUFFICIENT_FUNDS_UPSTREAM";
    return err;
  }
  // Both mean the transaction the Generator built is above the maximum standard mass,
  // which for a single transaction is the storage mass (KIP-9) of a small output.
  if (/storage mass exceeds maximum|mass calculation error/i.test(message)) {
    const upstream = ` (Generator: ${message})`;
    if (request.outputs.length === 0) {
      return new GeneratorPlanError(
        "OUTPUT_BELOW_STANDARD_AMOUNT",
        `the consolidated amount is too small for a standard output (storage mass above the maximum standard transaction mass).${upstream}`
      );
    }
    // Storage mass grows as an output shrinks, so the smaller of the smallest payment and the
    // change is what broke the limit. The Generator takes the UTXOs in order until they cover
    // the payment; what those leave, before the fee, bounds the change from above.
    const paid = request.outputs.reduce((s, o) => s + o.amountSompi, 0n);
    const smallest = request.outputs.reduce((m, o) => (o.amountSompi < m ? o.amountSompi : m), request.outputs[0]!.amountSompi);
    let covered = 0n;
    for (const u of request.utxos) {
      covered += u.amountSompi;
      if (covered > paid) break;
    }
    const change = covered - paid;
    if (change > 0n && change <= smallest) {
      return new GeneratorPlanError(
        "CHANGE_BELOW_STANDARD_OUTPUT",
        "the change this payment leaves is too small for a standard output (storage mass above the maximum standard " +
          `transaction mass). Adjust the amount, or send the whole balance.${upstream}`
      );
    }
    return new GeneratorPlanError(
      "OUTPUT_BELOW_STANDARD_AMOUNT",
      `the amount ${smallest} sompi is too small for a standard output from these UTXOs (storage mass above the maximum ` +
        `standard transaction mass). Send a larger amount.${upstream}`
    );
  }
  return e instanceof Error ? e : new Error(message);
}

/** A single-transaction payment plan in HardKAS's TxPlan shape. */
export async function planPaymentWithGenerator(request: GeneratorPlanRequest & { readonly version?: 0 | 1 | undefined }): Promise<TxPlan> {
  const outcome = await planWithGenerator(request);
  return {
    version: request.version ?? 0,
    inputs: outcome.inputs,
    outputs: outcome.outputs,
    ...(outcome.changeSompi > 0n ? { change: { address: request.changeAddress, amountSompi: outcome.changeSompi } } : {}),
    estimatedMass: outcome.mass,
    estimatedFeeSompi: outcome.feeSompi
  };
}
