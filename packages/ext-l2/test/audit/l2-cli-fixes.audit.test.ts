// L2 FIX REGRESSION (30-oct-2026) — CLI build/sign/send end-to-end with REAL artifacts against a LOCAL mock RPC.
// No external network (audit guard), no real keys (public Anvil key #0).
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, parseTransaction } from "viem";
import { runL2TxBuild, runL2TxSign, runL2TxSend } from "../../src/runners/l2-tx-runners.js";
import { buildHardkasProgram } from "../../../cli/src/program.js";
import { loadedL2Registry } from "../helpers/extension-registry.js";
import {
  startMockRpc,
  installExternalFetchGuard,
  TEST_PK,
  TEST_ADDR,
  OTHER_ADDR,
  type MockRpc
} from "../../../l2/test/audit/mock-rpc.js";

// Own scratch directory (removed afterwards) unless the audit harness provides one.
const OWN_WORK = !process.env.L2AUDIT_WORK;
const WORK = process.env.L2AUDIT_WORK ?? fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-l2-cli-"));
const FEES = { maxGasLimit: "100000", maxFeePerGas: "10000000000", maxTotalFee: "1000000000000000" };
const code = (c: string) => expect.objectContaining({ code: c });
let guard: ReturnType<typeof installExternalFetchGuard>;
const originalCwd = process.cwd();
const servers: MockRpc[] = [];

const testSigner = {
  async sign({ plan }: any) {
    const raw = await privateKeyToAccount(TEST_PK as `0x${string}`).signTransaction({
      type: "legacy",
      chainId: plan.chainId,
      to: plan.request.to,
      data: plan.request.data,
      value: BigInt(plan.request.valueWei),
      gas: BigInt(plan.request.gasLimit),
      gasPrice: BigInt(plan.request.gasPriceWei),
      nonce: Number(plan.request.nonce)
    });
    return { rawTransaction: raw };
  }
};

async function node(chainId: number, h: Parameters<typeof startMockRpc>[1] = {}) {
  const m = await startMockRpc(chainId, {
    eth_sendRawTransaction: (p) => ({ result: keccak256(p[0]) }),
    ...h
  });
  servers.push(m);
  return m;
}
function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  return fn().finally(() => spy.mockRestore());
}
async function json<T = any>(fn: () => Promise<void>): Promise<T> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(" "));
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return JSON.parse(lines[0]!);
}
function freshDir(name: string): void {
  const d = path.join(WORK, `${name}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`);
  fs.mkdirSync(d, { recursive: true });
  process.chdir(d);
}
async function buildAndSign(rpc: MockRpc, network: string, extra: Record<string, unknown> = {}) {
  const built = await json(() =>
    runL2TxBuild({ network, url: rpc.url, from: TEST_ADDR, to: OTHER_ADDR, value: "1", json: true, ...extra })
  );
  const signed = await json(() =>
    runL2TxSign({ planPath: built.artifactPath, json: true, signerOverride: testSigner as any, ...extra })
  );
  return { built, signed };
}

beforeAll(() => {
  guard = installExternalFetchGuard();
});
afterEach(async () => {
  process.chdir(originalCwd);
  while (servers.length) await servers.pop()!.close();
});
afterAll(() => {
  process.chdir(originalCwd);
  guard.restore();
  if (OWN_WORK) fs.rmSync(WORK, { recursive: true, force: true });
  expect(guard.attempts).toEqual([]);
});

