import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getHardkasHome, nodeRpcUrl } from "@hardkas/core";

// The wiring of `localnet seed` / `localnet fund --treasury` (runner level). Docker, the node identity, the planner, the
// signer and the node are doubles here; the money path itself (the real Generator and signer) is pinned by
// localnet-treasury-money-path.test.ts, and the failure paths by localnet-treasury-failures.test.ts.

const TREASURY_ADDRESS = "kaspasim:qqtreasury000000000000000000000000000000000000000000000000000";
const DEV_ACCOUNTS = [
  { name: "alice", address: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn" },
  { name: "bob", address: "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980" },
  { name: "carol", address: "kaspasim:qqngk9jxxnkhcxpa8w2np5cnvl5v7ke0nx89g4hvgegmrd4awlyts3wxy0770" },
  { name: "dave", address: "kaspasim:qq49jccu6feeazyfwqz7sjhkzqcn7f74swvcjcde5khnvtdfn7x2zzzaystaj" },
  { name: "erin", address: "kaspasim:qrj0cc3yrdhajhncal833a8rsqv8q758sa647w7dpwnqdfm8696gslkrvdw5l" }
];

const h = vi.hoisted(() => ({
  minerCalls: [] as string[],
  balances: new Map<string, bigint>(),
  utxosByAddr: new Map<string, any[]>(),
  virtualDaaScore: 2_000n,
  submittedTxs: [] as Array<{ rawTransaction: string; expectedTxId?: string }>,
  planCalls: [] as Array<{ outputs: Array<{ address: string; amountSompi: bigint }>; utxos: any[] }>,
  observedLivenessAddr: "",
  clients: [] as Array<{ rpcUrl: string; expectedNetworkId?: string }>,
  identityChecks: 0
}));

vi.mock("execa", () => ({
  execa: vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "docker") return { stdout: "", stderr: "" };
    if (args[0] === "rm" || args[0] === "stop") {
      h.minerCalls.push(`${args[0]}:${args[args.length - 1]}`);
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "run") {
      const addrIdx = args.indexOf("-a");
      const target = addrIdx >= 0 ? (args[addrIdx + 1] ?? "") : "";
      h.minerCalls.push(`run:${target}`);
      if (target === TREASURY_ADDRESS) {
        h.balances.set(TREASURY_ADDRESS, 2_000n * 100_000_000n);
        h.utxosByAddr.set(TREASURY_ADDRESS, [
          {
            outpoint: { transactionId: "aa".repeat(32), index: 0 },
            address: TREASURY_ADDRESS,
            amountSompi: 2_000n * 100_000_000n,
            scriptPublicKey: "0000",
            blockDaaScore: 100n,
            isCoinbase: true
          }
        ]);
      } else if (target !== TREASURY_ADDRESS && h.submittedTxs.length > 0) {
        h.observedLivenessAddr = target;
        const lastPlan = h.planCalls[h.planCalls.length - 1];
        if (lastPlan) {
          for (const out of lastPlan.outputs) {
            h.balances.set(out.address, (h.balances.get(out.address) ?? 0n) + out.amountSompi);
          }
        }
      }
      return { stdout: "miner-id", stderr: "" };
    }
    if (args[0] === "inspect") {
      const running = h.minerCalls[h.minerCalls.length - 1]?.startsWith("run:") ?? false;
      return { stdout: running ? "running" : "exited", stderr: "" };
    }
    if (args[0] === "images") return { stdout: "repo/img", stderr: "" };
    return { stdout: "", stderr: "" };
  })
}));

vi.mock("@hardkas/node-runner", async () => {
  const actual = await vi.importActual<any>("@hardkas/node-runner");
  return {
    ...actual,
    requireNodeIdentity: vi.fn(async () => {
      h.identityChecks++;
      return { verified: true, containerName: "hardkas-kaspad-toccata-v2" };
    })
  };
});

