import type { Utxo, TxPlan } from "./index.js";
import { filterMatureUtxos, adapterAuthority } from "./kaspa-wallet-adapter.js";
import { GeneratorPlanError, planPaymentWithGenerator, planWithGenerator } from "./generator-plan.js";
import { covenantIdOf, partitionCovenantUtxos } from "./covenant-utxos.js";

export interface UtxoProvider {
  getUtxos(address: string): Promise<Utxo[]>;
  getVirtualDaaScore?(): Promise<bigint>;
}

export interface TxPlanServiceOptions {
  /**
   * Coinbase maturity, in DAA blocks, for the simulator's UTXOs
   * (`planTransactionSynthetic`); simnet's when unset. Real networks take it from
   * the SDK's network parameters.
   */
  coinbaseMaturity?: bigint;
}

export interface PlanTransactionRequest {
  fromAddress: string;
  toAddress: string;
  amountSompi: bigint;
  /**
   * Optional multi-output override. When present, the planner ignores
   * `toAddress`/`amountSompi` and pays these outputs instead.
   */
  outputs?: Array<{ address: string; amountSompi: bigint }>;
  /** Sompi per gram; the Generator never charges less than the network minimum. */
  feeRate?: bigint;
  /** Network whose parameters the Generator applies (defaults to simnet). */
  networkId?: string;
  version?: 0 | 1;
  /** Outpoint keys ("txId:index") to exclude from coin selection (e.g. pending-spent UTXOs). */
  excludeOutpoints?: Set<string>;
  /**
   * Wave 13 · CHANGEADDR-1 · Explicit change-output destination.
   *
   * Optional. When present, the planner routes the change output (if any) to
   * this address instead of `fromAddress`. Semantics are
   * `effectiveChangeAddress = request.changeAddress ?? request.fromAddress`
   * — the ONLY fallback. No inference from account aliases, execution mode,
   * network profile, or any orchestration state. Forwarded to the Generator's
   * `changeAddress` by both `planTransactionUpstream` and
   * `planTransactionSynthetic`.
   */
  changeAddress?: string;
}

export interface ConsolidationRequest {
  fromAddress: string;
  selectedUtxos: Utxo[];
  toAddress: string;
  feeRate?: bigint;
  /** Network whose parameters the Generator applies (defaults to simnet). */
  networkId?: string;
  /** The UTXOs are the simulator's (synthetic identities), never a real network's. */
  simulated?: boolean;
}

/**
 * Categorical planner authority for a `TxPlanResult`. Every plan comes from the
 * pinned kaspa-wasm `Generator` (coin selection, mass, fee, change); the two
 * values say what it planned for:
 *
 * - `KASPA_WASM_GENERATOR` — a real Kaspa network (mainnet, testnet-N, devnet,
 *   localnet/simnet with a real node). Real-network paths MUST end up here and
 *   MUST NOT fall back to `SYNTHETIC_SIMULATOR` on error.
 *
 * - `SYNTHETIC_SIMULATOR` — the simulated developer harness (kaspa:sim_*
 *   accounts, mock scripts), planned under mass-equivalent simnet stand-ins.
 *   NON-AUTHORITATIVE: the simulator is not a Kaspa network and no node
 *   validates what it executes.
 */
export type PlannerAuthority = "KASPA_WASM_GENERATOR" | "SYNTHETIC_SIMULATOR";

export interface TxPlanResult {
  plan: TxPlan;
  utxoSelection: {
    totalUtxosSeen: number;
    selectedUtxos: number;
    selectionStrategy: "consolidation-smallest-first" | "upstream-generator";
    purpose?: "wallet-consolidation";
    warnings?: string[];
  };
  /** Provenance of the plan; set on every plan. */
  plannerAuthority?: PlannerAuthority;
  /**
   * Optional free-form detail for the authority (e.g. `kaspa-wasm@<version>`).
   * Never a substitute for `plannerAuthority`.
   */
  plannerAuthorityDetail?: string;
}

// A coinbase UTXO is spent only this many DAA blocks past its maturity: a HardKAS
// lifecycle tolerance against mempool-vs-virtual-DAA races, not a protocol override.
const MATURITY_MARGIN_DAA = 10n;

