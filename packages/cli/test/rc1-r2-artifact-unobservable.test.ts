import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, HARDKAS_VERSION, calculateContentHash } from "@hardkas/artifacts";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { assertHermeticPreloadActive } from "./hermetic-child.js";
import { startFakeNode, runCli, tempDir, type FakeNode } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// RC1-R2 · `artifact verify` of a historical transaction a node cannot show. Found by INT9 (TN10 read-only: an old
// submission whose submit point is pruned and that names no output; an old payment whose outputs were spent): the
// network level said NOT_OBSERVED with reason NOT_FOUND — readable as "this transaction does not exist" — although the
// node simply cannot show it. Now NOT_FOUND is kept only where absence is established (a complete window from a start
// that precedes any acceptance: --since, the artifact's served submit point, or a pruning point that is the genesis);
// otherwise the reason is NOT_OBSERVABLE_HERE with typed causes and the window the look read. The level stays NOT_OBSERVED
// (nothing that read it before changes meaning), consensus stays NOT_CONFIRMED with the same reason.
// -----------------------------------------------------------------------------

const hex = (seed: string) => Buffer.from(seed.padEnd(32, "#").slice(0, 32)).toString("hex");
const TEST_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef"; // BIP-340 vector 1, never funds
const addrOf = (network: string) => String(new (loadManagedKaspaWasmSync() as any).PrivateKey(TEST_KEY).toAddress(network).toString());

function seal(draft: Record<string, unknown>): any {
  const d: Record<string, unknown> = JSON.parse(JSON.stringify(draft));
  delete d.contentHash;
  return { ...d, contentHash: calculateContentHash(d, CURRENT_HASH_VERSION) };
}

function deployRecord(network: string, txId: string) {
  return seal({
    schema: "hardkas.silverDeploy.v1",
    hardkasVersion: HARDKAS_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
    networkId: network,
    capability: "silver.p2sh.deploy-spend.v1",
    compileRecord: { path: "c.json", contentHash: "a".repeat(64), artifactSha256: "b".repeat(64) },
    contract: "Vault",
    lockingScript: { version: 0, script: "aa20" + "11".repeat(32) + "87" },
    address: addrOf(network),
    txId,
    outpoint: { transactionId: txId, index: 0 },
    valueSompi: "100000000",
    feeSompi: "2036",
    status: "confirmed",
    confirmedAtBlockDaaScore: "1234",
    node: { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network, sync: "synced", endpoint: "ws://127.0.0.1:26320" },
    version: ARTIFACT_VERSION,
    mode: "rpc",
    hashVersion: CURRENT_HASH_VERSION
  });
}

const made: string[] = [];
const fakes: FakeNode[] = [];
let dir = "";
let logs = "";
const write = (name: string, value: unknown) => {
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
};
const fake = async (label: string, o: Parameters<typeof startFakeNode>[1]) => {
  const f = await startFakeNode(`r2u-${label}`, o);
  fakes.push(f);
  return f;
};
const verify = (name: string, file: string, extra: string[] = []) => runCli(logs, name, ["artifact", "verify", file, "--json", ...extra], dir);
const levels = (r: any) => r.json?.result?.levels;

