import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import ts from "typescript";
import { getOrCreateDevAccount } from "@hardkas/accounts";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { startFakeWrpcNode, type FakeWrpcNode } from "../../kaspa-rpc/test/helpers/fake-wrpc-node.js";
import { runTxStatus } from "../src/runners/tx-status-runner.js";
import { runTxWait } from "../src/runners/tx-wait-runner.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// RESOURCE-LIFECYCLE-1 (R0B) · RL-I1: whoever creates a HardKAS-owned resource closes it; RL-I3: on success and on error,
// in a finally. Since R0A the CLI no longer ends a finite command with process.exit(), so a command that leaves its RPC
// client connected never ends. Against a fake wRPC node on loopback (it answers every request with an error and keeps
// the connection), every path below must END BY ITSELF with the exit code and typed code it had before R0A. The
// controls already closed their client; they guard against a double close. RL-I2: an SDK injected into a runner is the
// caller's and is never closed by it.

interface CliRun {
  exit: number | null;
  killed: boolean;
  ms: number;
  stdout: string;
  stderr: string;
}

const KILL_AFTER_MS = 20_000;

const runCli = (args: string[], cwd: string): Promise<CliRun> =>
  new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, KILL_AFTER_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exit: killed ? null : code, killed, ms: Date.now() - t0, stdout, stderr });
    });
    child.stdin.end("");
  });

const codeOf = (r: CliRun): string | null => {
  const text = `${r.stdout}\n${r.stderr}`;
  return /"code"\s*:\s*"([A-Z][A-Z0-9_]+)"/.exec(r.stdout)?.[1] ?? /\[([A-Z][A-Z0-9_]+)\]/.exec(text)?.[1] ?? null;
};

