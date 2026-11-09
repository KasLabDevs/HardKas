import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Hardkas } from "@hardkas/sdk";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { assertHermeticPreloadActive } from "./hermetic-child.js";
import { startFakeNode, runCli, tempDir, type FakeNode } from "./helpers/int9-a-fake-node.js";
import { knownExtension } from "../src/extensions/api.js";
import { extensionUnavailableError } from "../src/extensions/refusal.js";
import { repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// RC1-R2 · the negative cases, typed on the CLI (the SDK's are rc1-r2-typed-negatives.sdk.test.ts and the planner's
// rc1-r2-immature-typed.test.ts). Found by the survey: `tx sign` / `tx send` of a tampered artifact had the code
// (ARTIFACT_HASH_MISMATCH) but no CLI test; a node that is not there and a node of another network on `tx plan` had none
// on an own-node workspace. And D5: the refusal of the unpublished l2 extension named a repository path an installed CLI
// does not ship, and the L2 bridge texts tied a trustless exit to the ZK phase alone.
// Loopback only; the canonical ports are denied; nothing is ever sent.
// -----------------------------------------------------------------------------

const made: string[] = [];
const fakes: FakeNode[] = [];
let logs = "";
let sim = "";

const failure = (r: Awaited<ReturnType<typeof runCli>>) => ({ status: r.status, code: r.json?.code ?? r.json?.error?.code ?? r.code });

beforeAll(async () => {
  assertHermeticPreloadActive();
  logs = tempDir("hk-r2n-logs-", made);
  sim = tempDir("hk-r2n-sim-", made);
  await Hardkas.create({ cwd: sim, autoBootstrap: true, network: "simulated" });
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("RC1-R2 · a tampered artifact: ARTIFACT_HASH_MISMATCH on the CLI, nothing signed or sent", () => {
  it("N-1 tx sign of a plan edited after it was sealed", async () => {
    const p = await runCli(logs, "n1-plan", ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "plan.json", "--json"], sim);
    expect(p.status, p.brief).toBe(0);
    const plan = JSON.parse(fs.readFileSync(path.join(sim, "plan.json"), "utf8"));
    plan.amountSompi = String(BigInt(plan.amountSompi) + 1n);
    fs.writeFileSync(path.join(sim, "plan-tampered.json"), JSON.stringify(plan, null, 2));
    const r = await runCli(logs, "n1-sign", ["tx", "sign", "plan-tampered.json", "--account", "alice", "--out", "signed-from-tampered.json", "--json"], sim);
    expect(failure(r), r.brief).toEqual({ status: 1, code: "ARTIFACT_HASH_MISMATCH" });
    expect(fs.existsSync(path.join(sim, "signed-from-tampered.json"))).toBe(false);
  });

  it("N-2 tx send of a signed transaction edited after it was sealed", async () => {
    await runCli(logs, "n2-plan", ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "plan2.json", "--json"], sim);
    const s = await runCli(logs, "n2-sign", ["tx", "sign", "plan2.json", "--account", "alice", "--out", "signed2.json", "--json"], sim);
    expect(s.status, s.brief).toBe(0);
    const signed = JSON.parse(fs.readFileSync(path.join(sim, "signed2.json"), "utf8"));
    signed.amountSompi = signed.amountSompi + "99";
    fs.writeFileSync(path.join(sim, "signed2-tampered.json"), JSON.stringify(signed, null, 2));
    const r = await runCli(logs, "n2-send", ["tx", "send", "signed2-tampered.json", "--yes", "--json"], sim);
    expect(failure(r), r.brief).toEqual({ status: 1, code: "ARTIFACT_HASH_MISMATCH" });
    expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
  });
});

describe("RC1-R2 · tx plan on a workspace's own node that is not there, or serves another network", () => {
  const k = () => loadManagedKaspaWasmSync() as any;
  const own = (label: string, url: string) => {
    const ws = tempDir(`hk-r2n-${label}-`, made);
    fs.mkdirSync(path.join(ws, ".hardkas"));
    const cfg = {
      execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
      networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: url } }
    };
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
    return ws;
  };
  const from = () => String(new (k().PrivateKey)("71".repeat(32)).toAddress("simnet").toString());
  const to = () => String(new (k().PrivateKey)("72".repeat(32)).toAddress("simnet").toString());

  it("N-3 nothing listens there: a typed connection code (RPC_CONNECTION_FAILED), never UNKNOWN, nothing planned", async () => {
    const closed = net.createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", () => r()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    const ws = own("dead", `ws://127.0.0.1:${port}`);
    const r = await runCli(logs, "n3", ["tx", "plan", "--from", from(), "--to", to(), "--amount", "1", "--network", "simnet", "--out", "p.json", "--json"], ws);
    expect(r.status, r.brief).not.toBe(0);
    expect(failure(r).code, r.brief).toBe("RPC_CONNECTION_FAILED");
    expect(fs.existsSync(path.join(ws, "p.json"))).toBe(false);
  });

  it("N-4 the node serves devnet: NODE_NETWORK_MISMATCH, no UTXO read", async () => {
    const devnet = await startFakeNode("r2n-devnet", { network: "devnet" });
    fakes.push(devnet);
    const r = await runCli(logs, "n4", ["tx", "plan", "--from", from(), "--to", to(), "--amount", "1", "--network", "simnet", "--json"], own("wrongnet", devnet.url));
    expect(failure(r), r.brief).toMatchObject({ code: "NODE_NETWORK_MISMATCH" });
    expect(devnet.methods.filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
  });
});

