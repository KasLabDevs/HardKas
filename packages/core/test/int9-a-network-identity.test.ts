import { describe, it, expect } from "vitest";
import * as core from "../src/index.js";
import {
  CANONICAL_LOCALNET,
  CANONICAL_NODE_EXPECTATION,
  SIMULATOR_NODE_EXPECTATION,
  KASPA_SIMULATOR_VERSION_SUFFIX,
  endpointNodeExpectation,
  evaluateNodeIdentity,
  summarizeNodeIdentity,
  readNodeIdentityRecord,
  type ObservedContainer,
  type ObservedNode
} from "../src/index.js";

// INT9-A (I-1, I-3) · the canonical network identity: family, id, observed id, endpoint, node type, identity evidence,
// sync state and trust, kept apart. A well-identified node is not a synced node; a digest nobody compared is never
// recorded; simulated is never real; devnet is never read as simnet; an address prefix never proves a network.

const anyCore = core as any;
const URL_EP = "ws://127.0.0.1:26310";
const server = (over: Record<string, unknown> = {}) => ({
  url: URL_EP,
  networkId: "simnet",
  serverVersion: CANONICAL_LOCALNET.serverVersion,
  isSynced: true,
  rpcApiVersion: 1,
  rpcApiRevision: 0,
  ...over
});
const CANONICAL_CONTAINER: ObservedContainer = {
  name: CANONICAL_LOCALNET.containerName,
  id: "abc",
  running: true,
  imageId: "sha256:" + "9".repeat(64),
  repoDigests: [`kaspanet/rusty-kaspad@${CANONICAL_LOCALNET.imageDigest}`],
  publishedPorts: [{ containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: 18210 }]
};
const managed = (over: Record<string, unknown> = {}): ObservedNode => ({
  container: CANONICAL_CONTAINER,
  server: { ...server(over), url: "ws://127.0.0.1:18210" } as any,
  probeErrors: []
});

describe("INT9-A · I-3a: a node proven by its endpoint never carries an image digest nobody compared", () => {
  it("the endpoint expectation names no image and no digest", () => {
    const e = endpointNodeExpectation(URL_EP, "devnet");
    expect({ image: e.image, imageDigest: e.imageDigest, verification: e.verification, network: e.network }).toEqual({
      image: "",
      imageDigest: "",
      verification: "endpoint",
      network: "devnet"
    });
  });

  it("neither the record, its summary nor its network identity mention the pinned digest", () => {
    const r = evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), { server: server(), probeErrors: [] });
    expect(r.verified).toBe(true);
    expect(JSON.stringify(r)).not.toContain(CANONICAL_LOCALNET.imageDigest);
    expect(JSON.stringify(summarizeNodeIdentity(r))).not.toContain(CANONICAL_LOCALNET.imageDigest);
    expect(JSON.stringify(anyCore.networkIdentityOf(r))).not.toContain(CANONICAL_LOCALNET.imageDigest);
  });

  it("a container check keeps the pin it compared and the digest it observed", () => {
    const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, managed());
    const id = anyCore.networkIdentityOf(r);
    expect(id.evidence).toEqual({
      kind: "container",
      containerName: CANONICAL_LOCALNET.containerName,
      expectedImage: CANONICAL_LOCALNET.image,
      expectedImageDigest: CANONICAL_LOCALNET.imageDigest,
      observedImageDigest: CANONICAL_LOCALNET.imageDigest,
      serverVersion: CANONICAL_LOCALNET.serverVersion
    });
    expect(id.trust).toBe("node-container");
  });
});

