import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TREASURY_ADDRESS = "kaspasim:qqtreasury000000000000000000000000000000000000000000000000000";
const DEV_ACCOUNTS = [
  { name: "alice", address: "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn" },
  { name: "bob", address: "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980" },
  { name: "carol", address: "kaspasim:qqngk9jxxnkhcxpa8w2np5cnvl5v7ke0nx89g4hvgegmrd4awlyts3wxy0770" },
  { name: "dave", address: "kaspasim:qq49jccu6feeazyfwqz7sjhkzqcn7f74swvcjcde5khnvtdfn7x2zzzaystaj" },
  { name: "erin", address: "kaspasim:qrj0cc3yrdhajhncal833a8rsqv8q758sa647w7dpwnqdfm8696gslkrvdw5l" }
];

const minerCalls: string[] = [];
const balances = new Map<string, bigint>();
const utxosByAddr = new Map<string, any[]>();
let virtualDaaScore = 2_000n;
const submittedTxs: Array<{ rawTransaction: string; expectedTxId?: string }> = [];
let planCalls: Array<{ outputs: Array<{ address: string; amountSompi: bigint }>; utxos: any[] }> = [];
let observedLivenessAddr = "";

vi.mock("execa", () => ({
  execa: vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "docker") return { stdout: "", stderr: "" };
    if (args[0] === "rm" || args[0] === "stop") {
      minerCalls.push(`${args[0]}:${args[args.length - 1]}`);
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "run") {
      const addrIdx = args.indexOf("-a");
      const target = addrIdx >= 0 ? (args[addrIdx + 1] ?? "") : "";
      minerCalls.push(`run:${target}`);
      if (target === TREASURY_ADDRESS) {
        balances.set(TREASURY_ADDRESS, 2_000n * 100_000_000n);
        utxosByAddr.set(TREASURY_ADDRESS, [
          {
            outpoint: { transactionId: "aa".repeat(32), index: 0 },
            address: TREASURY_ADDRESS,
            amountSompi: 2_000n * 100_000_000n,
            scriptPublicKey: "0000",
            blockDaaScore: 100n,
            isCoinbase: true
          }
        ]);
      } else if (target !== TREASURY_ADDRESS && submittedTxs.length > 0) {
        observedLivenessAddr = target;
        const lastPlan = planCalls[planCalls.length - 1];
        if (lastPlan) {
          for (const out of lastPlan.outputs) {
            balances.set(out.address, (balances.get(out.address) ?? 0n) + out.amountSompi);
          }
        }
      }
      return { stdout: "miner-id", stderr: "" };
    }
    if (args[0] === "inspect") {
      const running = minerCalls[minerCalls.length - 1]?.startsWith("run:") ?? false;
      return { stdout: JSON.stringify([{ State: { Running: running, Status: running ? "running" : "exited" } }]), stderr: "" };
    }
    if (args[0] === "images") return { stdout: "repo/img", stderr: "" };
    return { stdout: "", stderr: "" };
  })
}));

vi.mock("@hardkas/node-runner", async () => {
  const actual = await vi.importActual<any>("@hardkas/node-runner");
  return {
    ...actual,
    requireNodeIdentity: vi.fn(async () => ({ verified: true, containerName: "hardkas-kaspad-toccata-v2" }))
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
        payload: JSON.stringify({ txId: "ff".repeat(32), outputs: planArtifact.outputs })
      }
    }))
  };
});

vi.mock("@hardkas/tx-builder", async () => {
  const actual = await vi.importActual<any>("@hardkas/tx-builder");
  return {
    ...actual,
    planPaymentWithGenerator: vi.fn(async (req: any) => {
      planCalls.push({ outputs: req.outputs, utxos: req.utxos });
      const totalOut = req.outputs.reduce((s: bigint, o: any) => s + o.amountSompi, 0n);
      const totalIn = req.utxos.reduce((s: bigint, u: any) => s + u.amountSompi, 0n);
      const feeSompi = 50_000n;
      const changeSompi = totalIn - totalOut - feeSompi;
      return {
        inputs: req.utxos,
        outputs: req.outputs,
        change: { address: req.changeAddress, amountSompi: changeSompi },
        changeSompi,
        estimatedFeeSompi: feeSompi,
        estimatedMass: 2500n,
        feeSompi,
        mass: 2500n,
        version: 0
      };
    })
  };
});

