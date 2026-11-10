import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// RC1 · D7 · the built CLI on what this RC does not support, refused before anything connects:
//   * an absolute lock time: `tx plan` has no lock-time option (every plan is lock time 0) → with --json, the one
//     usage envelope UNKNOWN_OPTION, exit 2 (CLI-CONTRACT-2B D2);
//   * a spend FROM an ECDSA address: `tx plan --from <ECDSA address>` → ECDSA_SPEND_NOT_SUPPORTED, exit 1 (it reached
//     the node and planned a spend the signer cannot sign). Paying TO one is unaffected.
// The workspace's node is a closed loopback port: a command that connected anywhere is caught by its own log.
// -----------------------------------------------------------------------------

let ws = "";
let logs = "";
let k: any;

beforeAll(async () => {
  assertHermeticPreloadActive();
  const core: any = await import("@hardkas/core");
  k = core.loadManagedKaspaWasmSync();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rc1-d7-cli-"));
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rc1-d7-cli-logs-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(
    path.join(ws, "hardkas.config.ts"),
    `export default ${JSON.stringify(
      {
        execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
        networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:9" } }
      },
      null,
      2
    )};\n`
  );
});

afterAll(() => {
  for (const d of [ws, logs]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

function hk(name: string, args: string[]) {
  const log = path.join(logs, `${name}.net.log`);
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env: hermeticChildEnv(log), encoding: "utf8", timeout: 110_000 });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { status: r.status, json, dialled, brief: `exit ${r.status}\n${r.stdout.slice(0, 2000)}\n${r.stderr.slice(0, 1500)}` };
}

describe("RC1 · D7 · the CLI does not plan lock times or ECDSA spends, and says so before connecting", () => {
  it("tx plan --lock-time: the option does not exist (every plan is lock time 0): UNKNOWN_OPTION, exit 2, nothing contacted", () => {
    const bob = String(new k.PrivateKey("6666".padStart(64, "0")).toPublicKey().toAddress("simnet").toString());
    const r = hk("lock-time", ["tx", "plan", "--from", bob, "--to", bob, "--amount", "1", "--lock-time", "5", "--json"]);
    expect(r.status, r.brief).toBe(2);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "UNKNOWN_OPTION" });
    expect(r.dialled, r.brief).toEqual([]);
  });

  it("tx plan --from <an ECDSA address>: ECDSA_SPEND_NOT_SUPPORTED, exit 1, nothing contacted", () => {
    const pub = new k.PrivateKey("7777".padStart(64, "0")).toPublicKey();
    const ecdsa = String(pub.toAddressECDSA("simnet").toString());
    const schnorr = String(pub.toAddress("simnet").toString());
    const r = hk("ecdsa-from", ["tx", "plan", "--from", ecdsa, "--to", schnorr, "--amount", "1", "--json"]);
    expect(r.status, r.brief).toBe(1);
    expect(r.json, r.brief).toMatchObject({ ok: false, code: "ECDSA_SPEND_NOT_SUPPORTED" });
    expect(String(r.json?.message), r.brief).toContain(ecdsa);
    expect(r.dialled, r.brief).toEqual([]);
  });
});
