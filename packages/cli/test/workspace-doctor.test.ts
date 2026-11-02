import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// NEW-11 (L2-EXT stage 2b) · `hardkas doctor workspace` is the L1 part of the former `dev doctor`, in the core: it
// detects what `dev doctor` detected (corrupt artifacts, a corrupt ledger tail, an invalid config), passes a healthy
// workspace, honours --workspace, and loads no L2 code. The l2 extension's test pins that `dev doctor` = these checks
// plus its L2 section (packages/ext-l2/test/extension-installed.test.ts).

const RECORDER = path.join(__dirname, "fixtures", "module-recorder.mjs");
const L2_CODE = /\/(packages|@hardkas)\/(l2|ext-l2)\/|\/node_modules\/viem\/|\/\.pnpm\/viem@/;
let parent: string;

function doctor(cwd: string, extra: string[] = [], name = "doctor") {
  const log = path.join(parent, `${name}.modules.log`);
  const r = spawnSync(process.execPath, [cliDist, "doctor", "workspace", "--json", ...extra], {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
    env: childEnv({ HARDKAS_MODULE_LOG: log, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(RECORDER).href}`.trim() })
  });
  const docs = (r.stdout ?? "")
    .split(/\r?\n(?=\{)/)
    .map((c) => {
      try {
        return JSON.parse(c);
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);
  const modules = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((u) => u.replace(/\\/g, "/")) : [];
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? ""), report: docs.find((d: any) => d?.schema === "hardkas.devDoctor.v1"), envelope: docs.find((d: any) => d?.ok === false), modules };
}
const codes = (report: any) => (report?.checks ?? []).filter((c: any) => c.status === "error").map((c: any) => c.code);

async function freshWorkspace(name: string): Promise<string> {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
  await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
  return dir;
}

beforeAll(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ws-doctor-"));
});
afterAll(() => {
  fs.rmSync(parent, { recursive: true, force: true });
});

describe("NEW-11 · the workspace checks, in process (sources)", () => {
  it("detect a non-verifying artifact and a corrupt ledger tail; a caller's section merges its status", async () => {
    const { collectWorkspaceDoctorChecks } = await import("../src/runners/workspace-doctor-runner.js");
    const { eventLedgerPath } = await import("@hardkas/core");
    const ws = await freshWorkspace("in-process");
    const healthy = await collectWorkspaceDoctorChecks({ workspaceRoot: ws });
    expect(codes(healthy)).toEqual([]);

    // a caller's failing section fails the report (the healthy workspace alone does not)
    expect(healthy.status).not.toBe("failed");
    const withFailure = await collectWorkspaceDoctorChecks({
      workspaceRoot: ws,
      extend: async () => ({ checks: [{ name: "Section", status: "error" }], status: "failed" })
    });
    expect(withFailure.status).toBe("failed");
    expect(withFailure.checks.map((c) => c.name)).toContain("Section");

    // each defect alone fails it
    const artifact = path.join(ws, ".hardkas", "artifacts", "broken.json");
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, "{");
    const badArtifact = await collectWorkspaceDoctorChecks({ workspaceRoot: ws });
    expect({ status: badArtifact.status, codes: codes(badArtifact) }).toEqual({ status: "failed", codes: ["ARTIFACT_INVALID"] });
    fs.rmSync(artifact);

    const ledger = eventLedgerPath(ws);
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    const before = fs.existsSync(ledger) ? fs.readFileSync(ledger) : undefined;
    fs.writeFileSync(ledger, '{"ok":1}\n{"torn": ');
    const torn = await collectWorkspaceDoctorChecks({ workspaceRoot: ws });
    expect({ status: torn.status, codes: codes(torn) }).toEqual({ status: "failed", codes: ["APPEND_CORRUPTION"] });
    if (before) fs.writeFileSync(ledger, before);
  });
});

describe("NEW-11 · hardkas doctor workspace", () => {
  it("a healthy workspace: no error check, exit 0, the L1 checks present and no L2 section; no L2 code loaded", { timeout: 300_000 }, async () => {
    const ws = await freshWorkspace("healthy");
    const r = doctor(ws, [], "healthy");
    expect(r.status, r.out.slice(0, 800)).toBe(0);
    expect(codes(r.report)).toEqual([]);
    const names = r.report.checks.map((c: any) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Node.js Version", "Workspace Validity", "Config Validity", "SDK Import Health"]));
    expect(names.filter((n: string) => /Igra|L2|EVM|Chain ID/.test(n))).toEqual([]);
    expect(r.modules.some((u) => u.includes("/packages/cli/dist/"))).toBe(true);
    expect(r.modules.filter((u) => L2_CODE.test(u))).toEqual([]);
  });

  it("an artifact that does not verify: ARTIFACT_INVALID naming the file, exit 1, then the typed failure envelope", { timeout: 300_000 }, async () => {
    const ws = await freshWorkspace("bad-artifact");
    const dir = path.join(ws, ".hardkas", "artifacts");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "broken.json"), "NOT VALID JSON {{{");
    const r = doctor(ws, [], "bad-artifact");
    expect(r.status).toBe(1);
    expect(r.report.status).toBe("failed");
    expect(codes(r.report)).toContain("ARTIFACT_INVALID");
    expect(r.report.checks.find((c: any) => c.code === "ARTIFACT_INVALID").details.paths[0]).toContain("broken.json");
    expect(r.envelope?.code).toBe("WORKSPACE_DOCTOR_FAILED");
  });

  it("a corrupt event-ledger tail: APPEND_CORRUPTION, exit 1", { timeout: 300_000 }, async () => {
    const ws = await freshWorkspace("bad-ledger");
    fs.mkdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true });
    const { eventLedgerPath } = await import("@hardkas/core");
    const ledger = eventLedgerPath(ws);
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, '{"ok":1}\n{"torn": ');
    const r = doctor(ws, [], "bad-ledger");
    expect(r.status).toBe(1);
    expect(codes(r.report)).toContain("APPEND_CORRUPTION");
  });

  it("a config that does not load: WORKSPACE_INVALID, exit 1", { timeout: 300_000 }, () => {
    const ws = path.join(parent, "bad-config");
    fs.mkdirSync(ws);
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {{{ not typescript\n");
    const r = doctor(ws, [], "bad-config");
    expect(r.status).toBe(1);
    expect(codes(r.report)).toContain("WORKSPACE_INVALID");
  });

  it("--workspace: it checks the named workspace, not the current directory (WA-I0)", { timeout: 300_000 }, async () => {
    const ws = await freshWorkspace("named");
    const dir = path.join(ws, ".hardkas", "artifacts");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "broken.json"), "{");
    const elsewhere = path.join(parent, "elsewhere");
    fs.mkdirSync(elsewhere);
    const r = doctor(elsewhere, ["--workspace", ws], "named");
    expect(codes(r.report)).toContain("ARTIFACT_INVALID");
    expect(r.report.checks.find((c: any) => c.name === "Workspace Validity").message).toContain("named");
  });
});
