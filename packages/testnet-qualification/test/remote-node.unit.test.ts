import { describe, it, expect, vi } from "vitest";
import {
  probeRemoteTestnet,
  assertRemoteTestnetOrFailClosed,
  RemoteTestnetProbeFailedError,
  type RemoteNodeRpc,
  type GetServerInfoResponse,
  type GetBlockDagInfoResponse,
  type RemoteTestnetAuthority
} from "../src/remote-node.js";

function fakeRpc(overrides: Partial<{
  serverInfo: Partial<GetServerInfoResponse>;
  serverInfoImpl: () => Promise<GetServerInfoResponse>;
  dagInfo: Partial<GetBlockDagInfoResponse>;
  dagInfoImpl: () => Promise<GetBlockDagInfoResponse>;
  getNetworkParams: undefined | ((networkId: string) => Promise<unknown>);
  getFeeEstimate: undefined | ((input?: unknown) => Promise<unknown>);
}>): RemoteNodeRpc {
  const defaultServerInfo: GetServerInfoResponse = {
    networkId: "testnet-10",
    serverVersion: "0.16.0",
    rpcApiVersion: 1,
    hasUtxoIndex: true,
    isSynced: true,
    virtualDaaScore: 12345n,
    ...overrides.serverInfo
  };
  const defaultDagInfo: GetBlockDagInfoResponse = {
    networkName: "kaspa-testnet-10",
    virtualDaaScore: 12345n,
    ...overrides.dagInfo
  };
  const rpc: any = {
    getServerInfo: overrides.serverInfoImpl ?? vi.fn(async () => defaultServerInfo),
    getBlockDagInfo: overrides.dagInfoImpl ?? vi.fn(async () => defaultDagInfo)
  };
  if ("getNetworkParams" in overrides) {
    if (overrides.getNetworkParams) rpc.getNetworkParams = overrides.getNetworkParams;
  } else {
    rpc.getNetworkParams = vi.fn(async () => ({ networkId: "testnet-10", coinbaseTransactionMaturityPeriod: 1000n }));
  }
  if ("getFeeEstimate" in overrides) {
    if (overrides.getFeeEstimate) rpc.getFeeEstimate = overrides.getFeeEstimate;
  } else {
    rpc.getFeeEstimate = vi.fn(async () => ({ priorityBucket: { feerate: 1 } }));
  }
  return rpc as RemoteNodeRpc;
}

const FIXED_NOW = () => new Date("2026-09-15T12:00:00.000Z");
const ENDPOINT = { class: "wrpc" as const, address: "ws://127.0.0.1:17110" };

describe("probeRemoteTestnet — happy path", () => {
  it("returns a fully-populated RemoteTestnetAuthority", async () => {
    const rpc = fakeRpc({});
    const authority = await probeRemoteTestnet({
      endpoint: ENDPOINT,
      rpc,
      expectedNetworkId: "testnet-10",
      now: FIXED_NOW
    });
    expect(authority.authorityKind).toBe("REMOTE_TESTNET_NODE");
    expect(authority.network).toEqual({ expected: "testnet-10", observed: "testnet-10" });
    expect(authority.serverVersion).toBe("0.16.0");
    expect(authority.rpcApiVersion).toBe(1);
    expect(authority.isSynced).toBe(true);
    expect(authority.hasUtxoIndex).toBe(true);
    expect(authority.virtualDaaScore).toBe(12345n);
    expect(authority.capabilities).toEqual({
      getNetworkParams: true,
      getFeeEstimate: true,
      hasUtxoIndex: true
    });
    expect(authority.probeHashes.getServerInfo).toMatch(/^[0-9a-f]{64}$/);
    expect(authority.probeHashes.getBlockDagInfo).toMatch(/^[0-9a-f]{64}$/);
    expect(authority.probeHashes.getNetworkParams).toMatch(/^[0-9a-f]{64}$/);
    expect(authority.probeHashes.getFeeEstimate).toMatch(/^[0-9a-f]{64}$/);
    expect(authority.observedAt).toBe("2026-09-15T12:00:00.000Z");
    expect(authority.endpoint).toBe(ENDPOINT);
  });

  it("hashes are stable across identical inputs (deterministic serialization)", async () => {
    const rpc1 = fakeRpc({});
    const rpc2 = fakeRpc({});
    const a1 = await probeRemoteTestnet({ endpoint: ENDPOINT, rpc: rpc1, expectedNetworkId: "testnet-10", now: FIXED_NOW });
    const a2 = await probeRemoteTestnet({ endpoint: ENDPOINT, rpc: rpc2, expectedNetworkId: "testnet-10", now: FIXED_NOW });
    expect(a1.probeHashes.getServerInfo).toBe(a2.probeHashes.getServerInfo);
    expect(a1.probeHashes.getBlockDagInfo).toBe(a2.probeHashes.getBlockDagInfo);
  });
});

