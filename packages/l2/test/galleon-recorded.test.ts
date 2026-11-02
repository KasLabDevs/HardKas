// Real Galleon wire shapes (recorded read-only on 31-oct-2026, fixtures/galleon-recorded.json),
// replayed by a loopback server: the client and normalizers must accept what the real node sends,
// not only what our hand-written mocks send. No external network.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseTransaction } from "viem";
import * as L2 from "../src/index.js";
import { startMockRpc, TEST_PK, TEST_ADDR, OTHER_ADDR, type MockRpc } from "./audit/mock-rpc.js";

type Reply = { params: unknown[]; result?: unknown; error?: { code: number; message: string } };
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/galleon-recorded.json", import.meta.url)), "utf8")
) as { chainId: number; replies: Record<string, Reply> };
const R = fixture.replies;
const as = (r: Reply) => (r.error ? { error: r.error } : { result: r.result });
const realTxHash = (R["eth_getTransactionReceipt:real"]!.result as any).transactionHash as string;
const realBlockNumber = (R["eth_getTransactionReceipt:real"]!.result as any).blockNumber as string;

const servers: MockRpc[] = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});

/** Replays the recorded Galleon replies; anything not recorded answers like Galleon does (-32002). */
async function galleonReplay(): Promise<MockRpc> {
  const m = await startMockRpc(fixture.chainId, {
    eth_chainId: () => as(R.eth_chainId!),
    eth_blockNumber: () => as(R.eth_blockNumber!),
    eth_gasPrice: () => as(R.eth_gasPrice!),
    eth_maxPriorityFeePerGas: () => as(R.eth_maxPriorityFeePerGas!),
    eth_feeHistory: () => as(R.eth_feeHistory!),
    eth_getTransactionCount: () => as(R["eth_getTransactionCount:pending"]!),
    eth_getBalance: (p) => as(p[1] === "latest" ? R.eth_getBalance! : R["eth_getBalance:badParams"]!),
    eth_estimateGas: () => as(R.eth_estimateGas!),
    eth_getCode: () => as(R.eth_getCode!),
    eth_call: () => as(R.eth_call!),
    eth_getLogs: () => as(R["eth_getLogs:withOneLog"]!),
    eth_getTransactionByHash: () => as(R["eth_getTransactionByHash:real"]!),
    eth_getTransactionReceipt: (p) =>
      as(p[0] === realTxHash ? R["eth_getTransactionReceipt:real"]! : R["eth_getTransactionReceipt:unknown"]!),
    eth_getBlockByNumber: (p) =>
      as(p[0] === realBlockNumber ? R["eth_getBlockByNumber:ofRealTx"]! : R["eth_getBlockByNumber:latest"]!),
    eth_getMethodThatDoesNotExist: () => as(R.unknownMethod!)
  });
  servers.push(m);
  return m;
}
const galleonClient = (m: MockRpc) => new L2.EvmJsonRpcClient({ url: m.url, profile: "igra-galleon" });

