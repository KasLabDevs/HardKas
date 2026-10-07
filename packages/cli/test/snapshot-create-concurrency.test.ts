import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSnapshot } from "@hardkas/core";
import { ArtifactStoreMutation } from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// SNAPSHOT-CREATE-CONCURRENCY-1 (phase 3): while snapshot create captures .hardkas/artifacts/**, no cooperative writer
// can modify the store; the published generation holds exactly the artifact bytes captured during that holding.
// Reproduced before the fix (2026-10-03, cut25, HEAD b24559af9 + phase 2B): the capture takes no lock, so a cooperative
// writer (through the store's gate) that completes a transaction while the walk is past plans/ and before receipts/
// ends up half in the published snapshot (its signed artifact and receipt without its plan).
// The writer runs as an independent operation of this process: it is started before the snapshot, outside its call
// chain, so it never joins a holding of the snapshot.

describe("SNAPSHOT-CREATE-CONCURRENCY-1 · the capture is one holding of the store", () => {
  let root: string;
  const store = () => path.join(root, ".hardkas", "artifacts");
  const put = (rel: string, body: object) => {
    const p = path.join(store(), rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(body) + "\n");
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-snapshot-create-concurrency-"));
    put("plans/txPlan-OLD.json", { schema: "hardkas.txPlan", tx: "old" });
    put("signed/signedTx-OLD.json", { schema: "hardkas.signedTx", tx: "old" });
    put("receipts/txReceipt-OLD.json", { schema: "hardkas.txReceipt", tx: "old" });
    put("misc/snapshot-OLD.json", { schema: "hardkas.snapshot.v1", tx: "old" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("a transaction a cooperative writer completes during the capture is wholly in the snapshot or not at all", async () => {
    const NEW = ["plans/txPlan-NEW.json", "signed/signedTx-NEW.json", "receipts/txReceipt-NEW.json"];
    const gate = new ArtifactStoreMutation(root);
    let walkAtReceipts!: () => void;
    const atReceipts = new Promise<void>((resolve) => (walkAtReceipts = resolve));
    // an independent cooperative operation: three writes through the store's gate, started outside the snapshot
    const writer = (async () => {
      await atReceipts;
      await gate.writeFile(NEW[0]!, JSON.stringify({ schema: "hardkas.txPlan", tx: "new" }));
      await gate.writeFile(NEW[1]!, JSON.stringify({ schema: "hardkas.signedTx", tx: "new" }));
      await gate.writeFile(NEW[2]!, JSON.stringify({ schema: "hardkas.txReceipt", tx: "new" }));
    })();

    const realReaddir = fsp.readdir.bind(fsp) as (...args: any[]) => Promise<any>;
    let fired = false;
    vi.spyOn(fsp, "readdir").mockImplementation((async (dir: any, opts: any) => {
      if (!fired && path.resolve(String(dir)) === path.join(store(), "receipts")) {
        // the walk has already captured misc/ and plans/: let the writer complete its transaction now (or give up
        // waiting for it after 1.5 s, which is what happens when the capture holds the store)
        fired = true;
        walkAtReceipts();
        await Promise.race([writer.catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
      }
      return realReaddir(dir, opts);
    }) as any);

    await createSnapshot({ hardkasDir: path.join(root, ".hardkas"), outputDir: path.join(root, "snapshots", "s1") });
    await writer;

    expect(fired, "the walk reached receipts/").toBe(true);
    const captured = NEW.filter((rel) => fs.existsSync(path.join(root, "snapshots", "s1", "artifacts", rel)));
    expect(captured.length === 0 || captured.length === NEW.length, `the snapshot holds part of transaction NEW: ${captured.join(", ")}`).toBe(true);
    expect(NEW.every((rel) => fs.existsSync(path.join(store(), rel))), "the writer's transaction is complete in the store").toBe(true);
  });

  it("waits for a holder of the store, then captures what the holder wrote before letting go", async () => {
    // another process holds the store (a lock file naming the live parent of this test process)
    const lockFile = path.join(root, ".hardkas", "locks", "artifacts.lock");
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(
      lockFile,
      JSON.stringify({ schema: "hardkas.lock.v1", name: "artifacts", pid: process.ppid, command: "another process (test)", cwd: root, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null }, null, 2)
    );
    let settled = false;
    const creating = createSnapshot({ hardkasDir: path.join(root, ".hardkas"), outputDir: path.join(root, "snapshots", "s1") }).finally(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 1500));
    expect(settled, "the capture waits while the store is held").toBe(false);
    // the holder completes its write, then lets go of the store
    put("receipts/txReceipt-HELD.json", { schema: "hardkas.txReceipt", tx: "held" });
    fs.rmSync(lockFile);
    await creating;
    expect(fs.existsSync(path.join(root, "snapshots", "s1", "artifacts", "receipts", "txReceipt-HELD.json")), "the capture began after the holder let go").toBe(true);
  });
});