/** The network's coinbase maturity, from the SDK's network parameters. */
function networkCoinbaseMaturity(networkId: string): bigint {
  return filterMatureUtxos({ networkId, virtualDaaScore: 0n, utxos: [] }).coinbaseMaturity;
}

function provenance(synthetic: boolean): Pick<TxPlanResult, "plannerAuthority" | "plannerAuthorityDetail"> {
  const auth = adapterAuthority();
  return synthetic
    ? { plannerAuthority: "SYNTHETIC_SIMULATOR", plannerAuthorityDetail: `hardkas.simulator/${auth.sdk}@${auth.version}` }
    : { plannerAuthority: "KASPA_WASM_GENERATOR", plannerAuthorityDetail: `${auth.sdk}@${auth.version}` };
}

export class TxPlanService {
  /**
   * Coinbase maturity, in DAA blocks, for the simulator's UTXOs; simnet's when
   * unset. Real networks take it from `k.getNetworkParams(networkId)` via
   * `filterMatureUtxos`.
   */
  public readonly coinbaseMaturity: bigint | undefined;

  constructor(
    private provider: UtxoProvider,
    options: TxPlanServiceOptions = {}
  ) {
    this.coinbaseMaturity = options.coinbaseMaturity;
  }

  /**
   * Plans a payment on a real Kaspa network with the pinned kaspa-wasm
   * `Generator`, which selects the inputs, prices the transaction and makes the
   * change (`planPaymentWithGenerator`). HardKAS only prepares its candidates:
   *
   * - immature coinbase UTXOs are dropped (maturity from the SDK's network
   *   parameters, plus the 10-DAA margin above);
   * - `excludeOutpoints` are dropped before the Generator, never after (it owns
   *   selection);
   * - a covenant's UTXOs (covenant id set) are dropped: a payment never spends
   *   one (COVENANT-UTXO-PAYMENT-FILTER-1, see `covenant-utxos.ts`).
   *
   * A spend that does not fit in one standard transaction is refused
   * (MULTI_TRANSACTION_PLAN_REQUIRED), and so is a change output too small to be
   * standard (CHANGE_BELOW_STANDARD_OUTPUT). `version` is recorded as given;
   * covenant bindings are not planned here (see `@hardkas/accounts`
   * `buildCovenantGenesis`).
   */
  async planTransactionUpstream(request: PlanTransactionRequest): Promise<TxPlanResult> {
    return this.planPayment(request, false);
  }

  /**
   * Plans a payment for the HardKAS simulator: the same `Generator`, over the
   * simulator's synthetic identities, labelled `SYNTHETIC_SIMULATOR`
   * (NON-AUTHORITATIVE).
   *
   * Callers MUST route to this method only when the execution domain is a
   * HardKAS simulator; real networks MUST use `planTransactionUpstream`. There
   * is no automatic fallback from one to the other: a failure surfaces, it is
   * never silently downgraded.
   */
  async planTransactionSynthetic(request: PlanTransactionRequest): Promise<TxPlanResult> {
    return this.planPayment(request, true);
  }

