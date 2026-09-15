import { buildPaymentPlan, planSingleOutputSpend, type Utxo, type TxOutput, type TxPlan } from "./index.js";
import {
  buildTransactions,
  filterMatureUtxos,
  adapterAuthority
} from "./kaspa-wallet-adapter.js";

export interface UtxoProvider {
  getUtxos(address: string): Promise<Utxo[]>;
  getVirtualDaaScore?(): Promise<bigint>;
}

export interface TxPlanServiceOptions {
  maxInputsPerTx?: number;
  warnInputs?: number;
  marginFeePerInput?: bigint;
  coinbaseMaturity?: bigint;
}

export interface PlanTransactionRequest {
  fromAddress: string;
  toAddress: string;
  amountSompi: bigint;
  /**
   * Optional multi-output override for the upstream planner
   * (`planTransactionUpstream`). When present, the planner ignores
   * `toAddress`/`amountSompi` and pays these outputs instead. Ignored by the
   * legacy `planTransaction` path.
   */
  outputs?: Array<{ address: string; amountSompi: bigint }>;
  feeRate?: bigint;
  /** Network whose mass parameters the SDK applies (defaults to simnet). */
  networkId?: string;
  version?: 0 | 1;
  feePolicy?: "legacy" | "toccata" | "auto";
  feeEstimator?: (inputs: number, outputs: number) => Promise<bigint>;
  genesisCovenantGroups?: Array<{ authorizingInput: number; outputIndices: number[] }>;
  /** Outpoint keys ("txId:index") to exclude from coin selection (e.g. pending-spent UTXOs). */
  excludeOutpoints?: Set<string>;
}

export interface ConsolidationRequest {
  fromAddress: string;
  selectedUtxos: Utxo[];
  toAddress: string;
  feeRate?: bigint;
}

/**
 * Categorical planner authority for a `TxPlanResult`. Two disjoint values:
 *
 * - `KASPA_WASM_GENERATOR` — coin selection, mass and fee decided by
 *   kaspa-wasm's `Generator`. This is the ONLY authoritative planner for real
 *   Kaspa networks (mainnet, testnet-N, devnet, localnet/simnet with a real
 *   node). Real-network paths MUST end up here and MUST NOT fall back to
 *   `SYNTHETIC_SIMULATOR` on error.
 *
 * - `SYNTHETIC_SIMULATOR` — HardKAS-owned synthetic planner used exclusively
 *   by the simulated developer harness (kaspa:sim_* accounts, mock scripts).
 *   NON-AUTHORITATIVE: does not consult upstream network params, is not fee
 *   authority for Kaspa, and never touches a real UTXO. Present only so the
 *   `mode: simulated` DX workflow keeps working without contaminating the
 *   real-network claim.
 */
export type PlannerAuthority = "KASPA_WASM_GENERATOR" | "SYNTHETIC_SIMULATOR";

export interface TxPlanResult {
  plan: TxPlan;
  utxoSelection: {
    totalUtxosSeen: number;
    selectedUtxos: number;
    selectionStrategy: "largest-first" | "consolidation-smallest-first" | "upstream-generator";
    purpose?: "wallet-consolidation";
    warnings?: string[];
  };
  /**
   * Provenance of the planning algorithm. Set on `planTransactionUpstream`
   * (KASPA_WASM_GENERATOR) and `planTransactionSynthetic`
   * (SYNTHETIC_SIMULATOR). Left undefined on the deprecated `planTransaction`
   * to keep existing tests that assert its absence stable during the
   * transition.
   */
  plannerAuthority?: PlannerAuthority;
  /**
   * Optional free-form detail for the authority (e.g. `2.0.1` for the WASM
   * SDK version). Never a substitute for `plannerAuthority`.
   */
  plannerAuthorityDetail?: string;
}

export class TxPlanService {
  public readonly maxInputsPerTx: number;
  public readonly warnInputs: number;
  public readonly marginFeePerInput: bigint;
  /**
   * Coinbase maturity, in DAA blocks.
   *
   * - **Legacy path** (`planTransaction`, `planConsolidation`): required. Passed
   *   through to `buildPaymentPlan`, which enforces the maturity filter.
   * - **Upstream path** (`planTransactionUpstream`): ignored. Maturity comes
   *   from `k.getNetworkParams(networkId)` via `filterMatureUtxos`.
   *
   * Constructing the service without a maturity value is legal; only the
   * legacy methods throw `COINBASE_MATURITY_UNRESOLVED` when invoked.
   */
  public readonly coinbaseMaturity: bigint | undefined;

