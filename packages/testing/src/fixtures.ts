// SAFETY_LEVEL: SIMULATION_ONLY
//
// Helper for creating reusable test fixtures.

import type { TestHarness, HarnessConfig } from "./harness.js";
import { createTestHarness } from "./harness.js";

export interface FixtureDefinition {
  name: string;
  accounts?: number;
  initialBalance?: bigint;
  /** Pre-run transactions to set up state. */
  setup?: Array<{ from: string; to: string; amountSompi: bigint }>;
}

/**
 * Create a fixture — a pre-configured harness with setup transactions already applied.
 */
export function createFixture(def: FixtureDefinition): TestHarness {
  const config: HarnessConfig = {
    accounts: def.accounts,
    initialBalance: def.initialBalance
  };

  const harness = createTestHarness(config);

  if (def.setup) {
    for (const tx of def.setup) {
      const result = harness.send(tx);
      if (!result.ok) {
        throw new Error(`Fixture "${def.name}" failed during setup: ${tx.from} -> ${tx.to} (${tx.amountSompi} sompi). Error: ${result.receipt?.errors?.join(", ") || "Unknown error"}`);
      }
    }
  }

  return harness;
}
