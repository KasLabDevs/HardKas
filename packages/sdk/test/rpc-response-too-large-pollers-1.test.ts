import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RpcConnectionError, RpcResponseTooLargeError } from "@hardkas/kaspa-rpc";

// RPC-RESPONSE-TOO-LARGE-1 · the SDK's funding pollers (LFU §3, 21-oct-2026): `utxos.waitForSpendableFunding` and
// `node.fundDevWallets` read the address's whole UTXO list on every poll and swallowed every failure. For an address
// holding more than about 277,000 UTXOs the read can never succeed (RPC_RESPONSE_TOO_LARGE: the answer is larger than
// the 100 MiB HardKAS reads in one message), so they polled until a misleading timeout (LOCALNET_FUND_MATURITY_TIMEOUT
// after 300 s, MINING_TIMEOUT). Now that refusal ends the poll at once with its own code, and a failure that IS retried
// (a connection lost) is named in the timeout. The node is a stand-in; Docker is a double (nothing runs).

vi.mock("@hardkas/node-runner", async (orig) => ({
  ...(await orig<any>()),
  // the managed node "is not running" and starts at once: fundDevWallets goes straight to its funding poll
  DockerKaspadRunner: class {
    async status() {
      return { running: false };
    }
    async start() {
      return { running: true };
    }
    async reset() {
      return { running: false };
    }
  },
  requireNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] }))
}));

const { HardkasUtxos } = await import("../src/utxos.js");
const { HardkasNodeApi } = await import("../src/node.js");

const ADDRESS = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
const tooLarge = () => new RpcResponseTooLargeError({ method: "getUtxosByAddresses", endpoint: "ws://127.0.0.1:18210" });
const lost = () => new RpcConnectionError("Connection to Kaspa RPC at ws://127.0.0.1:18210 was lost: RPC Server (remote error) -> WebSocket disconnected");

function fakeSdk(fail: () => Error) {
  const reads = { utxos: 0 };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rtl-poll-"));
  const sdk: any = {
    network: "simnet",
    cwd,
    config: { config: { networks: {} } },
    rpc: {
      getUtxosByAddress: vi.fn(async () => {
        reads.utxos++;
        throw fail();
      }),
      getInfo: vi.fn(async () => ({ virtualDaaScore: 5000n })),
      getBlockDagInfo: vi.fn(async () => ({ virtualDaaScore: 5000n }))
    }
  };
  return { sdk, reads, done: () => fs.rmSync(cwd, { recursive: true, force: true }) };
}

async function failureOf(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("did not fail");
}

describe("RPC-RESPONSE-TOO-LARGE-1 · SDK funding pollers surface the typed error", () => {
  it("PO-1 waitForSpendableFunding: RPC_RESPONSE_TOO_LARGE at the first poll, never a maturity timeout", async () => {
    const f = fakeSdk(tooLarge);
    try {
      const started = Date.now();
      const e = await failureOf(new HardkasUtxos(f.sdk).waitForSpendableFunding({ address: ADDRESS, minSpendableSompi: 1n, timeoutMs: 3_000, pollIntervalMs: 100 }));
      expect(e?.code, String(e?.message)).toBe("RPC_RESPONSE_TOO_LARGE");
      expect(f.reads.utxos).toBe(1);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      f.done();
    }
  });

  it("PO-2 waitForSpendableFunding: a failure it retries (connection lost) is named in the timeout, code included", async () => {
    const f = fakeSdk(lost);
    try {
      const e = await failureOf(new HardkasUtxos(f.sdk).waitForSpendableFunding({ address: ADDRESS, minSpendableSompi: 1n, timeoutMs: 400, pollIntervalMs: 100 }));
      expect(e?.code, String(e?.message)).toBe("LOCALNET_FUND_MATURITY_TIMEOUT");
      expect(e.message).toMatch(/last error: \[RPC_CONNECTION_FAILED\] Connection to Kaspa RPC/);
      expect(e.lastObservedState).toMatchObject({ code: "RPC_CONNECTION_FAILED" });
      expect(f.reads.utxos).toBeGreaterThan(1);
    } finally {
      f.done();
    }
  });

  it("PO-3 fundDevWallets: RPC_RESPONSE_TOO_LARGE at the first poll, never MINING_TIMEOUT", async () => {
    const f = fakeSdk(tooLarge);
    try {
      const started = Date.now();
      const e = await failureOf(new HardkasNodeApi(f.sdk).fundDevWallets([ADDRESS], { timeoutMs: 3_000 }));
      expect(e?.code, String(e?.message)).toBe("RPC_RESPONSE_TOO_LARGE");
      expect(e.message).not.toMatch(/MINING_TIMEOUT/);
      expect(f.reads.utxos).toBe(1);
      expect(Date.now() - started).toBeLessThan(2_500);
    } finally {
      f.done();
    }
  });

  it("PO-4 fundDevWallets: a failure it retries is named in MINING_TIMEOUT", async () => {
    const f = fakeSdk(lost);
    try {
      const e = await failureOf(new HardkasNodeApi(f.sdk).fundDevWallets([ADDRESS], { timeoutMs: 1_500 }));
      expect(String(e?.message)).toMatch(/^MINING_TIMEOUT: /);
      expect(e.message).toMatch(/Last read error: \[RPC_CONNECTION_FAILED\]/);
    } finally {
      f.done();
    }
  });
});
