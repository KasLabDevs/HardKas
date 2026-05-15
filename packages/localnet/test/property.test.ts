import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createInitialLocalnetState } from "../src/state.js";
import { applySimulatedPayment } from "../src/transactions.js";
import { calculateStateHash } from "../src/snapshot.js";
import { SOMPI_PER_KAS } from "@hardkas/core";

describe("Localnet Property Tests (fast-check)", () => {

  function indexToName(index: number): string {
    const names = ["alice", "bob", "carol", "dave", "erin"];
    return names[index] || `account${index}`;
  }

  it("should conserve total supply: sum(utxos) + fees == initial_sum", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // number of txs
        (txCount) => {
          const initialBalance = 1000n * SOMPI_PER_KAS;
          const accountCount = 3;
          let state = createInitialLocalnetState({ accounts: accountCount, initialBalanceSompi: initialBalance });
          const initialSum = initialBalance * BigInt(accountCount);
          
          let totalFees = 0n;

          for (let i = 0; i < txCount; i++) {
            const from = indexToName(i % accountCount);
            const to = indexToName((i + 1) % accountCount);
            const amount = 10n * SOMPI_PER_KAS;

            const result = applySimulatedPayment(state, {
              from,
              to,
              amountSompi: amount,
              feeRateSompiPerMass: 1n
            });

            if (result.ok) {
              state = result.state;
              const plan = result.planArtifact!;
              const inputSum = plan.inputs.reduce((acc: bigint, input: any) => acc + BigInt(input.amountSompi), 0n);
              const outputSum = plan.outputs.reduce((acc: bigint, output: any) => acc + BigInt(output.amountSompi), 0n) + 
                               (plan.change ? BigInt(plan.change.amountSompi) : 0n);
              const fee = inputSum - outputSum;
              totalFees += fee;
            }
          }

          const currentSum = state.utxos
            .filter(u => !u.spent)
            .reduce((acc, u) => acc + BigInt(u.amountSompi), 0n);

          const actual = currentSum + totalFees;
          if (actual !== initialSum) {
            console.error(`Mismatch! actual=${actual} (${typeof actual}), initialSum=${initialSum} (${typeof initialSum})`);
            console.error(`currentSum=${currentSum}, totalFees=${totalFees}`);
          }
          expect(actual).toEqual(initialSum);
        }
      )
    );
  });

  it("should be deterministic: same sequence produces same finalStateHash", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (txCount) => {
          const runSequence = () => {
            let state = createInitialLocalnetState({ accounts: 3 });
            for (let i = 0; i < txCount; i++) {
              const result = applySimulatedPayment(state, {
                from: "alice",
                to: "bob",
                amountSompi: 10n * SOMPI_PER_KAS
              });
              if (result.ok) state = result.state;
            }
            return calculateStateHash(state);
          };

          const hash1 = runSequence();
          const hash2 = runSequence();
          expect(hash1).toBe(hash2);
        }
      )
    );
  });

  it("should not mutate state on transaction failure", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1000000n * SOMPI_PER_KAS }), // Insane amount
        (insaneAmount) => {
          const state = createInitialLocalnetState({ accounts: 2 });
          const initialHash = calculateStateHash(state);

          const result = applySimulatedPayment(state, {
            from: "alice",
            to: "bob",
            amountSompi: insaneAmount
          });

          expect(result.ok).toBe(false);
          expect(calculateStateHash(result.state)).toBe(initialHash);
        }
      )
    );
  });

  it("should prevent double spending (invariant check)", () => {
    const state = createInitialLocalnetState({ accounts: 2, initialBalanceSompi: 100n * SOMPI_PER_KAS });
    
    // First spend: alice sends 100 KAS (her entire balance)
    // Note: she won't be able to pay the fee if she sends exactly 100 KAS, 
    // but applySimulatedPayment handles fee estimation.
    // Let's send 90 KAS to be safe and leave some for fees, then try to send another 90.
    const res1 = applySimulatedPayment(state, {
      from: "alice",
      to: "bob",
      amountSompi: 90n * SOMPI_PER_KAS
    });
    expect(res1.ok).toBe(true);

    // Try to spend again from the same account. 
    // Alice has ~9.9 KAS left. Trying to spend 90 KAS again should fail.
    const res2 = applySimulatedPayment(res1.state, {
      from: "alice",
      to: "bob",
      amountSompi: 90n * SOMPI_PER_KAS
    });
    
    expect(res2.ok).toBe(false);
    expect(res2.errors[0]).toContain("Insufficient funds");
  });
});
