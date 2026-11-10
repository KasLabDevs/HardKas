// L1-CORE-1 B4 · deploy history: the deployment records it lists are ones the CLI itself wrote (`deploy track`, one of
// them pointing at a simulated payment's txId and receipt) on two networks. Asserted: an empty history before any
// record, then every record across both networks, newest first, with what each record holds, in --json and human form.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { cli, envelope, jsonDocs, simulatedWorkspace, pay, removeDir, type Payment } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

describe("deploy history", () => {
  let parent: string;
  let ws: string;
  let p1: Payment;

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-deploy-history-"));
    p1 = pay(ws, "1");
  });
  afterAll(() => removeDir(parent));

  const history = () => {
    const r = cli(["deploy", "history", "--json"], ws);
    expect(r.status, r.all.slice(0, 800)).toBe(0);
    return jsonDocs(r.stdout)[0];
  };

  it("before any deployment: --json is an empty list, the human form says so, exit 0", () => {
    expect(history()).toEqual([]);
    const human = cli(["deploy", "history"], ws);
    expect(human.status).toBe(0);
    expect(human.stdout).toMatch(/No deployments found/);
  });

  it("after three tracked deployments on two networks: every record, newest first, as each was tracked", () => {
    const track = (args: string[]) => {
      const r = cli(["deploy", "track", ...args, "--json"], ws);
      expect(r.status, r.all.slice(0, 800)).toBe(0);
      return envelope(r.stdout).result;
    };
    const a = track(["v1", "--network", "simulated", "--tx-id", p1.receipt.txId, "--receipt", p1.receipt.contentHash]);
    const b = track(["v1", "--network", "simnet", "--status", "confirmed"]);
    const c = track(["v2", "--network", "simulated", "--status", "failed", "--notes", "b4"]);

    const list = history();
    expect(list.map((d: any) => [d.label, d.networkId, d.status, d.contentHash, d.txId])).toEqual([
      [c.label, "simulated", "failed", c.contentHash, undefined],
      [b.label, "simnet", "confirmed", b.contentHash, undefined],
      [a.label, "simulated", "sent", a.contentHash, p1.receipt.txId]
    ]);
    // history and list are the same records
    expect(jsonDocs(cli(["deploy", "list", "--json"], ws).stdout)[0]).toEqual(list);

    const human = cli(["deploy", "history"], ws);
    expect(human.status).toBe(0);
    expect(human.stdout).toMatch(/Total: 3 deployments across 2 networks/);
    expect(human.stdout).toMatch(/simulated[\s\S]*v2\s+failed[\s\S]*v1\s+sent/);
    expect(human.stdout).toMatch(/simnet[\s\S]*v1\s+confirmed/);
  });
});
