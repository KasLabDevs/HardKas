import { describe, it, expect, vi } from "vitest";
import {
  CANONICAL_LOCALNET,
  CANONICAL_NODE_EXPECTATION,
  SIMULATOR_NODE_EXPECTATION,
  evaluateNodeIdentity,
  nodeRpcUrl
} from "@hardkas/core";

/*
 * HK-01 (audit 6-nov-2026, X3 §2 test d): `SimnetNodeHarness.attach(<canonical endpoint>)` accepted the simulator as the
 * verified node when HARDKAS_SIMULATOR=1 dropped the container check. It now needs a verified rusty-kaspad.
 * Identities are simulated observations (no Docker, no node).
 */

const identity = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@hardkas/node-runner", () => ({
  verifyNodeIdentity: vi.fn(async () => identity.current)
}));

const { SimnetNodeHarness } = await import("../src/simnet-node-harness.js");

const SERVER = { url: "ws://127.0.0.1:18210", networkId: "simnet", serverVersion: CANONICAL_LOCALNET.serverVersion };

describe("attach to the canonical endpoint refuses anything but a verified rusty-kaspad", () => {
  it("the simulator on 18210 with no canonical container (and the old variables set) → NODE_IDENTITY_UNVERIFIED", async () => {
    process.env.HARDKAS_SIMULATOR = "1";
    process.env.HARDKAS_ALLOW_SIMULATOR_NODE = "1";
    try {
      identity.current = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: undefined, server: SERVER, probeErrors: [] });
      await expect(SimnetNodeHarness.attach(nodeRpcUrl())).rejects.toMatchObject({ code: "NODE_IDENTITY_UNVERIFIED" });
    } finally {
      delete process.env.HARDKAS_SIMULATOR;
      delete process.env.HARDKAS_ALLOW_SIMULATOR_NODE;
    }
  });

  it("a verified simulator identity is refused too", async () => {
    identity.current = evaluateNodeIdentity(SIMULATOR_NODE_EXPECTATION, {
      container: undefined,
      server: { ...SERVER, url: "ws://127.0.0.1:19110", serverVersion: SIMULATOR_NODE_EXPECTATION.serverVersion },
      probeErrors: []
    });
    await expect(SimnetNodeHarness.attach(nodeRpcUrl())).rejects.toThrow(/is a verified kaspa-simulator, not a rusty-kaspad/);
  });

  it("the verified canonical rusty-kaspad is attached, its identity on the handle", async () => {
    identity.current = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, {
      container: {
        name: CANONICAL_LOCALNET.containerName,
        id: "abc",
        running: true,
        imageId: CANONICAL_LOCALNET.imageDigest,
        repoDigests: [],
        publishedPorts: [{ containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: 18210 }]
      },
      server: SERVER,
      probeErrors: []
    });
    const handle = await SimnetNodeHarness.attach(nodeRpcUrl());
    expect(handle.identity?.kind).toBe("rusty-kaspad");
    expect(handle.identity?.verified).toBe(true);
  });
});
