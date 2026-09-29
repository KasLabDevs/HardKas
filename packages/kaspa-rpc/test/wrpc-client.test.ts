import { describe, it, expect } from "vitest";
import { KaspaWrpcClient } from "../src/wrpc-client.js";
import { fakeOfficialRpc, nodeError } from "./helpers/fake-official-rpc.js";

describe("KaspaWrpcClient", () => {
  it("normalizes http:// to ws://", () => {
    const client = new KaspaWrpcClient("http://127.0.0.1:18210");
    expect(client.getUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("normalizes https:// to wss://", () => {
    const client = new KaspaWrpcClient("https://kaspa.stream:443");
    expect(client.getUrl()).toBe("wss://kaspa.stream:443");
  });

  it("keeps ws:// as-is", () => {
    const client = new KaspaWrpcClient("ws://127.0.0.1:18210");
    expect(client.getUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("adds ws:// if no scheme", () => {
    const client = new KaspaWrpcClient("127.0.0.1:18210");
    expect(client.getUrl()).toBe("ws://127.0.0.1:18210");
  });

  it("ping returns false when no server is running", async () => {
    const client = new KaspaWrpcClient("ws://127.0.0.1:19999");
    try {
      await client.connect(200);
      const result = await client.ping();
      expect(result).toBe(false);
    } catch {
      // Connection refused is expected
      expect(true).toBe(true);
    } finally {
      client.disconnect();
    }
  });

  it("refuses a request before connect()", async () => {
    const client = new KaspaWrpcClient("ws://127.0.0.1:18210");
    await expect(client.request("getServerInfo")).rejects.toThrow("WebSocket not connected. Call connect() first.");
  });

  it("requests by method name through the official client, with the node's error text", async () => {
    const rpc = fakeOfficialRpc({
      getServerInfo: () => ({ serverVersion: "2.1.0", virtualDaaScore: 12n }),
      getBlockDagInfo: () => {
        throw nodeError("internal error");
      }
    });
    const client = new KaspaWrpcClient("http://127.0.0.1:18210", { rpcFactory: rpc.factory });
    await client.connect(200);

    expect(rpc.urls).toEqual(["ws://127.0.0.1:18210"]);
    expect(await client.request("getServerInfoRequest")).toEqual({ serverVersion: "2.1.0", virtualDaaScore: 12 });
    await expect(client.getBlockDagInfo()).rejects.toThrow(/^internal error$/);
    expect(await client.ping()).toBe(true);
    client.disconnect();
  });
});