beforeAll(() => {
  assertHermeticPreloadActive();
  dir = tempDir("hk-r2u-", made);
  logs = tempDir("hk-r2u-logs-", made);
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("RC1-R2 · a transaction this node cannot show is a limitation (NOT_OBSERVABLE_HERE), never 'not found'", () => {
  it("U-1 accepted before the node's pruning point, its output spent since: NOT_OBSERVED · NOT_OBSERVABLE_HERE (PRUNED_HISTORY + OUTPUTS_SPENT_OR_ABSENT)", async () => {
    const txId = hex("r2u-old-spent");
    // accepted at chain block 100; the node's pruning point is block 300 (not its genesis); the UTXO set no longer has it
    const f = await fake("old-spent", { network: "testnet-10", tip: 500, pruningAt: 300, accepted: { [txId]: 100 } });
    const r = await verify("u-1", write("u-1", deployRecord("testnet-10", txId)), ["--url", f.url]);
    expect(r.status, r.brief).toBe(0);
    const net = levels(r)?.network;
    expect(net, r.brief).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE" });
    expect(net.causes, r.brief).toEqual(expect.arrayContaining(["PRUNED_HISTORY", "OUTPUTS_SPENT_OR_ABSENT"]));
    expect(net.causes, r.brief).not.toContain("SCAN_INCOMPLETE");
    expect(net.window, r.brief).toMatchObject({ fromKind: "pruning-point", from: f.hashOf(300), reachedTip: true, fromGenesis: false });
    expect(net.message, r.brief).toMatch(/not evidence that the transaction does not exist/);
    expect(levels(r)?.consensus, r.brief).toMatchObject({ level: "NOT_CONFIRMED", reason: "NOT_OBSERVABLE_HERE" });
    expect(levels(r)?.verdict, r.brief).toBe("INTEGRITY_VERIFIED");
    expect(f.methods).not.toContain("submitTransaction");
  });

  it("U-2 the look stopped at its batch bound before the node's tip: SCAN_INCOMPLETE (the acceptance may lie beyond it)", async () => {
    const txId = hex("r2u-beyond");
    // 20 batches of 5 chain blocks read 100 of 400; the acceptance is at block 350; the pruning point is the genesis
    const f = await fake("beyond", { network: "devnet", tip: 400, chainBatch: 5, accepted: { [txId]: 350 } });
    const r = await verify("u-2", write("u-2", deployRecord("devnet", txId)), ["--url", f.url]);
    const net = levels(r)?.network;
    expect(net, r.brief).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE" });
    expect(net.causes, r.brief).toEqual(expect.arrayContaining(["SCAN_INCOMPLETE", "OUTPUTS_SPENT_OR_ABSENT"]));
    expect(net.causes, r.brief).not.toContain("PRUNED_HISTORY");
    expect(net.window, r.brief).toMatchObject({ fromKind: "pruning-point", reachedTip: false, fromGenesis: true });
  });

  it("U-3 (contract kept) the whole chain from the genesis to the tip read, no mempool entry, no output: NOT_FOUND, with the window it rests on", async () => {
    const f = await fake("absent", { network: "testnet-10" });
    const r = await verify("u-3", write("u-3", deployRecord("testnet-10", hex("r2u-absent"))), ["--url", f.url, "--require", "network"]);
    expect(r.status, r.brief).toBe(1);
    const net = levels(r)?.network;
    expect(net, r.brief).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_FOUND" });
    expect(net.causes, r.brief).toBeUndefined();
    expect(net.window, r.brief).toMatchObject({ fromKind: "pruning-point", fromGenesis: true, reachedTip: true });
    expect(net.message, r.brief).toMatch(/whole window from the node's genesis to the node's tip/);
  });

  it("U-4 (control) the same old transaction with its output still unspent: observed through the UTXO set, not a limitation", async () => {
    const txId = hex("r2u-old-unspent");
    const f = await fake("old-unspent", {
      network: "testnet-10",
      tip: 500,
      pruningAt: 300,
      accepted: { [txId]: 100 },
      utxos: [{ address: addrOf("testnet-10"), transactionId: txId, index: 0, amount: "100000000", blockDaaScore: "3000200" }]
    });
    const r = await verify("u-4", write("u-4", deployRecord("testnet-10", txId)), ["--url", f.url, "--require", "consensus"]);
    expect(r.status, r.brief).toBe(0);
    expect(levels(r), r.brief).toMatchObject({ network: { level: "NETWORK_OBSERVED", observation: { source: "utxo-set" } }, consensus: { level: "CONSENSUS_CONFIRMED" } });
  });

  it("U-6 a node that is not there (--url to a closed port): NOT_CHECKED · NODE_UNREACHABLE, integrity only, nothing invented", async () => {
    const net = await import("node:net");
    const closed = net.createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", () => r()));
    const port = (closed.address() as import("node:net").AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const r = await verify("u-6", write("u-6", deployRecord("devnet", hex("r2u-dead"))), ["--url", `ws://127.0.0.1:${port}`, "--require", "network"]);
    expect(r.status, r.brief).toBe(1);
    expect(levels(r), r.brief).toMatchObject({ integrity: "INTEGRITY_VERIFIED", network: { level: "NOT_CHECKED", reason: "NODE_UNREACHABLE" }, consensus: { level: "NOT_CHECKED" }, verdict: "INTEGRITY_VERIFIED" });
    expect({ ok: r.json?.ok, code: r.json?.code }, r.brief).toEqual({ ok: false, code: "VERIFICATION_LEVEL_NOT_REACHED" });
  });

  it("U-7 found on rusty-kaspad: an unsynced node that never saw the transaction is not a negative — NOT_OBSERVABLE_HERE (NODE_NOT_SYNCED), never NOT_FOUND", async () => {
    // a whole chain from the genesis to the tip read, no mempool entry, no output — on a node that says it is not synced
    const f = await fake("unsynced-absent", { network: "devnet", isSynced: false, tip: 50 });
    const r = await verify("u-7", write("u-7", deployRecord("devnet", hex("r2u-unsynced"))), ["--url", f.url]);
    const net = levels(r)?.network;
    expect(net, r.brief).toMatchObject({ level: "NOT_OBSERVED", reason: "NOT_OBSERVABLE_HERE", window: { fromGenesis: true, reachedTip: true } });
    expect(net.causes?.[0], r.brief).toBe("NODE_NOT_SYNCED");
  });

  it("U-5 the human report says it is a limitation of this node", async () => {
    const txId = hex("r2u-human");
    const f = await fake("human", { network: "testnet-10", tip: 500, pruningAt: 300, accepted: { [txId]: 100 } });
    const r = await runCli(logs, "u-5", ["artifact", "verify", write("u-5", deployRecord("testnet-10", txId)), "--url", f.url], dir);
    expect(r.all, r.brief).toMatch(/NOT_OBSERVED \[NOT_OBSERVABLE_HERE\]/);
    expect(r.all, r.brief).toMatch(/Not observable on this node/);
  });
});
