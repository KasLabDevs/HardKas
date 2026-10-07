import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// `hardkas rpc info|dag|utxos|mempool`: the node's answers printed as text or JSON.
// The client is a stand-in (no network); what is under test is the command surface.
const node = vi.hoisted(() => ({ fail: false, urls: [] as string[], closed: 0 }));
const TX_IN_MEMPOOL = "dd".repeat(32);

vi.mock("@hardkas/kaspa-rpc", async (importOriginal) => {
  const real: any = await importOriginal();
  class StandInClient {
    constructor(options: { rpcUrl: string }) {
      node.urls.push(options.rpcUrl);
    }
    private down() {
      if (node.fail) {
        throw new real.RpcConnectionError(
          "Cannot connect to Kaspa RPC at ws://127.0.0.1:18210. Is kaspad running with --rpclisten-json? (wRPC -> WebSocket -> Unable to connect)"
        );
      }
    }
    async getServerInfo() {
      this.down();
      return { networkId: "simnet", serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true, virtualDaaScore: 5206n };
    }
    async getBlockDagInfo() {
      this.down();
      return { networkId: "simnet", virtualDaaScore: 5206n, tipHashes: ["aa".repeat(32), "ab".repeat(32)], virtualParentHashes: [], sink: "bb".repeat(32) };
    }
    async getUtxosByAddress(address: string) {
      this.down();
      return [
        {
          outpoint: { transactionId: "cc".repeat(32), index: 1 },
          address,
          amountSompi: 5_000_000_000n,
          scriptPublicKey: "000020aa",
          blockDaaScore: 1538,
          isCoinbase: true,
          raw: { utxoEntry: {} }
        }
      ];
    }
    async call(method: string, params: any) {
      this.down();
      if (method === "getMempoolEntry" && params.transactionId === TX_IN_MEMPOOL) {
        return { mempoolEntry: { fee: 2036, isOrphan: false, transaction: {} } };
      }
      throw new real.RpcNotFoundError(`Transaction ${params.transactionId} not found`);
    }
    async getMempoolEntries() {
      this.down();
      return { mempoolEntries: [{ fee: 2036, isOrphan: false, transaction: { verboseData: { transactionId: TX_IN_MEMPOOL } } }] };
    }
    async close() {
      node.closed++;
    }
  }
  return { ...real, JsonWrpcKaspaClient: StandInClient };
});

import { registerRpcCommands } from "../src/commands/rpc.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

async function hardkas(args: string[], mode: "human" | "json" = "human") {
  let stdout = "";
  let stderr = "";
  setGlobalOutput(
    createCommandOutput({ mode, stdout: { write: (m: string) => void (stdout += m) }, stderr: { write: (m: string) => void (stderr += m) } })
  );
  const program = new Command();
  program.exitOverride();
  registerRpcCommands(program);
  let error: unknown;
  try {
    await program.parseAsync(["node", "hardkas", "rpc", ...args]);
  } catch (e) {
    error = e;
  }
  return { stdout, stderr, error };
}

beforeEach(() => {
  node.fail = false;
  node.urls.length = 0;
  node.closed = 0;
});

describe("hardkas rpc info", () => {
  it("prints the node's network, version, sync, UTXO index and virtual DAA from the canonical localnet", async () => {
    const r = await hardkas(["info"]);
    expect(r.error).toBeUndefined();
    expect(node.urls).toEqual(["ws://127.0.0.1:18210"]);
    expect(r.stdout).toContain("Network:      simnet");
    expect(r.stdout).toContain("Version:      2.1.0");
    expect(r.stdout).toContain("Synced:       yes");
    expect(r.stdout).toContain("UTXO index:   yes");
    expect(r.stdout).toContain("Virtual DAA:  5206");
    expect(node.closed).toBe(1);
  });

  it("--json writes the server info", async () => {
    const r = await hardkas(["info", "--json"], "json");
    expect(JSON.parse(r.stdout)).toEqual({
      ok: true,
      url: "ws://127.0.0.1:18210",
      info: { networkId: "simnet", serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true, virtualDaaScore: "5206" }
    });
  });

  it("an unreachable node prints the reason and fails the command", async () => {
    node.fail = true;
    const r = await hardkas(["info"]);
    expect(r.stdout).toContain("Status:   unreachable");
    expect(r.stdout).toContain("Cannot connect to Kaspa RPC at ws://127.0.0.1:18210");
    // CLI-RUNTIME-CONTRACT-1: the verdict is typed (RPC_INFO_UNAVAILABLE), no longer an untyped "Command failed".
    expect((r.error as any)?.code).toBe("RPC_INFO_UNAVAILABLE");
    expect(String((r.error as Error)?.message)).toContain("did not answer");
    const j = await hardkas(["info", "--json"], "json");
    expect(JSON.parse(j.stdout)).toMatchObject({ ok: false, code: "RPC_INFO_UNAVAILABLE", url: "ws://127.0.0.1:18210" });
    expect((j.error as any)?.code).toBe("RPC_INFO_UNAVAILABLE");
  });
});