describe("RESOURCE-LIFECYCLE-1 · a finite command closes what it opened and ends by itself", () => {
  let node: FakeWrpcNode;
  let parent: string;
  let ws: string;
  let alice: string;
  let bob: string;
  const TX = "e".repeat(64);

  beforeAll(async () => {
    node = await startFakeWrpcNode();
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r0b-"));
    ws = path.join(parent, "ws");
    fs.mkdirSync(ws);
    // the workspace's node networks point at the fake node (simnet as a local node, nodenet as an RPC endpoint)
    fs.writeFileSync(
      path.join(ws, "hardkas.config.ts"),
      `export default {\n  networks: {\n    nodenet: { kind: "kaspa-rpc", network: "simnet", rpcUrl: "${node.url}" },\n    simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "${node.url}" }\n  }\n};\n`
    );
    alice = (await getOrCreateDevAccount(ws, 0, "alice")).address;
    bob = (await getOrCreateDevAccount(ws, 1, "bob")).address;
    const track = spawnSync(process.execPath, [cliDist, "deploy", "track", "lbl", "--network", "nodenet", "--tx-id", "f".repeat(64), "--json"], { cwd: ws, env: childEnv(), encoding: "utf8", input: "", timeout: 60_000 });
    expect(track.status, `${track.stdout}${track.stderr}`).toBe(0);
  });

  afterAll(async () => {
    await node?.close();
    fs.rmSync(parent, { recursive: true, force: true });
  });

  // [path, argv, expected exit, expected typed code] — the exit and code each path had BEFORE R0A (process.exit).
  const MATRIX: Array<[string, () => string[], number, string | null]> = [
    ["kaspa doctor (runner-created client)", () => ["kaspa", "doctor", "--rpc-url", node.url], 1, "DOCTOR_FAILED"],
    ["tx status <txId> (the SDK's own client, opened by the runner)", () => ["tx", "status", TX, "--network", "simnet", "--json"], 0, null],
    ["tx wait <txId> (the SDK's own client, opened by the runner)", () => ["tx", "wait", TX, "--network", "simnet", "--timeout", "4", "--json"], 1, "TX_WAIT_TIMEOUT"],
    ["accounts consolidate (the runner's own client swapped into sdk.rpc)", () => ["accounts", "consolidate", "alice", "--network", "simnet", "--url", node.url, "--provider", "rpc", "--json"], 1, "UNKNOWN_ERROR"],
    ["kaspa wallet balance (runner-created client)", () => ["kaspa", "wallet", "balance", "alice", "--rpc-url", node.url, "--json"], 1, "WALLET_OPERATION_FAILED"],
    ["kaspa wallet send --dry-run (runner-created client)", () => ["kaspa", "wallet", "send", "alice", bob, "--amount", "1", "--dry-run", "--rpc-url", node.url], 1, "WALLET_OPERATION_FAILED"],
    ["tx plan error path (runner-created client)", () => ["tx", "plan", "--from", "alice", "--to", bob, "--amount", "1", "--network", "simnet", "--url", node.url, "--json"], 1, "UNKNOWN"],
    ["tx send --from/--to/--amount error path (through tx plan)", () => ["tx", "send", "--from", "alice", "--to", bob, "--amount", "1", "--network", "simnet", "--url", node.url, "--yes", "--json"], 1, "TX_SEND_FAILED"],
    ["control: accounts balance --url (already closed in a finally)", () => ["accounts", "balance", alice, "--network", "simnet", "--url", node.url, "--json"], 1, "UNKNOWN_ERROR"],
    ["control: rpc info --url (already closed in a finally)", () => ["rpc", "info", "--url", node.url, "--json"], 1, "RPC_INFO_UNAVAILABLE"],
    ["control: deploy status --verify (closed before)", () => ["deploy", "status", "lbl", "--network", "nodenet", "--verify"], 0, null]
  ];

  for (const [id, argv, exit, code] of MATRIX) {
    it(`${id}: ends by itself with exit ${exit}${code ? ` ${code}` : ""}`, async () => {
      const before = node.connections();
      const r = await runCli(argv(), ws);
      expect({ killed: r.killed, exit: r.exit, code: codeOf(r) }, `${r.stdout}\n${r.stderr}`).toEqual({ killed: false, exit, code });
      // it did reach the fake node, so the case exercises a connected client
      expect(node.connections()).toBeGreaterThan(before);
    });
  }

  it("workflow run --timeout: a run that finishes first leaves no timer behind; the command ends by itself", async () => {
    // Its own workspace: the workflow runs on the simulator and must not touch the node workspace above.
    const wf = path.join(parent, "wf");
    fs.mkdirSync(wf);
    fs.writeFileSync(path.join(wf, "wf-timeout.json"), JSON.stringify({ steps: [{ type: "network.switch", args: { network: "simulated" } }] }));
    const r = await runCli(["workflow", "run", "wf-timeout.json", "--network", "simulated", "--timeout", "60000", "--json"], wf);
    const status = /"status"\s*:\s*"(\w+)"/.exec(r.stdout)?.[1] ?? null;
    expect({ killed: r.killed, exit: r.exit, status }, `${r.stdout}\n${r.stderr}`).toEqual({ killed: false, exit: 0, status: "completed" });
  });

  it("RL-I1/RL-I3 static guard: every client or SDK the CLI creates is released in a finally of the function that creates it, or is listed with how it is released", () => {
    // A creation: `new JsonWrpcKaspaClient | KaspaWrpcClient | KaspaJsonRpcClient(...)` or `Hardkas.open | create(...)`.
    // Released: the nearest enclosing function has a `finally` that closes (`.close(`, `.disconnect(`, `release?.(`).
    // Anything else must be listed here, with how it is still released.
    const RELEASED_OTHERWISE: Record<string, string> = {
      "commands/silver.ts#canonicalNode": "returns the client; every caller closes it in its own finally",
      "runners/tx-status-runner.ts#openSdkForTx": "returns the SDK (runTxStatus / runTxWait close it); a probe it does not return is closed here",
      "runners/accounts-consolidate-runner.ts#consolidate": "hands the client to runAccountsConsolidate, whose finally closes it",
      "runners/tx-flow.ts#txFlow": "hands the SDK to runTxFlow, whose finally closes it",
      "runners/test-runner.ts#runTest": "opens the SDK only to prove the project and closes it at once",
      "runners/localnet-runners.ts#detectToccataNode": "closes the client on its only two paths (the try and the catch)",
      "runners/doctor-node-runner.ts#runCapabilitiesReport": "closes the client on every path (the loop's catch and after the loop)",
      "runners/rpc-doctor-runner.ts#checkKaspaEndpoint": "disconnects on each of its three paths (connect refused, answered, request refused)",
      "runners/workflow-runner.ts#runWorkflowRun": "closes the SDK when the run settles, not in a finally: a --timeout must not close it under the abandoned run (WORKFLOW-TIMEOUT-CANCELLATION-1)"
    };
    const srcRoot = path.resolve(__dirname, "../src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".ts")) files.push(p);
      }
    };
    walk(srcRoot);
    const CREATES = /^(new (JsonWrpcKaspaClient|KaspaWrpcClient|KaspaJsonRpcClient)\b|Hardkas\.(open|create)\b)/;
    const RELEASES = /\.close\(|\.disconnect\(|release\?\.\(/;
    const unreleased = new Set<string>();
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      if (!/JsonWrpcKaspaClient|KaspaWrpcClient|KaspaJsonRpcClient|Hardkas\.(open|create)/.test(text)) continue;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const rel = path.relative(srcRoot, file).split(path.sep).join("/");
      const visit = (node: ts.Node) => {
        const isCreation =
          (ts.isNewExpression(node) && CREATES.test(`new ${node.expression.getText(source)}`)) ||
          (ts.isCallExpression(node) && CREATES.test(node.expression.getText(source)));
        if (isCreation) {
          let fn: ts.Node | undefined = node.parent;
          while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
          const finallyReleases: string[] = [];
          const collect = (n: ts.Node) => {
            if (ts.isTryStatement(n) && n.finallyBlock) finallyReleases.push(n.finallyBlock.getText(source));
            ts.forEachChild(n, collect);
          };
          if (fn) collect(fn);
          if (!finallyReleases.some((f) => RELEASES.test(f))) {
            const name = fn && "name" in fn && fn.name ? (fn.name as ts.Node).getText(source) : "<anonymous>";
            unreleased.add(`${rel}#${name}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect({
      unreleased: [...unreleased].filter((k) => !(k in RELEASED_OTHERWISE)).sort(),
      staleEntries: Object.keys(RELEASED_OTHERWISE).filter((k) => !unreleased.has(k)).sort()
    }).toEqual({ unreleased: [], staleEntries: [] });
  });

  it("RL-I2: an SDK injected into tx status / tx wait is the caller's: the runner closes neither it nor its client, on success or on error", async () => {
    const injected = (observe: () => Promise<unknown>) => {
      const close = vi.fn(async () => {});
      const rpcClose = vi.fn(async () => {});
      const sdk = { network: "simnet", close, rpc: { close: rpcClose }, tx: { observe: vi.fn(observe), status: vi.fn(async () => ({ status: "ACCEPTED" })) } };
      return { sdk, calls: () => close.mock.calls.length + rpcClose.mock.calls.length };
    };
    const refused = async () => {
      throw Object.assign(new Error("fake observer refuses"), { code: "RPC_ERROR" });
    };
    const status = injected(refused);
    await runTxStatus({ txId: TX, sdk: status.sdk, workspaceRoot: ws });
    const synthetic = injected(refused);
    await runTxWait({ txId: `synthetic-${"b".repeat(64)}`, sdk: synthetic.sdk, workspaceRoot: ws, until: "confirmed", timeoutMs: 1000, intervalMs: 10 } as any);
    const timedOut = injected(refused);
    await expect(runTxWait({ txId: TX, sdk: timedOut.sdk, workspaceRoot: ws, until: "confirmed", timeoutMs: 30, intervalMs: 10 } as any)).rejects.toMatchObject({ code: "TX_WAIT_TIMEOUT" });
    expect({ txStatus: status.calls(), txWaitSynthetic: synthetic.calls(), txWaitTimeout: timedOut.calls() }).toEqual({ txStatus: 0, txWaitSynthetic: 0, txWaitTimeout: 0 });
  });
});
