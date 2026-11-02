import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createCovenantTestbed } from "@hardkas/testing";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// R-03 · `hardkas silver debug` runs the mandatory structural (F1.4) validation and reports three verdicts apart:
// structural, SCRIPT_VM and global. Global APPROVED needs both; a structural refusal (bulky-counter.sil, default fee:
// FEE_BELOW_V1_FLOOR) is REJECTED with a non-zero exit even when the runner accepts the script. Generated lab inputs
// need --demo-fixture, as in `silver preflight`. SilverScript runner level: the built CLI, silverc and the runner.
// -----------------------------------------------------------------------------

const BULKY = path.join(repoRoot, "packages", "testing", "test", "fixtures", "silver", "bulky-counter.sil");
const OWNED = path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil");
const made: string[] = [];
let ws = "";

/** Every top-level JSON document a command printed, in order (the report, then any error document). */
function documents(stdout: string): any[] {
  const out: any[] = [];
  for (const chunk of stdout.split(/\r?\n(?=[{[])/)) {
    try {
      out.push(JSON.parse(chunk.trim()));
    } catch {
      /* not a document */
    }
  }
  return out;
}

async function run(args: string[]) {
  const log = path.join(ws, "net.log");
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd: ws, env: hermeticChildEnv(log, { NO_COLOR: "1" }) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  const docs = documents(r.stdout);
  return {
    exit: r.status,
    report: docs.find((d) => d?.schema === "hardkas.silver.debugReport.v1"),
    // JSON mode writes ONE document per run (ui.ts): the failure envelope only when no report was written
    error: docs.find((d) => d?.ok === false),
    text: `${r.stdout}\n${r.stderr}`,
    brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}`
  };
}

beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-silver-debug-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
  // explicit inputs: the testbed's owner key in the constructor, a valid bump 10 -> 15
  const owner = createCovenantTestbed().getAccount("owner").xOnlyPublicKey;
  fs.writeFileSync(path.join(ws, "ctor.json"), JSON.stringify([{ kind: "bytes", value: [...Buffer.from(owner, "hex")] }, { kind: "int", value: 10 }]));
  fs.writeFileSync(path.join(ws, "args.json"), JSON.stringify([{ kind: "int", value: 5 }, { kind: "signer", signer: "owner" }]));
  fs.writeFileSync(path.join(ws, "state10.json"), JSON.stringify({ value: 10 }));
  fs.writeFileSync(path.join(ws, "state15.json"), JSON.stringify({ value: 15 }));
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const explicit = ["--entry", "bump", "--constructor-args", "ctor.json", "--args", "args.json", "--state", "state10.json", "--next-state", "state15.json", "--json"];

describe("R-03 · silver debug never approves what the structural validation refuses", () => {
  it("CD1 bulky-counter, explicit inputs, default fee: structural FAIL (FEE_BELOW_V1_FLOOR), SCRIPT_VM PASS, global REJECTED, exit 1", async () => {
    const r = await run(["silver", "debug", BULKY, ...explicit]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.report?.contractVerdict, r.brief).toBe("REJECTED");
    expect(r.report?.verdicts).toMatchObject({
      structural: { verdict: "FAIL", code: "FEE_BELOW_V1_FLOOR" },
      scriptVm: { verdict: "PASS" },
      global: "REJECTED"
    });
    expect(r.report?.passed).toBe(false);
    // the report is the run's one JSON document: no second (failure) envelope after it
    expect(r.error).toBeUndefined();
  });

  it("CD1b the same in text mode: REJECTED, exit 1, the error names SILVER_DEBUG_STRUCTURAL_REJECTED and FEE_BELOW_V1_FLOOR", async () => {
    const r = await run(["silver", "debug", BULKY, ...explicit.filter((a) => a !== "--json")]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.text).toContain("REJECTED");
    expect(r.text).toContain("SILVER_DEBUG_STRUCTURAL_REJECTED");
    expect(r.text).toContain("FEE_BELOW_V1_FLOOR");
  });

  it("CD2 control: the same with --fee 1000000 is APPROVED on both levels, exit 0", async () => {
    const r = await run(["silver", "debug", BULKY, ...explicit, "--fee", "1000000"]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.report?.contractVerdict).toBe("APPROVED");
    expect(r.report?.verdicts).toMatchObject({ structural: { verdict: "PASS" }, scriptVm: { verdict: "PASS" }, global: "APPROVED" });
  });

  it("CD3 --allow-failure keeps the exit at 0 for inspection, never the verdict: still REJECTED", async () => {
    const r = await run(["silver", "debug", BULKY, ...explicit, "--allow-failure"]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.report?.contractVerdict).toBe("REJECTED");
    expect(r.report?.verdicts?.global).toBe("REJECTED");
  });

  it("CD4 generated lab inputs without --demo-fixture are refused (usage error), as in silver preflight", async () => {
    const r = await run(["silver", "debug", OWNED, "--entry", "bump", "--json"]);
    expect(r.exit, r.brief).toBe(2);
    // refused before any report: the failure envelope is the run's one document
    expect(r.report).toBeUndefined();
    expect(r.error?.code).toBe("SILVER_DEBUG_SYNTHETIC_INPUTS_FORBIDDEN");
  });

  it("CD5 with --demo-fixture the generated inputs run, labelled as a lab fixture and never a real deployment", async () => {
    const r = await run(["silver", "debug", OWNED, "--entry", "bump", "--demo-fixture", "--json"]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.report?.contractVerdict).toBe("APPROVED");
    expect(r.report?.contextOrigin).toMatchObject({ mode: "GENERATED_DEMO_FIXTURE", isRealDeploymentValidation: false, utxoOrigin: "GENERATED_LAB_FIXTURE_UTXO" });
  });
});
