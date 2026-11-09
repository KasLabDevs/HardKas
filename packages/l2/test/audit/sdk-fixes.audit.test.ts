// L2 FIX REGRESSION (30-oct-2026) — every original finding, asserted FIXED, against a local mock RPC.
// No external network: an audit guard blocks any non-loopback fetch and the suite fails if one is attempted.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { keccak256, getContractAddress, parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as L2 from "../../src/index.js";
import {
  startMockRpc,
  installExternalFetchGuard,
  TEST_PK,
  TEST_ADDR,
  OTHER_ADDR,
  type MockRpc
} from "./mock-rpc.js";

const FEES = { maxGasLimit: 1_000_000n, maxFeePerGasWei: 10n ** 13n, maxTotalFeeWei: 10n ** 19n };
const code = (c: string) => expect.objectContaining({ code: c });

let guard: ReturnType<typeof installExternalFetchGuard>;
const servers: MockRpc[] = [];
async function mock(chainId: number, h: Parameters<typeof startMockRpc>[1] = {}) {
  const m = await startMockRpc(chainId, h);
  servers.push(m);
  return m;
}
/** Mock that accepts broadcasts honestly: returns keccak(raw) and a success receipt for it. */
async function honestNode(chainId: number, extra: Parameters<typeof startMockRpc>[1] = {}) {
  const sent = new Set<string>();
  return mock(chainId, {
    eth_sendRawTransaction: (p) => {
      const h = keccak256(p[0]);
      sent.add(h);
      return { result: h };
    },
    eth_getTransactionReceipt: (p) =>
      sent.has(p[0])
        ? { result: { transactionHash: p[0], status: "0x1", blockNumber: "0x11", blockHash: "0x" + "ab".repeat(32), from: TEST_ADDR.toLowerCase() } }
        : { result: null },
    ...extra
  });
}
/**
 * MAINNET TOTAL LOCKDOWN: a raw Igra mainnet (38833) transaction signed OUTSIDE HardKAS (viem, as any key holder can) —
 * HardKAS's own prepare and signer refuse mainnet whatever allowMainnet says, so the broadcast guards are fed this.
 */
async function mainnetRawSignedOutside() {
  const rawTransaction = await privateKeyToAccount(TEST_PK).signTransaction({
    type: "legacy",
    chainId: 38833,
    nonce: 0,
    to: OTHER_ADDR as `0x${string}`,
    value: 1n,
    gas: 21000n,
    gasPrice: 10n ** 9n
  });
  return { rawTransaction, txHash: keccak256(rawTransaction) };
}
async function signedLocal(rpc: MockRpc, overrides: Partial<L2.EvmTransactionRequest> = {}) {
  const client = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
  const prepared = await L2.prepareEvmTransaction(client, TEST_ADDR, { to: OTHER_ADDR, value: 1n, ...overrides });
  const signed = await new L2.EvmLocalAccountSigner(TEST_PK, { profile: "local" }).signTransaction(prepared);
  return { client, prepared, ...signed };
}

beforeAll(() => {
  guard = installExternalFetchGuard();
});
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
});
afterAll(() => {
  guard.restore();
  expect(guard.attempts).toEqual([]);
});

describe("H-01 no implicit mainnet", () => {
  it("no profile -> local (31337, loopback), never mainnet", () => {
    const p = L2.resolveL2Profile({});
    expect(p.name).toBe("local");
    expect(p.environment).toBe("local");
    expect(new URL(p.rpcUrl!).hostname).toBe("127.0.0.1");
  });
  it("explicit mainnet profile is identified as mainnet", () => {
    const p = L2.resolveL2Profile({ name: "igra-mainnet" });
    expect(p.environment).toBe("mainnet");
    expect(L2.isMainnetNetwork(p.chainId, p)).toBe(true);
  });
  it("ambiguous name 'igra' is refused everywhere (registry, client)", () => {
    expect(() => L2.resolveL2Profile({ name: "igra" })).toThrow(code("L2_PROFILE_AMBIGUOUS"));
    expect(() => new L2.EvmJsonRpcClient({ profile: "igra" })).toThrow(code("L2_PROFILE_AMBIGUOUS"));
  });
  it("wrong remote endpoint for the local profile -> error", () => {
    expect(() =>
      L2.resolveL2Profile({ name: "local", cliOverrides: { url: "https://rpc.igralabs.com:8545" } })
    ).toThrow(code("L2_ENDPOINT_MISMATCH"));
  });
});

