// L1-CORE-1 B4 · tx compare: compares two receipt files the CLI itself wrote (two simulated payments of different
// amounts). The command has no --json; its exit code and its printed rows are asserted: a receipt against itself is
// DELTA_ACCEPTABLE (exit 0), different amounts are FIDELITY_FAIL (exit 1), the fee delta shows each receipt's fee, and
// an unreadable path is refused naming it.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import { cli, simulatedWorkspace, pay, removeDir, type Payment } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

const MUST_MATCH = ["Amount (Sompi)", "Network Intent", "Mode", "Parent Artifact Hash", "Root Artifact Hash"];
const row = (stdout: string, name: string) => stdout.split(/\r?\n/).find((l) => l.includes(name)) ?? "";

describe("tx compare <simulatedPath> <realPath>", () => {
  let parent: string;
  let ws: string;
  let p1: Payment;
  let p2: Payment;

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-tx-compare-"));
    p1 = pay(ws, "1");
    p2 = pay(ws, "2");
  });
  afterAll(() => removeDir(parent));

  it("a receipt against itself: every must-match row matches, DELTA_ACCEPTABLE, exit 0", () => {
    const r = cli(["tx", "compare", p1.receiptPath, p1.receiptPath], ws);
    expect(r.status, r.all.slice(0, 800)).toBe(0);
    for (const name of MUST_MATCH) expect(row(r.stdout, name), name).toMatch(/✓/);
    expect(r.stdout).not.toMatch(/✗/);
    expect(r.stdout).toMatch(/Simulation Fidelity: DELTA_ACCEPTABLE/);
    expect(row(r.stdout, "Amount (Sompi)")).toContain(p1.receipt.amountSompi);
  });

  it("the fee delta shows each receipt's recorded fee (feeSompi), not N/A", () => {
    const r = cli(["tx", "compare", p1.receiptPath, p2.receiptPath], ws);
    const fees = row(r.stdout, "Fees");
    expect(fees).toContain(`SIM: ${p1.receipt.feeSompi}`);
    expect(fees).toContain(`REAL: ${p2.receipt.feeSompi}`);
  });

  it("receipts of different amounts: the amount row fails with both values, FIDELITY_FAIL, exit 1", () => {
    const r = cli(["tx", "compare", p1.receiptPath, p2.receiptPath], ws);
    expect(r.status, r.all.slice(0, 800)).toBe(1);
    expect(row(r.stdout, "Amount (Sompi)")).toMatch(new RegExp(`✗.*SIM: ${p1.receipt.amountSompi}\\s+\\|\\s+REAL: ${p2.receipt.amountSompi}`));
    expect(r.all).toMatch(/FIDELITY_FAIL/);
    expect(r.stdout).not.toMatch(/DELTA_ACCEPTABLE/);
  });

  it("an unreadable path: exit 1, refused naming which receipt could not be read", () => {
    const missing = path.join(ws, "no-such-receipt.json");
    const real = cli(["tx", "compare", p1.receiptPath, missing], ws);
    expect(real.status, real.all.slice(0, 800)).toBe(1);
    expect(real.all).toContain(`Failed to read real receipt: ${missing}`);
    const sim = cli(["tx", "compare", missing, p1.receiptPath], ws);
    expect(sim.status, sim.all.slice(0, 800)).toBe(1);
    expect(sim.all).toContain(`Failed to read simulated receipt: ${missing}`);
  });
});
