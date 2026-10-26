import { describe, it, expect, vi } from "vitest";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { KaspaWrpcClient } from "../src/wrpc-client.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

vi.setConfig({ testTimeout: 15_000 });

// -----------------------------------------------------------------------------
// V1-ENGINE · found by the CLI end-to-end run on a real simnet node (26-oct-2026): for a ws:// endpoint `hardkas tx send`
// hands the SDK a KaspaWrpcClient, and the F1.6 send of a v1 transaction reads its inputs (getUtxosByAddress) and the
// mempool's pending spends (getMempoolEntriesByAddresses) through the client it holds. KaspaWrpcClient had neither, so the
// send refused (V1_PREFLIGHT_FAILED, nothing sent or recorded). Both now exist and give, for the same node answer, what
// JsonWrpcKaspaClient gives (the covenant id the node lists kept). In-process stand-in of the official client: no network.
// -----------------------------------------------------------------------------

const SPK = "20" + "aa".repeat(32) + "ac";
const ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const COVENANT_ID = "cd".repeat(32);
const url = "ws://127.0.0.1:29210";

function node() {
  return fakeOfficialRpc({
    getServerInfo: () => ({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true }),
    getBlockDagInfo: () => ({ network: "simnet", virtualDaaScore: 1000n }),
    getUtxosByAddresses: (req: any) => ({
      entries: req.addresses.flatMap((address: string) => [
        // as the node's wRPC JSON gives them: the script public key as version (4 hex) + script
        { address, outpoint: { transactionId: "11".repeat(32), index: 0 }, utxoEntry: { amount: 5_000_000_000, scriptPublicKey: `0000${SPK}`, blockDaaScore: 900, isCoinbase: false, covenantId: COVENANT_ID } },
        { address, outpoint: { transactionId: "22".repeat(32), index: 1 }, utxoEntry: { amount: 7, scriptPublicKey: `0000${SPK}`, blockDaaScore: 901, isCoinbase: true } }
      ])
    }),
    getMempoolEntriesByAddresses: (req: any) => ({
      entries: req.addresses.map((address: string) => ({
        address,
        sending: [{ transaction: { inputs: [{ previousOutpoint: { transactionId: "33".repeat(32), index: 2 } }] } }],
        receiving: []
      }))
    })
  });
}

async function clients() {
  const a = node();
  const b = node();
  const json = new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: a.factory, expectedNetworkId: "simnet" } as any);
  const wrpc = new KaspaWrpcClient(url, { rpcFactory: b.factory, expectedNetworkId: "simnet" });
  await wrpc.connect();
  return { json, wrpc, a, b };
}

describe("V1-ENGINE · KaspaWrpcClient reads what the F1.6 v1 send reads", () => {
  it("WR-1 it has getUtxosByAddress and getMempoolEntriesByAddresses (the send's input and pending-spend reads)", () => {
    expect(typeof (KaspaWrpcClient.prototype as any).getUtxosByAddress).toBe("function");
    expect(typeof (KaspaWrpcClient.prototype as any).getMempoolEntriesByAddresses).toBe("function");
  });

  it("WR-2 getUtxosByAddress: the same UTXOs as JsonWrpcKaspaClient for the same node answer, covenant id kept", async () => {
    const { json, wrpc } = await clients();
    try {
      const viaJson = await json.getUtxosByAddress(ADDRESS);
      const viaWrpc = await (wrpc as any).getUtxosByAddress(ADDRESS);
      expect(viaWrpc).toEqual(viaJson);
      expect(viaWrpc.map((u: any) => [u.outpoint, u.amountSompi, u.scriptPublicKey, u.covenantId])).toEqual([
        [{ transactionId: "11".repeat(32), index: 0 }, 5_000_000_000n, `0000${SPK}`, COVENANT_ID],
        [{ transactionId: "22".repeat(32), index: 1 }, 7n, `0000${SPK}`, undefined]
      ]);
    } finally {
      await wrpc.disconnect();
      await (json as any).close?.();
    }
  });

  it("WR-3 getMempoolEntriesByAddresses: the node's answer, as JsonWrpcKaspaClient gives it, for the request the caller made", async () => {
    const { json, wrpc, a, b } = await clients();
    try {
      const request = { addresses: [ADDRESS], includeOrphanPool: false, filterTransactionPool: false };
      const viaJson = await json.getMempoolEntriesByAddresses(request);
      const viaWrpc = await (wrpc as any).getMempoolEntriesByAddresses(request);
      expect(viaWrpc).toEqual(viaJson);
      expect(viaWrpc.entries[0].sending[0].transaction.inputs[0].previousOutpoint).toEqual({ transactionId: "33".repeat(32), index: 2 });
      expect(b.calls.find((c) => c.method === "getMempoolEntriesByAddresses")?.request).toEqual(a.calls.find((c) => c.method === "getMempoolEntriesByAddresses")?.request);
    } finally {
      await wrpc.disconnect();
      await (json as any).close?.();
    }
  });
});
