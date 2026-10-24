import { describe, it, expect } from "vitest";
import { resolveNodeEndpoint } from "../src/endpoint";

// ENDPOINT-VALIDATION-1 (owner GO 2026-10-20; TESTNET-READONLY-1 phase 5, NEG-04 / P5-4). A malformed node endpoint —
// declared in hardkas.config.ts or given with --url — must be refused BEFORE anything connects, with a typed code
// (NETWORK_ENDPOINT_INVALID). It used to be rewritten to `ws://<text>` and connected to: `not-a-url` became a DNS lookup
// and a connection to host `not-a-url:80`; `http//127.0.0.1:18210` became host `http`. Valid forms keep working.

const config = (rpcUrl: string) => ({ networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl } } }) as any;
const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

const MALFORMED = [
  "not-a-url", // bare host without a port
  "http//127.0.0.1:18210", // scheme without ':'
  "ws//127.0.0.1:18210",
  "ws://", // no host
  "ws://:18210",
  "ws://127.0.0.1:99999", // port out of range
  "ws://127.0.0.1:0",
  "ftp://127.0.0.1:18210", // not a node scheme
  "file:///etc/passwd",
  " ws://127.0.0.1:18210", // surrounding whitespace
  "ws://127.0.0.1:18210 ",
  "ws://127.0.0.1 :18210",
  "127.0.0.1", // bare host, no port
  "127.0.0.1:18210/path" // a path needs a scheme
];
const VALID = [
  "ws://127.0.0.1:18210",
  "wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json",
  "http://127.0.0.1:16110",
  "https://node.example:443/",
  "127.0.0.1:18210",
  "localhost:18210",
  "[::1]:18210",
  "ws://[::1]:18210",
  "http://operator:secret@127.0.0.1:16110/?token=abc"
];

describe("ENDPOINT-VALIDATION-1 · resolveNodeEndpoint refuses a malformed endpoint before anything connects", () => {
  for (const url of MALFORMED) {
    it(`declared ${JSON.stringify(url)} → NETWORK_ENDPOINT_INVALID`, () => {
      expect(codeOf(() => resolveNodeEndpoint({ config: config(url), networkId: "testnet-10" }))).toBe("NETWORK_ENDPOINT_INVALID");
    });
    it(`explicit --url ${JSON.stringify(url)} → NETWORK_ENDPOINT_INVALID`, () => {
      expect(codeOf(() => resolveNodeEndpoint({ config: config("ws://127.0.0.1:18210"), networkId: "testnet-10", explicitUrl: url }))).toBe("NETWORK_ENDPOINT_INVALID");
    });
  }
  for (const url of VALID) {
    it(`control: ${JSON.stringify(url)} is accepted as given`, () => {
      expect(resolveNodeEndpoint({ config: config(url), networkId: "testnet-10" })).toEqual({ url, source: "declared" });
    });
  }
  it("control: no endpoint on a public network is still NETWORK_ENDPOINT_REQUIRED", () => {
    expect(codeOf(() => resolveNodeEndpoint({ config: { networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10" } } } as any, networkId: "testnet-10" }))).toBe("NETWORK_ENDPOINT_REQUIRED");
  });
});
