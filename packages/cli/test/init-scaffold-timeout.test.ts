import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeConsumerDir, removeConsumerDir, runCli, type ConsumerDir } from "./first-contact-helpers.js";

// The test `hardkas init` scaffolds runs a whole payment flow: measured on 1-nov-2026 at ~3.1 s on an idle machine and
// 7.6-7.9 s with every CPU busy (l2fix-evidence\28-stage5-7\first-contact-timing.txt), so vitest's 5 s default failed
// it on a loaded machine (seen in a full gate). The generated config gives it room, and the scaffolded scenario also
// passes its own 30 s budget (`scenario`'s last argument): either one alone covers it. This test checks the config.

let consumer: ConsumerDir | undefined;
afterEach(() => {
  removeConsumerDir(consumer);
  consumer = undefined;
});

describe("hardkas init · the scaffolded vitest config", () => {
  it("sets a test timeout that covers the scaffolded scenario on a busy machine (well above the 5 s default)", () => {
    consumer = makeConsumerDir("hk-init-timeout-", ["sdk", "testing"]);
    const r = runCli(["init", "."], consumer.dir);
    expect(r.status, r.out).toBe(0);
    const config = fs.readFileSync(path.join(consumer.dir, "vitest.config.ts"), "utf8");
    const m = /testTimeout:\s*([\d_]+)/.exec(config);
    expect(m, config).not.toBeNull();
    expect(Number(m![1]!.replace(/_/g, ""))).toBeGreaterThanOrEqual(20_000);
    // the rest of the scaffolded config is as before
    expect(config).toMatch(/fileParallelism: false/);
    expect(config).toMatch(/pool: "forks"/);
  }, 120_000);
});
