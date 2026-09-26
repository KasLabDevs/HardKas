import { createHash } from "node:crypto";
import { buildPaymentPlan } from "@hardkas/tx-builder";
import type { LocalnetState, LocalnetUtxo, SimulationResult } from "./types.js";
import { resolveAccountAddressFromState } from "./state.js";
import { getSpendableUtxos } from "./balance.js";
import {
  createTxPlanArtifact,
  createSimulatedTxReceipt,
  recomputeDeclaredContentHash,
  syntheticTxIdFor,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";
import type { DagContext, TxReceipt, TxPlan } from "@hardkas/artifacts";
import { calculateStateHash } from "./snapshot.js";
import type { RuntimeContext, TxId, KaspaAddress, NetworkId } from "@hardkas/core";

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
 * Deterministic id of a FAILED simulated execution (a diagnostic, never a
 * transaction). Wave 1.4 · N4: the single synthetic shape `synthetic-<64 hex>`,
 * where the 64 hex digest the failure context — never the plan's identity, so a
 * failed diagnostic can never collide with the executed transaction's id.
 * No Date.now() or Math.random() — same failure = same id.
 */
function generateDeterministicFailedTxId(
  preStateHash: string,
  errorMessage: string,
  daaScore: string
): string {
  const normalized = errorMessage.replace(/[^a-zA-Z0-9_:. -]/g, "");
  const input = `failed:${preStateHash}:${normalized}:${daaScore}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `synthetic-${hash}`;
}

/**
 * Wave 1.4 · D-Q2.a / N4: the synthetic txId IS the executed plan's identity,
 * `synthetic-<planArtifactId>` with the 64 hex. Same plan = same txId, which
 * is the replay invariant; a plan's inputs are spent by its execution, so the
 * id (and the synthetic outpoints derived from it) cannot be produced twice.
 */
function generateDeterministicTxId(planArtifact: TxPlan): string {
  const planHash = planArtifact.contentHash || recomputeDeclaredContentHash(planArtifact);
  return syntheticTxIdFor(planHash);
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
  input: SimulatedPaymentInput,
  ctx: RuntimeContext
): SimulationResult {
  const errors: string[] = [];
  const preStateHash = calculateStateHash(state);

  try {
    const fromAddress = resolveAccountAddressFromState(state, input.from);
    if (!fromAddress) {
      throw new Error(`Sender account/address not found: ${input.from}`);
    }
    const toAddress = resolveAccountAddressFromState(state, input.to);
    if (!toAddress) {
      throw new Error(`Recipient account/address not found: ${input.to}`);
    }
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
      throw new Error("insufficient simulated funds");
    }

    const availableUtxos = unspent.map((u) => {
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
      feeRateSompiPerMass,
      coinbaseMaturity: 100n
    });

    // 4. Double-Spend & Consistency Check
    const spentUtxoIds = plan.inputs.map(
      (i) => `${i.outpoint.transactionId}:${i.outpoint.index}`
    );
    const uniqueSpentIds = new Set(spentUtxoIds);
    if (uniqueSpentIds.size !== spentUtxoIds.length) {
      throw new Error("Duplicate inputs detected in transaction plan");
    }

    for (const id of spentUtxoIds) {
      const utxo = state.utxos.find((u) => u.id === id);
      if (!utxo) throw new Error("missing simulated UTXO");
      if (utxo.spent) throw new Error("invalid simulated input");
    }

    // 5. Create Artifacts
    const planArtifact = createTxPlanArtifact({
      networkId: (state.networkId || "simnet") as NetworkId,
      mode: "simulator",
      from: { input: input.from, address: fromAddress },
      to: { input: input.to, address: toAddress },
      amountSompi,
      plan,
      ctx
    });

    // 6. State Transition
    const nextDaaScore = (BigInt(state.daaScore) + 1n).toString();
    const txId = generateDeterministicTxId(planArtifact);

    // Mark inputs as spent
    const nextUtxos: LocalnetUtxo[] = state.utxos.map((u) => {
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

    const receipt = createSimulatedTxReceipt(planArtifact, txId, ctx, {
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
  } catch (error) {
    // 7. Atomic Rollback (return original state)
    // Deterministic failed tx ID — no Date.now() or Math.random()
    const errorMessage = error instanceof Error ? error.message : String(error);
    const daaScore = state.daaScore || "0";
    const txId = generateDeterministicFailedTxId(preStateHash, errorMessage, daaScore);
    const receipt: TxReceipt = {
      schema: "hardkas.txReceipt",
      schemaVersion: "hardkas.txReceipt.v1",
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      status: "failed",
      mode: "simulator",
      networkId: state.networkId,
      txId: txId as TxId,
      createdAt: "1970-01-01T00:00:00.000Z",
      errors: [errorMessage],
      preStateHash,
      postStateHash: preStateHash,
      dagContext: buildDagContextFromState(state),
      from: { address: "" as KaspaAddress },
      to: { address: "" as KaspaAddress },
      amountSompi: "0",
      feeSompi: "0",
      execution: { mode: "simulator", domain: "kaspa-l1", network: state.networkId || "simnet" }
    };

    return {
      ok: false,
      state: state, // No mutation
      receipt,
      errors: [errorMessage]
    };
  }
}
/**
 * Executes a pre-built transaction plan against the simulated state.
 *
 * DEF-1c (Wave 1 continuation): `receiptExtra` threads schema-owned lifecycle
 * metadata (`submittedAt`, `confirmedAt`, `rpcUrl`, `tracePath`, `sourceSignedId`)
 * and a `parentArtifact` predecessor override into `createSimulatedTxReceipt`,
 * so the SDK lifecycle owner can produce ONE canonical receipt identity
 * containing all lifecycle+execution evidence in a single hashable construction.
 * Threading is pure pass-through — this function does not manufacture, infer,
 * or transform any of these values.
 */
export function applySimulatedPlan(
  state: LocalnetState,
  planArtifact: TxPlan,
  ctx: RuntimeContext,
  options?: {
    txId?: string;
    /**
     * IC-1′.7: the hashVersion whose domain-digest algorithm the produced state
     * digests must use. Only a LEGACY replay (of a receipt declaring ≤ 4) passes
     * a legacy value; producers use the current version.
     */
    digestHashVersion?: number;
    receiptExtra?: {
      submittedAt?: string;
      confirmedAt?: string;
      rpcUrl?: string;
      tracePath?: string;
      sourceSignedId?: string;
      parentArtifact?: { contentHash: string; lineage?: any };
    };
  }
): SimulationResult {
  const errors: string[] = [];
  const digest = options?.digestHashVersion !== undefined ? { hashVersion: options.digestHashVersion } : undefined;
  const preStateHash = calculateStateHash(state, digest);

  try {
    const spentUtxoIds = planArtifact.inputs.map(
      (i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`
    );

    // Validate inputs
    for (const id of spentUtxoIds) {
      const utxo = state.utxos.find((u) => u.id === id);
      if (!utxo) throw new Error("missing simulated UTXO");
      if (utxo.spent) throw new Error("invalid simulated input");
    }

    const nextDaaScore = (BigInt(state.daaScore) + 1n).toString();
    const txId = options?.txId || generateDeterministicTxId(planArtifact);

    const nextUtxos: LocalnetUtxo[] = state.utxos.map((u) => {
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

    const nextState: LocalnetState = {
      ...state,
      daaScore: nextDaaScore,
      utxos: nextUtxos
    };
    const postStateHash = calculateStateHash(nextState, digest);

    const receipt = createSimulatedTxReceipt(planArtifact, txId, ctx, {
      spentUtxoIds,
      createdUtxoIds,
      daaScore: nextDaaScore,
      preStateHash,
      postStateHash,
      dagContext: buildDagContextFromState(state),
      ...(options?.receiptExtra?.submittedAt ? { submittedAt: options.receiptExtra.submittedAt } : {}),
      ...(options?.receiptExtra?.confirmedAt ? { confirmedAt: options.receiptExtra.confirmedAt } : {}),
      ...(options?.receiptExtra?.rpcUrl ? { rpcUrl: options.receiptExtra.rpcUrl } : {}),
      ...(options?.receiptExtra?.tracePath ? { tracePath: options.receiptExtra.tracePath } : {}),
      ...(options?.receiptExtra?.sourceSignedId ? { sourceSignedId: options.receiptExtra.sourceSignedId } : {}),
      ...(options?.receiptExtra?.parentArtifact ? { parentArtifact: options.receiptExtra.parentArtifact } : {})
    });

    return { ok: true, state: nextState, receipt, planArtifact, errors };
  } catch (error) {
    // Deterministic failed replay ID — no Date.now()
    const errorMessage = error instanceof Error ? error.message : String(error);
    const daaScore = state.daaScore || "0";
    const txId = generateDeterministicFailedTxId(preStateHash, errorMessage, daaScore);
    const receipt: TxReceipt = {
      schema: "hardkas.txReceipt",
      schemaVersion: "hardkas.txReceipt.v1",
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      status: "failed",
      mode: "simulator",
      networkId: state.networkId,
      txId: txId as TxId,
      createdAt: "1970-01-01T00:00:00.000Z",
      errors: [errorMessage],
      preStateHash,
      postStateHash: preStateHash,
      dagContext: buildDagContextFromState(state),
      from: { address: "" as KaspaAddress },
      to: { address: "" as KaspaAddress },
      amountSompi: "0",
      feeSompi: "0",
      execution: { mode: "simulator", domain: "kaspa-l1", network: state.networkId || "simnet" }
    };

    return { ok: false, state: state, receipt, errors: [errorMessage] };
  }
}
