import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escrowRoutes, escrowNode, memoryStore, type EscrowRecord } from "../src/routes/escrow.js";
import { H, factoryOf, fakeEscrowNode, type FakeEscrowNode } from "./helpers/fake-escrow-node.js";

await vi.hoisted(async () => {
  const osMod = await import("node:os");
  const pathMod = await import("node:path");
  const fsMod = await import("node:fs");
  process.env.HARDKAS_ESCROW_STORE_PATH = pathMod.join(
    fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), "hk-es-mutex-store-")),
    "escrow-store.json"
  );
});

const json = { "Content-Type": "application/json" };

describe("Priority 7 · escrow route per-id mutex prevents concurrent double-funding", () => {
  let dir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  let buyer: { address: string; xOnly: string; spk: string };
  let node: FakeEscrowNode;

  beforeAll(async () => {
    process.env.HARDKAS_DEV_SERVER_AUTOSIGN = "1";
    const { getOrCreateDevAccount, loadKaspaWasm } = await import("@hardkas/accounts");
    const k: any = await loadKaspaWasm();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-es-mutex-"));
    const acc = await getOrCreateDevAccount(dir, 0, "buyer");
    const xOnly = String(new k.PrivateKey(acc.privateKey).toPublicKey().toXOnlyPublicKey().toString());
    buyer = { address: String(acc.address), xOnly, spk: `000020${xOnly}ac` };
  });

  afterAll(() => {
    delete process.env.HARDKAS_DEV_SERVER_AUTOSIGN;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    memoryStore.clear();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(dir);
    node = fakeEscrowNode();
    node.utxos = [
      {
        outpoint: { transactionId: H("mutex utxo"), index: 0 },
        address: buyer.address,
        amount: 50n * 100_000_000n,
        spk: buyer.spk,
        daa: 1001n
      }
    ];

    const baseFactory = factoryOf(node);
    // Inject an async pause on UTXO fetch so overlapping POST /:id/fund calls race if unserialized
    escrowNode.rpcFactory = (opts: any) => {
      const client: any = baseFactory(opts);
      const origGetUtxos = client.getUtxosByAddresses;
      return new Proxy(client, {
        get(target, prop) {
          if (prop === "getUtxosByAddresses") {
            return async (req: unknown) => {
              await new Promise((r) => setTimeout(r, 40));
              return origGetUtxos(req);
            };
          }
          return target[prop];
        }
      });
    };
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    escrowNode.rpcFactory = undefined;
  });

  it("concurrent POST /:id/fund requests submit only once and reject the second with 409", async () => {
    const id = crypto.randomUUID();
    const record = {
      id,
      config: {
        buyer: { publicKeyHex: buyer.xOnly },
        seller: { publicKeyHex: "22".repeat(32) },
        arbiter: { publicKeyHex: "33".repeat(32) },
        buyerDestinationSpk: "20" + "44".repeat(32) + "ac",
        sellerDestinationSpk: "20" + "55".repeat(32) + "ac",
        refundAmount: "100000000",
        releaseAmount: "100000000"
      },
      state: "CREATED",
      artifact: { schema_version: 1, contracts: {} },
      p2shState: { lockingScriptHex: "aa20" + H("mutex lock") + "87", redeemScriptHex: "aabbccdd75", address: "" },
      provenance: {},
      funding: { status: "none" },
      signatures: {}
    } as unknown as EscrowRecord;
    memoryStore.set(id, record);

    const [r1, r2] = await Promise.all([
      escrowRoutes.request(`/${id}/fund`, { method: "POST", headers: json, body: "{}" }),
      escrowRoutes.request(`/${id}/fund`, { method: "POST", headers: json, body: "{}" })
    ]);
    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    expect(node.submitted).toHaveLength(1);
  });
});
