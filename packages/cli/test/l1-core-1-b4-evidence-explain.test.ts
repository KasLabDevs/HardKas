// L1-CORE-1 B4 · evidence explain: the package explained is one the CLI itself packed (`task pay --evidence` in a
// simulated workspace: plan, signed tx and receipt of a simulated payment). Human and --json outputs are asserted against
// that package, and so are the refusals: a missing path, a JSON file that is not an evidence package, and a package
// edited after it was packed (explain must not present it as if it verified).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cli, envelope, simulatedWorkspace, removeDir } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

const TASK = `  tasks: {
    pay: {
      description: "l1-core-1 b4: one simulated payment alice -> bob",
      actionFn: async (_args, hk) => {
        const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        const signed = await hk.tx.sign(plan, { account: "alice" });
        await hk.tx.send(signed);
        return { txId: signed.txId };
      }
    }
  },
`;

describe("evidence explain", () => {
  let parent: string;
  let ws: string;
  let pkgPath: string;
  let pkg: any;

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-evidence-explain-"));
    const configPath = path.join(ws, "hardkas.config.ts");
    const config = fs.readFileSync(configPath, "utf8");
    const withTask = config.replace(/export default defineHardkasConfig\(\{\r?\n/, (m) => `${m}${TASK}`);
    if (withTask === config) throw new Error(`unexpected hardkas.config.ts from init:\n${config}`);
    fs.writeFileSync(configPath, withTask);

    const r = cli(["task", "pay", "--evidence", "--json"], ws);
    if (r.status !== 0) throw new Error(`task pay --evidence failed (exit ${r.status}):\n${r.all.slice(0, 2000)}`);
    pkgPath = path.join(ws, "pay.hke.json");
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  });
  afterAll(() => removeDir(parent));

  it("control: the package packed by the CLI carries the payment's plan, signed tx and receipt and verifies", () => {
    expect(pkg.artifacts.map((a: any) => a.schema)).toEqual(["hardkas.txPlan", "hardkas.signedTx", "hardkas.txReceipt"]);
    const v = cli(["evidence", "verify", pkgPath, "--json"], ws);
    expect(v.status, v.all.slice(0, 600)).toBe(0);
    expect(envelope(v.stdout)?.result?.status).toBe("EVIDENCE_VERIFIED");
  });

  it("human: name, mode, recorded status, artifact count, discovery and every claim, as the package records them", () => {
    const r = cli(["evidence", "explain", pkgPath], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    expect(r.stdout).toContain(`Evidence Package V1: ${pkg.name}`);
    expect(r.stdout).toContain(`Mode: ${pkg.mode}`);
    expect(r.stdout).toContain(`Status: ${pkg.scenarioResult.status}`);
    expect(r.stdout).toContain(`Total Artifacts Bundled: ${pkg.artifacts.length}`);
    expect(r.stdout).toContain(`Discovery Method: ${pkg.artifactDiscovery.source}`);
    for (const [k, v] of Object.entries(pkg.claims)) expect(r.stdout).toContain(`  - ${k}: ${v}`);
  });

  it("--json: one envelope whose explanation is the human text", () => {
    const human = cli(["evidence", "explain", pkgPath], ws).stdout;
    const r = cli(["evidence", "explain", pkgPath, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: true, command: "evidence explain", mode: "cli" });
    expect(String(e.result.explanation).trim()).toBe(human.trim());
  });

  it("says whether the package verifies: an intact package is EVIDENCE_VERIFIED, in both outputs", () => {
    const r = cli(["evidence", "explain", pkgPath, "--json"], ws);
    const e = envelope(r.stdout);
    expect(e?.result?.verification).toMatchObject({ ok: true, status: "EVIDENCE_VERIFIED" });
    expect(cli(["evidence", "explain", pkgPath], ws).stdout).toMatch(/Verification: EVIDENCE_VERIFIED/);
  });

  it("a package edited after packing (its recorded verdict changed) is explained with the verdict that it does not verify", () => {
    const edited = JSON.parse(JSON.stringify(pkg));
    edited.scenarioResult.status = "failed";
    const editedPath = path.join(ws, "edited.hke.json");
    fs.writeFileSync(editedPath, JSON.stringify(edited, null, 2));
    const r = cli(["evidence", "explain", editedPath, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e?.result?.verification?.ok).toBe(false);
    expect(e?.result?.verification?.status).toBe("EVIDENCE_SCENARIO_RESULT_INVALID");
    expect(String(e?.result?.explanation)).toMatch(/Verification: EVIDENCE_SCENARIO_RESULT_INVALID/);
  });

  it("a path that does not exist: exit 1, one error envelope naming it", () => {
    const missing = path.join(ws, "missing.hke.json");
    const r = cli(["evidence", "explain", missing, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(1);
    const e = envelope(r.stdout);
    expect(e?.ok).toBe(false);
    expect(String(e?.message)).toContain(missing);
  });

  it("a JSON file that is not an evidence package (a receipt the CLI wrote): typed refusal EVIDENCE_INVALID_SCHEMA, exit 1", () => {
    const receipt = pkg.artifacts.find((a: any) => a.schema === "hardkas.txReceipt");
    const receiptPath = path.join(ws, ".hardkas", "artifacts", "receipts", `txReceipt-${receipt.contentHash}.json`);
    expect(fs.existsSync(receiptPath)).toBe(true);
    const r = cli(["evidence", "explain", receiptPath, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(1);
    expect(envelope(r.stdout)).toMatchObject({ ok: false, code: "EVIDENCE_INVALID_SCHEMA" });
  });
});
