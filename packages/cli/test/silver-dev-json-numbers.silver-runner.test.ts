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
// H-B1 / B-3 · the exact form, end to end. `silver debug` and `silver preflight` take a large integer as
// {"kind":"int","value":"<digits>"} in --state, --next-state and --args; GuardedVaultCounter.bump requires the successor
// to be prev + delta, so a run is APPROVED only when every value reached the VM exactly. Controls: the same run with the
// successor one unit off is REJECTED. Plain JSON integers up to 2^53 - 1 are accepted as such. SilverScript runner level:
// the built CLI, silverc and HARDKAS_SILVER_RUNNER (a local cli-debugger build, UNVERIFIED, run with
// --allow-unverified-runner).
// -----------------------------------------------------------------------------

const VAULT = path.join(repoRoot, "examples", "10-covenant-dev-framework", "contracts", "guarded-vault-counter.sil");
const made: string[] = [];
let ws = "";

/** Every top-level JSON document a command printed, in order. */
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
    debug: docs.find((d) => d?.schema === "hardkas.silver.debugReport.v1"),
    preflight: docs.find((d) => d?.schema === "hardkas.silver.preflight.v1"),
    brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}`
  };
}

const exactInt = (digits: string) => ({ kind: "int", value: digits });
const json = (v: unknown) => JSON.stringify(v);
const signer = { kind: "signer", signer: "owner" };

beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-silver-json-exact-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
  // GuardedVaultCounter(pubkey owner, int init_value, int max_fee): the testbed's owner key, 10, 500000
  const owner = createCovenantTestbed().getAccount("owner").xOnlyPublicKey;
  fs.writeFileSync(path.join(ws, "ctor.json"), JSON.stringify([{ kind: "bytes", value: [...Buffer.from(owner, "hex")] }, { kind: "int", value: 10 }, { kind: "int", value: 500000 }]));
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const explicit = (state: unknown, next: unknown, args: unknown[]) => [
  "--entry", "bump", "--constructor-args", "ctor.json", "--state", json(state), "--next-state", json(next), "--args", json(args), "--allow-unverified-runner", "--json"
];

describe("B-3 · large integers in the exact form reach the VM exactly through the CLI", () => {
  it("E1 debug: state 2^53 + 1, delta 5, successor 2^53 + 6 (all exact strings): APPROVED, exit 0", async () => {
    const r = await run(["silver", "debug", VAULT, ...explicit({ value: exactInt("9007199254740993") }, { value: exactInt("9007199254740998") }, [exactInt("5"), signer])]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.debug?.contractVerdict, r.brief).toBe("APPROVED");
    expect(r.debug?.verdicts?.scriptVm?.verdict, r.brief).toBe("PASS");
  });

  it("E2 control: the same with the successor one unit off (2^53 + 5): REJECTED by the VM, exit 1", async () => {
    const r = await run(["silver", "debug", VAULT, ...explicit({ value: exactInt("9007199254740993") }, { value: exactInt("9007199254740997") }, [exactInt("5"), signer])]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.debug?.contractVerdict, r.brief).toBe("REJECTED");
    expect(r.debug?.verdicts?.scriptVm?.verdict, r.brief).toBe("REJECTED");
  });

  it("E3 debug: state 10, delta 2^53 + 1 as an exact string, successor 2^53 + 11: APPROVED", async () => {
    const r = await run(["silver", "debug", VAULT, ...explicit({ value: 10 }, { value: exactInt("9007199254741003") }, [exactInt("9007199254740993"), signer])]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.debug?.verdicts?.scriptVm?.verdict, r.brief).toBe("PASS");
  });

  it("E4 control: delta 2^53 + 1 with the successor one unit off (2^53 + 10): REJECTED by the VM", async () => {
    const r = await run(["silver", "debug", VAULT, ...explicit({ value: 10 }, { value: exactInt("9007199254741002") }, [exactInt("9007199254740993"), signer])]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.debug?.verdicts?.scriptVm?.verdict, r.brief).toBe("REJECTED");
  });

  it("E5 preflight: state 2^53 + 1, delta 5, successor 2^53 + 6: PREFLIGHT PASS on SCRIPT_VM, exit 0", async () => {
    const r = await run(["silver", "preflight", VAULT, ...explicit({ value: exactInt("9007199254740993") }, { value: exactInt("9007199254740998") }, [exactInt("5"), signer])]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.preflight?.passed, r.brief).toBe(true);
    expect(r.preflight?.vmOutcome, r.brief).toBe("SCRIPT_VM_PASS");
  });

  it("E6 control: preflight with the successor one unit off: FAIL on SCRIPT_VM, exit 1", async () => {
    const r = await run(["silver", "preflight", VAULT, ...explicit({ value: exactInt("9007199254740993") }, { value: exactInt("9007199254740997") }, [exactInt("5"), signer])]);
    expect(r.exit, r.brief).toBe(1);
    expect(r.preflight?.passed, r.brief).toBe(false);
    expect(r.preflight?.vmOutcome, r.brief).toBe("SCRIPT_VM_REJECTED");
  });

  it("E7 plain JSON integers are accepted up to 2^53 - 1: state 9007199254740991, delta 5, successor 2^53 + 4 (exact string): APPROVED", async () => {
    const r = await run(["silver", "debug", VAULT, ...explicit({ value: 9007199254740991 }, { value: exactInt("9007199254740996") }, [{ kind: "int", value: 5 }, signer])]);
    expect(r.exit, r.brief).toBe(0);
    expect(r.debug?.verdicts?.scriptVm?.verdict, r.brief).toBe("PASS");
  });
});

// -----------------------------------------------------------------------------
// N-1 · a large constructor argument reaches the VM exactly, whatever the key order of its {kind, value} object.
// LimitedCounter.bump requires delta <= limit, and `limit` (2^53 + 1) is a constructor argument: a delta of 2^53 + 1 is
// APPROVED only if the limit was read exactly; a delta of 2^53 + 2 is REJECTED (control: the limit is not larger either).
// The forms: canonical order with the digits as a JSON number (what HardKAS writes itself), "value" before "kind", a key
// between them, and the digits as a string.
// -----------------------------------------------------------------------------

const LIMITED = `pragma silverscript ^0.1.0;

