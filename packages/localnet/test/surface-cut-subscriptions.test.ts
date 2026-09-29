import { describe, it, expect } from "vitest";
import { LocalnetSimulatedProvider } from "../src/provider.js";

// Surface Cut 3c-2: `KaspaRpcClient` lost its notification API (see
// packages/kaspa-rpc/test/surface-cut-subscriptions.test.ts), and the simulated provider's no-op
// `subscribeTo*`, `on` and `off` went with it.
describe("Surface Cut 3c-2: LocalnetSimulatedProvider is request/response only", () => {
  it("has no subscribeTo*, on or off", () => {
    const members = ["subscribeToUtxosChanged", "subscribeToVirtualChainChanged", "on", "off"];
    expect(members.filter((member) => member in LocalnetSimulatedProvider.prototype)).toEqual([]);
  });
});