describe("CLI fixes (formerly D1–D6)", () => {
  it("local happy path: build -> sign -> send, txHash = keccak256(raw)", async () => {
    freshDir("ok");
    const rpc = await node(31337);
    const { signed } = await buildAndSign(rpc, "local");
    const out = await json(() => runL2TxSend({ signedPath: signed.artifactPath, url: rpc.url, yes: true, json: true }));
    const raw = rpc.calls.find((c) => c.method === "eth_sendRawTransaction")!.params[0];
    expect(out.txHash).toBe(keccak256(raw));
    expect(out.broadcastState).toBe("submitted");
    expect(parseTransaction(raw).chainId).toBe(31337);
  });

  it("D1 fixed: igra-mainnet build is refused without --allow-mainnet, before any RPC call", async () => {
    freshDir("d1");
    const rpc = await node(38833);
    await expect(
      quiet(() => runL2TxBuild({ network: "igra-mainnet", url: rpc.url, to: OTHER_ADDR, ...FEES }))
    ).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    expect(rpc.calls).toEqual([]);
  });

  it("D1 fixed: --yes is not mainnet authorization; --allow-mainnet must be repeated at send", async () => {
    freshDir("d1b");
    const rpc = await node(38833);
    const { signed } = await buildAndSign(rpc, "igra-mainnet", { allowMainnet: true, ...FEES });
    await expect(
      quiet(() => runL2TxSend({ signedPath: signed.artifactPath, url: rpc.url, yes: true, ...FEES }))
    ).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
    // explicit authorization + confirmation: allowed (mock node only)
    await quiet(() =>
      runL2TxSend({ signedPath: signed.artifactPath, url: rpc.url, yes: true, allowMainnet: true, ...FEES })
    );
    expect(rpc.methods()).toContain("eth_sendRawTransaction");
  });

  it("D2: --allow-mainnet without --yes is still cancelled (two separate decisions)", async () => {
    freshDir("d2");
    const rpc = await node(38833);
    const { signed } = await buildAndSign(rpc, "igra-mainnet", { allowMainnet: true, ...FEES });
    const before = rpc.calls.length;
    await expect(
      quiet(() => runL2TxSend({ signedPath: signed.artifactPath, url: rpc.url, allowMainnet: true, ...FEES }))
    ).rejects.toThrow(/--yes/);
    expect(rpc.calls.length).toBe(before);
  });

  it("D4 fixed: galleon profile + endpoint reporting 38833 -> build refused, nothing signed", async () => {
    freshDir("d4");
    const rpc = await node(38833);
    await expect(
      quiet(() => runL2TxBuild({ network: "igra-galleon", url: rpc.url, from: TEST_ADDR, to: OTHER_ADDR, ...FEES }))
    ).rejects.toThrow(code("L2_CHAIN_ID_MISMATCH"));
    expect(fs.existsSync("plans")).toBe(false);
  });

  it("D5 fixed: build without --network is refused, no network request at all", async () => {
    freshDir("d5");
    const before = guard.attempts.length;
    await expect(quiet(() => runL2TxBuild({ to: OTHER_ADDR }))).rejects.toThrow(code("L2_CHAIN_ID_REQUIRED"));
    expect(guard.attempts.length).toBe(before);
  });

  it("ambiguous --network igra is refused", async () => {
    freshDir("amb");
    await expect(quiet(() => runL2TxBuild({ network: "igra", to: OTHER_ADDR }))).rejects.toThrow(/ambiguous/);
  });

  it("D6 fixed: a relabelled signed artifact is refused as tampered", async () => {
    freshDir("d6");
    const rpc = await node(31337);
    const { signed } = await buildAndSign(rpc, "local");
    const art = JSON.parse(fs.readFileSync(signed.artifactPath, "utf8"));
    const edited = path.join(path.dirname(signed.artifactPath), "edited.json");
    fs.writeFileSync(edited, JSON.stringify({ ...art, networkId: "some-other-label" }));
    await expect(
      quiet(() => runL2TxSend({ signedPath: edited, url: rpc.url, yes: true }))
    ).rejects.toThrow(/modified after it was written/);
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
  });

  it("endpoint swapped between build and send -> refused", async () => {
    freshDir("swap");
    const a = await node(31337);
    const { signed } = await buildAndSign(a, "local");
    const b = await node(38836);
    await expect(
      quiet(() => runL2TxSend({ signedPath: signed.artifactPath, url: b.url, yes: true }))
    ).rejects.toThrow();
    expect(b.methods()).not.toContain("eth_sendRawTransaction");
  });

  it("node answering a foreign txHash -> L2_TX_HASH_MISMATCH and no receipt file", async () => {
    freshDir("hash");
    const rpc = await node(31337, { eth_sendRawTransaction: () => ({ result: "0x" + "11".repeat(32) }) });
    const { signed } = await buildAndSign(rpc, "local");
    await expect(
      quiet(() => runL2TxSend({ signedPath: signed.artifactPath, url: rpc.url, yes: true }))
    ).rejects.toThrow(code("L2_TX_HASH_MISMATCH"));
    expect(fs.existsSync(path.join(".hardkas", "l2-receipts"))).toBe(false);
  });

  it("RPC-inflated gas price is refused at build (fee ceiling)", async () => {
    freshDir("fee");
    const rpc = await node(31337, { eth_gasPrice: () => ({ result: "0x" + (10n ** 24n).toString(16) }) });
    await expect(
      quiet(() => runL2TxBuild({ network: "local", url: rpc.url, from: TEST_ADDR, to: OTHER_ADDR }))
    ).rejects.toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
  });

  it("galleon without fee ceilings -> L2_FEE_POLICY_REQUIRED, before any RPC call", async () => {
    freshDir("feepol");
    const rpc = await node(38836);
    await expect(
      quiet(() => runL2TxBuild({ network: "igra-galleon", url: rpc.url, to: OTHER_ADDR }))
    ).rejects.toThrow(code("L2_FEE_POLICY_REQUIRED"));
    expect(rpc.calls).toEqual([]);
  });

  it("caravel (sunset, unverified) refuses writes", async () => {
    freshDir("caravel");
    await expect(
      quiet(() => runL2TxBuild({ network: "igra-caravel", url: "http://127.0.0.1:1", to: OTHER_ADDR, ...FEES }))
    ).rejects.toThrow(code("L2_WRITE_DISABLED"));
  });
});