describe("H-02 mainnet guard (SDK)", () => {
  it("prepare refuses mainnet without allowMainnet (38833 and chain 1)", async () => {
    const rpc = await mock(38833);
    const c = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "igra-mainnet" });
    await expect(L2.prepareEvmTransaction(c, TEST_ADDR, { to: OTHER_ADDR }, { feeLimits: FEES })).rejects.toThrow(
      code("L2_MAINNET_WRITE_BLOCKED")
    );
    const rpc1 = await mock(1);
    const c1 = new L2.EvmJsonRpcClient({ url: rpc1.url, expectedChainId: 1 });
    await expect(L2.prepareEvmTransaction(c1, TEST_ADDR, { to: OTHER_ADDR }, { feeLimits: FEES })).rejects.toThrow(
      code("L2_MAINNET_WRITE_BLOCKED")
    );
    // nothing was asked to the RPC before refusing
    expect(rpc.methods()).toEqual([]);
  });

  it("signer refuses mainnet without allowMainnet; `allowMainnet: 'yes'` is not authorization", async () => {
    const s = new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-mainnet", feeLimits: FEES });
    const tx = { from: TEST_ADDR as `0x${string}`, to: OTHER_ADDR as `0x${string}`, value: 1n, data: "0x" as const, nonce: 0, gasLimit: 21000n, chainId: 38833, type: "legacy" as const, gasPrice: 10n ** 9n };
    await expect(s.signTransaction(tx)).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    const s2 = new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-mainnet", feeLimits: FEES, allowMainnet: "yes" as any });
    await expect(s2.signTransaction(tx)).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
  });

  // MAINNET TOTAL LOCKDOWN (owner decision 2026-11-09): this case read "with explicit allowMainnet: true the full mainnet
  // path works (mock only)". The owner revoked every mainnet opt-in: the same calls on the same mock are now refused.
  it("MAINNET TOTAL LOCKDOWN · with allowMainnet: true the mainnet path is still refused: prepare, sign and send; nothing reaches the RPC", async () => {
    const rpc = await honestNode(38833);
    const c = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "igra-mainnet" });
    const opts = { allowMainnet: true, feeLimits: FEES };
    await expect(L2.prepareEvmTransaction(c, TEST_ADDR, { to: OTHER_ADDR, value: 1n }, opts)).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    const tx = { from: TEST_ADDR as `0x${string}`, to: OTHER_ADDR as `0x${string}`, value: 1n, data: "0x" as const, nonce: 0, gasLimit: 21000n, chainId: 38833, type: "legacy" as const, gasPrice: 10n ** 9n };
    await expect(new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-mainnet", ...opts }).signTransaction(tx)).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    const { rawTransaction } = await mainnetRawSignedOutside();
    expect(parseTransaction(rawTransaction).chainId).toBe(38833);
    await expect(L2.sendAndConfirmTransaction(c, rawTransaction, opts)).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    expect(rpc.methods()).toEqual([]);
  });

  it("sendAndConfirm refuses a mainnet raw tx (signed outside HardKAS), with or without allowMainnet", async () => {
    const rpc = await honestNode(38833);
    const c = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "igra-mainnet" });
    const { rawTransaction } = await mainnetRawSignedOutside();
    await expect(L2.sendAndConfirmTransaction(c, rawTransaction, { feeLimits: FEES })).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    await expect(L2.sendAndConfirmTransaction(c, rawTransaction, { allowMainnet: true, feeLimits: FEES })).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
  });

  it("deployContract and writeContract inherit the guard", async () => {
    const rpc = await mock(38833);
    const c = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "igra-mainnet" });
    const s = new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-mainnet", allowMainnet: true, feeLimits: FEES });
    await expect(L2.deployContract(c, s, { bytecode: "0x6000", feeLimits: FEES })).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    await expect(
      L2.writeContract(c, s, { address: OTHER_ADDR, abi: [{ type: "function", name: "f", inputs: [], outputs: [], stateMutability: "nonpayable" }], functionName: "f", feeLimits: FEES })
    ).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
  });

  it("a renamed / user-config profile with chain 38833 is still protected", async () => {
    const userProfiles = { "my-dev": { chainId: 38833, rpcUrl: "http://127.0.0.1:1", environment: "testnet" as const } };
    const p = L2.resolveL2Profile({ name: "my-dev", userProfiles });
    expect(() => L2.assertL2WriteAllowed({ chainId: 38833, profile: p, operation: "t" })).toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    expect(() => L2.assertL2WriteAllowed({ chainId: 38833, operation: "t" })).toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
  });

  // MAINNET TOTAL LOCKDOWN: the RPC's eth_chainId answer naming a mainnet chain now ends the client before the chain
  // mismatch rule (it was L2_CHAIN_ID_MISMATCH): MAINNET_CONNECTION_DISABLED, and nothing else is asked
  it("a malicious endpoint cannot bypass: local-bound client + RPC claiming 38833 -> refused at its identity answer (MAINNET_CONNECTION_DISABLED), nothing signed", async () => {
    const rpc = await mock(38833);
    const c = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
    await expect(L2.prepareEvmTransaction(c, TEST_ADDR, { to: OTHER_ADDR })).rejects.toThrow(code("MAINNET_CONNECTION_DISABLED"));
    expect(rpc.methods()).toEqual(["eth_chainId"]);
  });
});

describe("H-03 chain binding", () => {
  it("url-only client cannot prepare, sign or send (no chain taken from the RPC)", async () => {
    const rpc = await mock(31337);
    const c = new L2.EvmJsonRpcClient({ url: rpc.url });
    await expect(L2.prepareEvmTransaction(c, TEST_ADDR, { to: OTHER_ADDR }, { feeLimits: FEES })).rejects.toThrow(code("L2_CHAIN_ID_REQUIRED"));
    expect(() => new L2.EvmLocalAccountSigner(TEST_PK)).toThrow(code("L2_CHAIN_ID_REQUIRED"));
  });
  it("correct RPC -> allowed; RPC with other chain -> blocked", async () => {
    const ok = await mock(31337);
    await expect(signedLocal(ok)).resolves.toBeDefined();
    const bad = await mock(38836);
    await expect(signedLocal(bad)).rejects.toThrow(code("L2_CHAIN_ID_MISMATCH"));
  });
  it("malformed / missing chain ID -> blocked", async () => {
    for (const answer of ["0x7a69junk", "31337", "0x", null, 31337, "0x0"]) {
      const rpc = await mock(1, { eth_chainId: () => ({ result: answer }) });
      await expect(signedLocal(rpc)).rejects.toThrow(code("L2_CHAIN_ID_INVALID"));
    }
  });
  it("raw tx signed for another network -> refused before broadcast", async () => {
    const galleonNode = await honestNode(38836);
    const gc = new L2.EvmJsonRpcClient({ url: galleonNode.url, profile: "igra-galleon" });
    const prepared = await L2.prepareEvmTransaction(gc, TEST_ADDR, { to: OTHER_ADDR }, { feeLimits: FEES });
    const { rawTransaction } = await new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-galleon", feeLimits: FEES }).signTransaction(prepared);
    const localNode = await honestNode(31337);
    const lc = new L2.EvmJsonRpcClient({ url: localNode.url, profile: "local" });
    await expect(L2.sendAndConfirmTransaction(lc, rawTransaction)).rejects.toThrow(code("L2_SIGNED_TX_MISMATCH"));
    expect(localNode.methods()).not.toContain("eth_sendRawTransaction");
  });
  it("endpoint changed between prepare and send -> blocked", async () => {
    const a = await honestNode(31337);
    const { rawTransaction } = await signedLocal(a);
    const b = await honestNode(38836); // a different network now answers at the "same" binding
    const cb = new L2.EvmJsonRpcClient({ url: b.url, expectedChainId: 31337 });
    await expect(L2.sendAndConfirmTransaction(cb, rawTransaction, { feeLimits: FEES })).rejects.toThrow(code("L2_CHAIN_ID_MISMATCH"));
    expect(b.methods()).not.toContain("eth_sendRawTransaction");
  });
});

