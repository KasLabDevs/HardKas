import { beforeEach, describe, expect, it, vi } from "vitest";

// rc2 audit B4 (c): `localnet seed --timeout abc` became NaN (parseInt): the treasury transaction was broadcast, the
// confirmation loop never ran, and the command reported a timeout at once with the miner stopped. --timeout is now a
// positive whole number of milliseconds, and the seed amount (and a treasury transfer) a positive KAS amount, refused as
// usage errors (exit 2) before any runner is called. The runners are doubles here: nothing is contacted.

const h = vi.hoisted(() => ({ seed: [] as unknown[], fund: [] as unknown[], start: [] as unknown[] }));

vi.mock("../src/runners/localnet-treasury.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  runLocalnetSeed: vi.fn(async (o: unknown) => {
    h.seed.push(o);
  })
}));
vi.mock("../src/runners/localnet-runners.js", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  runLocalnetFund: vi.fn(async (o: unknown) => {
    h.fund.push(o);
  }),
  runLocalnetStart: vi.fn(async (o: unknown) => {
    h.start.push(o);
  })
}));

import { parseLocalnetTimeoutMs, parsePositiveKasOption } from "../src/commands/localnet.js";
import { buildHardkasProgram } from "../src/program.js";

const run = (args: string[]) => buildHardkasProgram({ forDocs: true }).parseAsync(args, { from: "user" });

beforeEach(() => {
  h.seed.length = 0;
  h.fund.length = 0;
  h.start.length = 0;
});

describe("B4 · localnet --timeout and amounts are validated", () => {
  it("--timeout: a positive whole number of ms, else LOCALNET_TIMEOUT_INVALID (exit 2)", () => {
    expect(parseLocalnetTimeoutMs("300000")).toBe(300000);
    expect(parseLocalnetTimeoutMs(" 1 ")).toBe(1);
    for (const raw of ["abc", "", "0", "-5", "1.5", "1e3", "12abc", "99999999999999999999", undefined]) {
      let err: any;
      try {
        parseLocalnetTimeoutMs(raw);
      } catch (e) {
        err = e;
      }
      expect(err?.code, String(raw)).toBe("LOCALNET_TIMEOUT_INVALID");
      expect(err?.exitCode).toBe(2);
    }
  });

  it("a seed amount / treasury transfer is a positive KAS amount, else the command's own usage error (exit 2)", () => {
    expect(parsePositiveKasOption("100", "--amount", "LOCALNET_SEED_INVALID_AMOUNT")).toBe(100n * 100_000_000n);
    expect(parsePositiveKasOption("0.5", "--amount", "LOCALNET_SEED_INVALID_AMOUNT")).toBe(50_000_000n);
    for (const raw of ["0", "abc", "-1", "", "1e3"]) {
      let err: any;
      try {
        parsePositiveKasOption(raw, "--amount", "LOCALNET_SEED_INVALID_AMOUNT");
      } catch (e) {
        err = e;
      }
      expect(err?.code, raw).toBe("LOCALNET_SEED_INVALID_AMOUNT");
      expect(err?.exitCode).toBe(2);
    }
  });

  it("the commands refuse before their runner is called: seed --timeout abc, seed --amount 0, fund --treasury --amount 0, start --seed --seed-amount x", async () => {
    await expect(run(["localnet", "seed", "--timeout", "abc"])).rejects.toMatchObject({ code: "LOCALNET_TIMEOUT_INVALID", exitCode: 2 });
    await expect(run(["localnet", "seed", "--amount", "0"])).rejects.toMatchObject({ code: "LOCALNET_SEED_INVALID_AMOUNT", exitCode: 2 });
    await expect(run(["localnet", "fund", "alice", "--timeout", "-1"])).rejects.toMatchObject({ code: "LOCALNET_TIMEOUT_INVALID", exitCode: 2 });
    await expect(run(["localnet", "fund", "alice", "--treasury", "--amount", "0"])).rejects.toMatchObject({ code: "LOCALNET_FUND_INVALID_AMOUNT", exitCode: 2 });
    await expect(run(["localnet", "start", "--toccata", "--seed", "--seed-amount", "x"])).rejects.toMatchObject({ code: "LOCALNET_SEED_INVALID_AMOUNT", exitCode: 2 });
    expect(h.seed).toEqual([]);
    expect(h.fund).toEqual([]);
    expect(h.start).toEqual([]);
  });

  it("valid values reach the runners as numbers and sompi (plain fund keeps its own amount parsing)", async () => {
    await run(["localnet", "seed", "--timeout", "1500", "--amount", "2"]);
    expect(h.seed[0]).toMatchObject({ timeoutMs: 1500, amountSompi: 200_000_000n });
    await run(["localnet", "fund", "alice", "--timeout", "2500"]);
    expect(h.fund[0]).toMatchObject({ timeoutMs: 2500, amountSompi: 1000n * 100_000_000n, treasury: false });
  });
});
