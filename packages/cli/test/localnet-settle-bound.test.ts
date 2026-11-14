import { beforeEach, describe, expect, it, vi } from "vitest";

// rc2 audit B1: `localnet seed` / `fund --treasury` could hang forever. The settle after the miner stops had no deadline
// (a chain that never moves past the genesis — virtual DAA 0 — or one something keeps mining never "settles"), and
// stopping the miner swallowed every Docker error, so a miner that did not stop kept the settle from ever finishing.
// Now the settle is bounded (LOCALNET_DAG_SETTLE_TIMEOUT), the miner's stop is verified (LOCALNET_STOP_FAILED), and a
// treasury that never gets funded ends in LOCALNET_TREASURY_FUNDING_TIMEOUT within the stated time. Docker is a double.

const h = vi.hoisted(() => ({
  calls: [] as string[][],
  minerStateAfterStop: "exited" as string,
  stopFails: false
}));

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    h.calls.push([...args]);
    if (args[0] === "stop") {
      if (h.stopFails) throw Object.assign(new Error("Cannot connect to the Docker daemon"), { stderr: "Cannot connect to the Docker daemon" });
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "inspect") return { stdout: h.minerStateAfterStop, stderr: "" };
    return { stdout: "", stderr: "" };
  })
}));

import { DEFAULT_DAG_SETTLE_TIMEOUT_MS, stopToccataMiner, waitForVirtualDagSettle } from "../src/runners/localnet-runners.js";
import { createLocalnetDockerBlockProducer, distributeFromTreasury } from "../src/runners/localnet-treasury.js";
import { getLocalnetTreasuryAccount } from "@hardkas/accounts";
import { CANONICAL_LOCALNET } from "@hardkas/core";
import { fixtureAddress } from "./localnet-treasury-fake-node.js";

const dagRpc = (next: () => { virtualDaaScore: bigint; sink: string }) => ({
  getBlockDagInfo: async () => {
    const s = next();
    return { virtualDaaScore: s.virtualDaaScore, sink: s.sink, virtualParentHashes: [s.sink] };
  }
});

beforeEach(() => {
  h.calls.length = 0;
  h.minerStateAfterStop = "exited";
  h.stopFails = false;
});

describe("B1 · the settle after the miner stops is bounded", () => {
  it("a genesis-only chain (virtual DAA 0) is LOCALNET_DAG_SETTLE_TIMEOUT, naming the cause, not a hang", async () => {
    const start = Date.now();
    const err: any = await waitForVirtualDagSettle(dagRpc(() => ({ virtualDaaScore: 0n, sink: "aa".repeat(32) })), { timeoutMs: 400, pollIntervalMs: 50 }).catch((e) => e);
    expect(err?.code).toBe("LOCALNET_DAG_SETTLE_TIMEOUT");
    expect(String(err?.message)).toMatch(/virtual DAA score 0/);
    expect(Date.now() - start).toBeLessThan(3_000);
  });

  it("a chain something keeps mining is LOCALNET_DAG_SETTLE_TIMEOUT ('still producing blocks')", async () => {
    let daa = 10n;
    const err: any = await waitForVirtualDagSettle(dagRpc(() => ({ virtualDaaScore: ++daa, sink: daa.toString(16).padStart(64, "0") })), {
      timeoutMs: 400,
      pollIntervalMs: 50
    }).catch((e) => e);
    expect(err?.code).toBe("LOCALNET_DAG_SETTLE_TIMEOUT");
    expect(String(err?.message)).toMatch(/still producing blocks/);
  });

  it("a stopped chain with blocks settles as before, and the default bound is finite", async () => {
    const fp = await waitForVirtualDagSettle(dagRpc(() => ({ virtualDaaScore: 77n, sink: "bb".repeat(32) })), { pollIntervalMs: 10 });
    expect(fp.virtualDaaScore).toBe(77n);
    expect(DEFAULT_DAG_SETTLE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_DAG_SETTLE_TIMEOUT_MS)).toBe(true);
  });
});

describe("B1 · stopping the miner is verified", () => {
  it("a miner still running after docker stop is LOCALNET_STOP_FAILED (it used to be swallowed)", async () => {
    h.minerStateAfterStop = "running";
    await expect(stopToccataMiner()).rejects.toMatchObject({ code: "LOCALNET_STOP_FAILED" });
  });

  it("docker stop failing for another reason than a missing container is LOCALNET_STOP_FAILED", async () => {
    h.stopFails = true;
    await expect(stopToccataMiner()).rejects.toMatchObject({ code: "LOCALNET_STOP_FAILED" });
  });

  it("a stopped (or absent) miner is a success, checked with docker inspect after the stop", async () => {
    await stopToccataMiner();
    expect(h.calls.map((a) => a[0])).toEqual(["stop", "inspect"]);
    expect(h.calls[0]).toContain(CANONICAL_LOCALNET.minerContainerName);
  });
});

describe("B1 · a treasury that never gets funded ends, within the stated time, in LOCALNET_TREASURY_FUNDING_TIMEOUT", () => {
  it("fresh node, a miner that produces no block: the typed timeout, with the settle problem, and the liveness miner restored", async () => {
    // the node: genesis only (virtual DAA 0), the treasury empty
    const rpc = {
      getUtxosByAddress: async () => [],
      getInfo: async () => ({ virtualDaaScore: 0n }),
      getBalanceByAddress: async () => ({ balanceSompi: 0n }),
      getBlockDagInfo: async () => ({ virtualDaaScore: 0n, sink: "cc".repeat(32), virtualParentHashes: [] }),
      submitTransaction: async () => {
        throw new Error("nothing may be submitted");
      }
    };
    const treasury = getLocalnetTreasuryAccount();
    const start = Date.now();
    const err: any = await distributeFromTreasury({
      rpc,
      producer: createLocalnetDockerBlockProducer(rpc, { pollIntervalMs: 20, settleTimeoutMs: 300 }),
      treasury,
      recipients: [{ name: "alice", address: fixtureAddress("0a"), beforeBalanceSompi: 0n, amountSompi: 100n * 100_000_000n }],
      timeoutMs: 300,
      stopMiner: false
    }).catch((e) => e);
    expect(err?.code).toBe("LOCALNET_TREASURY_FUNDING_TIMEOUT");
    expect(String(err?.message)).toMatch(/virtual DAA score 0/);
    expect(String(err?.message)).toMatch(/Nothing was broadcast/);
    expect(String(err?.message)).toMatch(/liveness miner was restarted/);
    expect(Date.now() - start).toBeLessThan(5_000);
    const runs = h.calls.filter((a) => a[0] === "run").map((a) => a[a.indexOf("-a") + 1]);
    // mined to the treasury, then (B4) the liveness miner restarted on the failure
    expect(runs[0]).toBe(treasury.address);
    expect(runs).toHaveLength(2);
    expect(runs[1]).not.toBe(treasury.address);
    expect(h.calls.some((a) => a[0] === "stop")).toBe(true);
  });
});
