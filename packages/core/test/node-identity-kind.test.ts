import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_LOCALNET,
  CANONICAL_NODE_EXPECTATION,
  KASPA_SIMULATOR_VERSION_SUFFIX,
  SIMULATOR_NODE_EXPECTATION,
  assertNodeKind,
  endpointNodeExpectation,
  evaluateNodeIdentity,
  nodeRpcUrl,
  observedImageDigest,
  probeNodeIdentity,
  readNodeIdentityRecord,
  summarizeNodeIdentity,
  type ObservedContainer,
  type ObservedNode
} from "../src/index.js";

/*
 * HK-01 / EXP-01 / CA-EXP-01b (audit 6-nov-2026): the canonical identity check must not depend on the environment.
 * With HARDKAS_SIMULATOR=1 or HARDKAS_ALLOW_SIMULATOR_NODE=1 the uncommitted branch dropped "docker unavailable" and
 * "container not found", so any process on 127.0.0.1:18210 saying "simnet 2.1.0" (the simulator) was the verified
 * rusty-kaspad. These cases replay the audit's scenarios S1/S2 with simulated observations.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIM_SERVER = { url: "ws://127.0.0.1:18210", networkId: "simnet", serverVersion: CANONICAL_LOCALNET.serverVersion, isSynced: true };
const ENV_VARS = ["HARDKAS_SIMULATOR", "HARDKAS_ALLOW_SIMULATOR_NODE"] as const;

const saved: Record<string, string | undefined> = {};
for (const v of ENV_VARS) saved[v] = process.env[v];
afterEach(() => {
  for (const v of ENV_VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("HK-01 · the canonical identity ignores the environment", () => {
  // S1: Docker unreachable, no container, something on 18210 says simnet 2.1.0
  const s1: ObservedNode = { container: undefined, server: SIM_SERVER, probeErrors: ["docker unavailable: dial tcp 127.0.0.1:1: connection refused"] };
  // S2: Docker reachable, canonical container absent
  const s2: ObservedNode = { container: undefined, server: SIM_SERVER, probeErrors: [] };

  for (const v of [undefined, ...ENV_VARS]) {
    it(`S1 (Docker unreachable) is not verified ${v ? `with ${v}=1` : "without variables"}`, () => {
      if (v) process.env[v] = "1";
      const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, s1);
      expect(r.verified).toBe(false);
      expect(r.problems.join("\n")).toMatch(/docker unavailable/);
      expect(r.problems.join("\n")).toMatch(/not found/);
    });
    it(`S2 (canonical container absent) is not verified ${v ? `with ${v}=1` : "without variables"}`, () => {
      if (v) process.env[v] = "1";
      const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, s2);
      expect(r.verified).toBe(false);
      expect(r.problems.join("\n")).toMatch(/container 'hardkas-kaspad-toccata-v2' not found/);
    });
  }

  it("the same observation gives the same verdict whatever the environment (the function is pure)", () => {
    const before = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, s1, new Date(0));
    process.env.HARDKAS_SIMULATOR = "1";
    process.env.HARDKAS_ALLOW_SIMULATOR_NODE = "1";
    const after = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, s1, new Date(0));
    expect(after).toEqual(before);
  });

  it("node-identity.ts reads no environment variable", () => {
    const source = fs.readFileSync(path.join(HERE, "../src/node-identity.ts"), "utf8");
    expect(source).not.toMatch(/process\.env/);
  });

  it("probeNodeIdentity without a docker binary (EXP-01 B/C) is not verified with either variable", async () => {
    const savedPath = process.env.PATH;
    process.env.HARDKAS_SIMULATOR = "1";
    process.env.HARDKAS_ALLOW_SIMULATOR_NODE = "1";
    process.env.PATH = path.join(HERE, "no-such-bin-dir");
    try {
      const r = await probeNodeIdentity({
        getServerInfo: async () => ({ networkId: "simnet", serverVersion: CANONICAL_LOCALNET.serverVersion, isSynced: true })
      });
      expect(r.verified).toBe(false);
      expect(r.problems.join("\n")).toMatch(/docker unavailable/);
    } finally {
      process.env.PATH = savedPath;
    }
  });
});

const CANONICAL_CONTAINER: ObservedContainer = {
  name: CANONICAL_LOCALNET.containerName,
  id: "abc",
  running: true,
  imageId: "sha256:" + "9".repeat(64),
  repoDigests: [`kaspanet/rusty-kaspad@${CANONICAL_LOCALNET.imageDigest}`],
  publishedPorts: [{ containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: 18210 }]
};
const real: ObservedNode = { container: CANONICAL_CONTAINER, server: SIM_SERVER, probeErrors: [] };

describe("node kinds: rusty-kaspad, kaspa-simulator, unverified", () => {
  it("a verified canonical node is a rusty-kaspad and records the digest it OBSERVED (CA-TX-04)", () => {
    const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, real);
    expect(r.verified).toBe(true);
    expect(r.kind).toBe("rusty-kaspad");
    expect(r.observedImageDigest).toBe(CANONICAL_LOCALNET.imageDigest);
    const s = summarizeNodeIdentity(r);
    expect(s).toEqual({
      kind: "rusty-kaspad",
      verified: true,
      container: CANONICAL_LOCALNET.containerName,
      imageDigest: CANONICAL_LOCALNET.imageDigest,
      expectedImageDigest: CANONICAL_LOCALNET.imageDigest,
      serverVersion: CANONICAL_LOCALNET.serverVersion,
      // L1-CORE-1 B3: how it was proven, and the network it reported
      verification: "container",
      network: "simnet",
      // INT9-A: the sync state it reported (kept apart from the verdict) and the endpoint that was asked
      sync: "synced",
      endpoint: "ws://127.0.0.1:18210"
    });
  });

  // L1-CORE-1 B3 · a rusty-kaspad HardKAS does not manage, proven by what it reports (endpoint verification)
  describe("endpoint verification (a node HardKAS does not manage)", () => {
    const url = "ws://127.0.0.1:26299";
    const server = (over: Partial<{ networkId: string; serverVersion: string; isSynced: boolean }> = {}) => ({
      url,
      networkId: "simnet",
      serverVersion: CANONICAL_LOCALNET.serverVersion,
      isSynced: true,
      ...over
    });

    it("verified with no container at all: network, version, synced; the summary says `endpoint` and records no digest (nothing was checked against one)", () => {
      const expected = endpointNodeExpectation(url, "simnet");
      const r = evaluateNodeIdentity(expected, { server: server(), probeErrors: [] });
      expect({ verified: r.verified, kind: r.kind, problems: r.problems }).toEqual({ verified: true, kind: "rusty-kaspad", problems: [] });
      expect(nodeRpcUrl(expected)).toBe(url);
      const s = summarizeNodeIdentity(r);
      expect(s).toEqual({
        kind: "rusty-kaspad",
        verified: true,
        serverVersion: CANONICAL_LOCALNET.serverVersion,
        verification: "endpoint",
        network: "simnet",
        sync: "synced",
        endpoint: url
      });
    });

    // INT9-A (I-3b, changed on purpose): "not synced" was an identity problem of endpoint nodes only. It is now the
    // record's own `sync` verdict, required by every chain-state operation on every node (assertNodeSynced, covered in
    // int9-a-network-identity.test.ts); the identity of a not-synced node is still proven, and still refused below
    // for every other mismatch.
    it("not synced is a sync verdict, not an identity one (INT9-A)", () => {
      const r = evaluateNodeIdentity(endpointNodeExpectation(url, "simnet"), { server: server({ isSynced: false }), probeErrors: [] });
      expect({ verified: r.verified, kind: r.kind, sync: r.sync }).toEqual({ verified: true, kind: "rusty-kaspad", sync: "not-synced" });
    });

    it("refused when it serves another network, reports another version, or is the HardKAS simulator", () => {
      const expected = endpointNodeExpectation(url, "simnet");
      for (const [label, over] of [
        ["another network", { networkId: "testnet-10" }],
        ["another version", { serverVersion: "2.0.1" }],
        ["the simulator", { serverVersion: `${CANONICAL_LOCALNET.serverVersion}${KASPA_SIMULATOR_VERSION_SUFFIX}` }]
      ] as const) {
        const r = evaluateNodeIdentity(expected, { server: server(over), probeErrors: [] });
        expect({ label, verified: r.verified, kind: r.kind }).toEqual({ label, verified: false, kind: "unverified" });
      }
      expect(evaluateNodeIdentity(expected, { probeErrors: [] }).verified).toBe(false);
    });

    it("a wss:// endpoint with a path keeps its URL; the container expectation (the default) is unchanged", () => {
      const e = endpointNodeExpectation("wss://node.example/kaspa/testnet-10/wrpc/json", "testnet-10");
      expect({ url: nodeRpcUrl(e), port: e.rpcPort, verification: e.verification }).toEqual({ url: "wss://node.example/kaspa/testnet-10/wrpc/json", port: 443, verification: "endpoint" });
      expect(CANONICAL_NODE_EXPECTATION.verification).toBeUndefined();
      // without a container the CANONICAL (container) expectation is never verified, whatever the node reports
      expect(evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { server: server(), probeErrors: [] }).verified).toBe(false);
    });
  });

  it("a container with another digest: unverified, and the record keeps the digest that was seen, not the expected one", () => {
    const other = "sha256:" + "1".repeat(64);
    const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { ...real, container: { ...CANONICAL_CONTAINER, imageId: other, repoDigests: [] } });
    expect(r.kind).toBe("unverified");
    expect(r.observedImageDigest).toBe(other);
    const s = summarizeNodeIdentity(r);
    expect(s.imageDigest).toBe(other);
    expect(s.expectedImageDigest).toBe(CANONICAL_LOCALNET.imageDigest);
  });

  it("no container observed: no digest is recorded at all", () => {
    const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: undefined, server: SIM_SERVER, probeErrors: [] });
    expect(r.observedImageDigest).toBeUndefined();
    expect(summarizeNodeIdentity(r)).not.toHaveProperty("imageDigest");
    expect(observedImageDigest(undefined)).toBeUndefined();
  });

  it("a node reporting the simulator version is refused by the canonical expectation even inside the canonical container", () => {
    const simVersion = `${CANONICAL_LOCALNET.serverVersion}${KASPA_SIMULATOR_VERSION_SUFFIX}`;
    const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { ...real, server: { ...SIM_SERVER, serverVersion: simVersion } });
    expect(r.verified).toBe(false);
    expect(r.problems.join("\n")).toMatch(/identifies itself as the HardKAS kaspa simulator/);
  });

  it("the simulator has its own expectation: its suffixed version, no container, never a canonical port", () => {
    expect(SIMULATOR_NODE_EXPECTATION.kind).toBe("kaspa-simulator");
    expect(SIMULATOR_NODE_EXPECTATION.serverVersion).toBe(`${CANONICAL_LOCALNET.serverVersion}${KASPA_SIMULATOR_VERSION_SUFFIX}`);
    expect(Object.values(CANONICAL_LOCALNET.ports)).not.toContain(SIMULATOR_NODE_EXPECTATION.rpcPort);
    const server = { url: "ws://127.0.0.1:19110", networkId: "simnet", serverVersion: SIMULATOR_NODE_EXPECTATION.serverVersion };
    const ok = evaluateNodeIdentity(SIMULATOR_NODE_EXPECTATION, { container: undefined, server, probeErrors: [] });
    expect(ok.verified).toBe(true);
    expect(ok.kind).toBe("kaspa-simulator");
    expect(ok.observedImageDigest).toBeUndefined();
    // the same process as seen by the canonical expectation
    expect(evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: undefined, server, probeErrors: [] }).verified).toBe(false);
    // a rusty-kaspad answering on the simulator's port is not the simulator
    expect(evaluateNodeIdentity(SIMULATOR_NODE_EXPECTATION, { container: undefined, server: { ...server, serverVersion: "2.1.0" }, probeErrors: [] }).verified).toBe(false);
  });

  it("a simulator expectation pointed at the canonical localnet port is refused", () => {
    const misuse = { ...SIMULATOR_NODE_EXPECTATION, rpcPort: CANONICAL_LOCALNET.ports.jsonRpc };
    const r = evaluateNodeIdentity(misuse, {
      container: undefined,
      server: { url: "ws://127.0.0.1:18210", networkId: "simnet", serverVersion: SIMULATOR_NODE_EXPECTATION.serverVersion },
      probeErrors: []
    });
    expect(r.verified).toBe(false);
    expect(r.problems.join("\n")).toMatch(/cannot name the canonical localnet port 18210/);
  });

  it("assertNodeKind accepts only a verified node of the asked kind", () => {
    expect(() => assertNodeKind(evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, real))).not.toThrow();
    const sim = evaluateNodeIdentity(SIMULATOR_NODE_EXPECTATION, {
      container: undefined,
      server: { url: "ws://127.0.0.1:19110", networkId: "simnet", serverVersion: SIMULATOR_NODE_EXPECTATION.serverVersion },
      probeErrors: []
    });
    expect(() => assertNodeKind(sim, "rusty-kaspad")).toThrow(/NODE_IDENTITY_UNVERIFIED: .* is a verified kaspa-simulator, not a rusty-kaspad/);
    expect(() => assertNodeKind(sim, "kaspa-simulator")).not.toThrow();
    expect(() => assertNodeKind(evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: undefined, server: SIM_SERVER, probeErrors: [] }))).toThrow(
      /NODE_IDENTITY_UNVERIFIED/
    );
  });

  it("probing the simulator expectation never calls Docker", async () => {
    const savedPath = process.env.PATH;
    process.env.PATH = path.join(HERE, "no-such-bin-dir");
    try {
      const r = await probeNodeIdentity({
        expected: SIMULATOR_NODE_EXPECTATION,
        getServerInfo: async () => ({ networkId: "simnet", serverVersion: SIMULATOR_NODE_EXPECTATION.serverVersion })
      });
      expect(r.problems).toEqual([]);
      expect(r.kind).toBe("kaspa-simulator");
    } finally {
      process.env.PATH = savedPath;
    }
  });
});

describe("reading stored identity records (compatibility)", () => {
  it("a record written before `kind` existed is re-evaluated: a real node reads as rusty-kaspad", () => {
    const legacy = JSON.parse(JSON.stringify(evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, real, new Date(0))));
    delete legacy.kind;
    delete legacy.observedImageDigest;
    delete legacy.expected.kind;
    const r = readNodeIdentityRecord(legacy);
    expect(r.kind).toBe("rusty-kaspad");
    expect(r.verified).toBe(true);
    expect(r.observedImageDigest).toBe(CANONICAL_LOCALNET.imageDigest);
    expect(r.checkedAt).toBe(new Date(0).toISOString());
  });

  it("a record written under the HK-01 bypass (verified:true, no container) reads as unverified", () => {
    const bypass = {
      schema: "hardkas.nodeIdentity.v1",
      verified: true,
      problems: [],
      expected: { ...CANONICAL_NODE_EXPECTATION, kind: undefined },
      observed: { server: SIM_SERVER, probeErrors: [] },
      checkedAt: "2026-11-06T10:00:00.000Z"
    };
    const r = readNodeIdentityRecord(bypass);
    expect(r.verified).toBe(false);
    expect(r.kind).toBe("unverified");
    expect(r.problems.join("\n")).toMatch(/not found/);
  });

  it("anything else is refused with a stable code", () => {
    expect(() => readNodeIdentityRecord({ schema: "x" })).toThrow(/NODE_IDENTITY_RECORD_INVALID/);
  });
});