import { Utxo } from "@hardkas/query";

export interface UtxoStatistics {
  totalUtxos: number;
  availableUtxos: number;
  frozenUtxos: number;
  totalValue: bigint;
  availableValue: bigint;
  frozenValue: bigint;
  averageValue: bigint;
  largest: bigint;
  smallest: bigint;
  includeFrozen: boolean;
}

export interface DustAnalysis {
  dustUtxos: Utxo[];
  normalUtxos: Utxo[];
  totalDustValue: bigint;
  dustPercentage: number;
}

export type Recommendation = "consolidate" | "mergeDust" | "splitLarge" | "none";

export interface WalletAnalysis {
  utxoCount: number;
  fragmentationScore: number; // 0.0 to 1.0 (e.g. dustCount / totalUtxos)
  dustCount: number;
  totalValue: bigint;
  recommendedActions: Recommendation[];
}

export interface ConsolidationPlan {
  strategy: string;
  inputs: Utxo[];
  outputs: any[]; // Target outputs (usually one consolidated output back to the wallet)
  estimatedFee: bigint;
  estimatedSavings: bigint; // Approximated future fee savings
  warnings: string[];
}

export interface SplitPlan extends ConsolidationPlan {
  strategy: "split";
}

export interface MergePlan extends ConsolidationPlan {
  strategy: "merge";
}

export interface SweepPlan extends ConsolidationPlan {
  strategy: "sweep";
}

import { UtxoControlStore, UtxoControlState } from './stores/utxo-control-store.js';

export interface UtxoListOpts { includeFrozen?: boolean | undefined }

export class WalletUtxoApi {
  constructor(
    private readonly fetchUtxos: () => Promise<Utxo[]>,
    private readonly address: () => Promise<string>,
    private readonly estimateFee: (inputs: number, outputs: number) => Promise<bigint>,
    private readonly store: UtxoControlStore
  ) {}

  /**
   * List UTXOs currently available in the wallet.
   * Frozen UTXOs are excluded by default unless includeFrozen: true.
   */
  async list(opts?: UtxoListOpts): Promise<Utxo[]> {
    const all = await this.fetchUtxos();
    const state = this.store.getState();
    if (opts?.includeFrozen) {
      return all;
    }
    return all.filter(u => !state.frozen[u.transactionId] && !state.frozen[`${u.transactionId}:${u.outputIndex}`]);
  }

  /**
   * Return basic statistics about the UTXO set.
   */
  async statistics(opts?: UtxoListOpts): Promise<UtxoStatistics> {
    const allUtxos = await this.fetchUtxos();
    const state = this.store.getState();
    
    let totalUtxos = 0;
    let availableUtxos = 0;
    let frozenUtxos = 0;
    
    let totalValue = 0n;
    let availableValue = 0n;
    let frozenValue = 0n;
    
    let largest = -1n;
    let smallest = -1n;

    const includeFrozen = opts?.includeFrozen ?? false;

    for (const u of allUtxos) {
      const amt = BigInt(u.amountSompi);
      const isFrozen = !!(state.frozen[u.transactionId] || state.frozen[`${u.transactionId}:${u.outputIndex}`]);

      totalUtxos++;
      totalValue += amt;

      if (isFrozen) {
        frozenUtxos++;
        frozenValue += amt;
      } else {
        availableUtxos++;
        availableValue += amt;
      }

      // Largest/smallest only counts what is included
      if (includeFrozen || !isFrozen) {
        if (largest === -1n || amt > largest) largest = amt;
        if (smallest === -1n || amt < smallest) smallest = amt;
      }
    }

    const countForAvg = includeFrozen ? totalUtxos : availableUtxos;
    const valueForAvg = includeFrozen ? totalValue : availableValue;

    return {
      totalUtxos,
      availableUtxos,
      frozenUtxos,
      totalValue,
      availableValue,
      frozenValue,
      averageValue: countForAvg === 0 ? 0n : valueForAvg / BigInt(countForAvg),
      largest: largest === -1n ? 0n : largest,
      smallest: smallest === -1n ? 0n : smallest,
      includeFrozen
    };
  }

  /**
   * Classify UTXOs into dust and normal based on a threshold.
   * Default threshold: 10 KAS (1_000_000_000 sompi).
   */
  async analyzeDust(opts?: { thresholdSompi?: bigint, includeFrozen?: boolean | undefined }): Promise<DustAnalysis> {
    const threshold = opts?.thresholdSompi ?? 1_000_000_000n;
    const utxos = await this.list({ includeFrozen: opts?.includeFrozen });

    const dustUtxos: Utxo[] = [];
    const normalUtxos: Utxo[] = [];
    let totalDustValue = 0n;

    for (const u of utxos) {
      const amt = BigInt(u.amountSompi);
      if (amt < threshold) {
        dustUtxos.push(u);
        totalDustValue += amt;
      } else {
        normalUtxos.push(u);
      }
    }

    return {
      dustUtxos,
      normalUtxos,
      totalDustValue,
      dustPercentage: utxos.length > 0 ? dustUtxos.length / utxos.length : 0
    };
  }

