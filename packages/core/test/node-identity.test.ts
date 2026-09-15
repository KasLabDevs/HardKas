import { describe, it, expect } from "vitest";
import {
  CANONICAL_LOCALNET,
  CANONICAL_NODE_EXPECTATION,
  KASPAD_REFERENCE_VERSION,
  assertNodeIdentityVerified,
  evaluateNodeIdentity,
  nodeRpcUrl,
  type ObservedNode
} from "../src/index.js";

const good: ObservedNode = {
  container: {
    name: CANONICAL_LOCALNET.containerName,
    id: "abc",
    running: true,
    imageId: CANONICAL_LOCALNET.imageDigest,
    repoDigests: [`kaspanet/rusty-kaspad@${CANONICAL_LOCALNET.imageDigest}`],
    publishedPorts: [
      { containerPort: "16210/tcp", hostIp: "127.0.0.1", hostPort: 16210 },
      { containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: 18210 }
    ]
  },
  server: { url: "ws://127.0.0.1:18210", networkId: "simnet", serverVersion: CANONICAL_LOCALNET.serverVersion },
  probeErrors: []
};

const evaluate = (observed: ObservedNode) => evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, observed);

describe("node identity", () => {
  it("derives the expected version from the pinned release, not a literal", () => {
    expect(CANONICAL_LOCALNET.serverVersion).toBe(KASPAD_REFERENCE_VERSION.replace(/^v/, ""));
    expect(nodeRpcUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("verifies the canonical node", () => {
    const r = evaluate(good);
    expect(r.problems).toEqual([]);
    expect(r.verified).toBe(true);
  });

  it("rejects a container that only carries the canonical name", () => {
    const r = evaluate({ ...good, container: { ...good.container!, imageId: "sha256:" + "1".repeat(64), repoDigests: [] } });
    expect(r.verified).toBe(false);
    expect(r.problems.join()).toMatch(/does not carry the expected digest/);
  });

  it("accepts the digest through RepoDigests when the image id differs (classic image store)", () => {
    const r = evaluate({ ...good, container: { ...good.container!, imageId: "sha256:" + "2".repeat(64) } });
    expect(r.verified).toBe(true);
  });

  it("rejects a node reporting another network or version", () => {
    expect(evaluate({ ...good, server: { ...good.server!, networkId: "testnet-10" } }).problems.join()).toMatch(/network 'testnet-10'/);
    expect(evaluate({ ...good, server: { ...good.server!, serverVersion: "2.0.0" } }).problems.join()).toMatch(/version '2.0.0'/);
  });

  it("rejects a container that does not own the RPC endpoint", () => {
    const r = evaluate({
      ...good,
      container: { ...good.container!, publishedPorts: [{ containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: 28210 }] }
    });
    expect(r.problems.join()).toMatch(/does not publish the RPC endpoint 127\.0\.0\.1:18210/);
  });

  it("rejects a missing or stopped container, and an endpoint where nothing answers", () => {
    expect(evaluate({ ...good, container: undefined }).problems.join()).toMatch(/not found/);
    expect(evaluate({ ...good, container: { ...good.container!, running: false } }).problems.join()).toMatch(/not running/);
    expect(evaluate({ ...good, server: undefined }).problems.join()).toMatch(/no node answered/);
  });

  it("carries probe errors as problems", () => {
    const r = evaluate({ ...good, probeErrors: ["docker unavailable: daemon not running"] });
    expect(r.verified).toBe(false);
    expect(r.problems[0]).toMatch(/docker unavailable/);
  });

  it("produces a serializable record and fails closed on demand", () => {
    const r = evaluate(good);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(r.schema).toBe("hardkas.nodeIdentity.v1");
    expect(() => assertNodeIdentityVerified(evaluate({ ...good, container: undefined }))).toThrow(/NODE_IDENTITY_UNVERIFIED/);
  });
});