  constructor(
    private provider: UtxoProvider,
    options: TxPlanServiceOptions = {}
  ) {
    this.maxInputsPerTx = options.maxInputsPerTx ?? 512;
    this.warnInputs = options.warnInputs ?? 128;
    this.marginFeePerInput = options.marginFeePerInput ?? 1500n;
    this.coinbaseMaturity = options.coinbaseMaturity;
  }

  private requireLegacyMaturity(): bigint {
    if (this.coinbaseMaturity === undefined) {
      throw new Error("COINBASE_MATURITY_UNRESOLVED: TxPlanService requires coinbaseMaturity to be explicitly provided when using the legacy planTransaction/planConsolidation paths");
    }
    return this.coinbaseMaturity;
  }

  /**
   * @deprecated Legacy HardKAS planner (largest-first + fee convergence over
   * `buildPaymentPlan`). Kept solely as the machinery under
   * `planTransactionSynthetic` (simulator-only) and as a comparison baseline
   * for differential tests. NO real-network execution path should reach this
   * method directly — real networks go through `planTransactionUpstream`.
   * Callers wanting the simulator planner should use
   * `planTransactionSynthetic`, which labels its output NON-AUTHORITATIVE via
   * `plannerAuthority = SYNTHETIC_SIMULATOR`.
   */
  async planTransaction(request: PlanTransactionRequest): Promise<TxPlanResult> {
    const legacyMaturity = this.requireLegacyMaturity();
    const rpcUtxos = await this.provider.getUtxos(request.fromAddress);

    let virtualDaaScore: bigint | undefined;
    if (this.provider.getVirtualDaaScore) {
      try {
        virtualDaaScore = await this.provider.getVirtualDaaScore();
      } catch {
        // Best-effort
      }
    }

    const matureUtxos =
      virtualDaaScore !== undefined
        ? rpcUtxos.filter((u) => {
            if (!u.isCoinbase) return true;
            const score = u.blockDaaScore;
            if (score === undefined) return true;
            return virtualDaaScore! - score > (legacyMaturity + 10n);
          })
        : rpcUtxos;

    // Exclude pending-spent outpoints if provided
    const allFetchedUtxos = request.excludeOutpoints
      ? matureUtxos.filter(u =>
          !request.excludeOutpoints!.has(`${u.outpoint.transactionId}:${u.outpoint.index}`))
      : matureUtxos;

    // Largest-first sorting
    const sortedUtxos = [...allFetchedUtxos].sort((a, b) => {
      if (a.amountSompi > b.amountSompi) return -1;
      if (a.amountSompi < b.amountSompi) return 1;
      return 0;
    });

    const feeRate = request.feeRate ?? 1n;
    let estimatedFee = 0n;
    let selectedAmount = 0n;
    let selectedInputsCount = 0;
    const builderUtxos: Utxo[] = [];

    const MAX_FEE_SELECTION_PASSES = 5;
    let converged = false;

    for (let pass = 0; pass < MAX_FEE_SELECTION_PASSES; pass++) {
      selectedAmount = 0n;
      selectedInputsCount = 0;
      builderUtxos.length = 0;

      const HARD_LIMIT = 1000;

      for (const utxo of sortedUtxos) {
        builderUtxos.push(utxo);
        selectedAmount += utxo.amountSompi;
        selectedInputsCount++;

        const requiredTotal = request.amountSompi + estimatedFee;
        if (selectedAmount >= requiredTotal) {
          break;
        }

        if (selectedInputsCount >= HARD_LIMIT) {
          break;
        }
      }

      if (selectedAmount < request.amountSompi + estimatedFee) {
        throw new Error(
          `Insufficient funds: needed ${request.amountSompi + estimatedFee} sompi (including fee) but only found ${selectedAmount} sompi across ${selectedInputsCount} UTXOs.`
        );
      }

      const expectedOutputs = 2; // to + change
      let nextFee = 0n;

      if (request.feeEstimator) {
        nextFee = await request.feeEstimator(selectedInputsCount, expectedOutputs);
      } else {
        const estimatedMass = BigInt(selectedInputsCount) * this.marginFeePerInput + 500n;
        nextFee = estimatedMass * feeRate;
      }

      if (nextFee === estimatedFee) {
        converged = true;
        break;
      }

      estimatedFee = nextFee;
    }

    if (!converged) {
      throw new Error("FeeSelectionDidNotConvergeError: Could not find a stable UTXO selection for the required fee.");
    }

    if (selectedInputsCount > this.maxInputsPerTx) {
      const err = new Error(
        `TOO_MANY_INPUTS_FOR_SINGLE_TX: Transaction requires ${selectedInputsCount} inputs to cover the amount, which exceeds the safe limit of ${this.maxInputsPerTx} inputs.\nHint: Run 'hardkas accounts consolidate' to merge dust UTXOs.`
      );
      (err as any).code = "TOO_MANY_INPUTS_FOR_SINGLE_TX";
      throw err;
    }

    const warnings: string[] = [];
    if (selectedInputsCount >= this.warnInputs) {
      warnings.push(
        `Transaction requires ${selectedInputsCount} inputs. Consider running 'hardkas accounts consolidate'.`
      );
    }

    const planFeeRate = request.feeEstimator ? 1n : feeRate;

    const build = () =>
      buildPaymentPlan({
        fromAddress: request.fromAddress,
        availableUtxos: builderUtxos,
        outputs: [
          {
            address: request.toAddress,
            amountSompi: request.amountSompi
          }
        ],
        feeRateSompiPerMass: planFeeRate,
        ...(request.networkId !== undefined ? { networkId: request.networkId } : {}),
        ...(request.version !== undefined ? { version: request.version } : {}),
        ...(request.feePolicy ? { feePolicy: request.feePolicy } : {}),
        coinbaseMaturity: legacyMaturity,
        ...(request.feeEstimator ? { feeOverrideSompi: estimatedFee } : {}),
        ...(request.genesisCovenantGroups ? { genesisCovenantGroups: request.genesisCovenantGroups.map(g => ({ ...g })) } : {})
      });

    // The pre-selection above only picks UTXOs; the fee is decided by
    // buildPaymentPlan with the SDK (storage mass included). If that fee needs
    // more than was pre-selected, add the next largest UTXO and plan again.
    let builderPlan: TxPlan;
    for (;;) {
      try {
        builderPlan = build();
        break;
      } catch (e: any) {
        const short = typeof e?.message === "string" && e.message.startsWith("Insufficient funds");
        const next = sortedUtxos[builderUtxos.length];
        if (!short || request.feeEstimator || !next || builderUtxos.length >= this.maxInputsPerTx) throw e;
        builderUtxos.push(next);
        selectedInputsCount = builderUtxos.length;
      }
    }

    return {
      plan: builderPlan,
      utxoSelection: {
        totalUtxosSeen: allFetchedUtxos.length,
        selectedUtxos: selectedInputsCount,
        selectionStrategy: "largest-first",
        warnings
      }
    };
  }

