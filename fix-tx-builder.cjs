const fs = require('fs');

let coinFile = fs.readFileSync('packages/tx-builder/src/coin-selector.ts', 'utf8');
coinFile = coinFile.replace(/[\s\S]*let value: bigint;/g, `import { Utxo, TxOutput } from "./index.js";
import { estimateTransactionMass } from "./mass.js";
import { estimateFee } from "./fee-estimator.js";

export type CoinSelectionStrategy = "largest-first" | "smallest-first";

export interface CoinSelectionRequest {
  readonly utxos: readonly Utxo[];
  readonly targetSompi: bigint;
  readonly feeRateSompiPerMass: bigint;
  readonly strategy: CoinSelectionStrategy;
  readonly changeAddress?: string;
  readonly dustThresholdSompi?: bigint;
}

export interface CoinSelectionResult {
  readonly selectedUtxos: Utxo[];
  readonly totalInputSompi: bigint;
  readonly targetSompi: bigint;
  readonly estimatedFeeSompi: bigint;
  readonly changeSompi: bigint;
  readonly outputs: TxOutput[];
  readonly dustRejected: Utxo[];
  readonly warnings: string[];
  readonly feeModel: "estimated-v1";
}

function parseTargetSompi(target: bigint): bigint {
  let value: bigint;`);
fs.writeFileSync('packages/tx-builder/src/coin-selector.ts', coinFile);

let feeFile = fs.readFileSync('packages/tx-builder/src/fee-estimator.ts', 'utf8');
feeFile = feeFile.replace(/[\s\S]*let value: bigint;/g, `import { estimateTransactionMass } from "./mass.js";

export type FeePolicy = "conservative" | "minimal";
export type NetworkType = "simulated" | "local-docker-simnet" | string;

export interface FeeEstimationRequest {
  readonly inputs: number | readonly any[];
  readonly outputs: number | readonly any[];
  readonly feeRateSompiPerMass: bigint;
  readonly network?: NetworkType;
  readonly policy?: FeePolicy;
  readonly hasChange?: boolean;
  readonly payloadBytes?: number;
}

export interface FeeEstimationResult {
  readonly estimatedMass: bigint;
  readonly feeRateSompiPerMass: bigint;
  readonly estimatedFeeSompi: bigint;
  readonly model: "mass-estimated-v1";
  readonly policy: FeePolicy;
  readonly estimated: true;
  readonly claims: {
    readonly exactNetworkFee: false;
  };
  readonly warnings: string[];
}

function parseFeeRate(rate: bigint): bigint {
  let value: bigint;`);
fs.writeFileSync('packages/tx-builder/src/fee-estimator.ts', feeFile);