  /**
   * High-level diagnostic analysis of the wallet's UTXO health.
   */
  async analyze(opts?: UtxoListOpts): Promise<WalletAnalysis> {
    const stats = await this.statistics(opts);
    const dust = await this.analyzeDust(opts);

    const fragmentationScore = dust.dustPercentage; 
    const actions: Recommendation[] = [];
    
    // We base actions on available counts
    const activeUtxoCount = opts?.includeFrozen ? stats.totalUtxos : stats.availableUtxos;

    if (fragmentationScore > 0.5 && activeUtxoCount > 10) {
      actions.push("consolidate");
    } else if (dust.dustUtxos.length > 5) {
      actions.push("mergeDust");
    }
    
    // Simplistic threshold for splitLarge: if there are very few UTXOs but high value
    if (activeUtxoCount < 3 && stats.largest > 10_000_000_000n) {
      actions.push("splitLarge");
    }

    if (actions.length === 0) {
      actions.push("none");
    }

    return {
      utxoCount: activeUtxoCount,
      fragmentationScore,
      dustCount: dust.dustUtxos.length,
      totalValue: opts?.includeFrozen ? stats.totalValue : stats.availableValue,
      recommendedActions: actions
    };
  }

  /**
   * Plan a UTXO management operation without executing it.
   */
  async plan(opts: { strategy: "consolidation" | "split" | "sweep", includeFrozen?: boolean | undefined }): Promise<ConsolidationPlan> {
    const utxos = await this.list({ includeFrozen: opts.includeFrozen });
    const myAddress = await this.address();

    if (opts.strategy === "consolidation") {
      // In a real scenario, the CoinSelector would chunk this to respect mass limits.
      // For Phase 1A, we will just select up to 84 (a safe mass limit approximation for Kaspa).
      const MAX_INPUTS = 84;
      
      // Sort smallest first to consolidate dust
      const sorted = [...utxos].sort((a, b) => (BigInt(a.amountSompi) < BigInt(b.amountSompi) ? -1 : 1));
      const inputs = sorted.slice(0, MAX_INPUTS);

      const estimatedFee = await this.estimateFee(inputs.length, 1);
      
      const totalInputValue = inputs.reduce((sum, u) => sum + BigInt(u.amountSompi), 0n);

      const warnings: string[] = [];
      if (inputs.length < 2) {
        warnings.push("Not enough UTXOs to consolidate.");
      }
      if (totalInputValue <= estimatedFee) {
        warnings.push("Consolidation fee exceeds the value of the selected UTXOs.");
      }

      // If we spent these 84 UTXOs individually in the future, we would pay for 1 input each time.
      // 84 txs with 1 input vs 1 tx with 84 inputs.
      // This is a naive calculation for "estimated savings".
      const individualFee = await this.estimateFee(1, 2); 
      const estimatedSavings = (individualFee * BigInt(inputs.length)) - estimatedFee;

      return {
        strategy: opts.strategy,
        inputs,
        outputs: [{ address: myAddress, amount: totalInputValue - estimatedFee }],
        estimatedFee,
        estimatedSavings: estimatedSavings > 0n ? estimatedSavings : 0n,
        warnings
      };
    }

    throw new Error(`Strategy '${opts.strategy}' not fully implemented yet.`);
  }

  /**
   * Convenience alias for planning a consolidation.
   */
  async consolidate(opts?: { includeFrozen?: boolean | undefined }): Promise<ConsolidationPlan> {
    return this.plan({ strategy: "consolidation", includeFrozen: opts?.includeFrozen });
  }

  private _assertNotFrozen(utxoId: string, includeFrozen?: boolean) {
    if (!includeFrozen && this.store.getState().frozen[utxoId]) {
      throw new Error(`UTXO ${utxoId} is frozen and cannot be planned for execution`);
    }
  }

