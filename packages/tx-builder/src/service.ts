import { buildPaymentPlan, planSingleOutputSpend, type Utxo, type TxOutput, type TxPlan } from "./index.js";

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

export interface TxPlanResult {
  plan: TxPlan;
  utxoSelection: {
    totalUtxosSeen: number;
    selectedUtxos: number;
    selectionStrategy: "largest-first" | "consolidation-smallest-first";
    purpose?: "wallet-consolidation";
    warnings?: string[];
  };
}

export class TxPlanService {
  public readonly maxInputsPerTx: number;
  public readonly warnInputs: number;
  public readonly marginFeePerInput: bigint;
  public readonly coinbaseMaturity: bigint;

  constructor(
    private provider: UtxoProvider,
    options: TxPlanServiceOptions = {}
  ) {
    this.maxInputsPerTx = options.maxInputsPerTx ?? 512;
    this.warnInputs = options.warnInputs ?? 128;
    this.marginFeePerInput = options.marginFeePerInput ?? 1500n;
    if (options.coinbaseMaturity === undefined) {
      throw new Error("COINBASE_MATURITY_UNRESOLVED: TxPlanService requires coinbaseMaturity to be explicitly provided");
    }
    this.coinbaseMaturity = options.coinbaseMaturity;
  }

  async planTransaction(request: PlanTransactionRequest): Promise<TxPlanResult> {
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
            return virtualDaaScore! - score > (this.coinbaseMaturity + 10n);
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
        coinbaseMaturity: this.coinbaseMaturity,
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

  async planConsolidation(request: ConsolidationRequest): Promise<TxPlanResult> {
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
      coinbaseMaturity: this.coinbaseMaturity
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
