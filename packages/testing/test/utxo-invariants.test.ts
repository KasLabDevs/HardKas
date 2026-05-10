import { describe, it, expect } from "vitest";
import { runUtxoFuzzer } from "../src/utxo-fuzzer.js";

describe("Infrastructure Invariants: UTXO Stability", () => {
  it("should maintain sum(inputs) == sum(outputs) + fee over 100 random transactions", async () => {
    const result = await runUtxoFuzzer(100);
    
    if (!result.ok) {
      console.error("UTXO Fuzzing Violations:");
      result.violations.forEach(v => console.error(`  - ${v}`));
    }

    expect(result.ok).toBe(true);
    expect(result.iterations).toBe(100);
  });
});