  /**
   * Plans the splitting of a specific large UTXO.
   * Supports symmetric splits (intoCount) OR asymmetric splits (outputs).
   */
  async splitPlan(opts: { 
    utxoId: string;
    intoCount?: number;
    outputs?: { amountSompi: bigint }[];
    includeFrozen?: boolean | undefined;
  }): Promise<SplitPlan> {
    this._assertNotFrozen(opts.utxoId, opts.includeFrozen);
    const utxos = await this.list({ includeFrozen: opts.includeFrozen });
    const targetUtxo = utxos.find(u => u.transactionId === opts.utxoId || `${u.transactionId}:${u.outputIndex}` === opts.utxoId);
    
    if (!targetUtxo) {
      throw new Error(`UTXO ${opts.utxoId} not found in wallet.`);
    }

    const myAddress = await this.address();
    const warnings: string[] = [];
    const planOutputs: { address: string, amount: bigint }[] = [];
    
    const targetAmount = BigInt(targetUtxo.amountSompi);
    let outputCount = 0;

    if (opts.intoCount !== undefined && opts.outputs === undefined) {
      outputCount = opts.intoCount;
      if (outputCount < 2) throw new Error("splitPlan requires intoCount >= 2.");
      
      const estimatedFee = await this.estimateFee(1, outputCount);
      const remainingAmount = targetAmount - estimatedFee;
      
      if (remainingAmount <= 0n) {
        throw new Error("Target UTXO does not have enough funds to cover the split and fees.");
      }

      const chunkAmount = remainingAmount / BigInt(outputCount);
      for (let i = 0; i < outputCount; i++) {
        planOutputs.push({ address: myAddress, amount: chunkAmount });
      }
    } else if (opts.outputs !== undefined && opts.intoCount === undefined) {
      outputCount = opts.outputs.length;
      if (outputCount < 2) throw new Error("splitPlan requires outputs.length >= 2.");
      
      const estimatedFee = await this.estimateFee(1, outputCount + 1); // +1 for change
      let sumOutputs = 0n;

      for (const out of opts.outputs) {
        sumOutputs += out.amountSompi;
        planOutputs.push({ address: myAddress, amount: out.amountSompi });
      }

      const changeAmount = targetAmount - sumOutputs - estimatedFee;
      if (changeAmount < 0n) {
        throw new Error("Target UTXO does not have enough funds to cover the requested outputs and fees.");
      }
      
      if (changeAmount > 0n) {
        // Add change output
        planOutputs.push({ address: myAddress, amount: changeAmount });
      }
    } else {
      throw new Error("splitPlan requires exactly one of 'intoCount' or 'outputs' to be defined.");
    }

    const estimatedFee = await this.estimateFee(1, planOutputs.length);
    
    return {
      strategy: "split",
      inputs: [targetUtxo],
      outputs: planOutputs,
      estimatedFee,
      estimatedSavings: 0n,
      warnings
    };
  }

  /**
   * Plans the explicit merging of specific UTXOs.
   */
  async mergePlan(opts: { 
    utxoIds: string[];
    includeFrozen?: boolean | undefined;
  }): Promise<MergePlan> {
    for (const id of opts.utxoIds) {
      this._assertNotFrozen(id, opts.includeFrozen);
    }
    const utxos = await this.list({ includeFrozen: opts.includeFrozen });
    const inputs: Utxo[] = [];
    
    for (const id of opts.utxoIds) {
      const u = utxos.find(utxo => utxo.transactionId === id || `${utxo.transactionId}:${utxo.outputIndex}` === id);
      if (!u) {
        throw new Error(`UTXO ${id} not found in wallet.`);
      }
      inputs.push(u);
    }

    if (inputs.length < 2) {
      throw new Error("mergePlan requires at least 2 UTXOs to merge.");
    }

    const estimatedFee = await this.estimateFee(inputs.length, 1);
    const totalInputValue = inputs.reduce((sum, u) => sum + BigInt(u.amountSompi), 0n);
    const myAddress = await this.address();

    const warnings: string[] = [];
    if (totalInputValue <= estimatedFee) {
      warnings.push("Merge fee exceeds the value of the selected UTXOs.");
    }

    const individualFee = await this.estimateFee(1, 2);
    const estimatedSavings = (individualFee * BigInt(inputs.length)) - estimatedFee;

    return {
      strategy: "merge",
      inputs,
      outputs: [{ address: myAddress, amount: totalInputValue > estimatedFee ? totalInputValue - estimatedFee : 0n }],
      estimatedFee,
      estimatedSavings: estimatedSavings > 0n ? estimatedSavings : 0n,
      warnings
    };
  }

  /**
   * Plans sweeping the entire wallet to a single destination address.
   */
  async sweepPlan(opts: { 
    destinationAddress: string; 
    includeFrozen?: boolean | undefined;
  }): Promise<SweepPlan> {
    const utxos = await this.list({ includeFrozen: opts.includeFrozen });
    
    if (utxos.length === 0) {
      throw new Error("Cannot sweep an empty wallet.");
    }

    const estimatedFee = await this.estimateFee(utxos.length, 1);
    const totalInputValue = utxos.reduce((sum, u) => sum + BigInt(u.amountSompi), 0n);
    const warnings: string[] = [];

    if (totalInputValue <= estimatedFee) {
      warnings.push("Sweep fee exceeds the entire wallet balance.");
    }

    return {
      strategy: "sweep",
      inputs: utxos,
      outputs: [{ address: opts.destinationAddress, amount: totalInputValue > estimatedFee ? totalInputValue - estimatedFee : 0n }],
      estimatedFee,
      estimatedSavings: 0n,
      warnings
    };
  }

  // --- Coin Control Persistence ---

  async controlState(): Promise<UtxoControlState> {
    return this.store.getState();
  }

  async freeze(utxoId: string, reason?: string): Promise<void> {
    this.store.freeze(utxoId, reason);
  }

  async unfreeze(utxoId: string): Promise<void> {
    this.store.unfreeze(utxoId);
  }

  public labels = {
    set: async (utxoId: string, label: string): Promise<void> => {
      this.store.setLabel(utxoId, label);
    },
    get: async (utxoId: string): Promise<string | undefined> => {
      return this.store.getLabel(utxoId);
    }
  };

  public notes = {
    set: async (utxoId: string, note: string): Promise<void> => {
      this.store.setNote(utxoId, note);
    },
    get: async (utxoId: string): Promise<string | undefined> => {
      return this.store.getNote(utxoId);
    }
  };
}
