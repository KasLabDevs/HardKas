import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildTransactions } from "./kaspa-wallet-adapter.js";
import { covenantIdOf } from "./covenant-utxos.js";
import { generatorFeeRate } from "./fee-policy.js";
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
 *   any larger remainder stays the sender's, so the plan is refused instead;
 * - R4-T · a payment to several recipients whose outputs the Generator refuses as
 *   too heavy for one standard transaction → TOO_MANY_OUTPUTS, naming how many of
 *   them fit (counted by the Generator itself, see `TooManyOutputsError`).
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
  /**
   * Sompi per gram. At or below the relay minimum (100) the transaction pays the minimum, charged on the compute mass;
   * above it the rate is priority, priced on max(compute, storage) as the mempool ranks it (FEE-POLICY-1).
   */
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
  // COVENANT-UTXO-PAYMENT-FILTER-1: the Generator never sees a covenant's UTXO (it would spend it as an ordinary input
  // and end the covenant). HardKAS planners leave them out first; one handed here anyway is refused.
  const covenant = request.utxos.filter((u) => covenantIdOf(u) !== undefined);
  if (covenant.length > 0) {
    throw new GeneratorPlanError(
      "COVENANT_UTXO_NOT_PAYMENT_INPUT",
      `${covenant.length} candidate UTXO(s) belong to a covenant (${covenant.map((u) => `${u.outpoint.transactionId}:${u.outpoint.index}`).join(", ")}): ` +
        "the Generator plans ordinary payments only. Nothing was planned."
    );
  }
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

  const priorityRate = generatorFeeRate(request.feeRate);
  // One Generator run over these candidates for the given payment outputs (all of them, or a prefix when R4-T counts how
  // many fit, which needs only its first transaction): the same settings every time.
  const generate = async (outputs: GeneratorPlanRequest["outputs"], firstOnly = false): Promise<any[]> => {
    const built: any[] = [];
    for await (const pt of buildTransactions({
      networkId,
      entries,
      changeAddress: addressFor(request.changeAddress),
      // A payment needs a priority fee (even 0); a sweep takes neither outputs nor a priority fee.
      ...(outputs.length > 0
        ? { outputs: outputs.map((o) => ({ address: addressFor(o.address), amount: o.amountSompi })), priorityFee: 0n }
        : {}),
      // FEE-POLICY-1 (CA-TX-03): a rate at or below the relay minimum is "the minimum", which the Generator charges on the
      // compute mass when given no rate; only a priority rate above it is handed over (priced as the mempool ranks it)
      ...(priorityRate !== undefined ? { feeRate: priorityRate } : {}),
      ...(request.payload ? { payload: request.payload } : {})
    })) {
      built.push(pt);
      if (firstOnly) break;
    }
    return built;
  };
  let txs: any[];
  try {
    txs = await generate(request.outputs);
  } catch (e: unknown) {
    // R4-T: a payment to several recipients whose outputs the Generator refuses as too heavy for one standard transaction
    // is refused with how many of them fit, counted by the same Generator (no mass formula of HardKAS's own)
    if (request.outputs.length > 1 && outputsTooHeavy(e)) throw await tooManyOutputs(e, request, generate);
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
          : request.outputs.length > 1
            ? // R4-T: the inputs share the transaction's mass with the payment outputs
              `consolidate the UTXOs first (hardkas accounts consolidate), or pay fewer of these ${request.outputs.length} recipients in one transaction, then plan again.`
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
    if (request.outputs.length > 1) {
      // R4-T: with several payment outputs the storage mass (KIP-9) adds up over all of them, so no single amount is "the"
      // one that is too small
      return new GeneratorPlanError(
        "OUTPUT_BELOW_STANDARD_AMOUNT",
        `the ${request.outputs.length} payment outputs (the smallest ${smallest} sompi) are too small together for a standard ` +
          "transaction from these UTXOs (storage mass above the maximum standard transaction mass; it grows with every small " +
          `output). Pay larger amounts, or fewer recipients in one transaction.${upstream}`
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

/**
 * R4-T · the pinned Generator's refusal of payment outputs too heavy for one standard transaction (kaspa-wasm
 * `GeneratorTransactionOutputsAreTooHeavy`: "Transaction outputs exceed the maximum allowed mass"). It is decided on the
 * outputs, the change output and the payload alone, before any input is selected, so the inputs keep room in the
 * transaction. A wallet rule of the Generator (the planner HardKAS uses), not a node relay rule.
 */
const OUTPUTS_TOO_HEAVY = /outputs exceed the maximum allowed mass/i;
function outputsTooHeavy(e: unknown): boolean {
  return OUTPUTS_TOO_HEAVY.test(e instanceof Error ? e.message : String(e));
}

/**
 * R4-T · TOO_MANY_OUTPUTS: a payment to several recipients that does not fit in one standard transaction, refused before
 * anything is signed, with how many of its outputs fit. `outputsThatFit` is the largest count of the payment's FIRST
 * outputs (in the order given) whose transaction the same Generator does not refuse as too heavy, over the same
 * candidates, change address, fee rate and payload: the Generator's own rule, counted by asking it, never a mass formula
 * of HardKAS's own. A count that fits can still be refused for another reason (funds, storage mass), with its own code.
 */
export class TooManyOutputsError extends GeneratorPlanError {
  constructor(
    public readonly requestedOutputs: number,
    public readonly outputsThatFit: number,
    upstreamMessage: string
  ) {
    super(
      "TOO_MANY_OUTPUTS",
      `this payment has ${requestedOutputs} recipient outputs, and at most ${outputsThatFit} of them (the first ${outputsThatFit}, in ` +
        "the order given) fit in one standard transaction (maximum standard transaction mass) with its change output, " +
        "leaving room for the inputs. Pay the others in another transaction (`hardkas tx batch` without --one-transaction pays " +
        `each payment in its own transaction). Nothing was planned. (Generator: ${upstreamMessage})`
    );
    this.name = "TooManyOutputsError";
  }

  /** The counts, for renderers that print an error's metadata. */
  get metadata(): { requestedOutputs: number; outputsThatFit: number } {
    return { requestedOutputs: this.requestedOutputs, outputsThatFit: this.outputsThatFit };
  }
}

async function tooManyOutputs(
  e: unknown,
  request: GeneratorPlanRequest,
  generate: (outputs: GeneratorPlanRequest["outputs"], firstOnly?: boolean) => Promise<any[]>
): Promise<TooManyOutputsError> {
  // the first `n` outputs are refused as too heavy (any other outcome: they fit the Generator's output rule); the
  // Generator decides that before its first transaction, so one is enough
  const heavy = async (n: number): Promise<boolean> => {
    try {
      await generate(request.outputs.slice(0, n), true);
      return false;
    } catch (inner: unknown) {
      return outputsTooHeavy(inner);
    }
  };
  // lo fits (0 trivially), hi is refused (all of them were): bisection over the prefix length
  let lo = 0;
  let hi = request.outputs.length;
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (await heavy(mid)) hi = mid;
    else lo = mid;
  }
  return new TooManyOutputsError(request.outputs.length, lo, e instanceof Error ? e.message : String(e));
}

/** A single-transaction payment plan in HardKAS's TxPlan shape. */
export async function planPaymentWithGenerator(request: GeneratorPlanRequest & { readonly version?: 0 | 1 | undefined }): Promise<TxPlan> {
  // L1-05: the Generator prices v0 transactions only (wallet/core/src/tx/mass.rs: "TODO: Add support for v1
  // transactions" — no compute-budget bytes, no budget × 100 g): a v1 plan priced by it would carry budget 0 and a fee
  // below the node's rule. v1 transactions are planned by `planV1Transaction` (v1-plan.ts), never here.
  if (request.version !== undefined && request.version !== 0) {
    throw new GeneratorPlanError(
      "GENERATOR_V1_UNSUPPORTED",
      `the Generator plans version-0 transactions only (requested version ${String(request.version)}); plan a v1 transaction ` +
        "with the v1 planner (planV1Transaction / the v1 engine). Nothing was planned."
    );
  }
  const outcome = await planWithGenerator(request);
  return {
    version: 0,
    inputs: outcome.inputs,
    outputs: outcome.outputs,
    ...(outcome.changeSompi > 0n ? { change: { address: request.changeAddress, amountSompi: outcome.changeSompi } } : {}),
    estimatedMass: outcome.mass,
    estimatedFeeSompi: outcome.feeSompi
  };
}
