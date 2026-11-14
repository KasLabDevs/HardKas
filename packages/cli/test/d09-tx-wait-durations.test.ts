import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import { parseWaitSeconds, runTxWait } from "../src/runners/tx-wait-runner.js";
import { runCli, tempDir } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// D-09 · `tx wait --timeout` / `--interval` are durations. They used to go through Number(): "60s", "2m" or "abc" gave
// NaN, so the wait never timed out (a comparison with NaN is false) and the node was polled with no pause. Now a
// non-negative number of seconds, or one with a unit (ms, s, m), is accepted; anything else is TX_WAIT_USAGE (exit 2)
// before any connection.

const TX = "ab".repeat(32);
const made: string[] = [];
let dir = "";
let logs = "";

beforeAll(() => {
  dir = tempDir("hk-d09-", made);
  logs = tempDir("hk-d09-logs-", made);
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("D-09 · parseWaitSeconds", () => {
  it("accepts seconds, and ms / s / m units", () => {
    expect(parseWaitSeconds("60")).toBe(60);
    expect(parseWaitSeconds("0")).toBe(0);
    expect(parseWaitSeconds("0.5")).toBe(0.5);
    expect(parseWaitSeconds("60s")).toBe(60);
    expect(parseWaitSeconds("2m")).toBe(120);
    expect(parseWaitSeconds("500ms")).toBe(0.5);
  });

  it("refuses what is not a finite, non-negative duration", () => {
    for (const bad of ["abc", "", "-5", "-1s", "Infinity", "NaN", "1e3", "2h", "60 seconds", "1.", ".5", "0x10"]) {
      expect(parseWaitSeconds(bad), bad).toBeUndefined();
    }
  });

  it("the runner refuses a non-finite or negative timeout/interval before opening anything (TX_WAIT_USAGE)", async () => {
    for (const [timeoutMs, intervalMs] of [[Number.NaN, 1000], [-1, 1000], [Number.POSITIVE_INFINITY, 1000], [1000, Number.NaN], [1000, -5]]) {
      let code = "";
      try {
        await runTxWait({ txId: TX, until: "confirmed", timeoutMs, intervalMs, workspaceRoot: dir } as any);
      } catch (e: any) {
        code = String(e?.code ?? e?.message);
      }
      expect(code, `${timeoutMs}/${intervalMs}`).toBe("TX_WAIT_USAGE");
    }
  });
});

describe("D-09 · tx wait refuses a bad --timeout / --interval (exit 2, TX_WAIT_USAGE), nothing contacted", () => {
  for (const [name, args] of [
    ["timeout-abc", ["--timeout", "abc"]],
    ["timeout-negative", ["--timeout", "-5"]],
    ["interval-abc", ["--interval", "2x"]],
    ["interval-infinity", ["--interval", "Infinity"]]
  ] as const) {
    it(name, async () => {
      const r = await runCli(logs, name, ["tx", "wait", TX, ...args, "--json"], dir);
      expect(r.status, r.brief).toBe(2);
      expect(r.all, r.brief).toMatch(/TX_WAIT_USAGE/);
      expect(r.all, r.brief).toMatch(/non-negative number of seconds, optionally with a unit/);
      expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT") || d.startsWith("REFUSED")), r.brief).toEqual([]);
    });
  }
});
