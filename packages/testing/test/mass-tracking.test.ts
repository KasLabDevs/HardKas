import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { 
  createTestHarness, 
  enableMassTracking, 
  disableMassTracking, 
  getMassRecords, 
  clearMassRecords 
} from "../src/index.js";

describe("Mass tracking", () => {
  beforeEach(() => {
    clearMassRecords();
  });

  afterEach(() => {
    disableMassTracking();
    clearMassRecords();
  });

  it("collects records when enabled", () => {
    enableMassTracking();
    const h = createTestHarness();
    const names = h.accountNames();
    
    h.send({ from: names[0]!, to: names[1]!, amountSompi: 1_000_000_000n });

    const records = getMassRecords();
    expect(records.length).toBe(1);
    expect(records[0]!.estimatedMass).toBeGreaterThan(0n);
    expect(records[0]!.txId).toBeDefined();
  });

  it("does not collect when disabled", () => {
    disableMassTracking();
    const h = createTestHarness();
    const names = h.accountNames();
    
    h.send({ from: names[0]!, to: names[1]!, amountSompi: 1_000_000_000n });
    
    expect(getMassRecords().length).toBe(0);
  });
});
