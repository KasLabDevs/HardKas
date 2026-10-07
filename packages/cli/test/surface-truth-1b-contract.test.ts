import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { buildHardkasProgram } from "../src/program.js";
import { extractCliReference } from "../src/docs/generator.js";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// SURFACE-TRUTH-1B · the contract the fixes settle, on the real CLI (built dist), beyond what the BEFORE file asks:
// one capability authority (`capabilities` and `silver doctor` read the same checks), PSKT declared unavailable,
// `tx trace` hidden, the typed failures of `dev accounts reveal` and `dev last` (which finds what the store holds), one
// environment contract for `env check`, `doctor` and `deploy init`, and a CLI reference without hidden commands.

const cli = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(env), encoding: "utf8", timeout: 180_000 });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const docs = (s: string) =>
  s
    .split(/\r?\n(?=\{)/)
    .map((c) => {
      try {
        return JSON.parse(c);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);
const codeOf = (r: { stdout: string }) => docs(r.stdout).find((d: any) => d?.ok === false)?.code ?? null;

describe("SURFACE-TRUTH-1B · contract · CLI", () => {
  let parent: string;
  let ws: string;

  const fresh = async (name: string) => {
    const dir = path.join(parent, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    return dir;
  };

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1b-cli-"));
    ws = await fresh("project");
    // a transaction written by the CLI into the store's canonical subdirectories (no --out copies at the root)
    for (const args of [
      ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"]
    ]) {
      const r = cli(args, ws);
      expect(r.status, r.all).toBe(0);
    }
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("capabilities and silver doctor answer from the same checks; a false derived entry says why", () => {
    const caps = docs(cli(["capabilities", "--json"], ws, { HARDKAS_EXPERIMENTAL: "1" }).stdout)[0];
    const doctor = docs(cli(["silver", "doctor", "--json"], ws).stdout)[0];
    expect({ silverScript: caps?.capabilities?.silverScript, covenants: caps?.capabilities?.covenants }).toEqual({
      silverScript: doctor?.ready?.["silver.compile.v1"],
      covenants: doctor?.ready?.["toccata.covenant.auth-1to1-transition.v1"]
    });
    for (const key of ["silverScript", "covenants", "transactionV1"]) {
      if (caps.capabilities[key] === false) expect(caps.reasons?.[key], key).toBeTruthy();
    }
    expect(caps.runtimeMatrix.node.toccata).toBe(doctor.node.ok);
  });

  it("capabilities names the concrete covenant surface: the real builders, and the SDK planning that is not supported", () => {
    const caps = docs(cli(["capabilities", "--json"], ws, { HARDKAS_EXPERIMENTAL: "1" }).stdout)[0];
    expect(caps.capabilities.sdkCovenantPlanning).toBe(false);
    expect(caps.scopes?.covenants).toMatch(/1:1 auth-bound.*silver covenant genesis\|transition/);
    expect(caps.scopes?.sdkCovenantPlanning).toMatch(/planDeploy\/planSpend refuse with COVENANT_PLAN_UNSUPPORTED/);
    expect(caps.scopes?.silverScript).toMatch(/silverc/);
    const covenantLine = cli(["capabilities"], ws, { HARDKAS_EXPERIMENTAL: "1" })
      .stdout.split(/\r?\n/)
      .find((l) => /\bCovenants\b/.test(l));
    expect(covenantLine).toMatch(/1:1 auth-bound/);
    expect(covenantLine).toMatch(/planDeploy\/planSpend refuse/);
  });

  it("pskt is declared unavailable, and the default adapter refuses with a typed code", () => {
    expect(cli(["pskt", "--help"], ws).stdout).toMatch(/unavailable in this build/i);
    fs.writeFileSync(path.join(ws, "pskt-plan.json"), JSON.stringify({ planId: "p", networkId: "simnet", inputs: [], outputs: [] }));
    const r = cli(["pskt", "export", "--plan", "pskt-plan.json", "--out", "pskt-session.json", "--json"], ws, { HARDKAS_EXPERIMENTAL: "1" });
    expect({ failed: r.status !== 0, code: codeOf(r), written: fs.existsSync(path.join(ws, "pskt-session.json")) }, r.all).toEqual({
      failed: true,
      code: "PSKT_OPERATION_UNSUPPORTED",
      written: false
    });
  });

  it("tx trace is hidden and refuses with TX_TRACE_DISABLED", () => {
    expect(cli(["tx", "--help"], ws).stdout).not.toMatch(/\btrace\b/);
    const r = cli(["tx", "trace", "a".repeat(64)], ws);
    expect({ exit: r.status, code: /\[TX_TRACE_DISABLED\]/.test(r.all) }, r.all).toEqual({ exit: 1, code: true });
  });

  it("dev accounts reveal of an unknown alias fails with DEV_ACCOUNT_NOT_FOUND (exit 2)", () => {
    const r = cli(["dev", "accounts", "reveal", "nobody-here"], ws);
    expect({ exit: r.status, code: /\[DEV_ACCOUNT_NOT_FOUND\]/.test(r.all) }, r.all).toEqual({ exit: 2, code: true });
  });

  it("dev last finds the transaction the store holds; with none it fails with DEV_LAST_NOTHING_FOUND (exit 2)", async () => {
    const latest = cli(["dev", "last"], ws);
    expect(latest.status, latest.all).toBe(0);
    expect(latest.all).toMatch(/Targeting latest artifact/);
    const empty = await fresh("dev-last-empty");
    const r = cli(["dev", "last", "--replay"], empty);
    expect({ exit: r.status, code: /\[DEV_LAST_NOTHING_FOUND\]/.test(r.all) }, r.all).toEqual({ exit: 2, code: true });
  });

  it("one environment contract: doctor demands no variable HardKAS does not read, and flags the HARDKAS_* names env check flags", async () => {
    const appOnly = await fresh("env-app-only");
    fs.writeFileSync(path.join(appOnly, ".env"), "APP_NAME=demo\nNETWORK=testnet\n");
    const ok = docs(cli(["doctor", "--json"], appOnly).stdout).find((d: any) => Array.isArray(d?.checks));
    const envCheck = ok?.checks?.find((c: any) => c.category === "env" && /HARDKAS_\* environment/.test(c.name));
    expect({ status: envCheck?.status, demandsDataDir: /HARDKAS_DATA_DIR/.test(JSON.stringify(ok ?? {})) }).toEqual({
      status: "pass",
      demandsDataDir: false
    });

    const typo = await fresh("env-typo");
    fs.writeFileSync(path.join(typo, ".env"), "HARDKAS_HOEM=/x\n");
    const bad = docs(cli(["doctor", "--json"], typo).stdout).find((d: any) => Array.isArray(d?.checks));
    expect(bad?.checks?.find((c: any) => /HARDKAS_\* environment/.test(c.name))).toMatchObject({ status: "fail", message: expect.stringMatching(/HARDKAS_HOEM/) });

    const e = cli(["env", "check"], ws, { HARDKAS_EXPERIMENTAL: "1" });
    expect(e.all).not.toMatch(/HARDKAS_EXPERIMENTAL=1[^\n]*expose/i);
  });

  it("deploy init writes no HARDKAS_DATA_DIR (HardKAS reads none)", async () => {
    const dir = await fresh("deploy-init");
    const r = cli(["deploy", "init"], dir);
    expect(r.status, r.all).toBe(0);
    for (const f of ["docker-compose.yml", "Dockerfile", ".env.example"]) {
      expect(fs.readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(/HARDKAS_DATA_DIR/);
    }
  });

  it("the CLI reference generator leaves hidden commands out", () => {
    const ref = extractCliReference(buildHardkasProgram({ forDocs: true }), { deterministic: true });
    const hidden = ["hardkas capabilities", "hardkas session", "hardkas tx trace", "hardkas workflow create", "hardkas workflow replay"];
    expect(ref.flatSurface.filter((p) => hidden.some((h) => p === h || p.startsWith(`${h} `)))).toEqual([]);
    expect(ref.flatSurface).toContain("hardkas tx sign");
  });

  it("status claims no node and points an offline dev server at a registered command", () => {
    const r = cli(["status"], ws);
    expect(r.all).not.toMatch(/Kaspa Node/);
    expect(r.all).not.toMatch(/--with-node/);
  });
});