describe("hardkas rpc dag", () => {
  it("prints network, virtual DAA, sink and tips from the node given by --url", async () => {
    const r = await hardkas(["dag", "--url", "ws://10.0.0.5:18110"]);
    expect(r.error).toBeUndefined();
    expect(node.urls).toEqual(["ws://10.0.0.5:18110"]);
    expect(r.stdout).toContain("Network:        simnet");
    expect(r.stdout).toContain("Virtual DAA:    5206");
    expect(r.stdout).toContain(`Sink:           ${"bb".repeat(32)}`);
    expect(r.stdout).toContain("Tips:           2");
    expect(node.closed).toBe(1);
  });

  it("an unreachable node fails the command with the connection error", async () => {
    node.fail = true;
    const r = await hardkas(["dag"]);
    expect(String((r.error as Error)?.message)).toContain("Cannot connect to Kaspa RPC");
    expect(node.closed).toBe(1);
  });
});

describe("hardkas rpc utxos", () => {
  it("lists the address's UTXOs and their total", async () => {
    const r = await hardkas(["utxos", "kaspasim:qexample"]);
    expect(r.stdout).toContain("Found: 1 UTXO(s)");
    expect(r.stdout).toContain(`${"cc".repeat(32)}:1`);
    expect(r.stdout).toContain("Total balance: 50 KAS");
  });

  it("--json writes the UTXOs without the raw node entry", async () => {
    const r = await hardkas(["utxos", "kaspasim:qexample", "--json"], "json");
    const out = JSON.parse(r.stdout);
    expect(out.totalSompi).toBe("5000000000");
    expect(out.utxos).toEqual([
      {
        outpoint: { transactionId: "cc".repeat(32), index: 1 },
        address: "kaspasim:qexample",
        amountSompi: "5000000000",
        scriptPublicKey: "000020aa",
        blockDaaScore: 1538,
        isCoinbase: true
      }
    ]);
  });
});

describe("hardkas rpc mempool", () => {
  it("finds a transaction the node holds, with its fee", async () => {
    const r = await hardkas(["mempool", TX_IN_MEMPOOL]);
    expect(r.stdout).toContain("Status:   in the mempool");
    expect(r.stdout).toContain("Fee:      2036 sompi");
  });

  it("reports a transaction the node does not hold", async () => {
    const r = await hardkas(["mempool", "ee".repeat(32)]);
    expect(r.error).toBeUndefined();
    expect(r.stdout).toContain("Status:   not in the mempool");
    const j = await hardkas(["mempool", "ee".repeat(32), "--json"], "json");
    expect(JSON.parse(j.stdout)).toEqual({ url: "ws://127.0.0.1:18210", txId: "ee".repeat(32), entry: null });
  });

  it("without a txId, lists what the mempool holds", async () => {
    const r = await hardkas(["mempool"]);
    expect(r.stdout).toContain("Entries:  1");
    expect(r.stdout).toContain(`${TX_IN_MEMPOOL}  fee 2036 sompi`);
    const j = await hardkas(["mempool", "--json"], "json");
    expect(JSON.parse(j.stdout)).toEqual({
      url: "ws://127.0.0.1:18210",
      entries: [{ txId: TX_IN_MEMPOOL, feeSompi: "2036", isOrphan: false }]
    });
  });
});