describe("INT9-A · I-3b: identity and sync are separate verdicts, on every node", () => {
  it("an endpoint node that says it is not synced is WELL IDENTIFIED (verified) and NOT SYNCED", () => {
    const r = evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), { server: server({ isSynced: false }), probeErrors: [] });
    expect({ verified: r.verified, kind: r.kind, sync: (r as any).sync, problems: r.problems }).toEqual({
      verified: true,
      kind: "rusty-kaspad",
      sync: "not-synced",
      problems: []
    });
    expect(() => anyCore.assertNodeSynced(r, "silver deploy")).toThrow(/NODE_NOT_SYNCED/);
    try {
      anyCore.assertNodeSynced(r);
    } catch (e: any) {
      expect({ code: e.code, sync: e.sync }).toEqual({ code: "NODE_NOT_SYNCED", sync: "not-synced" });
    }
  });

  it("the managed localnet (container check) is held to the same rule (I-3: it was never asked)", () => {
    const r = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, managed({ isSynced: false }));
    expect(r.verified).toBe(true);
    expect(() => anyCore.assertNodeSynced(r)).toThrow(/NODE_NOT_SYNCED/);
    expect(anyCore.assertNodeSynced(evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, managed()))).toBeTruthy();
  });

  it("a node that does not say whether it is synced is `unknown`, and refused as not synced", () => {
    const r = evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), { server: server({ isSynced: undefined }), probeErrors: [] });
    expect((r as any).sync).toBe("unknown");
    expect(() => anyCore.assertNodeSynced(r)).toThrow(/did not say whether it is synced/);
  });

  it("a stored record is re-evaluated with its sync state derived from its observation", () => {
    const r = evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), { server: server({ isSynced: false }), probeErrors: [] });
    const stored = JSON.parse(JSON.stringify(r));
    delete stored.sync; // a record written before the field existed
    expect((readNodeIdentityRecord(stored) as any).sync).toBe("not-synced");
  });

  it("the summary a record keeps says the sync state and the endpoint asked (credentials redacted)", () => {
    const url = "wss://user:secret@node.example/kaspa/testnet-10/wrpc/json";
    const r = evaluateNodeIdentity(endpointNodeExpectation(url, "testnet-10"), {
      server: server({ url, networkId: "testnet-10" }),
      probeErrors: []
    });
    const s = summarizeNodeIdentity(r) as any;
    expect(s.sync).toBe("synced");
    expect(s.endpoint).toBeDefined();
    expect(s.endpoint).not.toContain("secret");
    expect(s).not.toHaveProperty("expectedImageDigest");
  });
});

