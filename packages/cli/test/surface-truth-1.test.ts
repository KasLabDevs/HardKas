import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { Hardkas } from "@hardkas/sdk";
import { CURRENT_HASH_VERSION, createScenarioResultArtifact, enumerateWorkspaceArtifactsSync } from "@hardkas/artifacts";
import { buildHardkasProgram } from "../src/program.js";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// SURFACE-TRUTH-1 (investigation, 2026-10-06, base 7e7cf630f) · BEFORE on the real CLI (built dist) and its command
// tree. Each assertion is about a surface that claims something the build does not do, or denies something it does:
// - ST-A · `capabilities` is literal tables, not checks: it contradicts the SDK report and the registered commands;
// - ST-E · verifiers that answer OK without verifying: `evidence verify`, `verify-semantics`, `repair --json`, `dev doctor`;
// - ST-F · workflows: unknown step types, `network.switch`, `--dry-run` and `--offline` are recorded as success;
// - ST-G · `dev --once` never exits; `sandbox` prints a node and a dashboard that do not exist; hints to unknown options;
// - ST-H/I/J · advertised-but-disabled commands, exit-0 failures, the environment contract;
// - ST-C · the shipped CLI completes a PSKT session on a test double;
// - ST-D · the published CLI reference that says it is generated from the command tree.
// The assertions are written against the property, not a fix: a surface that is retired (unknown command) satisfies
// every "never claims" assertion too.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const cli = (args: string[], cwd: string, env: Record<string, string> = {}, timeout = 120_000) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(env), encoding: "utf8", timeout });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const unknownCommand = (r: { status: number | null; all: string }) => r.status !== 0 && /unknown command/i.test(r.all);
const json = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
/** Every top-level JSON document in a stdout (`dev doctor --json` prints its report, then an error envelope). */
const jsonDocs = (s: string) => s.split(/\r?\n(?=\{)/).map((chunk) => json(chunk)).filter((d) => d !== undefined);

/** A CLI run that does not block this process (a loopback server here must keep answering); killed after `killAfterMs`. */
const cliAsync = (
  args: string[],
  cwd: string,
  opts: { env?: Record<string, string>; killAfterMs?: number; onLine?: (line: string, child: ChildProcess) => void } = {}
) =>
  new Promise<{ code: number | null; killed: boolean; stdout: string; all: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv(opts.env ?? {}), windowsHide: true });
    let stdout = "";
    let stderr = "";
    let killed = false;
    child.stdout!.on("data", (d) => {
      stdout += d;
      if (opts.onLine) for (const line of String(d).split(/\r?\n/)) opts.onLine(line, child);
    });
    child.stderr!.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
    }, opts.killAfterMs ?? 60_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, killed, stdout, all: `${stdout}\n${stderr}` });
    });
  });

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

// ── the command tree as `hardkas` registers it (hidden commands included, and marked) ──
const program = buildHardkasProgram({ forDocs: true });
/** Resolves `dev tx send --from a` against the tree: every word a subcommand or a positional value, every option defined. */
function resolveCommand(text: string): { ok: boolean; path: string; hidden: boolean; error?: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  let current: Command = program;
  const names: string[] = [];
  let hidden = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.startsWith("-")) {
      const name = t.split("=")[0]!;
      let c: Command | null = current;
      let opt: any;
      while (c && !opt) {
        opt = c.options.find((o) => o.long === name || o.short === name);
        c = c.parent;
      }
      if (!opt) return { ok: false, path: names.join(" "), hidden, error: `option ${name} is not defined on "hardkas ${names.join(" ")}"` };
      if ((opt.required || opt.optional) && !t.includes("=") && tokens[i + 1] !== undefined && !tokens[i + 1]!.startsWith("-")) i++;
      continue;
    }
    const sub = current.commands.find((c) => c.name() === t || c.aliases().includes(t));
    if (sub) {
      current = sub;
      names.push(sub.name());
      if ((sub as any)._hidden) hidden = true;
      continue;
    }
    const takesArgs = ((current as any).registeredArguments ?? (current as any)._args ?? []).length > 0;
    if (takesArgs || /^[<[]/.test(t) || t.startsWith("...")) continue;
    return { ok: false, path: names.join(" "), hidden, error: `"${t}" is not a command of "hardkas ${names.join(" ")}"` };
  }
  return { ok: true, path: names.join(" "), hidden };
}
/** `hardkas …` suggestions inside a text (the words, then the options). */
const suggestionsIn = (text: string) =>
  [...new Set([...text.matchAll(/hardkas((?: [a-z][\w-]*)+(?: --[a-z][\w-]*)*)/g)].map((m) => m[1]!.trim()))];