contract LimitedCounter(pubkey owner, int init_value, int limit) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta, sig s) : (State) {
        require(checkSig(s, owner));
        require(delta > 0);
        require(delta <= limit);
        return(State { value: prev_state.value + delta });
    }
}
`;
const LIMIT_FORMS: Record<string, string> = {
  canonical: '{"kind":"int","value":9007199254740993}',
  "value-first": '{"value":9007199254740993,"kind":"int"}',
  "middle-key": '{"kind":"int","note":"limit","value":9007199254740993}',
  string: '{"value":"9007199254740993","kind":"int"}'
};

describe("N-1 · a constructor argument of 2^53 + 1 is read exactly in every key order", () => {
  let limited = "";
  beforeAll(() => {
    limited = path.join(ws, "limited-counter.sil");
    fs.writeFileSync(limited, LIMITED);
    const owner = createCovenantTestbed().getAccount("owner").xOnlyPublicKey;
    const ownerJson = `{"kind":"bytes","value":[${[...Buffer.from(owner, "hex")].join(",")}]}`;
    for (const [form, limit] of Object.entries(LIMIT_FORMS)) {
      fs.writeFileSync(path.join(ws, `limited-ctor-${form}.json`), `[${ownerJson},{"kind":"int","value":10},${limit}]`);
    }
  });

  const limitedRun = (command: "debug" | "preflight", form: string, delta: string, next: string) =>
    run([
      "silver", command, limited, "--entry", "bump", "--constructor-args", `limited-ctor-${form}.json`,
      "--state", json({ value: 10 }), "--next-state", json({ value: exactInt(next) }), "--args", json([exactInt(delta), signer]),
      "--allow-unverified-runner", "--json"
    ]);

  for (const form of Object.keys(LIMIT_FORMS)) {
    it(`L-${form}: delta 2^53 + 1 is within the limit: APPROVED, exit 0`, async () => {
      const r = await limitedRun("debug", form, "9007199254740993", "9007199254741003");
      expect(r.exit, r.brief).toBe(0);
      expect(r.debug?.verdicts?.scriptVm?.verdict, r.brief).toBe("PASS");
    });

    it(`L-${form} control: delta 2^53 + 2 is over the limit: REJECTED by the VM, exit 1`, async () => {
      const r = await limitedRun("debug", form, "9007199254740994", "9007199254741004");
      expect(r.exit, r.brief).toBe(1);
      expect(r.debug?.verdicts?.scriptVm?.verdict, r.brief).toBe("REJECTED");
    });
  }

  it("L-preflight: value before kind, delta 2^53 + 1: PREFLIGHT PASS on SCRIPT_VM, exit 0", async () => {
    const r = await limitedRun("preflight", "value-first", "9007199254740993", "9007199254741003");
    expect(r.exit, r.brief).toBe(0);
    expect(r.preflight?.vmOutcome, r.brief).toBe("SCRIPT_VM_PASS");
  });

  it("L-record: a compile record as the target, its constructor arguments with value before kind: APPROVED; the control REJECTED", async () => {
    const record = path.join(ws, "limited-counter.record.json");
    const compiled = await run(["silver", "compile", limited, "--args", "limited-ctor-canonical.json", "--out", record, "--json"]);
    expect(compiled.exit, compiled.brief).toBe(0);
    const debugRecord = (delta: string, next: string) =>
      run([
        "silver", "debug", record, "--entry", "bump", "--constructor-args", "limited-ctor-value-first.json",
        "--state", json({ value: 10 }), "--next-state", json({ value: exactInt(next) }), "--args", json([exactInt(delta), signer]),
        "--allow-unverified-runner", "--json"
      ]);
    const ok = await debugRecord("9007199254740993", "9007199254741003");
    expect(ok.exit, ok.brief).toBe(0);
    expect(ok.debug?.verdicts?.scriptVm?.verdict, ok.brief).toBe("PASS");
    const over = await debugRecord("9007199254740994", "9007199254741004");
    expect(over.exit, over.brief).toBe(1);
    expect(over.debug?.verdicts?.scriptVm?.verdict, over.brief).toBe("REJECTED");
  });
});