describe("INT9-A · the canonical network identity type", () => {
  it("families and concrete ids, exactly spelled (a bare 'testnet', an alias or an L2 id is no L1 network)", () => {
    const cases: Array<[string, string | undefined]> = [
      ["simulated", "simulated"],
      ["simnet", "simnet"],
      ["devnet", "devnet"],
      ["testnet-10", "testnet"],
      ["testnet-11", "testnet"],
      ["mainnet", "mainnet"],
      ["testnet", undefined],
      ["kaspa-mainnet", undefined],
      ["Mainnet", undefined],
      ["igra", undefined],
      ["local-docker-simnet", undefined],
      ["", undefined]
    ];
    for (const [id, family] of cases) expect([id, anyCore.networkFamilyOf(id)]).toEqual([id, family]);
    expect(() => anyCore.parseNetworkId("testnet")).toThrow(/NETWORK_ID_INVALID/);
  });

  it("a container-proven node, an endpoint-proven node, the simulator and an impostor get distinct node types and trust", () => {
    const container = anyCore.networkIdentityOf(evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, managed()));
    const endpoint = anyCore.networkIdentityOf(evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), { server: server(), probeErrors: [] }));
    const sim = anyCore.networkIdentityOf(
      evaluateNodeIdentity(SIMULATOR_NODE_EXPECTATION, {
        server: { url: "ws://127.0.0.1:19110", networkId: "simnet", serverVersion: SIMULATOR_NODE_EXPECTATION.serverVersion, isSynced: true },
        probeErrors: []
      })
    );
    const impostor = anyCore.networkIdentityOf(
      evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), {
        server: server({ serverVersion: `${CANONICAL_LOCALNET.serverVersion}${KASPA_SIMULATOR_VERSION_SUFFIX}` }),
        probeErrors: []
      })
    );
    expect([container, endpoint, sim, impostor].map((i: any) => [i.nodeType, i.trust, i.evidence.kind])).toEqual([
      ["rusty-kaspad", "node-container", "container"],
      ["rusty-kaspad", "node-endpoint", "endpoint"],
      ["simulator", "simulator", "simulator"],
      ["unverified", "unverified", "endpoint"]
    ]);
    expect(endpoint.evidence).toEqual({ kind: "endpoint", serverVersion: CANONICAL_LOCALNET.serverVersion, rpcApiVersion: 1, rpcApiRevision: 0 });
    expect({ family: endpoint.family, networkId: endpoint.networkId, observed: endpoint.observedNetworkId, endpoint: endpoint.endpoint, sync: endpoint.sync }).toEqual({
      family: "simnet",
      networkId: "simnet",
      observed: "simnet",
      endpoint: URL_EP,
      sync: "synced"
    });
  });

  it("a node checked as simnet is never the identity of devnet (and a devnet node never passes as simnet)", () => {
    const simnetCheck = evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), { server: server(), probeErrors: [] });
    const asDevnet = anyCore.networkIdentityOf(simnetCheck, "devnet");
    expect(asDevnet.nodeType).toBe("unverified");
    expect(asDevnet.problems.join()).toMatch(/checked as simnet, not devnet/);
    const devnetNode = evaluateNodeIdentity(endpointNodeExpectation(URL_EP, "simnet"), { server: server({ networkId: "devnet" }), probeErrors: [] });
    expect(devnetNode.verified).toBe(false);
    expect(devnetNode.problems.join()).toMatch(/reports network 'devnet', expected 'simnet'/);
  });

  it("an offline identity names the network and claims nothing about any node", () => {
    expect(anyCore.offlineNetworkIdentity("mainnet")).toMatchObject({
      family: "mainnet",
      networkId: "mainnet",
      nodeType: "unverified",
      sync: "not-checked",
      trust: "offline",
      evidence: { kind: "none" }
    });
  });

  it("a stored summary is read without inventing history: legacy container (no verification, no sync) stays a container check with an unknown sync", () => {
    const legacy = { verified: true, imageDigest: CANONICAL_LOCALNET.imageDigest, serverVersion: "2.1.0" };
    const id = anyCore.networkIdentityOfSummary("simnet", legacy);
    expect({ nodeType: id.nodeType, trust: id.trust, kind: id.evidence.kind, sync: id.sync }).toEqual({
      nodeType: "rusty-kaspad",
      trust: "node-container",
      kind: "container",
      sync: "unknown"
    });
    expect(id.evidence).not.toHaveProperty("expectedImageDigest");
    const mismatch = anyCore.networkIdentityOfSummary("devnet", { kind: "rusty-kaspad", verified: true, verification: "endpoint", network: "simnet", serverVersion: "2.1.0" });
    expect(mismatch.nodeType).toBe("unverified");
    expect(mismatch.problems.join()).toMatch(/reported simnet, the record says devnet/);
  });

  it("an address prefix is only a coherence hint: every testnet shares one, so it cannot tell testnet-10 from testnet-11", () => {
    const addr = "kaspatest:qpefxduytlhm3ha9m2qjkwtr8ys3ljcn7xxan76fg7yx509nuza4699e4gljq";
    expect(anyCore.addressPrefixMatchesNetwork(addr, "testnet-10")).toBe(true);
    expect(anyCore.addressPrefixMatchesNetwork(addr, "testnet-11")).toBe(true);
    expect(anyCore.addressPrefixMatchesNetwork("kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw", "devnet")).toBe(false);
    expect(anyCore.addressPrefixNetworkHint("kaspadev:qq")).toBe("devnet");
  });
});
