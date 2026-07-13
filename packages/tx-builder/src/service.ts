import { buildPaymentPlan, type Utxo, type TxOutput, type TxPlan } from "./index.js";

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
  genesisCovenantGroups?: Array<{ authorizingInput: number; outputIndices: number[] }>;
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
    this.coinbaseMaturity = options.coinbaseMaturity ?? 1000n;
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
            return virtualDaaScore! - score >= this.coinbaseMaturity;
          })
        : rpcUtxos;

    const allFetchedUtxos = matureUtxos;

    // Largest-first sorting
    const sortedUtxos = [...allFetchedUtxos].sort((a, b) => {
      if (a.amountSompi > b.amountSompi) return -1;
      if (a.amountSompi < b.amountSompi) return 1;
      return 0;
    });

    const feeRate = request.feeRate ?? 1n;
    const marginFee = this.marginFeePerInput * feeRate;

    let selectedAmount = 0n;
    let selectedInputsCount = 0;
    const builderUtxos: Utxo[] = [];

    const HARD_LIMIT = 1000;

    for (const utxo of sortedUtxos) {
      builderUtxos.push(utxo);
      selectedAmount += utxo.amountSompi;
      selectedInputsCount++;

      const requiredTotal = request.amountSompi + BigInt(selectedInputsCount) * marginFee;
      if (selectedAmount >= requiredTotal) {
        break;
      }

      if (selectedInputsCount >= HARD_LIMIT) {
        break;
      }
    }

    if (selectedAmount < request.amountSompi) {
      throw new Error(
        `Insufficient funds: needed ${request.amountSompi} sompi but only found ${selectedAmount} sompi across ${selectedInputsCount} UTXOs.`
      );
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

    const builderPlan = buildPaymentPlan({
      fromAddress: request.fromAddress,
      availableUtxos: builderUtxos,
      outputs: [
        {
          address: request.toAddress,
          amountSompi: request.amountSompi
        }
      ],
      feeRateSompiPerMass: feeRate,
      ...(request.genesisCovenantGroups ? { genesisCovenantGroups: request.genesisCovenantGroups.map(g => ({ ...g })) } : {})
    });

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

    const feeRate = request.feeRate ?? 1n;
    const massPerInput = 1500n;
    const estimatedMass = BigInt(request.selectedUtxos.length) * massPerInput + 500n;
    const expectedFee = estimatedMass * feeRate;

    if (totalAmount <= expectedFee) {
      throw new Error(
        `Consolidation failed: Total selected UTXO amount (${totalAmount}) is less than or equal to the estimated fee (${expectedFee}).`
      );
    }

    const outputAmount = totalAmount - expectedFee;

    const builderPlan = buildPaymentPlan({
      fromAddress: request.fromAddress,
      availableUtxos: builderUtxos,
      outputs: [
        {
          address: request.toAddress,
          amountSompi: outputAmount
        }
      ],
      feeRateSompiPerMass: feeRate
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
