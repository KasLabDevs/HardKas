import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// AUD-16 (reproduced live 2026-10-03): `localnet fund` mined to the recipient, then stopped the miner so it could read
// a settled DAG — and left the localnet with no miner at all: no new blocks, so every transaction sent afterwards
// stayed MEMPOOL_ACCEPTED forever. FUND-LIVENESS-1: after a completed `fund` the localnet keeps producing blocks
// without user intervention, unless a stopped chain was explicitly requested (--stop-miner); and the miner that keeps
// it alive never keeps rewarding the funded account. Docker, the node and the SDK are doubles here: what is pinned is
// the miner lifecycle `fund` drives, in order.

const h = vi.hoisted(() => ({
  log: [] as Array<{ kind: "docker"; args: string[] } | { kind: "funding-state-read" }>,
  RECIPIENT: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn",
  fundingReads: 0
}));

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    h.log.push({ kind: "docker", args: [...args] });
    if (args[0] === "inspect") return { stdout: "running|kaspanet/cpuminer@sha256:test|/hardkas-toccata-miner" };
    return { stdout: "" };
  })
}));
vi.mock("@hardkas/node-runner", () => ({
  requireNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  verifyNodeIdentity: vi.fn(async () => ({ verified: true, problems: [] })),
  DockerKaspadRunner: class {}
}));
vi.mock("@hardkas/config", async (orig) => ({ ...(await orig<any>()), loadHardkasConfig: vi.fn(async () => ({ config: {} })) }));
vi.mock("@hardkas/accounts", async (orig) => ({
  ...(await orig<any>()),
  resolveHardkasAccount: vi.fn(() => ({ name: "alice", kind: "kaspa", network: "simnet", address: h.RECIPIENT }))
}));
// The node as `fund` reads it: before funding the account is empty, afterwards it holds a mature coinbase output.
const matureUtxo = { outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 200_000_000_000n, isCoinbase: true, blockDaaScore: 100n };
vi.mock("@hardkas/kaspa-rpc", async (orig) => ({
  ...(await orig<any>()),
  JsonWrpcKaspaClient: class {
    async getInfo() { h.log.push({ kind: "funding-state-read" }); return { virtualDaaScore: 5000n }; }
    async getUtxosByAddress() { return h.fundingReads++ === 0 ? [] : [matureUtxo]; }
    async close() {}
  }
}));
// The SDK `fund` drives: funding completes, and the settle phase sees a frozen DAG with the funds spendable.
vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn(async () => ({
      utxos: { waitForSpendableFunding: vi.fn(async () => ({})) },
      rpc: {
        getBlockDagInfo: async () => ({ virtualDaaScore: 5000n, virtualParentHashes: ["aa"], sink: "bb" }),
        getUtxosByAddress: async () => [matureUtxo]
      },
      close: vi.fn(async () => {})
    }))
  }
}));

import { runLocalnetFund } from "../src/runners/localnet-runners.js";
import { setGlobalOutput } from "../src/output.js";
import { loadKaspaWasm } from "@hardkas/accounts";

const MINER = "hardkas-toccata-miner";
let neutral: { address: string; script: string };
let printed: string[];

beforeAll(async () => {
  const k = await loadKaspaWasm();
  const redeem = new k.ScriptBuilder().addOp(k.Opcodes.OpReturn).toString();
  const spk = k.payToScriptHashScript(redeem);
  neutral = { address: k.addressFromScriptPublicKey(spk, "simnet").toString(), script: String(spk.script) };
});

beforeEach(() => {
  h.log.length = 0;
  h.fundingReads = 0;
  printed = [];
  // writeJson as the real renderer does it (bigint values become strings): fund's result goes through writeJson
  setGlobalOutput({
    writeLine: (s: string) => printed.push(s),
    writeJson: (o: unknown) => printed.push(JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))
  } as any);
});

/** The miner's lifecycle in order: `run` (with its -a reward address) and `stop`, plus the post-funding settled read. */
const lifecycle = () =>
  h.log.flatMap((e) => {
    if (e.kind === "funding-state-read") return ["read"];
    const a = e.args;
    if (a[0] === "run" && a.includes(MINER)) return [`run:${a[a.indexOf("-a") + 1]}`];
    if (a[0] === "stop" && a.includes(MINER)) return ["stop"];
    return [];
  });

describe("AUD-16 · FUND-LIVENESS-1: the localnet keeps producing blocks after `localnet fund`", () => {
  it("default: mine to the recipient → stop → settled result → a liveness miner rewarding an address nobody controls", async () => {
    await runLocalnetFund({ identifier: "alice", amountSompi: 100_000_000_000n, json: true });
    const steps = lifecycle();
    // the funding phase is unchanged: the recipient is mined to, the miner is stopped, the settled state is read
    expect(steps.slice(0, 3)).toEqual(["read", `run:${h.RECIPIENT}`, "stop"]);
    // ...and only after the stable result was measured does a miner start again — never for the recipient
    expect(steps.at(-1)).toBe(`run:${neutral.address}`);
    expect(steps.lastIndexOf("read")).toBeLessThan(steps.lastIndexOf(`run:${neutral.address}`));
    expect(neutral.address).not.toBe(h.RECIPIENT);
    // P2SH of the one-byte script OP_RETURN: spending it means executing OP_RETURN, which always fails
    expect(neutral.script).toMatch(/^aa20[0-9a-f]{64}87$/);
    const payload = JSON.parse(printed.at(-1)!);
    expect(payload.status).toBe("TOCCATA_ACCOUNT_FUNDED");
    expect(payload.minerRewardAddress).toBe(neutral.address);
  });

  it("--stop-miner: the explicit frozen chain — mine to the recipient, stop, and nothing restarts", async () => {
    await runLocalnetFund({ identifier: "alice", amountSompi: 100_000_000_000n, json: true, stopMiner: true } as any);
    const steps = lifecycle();
    expect(steps.filter((s) => s.startsWith("run:"))).toEqual([`run:${h.RECIPIENT}`]);
    expect(steps.at(-1)).toBe("read");
    expect(steps).toContain("stop");
  });

  it("--keep-miner keeps its meaning: the recipient's miner is never stopped and no other miner starts", async () => {
    await runLocalnetFund({ identifier: "alice", amountSompi: 100_000_000_000n, json: true, keepMiner: true });
    const steps = lifecycle();
    expect(steps.filter((s) => s.startsWith("run:"))).toEqual([`run:${h.RECIPIENT}`]);
    expect(steps).not.toContain("stop");
  });

  it("--keep-miner with --stop-miner is refused before anything is mined", async () => {
    await expect(runLocalnetFund({ identifier: "alice", json: true, keepMiner: true, stopMiner: true } as any)).rejects.toMatchObject({ code: "LOCALNET_FUND_MINER_FLAGS_CONFLICT" });
    expect(lifecycle().filter((s) => s.startsWith("run:"))).toEqual([]);
  });
});
