import { describe, it, expect } from "vitest";
import { evaluateNodeIdentity, CANONICAL_NODE_EXPECTATION, nodeRpcUrl } from "../src/node-identity.js";

// -----------------------------------------------------------------------------
// SILVER-OWN-NODE (design, 2026-10-21; not implemented). The Silver commands prove the node they talk to before any
// covenant transaction (requireNodeIdentity), today always against the canonical expectation: container
// hardkas-kaspad-toccata-v2, JSON wRPC on 127.0.0.1:18210. A second localnet on the same machine (another session's, or
// an isolated one) can therefore never be used for Silver, and the canonical slot is a single shared resource.
// The proposed mechanism lets the user DECLARE another node of the same pinned build — its own container name and port —
// and keeps every proof: only the operational identifiers of the expectation change, never what is verified (the image
// digest, the declared container owning the declared RPC port on loopback, the network and the version the node itself
// reports). These tests pin that envelope on the pure evaluator such a declaration would go through, unchanged today;
// nothing here talks to Docker or to a node.
// -----------------------------------------------------------------------------

const OWN = { ...CANONICAL_NODE_EXPECTATION, containerName: "hk-own-silver-kaspad", rpcPort: 28310 };
const container = (over: Record<string, unknown> = {}) => ({
  name: OWN.containerName,
  id: "c".repeat(64),
  running: true,
  imageId: OWN.imageDigest,
  repoDigests: [] as string[],
  publishedPorts: [{ containerPort: `${OWN.rpcPort}/tcp`, hostIp: "127.0.0.1", hostPort: OWN.rpcPort }],
  ...over
});
const server = (over: Record<string, unknown> = {}) => ({ url: nodeRpcUrl(OWN), networkId: OWN.network, serverVersion: OWN.serverVersion, ...over });
const evaluate = (observed: any) => evaluateNodeIdentity(OWN, { probeErrors: [], ...observed });

describe("SILVER-OWN-NODE · a declared node is trusted only on the same proofs as the canonical one", () => {
  it("a declared node of the pinned build that owns its declared port on loopback and reports simnet and the pinned version: verified, at its own URL", () => {
    const r = evaluate({ container: container(), server: server() });
    expect(r.problems).toEqual([]);
    expect(r.verified).toBe(true);
    expect(nodeRpcUrl(OWN)).toBe("ws://127.0.0.1:28310");
  });

  it("the declared name on another image (digest mismatch): refused", () => {
    const r = evaluate({ container: container({ imageId: "sha256:" + "e".repeat(64) }), server: server() });
    expect(r.verified).toBe(false);
    expect(r.problems.join(" ")).toMatch(/does not carry the expected digest/);
  });

  it("the declared port published from ANOTHER port inside the container (e.g. 18210 → 28310): refused — the node must listen on the declared port itself", () => {
    const r = evaluate({ container: container({ publishedPorts: [{ containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: OWN.rpcPort }] }), server: server() });
    expect(r.verified).toBe(false);
    expect(r.problems.join(" ")).toMatch(/does not publish the RPC endpoint 127\.0\.0\.1:28310/);
  });

  it("the declared port published on a non-loopback interface: refused", () => {
    const r = evaluate({ container: container({ publishedPorts: [{ containerPort: `${OWN.rpcPort}/tcp`, hostIp: "192.168.1.20", hostPort: OWN.rpcPort }] }), server: server() });
    expect(r.verified).toBe(false);
  });

  it("a node that reports another network or another version: refused", () => {
    expect(evaluate({ container: container(), server: server({ networkId: "testnet-10" }) }).problems.join(" ")).toMatch(/reports network 'testnet-10'/);
    expect(evaluate({ container: container(), server: server({ serverVersion: "2.0.1" }) }).problems.join(" ")).toMatch(/reports version '2\.0\.1'/);
  });

  it("the name alone proves nothing: a stopped container, or a node answering with no such container, is refused", () => {
    expect(evaluate({ container: container({ running: false }), server: server() }).verified).toBe(false);
    const noContainer = evaluate({ server: server() });
    expect(noContainer.verified).toBe(false);
    expect(noContainer.problems.join(" ")).toMatch(/container 'hk-own-silver-kaspad' not found/);
  });

  it("control · the canonical expectation is untouched: same digest, network and version; its port stays 18210", () => {
    expect({ digest: OWN.imageDigest, network: OWN.network, version: OWN.serverVersion }).toEqual({
      digest: CANONICAL_NODE_EXPECTATION.imageDigest,
      network: CANONICAL_NODE_EXPECTATION.network,
      version: CANONICAL_NODE_EXPECTATION.serverVersion
    });
    expect(nodeRpcUrl()).toBe("ws://127.0.0.1:18210");
  });
});
