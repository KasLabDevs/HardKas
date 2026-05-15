import { createHash } from "node:crypto";
import { buildPaymentPlan } from "@hardkas/tx-builder";
import type { LocalnetState, LocalnetUtxo, SimulationResult } from "./types.js";
import { resolveAccountAddressFromState } from "./state.js";
import { getSpendableUtxos } from "./balance.js";
import { 
  createTxPlanArtifact, 
  createSimulatedTxReceipt,
  calculateContentHash,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";
import type { DagContext, TxReceipt } from "@hardkas/artifacts";
import { calculateStateHash } from "./snapshot.js";

/**
 * Builds a typed DagContext from localnet DAG state.
 */
function buildDagContextFromState(state: LocalnetState): DagContext {
  if (state.dag) {
    return {
      mode: "dag-light",
      sink: state.dag.sink,
      acceptedTxIds: state.dag.acceptedTxIds,
      displacedTxIds: state.dag.displacedTxIds,
      conflictSet: state.dag.conflictSet
    };
  }
  return { mode: "linear", sink: "linear-pseudo-sink" };
}

/**
 * Generates a deterministic failed transaction ID from error context.
 * No Date.now() or Math.random() — same failure = same ID.
 */
function generateDeterministicFailedTxId(preStateHash: string, errorMessage: string, daaScore: string): string {
  const normalized = errorMessage.replace(/[^a-zA-Z0-9_:. -]/g, "");
  const input = `failed:${preStateHash}:${normalized}:${daaScore}`;
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `simtx_failed_${hash}`;
}

/**
 * Generates a deterministic simulated transaction ID from plan and state.
 * Ensures replay invariants: same plan + same state = same txId.
 */
function generateDeterministicTxId(planArtifact: any, preStateHash: string, daaScore: string): string {
  const planHash = planArtifact.contentHash || calculateContentHash(planArtifact);
  const input = `${planHash}:${preStateHash}:${daaScore}`;
  const hash = createHash("sha256").update(input).digest("hex").slice(0, 32);
  return `simtx_${hash}`;
}

export interface SimulatedPaymentInput {
  readonly from: string;
  readonly to: string;
  readonly amountSompi: bigint;
  readonly feeRateSompiPerMass?: bigint;
}

/**
 * Standard Kaspa dust limit (approximate).
 */
export const DUST_LIMIT_SOMPI = 600n;

/**
 * Applies a simulated payment to the localnet state with atomic safety and validation.
 */
export function applySimulatedPayment(
  state: LocalnetState,
  input: SimulatedPaymentInput
): SimulationResult {
  const errors: string[] = [];
  const preStateHash = calculateStateHash(state);

  try {
    const fromAddress = resolveAccountAddressFromState(state, input.from);
    const toAddress = resolveAccountAddressFromState(state, input.to);
    const amountSompi = input.amountSompi;
    const feeRateSompiPerMass = input.feeRateSompiPerMass ?? 1n;

    // 1. Basic Validation
    if (amountSompi <= 0n) {
      throw new Error("Amount must be greater than 0");
    }
    
    if (amountSompi < DUST_LIMIT_SOMPI) {
       errors.push(`Amount ${amountSompi} is below dust limit (${DUST_LIMIT_SOMPI})`);
    }

    // 2. Resolve UTXOs
    const unspent = getSpendableUtxos(state, fromAddress);
    if (unspent.length === 0) {
      throw new Error(`Insufficient funds: no unspent UTXOs for ${fromAddress}`);
    }

    const availableUtxos = unspent.map(u => {
      const parts = u.id.split(":");
      const index = Number(parts[parts.length - 1]);
      const transactionId = parts.slice(0, -1).join(":");
      return {
        outpoint: { transactionId, index },
        address: u.address,
        amountSompi: BigInt(u.amountSompi),
        scriptPublicKey: "mock-script"
      };
    });

    // 3. Build Plan (includes fee/mass estimation)
    const plan = buildPaymentPlan({
      fromAddress,
      outputs: [{ address: toAddress, amountSompi }],
      availableUtxos,
      feeRateSompiPerMass
    });

    // 4. Double-Spend & Consistency Check
    const spentUtxoIds = plan.inputs.map(i => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    const uniqueSpentIds = new Set(spentUtxoIds);
    if (uniqueSpentIds.size !== spentUtxoIds.length) {
      throw new Error("Duplicate inputs detected in transaction plan");
    }

    for (const id of spentUtxoIds) {
      const utxo = state.utxos.find(u => u.id === id);
      if (!utxo) throw new Error(`UTXO not found: ${id}`);
      if (utxo.spent) throw new Error(`UTXO already spent: ${id}`);
    }

    // 5. Create Artifacts
    const planArtifact = createTxPlanArtifact({
      networkId: state.networkId || "simnet",
      mode: "simulated",
      from: { input: input.from, address: fromAddress },
      to: { input: input.to, address: toAddress },
      amountSompi,
      plan
    });

    // 6. State Transition
    const nextDaaScore = (BigInt(state.daaScore) + 1n).toString();
    const txId = generateDeterministicTxId(planArtifact, preStateHash, nextDaaScore);
    
    // Mark inputs as spent
    const nextUtxos: LocalnetUtxo[] = state.utxos.map(u => {
      if (spentUtxoIds.includes(u.id)) {
        return {
          ...u,
          spent: true,
          spentAtDaaScore: nextDaaScore
        };
      }
      return u;
    });

    const createdUtxoIds: string[] = [];

    // Create recipient UTXO
    const recipientUtxo: LocalnetUtxo = {
      id: `${txId}:0`,
      address: toAddress,
      amountSompi: amountSompi.toString(),
      spent: false,
      createdAtDaaScore: nextDaaScore
    };
    nextUtxos.push(recipientUtxo);
    createdUtxoIds.push(recipientUtxo.id);

    // Create change UTXO
    if (plan.change) {
      const changeUtxo: LocalnetUtxo = {
        id: `${txId}:1`,
        address: fromAddress,
        amountSompi: plan.change.amountSompi.toString(),
        spent: false,
        createdAtDaaScore: nextDaaScore
      };
      nextUtxos.push(changeUtxo);
      createdUtxoIds.push(changeUtxo.id);
    }

    const nextState: LocalnetState = {
      ...state,
      daaScore: nextDaaScore,
      utxos: nextUtxos
    };

    const postStateHash = calculateStateHash(nextState);

    const receipt = createSimulatedTxReceipt(planArtifact, txId, {
      spentUtxoIds,
      createdUtxoIds,
      daaScore: nextDaaScore,
      preStateHash,
      postStateHash,
      dagContext: buildDagContextFromState(state)
    });

    return {
      ok: true,
      state: nextState,
      receipt,
      planArtifact,
      errors
    };

  } catch (error: any) {
    // 7. Atomic Rollback (return original state)
    // Deterministic failed tx ID — no Date.now() or Math.random()
    const daaScore = state.daaScore || "0";
    const txId = generateDeterministicFailedTxId(preStateHash, error.message, daaScore);
    const receipt: any = {
      schema: "hardkas.txReceipt" as const,
      status: "failed" as const,
      mode: "simulated" as const,
      txId,
      createdAt: "1970-01-01T00:00:00.000Z",
      errors: [error.message],
      preStateHash,
      postStateHash: preStateHash,
      dagContext: buildDagContextFromState(state)
    };

    return {
      ok: false,
      state: state, // No mutation
      receipt,
      errors: [error.message]
    };
  }
}
/**
 * Executes a pre-built transaction plan against the simulated state.
 */
export function applySimulatedPlan(
  state: LocalnetState,
  planArtifact: any, // TxPlanArtifact
  options?: { txId?: string }
): SimulationResult {
  const errors: string[] = [];
  const preStateHash = calculateStateHash(state);

  try {
    const spentUtxoIds = planArtifact.inputs.map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    
    // Validate inputs
    for (const id of spentUtxoIds) {
      const utxo = state.utxos.find(u => u.id === id);
      if (!utxo) throw new Error(`UTXO not found: ${id}`);
      if (utxo.spent) throw new Error(`UTXO already spent: ${id}`);
    }

    const nextDaaScore = (BigInt(state.daaScore) + 1n).toString();
    const txId = options?.txId || generateDeterministicTxId(planArtifact, preStateHash, nextDaaScore);

    const nextUtxos: LocalnetUtxo[] = state.utxos.map(u => {
      if (spentUtxoIds.includes(u.id)) {
        return { ...u, spent: true, spentAtDaaScore: nextDaaScore };
      }
      return u;
    });

    const createdUtxoIds: string[] = [];
    
    // Create outputs
    planArtifact.outputs.forEach((o: any, idx: number) => {
      const utxo: LocalnetUtxo = {
        id: `${txId}:${idx}`,
        address: o.address,
        amountSompi: o.amountSompi.toString(),
        spent: false,
        createdAtDaaScore: nextDaaScore
      };
      nextUtxos.push(utxo);
      createdUtxoIds.push(utxo.id);
    });

    // Create change
    if (planArtifact.change) {
      const changeUtxo: LocalnetUtxo = {
        id: `${txId}:${planArtifact.outputs.length}`,
        address: planArtifact.change.address,
        amountSompi: planArtifact.change.amountSompi.toString(),
        spent: false,
        createdAtDaaScore: nextDaaScore
      };
      nextUtxos.push(changeUtxo);
      createdUtxoIds.push(changeUtxo.id);
    }

    const nextState: LocalnetState = { ...state, daaScore: nextDaaScore, utxos: nextUtxos };
    const postStateHash = calculateStateHash(nextState);

    const receipt = createSimulatedTxReceipt(planArtifact, txId, {
      spentUtxoIds,
      createdUtxoIds,
      daaScore: nextDaaScore,
      preStateHash,
      postStateHash,
      dagContext: buildDagContextFromState(state)
    });

    return { ok: true, state: nextState, receipt, planArtifact, errors };

  } catch (error: any) {
    // Deterministic failed replay ID — no Date.now()
    const daaScore = state.daaScore || "0";
    const txId = generateDeterministicFailedTxId(preStateHash, error.message, daaScore);
    const receipt: any = {
      schema: "hardkas.txReceipt" as const,
      status: "failed" as const,
      mode: "simulated" as const,
      txId,
      createdAt: "1970-01-01T00:00:00.000Z",
      errors: [error.message],
      preStateHash,
      postStateHash: preStateHash,
      dagContext: buildDagContextFromState(state)
    };

    return { ok: false, state: state, receipt, errors: [error.message] };
  }
}
