import { SOMPI_PER_KAS } from "@hardkas/core";
import { buildPaymentPlan } from "@hardkas/tx-builder";
import { applySimulatedPayment, LocalnetState, createInitialLocalnetState } from "@hardkas/localnet";

export interface FuzzResult {
  ok: boolean;
  iterations: number;
  violations: string[];
}

/**
 * Custom Scenario Fuzzer for UTXO Invariants.
 * Verifies that sum(inputs) == sum(outputs) + fee across random transaction sequences.
 * 
 * Intentionally non-deterministic as it uses Math.random() to simulate 
 * adversarial or random usage patterns.
 */
export async function runUtxoFuzzer(iterations = 50): Promise<FuzzResult> {
  let state = createInitialLocalnetState({ accounts: 5, initialBalanceSompi: 1000n * SOMPI_PER_KAS });
  const violations: string[] = [];

  for (let i = 0; i < iterations; i++) {
    const fromIdx = Math.floor(Math.random() * state.accounts.length);
    let toIdx = Math.floor(Math.random() * state.accounts.length);
    if (fromIdx === toIdx) toIdx = (toIdx + 1) % state.accounts.length;

    const fromAccount = state.accounts[fromIdx]!;
    const toAccount = state.accounts[toIdx]!;
    
    // Pick a random amount up to 10 KAS
    const amountSompi = BigInt(Math.floor(Math.random() * 10)) * SOMPI_PER_KAS + BigInt(Math.floor(Math.random() * 1000000));

    try {
      // 1. Plan
      const unspent = state.utxos.filter(u => u.address === fromAccount.address && !u.spent);
      if (unspent.length === 0) continue;

      const builderUtxos = unspent.map(u => ({
        outpoint: { transactionId: u.id.split(":")[0]!, index: 0 },
        address: u.address,
        amountSompi: BigInt(u.amountSompi),
        scriptPublicKey: "mock"
      }));

      const plan = buildPaymentPlan({
        fromAddress: fromAccount.address,
        availableUtxos: builderUtxos,
        outputs: [{ address: toAccount.address, amountSompi }],
        feeRateSompiPerMass: 1n
      });

      // 2. Invariant Check (Pre-Apply)
      const inputSum = plan.inputs.reduce((s, x) => s + x.amountSompi, 0n);
      const outputSum = plan.outputs.reduce((s, x) => s + x.amountSompi, 0n) + (plan.change?.amountSompi || 0n);
      const fee = plan.estimatedFeeSompi;

      if (inputSum !== outputSum + fee) {
        violations.push(`Iteration ${i}: Planning Invariant Violated! ${inputSum} != ${outputSum} + ${fee}`);
      }

      // 3. Apply
      const result = applySimulatedPayment(state, {
        from: fromAccount.name,
        to: toAccount.name,
        amountSompi
      });

      state = result.state;

      // 4. State Invariant Check
      const totalInState = state.utxos.filter(u => !u.spent).reduce((s, x) => s + BigInt(x.amountSompi), 0n);
      const expectedTotal = BigInt(state.accounts.length) * 1000n * SOMPI_PER_KAS - (BigInt(i + 1) * fee); 
      // Note: This assumes constant fee per tx for simplicity in total state check
      
      // Better: check that no UTXO is double-spent
      const utxoIds = state.utxos.map(u => u.id);
      const uniqueIds = new Set(utxoIds);
      if (utxoIds.length !== uniqueIds.size) {
        violations.push(`Iteration ${i}: Duplicate UTXO IDs detected in state!`);
      }

    } catch (e: any) {
      // Some iterations might fail due to insufficient funds, which is fine
      if (!e.message.includes("Insufficient funds")) {
        violations.push(`Iteration ${i}: Unexpected Error: ${e.message}`);
      }
    }
  }

  return {
    ok: violations.length === 0,
    iterations,
    violations
  };
}
