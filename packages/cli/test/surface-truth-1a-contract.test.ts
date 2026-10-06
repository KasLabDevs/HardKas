import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { createScenarioResultArtifact, enumerateWorkspaceArtifactsSync } from "@hardkas/artifacts";
import { buildHardkasProgram } from "../src/program.js";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// SURFACE-TRUTH-1A · the contract the fixes settle, on the real CLI (built dist), beyond what the BEFORE file asks:
// the typed codes, the evidence statuses, what `repair --json` reports, what `dev --once` and a refused
// `sandbox --with-node` leave behind, and that `workflow replay` is hidden.

const cli = (args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(env), encoding: "utf8", timeout: 120_000 });
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

describe("SURFACE-TRUTH-1A · contract · CLI", () => {
  let parent: string;
  let ws: string;
  let receipt: any;

  const fresh = async (name: string) => {
    const dir = path.join(parent, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: dir, autoBootstrap: true, network: "simulated" });
    return dir;
  };

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1a-cli-"));
    ws = await fresh("project");
    for (const args of [
      ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "2", "--network", "simulated", "--out", "c-plan.json", "--json"],
      ["tx", "sign", "c-plan.json", "--out", "c-signed.json", "--json"],
      ["tx", "send", "c-signed.json", "--network", "simulated", "--json"]
    ]) {
      const r = cli(args, ws);
      expect(r.status, r.all).toBe(0);
    }
    receipt = enumerateWorkspaceArtifactsSync(ws).find((e: any) => e.artifact?.schema === "hardkas.txReceipt")?.artifact;
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  describe("evidence", () => {
    const sealedScenario = (name: string, status: "passed" | "failed", artifactsGenerated: string[]) => {
      const file = `${name}.scenario.json`;
      fs.writeFileSync(path.join(ws, file), JSON.stringify(createScenarioResultArtifact({ scenarioName: name, status, networkId: "simulated", mode: "simulator", artifactsGenerated })));
      return file;
    };
    const pack = (scenarioFile: string, out: string) => cli(["evidence", "pack", scenarioFile, "--out", out, "--json"], ws);
    const verifyStatus = (file: string) => {
      const r = cli(["evidence", "verify", file, "--json"], ws);
      return r.status === 0 ? docs(r.stdout).find((d: any) => d?.ok)?.result?.status : codeOf(r);
    };
    const edit = (from: string, to: string, change: (pkg: any) => void) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ws, from), "utf8"));
      change(pkg);
      fs.writeFileSync(path.join(ws, to), JSON.stringify(pkg, null, 2));
      return to;
    };

    it("pack refuses an unsealed scenario result and one that names an artifact the store does not hold", () => {
      fs.writeFileSync(path.join(ws, "unsealed.scenario.json"), JSON.stringify({ schema: "hardkas.scenarioResult.v1", scenarioName: "u", status: "passed", artifactsGenerated: [] }));
      const unsealed = pack("unsealed.scenario.json", "u.hke.json");
      const ghost = pack(sealedScenario("ghost", "passed", ["f".repeat(64)]), "g.hke.json");
      expect({ exit: unsealed.status, code: unsealed.all.includes("EVIDENCE_SCENARIO_RESULT_INVALID") }, unsealed.all).toEqual({ exit: 1, code: true });
      expect({ exit: ghost.status, code: ghost.all.includes("EVIDENCE_PACK_ARTIFACT_UNRESOLVED") }, ghost.all).toEqual({ exit: 1, code: true });
      expect(fs.existsSync(path.join(ws, "u.hke.json")) || fs.existsSync(path.join(ws, "g.hke.json"))).toBe(false);
    });

    it("verify names what broke: the verdict, the membership, the package's own copy of the run", () => {
      expect(pack(sealedScenario("named", "failed", [receipt.contentHash]), "named.hke.json").status).toBe(0);
      expect(verifyStatus("named.hke.json")).toBe("EVIDENCE_VERIFIED");
      expect(verifyStatus(edit("named.hke.json", "v.hke.json", (p) => (p.scenarioResult.status = "passed")))).toBe("EVIDENCE_SCENARIO_RESULT_INVALID");
      expect(verifyStatus(edit("named.hke.json", "m.hke.json", (p) => (p.artifacts = [])))).toBe("EVIDENCE_MEMBERSHIP_MISMATCH");
      expect(verifyStatus(edit("named.hke.json", "n.hke.json", (p) => (p.name = "another-run")))).toBe("EVIDENCE_PACKAGE_INCONSISTENT");
    });

    it("a scenario that names no artifact packs none, and that package verifies", () => {
      expect(pack(sealedScenario("none", "passed", []), "none.hke.json").status).toBe(0);
      const pkg = JSON.parse(fs.readFileSync(path.join(ws, "none.hke.json"), "utf8"));
      expect({ artifacts: pkg.artifacts.length, discovery: pkg.artifactDiscovery?.source }).toEqual({ artifacts: 0, discovery: "scenarioResult" });
      expect(verifyStatus("none.hke.json")).toBe("EVIDENCE_VERIFIED");
    });
  });

  it("verify-semantics refuses with VERIFY_SEMANTICS_UNSUPPORTED in every mode", () => {
    expect([codeOf(cli(["verify-semantics", "--json"], ws)), codeOf(cli(["verify-semantics", "--ci-mode", "--json"], ws))]).toEqual([
      "VERIFY_SEMANTICS_UNSUPPORTED",
      "VERIFY_SEMANTICS_UNSUPPORTED"
    ]);
  });

  it("repair --json reports what it found and whether it repaired it", async () => {
    const dir = await fresh("repair");
    // hardkas-append-allow: tears the tail of a scratch workspace's event log
    fs.appendFileSync(path.join(dir, "events.jsonl"), '{"ok":1}\n{"torn":');
    const report = docs(cli(["repair", "--json"], dir).stdout)[0];
    expect({ status: report?.status, tail: report?.findings?.find((f: any) => f.kind === "corrupt-tail")?.repaired }).toEqual({ status: "issues_found", tail: false });
    const forced = docs(cli(["repair", "--force", "--json"], dir).stdout)[0];
    expect({ status: forced?.status, tail: forced?.findings?.find((f: any) => f.kind === "corrupt-tail")?.repaired }).toEqual({ status: "success", tail: true });
  });

  it("dev --once leaves no dev-server token behind", async () => {
    const dir = await fresh("dev-once");
    const r = cli(["dev", "--once", "--headless"], dir);
    expect(r.status, r.all.slice(-600)).toBe(0);
    expect(fs.existsSync(path.join(dir, ".hardkas", "dev-server-token"))).toBe(false);
  });

  it("sandbox --with-node refuses before creating a sandbox", () => {
    const tmp = fs.mkdtempSync(path.join(parent, "sbx-"));
    const r = cli(["sandbox", "--with-node"], parent, { TEMP: tmp, TMP: tmp });
    expect({ exit: r.status, mentions: /SANDBOX_WITH_NODE_UNSUPPORTED/.test(r.all), created: fs.readdirSync(tmp).length }).toEqual({ exit: 1, mentions: true, created: 0 });
  });

  it("workflow replay is hidden and refuses with WORKFLOW_REPLAY_UNSUPPORTED", () => {
    const replay = buildHardkasProgram({ forDocs: true }).commands.find((c) => c.name() === "workflow")!.commands.find((c) => c.name() === "replay")!;
    expect((replay as any)._hidden).toBe(true);
    const r = cli(["workflow", "replay", "latest"], ws);
    expect({ exit: r.status, mentions: /WORKFLOW_REPLAY_UNSUPPORTED/.test(r.all) }).toEqual({ exit: 1, mentions: true });
  });
});
