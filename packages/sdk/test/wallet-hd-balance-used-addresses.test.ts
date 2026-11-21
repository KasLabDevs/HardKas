/*
 * BETA-FIX W2 · task 3 — `HardkasHdWallets.scan` (`hardkas wallet hd balance`): `used` lists EVERY address the wallet's
 * local index has handed out (receive and change chains, up to the stored indices), with zero balances where empty,
 * plus any address past them the gap scan finds holding UTXOs. It used to list only the addresses that hold UTXOs now,
 * so an address that was used and then emptied disappeared although the index had advanced (found on Testnet-10,
 * 21-nov: the HD wallet's two receive addresses, spent by `wallet hd send`, vanished from `used`).
 * The JSON stays backward compatible: the same fields, each entry gaining `handedOut`.
 * Hermetic: a temp workspace, the node a fake `rpc` that lists UTXOs for one address (nothing contacted).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas, HardkasHdWallets, HdWalletManager } from "../src/index.js";

const PW = "hd-balance-used-password";
const FAST = { memory: 19_456, iterations: 2, parallelism: 1 };
const made: string[] = [];
const sdks: Hardkas[] = [];
let ws = "";

beforeAll(async () => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hd-used-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:9" } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  const m = new HdWalletManager({ workspaceRoot: ws, kdf: FAST });
  await m.create({ label: "w", network: "simnet", password: PW, words: 12 });
  // the local index: receive 0, 1 and 2 handed out, change 0 handed out (as `wallet hd address` and `send` record them)
  await m.markUsed("w", { account: 0, chain: "receive", index: 2 });
  await m.markUsed("w", { account: 0, chain: "change", index: 0 });
});

afterAll(async () => {
  for (const sdk of sdks) await sdk.close?.();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("BETA-FIX W2 · wallet hd balance lists every address the local index used", () => {
  it("receive 0..2 and change 0 are listed (zero where emptied), plus a funded address past the index; totals unchanged", async () => {
    const m = new HdWalletManager({ workspaceRoot: ws, kdf: FAST });
    const watch = m.watch("w", 0);
    const [r0, r1, r2] = watch.addresses("receive", 0, 3, "simnet");
    const r5 = watch.addresses("receive", 5, 1, "simnet")[0]!;
    const c0 = watch.addresses("change", 0, 1, "simnet")[0]!;
    const utxo = (address: string, txByte: string, amountSompi: bigint) => ({
      address,
      outpoint: { transactionId: txByte.repeat(32), index: 0 },
      amountSompi,
      scriptPublicKey: "",
      blockDaaScore: 10n,
      isCoinbase: false
    });
    const listed = new Map<string, any[]>([
      [r1!, [utxo(r1!, "a1", 500_000_000n)]],
      [r5, [utxo(r5, "a5", 200_000_000n)]]
    ]);
    const asked: string[] = [];
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    sdks.push(sdk);
    (sdk as any).rpc = {
      getUtxosByAddress: async (address: string) => {
        asked.push(address);
        return listed.get(address) ?? [];
      }
    };
    const scan = await new HardkasHdWallets(sdk, { kdf: FAST }).scan("w", { gapLimit: 5 });
    expect(scan.used.map((u) => [u.chain, u.index, u.address, u.balanceSompi, u.utxoCount, u.handedOut])).toEqual([
      ["receive", 0, r0, 0n, 0, true],
      ["receive", 1, r1, 500_000_000n, 1, true],
      ["receive", 2, r2, 0n, 0, true],
      ["receive", 5, r5, 200_000_000n, 1, false],
      ["change", 0, c0, 0n, 0, true]
    ]);
    // every field an entry had before is still there, with the same meaning
    for (const u of scan.used) {
      expect(Object.keys(u).sort()).toEqual(["account", "address", "balanceSompi", "chain", "covenantUtxoCount", "handedOut", "index", "path", "utxoCount"]);
    }
    expect(scan.totalSompi).toBe(700_000_000n);
    expect(scan.utxoCount).toBe(2);
    expect(scan.nextReceive).toBe(6);
    expect(scan.nextChange).toBe(1);
    expect(asked).toContain(r0);
  });

  it("a wallet whose index never moved and whose addresses hold nothing lists none (as before)", async () => {
    const m = new HdWalletManager({ workspaceRoot: ws, kdf: FAST });
    await m.create({ label: "fresh", network: "simnet", password: PW, words: 12 });
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    sdks.push(sdk);
    (sdk as any).rpc = { getUtxosByAddress: async () => [] };
    const scan = await new HardkasHdWallets(sdk, { kdf: FAST }).scan("fresh", { gapLimit: 3 });
    expect(scan.used).toEqual([]);
    expect(scan.totalSompi).toBe(0n);
  });
});