describe("RC1-R2 · D5 texts of the unpublished L2 extension", () => {
  it("D5-1 the refusal of `hardkas l2 …` gives a step an installed CLI can run, and no repository path", () => {
    const l2 = knownExtension("l2")!;
    for (const state of [undefined, { known: l2, status: "incompatible", reason: "VERSION_MISMATCH", detail: "x" }]) {
      const e = extensionUnavailableError(l2, state as never, "'hardkas l2 networks'");
      expect(e.suggestion).toMatch(/not published in this release/);
      expect(e.suggestion).toContain("hardkas extension install l2 --from <tgz> --sha256 <hex>");
      // a path is given only as a URL (the published READMEs' form), never as a bare repository path
      expect(String(e.suggestion).replace(/https:\/\/\S+/g, "")).not.toMatch(/docs\/status\//);
    }
  });

  it("D5-2 no L2 source ties a trustless exit to the ZK phase alone", () => {
    const offenders: string[] = [];
    for (const pkg of ["l2", "ext-l2", "cli", "sdk"]) {
      const walk = (dir: string): void => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.(ts|tsx|js)$/.test(e.name)) {
            const text = fs.readFileSync(full, "utf8");
            if (/Trustless exit is available|no trustless exit claim unless ZK|must not be assumed without ZK verifiers/i.test(text)) offenders.push(full);
          }
        }
      };
      walk(path.join(repoRoot, "packages", pkg, "src"));
    }
    expect(offenders).toEqual([]);
  });

  it("D5-3 no publishable package depends on @hardkas/l2 or @hardkas/ext-l2", () => {
    const deps: string[] = [];
    for (const pkg of fs.readdirSync(path.join(repoRoot, "packages"))) {
      const file = path.join(repoRoot, "packages", pkg, "package.json");
      if (!fs.existsSync(file)) continue;
      const m = JSON.parse(fs.readFileSync(file, "utf8"));
      if (m.private === true) continue;
      for (const field of ["dependencies", "peerDependencies", "optionalDependencies", "devDependencies"]) {
        for (const name of Object.keys(m[field] ?? {})) if (name === "@hardkas/l2" || name === "@hardkas/ext-l2") deps.push(`${m.name} ${field} ${name}`);
      }
    }
    expect(deps).toEqual([]);
    for (const pkg of ["l2", "ext-l2"]) expect(JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", pkg, "package.json"), "utf8")).private, pkg).toBe(true);
  });
});
