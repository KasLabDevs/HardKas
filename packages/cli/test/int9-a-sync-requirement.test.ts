import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startFakeNode, runCli, tempDir, type FakeNode } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// INT9-A (I-3b) · the operations that need the current chain state (plan, send, wait, Silver deploy/spend/covenants)
// require a node that SAYS it is synced — a node HardKAS manages included — and refuse a well-identified but unsynced
// node with NODE_NOT_SYNCED before anything but its identity is asked. Offline and diagnostic paths (rpc info, doctor,
// `artifact verify` offline) do not require it.

const PW = "int9a-sync-password";
const made: string[] = [];
let parent = "";
let logs = "";
let unsynced: FakeNode;
let ws = "";

function workspace(label: string, url: string): string {
  const dir = path.join(parent, label);
  const init = spawnSync(process.execPath, [cliDist, "init", label, "--network", "simnet", "--skip-toolchain", "--json"], {
    cwd: parent,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, `${label}-init.net.log`)),
    timeout: 120_000
  });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: url } }
  };
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  const gen = spawnSync(process.execPath, [cliDist, "accounts", "real", "generate", "--name", "funder", "--network", "simnet", "--password-env", "HK_INT9A_PW", "--json"], {
    cwd: dir,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, `${label}-gen.net.log`), { HK_INT9A_PW: PW }),
    timeout: 120_000
  });
  expect(gen.status, `${gen.stdout}\n${gen.stderr}`).toBe(0);
  return dir;
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  unsynced = await startFakeNode("sync-req", { network: "simnet", isSynced: false });
  parent = tempDir("hk-int9a-sync-", made);
  logs = tempDir("hk-int9a-sync-logs-", made);
  ws = workspace("unsynced-node", unsynced.url);
});

afterAll(async () => {
  await unsynced?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const RECIPIENT = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";

describe("INT9-A · a chain-state operation refuses a node that is not synced; a diagnostic does not", () => {
  it("tx plan on the workspace's node, which says it is not synced: NODE_NOT_SYNCED, only its identity asked", async () => {
    const before = unsynced.methods.length;
    const r = await runCli(logs, "plan-unsynced", ["tx", "plan", "--from", "funder", "--to", RECIPIENT, "--amount", "1", "--json"], ws);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.all, r.brief).toMatch(/NODE_NOT_SYNCED/);
    expect(unsynced.methods.slice(before).filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
  });

  it("tx wait on that node: no look is ever recorded from it; the timeout names NODE_NOT_SYNCED", async () => {
    const before = unsynced.methods.length;
    const r = await runCli(logs, "wait-unsynced", ["tx", "wait", "ab".repeat(32), "--timeout", "3", "--interval", "1", "--json"], ws);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.all, r.brief).toMatch(/NODE_NOT_SYNCED/);
    expect(unsynced.methods.slice(before).filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
    const observations = path.join(ws, ".hardkas", "artifacts");
    const sealed = fs.existsSync(observations)
      ? fs.readdirSync(observations, { recursive: true } as any).map(String).filter((f) => /observation/i.test(f))
      : [];
    expect(sealed, r.brief).toEqual([]);
  });

  it("rpc info on the same node (a diagnostic) still answers, and says it is not synced", async () => {
    const r = await runCli(logs, "info-unsynced", ["rpc", "info", "--json"], ws);
    expect(r.status, r.brief).toBe(0);
    expect(JSON.stringify(r.json), r.brief).toMatch(/"isSynced":false/);
  });
});