describe("Galleon recorded replies (real wire shapes)", () => {
  it("chain binding: the real eth_chainId matches the igra-galleon profile", async () => {
    const c = galleonClient(await galleonReplay());
    expect(await c.getChainId()).toBe(38836);
    expect(await c.assertExpectedChainId()).toBe(38836);
  });

  it("scalar reads parse strictly (block number, gas price, nonce, balance, gas, code, call)", async () => {
    const c = galleonClient(await galleonReplay());
    expect(await c.getBlockNumber()).toBe(BigInt(R.eth_blockNumber!.result as string));
    expect(await c.getGasPriceWei()).toBe(2_000_000_000_000n); // Galleon quotes 2000 gwei
    expect(await c.getTransactionCount(TEST_ADDR, "pending")).toBe(BigInt(R["eth_getTransactionCount:pending"]!.result as string));
    expect(await c.getBalanceWei(TEST_ADDR)).toBe(BigInt(R.eth_getBalance!.result as string));
    expect(await c.estimateGas({ from: TEST_ADDR, to: OTHER_ADDR, value: "0x1" })).toBe(21_000n);
    expect(await c.getCode(OTHER_ADDR)).toBe("0x");
    expect(await c.call({ to: OTHER_ADDR, data: "0x" })).toBe("0x");
  });

  it("real block, log and receipt are accepted; the receipt belongs to its hash and is a success", async () => {
    const c = galleonClient(await galleonReplay());
    const blockHash = await c.getBlockHashByNumber(BigInt(realBlockNumber));
    const raw = await c.getTransactionReceipt(realTxHash);
    const receipt = L2.normalizeEvmTransactionReceipt(raw)!;
    expect(receipt.txHash.toLowerCase()).toBe(realTxHash.toLowerCase());
    expect(receipt.status).toBe("success");
    expect(receipt.blockNumber).toBe(BigInt(realBlockNumber));
    expect(receipt.blockHash).toBe(blockHash);
    expect(receipt.effectiveGasPrice).toBe(2_000_000_000_000n);
    expect(receipt.l1SettlementStatus).toBe("unverified_on_l1");
    const logs = await c.getLogs({ fromBlock: 1n, toBlock: 2n });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.transactionHash).toBe(realTxHash);
    // The waiter returns the same real receipt instead of timing out.
    const waited = await c.waitForTransactionReceipt(realTxHash, { timeoutMs: 2000, intervalMs: 20 } as any);
    expect(L2.normalizeEvmTransactionReceipt(waited)!.txHash).toBe(receipt.txHash);
  });

  it("unknown hash -> null receipt; real error shapes -> typed EvmJsonRpcError", async () => {
    const c = galleonClient(await galleonReplay());
    expect(await c.getTransactionReceipt("0x" + "00".repeat(31) + "01")).toBeNull();
    const bad: any = await c.getBalanceWei(TEST_ADDR, "not-a-block-tag" as any).catch((e) => e);
    expect(bad).toBeInstanceOf(L2.EvmJsonRpcError);
    expect(bad.code).toBe(-32602);
    // Galleon answers an unknown/disallowed method with -32002, not the standard -32601.
    const unknown: any = await c.callRpc("eth_getMethodThatDoesNotExist").catch((e) => e);
    expect(unknown).toBeInstanceOf(L2.EvmJsonRpcError);
    expect(unknown.code).toBe(-32002);
  });

  it("health check on the real replies reports ready with the real chain and gas price", async () => {
    const m = await galleonReplay();
    const h = await L2.checkEvmRpcHealth(galleonClient(m));
    expect(h.ready).toBe(true);
    expect(h.chainId).toBe(38836);
    expect(h.gasPriceWei).toBe(2_000_000_000_000n);
  });

  it("pre-send pipeline on real Galleon quotes: legacy tx at 2000 gwei; ceilings below the real price refuse it", async () => {
    const c = galleonClient(await galleonReplay());
    const feeLimits = { maxGasLimit: 1_000_000n, maxFeePerGasWei: 10n ** 13n, maxTotalFeeWei: 10n ** 18n };
    const prepared: any = await L2.prepareEvmTransaction(c, TEST_ADDR, { to: OTHER_ADDR, value: 1n }, { feeLimits });
    expect(prepared.chainId).toBe(38836);
    const signer = new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-galleon", feeLimits });
    const { rawTransaction } = await signer.signTransaction(prepared);
    const decoded = parseTransaction(rawTransaction as `0x${string}`);
    expect(decoded.type).toBe("legacy"); // what the real network carries (recorded tx type 0x0)
    expect(decoded.gasPrice).toBe(2_000_000_000_000n);
    expect(L2.assertRawTransactionAllowed(rawTransaction, { feeLimits }, c).chainId).toBe(38836);
    // A 1000 gwei ceiling is below what Galleon actually charges: refused before signing.
    await expect(
      L2.prepareEvmTransaction(c, TEST_ADDR, { to: OTHER_ADDR, value: 1n }, { feeLimits: { ...feeLimits, maxFeePerGasWei: 10n ** 12n } })
    ).rejects.toThrow(expect.objectContaining({ code: "L2_FEE_LIMIT_EXCEEDED" }));
  });
});