vi.mock("@hardkas/accounts", async () => {
  const actual = await vi.importActual<any>("@hardkas/accounts");
  return {
    ...actual,
    loadKaspaWasm: vi.fn(async () => ({
      ScriptBuilder: class {
        addOp() {
          return this;
        }
        toString() {
          return "6a";
        }
      },
      Opcodes: { OpReturn: 106 },
      payToScriptHashScript: () => ({ version: 0, script: "a914" + "00".repeat(20) + "87" }),
      addressFromScriptPublicKey: () => ({ toString: () => "kaspasim:pqlivenessburn00000000000000000000000000000000000000000000" })
    })),
    ensureDevAccounts: vi.fn(async () => undefined),
    listDevAccountsSync: vi.fn(() => DEV_ACCOUNTS),
    resolveHardkasAccount: vi.fn(({ nameOrAddress }: { nameOrAddress: string }) => {
      const dev = DEV_ACCOUNTS.find((d) => d.name === nameOrAddress || d.address === nameOrAddress);
      if (dev) return { name: dev.name, kind: "kaspa", network: "simnet", address: dev.address };
      throw new Error(`Unknown account: ${nameOrAddress}`);
    }),
    getLocalnetTreasuryAccount: vi.fn(() => ({
      name: "__localnet_treasury",
      kind: "kaspa",
      network: "simnet",
      address: TREASURY_ADDRESS,
      privateKey: "11".repeat(32),
      publicKey: "02" + "11".repeat(32)
    })),
    signTxPlanArtifact: vi.fn(async ({ planArtifact }: any) => ({
      schema: "hardkas.signedTx",
      txId: "ff".repeat(32),
      mode: "localnet",
      networkId: "simnet",
      from: planArtifact.from,
      to: planArtifact.to,
      amountSompi: planArtifact.amountSompi,
      signedTransaction: {
        format: "hex",
        payload: JSON.stringify({ txId: "ff".repeat(32), outputs: planArtifact.outputs }, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
      }
    }))
  };
});

vi.mock("@hardkas/tx-builder", async () => {
  const actual = await vi.importActual<any>("@hardkas/tx-builder");
  return {
    ...actual,
    planPaymentWithGenerator: vi.fn(async (req: any) => {
      h.planCalls.push({ outputs: req.outputs, utxos: req.utxos });
      const totalOut = req.outputs.reduce((s: bigint, o: any) => s + o.amountSompi, 0n);
      const totalIn = req.utxos.reduce((s: bigint, u: any) => s + u.amountSompi, 0n);
      const feeSompi = 50_000n;
      const changeSompi = totalIn - totalOut - feeSompi;
      return {
        inputs: req.utxos,
        outputs: req.outputs,
        change: { address: req.changeAddress, amountSompi: changeSompi },
        estimatedFeeSompi: feeSompi,
        estimatedMass: 2500n,
        version: 0
      };
    })
  };
});

vi.mock("@hardkas/kaspa-rpc", async () => {
  const actual = await vi.importActual<any>("@hardkas/kaspa-rpc");
  return {
    ...actual,
    JsonWrpcKaspaClient: class {
      constructor(options: { rpcUrl: string; expectedNetworkId?: string }) {
        h.clients.push({ rpcUrl: options.rpcUrl, ...(options.expectedNetworkId ? { expectedNetworkId: options.expectedNetworkId } : {}) });
      }
      async getBlockDagInfo() {
        return { virtualDaaScore: h.virtualDaaScore, sink: "11".repeat(32), virtualParentHashes: ["22".repeat(32)] };
      }
      async getInfo() {
        return { virtualDaaScore: h.virtualDaaScore };
      }
      async getBalanceByAddress(addr: string) {
        return { address: addr, balanceSompi: h.balances.get(addr) ?? 0n };
      }
      async getUtxosByAddress(addr: string) {
        return h.utxosByAddr.get(addr) ?? [];
      }
      async call(method: string) {
        if (method === "getBlock") {
          return {
            block: {
              header: { daaScore: "1", parentsByLevel: [[]] },
              verboseData: { selectedParentHash: "" },
              transactions: [{ outputs: [] }]
            }
          };
        }
        return {};
      }
      async submitTransaction(rawTransaction: string, opts?: any) {
        h.submittedTxs.push({ rawTransaction, expectedTxId: opts?.expectedTxId });
        return { accepted: true, transactionId: opts?.expectedTxId ?? "ff".repeat(32) };
      }
      async close() {}
    }
  };
});

// B7: the treasury never opens the SDK (whose client would follow a declared networks.simnet.rpcUrl)
vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn(async () => {
      throw new Error("the treasury path must not open an SDK instance");
    })
  }
}));

import { runLocalnetSeed, LOCALNET_TREASURY_PENDING_FILE } from "../src/runners/localnet-treasury.js";
import { runLocalnetFund } from "../src/runners/localnet-runners.js";

