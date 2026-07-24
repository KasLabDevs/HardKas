import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SimnetNodeHarness, SimnetNodeHandle } from "../../testing/src/simnet-node-harness.js";
import { SimnetFixtureGenerator, SimnetFixture } from "../../testing/src/simnet-fixture.js";
import { ReadRpcClientImpl } from "../src/clients/read-rpc-client.js";
import { JsonWrpcTransport } from "../src/transport/json-wrpc-transport.js";
import { RpcNotFoundError, RpcTimeoutError } from "../src/errors.js";

describe("ReadRpcClient (Simnet Certification)", () => {
  let node: SimnetNodeHandle;
  let fixture: SimnetFixture;
  let client: ReadRpcClientImpl;
  let transport: JsonWrpcTransport;

  beforeAll(async () => {
    const externalUrl = process.env.KASPA_SIMNET_WRPC_URL;
    if (externalUrl) {
      node = await SimnetNodeHarness.attach(externalUrl);
    } else {
      // In CI, KASPAD_BIN will be set, or docker will be used
      node = await SimnetNodeHarness.start({ utxoIndex: true });
    }
    await node.waitUntilReady();

    fixture = await SimnetFixtureGenerator.generate(node.rpcUrl);
    transport = new JsonWrpcTransport({ url: node.rpcUrl.replace("ws://", "http://").replace("wss://", "https://") });
    client = new ReadRpcClientImpl(transport);
  }, 60000); // 60s timeout for node startup

  afterAll(async () => {
    await transport.close();
    if (node) {
      await node.stop();
    }
  });

  describe("Fidelity (Happy Paths)", () => {
    it("should retrieve getBlockCount returning a bigint", async () => {
      const response = await client.getBlockCount();
      expect(response).toBeDefined();
      expect(typeof response.blockCount).toBe("bigint");
      expect(response.blockCount).toBeGreaterThanOrEqual(1n);
    });

    it("should get getCurrentNetwork correctly", async () => {
      const response = await client.getCurrentNetwork();
      expect(response).toBeDefined();
      expect(response.network).toContain("simnet");
    });

    it("should retrieve genesis block exactly using getBlock", async () => {
      if (!fixture.genesisHash) return;
      const response = await client.getBlock({ hash: fixture.genesisHash, includeTransactions: false });
      expect(response).toBeDefined();
      expect(response.block).toBeDefined();
      expect(response.block.header.hashMerkleRoot).toBeDefined();
      // Transacciones no fueron solicitadas
      expect(response.block.transactions).toBeUndefined(); // Podria ser vacio, pero en la request pedimos false
    });

    it("should return empty arrays for getBlocks when lowHash is current tip", async () => {
      const tip = await client.getSelectedTipHash();
      const response = await client.getBlocks({ lowHash: tip.selectedTipHash, includeBlocks: true, includeTransactions: true });
      expect(response).toBeDefined();
      expect(response.blockHashes).toEqual([]);
      expect(response.blocks).toEqual([]);
    });
  });

  describe("Error Handling (Negative Paths)", () => {
    it("should throw error when getBlock receives a malformed hash", async () => {
      await expect(client.getBlock({ hash: "invalid-hash", includeTransactions: false }))
        .rejects.toThrowError(/hash/i); // Expects validation error from node
    });

    it("should throw RpcNotFoundError or node specific error for non-existent hash", async () => {
      const dummyHash = "0000000000000000000000000000000000000000000000000000000000000000";
      await expect(client.getBlock({ hash: dummyHash, includeTransactions: false }))
        .rejects.toThrowError(); 
    });
  });

  describe("Lifecycle (Timeouts & Cancellation)", () => {
    it("should abort request using AbortSignal", async () => {
      const abort = new AbortController();
      abort.abort();
      
      await expect(client.getBlockCount({ signal: abort.signal }))
        .rejects.toThrow(RpcTimeoutError); // Or generic abort error
    });

    it("should timeout if timeoutMs is exceeded", async () => {
      // Usamos un timeout irrealmente bajo para forzar el fallo localmente
      await expect(client.getBlockCount({ timeoutMs: 1 }))
        .rejects.toThrow(RpcTimeoutError);
    });
  });
});
