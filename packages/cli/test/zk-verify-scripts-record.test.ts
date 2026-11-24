// BETA-FIX W2 · task 2 — `hardkas zk toccata verify-scripts --scripts <record>`: the JSON record `zk toccata build-scripts
// --json` prints (what `zk toccata spend --scripts` takes) is verified as it is, instead of only `--redeem-script` +
// `--sig-script` (found on Testnet-10, 21-nov: a build-scripts record could not be verified as written). The record is
// read as `spend` reads it; its scripts are verified against what the record itself claims (image id, journal hash,
// binding mode, bound outputs) plus any --image-id / --journal-hash / --expected-* given; its P2SH script and addresses
// must be the ones its redeem script hashes to. `--scripts` and `--redeem-script` are exclusive: both, or neither, is a
// usage error (exit 2). The built CLI, one process per command; offline (no node).
import { describe, expect, it } from "vitest";
import { resolve, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
function repoRoot(): string {
  let current = __dirname;
  while (current !== resolve(current, "..")) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    current = resolve(current, "..");
  }
  throw new Error("repo root not found");
}

const CLI = resolve(__dirname, "../dist/index.js");
const R0 = resolve(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
const RECEIPT_PATH = resolve(R0, "receipt.hex");
const IMAGE = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const JOURNAL = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";

function hardkas(args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
    timeout: 120000,
    env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1", NODE_OPTIONS: "--no-warnings" }
  });
  let json: any;
  try {
    json = JSON.parse(r.stdout ?? "");
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", json };
}
const codes = (json: any): string[] => (Array.isArray(json?.issues) ? json.issues.map((i: any) => i.code) : []);
const brief = (r: { status: number | null; stdout: string; stderr: string }) => JSON.stringify({ status: r.status, stdout: r.stdout.slice(-1500), stderr: r.stderr.slice(-800) });

const kaspa = loadManagedKaspaWasmSync();
const PAYOUT = new kaspa.PrivateKey("44".repeat(32)).toKeypair().toAddress("testnet-10").toString();