describe("M-03 broadcast hash verification", () => {
  it("correct hash -> submitted", async () => {
    const rpc = await honestNode(31337);
    const { client, rawTransaction, txHash } = await signedLocal(rpc);
    const r = await L2.sendRawTransactionResilient(client, rawTransaction);
    expect(r).toEqual({ txHash, broadcastState: "submitted" });
  });
  for (const [label, answer] of [
    ["wrong hash", "0x" + "11".repeat(32)],
    ["malformed hash", "0x1234"],
    ["empty response", null],
    ["empty string", ""]
  ] as const) {
    it(`${label} -> L2TxHashMismatchError, never success, raw tx kept`, async () => {
      const rpc = await mock(31337, { eth_sendRawTransaction: () => ({ result: answer }) });
      const { client, rawTransaction, txHash } = await signedLocal(rpc);
      const err: any = await L2.sendAndConfirmTransaction(client, rawTransaction).catch((e) => e);
      expect(err).toBeInstanceOf(L2.L2TxHashMismatchError);
      expect(err.expectedTxHash).toBe(txHash);
      expect(err.rawTransaction).toBe(rawTransaction);
    });
  }
  it("manipulated receipt for another hash -> rejected", async () => {
    const rpc = await mock(31337, {
      eth_sendRawTransaction: (p) => ({ result: keccak256(p[0]) }),
      eth_getTransactionReceipt: () => ({ result: { transactionHash: "0x" + "22".repeat(32), status: "0x1", blockNumber: "0x5" } })
    });
    const { client, rawTransaction } = await signedLocal(rpc);
    await expect(L2.sendAndConfirmTransaction(client, rawTransaction)).rejects.toBeInstanceOf(L2.L2TxHashMismatchError);
  });
  it("lost response after acceptance -> reconciled by our own hash", async () => {
    let mined = false;
    const rpc = await mock(31337, {
      eth_sendRawTransaction: () => {
        mined = true;
        return { destroy: true };
      },
      eth_getTransactionReceipt: (p) => (mined ? { result: { transactionHash: p[0], status: "0x1", blockNumber: "0x5" } } : { result: null })
    });
    const { client, rawTransaction, txHash } = await signedLocal(rpc);
    const r = await L2.sendRawTransactionResilient(client, rawTransaction, { maxReconcileAttempts: 2, reconcileIntervalMs: 5 });
    expect(r).toEqual({ txHash, broadcastState: "mined_after_lost_response" });
  });
  it("lost response, nothing observable -> UncertainBroadcastError (hash kept, not a failure)", async () => {
    const rpc = await mock(31337, { eth_sendRawTransaction: () => ({ destroy: true }) });
    const { client, rawTransaction, txHash } = await signedLocal(rpc);
    const err: any = await L2.sendRawTransactionResilient(client, rawTransaction, { maxReconcileAttempts: 2, reconcileIntervalMs: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(L2.UncertainBroadcastError);
    expect(err.txHash).toBe(txHash);
  });
  it("'already known' is reported as already_known (mempool claim), not as mined", async () => {
    const rpc = await mock(31337, { eth_sendRawTransaction: () => ({ error: { code: -32000, message: "already known" } }) });
    const { client, rawTransaction } = await signedLocal(rpc);
    expect((await L2.sendRawTransactionResilient(client, rawTransaction)).broadcastState).toBe("already_known");
  });
  it("Anvil's real wording for a re-send ('transaction already imported', -32003) is also already_known, not a rejection", async () => {
    // Message recorded from a real Anvil 1.8.6 on 31-oct-2026 (l2fix-evidence\14-real-nodes\anvil).
    const rpc = await mock(31337, { eth_sendRawTransaction: () => ({ error: { code: -32003, message: "transaction already imported" } }) });
    const { client, rawTransaction, txHash } = await signedLocal(rpc);
    const r = await L2.sendRawTransactionResilient(client, rawTransaction);
    expect(r.broadcastState).toBe("already_known");
    expect(r.txHash).toBe(txHash);
  });
  it("NEW-05 low-level resilient send is guarded: foreign-chain raw never reaches the node", async () => {
    const galleonNode = await honestNode(38836);
    const gc = new L2.EvmJsonRpcClient({ url: galleonNode.url, profile: "igra-galleon" });
    const prepared = await L2.prepareEvmTransaction(gc, TEST_ADDR, { to: OTHER_ADDR }, { feeLimits: FEES });
    const { rawTransaction } = await new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-galleon", feeLimits: FEES }).signTransaction(prepared);
    const localNode = await honestNode(31337);
    const lc = new L2.EvmJsonRpcClient({ url: localNode.url, profile: "local" });
    await expect(L2.sendRawTransactionResilient(lc, rawTransaction)).rejects.toThrow(code("L2_SIGNED_TX_MISMATCH"));
    expect(localNode.methods()).not.toContain("eth_sendRawTransaction");
  });
  // MAINNET TOTAL LOCKDOWN: this case read "NEW-05 low-level resilient send on mainnet needs allowMainnet" and ended with
  // an authorized broadcast. No authorization opens mainnet now: every form of the same send is refused before the node.
  it("NEW-05 low-level resilient send on mainnet is refused, with or without allowMainnet or fee ceilings (MAINNET TOTAL LOCKDOWN)", async () => {
    const mainNode = await honestNode(38833);
    const mc = new L2.EvmJsonRpcClient({ url: mainNode.url, profile: "igra-mainnet" });
    const { rawTransaction } = await mainnetRawSignedOutside();
    for (const opts of [{ feeLimits: FEES }, { allowMainnet: true }, { allowMainnet: true, feeLimits: { ...FEES, maxGasLimit: 1n } }, { allowMainnet: true, feeLimits: FEES }]) {
      await expect(L2.sendRawTransactionResilient(mc, rawTransaction, opts as any)).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    }
    expect(mainNode.methods()).toEqual([]);
  });
  it("NEW-06 raw tx of a type whose fees the ceilings cannot cover (eip7702) is refused before the node", async () => {
    const rpc = await honestNode(31337);
    const client = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
    const account = privateKeyToAccount(TEST_PK);
    const authorization = await account.signAuthorization({ contractAddress: OTHER_ADDR, chainId: 31337, nonce: 1 });
    const raw = await account.signTransaction({
      type: "eip7702", chainId: 31337, nonce: 0, to: OTHER_ADDR, gas: 50_000n,
      maxFeePerGas: 10n ** 30n, maxPriorityFeePerGas: 1n, authorizationList: [authorization]
    });
    expect(parseTransaction(raw).type).toBe("eip7702");
    await expect(L2.sendRawTransactionResilient(client, raw)).rejects.toThrow(code("L2_SIGNED_TX_MISMATCH"));
    await expect(L2.sendAndConfirmTransaction(client, raw)).rejects.toThrow(code("L2_SIGNED_TX_MISMATCH"));
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
  });
  it("NEW-05 low-level resilient send with an unbound client -> L2_CHAIN_ID_REQUIRED", async () => {
    const rpc = await honestNode(31337);
    const { rawTransaction } = await signedLocal(rpc);
    const unbound = new L2.EvmJsonRpcClient({ url: rpc.url });
    await expect(L2.sendRawTransactionResilient(unbound, rawTransaction)).rejects.toThrow(code("L2_CHAIN_ID_REQUIRED"));
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
  });
  it("definite RPC rejection is surfaced, not reconciled", async () => {
    const rpc = await mock(31337, { eth_sendRawTransaction: () => ({ error: { code: -32000, message: "insufficient funds" } }) });
    const { client, rawTransaction } = await signedLocal(rpc);
    await expect(L2.sendRawTransactionResilient(client, rawTransaction)).rejects.toThrow(/insufficient funds/);
  });
  it("no receipt in time -> L2TxPendingError (pending, not failed)", async () => {
    const rpc = await mock(31337, { eth_sendRawTransaction: (p) => ({ result: keccak256(p[0]) }) });
    const { client, rawTransaction, txHash } = await signedLocal(rpc);
    const err: any = await L2.sendAndConfirmTransaction(client, rawTransaction, { timeoutMs: 150, intervalMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(L2.L2TxPendingError);
    expect(err.txHash).toBe(txHash);
  });
});

describe("R-SEND low-level EvmJsonRpcClient.sendRawTransaction is guarded", () => {
  async function signedFor(profile: "igra-galleon" | "igra-mainnet", chainId: number) {
    const node = await honestNode(chainId);
    const client = new L2.EvmJsonRpcClient({ url: node.url, profile });
    // MAINNET TOTAL LOCKDOWN: HardKAS prepares and signs nothing for mainnet; the mainnet raw is signed outside HardKAS
    if (profile === "igra-mainnet") return { node, client, ...(await mainnetRawSignedOutside()) };
    const auth = { feeLimits: FEES };
    const prepared = await L2.prepareEvmTransaction(client, TEST_ADDR, { to: OTHER_ADDR, value: 1n }, auth);
    const { rawTransaction, txHash } = await new L2.EvmLocalAccountSigner(TEST_PK, { profile, ...auth }).signTransaction(prepared);
    return { node, client, rawTransaction, txHash };
  }

  it("no options (untyped caller) -> refused before the node", async () => {
    const rpc = await honestNode(31337);
    const { client, rawTransaction } = await signedLocal(rpc);
    await expect((client.sendRawTransaction as any)(rawTransaction)).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
  });
  it("unbound client and no chain in the options -> L2_CHAIN_ID_REQUIRED", async () => {
    const rpc = await honestNode(31337);
    const { rawTransaction } = await signedLocal(rpc);
    const unbound = new L2.EvmJsonRpcClient({ url: rpc.url });
    await expect(unbound.sendRawTransaction(rawTransaction, {})).rejects.toThrow(code("L2_CHAIN_ID_REQUIRED"));
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
  });
  it("raw signed for another chain -> L2_SIGNED_TX_MISMATCH", async () => {
    const { rawTransaction } = await signedFor("igra-galleon", 38836);
    const localNode = await honestNode(31337);
    const lc = new L2.EvmJsonRpcClient({ url: localNode.url, profile: "local" });
    await expect(lc.sendRawTransaction(rawTransaction, {})).rejects.toThrow(code("L2_SIGNED_TX_MISMATCH"));
    expect(localNode.methods()).not.toContain("eth_sendRawTransaction");
  });
  // MAINNET TOTAL LOCKDOWN: this case read "... authorized + ceilings -> sent". No authorization opens mainnet now.
  it("mainnet is blocked with or without allowMainnet and ceilings: never sent (MAINNET TOTAL LOCKDOWN)", async () => {
    const { node, client, rawTransaction } = await signedFor("igra-mainnet", 38833);
    for (const opts of [{ feeLimits: FEES }, { allowMainnet: true }, { allowMainnet: true, feeLimits: { ...FEES, maxFeePerGasWei: 1n } }, { allowMainnet: true, feeLimits: FEES }]) {
      await expect(client.sendRawTransaction(rawTransaction, opts as any)).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    }
    expect(node.methods()).toEqual([]);
  });
  it("Galleon (testnet): no mainnet authorization needed, but explicit fee ceilings are", async () => {
    const { node, client, rawTransaction, txHash } = await signedFor("igra-galleon", 38836);
    await expect(client.sendRawTransaction(rawTransaction, {})).rejects.toThrow(code("L2_FEE_POLICY_REQUIRED"));
    expect(node.methods()).not.toContain("eth_sendRawTransaction");
    expect(await client.sendRawTransaction(rawTransaction, { feeLimits: FEES })).toBe(txHash);
  });
  it("a custom profile that calls itself testnet but uses the mainnet chain ID is still mainnet", async () => {
    const { node, rawTransaction } = await signedFor("igra-mainnet", 38833);
    const disguised = { ...L2.getL2Profile("igra-galleon")!, name: "my-testnet", chainId: 38833 };
    const client = new L2.EvmJsonRpcClient({ url: node.url });
    await expect(
      client.sendRawTransaction(rawTransaction, { profile: disguised, feeLimits: FEES })
    ).rejects.toThrow(code("L2_MAINNET_WRITE_BLOCKED"));
    expect(node.methods()).not.toContain("eth_sendRawTransaction");
  });
  it("eip7702 raw (fees not coverable by the ceilings) -> refused before the node", async () => {
    const rpc = await honestNode(31337);
    const client = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
    const account = privateKeyToAccount(TEST_PK);
    const authorization = await account.signAuthorization({ contractAddress: OTHER_ADDR, chainId: 31337, nonce: 1 });
    const raw = await account.signTransaction({
      type: "eip7702", chainId: 31337, nonce: 0, to: OTHER_ADDR, gas: 50_000n,
      maxFeePerGas: 10n ** 30n, maxPriorityFeePerGas: 1n, authorizationList: [authorization]
    });
    await expect(client.sendRawTransaction(raw, {})).rejects.toThrow(code("L2_SIGNED_TX_MISMATCH"));
    expect(rpc.methods()).not.toContain("eth_sendRawTransaction");
  });
  it("a guard refusal from the client is surfaced as-is by the resilient send, never as an uncertain broadcast", async () => {
    const rpc = await honestNode(31337);
    const { client, rawTransaction } = await signedLocal(rpc);
    (client as any).sendRawTransaction = async () => {
      throw new L2.L2SafetyError("L2_MAINNET_WRITE_BLOCKED", "refused by the client guard");
    };
    const err: any = await L2.sendRawTransactionResilient(client, rawTransaction, { maxReconcileAttempts: 2, reconcileIntervalMs: 5 }).catch((e) => e);
    expect(err).not.toBeInstanceOf(L2.UncertainBroadcastError);
    expect(err.code).toBe("L2_MAINNET_WRITE_BLOCKED");
    expect(rpc.methods()).not.toContain("eth_getTransactionReceipt");
  });
  it("an invalid RPC response to the send is still treated as uncertain (the node may have it)", async () => {
    const rpc = await honestNode(31337);
    const { client, rawTransaction, txHash } = await signedLocal(rpc);
    (client as any).sendRawTransaction = async () => {
      throw new L2.EvmRpcInvalidResponseError("garbled");
    };
    const err: any = await L2.sendRawTransactionResilient(client, rawTransaction, { maxReconcileAttempts: 2, reconcileIntervalMs: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(L2.UncertainBroadcastError);
    expect(err.txHash).toBe(txHash);
  });
  it("local raw within the local ceilings -> reaches the node and returns its answer", async () => {
    const rpc = await honestNode(31337);
    const { client, rawTransaction, txHash } = await signedLocal(rpc);
    expect(await client.sendRawTransaction(rawTransaction, { profile: "local" })).toBe(txHash);
    expect(rpc.methods()).toContain("eth_sendRawTransaction");
  });

  // Closure audit: the public generic callRpc must not be a second, unguarded way to broadcast.
  const SIGN_OR_BROADCAST = [
    "eth_sendRawTransaction", "ETH_SENDRAWTRANSACTION", "eth_sendRawTransaction ", " eth_sendRawTransaction",
    "eth_sendRawTransactionSync", "eth_sendRawTransactionConditional", "eth_sendTransaction", "eth_sendBundle",
    "eth_sendPrivateRawTransaction", "eth_sign", "eth_signTransaction", "eth_signTypedData_v4",
    "personal_sendTransaction", "personal_sign", "wallet_sendCalls", "mev_sendBundle", "eth_submitWork",
    "debug_setHead", "admin_addPeer", "miner_start"
  ];
  it("generic callRpc refuses every method that can sign or broadcast, on every network, before any request", async () => {
    for (const profile of ["local", "igra-galleon", "igra-mainnet"] as const) {
      const node = await honestNode(L2.getL2Profile(profile)!.chainId!);
      const client = new L2.EvmJsonRpcClient({ url: node.url, profile });
      for (const method of SIGN_OR_BROADCAST) {
        await expect(client.callRpc(method, ["0x02"])).rejects.toThrow(code("L2_RPC_METHOD_FORBIDDEN"));
      }
      await expect((client.callRpc as any)(undefined)).rejects.toThrow(code("L2_RPC_METHOD_FORBIDDEN"));
      await expect((client.callRpc as any)({ toString: () => "eth_chainId" })).rejects.toThrow(code("L2_RPC_METHOD_FORBIDDEN"));
      expect(node.methods()).toEqual([]);
    }
    // An unbound client gets no dev-node exception either.
    const node = await honestNode(31337);
    const unbound = new L2.EvmJsonRpcClient({ url: node.url });
    await expect(unbound.callRpc("eth_sendRawTransaction", ["0x02"])).rejects.toThrow(code("L2_RPC_METHOD_FORBIDDEN"));
    await expect(unbound.callRpc("evm_mine")).rejects.toThrow(code("L2_RPC_METHOD_FORBIDDEN"));
    expect(node.methods()).toEqual([]);
  });
  it("generic callRpc still forwards reads; dev-node control only on a local chain", async () => {
    const local = await honestNode(31337, { evm_mine: () => ({ result: "0x0" }) });
    const lc = new L2.EvmJsonRpcClient({ url: local.url, profile: "local" });
    expect(await lc.callRpc("eth_chainId")).toBe("0x7a69");
    expect(await lc.callRpc("evm_mine")).toBe("0x0");
    expect(local.methods()).toEqual(["eth_chainId", "evm_mine"]);
    const gal = await honestNode(38836);
    const gc = new L2.EvmJsonRpcClient({ url: gal.url, profile: "igra-galleon" });
    expect(await gc.callRpc("eth_chainId")).toBe("0x" + (38836).toString(16));
    await expect(gc.callRpc("evm_mine")).rejects.toThrow(code("L2_RPC_METHOD_FORBIDDEN"));
    await expect(gc.callRpc("anvil_setBalance", [TEST_ADDR, "0x1"])).rejects.toThrow(code("L2_RPC_METHOD_FORBIDDEN"));
    expect(gal.methods()).toEqual(["eth_chainId"]);
  });

  // Closure audit: a local refusal before the send is definite; only post-send unknowns are uncertain.
  it("a malformed raw is a definite, typed local refusal on both paths, never an uncertain broadcast", async () => {
    const rpc = await honestNode(31337);
    const { client, rawTransaction } = await signedLocal(rpc);
    const before = rpc.methods().length;
    // The guard checks the hex itself, so this does not depend on how the tx parser treats it.
    for (const bad of ["0x" + rawTransaction.slice(3), rawTransaction.slice(0, -1), rawTransaction + " ", "0x"]) {
      const err: any = await L2.sendRawTransactionResilient(client, bad, { maxReconcileAttempts: 2, reconcileIntervalMs: 5 }).catch((e) => e);
      expect(err).not.toBeInstanceOf(L2.UncertainBroadcastError);
      expect(err.code).toBe("L2_INVALID_TX_PARAMS");
      await expect(client.sendRawTransaction(bad, {})).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
    }
    expect(rpc.methods().slice(before)).toEqual([]);
  });
  it("after the request leaves: lost connection, HTTP 5xx and timeout are uncertain; a JSON-RPC rejection is definite", async () => {
    for (const reply of [{ destroy: true as const }, { raw: "oops", status: 502 }, { delayMs: 400, then: { result: "0x" } }]) {
      const rpc = await honestNode(31337, { eth_sendRawTransaction: () => reply });
      const { rawTransaction, txHash } = await signedLocal(rpc);
      const client = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local", timeoutMs: 150 });
      const err: any = await L2.sendRawTransactionResilient(client, rawTransaction, { maxReconcileAttempts: 1, reconcileIntervalMs: 5 }).catch((e) => e);
      expect(err).toBeInstanceOf(L2.UncertainBroadcastError);
      expect(err.txHash).toBe(txHash);
      expect(rpc.methods()).toContain("eth_getTransactionReceipt"); // reconciled by hash, never re-signed
    }
    const rpc = await honestNode(31337, { eth_sendRawTransaction: () => ({ error: { code: -32000, message: "insufficient funds for gas * price + value" } }) });
    const { client, rawTransaction } = await signedLocal(rpc);
    const err: any = await L2.sendRawTransactionResilient(client, rawTransaction, { maxReconcileAttempts: 1, reconcileIntervalMs: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(L2.EvmJsonRpcError);
    expect(err).not.toBeInstanceOf(L2.UncertainBroadcastError);
    expect(rpc.methods()).not.toContain("eth_getTransactionReceipt");
  });
});

describe("M-04 CREATE address verification", () => {
  async function deployNode(receiptFor: (h: string, from: string) => any, nonce = "0x7") {
    return mock(31337, {
      eth_getTransactionCount: () => ({ result: nonce }),
      eth_sendRawTransaction: (p) => ({ result: keccak256(p[0]) }),
      eth_getTransactionReceipt: (p) => ({ result: receiptFor(p[0], TEST_ADDR.toLowerCase()) })
    });
  }
  const signer = () => new L2.EvmLocalAccountSigner(TEST_PK, { profile: "local" });
  const client = (rpc: MockRpc) => new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
  const derived7 = getContractAddress({ from: TEST_ADDR, nonce: 7n });

  it("correct address -> accepted, returned address is the derived one", async () => {
    const rpc = await deployNode((h, from) => ({ transactionHash: h, status: "0x1", blockNumber: "0x5", from, contractAddress: derived7 }));
    const r = await L2.deployContract(client(rpc), signer(), { bytecode: "0x6000", gasLimit: 100000n });
    expect(r.contractAddress.toLowerCase()).toBe(derived7.toLowerCase());
    expect(r.deploymentKind).toBe("create");
  });
  it("manipulated address -> L2_CONTRACT_ADDRESS_MISMATCH", async () => {
    const rpc = await deployNode((h, from) => ({ transactionHash: h, status: "0x1", blockNumber: "0x5", from, contractAddress: "0x000000000000000000000000000000000000dEaD" }));
    await expect(L2.deployContract(client(rpc), signer(), { bytecode: "0x6000", gasLimit: 100000n })).rejects.toThrow(code("L2_CONTRACT_ADDRESS_MISMATCH"));
  });
  it("address derived from a different nonce -> mismatch", async () => {
    const wrongNonce = getContractAddress({ from: TEST_ADDR, nonce: 8n });
    const rpc = await deployNode((h, from) => ({ transactionHash: h, status: "0x1", blockNumber: "0x5", from, contractAddress: wrongNonce }));
    await expect(L2.deployContract(client(rpc), signer(), { bytecode: "0x6000", gasLimit: 100000n })).rejects.toThrow(code("L2_CONTRACT_ADDRESS_MISMATCH"));
  });
  it("absent / null contractAddress -> error", async () => {
    for (const contractAddress of [undefined, null]) {
      const rpc = await deployNode((h, from) => ({ transactionHash: h, status: "0x1", blockNumber: "0x5", from, contractAddress }));
      await expect(L2.deployContract(client(rpc), signer(), { bytecode: "0x6000", gasLimit: 100000n })).rejects.toThrow(code("L2_CONTRACT_ADDRESS_MISMATCH"));
    }
  });
  it("incomplete receipt (malformed contractAddress) -> typed receipt error", async () => {
    const rpc = await deployNode((h) => ({ transactionHash: h, status: "0x1", contractAddress: "0x12" }));
    await expect(L2.deployContract(client(rpc), signer(), { bytecode: "0x6000", gasLimit: 100000n })).rejects.toThrow(code("L2_RECEIPT_INVALID"));
  });
  it("reverted deployment -> EvmTransactionRevertedError", async () => {
    const rpc = await deployNode((h, from) => ({ transactionHash: h, status: "0x0", blockNumber: "0x5", from, contractAddress: derived7 }));
    await expect(L2.deployContract(client(rpc), signer(), { bytecode: "0x6000", gasLimit: 100000n })).rejects.toBeInstanceOf(L2.EvmTransactionRevertedError);
  });
});

describe("M-05 fee ceilings", () => {
  it("normal fees -> ok", async () => {
    const rpc = await mock(31337);
    await expect(signedLocal(rpc)).resolves.toBeDefined();
  });
  it("RPC-manipulated gas price -> L2_FEE_LIMIT_EXCEEDED", async () => {
    const rpc = await mock(31337, { eth_gasPrice: () => ({ result: "0x" + (10n ** 24n).toString(16) }) });
    await expect(signedLocal(rpc)).rejects.toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
  });
  it("RPC-manipulated gas estimate -> exceeded", async () => {
    const rpc = await mock(31337, { eth_estimateGas: () => ({ result: "0x" + (10n ** 9n).toString(16) }) });
    await expect(signedLocal(rpc)).rejects.toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
  });
  it("user gas limit too high / huge values (no overflow) -> exceeded", async () => {
    const rpc = await mock(31337);
    await expect(signedLocal(rpc, { gasLimit: 10n ** 40n })).rejects.toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
    await expect(signedLocal(rpc, { maxFeePerGas: 2n ** 255n, maxPriorityFeePerGas: 1n })).rejects.toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
  });
  it("fee-per-gas ceiling applies on its own, even when the total stays under its ceiling", async () => {
    const limits = { maxGasLimit: 1_000_000n, maxFeePerGasWei: 10n, maxTotalFeeWei: 10n ** 19n };
    expect(() => L2.assertFeeWithinLimits({ gasLimit: 21_000n, feePerGasWei: 11n }, limits)).toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
    expect(() => L2.assertFeeWithinLimits({ gasLimit: 21_000n, feePerGasWei: 10n }, limits)).not.toThrow();
    // End to end: a node quoting 11 wei/gas against a 10 wei/gas ceiling is refused before signing.
    const rpc = await mock(31337, { eth_gasPrice: () => ({ result: "0xb" }) });
    const client = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
    await expect(
      L2.prepareEvmTransaction(client, TEST_ADDR, { to: OTHER_ADDR, value: 1n }, { feeLimits: limits })
    ).rejects.toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
  });
  it("total-cost ceiling applies even when each factor is under its own ceiling", () => {
    expect(() =>
      L2.assertFeeWithinLimits({ gasLimit: 1_000_000n, feePerGasWei: 10n ** 13n }, { maxGasLimit: 1_000_000n, maxFeePerGasWei: 10n ** 13n, maxTotalFeeWei: 10n ** 18n })
    ).toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
  });
  it("negative values / incompatible fee params -> L2_INVALID_TX_PARAMS", async () => {
    const rpc = await mock(31337);
    await expect(signedLocal(rpc, { value: -1n })).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
    await expect(signedLocal(rpc, { gasLimit: -5n })).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
    await expect(signedLocal(rpc, { gasPrice: 1n, maxFeePerGas: 2n })).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
    await expect(signedLocal(rpc, { type: "legacy", maxFeePerGas: 2n })).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
    await expect(signedLocal(rpc, { maxFeePerGas: 5n, maxPriorityFeePerGas: 9n })).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
    await expect(signedLocal(rpc, { nonce: 2 ** 60 })).rejects.toThrow(code("L2_INVALID_TX_PARAMS"));
  });
  it("profile without fee policy (Galleon) and no explicit limits -> L2_FEE_POLICY_REQUIRED", async () => {
    const rpc = await mock(38836);
    const c = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "igra-galleon" });
    await expect(L2.prepareEvmTransaction(c, TEST_ADDR, { to: OTHER_ADDR })).rejects.toThrow(code("L2_FEE_POLICY_REQUIRED"));
    expect(() => new L2.EvmLocalAccountSigner(TEST_PK, { profile: "igra-galleon" })).toThrow(code("L2_FEE_POLICY_REQUIRED"));
  });
});

describe("L-01..L-04 strict JSON-RPC", () => {
  it("response id mismatch / missing jsonrpc / malformed error -> typed invalid-response error", async () => {
    const rpc = await mock(1, {
      eth_blockNumber: () => ({ idOverride: "not-my-id", result: "0x99" }),
      eth_gasPrice: () => ({ raw: JSON.stringify({ id: 1, result: "0x1" }) }),
      eth_getBalance: () => ({ raw: JSON.stringify({ jsonrpc: "2.0", id: null, error: "boom" }) })
    });
    const c = new L2.EvmJsonRpcClient({ url: rpc.url });
    await expect(c.getBlockNumber()).rejects.toThrow(code("L2_RPC_RESPONSE_INVALID"));
    await expect(c.getGasPriceWei()).rejects.toThrow(code("L2_RPC_RESPONSE_INVALID"));
    await expect(c.getBalanceWei(TEST_ADDR)).rejects.toThrow(code("L2_RPC_RESPONSE_INVALID"));
  });
  it("non-hex quantities are rejected with a typed error", async () => {
    const rpc = await mock(1, { eth_blockNumber: () => ({ result: 99 }), eth_gasPrice: () => ({ result: "12" }) });
    const c = new L2.EvmJsonRpcClient({ url: rpc.url });
    await expect(c.getBlockNumber()).rejects.toThrow(code("L2_RPC_RESPONSE_INVALID"));
    await expect(c.getGasPriceWei()).rejects.toThrow(code("L2_RPC_RESPONSE_INVALID"));
  });
  it("unknown receipt status is never success", async () => {
    const rpc = await mock(31337, {
      eth_sendRawTransaction: (p) => ({ result: keccak256(p[0]) }),
      eth_getTransactionReceipt: (p) => ({ result: { transactionHash: p[0], status: "0x2" } })
    });
    const { client, rawTransaction } = await signedLocal(rpc);
    await expect(L2.sendAndConfirmTransaction(client, rawTransaction)).rejects.toThrow(code("L2_RECEIPT_STATUS_UNKNOWN"));
  });
  it("garbage blockNumber in a receipt -> typed L2_RECEIPT_INVALID", () => {
    expect(() =>
      L2.normalizeEvmTransactionReceipt({ transactionHash: "0x" + "22".repeat(32), status: "0x1", blockNumber: "garbage" })
    ).toThrow(code("L2_RECEIPT_INVALID"));
  });
});

describe("L-05 reorg vs not-found", () => {
  const H = "0x" + "33".repeat(32);
  const B = "0x" + "44".repeat(32);
  it("no receipt -> not_found_on_node (NOT a reorg)", async () => {
    const rpc = await mock(31337);
    const r = await L2.verifyTransactionCanonical(new L2.EvmJsonRpcClient({ url: rpc.url }), H, B, 5n);
    expect(r.status).toBe("not_found_on_node");
    expect(r.reason).not.toMatch(/reorged out/);
  });
  it("no receipt and the original height now has another hash -> reorg_observed_on_node", async () => {
    const rpc = await mock(31337, { eth_getBlockByNumber: () => ({ result: { hash: "0x" + "55".repeat(32) } }) });
    const r = await L2.verifyTransactionCanonical(new L2.EvmJsonRpcClient({ url: rpc.url }), H, B, 5n);
    expect(r.status).toBe("reorg_observed_on_node");
  });
  it("receipt in another block -> reincluded_in_other_block; same block -> canonical_on_node", async () => {
    const moved = await mock(31337, { eth_getTransactionReceipt: () => ({ result: { transactionHash: H, status: "0x1", blockHash: "0x" + "66".repeat(32), blockNumber: "0x6" } }) });
    expect((await L2.verifyTransactionCanonical(new L2.EvmJsonRpcClient({ url: moved.url }), H, B)).status).toBe("reincluded_in_other_block");
    const same = await mock(31337, { eth_getTransactionReceipt: () => ({ result: { transactionHash: H, status: "0x1", blockHash: B, blockNumber: "0x5" } }) });
    const r = await L2.verifyTransactionCanonical(new L2.EvmJsonRpcClient({ url: same.url }), H, B);
    expect(r.status).toBe("canonical_on_node");
    expect(r.observation).toBe("rpc_reported");
  });
  it("confirmations are an RPC observation, never negative, never L1 settlement", async () => {
    const rpc = await mock(31337, {
      eth_getTransactionReceipt: () => ({ result: { transactionHash: H, status: "0x1", blockNumber: "0x10" } }),
      eth_blockNumber: () => ({ result: "0x10" })
    });
    const r = await L2.waitForConfirmations(new L2.EvmJsonRpcClient({ url: rpc.url }), H, { requiredConfirmations: 1 });
    expect(r.confirmations).toBe(1n);
    expect(r.observation).toBe("rpc_reported");
    expect(r.l1SettlementStatus).toBe("unverified_on_l1");
  });
});

describe("Nonces", () => {
  it("a failed prepare returns its managed nonce (no gap)", async () => {
    const rpc = await mock(31337, { eth_getTransactionCount: () => ({ result: "0x4" }), eth_gasPrice: () => ({ result: "0x" + (10n ** 24n).toString(16) }) });
    const client = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
    const nm = new L2.EvmNonceManager();
    await expect(L2.prepareEvmTransaction(client, TEST_ADDR, { to: OTHER_ADDR }, { nonceManager: nm })).rejects.toThrow(code("L2_FEE_LIMIT_EXCEEDED"));
    expect(nm.peekNextNonce(TEST_ADDR, 31337)).toBe(4);
  });
  it("releasing a non-latest nonce forces a resync from the node (gap closed)", async () => {
    const rpc = await mock(31337, { eth_getTransactionCount: () => ({ result: "0x4" }) });
    const client = new L2.EvmJsonRpcClient({ url: rpc.url, profile: "local" });
    const nm = new L2.EvmNonceManager();
    const got = await Promise.all([1, 2, 3].map(() => nm.acquireNonce(client, TEST_ADDR)));
    expect([...got].sort()).toEqual([4, 5, 6]);
    expect(nm.releaseUnusedNonce(TEST_ADDR, 31337, 4)).toBe(false);
    expect(await nm.acquireNonce(client, TEST_ADDR)).toBe(4);
  });
});
