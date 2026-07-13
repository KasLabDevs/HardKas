import { describe, it, expect, vi } from "vitest";
import { HardkasCapabilitiesApi } from "../src/capabilities.js";

describe("P82: TX V1 Capabilities Probe", () => {
  it("should probe kaspa-wasm for V1 support", async () => {
    const api = new HardkasCapabilitiesApi();
    const env = await api.probeEnvironment();

    // Since our local kaspa-wasm is 0.13.0, it does not support V1.
    // The probe should gracefully catch the error and set V1 flags to false.
    expect(env.kaspa.wasm).toBe(true); // Base wasm is available
    expect(env.kaspa.v1).toBe(false);
    expect(env.kaspa.computeBudget).toBe(false);
    expect(env.kaspa.covenantOutputs).toBe(false);
    expect(env.kaspa.storageMass).toBe(false);
    expect(env.kaspa.signingV1).toBe(false);
  });

  it("should cascade env flags to capabilities", async () => {
    const api = new HardkasCapabilitiesApi();
    const caps = await api.get();

    // The capability should be false if env is false
    expect(caps.capabilities.transactionV1).toBe(false);
  });
});