describe("hardkas zk toccata verify-scripts --scripts <record>", { timeout: 300000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "hk-w2-zk-record-"));
  // the record exactly as the TN10 run wrote it: build-scripts --json, output-bound, with its testnet-10 address
  const built = hardkas([
    "zk", "toccata", "build-scripts", "--image-id", IMAGE, "--journal-hash", JOURNAL, "--receipt", RECEIPT_PATH,
    "--mode", "proof-and-output-bound", "--payout-address", PAYOUT, "--payout-amount", "100000000", "--address-network", "testnet-10", "--json"
  ]);
  const RECORD = join(dir, "lock.json");
  writeFileSync(RECORD, built.stdout);
  const record = JSON.parse(built.stdout);
  const write = (name: string, value: unknown) => {
    const file = join(dir, name);
    writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2));
    return file;
  };

  it("control: the build-scripts record is successful and carries its testnet-10 address", () => {
    expect(built.status, brief(built)).toBe(0);
    expect(record.ok).toBe(true);
    expect(record.bindingMode).toBe("proof-and-output-bound");
    expect(String(record.p2shAddresses?.testnet10)).toMatch(/^kaspatest:p/);
  });

  it("the record verifies as written: exit 0, canonical over the pinned verifier, consensus-enforced, the record's checks reported", () => {
    const r = hardkas(["zk", "toccata", "verify-scripts", "--scripts", RECORD, "--json"]);
    expect(r.status, brief(r)).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.redeemScriptCanonical).toBe(true);
    expect(r.json.verifyingKeyPinned).toBe(true);
    expect(r.json.consensusEnforced).toBe(true);
    expect(r.json.scriptsRecord).toMatchObject({ path: RECORD, p2shScriptPublicKeyMatches: true, addressesMatch: { simnet: true, testnet10: true } });
  });

  it("the same verdict as --redeem-script + --sig-script with the record's own expectations", () => {
    const viaRecord = hardkas(["zk", "toccata", "verify-scripts", "--scripts", RECORD, "--json"]);
    const viaHex = hardkas([
      "zk", "toccata", "verify-scripts", "--redeem-script", record.redeemScript, "--sig-script", record.sigScript, "--image-id", IMAGE, "--journal-hash", JOURNAL,
      "--expected-mode", "proof-and-output-bound", "--expected-payout-address", PAYOUT, "--expected-payout-amount", "100000000", "--json"
    ]);
    expect(viaHex.status, brief(viaHex)).toBe(0);
    const fromRecord = { ...viaRecord.json };
    delete fromRecord.scriptsRecord;
    expect(fromRecord).toEqual(viaHex.json);
  });

  it("--scripts and --redeem-script are exclusive; one of them is required; --sig-script goes with --redeem-script only (usage, exit 2)", () => {
    const both = hardkas(["zk", "toccata", "verify-scripts", "--scripts", RECORD, "--redeem-script", record.redeemScript, "--sig-script", record.sigScript, "--json"]);
    expect(both.status, brief(both)).toBe(2);
    expect(both.json?.code, brief(both)).toBe("ZK_VERIFY_SCRIPTS_INPUT_CONFLICT");
    const sigToo = hardkas(["zk", "toccata", "verify-scripts", "--scripts", RECORD, "--sig-script", record.sigScript, "--json"]);
    expect(sigToo.status, brief(sigToo)).toBe(2);
    expect(sigToo.json?.code, brief(sigToo)).toBe("ZK_VERIFY_SCRIPTS_INPUT_CONFLICT");
    const neither = hardkas(["zk", "toccata", "verify-scripts", "--json"]);
    expect(neither.status, brief(neither)).toBe(2);
    expect(neither.json?.code, brief(neither)).toBe("ZK_VERIFY_SCRIPTS_INPUT_REQUIRED");
    const noSig = hardkas(["zk", "toccata", "verify-scripts", "--redeem-script", record.redeemScript, "--json"]);
    expect(noSig.status, brief(noSig)).toBe(2);
    expect(noSig.json?.code, brief(noSig)).toBe("ZK_VERIFY_SCRIPTS_INPUT_REQUIRED");
  });

  it("a file that is not a successful build-scripts record is refused as spend refuses it (exit 2, ZK_VERIFY_SCRIPTS_RECORD_INVALID)", () => {
    for (const file of [write("not-json.json", "{"), write("other.json", { schema: "hardkas.somethingElse.v1", ok: true }), write("failed.json", { ...record, ok: false }), join(dir, "missing.json")]) {
      const r = hardkas(["zk", "toccata", "verify-scripts", "--scripts", file, "--json"]);
      expect(r.status, `${file} ${brief(r)}`).toBe(2);
      expect(r.json?.code, `${file} ${brief(r)}`).toBe("ZK_VERIFY_SCRIPTS_RECORD_INVALID");
    }
  });

  it("a record whose P2SH script or address is not its redeem script's, or whose claims are not its scripts', fails (exit 1)", () => {
    const otherSpk = { ...record, p2shScriptPublicKey: { ...record.p2shScriptPublicKey, script: `aa20${"00".repeat(32)}87` } };
    const r1 = hardkas(["zk", "toccata", "verify-scripts", "--scripts", write("spk.json", otherSpk), "--json"]);
    expect(r1.status, brief(r1)).toBe(1);
    expect(codes(r1.json)).toContain("ZK_SCRIPTS_RECORD_P2SH_MISMATCH");
    const otherAddress = { ...record, p2shAddresses: { ...record.p2shAddresses, testnet10: PAYOUT } };
    const r2 = hardkas(["zk", "toccata", "verify-scripts", "--scripts", write("address.json", otherAddress), "--json"]);
    expect(r2.status, brief(r2)).toBe(1);
    expect(codes(r2.json)).toContain("ZK_SCRIPTS_RECORD_ADDRESS_MISMATCH");
    const otherPayout = { ...record, bindingPolicy: { ...record.bindingPolicy, payout: { ...record.bindingPolicy.payout, amountSompi: "100000001" } } };
    const r3 = hardkas(["zk", "toccata", "verify-scripts", "--scripts", write("payout.json", otherPayout), "--json"]);
    expect(r3.status, brief(r3)).toBe(1);
    expect(r3.json.ok).toBe(false);
    // an expectation of the caller's that the record does not meet fails too
    const r4 = hardkas(["zk", "toccata", "verify-scripts", "--scripts", RECORD, "--image-id", "00".repeat(32), "--json"]);
    expect(r4.status, brief(r4)).toBe(1);
    expect(r4.json.ok).toBe(false);
  });

  it("cleanup", () => {
    rmSync(dir, { recursive: true, force: true });
  });
});