describe("SURFACE-TRUTH-1 · BEFORE · what the CLI claims about itself and its results", () => {
  let parent: string;
  let ws: string;
  let receipt: any;

  /** A fresh simulated workspace under `parent`. */
  const fresh = async (name: string) => {
    const dir = path.join(parent, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    return dir;
  };

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1-"));
    ws = await fresh("project");
    for (const args of [
      ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "7", "--network", "simulated", "--out", "a-plan.json", "--json"],
      ["tx", "sign", "a-plan.json", "--out", "a-signed.json", "--json"],
      ["tx", "send", "a-signed.json", "--network", "simulated", "--json"]
    ]) {
      const r = cli(args, ws);
      expect(r.status, r.all).toBe(0);
    }
    receipt = enumerateWorkspaceArtifactsSync(ws).find((e: any) => e.artifact?.schema === "hardkas.txReceipt")?.artifact;
    expect(receipt?.contentHash).toBeTruthy();
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  // ───────────────────────────── ST-A · capabilities ─────────────────────────────
  describe("ST-A · `capabilities`", () => {
    it("control: the JSON report names the hash version the store writes", () => {
      const r = cli(["capabilities", "--json"], ws);
      if (unknownCommand(r)) return;
      expect(json(r.stdout)?.hashVersion).toBe(CURRENT_HASH_VERSION);
    });

    it("the JSON report and the SDK's `capabilities.get()` agree on every capability they both report", async () => {
      const r = cli(["capabilities", "--json"], ws);
      if (unknownCommand(r)) return;
      const fromCli: Record<string, unknown> = json(r.stdout)?.capabilities ?? {};
      const sdk = await Hardkas.open({ cwd: ws });
      const fromSdk = (await sdk.capabilities.get()).capabilities as unknown as Record<string, unknown>;
      const disagree = Object.keys(fromCli)
        .filter((k) => k in fromSdk && fromCli[k] !== fromSdk[k])
        .map((k) => `${k}: cli ${fromCli[k]} · sdk ${fromSdk[k]}`);
      expect(disagree, disagree.join("; ")).toEqual([]);
    });

    it("it reports no L2 profiles or bridge model while `l2` and `bridge` are not commands", () => {
      const r = cli(["capabilities", "--json"], ws);
      if (unknownCommand(r)) return;
      const caps = json(r.stdout)?.capabilities ?? {};
      expect({
        l2Profiles: caps.l2Profiles === true && !resolveCommand("l2").ok,
        l2BridgeAssumptions: caps.l2BridgeAssumptions === true && !resolveCommand("bridge").ok
      }).toEqual({ l2Profiles: false, l2BridgeAssumptions: false });
    });

    it("the human report does not list SilverScript or covenants as not implemented while `silver compile` and `silver covenant genesis` are commands", () => {
      const r = cli(["capabilities"], ws);
      if (unknownCommand(r)) return;
      const denied = r.stdout.split(/\r?\n/).filter((l) => /❌|not (yet )?implemented/i.test(l));
      expect({
        silverScript: denied.some((l) => /SilverScript/i.test(l)) && resolveCommand("silver compile").ok,
        covenants: denied.some((l) => /covenant/i.test(l)) && resolveCommand("silver covenant genesis").ok
      }).toEqual({ silverScript: false, covenants: false });
    });

    it("the human report names the hash version the JSON report and the store use", () => {
      const r = cli(["capabilities"], ws);
      if (unknownCommand(r)) return;
      const named = [...r.stdout.matchAll(/hashing v(\d+)/gi)].map((m) => Number(m[1]));
      expect(named.filter((v) => v !== CURRENT_HASH_VERSION)).toEqual([]);
    });

    it("it does not call the DAG conflict ordering GHOSTDAG-aligned (the only ordering the CLI runs is the light model `query dag` labels NOT GHOSTDAG)", () => {
      const r = cli(["capabilities"], ws);
      if (unknownCommand(r)) return;
      expect(/GHOSTDAG-aligned/i.test(r.all)).toBe(false);
    });
  });

  // ───────────────────────────── ST-E · verifiers that do not verify ─────────────────────────────
  describe("ST-E · verifiers", () => {
    // A scenario result as HardKAS produces one: sealed v5, from its one producer (fixture corrected in 1A: the
    // investigation's hand-made, unsealed body is not something any HardKAS producer writes).
    const scenario = (dir: string, name: string, status: "passed" | "failed", artifactsGenerated: string[]) => {
      fs.writeFileSync(
        path.join(dir, `${name}.scenario.json`),
        JSON.stringify(createScenarioResultArtifact({ scenarioName: name, status, networkId: "simulated", mode: "simulator", artifactsGenerated }))
      );
      return `${name}.scenario.json`;
    };
    const pack = (name: string, artifacts: string[], status: "passed" | "failed" = "failed") => {
      const out = `${name}.hke.json`;
      const r = cli(["evidence", "pack", scenario(ws, name, status, artifacts), "--out", out, "--json"], ws);
      return { r, file: path.join(ws, out), pkg: fs.existsSync(path.join(ws, out)) ? json(fs.readFileSync(path.join(ws, out), "utf8")) : undefined };
    };
    const verifies = (file: string) => {
      const r = cli(["evidence", "verify", file, "--json"], ws);
      return r.status === 0 && /EVIDENCE_VERIFIED/.test(r.all);
    };

    it("control: the package of a scenario that names its receipt verifies", () => {
      const p = pack("named", [receipt.contentHash]);
      expect(p.r.status, p.r.all).toBe(0);
      expect(p.pkg?.artifacts?.length).toBe(1);
      expect(verifies(p.file)).toBe(true);
    });

    it("`evidence verify` rejects a package whose scenario verdict was edited (failed → passed)", () => {
      const p = pack("verdict", [receipt.contentHash], "failed");
      p.pkg.scenarioResult.status = "passed";
      const edited = path.join(ws, "verdict-edited.hke.json");
      fs.writeFileSync(edited, JSON.stringify(p.pkg, null, 2));
      expect(verifies(edited)).toBe(false);
    });

    it("`evidence verify` rejects a package whose artifacts were removed", () => {
      const p = pack("emptied", [receipt.contentHash]);
      p.pkg.artifacts = [];
      const edited = path.join(ws, "emptied-edited.hke.json");
      fs.writeFileSync(edited, JSON.stringify(p.pkg, null, 2));
      expect(verifies(edited)).toBe(false);
    });

    it("`evidence pack` does not present the whole store as the evidence of a scenario that names none, without saying so", () => {
      const named = pack("named-2", [receipt.contentHash]);
      const empty = pack("names-none", []);
      const silentFallback =
        empty.r.status === 0 &&
        (empty.pkg?.artifacts?.length ?? 0) > 0 &&
        JSON.stringify(empty.pkg?.artifactDiscovery) === JSON.stringify(named.pkg?.artifactDiscovery);
      expect(silentFallback).toBe(false);
    });

    const tortureWorkspace = async (name: string, cases: unknown[]) => {
      const dir = await fresh(name);
      fs.mkdirSync(path.join(dir, ".hardkas", "reports"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".hardkas", "reports", "torture-st1.json"), JSON.stringify({ cases }));
      return dir;
    };

    // The investigation's control here ("passing torture checks exit 0") pinned the bundle path the reviewer retired
    // (D-ST5: no real source of semantic hashes exists, so the command refuses). Replaced by that decided contract.
    it("contract (D-ST5): with passing torture checks too, `verify-semantics` refuses with a typed code and writes no bundle", async () => {
      const dir = await tortureWorkspace("vs-pass", [{ seed: 1, bucket: "a", status: "pass", artifactsBefore: ["x"] }]);
      const r = cli(["verify-semantics", "--ci-mode", "--json"], dir);
      expect({ exit: r.status, code: json(r.stdout)?.code, bundle: fs.existsSync(path.join(dir, "hardkas.semantic-bundle.v1.json")) }, r.all).toEqual({
        exit: 1,
        code: "VERIFY_SEMANTICS_UNSUPPORTED",
        bundle: false
      });
    });

    it("`verify-semantics --ci-mode` does not pass when torture checks failed", async () => {
      const dir = await tortureWorkspace("vs-fail", [
        { seed: 1, bucket: "a", status: "fail", artifactsBefore: ["x"] },
        { seed: 2, bucket: "b", status: "error", artifactsBefore: ["y"] }
      ]);
      const r = cli(["verify-semantics", "--ci-mode", "--json"], dir);
      expect({ exit: r.status, ok: json(r.stdout)?.ok }).not.toEqual({ exit: 0, ok: true });
    });

    it("a usage or missing-input error of `verify-semantics` is not reported as semantic drift", async () => {
      const dir = await fresh("vs-usage");
      const codes = [cli(["verify-semantics", "--json"], dir), cli(["verify-semantics", "--ci-mode", "--json"], dir)].map(
        (r) => json(r.stdout)?.code ?? null
      );
      expect(codes.filter((c) => c === "SEMANTIC_DRIFT")).toEqual([]);
    });

    const tornWorkspace = async (name: string) => {
      const dir = await fresh(name);
      // hardkas-append-allow: tears the tail of a scratch workspace's event log
      for (const f of [path.join(dir, "events.jsonl"), path.join(dir, ".hardkas", "events.jsonl")]) fs.appendFileSync(f, '{"ok":1}\n{"torn":');
      return dir;
    };

    it("control: `repair --json` on a clean workspace reports success", async () => {
      const dir = await fresh("repair-clean");
      const r = cli(["repair", "--json"], dir);
      expect(r.status, r.all).toBe(0);
      expect(json(r.stdout)?.status).toBe("success");
    });

    it("control: `repair` (human) reports the corrupt tail it finds", async () => {
      const dir = await tornWorkspace("repair-torn-human");
      expect(cli(["repair"], dir).all).toMatch(/corrupt tail/i);
    });

    it("`repair --json` does not report success while it leaves in place the corrupt tail it found", async () => {
      const dir = await tornWorkspace("repair-torn");
      const r = cli(["repair", "--json"], dir);
      expect({ exit: r.status, status: json(r.stdout)?.status }).not.toEqual({ exit: 0, status: "success" });
    });

    it("`dev doctor` does not report artifacts the CLI wrote, and `hardkas verify` accepts, as malformed", () => {
      const v = cli(["verify", "--json"], ws);
      expect(v.status, v.all.slice(0, 600)).toBe(0);
      const d = cli(["dev", "doctor", "--json", "--rpc-url", "http://127.0.0.1:1"], ws);
      const report = jsonDocs(d.stdout).find((doc: any) => doc?.schema === "hardkas.devDoctor.v1");
      expect(report, d.all.slice(0, 400)).toBeTruthy();
      // any error check that names a file (whatever its code), since `hardkas verify` accepts every file of this store
      const flagged = (report?.checks ?? [])
        .filter((c: any) => c.status === "error" && (c.details?.paths ?? []).length > 0)
        .map((c: any) => `${c.code}: ${path.basename(c.details.paths[0])}`);
      expect(flagged, flagged.join(", ")).toEqual([]);
    });
  });

  // ───────────────────────────── ST-F · workflows ─────────────────────────────
  describe("ST-F · `workflow run`", () => {
    const run = (name: string, def: unknown, extra: string[] = []) => {
      fs.writeFileSync(path.join(ws, `${name}.json`), JSON.stringify(def, null, 2));
      const r = cli(["workflow", "run", `${name}.json`, "--json", ...extra], ws);
      return { ...r, wf: json(r.stdout) };
    };
    const plan = { type: "tx.plan", args: { from: "alice", to: "bob", amount: "1" } };

    it("control: a tx.plan + tx.simulate workflow completes", () => {
      const r = run("wf-control", { steps: [plan, { type: "tx.simulate" }] });
      expect(r.status, r.all.slice(0, 600)).toBe(0);
      expect(r.wf?.status).toBe("completed");
    });

    it("a step type the runtime does not know fails the workflow", () => {
      const r = run("wf-unknown", { steps: [{ type: "tx.plann", args: plan.args }, { type: "deploy.contract", args: {} }] });
      expect({ exit: r.status, status: r.wf?.status }).not.toEqual({ exit: 0, status: "completed" });
    });

    it("`network.switch` changes the network of the steps after it, or the workflow refuses it", () => {
      const r = run("wf-switch", { steps: [{ type: "network.switch", args: { network: "testnet-10" } }, plan] });
      if (r.status !== 0) return;
      const planId = r.wf?.producedArtifacts?.[0];
      const produced = enumerateWorkspaceArtifactsSync(ws).find((e: any) => e.artifact?.contentHash === planId)?.artifact as any;
      expect(produced?.networkId).toBe("testnet-10");
    });

    it("`--dry-run` never lets a step write to the filesystem", () => {
      const marker = path.join(ws, "dry-run-marker.txt");
      run("wf-dry", { steps: [{ type: "script", script: `process.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(marker)}, "x"); return 1;` }] }, ["--dry-run"]);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it("`--offline` never lets a step open a connection", async () => {
      let hits = 0;
      const server = http.createServer((_req, res) => {
        hits++;
        res.end("ok");
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
      const port = (server.address() as net.AddressInfo).port;
      fs.writeFileSync(path.join(ws, "wf-offline.json"), JSON.stringify({ steps: [{ type: "script", script: `const r = await fetch("http://127.0.0.1:${port}/"); return r.status;` }] }));
      await cliAsync(["workflow", "run", "wf-offline.json", "--offline", "--json"], ws, { killAfterMs: 90_000 });
      server.close();
      expect(hits).toBe(0);
    });

    it("`workflow inspect latest` and `workflow replay latest` reach the workflow `run` just wrote", () => {
      // a definition no other test runs: the workflowId is derived from the steps, so two runs of one definition share it
      const r = run("wf-again", { steps: [{ type: "tx.plan", args: { from: "alice", to: "bob", amount: "3" } }, { type: "tx.simulate" }] });
      expect(r.status, r.all.slice(0, 600)).toBe(0);
      const inspect = cli(["workflow", "inspect", "latest", "--json"], ws);
      const replay = resolveCommand("workflow replay").ok && !resolveCommand("workflow replay").hidden ? cli(["workflow", "replay", "latest"], ws) : { status: 0, all: "" };
      expect({ inspect: inspect.status, replay: replay.status }, `${inspect.all.slice(0, 300)}\n${replay.all.slice(0, 300)}`).toEqual({ inspect: 0, replay: 0 });
      expect(jsonDocs(inspect.stdout).find((d: any) => d?.schema === "hardkas.workflow.v1")?.workflowId).toBe(r.wf?.workflowId);
    });
  });

  // ───────────────────────────── ST-G · dev / sandbox / hints ─────────────────────────────
  describe("ST-G · long-running commands and what they print", () => {
    it("`dev --once --headless` (\"run health checks, and exit\") exits on its own, without starting the server", async () => {
      const dir = await fresh("dev-once");
      const r = await cliAsync(["dev", "--once", "--headless"], dir, { killAfterMs: 60_000 });
      expect({ killed: r.killed, exit: r.code, serverStarted: /Dev Server running/.test(r.stdout) }).toEqual({ killed: false, exit: 0, serverStarted: false });
    });

    it("`sandbox --with-node` does not say a node is running and mining when none was started (Docker is unreachable)", async () => {
      const tmp = fs.mkdtempSync(path.join(parent, "sbx-"));
      const port = await freePort();
      const r = await cliAsync(["sandbox", "--with-node", "--port", String(port)], parent, {
        env: { TEMP: tmp, TMP: tmp, DOCKER_HOST: "tcp://127.0.0.1:1" },
        killAfterMs: 60_000,
        onLine: (line, child) => {
          if (/Sandbox will be destroyed on exit/.test(line)) setTimeout(() => child.kill(), 500);
        }
      });
      expect({ nodeRunning: /Node:\s*\r?\n\s*running/.test(r.stdout), miningEnabled: /Mining:\s*\r?\n\s*enabled/.test(r.stdout) }).toEqual({
        nodeRunning: false,
        miningEnabled: false
      });
    });

    it("`sandbox` (\"start a temporary … environment\") is still running, its dashboard answering, 3 s after it prints the dashboard URL", async () => {
      const tmp = fs.mkdtempSync(path.join(parent, "sbx-"));
      const port = await freePort();
      let sawDashboard = false;
      let url = "";
      let answer = "never checked";
      // the URL exactly as the sandbox prints it on the line after "Dashboard:" (fixture corrected in 1A: the
      // investigation asked 127.0.0.1, but `localhost` can bind the IPv6 loopback only)
      const r = await cliAsync(["sandbox", "--port", String(port)], parent, {
        env: { TEMP: tmp, TMP: tmp },
        killAfterMs: 60_000,
        onLine: (line, child) => {
          if (!sawDashboard) {
            sawDashboard = /Dashboard:/.test(line);
            return;
          }
          const printed = /https?:\/\/\S+/.exec(line)?.[0];
          if (url || !printed) return;
          url = printed;
          setTimeout(() => {
            http
              .get(url, (res) => {
                answer = `HTTP ${res.statusCode}`;
                res.resume();
                child.kill();
              })
              .on("error", (e: any) => {
                answer = `no answer (${e.code})`;
                child.kill();
              });
          }, 3_000);
        }
      });
      for (let waited = 0; sawDashboard && answer === "never checked" && waited < 8_000; waited += 250) await new Promise((res) => setTimeout(res, 250));
      expect({ sawDashboard, answer: answer.startsWith("HTTP ") }, `${answer}\n${r.all.slice(-800)}`).toEqual({ sawDashboard: true, answer: true });
    });

    it("no hint `status` or `dev last --replay` prints names a command or an option the CLI does not register", () => {
      const printed = [cli(["status"], ws).all, cli(["dev", "last", "--replay"], ws).all].join("\n");
      const bad = suggestionsIn(printed)
        .map((s) => ({ s, r: resolveCommand(s) }))
        .filter((x) => !x.r.ok)
        .map((x) => `hardkas ${x.s} → ${x.r.error}`);
      expect(bad, bad.join("\n")).toEqual([]);
    });
  });

  // ───────────────────────────── ST-H/I/J/C ─────────────────────────────
  describe("ST-H/I/J/C · advertised commands, exit codes, the environment contract, PSKT", () => {
    it("ST-H · a command `tx --help` lists does not refuse every call as disabled", () => {
      const listed = resolveCommand("tx trace");
      if (!listed.ok || listed.hidden) return;
      expect(/TX_TRACE_DISABLED/.test(cli(["tx", "trace", receipt.txId], ws).all)).toBe(false);
    });

    it("ST-I · `dev accounts reveal` of an alias that does not exist exits non-zero", () => {
      const r = cli(["dev", "accounts", "reveal", "nobody-here"], ws);
      expect(r.all).toMatch(/not found/i);
      expect(r.status).not.toBe(0);
    });

    it("ST-I · `dev last --replay` in a workspace without transactions exits non-zero", async () => {
      const dir = await fresh("dev-last-empty");
      const r = cli(["dev", "last", "--replay"], dir);
      expect(r.all).toMatch(/No recent transaction artifacts/i);
      expect(r.status).not.toBe(0);
    });

    it("ST-J · `env check` and `doctor` agree on whether HardKAS reads HARDKAS_DATA_DIR", async () => {
      const dir = await fresh("env-contract");
      const e = cli(["env", "check"], dir, { HARDKAS_DATA_DIR: path.join(dir, "data") });
      const envSaysUnread = e.status !== 0 && /HARDKAS_DATA_DIR/.test(e.all);
      fs.writeFileSync(path.join(dir, ".env"), "APP_NAME=demo\n");
      const d = cli(["doctor", "--json"], dir, {}, 180_000);
      const doctorDemands = /Missing:[^"]*HARDKAS_DATA_DIR/.test(d.stdout);
      expect({ envSaysUnread, doctorDemands }).not.toEqual({ envSaysUnread: true, doctorDemands: true });
    });

    it("ST-J · HARDKAS_EXPERIMENTAL changes the command surface, as `env check` says it does", () => {
      const e = cli(["env", "check"], ws, { HARDKAS_EXPERIMENTAL: "1" });
      if (!/HARDKAS_EXPERIMENTAL=1[^\n]*expose/i.test(e.all)) return;
      expect(cli(["--help"], ws, { HARDKAS_EXPERIMENTAL: "1" }).stdout).not.toBe(cli(["--help"], ws).stdout);
    });

    it("ST-C · the shipped CLI does not complete a PSKT session on a test double (NODE_ENV=test, as test runners set it)", () => {
      const r = cli(["pskt", "export", "--plan", "a-plan.json", "--adapter", "test-fake-adapter", "--out", "fake-session.json", "--json"], ws, { NODE_ENV: "test" });
      expect(r.status, r.all.slice(0, 400)).not.toBe(0);
    });
  });

  // ───────────────────────────── ST-D · published reference ─────────────────────────────
  describe("ST-D · docs", () => {
    it("the CLI reference that says it is generated from the command tree names only registered commands and options", () => {
      const file = path.join(repoRoot, "apps", "docs", "docs", "reference", "cli.md");
      const text = fs.readFileSync(file, "utf8");
      if (!/generated from the Commander command tree/i.test(text)) return;
      const refs = [
        ...[...text.matchAll(/`hardkas ([^`]+)`/g)].map((m) => m[1]!),
        ...text.split(/\r?\n/).filter((l) => /^\s*hardkas\s/.test(l)).map((l) => l.trim().replace(/^hardkas\s+/, ""))
      ];
      const bad = [...new Set(refs)]
        .map((t) => ({ t, r: resolveCommand(t) }))
        .filter((x) => !x.r.ok)
        .map((x) => `hardkas ${x.t} → ${x.r.error}`);
      expect(bad, bad.join("\n")).toEqual([]);
    });
  });
});
