import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Hardkas } from "@hardkas/sdk";
import { runCli, tempDir, CANONICAL_PORTS } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// D-06 · `tx send --from --to --amount` (shortcut mode) ignored --target: the flow planned, signed and sent on the
// workspace's default target (only the mainnet guard read --target). Now --target reaches the flow's resolver, plan and
// send steps. The workspace here defaults to the managed localnet (a real node, unreachable: Docker and its ports are
// closed) and names a simulator target: with --target sim the payment runs on the simulator, nothing is contacted, and
// the JSON names the network the flow really ran on (meta.network = the flow's networkId).

const made: string[] = [];
let ws = "";
let logs = "";

beforeAll(async () => {
  ws = tempDir("hk-d06-", made);
  logs = tempDir("hk-d06-logs-", made);
  await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  const cfg = {
    execution: {
      default: "local",
      targets: {
        local: { mode: "localnet", domain: "kaspa-l1", network: "simnet" },
        sim: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }
      }
    }
  };
  for (const f of fs.readdirSync(ws).filter((n) => /^hardkas\.config\./.test(n))) fs.rmSync(path.join(ws, f));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
});

afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("D-06 · tx send shortcut mode honours --target", () => {
  it("--target sim in a localnet-default workspace: the payment runs on the simulator, meta.network says so, nothing contacted", async () => {
    const r = await runCli(logs, "target-sim", ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--target", "sim", "--yes", "--json"], ws, {
      DOCKER_HOST: "tcp://127.0.0.1:9",
      HARDKAS_HERMETIC_DENY_PORTS: CANONICAL_PORTS
    });
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.meta?.network, r.brief).toBe("simulated");
    expect(r.json?.data?.plan?.mode, r.brief).toBe("simulator");
    expect(r.json?.data?.receipt?.txId, r.brief).toMatch(/^synthetic-[0-9a-f]{64}$/);
    expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
  });

  it("an unknown --target is refused (EXECUTION_TARGET_NOT_FOUND) before anything is planned", async () => {
    const r = await runCli(logs, "target-unknown", ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--target", "nope", "--yes", "--json"], ws, {
      DOCKER_HOST: "tcp://127.0.0.1:9",
      HARDKAS_HERMETIC_DENY_PORTS: CANONICAL_PORTS
    });
    expect(r.status, r.brief).not.toBe(0);
    expect(r.all, r.brief).toMatch(/EXECUTION_TARGET_NOT_FOUND/);
  });
});
