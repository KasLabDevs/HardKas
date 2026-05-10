import { describe, it, expect } from "vitest";
import { defineHardkasConfig } from "../src/define";
import { resolveNetworkTarget } from "../src/resolve";
import { DEFAULT_HARDKAS_CONFIG } from "../src/defaults";

describe("config", () => {
  it("defineHardkasConfig should return the config object", () => {
    const config = { defaultNetwork: "devnet" };
    expect(defineHardkasConfig(config)).toBe(config);
  });

  it("resolveNetworkTarget should use defaultNetwork if no network is passed", () => {
    const config = { 
      defaultNetwork: "devnet",
      networks: {
        devnet: { kind: "kaspa-node" as const, network: "devnet" as const }
      }
    };
    const resolved = resolveNetworkTarget({ config });
    expect(resolved.name).toBe("devnet");
    expect(resolved.target.kind).toBe("kaspa-node");
  });

  it("resolveNetworkTarget should use simnet as default fallback", () => {
    const resolved = resolveNetworkTarget({ config: {} });
    expect(resolved.name).toBe("simnet");
    expect(resolved.target.kind).toBe("simulated");
  });

  it("resolveNetworkTarget should throw for unknown network", () => {
    expect(() => resolveNetworkTarget({ config: {}, network: "non-existent" }))
      .toThrow(/Unknown HardKAS network 'non-existent'/);
  });
});
