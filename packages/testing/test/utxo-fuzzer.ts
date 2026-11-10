import { systemRuntimeContext, type NetworkId } from "@hardkas/core";
import { SOMPI_PER_KAS } from "@hardkas/core";
import { createTxPlanArtifact } from "@hardkas/artifacts";
import { planPaymentWithGenerator } from "@hardkas/tx-builder";
import {
  applySimulatedPlan,
  LocalnetState,
  createInitialLocalnetState
} from "@hardkas/localnet";

export interface FuzzResult {
  ok: boolean;
  iterations: number;
  /** Payments planned and executed (the rest were legitimately refused or skipped). */
  applied: number;
  violations: string[];
}

// Refusals a random payment can legitimately meet: not enough funds, an output or a
// change too small for a standard transaction (storage mass, KIP-9), or a spend that
// needs more than one transaction.
const LEGITIMATE_REFUSALS = new Set([
  "INSUFFICIENT_FUNDS_UPSTREAM",
  "CHANGE_BELOW_STANDARD_OUTPUT",
  "OUTPUT_BELOW_STANDARD_AMOUNT",
  "MULTI_TRANSACTION_PLAN_REQUIRED"
]);

const unspentTotal = (state: LocalnetState) =>
  state.utxos.filter((u) => !u.spent).reduce((s, x) => s + BigInt(x.amountSompi), 0n);

/**
 * Custom Scenario Fuzzer for UTXO Invariants.
 * Verifies that sum(inputs) == sum(outputs) + fee across random transaction sequences:
 * each payment is planned by the kaspa-wasm Generator (over the simulator's
 * identities) and that same plan is executed against the simulated state.
 *
 * Intentionally non-deterministic as it uses Math.random() to simulate
 * adversarial or random usage patterns.
 */
export async function runUtxoFuzzer(iterations = 50): Promise<FuzzResult> {
  let state = createInitialLocalnetState({
    accounts: 5,
    initialBalanceSompi: 1000n * SOMPI_PER_KAS
  });
  const violations: string[] = [];
  let applied = 0;

  for (let i = 0; i < iterations; i++) {
    const fromIdx = Math.floor(Math.random() * state.accounts.length);
    let toIdx = Math.floor(Math.random() * state.accounts.length);
    if (fromIdx === toIdx) toIdx = (toIdx + 1) % state.accounts.length;

    const fromAccount = state.accounts[fromIdx]!;
    const toAccount = state.accounts[toIdx]!;

    // Pick a random amount up to 10 KAS
    const amountSompi =
      BigInt(Math.floor(Math.random() * 10)) * SOMPI_PER_KAS +
      BigInt(Math.floor(Math.random() * 1000000));
    if (amountSompi === 0n) continue;

    try {
      // 1. Plan
      const unspent = state.utxos.filter(
        (u) => u.address === fromAccount.address && !u.spent
      );
      if (unspent.length === 0) continue;

      const utxos = unspent.map((u) => {
        const parts = u.id.split(":");
        return {
          outpoint: { transactionId: parts.slice(0, -1).join(":"), index: Number(parts[parts.length - 1]) },
          address: u.address,
          amountSompi: BigInt(u.amountSompi),
          scriptPublicKey: "mock-script"
        };
      });

      const plan = await planPaymentWithGenerator({
        utxos,
        outputs: [{ address: toAccount.address, amountSompi }],
        changeAddress: fromAccount.address,
        syntheticIdentities: true
      });

      // 2. Invariant Check (Pre-Apply): inputs == outputs + change + fee, exactly.
      const inputSum = plan.inputs.reduce((s, x) => s + x.amountSompi, 0n);
      const outputSum =
        plan.outputs.reduce((s, x) => s + x.amountSompi, 0n) +
        (plan.change?.amountSompi || 0n);
      const fee = plan.estimatedFeeSompi;
      if (inputSum !== outputSum + fee) {
        violations.push(
          `Iteration ${i}: Planning Invariant Violated! inputs ${inputSum} != outputs ${outputSum} + fee ${fee}`
        );
      }

      // 3. Apply that same plan.
      const planArtifact = createTxPlanArtifact({
        networkId: (state.networkId || "simnet") as NetworkId,
        mode: "simulator",
        from: { input: fromAccount.name, address: fromAccount.address },
        to: { input: toAccount.name, address: toAccount.address },
        amountSompi,
        plan,
        ctx: systemRuntimeContext
      });
      const before = unspentTotal(state);
      const result = applySimulatedPlan(state, planArtifact, systemRuntimeContext);
      if (!result.ok) {
        violations.push(`Iteration ${i}: the simulator refused the plan: ${result.errors.join("; ")}`);
        continue;
      }
      state = result.state;
      applied++;

      // 4. State Invariant Check: the state's value fell by exactly the fee, and no UTXO
      //    id appears twice.
      const after = unspentTotal(state);
      if (before - after !== fee) {
        violations.push(`Iteration ${i}: State Invariant Violated! value fell by ${before - after}, the fee is ${fee}`);
      }
      const utxoIds = state.utxos.map((u) => u.id);
      if (utxoIds.length !== new Set(utxoIds).size) {
        violations.push(`Iteration ${i}: Duplicate UTXO IDs detected in state!`);
      }
    } catch (e: unknown) {
      const code = (e as { code?: string } | undefined)?.code;
      const message = e instanceof Error ? e.message : String(e);
      if (!(code && LEGITIMATE_REFUSALS.has(code)) && !message.includes("Insufficient funds")) {
        violations.push(`Iteration ${i}: Unexpected Error: ${message}`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    iterations,
    applied,
    violations
  };
}
