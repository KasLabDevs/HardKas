import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { cliDist } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

// -----------------------------------------------------------------------------
// WATCH-CLI-1 on a real rusty-kaspad v2.1.0 (simnet, the harness's own node): `hardkas watch <address> --json` prints a
// snapshot, then one JSON line per event while the address receives a payment (added), the payment matures (matured)
// and the output is spent (removed); `--until 3` ends it with an `end` line. Every transaction here is test setup
// (hand-made, signed with the harness's fixture keys); the command under test only reads.
// -----------------------------------------------------------------------------

let session: IsolatedSimnetSession;
let k: any;
let dir = "";
const WATCHED_KEY = "55".repeat(32);

const utxosOf = async (address: string): Promise<any[]> => (((await session.rpc.call("getUtxosByAddressesRequest", { addresses: [address] })) as any).entries ?? []);

/** A v0 payment of `amount` from `fromKey`'s UTXO `u` to `to` (change back to the payer). */
async function pay(fromKey: string, u: any, to: string, amount: bigint): Promise<string> {
  const from = new k.PrivateKey(fromKey).toAddress("simnet").toString();
  const fee = 1_000_000n;
  const outputs = [{ value: amount, scriptPublicKey: k.payToAddressScript(new k.Address(to)) }];
  const change = BigInt(u.utxoEntry.amount) - amount - fee;
  if (change > 0n) outputs.push({ value: change, scriptPublicKey: k.payToAddressScript(new k.Address(from)) });
  const tx = new k.Transaction({
    version: 0,
    inputs: [
      {
        previousOutpoint: u.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 1,
        utxo: { outpoint: u.outpoint, amount: BigInt(u.utxoEntry.amount), scriptPublicKey: new k.ScriptPublicKey(0, u.utxoEntry.scriptPublicKey.slice(4)), blockDaaScore: BigInt(u.utxoEntry.blockDaaScore), isCoinbase: u.utxoEntry.isCoinbase }
      }
    ],
    outputs: outputs.map((o) => ({ value: o.value, scriptPublicKey: new k.ScriptPublicKey(o.scriptPublicKey.version, o.scriptPublicKey.script) })),
    lockTime: 0n, subnetworkId: "00".repeat(20), gas: 0n, payload: "", storageMass: 0n
  });
  const res: any = await session.rpc.submitTransaction(k.signTransaction(tx, [new k.PrivateKey(fromKey)], true));
  return String(res.transactionId);
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  await mineBlocks(session, 1010, session.minerAddress);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-watch-cli-"));
});

afterAll(async () => {
  if (session) await stopIsolatedSimnet(session);
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

describe("WATCH-CLI-1 · hardkas watch on a real rusty-kaspad (simnet)", () => {
  it("snapshot, then added → matured → removed as JSON lines, and an end line after --until 3", async () => {
    const watched = new k.PrivateKey(WATCHED_KEY).toAddress("simnet").toString();
    const child = spawn(process.execPath, [cliDist, "watch", watched, "--network", "simnet", "--url", session.rpcUrl, "--until", "3", "--timeout", "400", "--json"], {
      cwd: dir,
      env: process.env,
      windowsHide: true
    });
    const lines: any[] = [];
    let stderr = "";
    let buffer = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.stdout.on("data", (d) => {
      buffer += String(d);
      let i: number;
      while ((i = buffer.indexOf("\n")) >= 0) {
        const text = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!text) continue;
        try {
          lines.push(JSON.parse(text));
        } catch {
          lines.push({ unparsed: text });
        }
      }
    });
    const exited = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
    let done = false;
    void exited.then(() => (done = true));
    const until = async (what: string, pred: () => boolean, mine: boolean) => {
      for (let i = 0; i < 600 && !pred(); i++) {
        if (done) break;
        if (mine) await mineBlocks(session, 1).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 300));
      }
      expect(pred(), `${what}: ${JSON.stringify(lines).slice(-1500)} ${stderr.slice(-800)}`).toBe(true);
    };
    try {
      await until("snapshot", () => lines.some((l) => l.event === "snapshot"), false);
      expect(lines[0]).toMatchObject({ event: "snapshot", address: watched, network: "simnet", utxos: [] });

      // a payment to the watched address
      const dag: any = await session.rpc.call("getBlockDagInfoRequest", {});
      const minerUtxo = (await utxosOf(session.minerAddress)).find((e: any) => !e.utxoEntry.isCoinbase || BigInt(e.utxoEntry.blockDaaScore) + 1000n <= BigInt(dag.virtualDaaScore));
      const paid = await pay(session.minerPrivateKey, minerUtxo, watched, 300_000_000n);
      await until("added", () => lines.some((l) => l.event === "added" && l.txid === paid), true);
      const added = lines.find((l) => l.event === "added");
      expect(added.outputs).toEqual([expect.objectContaining({ transactionId: paid, index: 0, amountSompi: "300000000", covenantBound: false })]);
      await until("matured", () => lines.some((l) => l.event === "matured" && l.txid === paid), true);

      // the watched output spent
      const own = (await utxosOf(watched)).find((e: any) => e.outpoint.transactionId === paid);
      expect(own, "the watched output at the node").toBeDefined();
      // the whole output (no change back to the watched address: that would be another `added`)
      await pay(WATCHED_KEY, own, session.minerAddress, 300_000_000n - 1_000_000n);
      await until("removed", () => lines.some((l) => l.event === "removed"), true);
      const removed = lines.find((l) => l.event === "removed");
      expect(removed.outputs).toEqual([expect.objectContaining({ transactionId: paid, index: 0, amountSompi: "300000000" })]);
      const code = await Promise.race([exited, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 60_000))]);
      expect(code, `${JSON.stringify(lines).slice(-1500)} ${stderr.slice(-800)}`).toBe(0);
      const kinds = lines.map((l) => l.event).filter((e) => e !== "disconnected" && e !== "reconnected");
      expect(kinds[0]).toBe("snapshot");
      expect(kinds[kinds.length - 1]).toBe("end");
      expect(lines[lines.length - 1]).toMatchObject({ event: "end", reason: "until", events: 3 });
      expect(kinds.slice(1, -1)).toEqual(["added", "matured", "removed"]);
    } finally {
      if (!done) child.kill();
    }
  });
});
