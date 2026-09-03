import { describe, it, expect } from "vitest";
import { mapKaspaNodeInfo, RpcError } from "../src/index.js";
import { KaspaJsonRpcClient } from "../src/json-rpc-client.js";

describe("QF-004: Kaspa Node Info RPC Mapping & Enriched Merging", () => {
  it("mapKaspaNodeInfo maps native getInfo response fields cleanly", () => {
    const rawGetInfoResponse = {
      serverVersion: "0.13.0",
      isSynced: true,
      isUtxoIndexed: true,
      p2pId: "peer-abc-123",
      mempoolSize: 42
    };

    const mapped = mapKaspaNodeInfo(rawGetInfoResponse);
    expect(mapped.serverVersion).toBe("0.13.0");
    expect(mapped.isSynced).toBe(true);
    expect(mapped.mempoolSize).toBe(42);
    expect(mapped.networkId).toBeUndefined(); // Upstream getInfo does not have networkId!
  });

  it("mapKaspaNodeInfo maps network_id if present in snake_case or camelCase", () => {
    const rawWithNetwork = {
      server_version: "0.14.0",
      network_id: "simnet",
      is_synced: true
    };

    const mapped = mapKaspaNodeInfo(rawWithNetwork);
    expect(mapped.serverVersion).toBe("0.14.0");
    expect(mapped.networkId).toBe("simnet");
  });

  it("QF-004: REAL KaspaJsonRpcClient.getInfo() enriches networkId from getServerInfo with exactly 1 call and preserves native field precedence", async () => {
    const client = new KaspaJsonRpcClient("http://127.0.0.1:16210");
    let getServerInfoCallCount = 0;

    // Intercept internal callRpc method on the REAL production class
    (client as any).callRpc = async (method: string) => {
      if (method === "getInfoRequest") {
        return {
          serverVersion: "2.0.1",
          isSynced: true,
          isUtxoIndexed: true,
          p2pId: "peer-native-123",
          mempoolSize: 10
          // networkId is absent in native GetInfoResponseMessage
        };
      }
      if (method === "getServerInfoRequest") {
        getServerInfoCallCount++;
        return {
          networkId: "simnet",
          serverVersion: "CONFLICTING-SERVER-INFO-VERSION-9.9.9", // Native precedence guardrail!
          isSynced: false
        };
      }
      if (method === "getBlockDagInfoRequest") {
        return {
          networkId: "simnet",
          virtualDaaScore: "12345",
          tipHashes: ["hash1"]
        };
      }
      throw new Error(`Unexpected callRpc method: ${method}`);
    };

    // Execute real production method
    const info = await client.getInfo();

    // 1. Authoritative networkId enrichment verified
    expect(info.networkId).toBe("simnet");

    // 2. Best-effort virtualDaaScore enrichment verified
    expect(info.virtualDaaScore).toBe(12345n);

    // 3. Native field precedence guardrail verified (native value preserved, NOT overwritten)
    expect(info.serverVersion).toBe("2.0.1");
    expect(info.isSynced).toBe(true);

    // 4. Exactly 1 getServerInfo call executed
    expect(getServerInfoCallCount).toBe(1);
  });

  it("QF-004: REAL KaspaJsonRpcClient.getInfo() throws typed RpcError if getServerInfo enrichment fails when networkId is missing", async () => {
    const client = new KaspaJsonRpcClient("http://127.0.0.1:16210");

    (client as any).callRpc = async (method: string) => {
      if (method === "getInfoRequest") {
        return {
          serverVersion: "2.0.1",
          isSynced: true
        };
      }
      if (method === "getServerInfoRequest") {
        throw new Error("Connection timed out");
      }
      throw new Error(`Unexpected method: ${method}`);
    };

    await expect(client.getInfo()).rejects.toThrow(RpcError);
    await expect(client.getInfo()).rejects.toThrow("Failed to enrich authoritative networkId from getServerInfo");
  });
});