describe("CLI surface", () => {
  // L2-EXT stage 2: the l2 group is the extension's. Without it (whatever HARDKAS_EXPERIMENTAL_L2 says) `l2` is only a
  // hidden refusal; with it, the real group; never in generated docs. (Before stage 2 this test pinned the env opt-in.)
  const l2Of = (p: ReturnType<typeof buildHardkasProgram>) => p.commands.find((c) => c.name() === "l2");

  it("without the extension, `l2` is a hidden refusal, also with HARDKAS_EXPERIMENTAL_L2=1", async () => {
    const prev = process.env.HARDKAS_EXPERIMENTAL_L2;
    try {
      for (const flag of [undefined, "1"]) {
        if (flag === undefined) delete process.env.HARDKAS_EXPERIMENTAL_L2;
        else process.env.HARDKAS_EXPERIMENTAL_L2 = flag;
        const program = buildHardkasProgram();
        expect(l2Of(program)?.commands.length).toBe(0);
        expect((l2Of(program) as any)?._hidden).toBe(true);
        await expect(program.parseAsync(["l2", "tx", "send", "x.json", "--yes"], { from: "user" })).rejects.toMatchObject({
          code: "EXTENSION_NOT_INSTALLED"
        });
      }
    } finally {
      if (prev === undefined) delete process.env.HARDKAS_EXPERIMENTAL_L2;
      else process.env.HARDKAS_EXPERIMENTAL_L2 = prev;
    }
  });

  it("with the extension loaded, `l2` is the real group (and the moved commands come with it); never in docs", () => {
    const program = buildHardkasProgram({ extensions: loadedL2Registry() });
    const l2 = l2Of(program)!;
    expect(l2.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(["networks", "profile", "tx", "contract", "bridge", "rpc", "balance", "nonce", "metamask", "wizard", "doctor"])
    );
    expect(program.commands.find((c) => c.name() === "dev")!.commands.some((c) => c.name() === "doctor")).toBe(true);
    expect(program.commands.find((c) => c.name() === "local")!.commands.map((c) => c.name())).toEqual(["wizard"]);
    expect(l2Of(buildHardkasProgram({ forDocs: true, extensions: loadedL2Registry() }))).toBeUndefined();
  });
});
