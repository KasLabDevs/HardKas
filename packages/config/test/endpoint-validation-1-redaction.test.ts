import { describe, it, expect } from "vitest";
import { resolveNodeEndpoint } from "../src/endpoint";

// ENDPOINT-VALIDATION-1 · owner review 2026-10-20: a refused endpoint may carry credentials (user:password, a token in
// the query). NETWORK_ENDPOINT_INVALID must not repeat them anywhere — message, metadata, or the serialized error — at
// either validation site. This file covers the endpoint authority (resolveNodeEndpoint); the RPC clients' own check is
// covered by packages/kaspa-rpc/test/endpoint-validation-1-redaction.test.ts. (TN10-CLI-E2E: split so that each
// package's test imports only its own sources; `tsc --noEmit` of @hardkas/config refused the cross-package imports,
// TS6059. Same cases, same assertions.)

const CASES = [
  "http://operator:SECRETPW1@127.0.0.1:99999",
  "ws://user:SECRETPW2@:18210",
  "ftp://user:SECRETPW3@127.0.0.1:18210",
  " ws://user:SECRETPW4@127.0.0.1:1/?token=SECRETTOK4",
  "operator:SECRETPW5@127.0.0.1",
  "wss://node.example:99999/?token=SECRETTOK6&apikey=SECRETKEY6",
  "ws://127.0.0.1:0/?password=SECRETPW7"
];
const SECRET = /SECRET[A-Z]*\d/;

const caught = (fn: () => unknown): any => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
};
const leaks = (e: any): string[] =>
  [String(e?.message), JSON.stringify(e?.metadata ?? {}), JSON.stringify(e, Object.getOwnPropertyNames(e ?? {})), String(e?.stack ?? "")].filter((s) => SECRET.test(s));

describe("ENDPOINT-VALIDATION-1 · a refused endpoint never repeats its credentials", () => {
  for (const url of CASES) {
    it(`resolveNodeEndpoint (declared) ${url.replace(SECRET, "…")}: refused, no credential in the error`, () => {
      const e = caught(() => resolveNodeEndpoint({ config: { networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } } } as any, networkId: "testnet-10" }));
      expect(e?.code).toBe("NETWORK_ENDPOINT_INVALID");
      expect(leaks(e)).toEqual([]);
    });
    it(`resolveNodeEndpoint (--url) ${url.replace(SECRET, "…")}: refused, no credential in the error`, () => {
      const e = caught(() => resolveNodeEndpoint({ config: {} as any, networkId: "testnet-10", explicitUrl: url }));
      expect(e?.code).toBe("NETWORK_ENDPOINT_INVALID");
      expect(leaks(e)).toEqual([]);
    });
  }
});
