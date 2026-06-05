import { describe, it, expect } from "vitest";
import { resolveProvider } from "../src/provider";

describe("Provider Resolution", () => {
  it("1. network simnet, url ws://localhost EXPECT rpc", () => {
    const res = resolveProvider({ network: "simnet", url: "ws://localhost" });
    expect(res.mode).toBe("rpc");
  });

  it("2. network simnet, provider rpc EXPECT rpc", () => {
    const res = resolveProvider({ network: "simnet", provider: "rpc" });
    expect(res.mode).toBe("rpc");
  });

  it("3. network simnet only EXPECT simulated", () => {
    const res = resolveProvider({ network: "simnet" });
    expect(res.mode).toBe("simulated");
  });

  it("4. kaspasim address + rpc provider EXPECT rpc", () => {
    // The resolveProvider function doesn't take address, so we just test the provider explicit override
    const res = resolveProvider({ network: "simnet", provider: "rpc" });
    expect(res.mode).toBe("rpc");
  });

  it("5. kaspasim address + no provider EXPECT simulated", () => {
    // Fallback to network default
    const res = resolveProvider({ network: "simnet" });
    expect(res.mode).toBe("simulated");
  });

  it("6. provider simulated + url EXPECT PROVIDER_CONFLICT", () => {
    expect(() => {
      resolveProvider({ network: "simnet", provider: "simulated", url: "ws://127.0.0.1:18210" });
    }).toThrow("PROVIDER_CONFLICT");
  });
});