  /**
   * Upstream-authoritative planner (M10-B-completion). Uses kaspa-wasm 2.0.1
   * `Generator` for coin selection, mass and fee. Adapts the resulting
   * `PendingTransaction` into HardKAS `TxPlan` shape without inventing
   * semantics.
   *
   * Rules honored:
   * - `excludeOutpoints` is pre-filtered on entries; **not** re-applied after
   *   selection (upstream owns selection).
   * - `request.feeEstimator` custom callback is **ignored on this path**;
   *   upstream is the fee authority. When callers set it, the effect is a
   *   no-op here (documented; will be removed once every consumer migrates).
   * - Coinbase maturity comes from `k.getNetworkParams(networkId)` via
   *   `filterMatureUtxos`, plus the same `+10n` DAG safety margin the legacy
   *   path used, to avoid mempool-vs-virtual-DAA races. This margin is a
   *   HardKAS lifecycle tolerance, not an override of the protocol threshold.
   * - `feePolicy`, `version`, `genesisCovenantGroups`, `computeBudget` are
   *   currently NOT wired to the upstream planner (Generator has no per-output
   *   covenant binding). Callers that need those still use covenant-specific
   *   builders directly (see `@hardkas/accounts` `buildCovenantGenesis`).
   */
  async planTransactionUpstream(request: PlanTransactionRequest): Promise<TxPlanResult> {
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

    // 1. Upstream maturity filter (upstream network params + HardKAS +10n DAG margin).
    let candidates: Utxo[];
    if (virtualDaaScore !== undefined) {
      const filtered = filterMatureUtxos<Utxo>({
        networkId,
        virtualDaaScore,
        utxos: rpcUtxos,
        readEntry: (u: Utxo) => ({
          blockDaaScore: u.blockDaaScore ?? 0n,
          isCoinbase: Boolean(u.isCoinbase)
        })
      });
      const marginAware = filtered.mature.filter((u) => {
        if (!u.isCoinbase) return true;
        const score = u.blockDaaScore;
        if (score === undefined) return true;
        return virtualDaaScore! - score > (filtered.coinbaseMaturity + 10n);
      });
      candidates = marginAware;
    } else {
      candidates = [...rpcUtxos];
    }

    // 2. Pre-filter excludeOutpoints (upstream owns selection; no re-filtering after).
    if (request.excludeOutpoints && request.excludeOutpoints.size > 0) {
      candidates = candidates.filter(
        (u) => !request.excludeOutpoints!.has(`${u.outpoint.transactionId}:${u.outpoint.index}`)
      );
    }

    // 3. Adapt HardKAS `Utxo` -> Generator entry shape.
    const entries = candidates.map((u) => ({
      address: u.address,
      outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
      utxoEntry: {
        amount: u.amountSompi,
        scriptPublicKey: u.scriptPublicKey,
        blockDaaScore: u.blockDaaScore ?? 0n,
        isCoinbase: Boolean(u.isCoinbase)
      }
    }));

    if (entries.length === 0) {
      throw new Error(
        `Insufficient funds: no spendable UTXOs at ${request.fromAddress} (after maturity + excludeOutpoints filters).`
      );
    }

    // 4. Delegate coin selection and fee to upstream Generator. Iterate the first PendingTransaction.
    const changeAddress = request.fromAddress; // same as legacy — change returns to sender
    const planOutputSpecs =
      request.outputs && request.outputs.length > 0
        ? request.outputs.map((o) => ({ address: o.address, amountSompi: o.amountSompi }))
        : [{ address: request.toAddress, amountSompi: request.amountSompi }];
    const outputs = planOutputSpecs.map((o) => ({ address: o.address, amount: o.amountSompi }));
    const priorityFee = request.feeRate !== undefined ? { amount: 0n, rate: request.feeRate } : { amount: 0n };

    let pt: any | undefined;
    try {
      for await (const candidate of buildTransactions({
        networkId,
        entries,
        outputs,
        changeAddress,
        priorityFee: priorityFee as any
      })) {
        pt = candidate;
        break; // single-output plans: first tx is enough
      }
    } catch (err: any) {
      // Upstream Generator throws on insufficient funds; surface with our error shape.
      if (typeof err?.message === "string" && /insufficient/i.test(err.message)) {
        const totalTarget = planOutputSpecs.reduce((s, o) => s + o.amountSompi, 0n);
        const wrapped = new Error(
          `Insufficient funds: upstream Generator could not build a transaction for ${totalTarget} sompi total. (${err.message})`
        );
        (wrapped as any).code = "INSUFFICIENT_FUNDS_UPSTREAM";
        throw wrapped;
      }
      throw err;
    }
    if (!pt) {
      throw new Error("UPSTREAM_PLANNER_EMPTY: Generator yielded no PendingTransaction");
    }

    // 5. Adapt `PendingTransaction` -> `TxPlan` (HardKAS contract preserved).
    const byOutpoint = new Map<string, Utxo>(
      candidates.map((u) => [`${u.outpoint.transactionId}:${u.outpoint.index}`, u])
    );
    const txObj = pt.serializeToObject?.() ?? pt.transaction;
    const rawInputs: any[] = txObj?.inputs ?? [];
    const selectedInputs: Utxo[] = rawInputs.map((inp: any) => {
      const prev = inp.previousOutpoint ?? inp.previous_outpoint ?? inp;
      const key = `${prev.transactionId ?? prev.txId}:${Number(prev.index ?? 0)}`;
      const original = byOutpoint.get(key);
      if (!original) {
        throw new Error(
          `UPSTREAM_PLANNER_UTXO_MISSING: Generator selected outpoint ${key} not in candidate set`
        );
      }
      return original;
    });

    const changeAmount: bigint =
      typeof pt.changeAmount === "bigint"
        ? pt.changeAmount
        : (pt.changeAmount ?? 0n) as bigint;
    const feeAmount: bigint = pt.feeAmount as bigint;
    const mass: bigint = pt.mass as bigint;

    const planOutputs: TxOutput[] = planOutputSpecs.map((o) => ({ address: o.address, amountSompi: o.amountSompi }));
    const change: TxOutput | undefined =
      changeAmount > 0n
        ? { address: changeAddress, amountSompi: changeAmount }
        : undefined;

    const version: 0 | 1 = request.version ?? 0;
    const plan: TxPlan = {
      version,
      inputs: selectedInputs,
      outputs: planOutputs,
      ...(change !== undefined ? { change } : {}),
      estimatedMass: mass,
      estimatedFeeSompi: feeAmount
    };

    const auth = adapterAuthority();
    return {
      plan,
      utxoSelection: {
        totalUtxosSeen: rpcUtxos.length,
        selectedUtxos: selectedInputs.length,
        selectionStrategy: "upstream-generator",
        ...(request.excludeOutpoints && request.excludeOutpoints.size > 0
          ? { warnings: [`${request.excludeOutpoints.size} outpoint(s) excluded from candidate set before Generator`] }
          : {})
      },
      plannerAuthority: "KASPA_WASM_GENERATOR",
      plannerAuthorityDetail: `${auth.sdk}@${auth.version}`
    };
  }

