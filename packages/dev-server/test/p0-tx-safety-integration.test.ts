import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Hono } from "hono";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

// P0-TX-SAFETY integration · 1A × 1B in the dev server, plus the multi-process mode the owner asked about:
//  - the node saying it already holds the transaction (1A's classification) is an UNKNOWN outcome at the dev server
//    too: the same payment is not planned and signed again;
//  - two dev-server processes on one workspace: only the lock's owner sends; another LIVE process is refused before
//    planning; when the owner is gone its lock is stale, taken over, and the log it left is replayed (its unfinished or
//    unknown sends stay blocked).

const node = vi.hoisted(() => ({
  cwd: "",
  network: "testnet-10" as string,
  plans: 0,
  broadcasts: [] as string[],
  error: undefined as string | undefined
}));

vi.mock("@hardkas/sdk", () => {
  const txIdOf = (n: number) => n.toString(16).padStart(64, "0");
  return {
    Hardkas: {
      create: vi.fn(async () => ({
        get cwd() { return node.cwd; },
        get network() { return node.network; },
        tx: {
          plan: vi.fn(async () => ({ id: `plan-${++node.plans}` })),
          sign: vi.fn(async () => ({ txId: txIdOf(node.plans) })),
          simulate: vi.fn(async (s: any) => ({ receipt: { txId: s.txId, mode: "simulator" } })),
          send: vi.fn(async (s: any) => {
            node.broadcasts.push(s.txId);
            const submitResult = node.error === undefined ? { accepted: true, transactionId: s.txId } : { accepted: false, error: node.error.replaceAll("<id>", s.txId) };
            const receipt = { txId: s.txId, submitResult };
            return { receipt, submission: receipt, txId: s.txId, submitted: submitResult.accepted };
          })
        }
      }))
    }
  };
});

const { dappTxRoutes } = await import("../src/routes/dapp-tx.js");
const guardModule: any = await import("../src/routes/send-guard.js");
const app = new Hono();
app.route("/api/tx", dappTxRoutes);
const restart = () => guardModule.__resetSendGuardForTests();

async function send(body: Record<string, unknown>) {
  const res = await app.request(new Request("http://localhost/api/tx/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return (await res.json()) as any;
}
const PAY = { from: "alice", to: "bob", amountSompi: "1000", allowDevAutoSign: true };
const roots: string[] = [];
const children: ChildProcess[] = [];
const lockOf = () => path.join(node.cwd, guardModule.SEND_GUARD_LOCK);

beforeEach(() => {
  node.cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-p0-int-"));
  roots.push(node.cwd);
  node.network = "testnet-10";
  node.plans = 0;
  node.broadcasts = [];
  node.error = undefined;
  restart();
});
afterAll(() => {
  for (const c of children) c.kill();
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

function otherLiveProcess(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  children.push(child);
  return new Promise((resolve) => child.once("spawn", () => resolve(child)));
}

describe("P0-TX-SAFETY integration · 'already held' answers never authorize another payment (1A classification at the dev server)", () => {
  it.each([
    "Rejected transaction <id>: transaction <id> is already in the mempool",
    "Rejected transaction <id>: transaction <id> was already accepted by the consensus",
    "Rejected transaction <id>: orphan transaction <id> is already in the orphan pool"
  ])("%s → outcome unknown; the same payment is refused (PRIOR_SEND_OUTCOME_UNKNOWN); one broadcast", async (error) => {
    node.error = error;
    const first = await send(PAY);
    expect(first.data?.outcome).toBe("unknown");
    node.error = undefined;
    const second = await send(PAY);
    expect(second.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(node.broadcasts).toHaveLength(1);
  });

  it("control: a real rejection is 'rejected' and does not block a corrected payment", async () => {
    node.error = "Rejected transaction <id>: transaction <id> is not standard: x";
    expect((await send(PAY)).data?.outcome).toBe("rejected");
    node.error = undefined;
    expect((await send(PAY)).ok).toBe(true);
  });
});

describe("P0-TX-SAFETY integration · several dev-server processes on one workspace", () => {
  it("another LIVE process owns the guard → broadcasting sends refused here before planning; simulator still runs", async () => {
    const other = await otherLiveProcess();
    fs.mkdirSync(path.dirname(lockOf()), { recursive: true });
    fs.writeFileSync(lockOf(), JSON.stringify({ pid: other.pid, at: new Date().toISOString() }));
    restart();
    const r = await send(PAY);
    expect(r.error?.code).toBe("SEND_GUARD_OWNED_BY_OTHER_PROCESS");
    expect(r.error?.message).toContain(String(other.pid));
    expect(node.plans).toBe(0);
    node.network = "simulated";
    expect((await send(PAY)).ok).toBe(true);
  });

  it("this process owns the guard: the lock names it", async () => {
    await send(PAY);
    expect(JSON.parse(fs.readFileSync(lockOf(), "utf8")).pid).toBe(process.pid);
  });

  it("the owner dies → its lock is stale → refused until a controlled recovery; then the log it left still blocks its unknown payment", async () => {
    // "process A" (this module, then a restart) leaves an unknown outcome in the log; the lock then names a live child
    node.error = "RPC request submitTransaction timed out after 5000ms";
    const a = await send(PAY);
    expect(a.data?.outcome).toBe("unknown");
    const other = await otherLiveProcess();
    fs.writeFileSync(lockOf(), JSON.stringify({ pid: other.pid, at: new Date().toISOString() }));
    restart();
    node.error = undefined;
    expect((await send(PAY)).error?.code).toBe("SEND_GUARD_OWNED_BY_OTHER_PROCESS");
    other.kill();
    await new Promise<void>((r) => other.once("exit", () => r()));
    // LOCK-RACE-1: a stale lock is not taken over automatically; a controlled recovery archives it first
    expect((await send(PAY)).error?.code).toBe("SEND_GUARD_LOCK_STALE");
    guardModule.recoverStaleSendGuardLock(node.cwd, { pid: other.pid });
    const b = await send(PAY);
    expect(b.error?.code).toBe("PRIOR_SEND_OUTCOME_UNKNOWN");
    expect(JSON.parse(fs.readFileSync(lockOf(), "utf8")).pid).toBe(process.pid);
    expect(node.broadcasts).toHaveLength(1);
  });

  it("a lock that names no checkable process → refused (fail closed)", async () => {
    fs.mkdirSync(path.dirname(lockOf()), { recursive: true });
    fs.writeFileSync(lockOf(), "not json");
    restart();
    expect((await send(PAY)).error?.code).toBe("SEND_GUARD_OWNED_BY_OTHER_PROCESS");
    expect(node.plans).toBe(0);
  });
});