vi.mock("@hardkas/kaspa-rpc", () => ({
  JsonWrpcKaspaClient: class {
    async getBlockDagInfo() {
      return { virtualDaaScore, sink: "11".repeat(32), virtualParentHashes: ["22".repeat(32)] };
    }
    async getInfo() {
      return { virtualDaaScore };
    }
    async getBalanceByAddress(addr: string) {
      return { address: addr, balanceSompi: balances.get(addr) ?? 0n };
    }
    async getUtxosByAddress(addr: string) {
      return utxosByAddr.get(addr) ?? [];
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
    async close() {}
  }
}));

vi.mock("@hardkas/core", async () => {
  const actual = await vi.importActual<any>("@hardkas/core");
  return {
    ...actual,
    loadManagedKaspaWasmSync: () => ({
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
      addressFromScriptPublicKey: () => ({ toString: () => LIVENESS_BURN_ADDRESS })
    })
  };
});

vi.mock("@hardkas/sdk", () => ({
  Hardkas: {
    create: vi.fn(async () => ({
      network: "simnet",
      rpc: {
        getInfo: async () => ({ virtualDaaScore }),
        getBlockDagInfo: async () => ({ virtualDaaScore, sink: "11".repeat(32), virtualParentHashes: ["22".repeat(32)] }),
        getBalanceByAddress: async (addr: string) => ({ address: addr, balanceSompi: balances.get(addr) ?? 0n }),
        getUtxosByAddress: async (addr: string) => utxosByAddr.get(addr) ?? [],
        call: async (method: string) =>
          method === "getBlock"
            ? {
                block: {
                  header: { daaScore: "1", parentsByLevel: [[]] },
                  verboseData: { selectedParentHash: "" },
                  transactions: [{ outputs: [] }]
                }
              }
            : {},
        submitTransaction: async (rawTransaction: string, opts?: any) => {
          submittedTxs.push({ rawTransaction, expectedTxId: opts?.expectedTxId });
          return { accepted: true, transactionId: opts?.expectedTxId ?? "ff".repeat(32) };
        }
      },
      close: async () => undefined
    }))
  }
}));

import { runLocalnetSeed } from "../src/runners/localnet-treasury.js";
import { runLocalnetFund } from "../src/runners/localnet-runners.js";

describe("localnet treasury seed and fast fund", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-seed-test-"));
    minerCalls.length = 0;
    balances.clear();
    utxosByAddr.clear();
    submittedTxs.length = 0;
    planCalls = [];
    virtualDaaScore = 2_000n;
    observedLivenessAddr = "";
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
      expect(planCalls).toHaveLength(1);
      expect(planCalls[0].outputs).toHaveLength(5);
      for (const out of planCalls[0].outputs) {
        expect(out.amountSompi).toBe(100n * 100_000_000n);
      }
      expect(result.accounts.every((a) => !a.skipped && a.afterBalanceSompi === "10000000000")).toBe(true);

      // Mined to treasury first, then liveness burn address for confirmation; never mined to alice.
      const runs = minerCalls.filter((c) => c.startsWith("run:"));
      expect(runs).toEqual([`run:${TREASURY_ADDRESS}`, `run:${observedLivenessAddr}`]);
      expect(observedLivenessAddr).toMatch(/^kaspasim:pq/);
      expect(runs).not.toContain(`run:${DEV_ACCOUNTS[0].address}`);
    },
    15_000
  );

  it("skips already-funded accounts when --only-empty is set without touching miner or submitting txs", async () => {
    for (const dev of DEV_ACCOUNTS) {
      balances.set(dev.address, 100n * 100_000_000n);
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
    expect(minerCalls).toEqual([]);
  });

  it("transfers single-account treasury funding immediately without coinbase mining when treasury holds mature balance", async () => {
    balances.set(TREASURY_ADDRESS, 500n * 100_000_000n);
    utxosByAddr.set(TREASURY_ADDRESS, [
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

    expect(submittedTxs).toHaveLength(1);
    expect(balances.get(DEV_ACCOUNTS[1].address)).toBe(100n * 100_000_000n);
    const runs = minerCalls.filter((c) => c.startsWith("run:"));
    expect(runs).toEqual([`run:${observedLivenessAddr}`]);
    expect(observedLivenessAddr).toMatch(/^kaspasim:pq/);
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
});
