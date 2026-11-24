import { describe, it, expect, vi, beforeEach } from "vitest";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// RPC-RESPONSE-TOO-LARGE-1 · LFU option E (warn; the meaning of --keep-miner unchanged): `localnet fund --keep-miner`
// leaves the miner paying the funded account, about one coinbase UTXO per block. HardKAS reads at most about 277,000
// UTXOs of one address (100 MiB per RPC message), which the default miner throttle reaches in about 2 hours; past it,
// the commands that read the account's UTXO list fail with RPC_RESPONSE_TOO_LARGE. The human output now says so; the
// JSON payload is unchanged. Docker, the node and the SDK are doubles (as in aud16-fund-liveness.test.ts).

const h = vi.hoisted(() => ({ RECIPIENT: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn", fundingReads: 0 }));

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    if (args[0] === "inspect") return { stdout: "running|kaspanet/cpuminer@sha256:test|/hardkas-toccata-miner" };
    return { stdout: "" };
  })
}));
vi.mock("@hardkas/node-runner", () => ({
  requireNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  verifyNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  DockerKaspadRunner: class {},
  DOCKER_PROBE_TIMEOUT_MS: 20_000
}));
vi.mock("@hardkas/config", async (orig) => ({ ...(await orig<any>()), loadHardkasConfig: vi.fn(async () => ({ config: {} })) }));
vi.mock("@hardkas/accounts", async (orig) => ({
  ...(await orig<any>()),
  resolveHardkasAccount: vi.fn(() => ({ name: "alice", kind: "kaspa", network: "simnet", address: h.RECIPIENT }))
}));
const sinkBlock = { block: { header: { daaScore: 100n, parentsByLevel: [["aa"]] }, transactions: [{ outputs: [] }], verboseData: { selectedParentHash: "aa" } } };
vi.mock("@hardkas/kaspa-rpc", async (orig) => ({
  ...(await orig<any>()),
  JsonWrpcKaspaClient: class {
    async getBlockDagInfo() {
      return { virtualDaaScore: 5000n, sink: "bb" };
    }
    async getBalanceByAddress() {
      return { balanceSompi: h.fundingReads++ === 0 ? 0n : 200_000_000_000n };
    }
    async call() {
      return sinkBlock;
    }
    async close() {}
  }
}));
vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn(async () => ({
      utxos: { waitForSpendableFunding: vi.fn(async () => ({})) },
      rpc: {
        getBlockDagInfo: async () => ({ virtualDaaScore: 5000n, virtualParentHashes: ["aa"], sink: "bb" }),
        getBalanceByAddress: async () => ({ balanceSompi: 200_000_000_000n }),
        call: async () => sinkBlock
      },
      close: vi.fn(async () => {})
    }))
  }
}));

import { KEEP_MINER_UTXO_GROWTH_WARNING, runLocalnetFund } from "../src/runners/localnet-runners.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

let stdout: string;
let stderr: string;
beforeEach(() => {
  h.fundingReads = 0;
  stdout = "";
  stderr = "";
});
const capture = (mode: "human" | "json") =>
  setGlobalOutput(createCommandOutput({ mode, stdout: { write: (m: string) => void (stdout += m) }, stderr: { write: (m: string) => void (stderr += m) } }));

describe("RPC-RESPONSE-TOO-LARGE-1 · `localnet fund --keep-miner` warns about UTXO growth and the read limit", () => {
  it("KM-1 the warning names the rate, the limit, the time and the code", () => {
    expect(KEEP_MINER_UTXO_GROWTH_WARNING).toMatch(/about one UTXO/);
    expect(KEEP_MINER_UTXO_GROWTH_WARNING).toMatch(/277,000 UTXOs/);
    expect(KEEP_MINER_UTXO_GROWTH_WARNING).toMatch(/100 MiB/);
    expect(KEEP_MINER_UTXO_GROWTH_WARNING).toMatch(/about 2 hours/);
    expect(KEEP_MINER_UTXO_GROWTH_WARNING).toMatch(/RPC_RESPONSE_TOO_LARGE/);
  });

  it("KM-2 human output with --keep-miner: the warning, on stderr", async () => {
    capture("human");
    await runLocalnetFund({ identifier: "alice", amountSompi: 100_000_000_000n, keepMiner: true });
    expect(stdout + stderr).toMatch(/still mining to this account/);
    expect(stderr).toContain("every block mined to this account adds about one UTXO");
  });

  it("KM-3 without --keep-miner, and with --json: no warning (the JSON payload unchanged)", async () => {
    capture("human");
    await runLocalnetFund({ identifier: "alice", amountSompi: 100_000_000_000n });
    expect(stdout + stderr).not.toContain("adds about one UTXO");
    stdout = "";
    stderr = "";
    h.fundingReads = 0;
    capture("json");
    await runLocalnetFund({ identifier: "alice", amountSompi: 100_000_000_000n, json: true, keepMiner: true });
    expect(stdout + stderr).not.toContain("adds about one UTXO");
    expect(JSON.parse(stdout).status).toBe("TOCCATA_ACCOUNT_FUNDED");
  });
});
