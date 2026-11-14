import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IndexerToolkit } from "../src/indexer.js";

// rc2 audit (E-03): IndexerToolkit.watch() polled a placeholder source (`source: {}`) every second forever, watching
// nothing and keeping the process alive. Without a backend that lists UTXOs it now starts no timer and warns once;
// with one, it polls that backend and reports each new UTXO once.
describe("E-03 · IndexerToolkit.watch watches something or says it does not", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hk-indexer-watch-"));

  it("without a backend that lists UTXOs: no polling timer, one HARDKAS_INDEXER_WATCH_INACTIVE warning", async () => {
    (IndexerToolkit as any).inactiveWatchWarned = false;
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => undefined);
    const idx = IndexerToolkit.open({ dataDir: tmp() });
    await idx.watch("kaspa:store-1");
    await idx.watch(["kaspa:store-1", "kaspa:store-2"]);
    expect(((idx as any).subscriber as any).activeIntervals.size).toBe(0);
    const codes = warn.mock.calls.map((c) => (c[1] as any)?.code);
    expect(codes.filter((c) => c === "HARDKAS_INDEXER_WATCH_INACTIVE")).toHaveLength(1);
  });

  it("with a backend that lists UTXOs: the handler gets each new UTXO of a watched address once", async () => {
    vi.useFakeTimers();
    const listed: any[] = [{ transactionId: "aa".repeat(32), index: 0, amount: 100_000_000n }];
    const backend = {
      name: "test-backend",
      type: "test",
      capabilities: { snapshots: false, deterministic: true, externalState: false },
      utxos: vi.fn(async () => listed)
    };
    const idx = IndexerToolkit.open({ dataDir: tmp(), backend });
    const events: any[] = [];
    await idx.watch("kaspa:store-1", (e) => {
      events.push(e);
    });
    expect(((idx as any).subscriber as any).activeIntervals.size).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events).toEqual([
      { type: "payment", address: "kaspa:store-1", transactionId: "aa".repeat(32), amountSompi: 100_000_000n }
    ]);

    listed.push({ transactionId: "bb".repeat(32), index: 1, amount: 5n });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(events.map((e) => e.transactionId)).toEqual(["aa".repeat(32), "bb".repeat(32)]);

    for (const t of ((idx as any).subscriber as any).activeIntervals.values()) clearInterval(t);
  });
});
