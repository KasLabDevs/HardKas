import { describe, it, expect } from "vitest";
import { loadKaspaWasm } from "@hardkas/accounts";
import { HardkasCapabilitiesApi } from "../src/capabilities.js";

describe("P82: TX V1 Capabilities Probe", () => {
  it("should probe kaspa-wasm for V1 support", async () => {
    const api = new HardkasCapabilitiesApi();
    const env = await api.probeEnvironment();

    // HardKAS loads only the pinned managed SDK (rusty-kaspa 2.0.x), which supports Toccata.
    const sdk = await loadKaspaWasm();
    expect(String(sdk.version())).toMatch(/^2\./);
    const expectV1 = true;

    expect(env.kaspa.wasm).toBe(true); // Base wasm is available
    expect(env.kaspa.v1).toBe(expectV1);
    expect(env.kaspa.computeBudget).toBe(expectV1);
    expect(env.kaspa.covenantOutputs).toBe(expectV1);
    expect(env.kaspa.storageMass).toBe(expectV1);
    expect(env.kaspa.signingV1).toBe(expectV1);
  });

  it("should cascade env flags to capabilities", async () => {
    const api = new HardkasCapabilitiesApi();
    const env = await api.probeEnvironment();
    const caps = await api.get();

    expect(caps.capabilities.transactionV1).toBe(env.kaspa.v1);
  });
});