  /**
   * Synthetic (simulator-only) planner. Runs the same legacy machinery as
   * `planTransaction` but is explicitly labelled `SYNTHETIC_SIMULATOR` and
   * documented as NON-AUTHORITATIVE. This exists so the `mode: simulated`
   * developer harness (kaspa:sim_* accounts, `mock-script` SPKs) keeps
   * working without ever being reachable from a real Kaspa execution path.
   *
   * Callers MUST route to this method only when the execution domain is a
   * HardKAS simulator; real networks (mainnet/testnet-N/devnet/simnet with a
   * real node/localnet) MUST use `planTransactionUpstream`. There is no
   * automatic fallback from the upstream path to this one — an upstream
   * failure must surface, not be silently downgraded.
   */
  async planTransactionSynthetic(request: PlanTransactionRequest): Promise<TxPlanResult> {
    const base = await this.planTransaction(request);
    return {
      ...base,
      plannerAuthority: "SYNTHETIC_SIMULATOR",
      plannerAuthorityDetail: "hardkas.simulator/legacy@internal"
    };
  }

  async planConsolidation(request: ConsolidationRequest): Promise<TxPlanResult> {
    const legacyMaturity = this.requireLegacyMaturity();
    let totalAmount = 0n;
    const builderUtxos = request.selectedUtxos.map((u) => {
      const amount = BigInt(u.amountSompi);
      totalAmount += amount;
      return u;
    });

    // Fee settled against the SDK for the consolidation as built (single output).
    const feeRate = request.feeRate ?? 1n;
    let outputAmount: bigint;
    try {
      outputAmount = planSingleOutputSpend({
        inputs: builderUtxos,
        toAddress: request.toAddress,
        feeRateSompiPerMass: feeRate
      }).sendSompi;
    } catch (e: any) {
      if (typeof e?.message === "string" && e.message.startsWith("Insufficient funds")) {
        throw new Error(
          `Consolidation failed: Total selected UTXO amount (${totalAmount}) does not cover the network fee for this consolidation.`
        );
      }
      throw e;
    }

    const builderPlan = buildPaymentPlan({
      fromAddress: request.fromAddress,
      availableUtxos: builderUtxos,
      outputs: [
        {
          address: request.toAddress,
          amountSompi: outputAmount
        }
      ],
      feeRateSompiPerMass: feeRate,
      coinbaseMaturity: legacyMaturity
    });

    return {
      plan: builderPlan,
      utxoSelection: {
        totalUtxosSeen: request.selectedUtxos.length,
        selectedUtxos: request.selectedUtxos.length,
        selectionStrategy: "consolidation-smallest-first",
        purpose: "wallet-consolidation"
      }
    };
  }
}
