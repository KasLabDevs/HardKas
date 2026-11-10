import { describe, it, expect } from "vitest";
import { resolveNodeEndpoint, DEFAULT_HARDKAS_CONFIG } from "../src/index.js";

// MAINNET TOTAL LOCKDOWN (owner decision 2026-11-09) · the endpoint authority gives a mainnet network NO endpoint —
// declared, built in, explicit (`--url`), behind an alias, any spelling — before the URL is even read or validated.

const code = (f: () => unknown) => {
  try {
    f();
    return "resolved";
  } catch (e: any) {
    return e?.code ?? String(e);
  }
};

describe("MAINNET TOTAL LOCKDOWN · resolveNodeEndpoint", () => {
  it("a mainnet network, declared with an rpcUrl and given an explicit --url: MAINNET_CONNECTION_DISABLED", () => {
    const config: any = { networks: { mainnet: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: "ws://127.0.0.1:26499" } } };
    expect(code(() => resolveNodeEndpoint({ config, networkId: "mainnet" }))).toBe("MAINNET_CONNECTION_DISABLED");
    expect(code(() => resolveNodeEndpoint({ config, networkId: "mainnet", explicitUrl: "ws://127.0.0.1:26498" }))).toBe("MAINNET_CONNECTION_DISABLED");
  });

  it("an alias whose entry declares mainnet (any spelling) and the spellings themselves as names", () => {
    for (const declared of ["mainnet", "kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"]) {
      const config: any = { networks: { prod: { kind: "kaspa-rpc", network: declared, rpcUrl: "ws://127.0.0.1:26497" } } };
      expect(code(() => resolveNodeEndpoint({ config, networkId: "prod" })), declared).toBe("MAINNET_CONNECTION_DISABLED");
      expect(code(() => resolveNodeEndpoint({ config: { networks: {} } as any, networkId: declared, explicitUrl: "ws://127.0.0.1:26496" })), declared).toBe("MAINNET_CONNECTION_DISABLED");
    }
  });

  it("decided before the endpoint is read: a malformed URL or none at all is still the lockdown's refusal", () => {
    const bad: any = { networks: { prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: "not a url" } } };
    expect(code(() => resolveNodeEndpoint({ config: bad, networkId: "prod" }))).toBe("MAINNET_CONNECTION_DISABLED");
    expect(code(() => resolveNodeEndpoint({ config: DEFAULT_HARDKAS_CONFIG as any, networkId: "mainnet" }))).toBe("MAINNET_CONNECTION_DISABLED");
  });

  it("controls: testnet-10 declared resolves; a public network without an endpoint stays NETWORK_ENDPOINT_REQUIRED", () => {
    const config: any = { networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "ws://127.0.0.1:26495" } } };
    expect(resolveNodeEndpoint({ config, networkId: "testnet-10" })).toEqual({ url: "ws://127.0.0.1:26495", source: "declared" });
    expect(code(() => resolveNodeEndpoint({ config: { networks: {} } as any, networkId: "testnet-11" }))).toBe("NETWORK_ENDPOINT_REQUIRED");
  });
});
