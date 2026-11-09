import { describe, it, expect, vi } from "vitest";
import { CANONICAL_LOCALNET, CANONICAL_NODE_EXPECTATION, endpointNodeExpectation, evaluateNodeIdentity } from "@hardkas/core";

// INT9 (front A × front C5): front A made "synced" a verdict apart from the node's identity, and the Silver on-chain
// commands require it on every node (NODE_NOT_SYNCED). Front C5's readiness (`silver doctor`, `capabilities`) only
// looked at identity, so after the merge it called an unsynced node ready. Readiness now requires identity AND sync,
// on an endpoint and on the canonical localnet, and says which one failed. Identities are simulated observations.

const identity = vi.hoisted(() => ({ canonical: undefined as unknown, endpoint: undefined as unknown }));
vi.mock("@hardkas/node-runner", () => ({
  verifyNodeIdentity: vi.fn(async () => identity.canonical),
  verifyEndpointIdentity: vi.fn(async () => identity.endpoint)
}));

const { probeSilverReadiness } = await import("../src/capabilities.js");

const CONTAINER = {
  name: CANONICAL_LOCALNET.containerName,
  id: "abc",
  running: true,
  imageId: CANONICAL_LOCALNET.imageDigest,
  repoDigests: [],
  publishedPorts: [{ containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: 18210 }]
};
const server = (url: string, networkId: string, isSynced: boolean) => ({ url, networkId, serverVersion: CANONICAL_LOCALNET.serverVersion, isSynced });
const OWN = "ws://127.0.0.1:26999";

describe("INT9 · Silver readiness requires the node's identity and its sync", () => {
  it("canonical rusty-kaspad, verified, synced: ready (control)", async () => {
    identity.canonical = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: CONTAINER, server: server("ws://127.0.0.1:18210", "simnet", true), probeErrors: [] });
    const r = await probeSilverReadiness();
    expect(r.node.ok).toBe(true);
    expect(r.node.notSynced).toBeUndefined();
  });

  it("canonical rusty-kaspad, verified, NOT synced: not ready, notSynced, the detail says why", async () => {
    identity.canonical = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: CONTAINER, server: server("ws://127.0.0.1:18210", "simnet", false), probeErrors: [] });
    const r = await probeSilverReadiness();
    expect(r.node).toMatchObject({ ok: false, verification: "canonical", notSynced: true });
    expect(r.node.detail).toMatch(/proved its identity but is not synced \(not-synced\).*NODE_NOT_SYNCED/);
    expect(r.ready["silver.p2sh.deploy-spend.v1"]).toBe(false);
  });

  it("endpoint rusty-kaspad, verified, synced: ready (control)", async () => {
    identity.endpoint = evaluateNodeIdentity(endpointNodeExpectation(OWN, "devnet"), { container: undefined, server: server(OWN, "devnet", true), probeErrors: [] });
    const r = await probeSilverReadiness({ endpoint: { url: OWN, network: "devnet" } });
    expect(r.node).toMatchObject({ ok: true, verification: "endpoint", network: "devnet" });
  });

  it("endpoint rusty-kaspad, verified, NOT synced: not ready, notSynced, never reported as an identity failure", async () => {
    identity.endpoint = evaluateNodeIdentity(endpointNodeExpectation(OWN, "devnet"), { container: undefined, server: server(OWN, "devnet", false), probeErrors: [] });
    const r = await probeSilverReadiness({ endpoint: { url: OWN, network: "devnet" } });
    expect(r.node).toMatchObject({ ok: false, verification: "endpoint", notSynced: true });
    expect(r.node.detail).toMatch(/proved its identity but is not synced/);
    expect(r.node.detail).not.toMatch(/did not prove/);
  });
});