  private async planPayment(request: PlanTransactionRequest, synthetic: boolean): Promise<TxPlanResult> {
    const networkId = request.networkId ?? "simnet";
    const rpcUtxos = await this.provider.getUtxos(request.fromAddress);
    let virtualDaaScore: bigint | undefined;
    if (this.provider.getVirtualDaaScore) {
      try {
        virtualDaaScore = await this.provider.getVirtualDaaScore();
      } catch {
        // best-effort; without it we skip maturity filtering
      }
    }

    let candidates: Utxo[] = [...rpcUtxos];
    if (virtualDaaScore !== undefined) {
      const current = virtualDaaScore;
      const maturity = synthetic
        ? (this.coinbaseMaturity ?? networkCoinbaseMaturity("simnet"))
        : networkCoinbaseMaturity(networkId);
      candidates = candidates.filter((u) => {
        if (!u.isCoinbase) return true;
        if (u.blockDaaScore === undefined) return current >= maturity;
        return current - u.blockDaaScore > maturity + MATURITY_MARGIN_DAA;
      });
    }

    if (request.excludeOutpoints && request.excludeOutpoints.size > 0) {
      candidates = candidates.filter(
        (u) => !request.excludeOutpoints!.has(`${u.outpoint.transactionId}:${u.outpoint.index}`)
      );
    }

    // COVENANT-UTXO-PAYMENT-FILTER-1: a covenant's UTXO is never a payment input
    const { spendable, covenant } = partitionCovenantUtxos(candidates);
    candidates = spendable;
    const covenantNote = `${covenant.length} covenant UTXO(s) excluded: a payment never spends a covenant's UTXO`;

    if (candidates.length === 0) {
      throw new Error(
        `Insufficient funds: no spendable UTXOs at ${request.fromAddress} (after maturity + excludeOutpoints filters${covenant.length > 0 ? `; ${covenantNote}` : ""}).`
      );
    }

    const outputs =
      request.outputs && request.outputs.length > 0
        ? request.outputs.map((o) => ({ address: o.address, amountSompi: o.amountSompi }))
        : [{ address: request.toAddress, amountSompi: request.amountSompi }];
    const plan = await planPaymentWithGenerator({
      networkId,
      utxos: candidates,
      outputs,
      changeAddress: request.changeAddress ?? request.fromAddress,
      feeRate: request.feeRate,
      syntheticIdentities: synthetic,
      version: request.version
    });

    const warnings = [
      ...(request.excludeOutpoints && request.excludeOutpoints.size > 0
        ? [`${request.excludeOutpoints.size} outpoint(s) excluded from candidate set before Generator`]
        : []),
      ...(covenant.length > 0 ? [covenantNote] : [])
    ];
    return {
      plan,
      utxoSelection: {
        totalUtxosSeen: rpcUtxos.length,
        selectedUtxos: plan.inputs.length,
        selectionStrategy: "upstream-generator",
        ...(warnings.length > 0 ? { warnings } : {})
      },
      ...provenance(synthetic)
    };
  }

  /**
   * Plans a consolidation: every UTXO in `selectedUtxos` goes to one output at
   * `toAddress`, priced by the `Generator`. UTXOs that do not fit in one standard
   * transaction are refused (MULTI_TRANSACTION_PLAN_REQUIRED): consolidate them in
   * smaller batches. A covenant's UTXO among them is refused
   * (COVENANT_UTXO_NOT_PAYMENT_INPUT): consolidating it would end the covenant.
   */
  async planConsolidation(request: ConsolidationRequest): Promise<TxPlanResult> {
    const covenant = request.selectedUtxos.filter((u) => covenantIdOf(u) !== undefined);
    if (covenant.length > 0) {
      throw new GeneratorPlanError(
        "COVENANT_UTXO_NOT_PAYMENT_INPUT",
        `${covenant.length} of the ${request.selectedUtxos.length} selected UTXOs belong to a covenant ` +
          `(${covenant.map((u) => `${u.outpoint.transactionId}:${u.outpoint.index}`).join(", ")}): a consolidation never spends one. Nothing was planned.`
      );
    }
    const synthetic = request.simulated === true;
    const utxos = request.selectedUtxos.map((u) => ({ ...u, amountSompi: BigInt(u.amountSompi) }));
    const totalAmount = utxos.reduce((s, u) => s + u.amountSompi, 0n);

    let outcome;
    try {
      outcome = await planWithGenerator({
        networkId: request.networkId,
        utxos,
        outputs: [],
        changeAddress: request.toAddress,
        feeRate: request.feeRate,
        syntheticIdentities: synthetic
      });
    } catch (e: any) {
      if (e?.code === "INSUFFICIENT_FUNDS_UPSTREAM") {
        const err = new Error(
          `Consolidation failed: Total selected UTXO amount (${totalAmount}) does not cover the network fee for this consolidation.`
        );
        (err as any).code = "INSUFFICIENT_FUNDS_UPSTREAM";
        throw err;
      }
      throw e;
    }

    const plan: TxPlan = {
      version: 0,
      inputs: outcome.inputs,
      outputs: [{ address: request.toAddress, amountSompi: outcome.changeSompi }],
      estimatedMass: outcome.mass,
      estimatedFeeSompi: outcome.feeSompi
    };

    return {
      plan,
      utxoSelection: {
        totalUtxosSeen: request.selectedUtxos.length,
        selectedUtxos: outcome.inputs.length,
        selectionStrategy: "consolidation-smallest-first",
        purpose: "wallet-consolidation"
      },
      ...provenance(synthetic)
    };
  }
}