describe("localnet treasury seed and fast fund", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-seed-test-"));
    h.minerCalls.length = 0;
    h.balances.clear();
    h.utxosByAddr.clear();
    h.submittedTxs.length = 0;
    h.planCalls = [];
    h.virtualDaaScore = 2_000n;
    h.observedLivenessAddr = "";
    h.clients.length = 0;
    h.identityChecks = 0;
  });

  it(
    "mines to treasury once on empty chain, pays all 5 dev accounts 100 KAS in one 1->5 tx, and confirms via OP_RETURN miner",
    async () => {
      const result = await runLocalnetSeed({
        amountSompi: 100n * 100_000_000n,
        onlyEmpty: true,
        stopMiner: true,
        json: true,
        silentOutput: true,
        workspaceRoot: ws
      });

      expect(result.status).toBe("TOCCATA_ACCOUNTS_SEEDED");
      expect(result.txIds).toHaveLength(1);
      expect(h.planCalls).toHaveLength(1);
      expect(h.planCalls[0].outputs).toHaveLength(5);
      for (const out of h.planCalls[0].outputs) {
        expect(out.amountSompi).toBe(100n * 100_000_000n);
      }
      expect(result.accounts.every((a) => !a.skipped && a.afterBalanceSompi === "10000000000")).toBe(true);
      expect(result.accounts.every((a) => a.fundedSompi === "10000000000")).toBe(true);

      // Mined to treasury first, then liveness burn address for confirmation; never mined to alice.
      const runs = h.minerCalls.filter((c) => c.startsWith("run:"));
      expect(runs).toEqual([`run:${TREASURY_ADDRESS}`, `run:${h.observedLivenessAddr}`]);
      expect(h.observedLivenessAddr).toMatch(/^kaspasim:pq/);
      expect(runs).not.toContain(`run:${DEV_ACCOUNTS[0].address}`);
      // A10: the pending record written before the broadcast is gone once the transaction is confirmed
      // (the journal lives under HARDKAS_HOME, one per machine like the localnet; the gate gives HARDKAS_HOME its own folder)
      expect(fs.existsSync(path.join(getHardkasHome(), LOCALNET_TREASURY_PENDING_FILE))).toBe(false);
      expect(fs.existsSync(path.join(ws, ".hardkas", "localnet-treasury-pending.json"))).toBe(false);
    },
    15_000
  );

  it("skips already-funded accounts when --only-empty is set without touching miner or submitting txs", async () => {
    for (const dev of DEV_ACCOUNTS) {
      h.balances.set(dev.address, 100n * 100_000_000n);
    }
    const result = await runLocalnetSeed({
      onlyEmpty: true,
      json: true,
      silentOutput: true,
      workspaceRoot: ws
    });

    expect(result.status).toBe("TOCCATA_ACCOUNTS_ALREADY_FUNDED");
    expect(result.txIds).toEqual([]);
    expect(result.accounts.every((a) => a.skipped)).toBe(true);
    expect(h.minerCalls).toEqual([]);
  });

  it("transfers single-account treasury funding immediately without coinbase mining when treasury holds mature balance", async () => {
    h.balances.set(TREASURY_ADDRESS, 500n * 100_000_000n);
    h.utxosByAddr.set(TREASURY_ADDRESS, [
      {
        outpoint: { transactionId: "bb".repeat(32), index: 0 },
        address: TREASURY_ADDRESS,
        amountSompi: 500n * 100_000_000n,
        scriptPublicKey: "0000",
        blockDaaScore: 100n,
        isCoinbase: false
      }
    ]);

    await runLocalnetFund({
      identifier: "bob",
      amountSompi: 100n * 100_000_000n,
      treasury: true,
      stopMiner: true,
      json: true,
      workspaceRoot: ws
    });

    expect(h.submittedTxs).toHaveLength(1);
    expect(h.balances.get(DEV_ACCOUNTS[1].address)).toBe(100n * 100_000_000n);
    const runs = h.minerCalls.filter((c) => c.startsWith("run:"));
    expect(runs).toEqual([`run:${h.observedLivenessAddr}`]);
    expect(h.observedLivenessAddr).toMatch(/^kaspasim:pq/);
  }, 15_000);

  it("rejects --treasury combined with --keep-miner", async () => {
    await expect(
      runLocalnetFund({
        identifier: "alice",
        treasury: true,
        keepMiner: true,
        json: true,
        workspaceRoot: ws
      })
    ).rejects.toMatchObject({ code: "LOCALNET_FUND_MINER_FLAGS_CONFLICT" });
  });

  it("B7: every node client of seed and fund --treasury is the canonical localnet's (the identity-checked node), on simnet", async () => {
    await runLocalnetSeed({ amountSompi: 100n * 100_000_000n, stopMiner: true, json: true, silentOutput: true, workspaceRoot: ws });
    h.submittedTxs.length = 0;
    await runLocalnetFund({ identifier: "bob", amountSompi: 100n * 100_000_000n, treasury: true, stopMiner: true, json: true, workspaceRoot: ws });
    expect(h.clients.length).toBeGreaterThan(0);
    for (const c of h.clients) expect(c.rpcUrl).toBe(nodeRpcUrl());
    // the clients that broadcast (seed's and fund's) also demand a simnet node
    expect(h.clients.filter((c) => c.expectedNetworkId === "simnet").length).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it("B4: --timeout that is not a positive whole number is LOCALNET_TIMEOUT_INVALID (exit 2) before the node is contacted", async () => {
    for (const timeoutMs of [Number.NaN, 0, -5, 1.5]) {
      await expect(runLocalnetSeed({ timeoutMs, json: true, silentOutput: true, workspaceRoot: ws })).rejects.toMatchObject({
        code: "LOCALNET_TIMEOUT_INVALID",
        exitCode: 2
      });
    }
    expect(h.identityChecks).toBe(0);
    expect(h.submittedTxs).toHaveLength(0);
    expect(h.minerCalls).toEqual([]);
  });
});
