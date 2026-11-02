import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  compileSilverScript,
  executeSilverVmScenario,
  loadManagedKaspaWasmSync,
  resolveSilverRunner,
  type SilAbiArtifact,
  type SilArtifactValue,
  type SilverRunner
} from "../src/index.js";

// -----------------------------------------------------------------------------
// F2 (H-B2, H-B3) on the real runner: the bytes HardKAS identified are the bytes that run.
// - On Windows, Node starts `<path>.exe` for a path without an extension: the digested file and the started one could
//   differ (the audit's P2).
// - The runner file can be replaced after the identity check, e.g. while HardKAS signs (the audit's P3); the REPL trace
//   was a second, unchecked start.
// SilverScript runner level: HARDKAS_SILVER_RUNNER names a local cli-debugger build (UNVERIFIED, run under the level's
// explicit opt-in) and silverc compiles the contract. "Another program" is a copy of the node executable.
// -----------------------------------------------------------------------------

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const real = resolveSilverRunner();
const k = loadManagedKaspaWasmSync();
const KEY = sha256("hardkas-f2-runner-identity-owner");
const OWNER = String(new k.PrivateKey(KEY).toPublicKey().toXOnlyPublicKey().toString());
const ownerArg: SilArtifactValue = { kind: "bytes", value: [...Buffer.from(OWNER, "hex")] };
const SIGNED_SPEND = "pragma silverscript ^0.1.0;\n\ncontract SignedSpend(pubkey owner) {\n    entry spend(sig s) {\n        require(checkSig(s, owner));\n    }\n}\n";
const EXE = process.platform === "win32" ? "cli-debugger.exe" : "cli-debugger";

let artifact: SilAbiArtifact;
let temp = "";
beforeAll(async () => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-runner-identity-"));
  artifact = (await compileSilverScript({ source: SIGNED_SPEND, constructorArgs: [ownerArg] })).artifact;
});
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

const freshDir = (name: string) => {
  const d = path.join(temp, name);
  fs.mkdirSync(d);
  return d;
};
const runnerAt = (p: string): SilverRunner => {
  const b = fs.readFileSync(p);
  return { path: p, binarySha256: sha256(b), size: b.length, provenance: "unmanaged-local-build" };
};
const spend = (runner: SilverRunner, signer: (account: string) => string, captureTrace = false) =>
  executeSilverVmScenario({
    source: SIGNED_SPEND,
    artifact,
    constructorArgs: [ownerArg],
    entrypoint: "spend",
    args: [{ signature: "owner" }],
    tx: { version: 1, lockTime: 0n, activeInputIndex: 0, inputs: [{ utxoValue: 5000n }], outputs: [{ value: 5000n }] },
    signer,
    runner,
    runnerTrust: "allow-unverified",
    captureTrace
  });
const brief = (r: Awaited<ReturnType<typeof spend>>) => `${r.status} ${r.outcomeClass} ${r.stderr.slice(0, 300)}`;

describe("F2 · the runner that runs is the runner that was identified", () => {
  it("I0 control: a copy of the real runner signs and passes; the recorded identity is its digest", async () => {
    const p = path.join(freshDir("i0"), EXE);
    fs.copyFileSync(real.path, p);
    const r = await spend(runnerAt(p), () => KEY);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
    expect(r.runnerIdentity?.sha256).toBe(real.binarySha256);
  });

  it.runIf(process.platform === "win32")("I1 a path without an extension next to an .exe: what runs is the digested file, not the .exe", async () => {
    const dir = freshDir("i1");
    const bare = path.join(dir, "cli-debugger");
    fs.copyFileSync(process.execPath, bare); // the digested file: another program
    fs.copyFileSync(real.path, `${bare}.exe`); // what Node would start for the bare path
    const r = await spend(runnerAt(bare), () => KEY);
    expect(r.runnerIdentity?.sha256).toBe(sha256(fs.readFileSync(bare)));
    // the digested program is not a runner: no verdict. A PASS here would be the .exe's, recorded under another identity.
    expect(r.status, brief(r)).toBe("BLOCKED");
  });

  it("I2 the runner file replaced while HardKAS signs: the identified bytes run, for the verdict and for the trace", async () => {
    const p = path.join(freshDir("i2"), EXE);
    fs.copyFileSync(real.path, p);
    const identified = runnerAt(p);
    const r = await spend(
      identified,
      () => {
        fs.copyFileSync(process.execPath, p); // replaced after the identity check, before any start
        return KEY;
      },
      true
    );
    expect(sha256(fs.readFileSync(p))).not.toBe(identified.binarySha256);
    expect(r.outcomeClass, brief(r)).toBe("SCRIPT_VM_PASS");
    expect(r.runnerIdentity?.sha256).toBe(identified.binarySha256);
    expect(r.trace?.length ?? 0, brief(r)).toBeGreaterThan(0);
  });
});