describe("probeRemoteTestnet — fail-closed", () => {
  it("throws NETWORK_MISMATCH when observed networkId differs from expected", async () => {
    const rpc = fakeRpc({ serverInfo: { networkId: "mainnet" } });
    let thrown: unknown;
    try {
      await probeRemoteTestnet({ endpoint: ENDPOINT, rpc, expectedNetworkId: "testnet-10", now: FIXED_NOW });
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(RemoteTestnetProbeFailedError);
    expect((thrown as RemoteTestnetProbeFailedError).reason).toBe("NETWORK_MISMATCH");
    expect((thrown as RemoteTestnetProbeFailedError).detail).toEqual({ expected: "testnet-10", observed: "mainnet" });
    // No secondary probes run after mismatch — dagInfo must NOT have been called.
    expect((rpc.getBlockDagInfo as any).mock.calls.length).toBe(0);
  });

  it("throws UNSYNCED when server reports isSynced=false", async () => {
    const rpc = fakeRpc({ serverInfo: { isSynced: false } });
    await expect(
      probeRemoteTestnet({ endpoint: ENDPOINT, rpc, expectedNetworkId: "testnet-10", now: FIXED_NOW })
    ).rejects.toMatchObject({ reason: "UNSYNCED" });
    // No downstream probe should run.
    expect((rpc.getBlockDagInfo as any).mock.calls.length).toBe(0);
  });

  it("throws MISSING_CAPABILITY when a required capability is absent", async () => {
    const rpc = fakeRpc({ getFeeEstimate: undefined });
    let thrown: unknown;
    try {
      await probeRemoteTestnet({
        endpoint: ENDPOINT,
        rpc,
        expectedNetworkId: "testnet-10",
        requiredCapabilities: ["getFeeEstimate"],
        now: FIXED_NOW
      });
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(RemoteTestnetProbeFailedError);
    expect((thrown as RemoteTestnetProbeFailedError).reason).toBe("MISSING_CAPABILITY");
    expect((thrown as RemoteTestnetProbeFailedError).detail?.missing).toEqual(["getFeeEstimate"]);
  });

  it("does NOT fail when a capability is absent but not required (scenario-scoped policy)", async () => {
    const rpc = fakeRpc({ getFeeEstimate: undefined, getNetworkParams: undefined });
    const authority = await probeRemoteTestnet({
      endpoint: ENDPOINT,
      rpc,
      expectedNetworkId: "testnet-10",
      now: FIXED_NOW
    });
    expect(authority.capabilities.getFeeEstimate).toBe(false);
    expect(authority.capabilities.getNetworkParams).toBe(false);
    expect(authority.probeHashes.getFeeEstimate).toBeUndefined();
    expect(authority.probeHashes.getNetworkParams).toBeUndefined();
  });

  it("records hasUtxoIndex=false but only fails when scenario requires it", async () => {
    const rpc = fakeRpc({ serverInfo: { hasUtxoIndex: false } });
    const a = await probeRemoteTestnet({ endpoint: ENDPOINT, rpc, expectedNetworkId: "testnet-10", now: FIXED_NOW });
    expect(a.hasUtxoIndex).toBe(false);
    expect(a.capabilities.hasUtxoIndex).toBe(false);

    const rpc2 = fakeRpc({ serverInfo: { hasUtxoIndex: false } });
    await expect(
      probeRemoteTestnet({
        endpoint: ENDPOINT,
        rpc: rpc2,
        expectedNetworkId: "testnet-10",
        requiredCapabilities: ["hasUtxoIndex"],
        now: FIXED_NOW
      })
    ).rejects.toMatchObject({ reason: "MISSING_CAPABILITY" });
  });

  it("wraps a raw RPC failure on getServerInfo as RPC_ERROR", async () => {
    const rpc = fakeRpc({ serverInfoImpl: async () => { throw new Error("boom"); } });
    await expect(
      probeRemoteTestnet({ endpoint: ENDPOINT, rpc, expectedNetworkId: "testnet-10", now: FIXED_NOW })
    ).rejects.toMatchObject({ reason: "RPC_ERROR" });
  });

  it("wraps a raw RPC failure on getBlockDagInfo as RPC_ERROR (after network + sync passed)", async () => {
    const rpc = fakeRpc({ dagInfoImpl: async () => { throw new Error("dag boom"); } });
    await expect(
      probeRemoteTestnet({ endpoint: ENDPOINT, rpc, expectedNetworkId: "testnet-10", now: FIXED_NOW })
    ).rejects.toMatchObject({ reason: "RPC_ERROR" });
  });
});

describe("assertRemoteTestnetOrFailClosed", () => {
  const base: RemoteTestnetAuthority = {
    authorityKind: "REMOTE_TESTNET_NODE",
    endpoint: ENDPOINT,
    observedAt: "2026-09-15T12:00:00.000Z",
    network: { expected: "testnet-10", observed: "testnet-10" },
    serverVersion: "0.16.0",
    rpcApiVersion: 1,
    isSynced: true,
    hasUtxoIndex: true,
    virtualDaaScore: 12345n,
    capabilities: { getNetworkParams: true, getFeeEstimate: true, hasUtxoIndex: true },
    probeHashes: {
      getServerInfo: "a".repeat(64),
      getBlockDagInfo: "b".repeat(64)
    }
  };

  it("passes for a matching, synced authority", () => {
    // If this throws, the test fails naturally — no `.not.toThrow` needed.
    assertRemoteTestnetOrFailClosed(base, "testnet-10");
  });

  it("throws NETWORK_MISMATCH when observed does not match expected", () => {
    expect(() => assertRemoteTestnetOrFailClosed(base, "mainnet"))
      .toThrow(/Network mismatch on cached authority/);
  });

  it("throws UNSYNCED when the cached authority is not synced", () => {
    const stale = { ...base, isSynced: false };
    expect(() => assertRemoteTestnetOrFailClosed(stale, "testnet-10"))
      .toThrow(/marks isSynced=false/);
  });
});
