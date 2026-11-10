import { describe, it, expect, afterAll } from "vitest";
import { CANONICAL_NODE_EXPECTATION, evaluateNodeIdentity } from "@hardkas/core";
import { createKaspaSimulator, SimulatorRpcServer } from "../src/index.js";

/*
 * HK-01 / CA-EV-09 (audit 6-nov-2026): the simulator answered getServerInfo exactly as the canonical rusty-kaspad
 * (simnet, "2.1.0"), so the only difference left between them was the container check. It must identify itself.
 */

describe("the simulator never passes as the canonical rusty-kaspad", () => {
  const sim = createKaspaSimulator({ networkId: "simnet" });
  afterAll(() => sim.close());

  it("getServerInfo reports a version that is not the canonical node's", async () => {
    const info = await sim.rpc.getServerInfo();
    expect(info.serverVersion).not.toBe(CANONICAL_NODE_EXPECTATION.serverVersion);
    expect(info.serverVersion).toMatch(/kaspa-simulator/);
  });

  it("observed without a container (Docker down or absent), the canonical expectation refuses it, naming the version", async () => {
    const info = await sim.rpc.getServerInfo();
    const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, {
      container: undefined,
      server: { url: "ws://127.0.0.1:18210", networkId: String(info.networkId), serverVersion: info.serverVersion, isSynced: info.isSynced },
      probeErrors: []
    });
    expect(r.verified).toBe(false);
    expect(r.problems.join("\n")).toMatch(/version/);
  });

  it("over the wire (wRPC JSON) getServerInfo carries the simulator version too", async () => {
    const server = new SimulatorRpcServer(sim);
    const started = await server.start({ host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(started.httpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getServerInfo" })
      });
      const body: any = await res.json();
      expect(body.result.serverVersion).not.toBe(CANONICAL_NODE_EXPECTATION.serverVersion);
      expect(body.result.serverVersion).toMatch(/kaspa-simulator/);
    } finally {
      await server.close();
    }
  });
});
