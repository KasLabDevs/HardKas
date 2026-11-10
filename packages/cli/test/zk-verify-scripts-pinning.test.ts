// ZK crypto review after RC2 (crypto-review-plan H1, H2) at the CLI: `hardkas zk toccata verify-scripts` run as a user
// runs it (the built CLI, one process per command). The scripts come from `zk toccata build-scripts` for the official
// RISC Zero vector, whose proof-only lock a real rusty-kaspad v2.1.0 accepted a spend of
// (fixtures/toccata-v2/zk/r0-groth16-official/evidence.json), and are then edited byte by byte.
import { describe, expect, it } from "vitest";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
const EVIDENCE = JSON.parse(readFileSync(resolve(R0, "evidence.json"), "utf8"));

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

const kaspa = loadManagedKaspaWasmSync();
const addr = (seed: string) => new kaspa.PrivateKey(seed.repeat(32)).toKeypair().toAddress("simnet").toString();
const ALICE = addr("11");
const BOB = addr("22");
const ATTACKER = addr("66");

/** P2SH signature script: <journal hash> <128-byte proof> <redeem script> (OP_DATA_32, OP_PUSHDATA1, OP_PUSHDATA2). */
function sigScriptFor(redeem: string, proof: string): string {
  const len = Buffer.alloc(2);
  len.writeUInt16LE(redeem.length / 2, 0);
  return "20" + JOURNAL + "4c80" + proof + "4d" + len.toString("hex") + redeem;
}
function buildScripts(extra: string[] = []) {
  const r = hardkas(["zk", "toccata", "build-scripts", "--image-id", IMAGE, "--journal-hash", JOURNAL, "--receipt", RECEIPT_PATH, ...extra, "--json"]);
  expect(r.status, r.stderr).toBe(0);
  return r.json as { redeemScript: string; sigScript: string; preparedProof: string; redeemScriptHash: string };
}
const verify = (redeem: string, sig: string, extra: string[] = []) =>
  hardkas(["zk", "toccata", "verify-scripts", "--redeem-script", redeem, "--sig-script", sig, ...extra, "--json"]);

describe("hardkas zk toccata verify-scripts · pinned RISC Zero key and byte-exact output binding", { timeout: 300000 }, () => {
  const official = buildScripts();
  const VK_ALPHA = official.redeemScript.slice(-6 - 848, -6 - 848 + 64); // first 32 bytes of the 424-byte key before 0x20 a6

  it("control: the node-accepted official lock verifies (pinned key, canonical, proof-only)", () => {
    expect(official.redeemScriptHash).toBe(EVIDENCE.redeemScriptHash);
    expect(sigScriptFor(official.redeemScript, official.preparedProof)).toBe(official.sigScript);
    const r = verify(official.redeemScript, official.sigScript, ["--image-id", IMAGE, "--journal-hash", JOURNAL]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.json.verifyingKeyPinned).toBe(true);
    expect(r.json.redeemScriptCanonical).toBe(true);
    expect(r.json.consensusEnforced).toBe(false);
  });

  it("H1: a trapdoor verifying key with the right image id fails with ZK_VERIFYING_KEY_NOT_PINNED (exit 1)", () => {
    const trap = "01" + "00".repeat(31); // alpha := the G1 generator (alpha's trapdoor is 1)
    const redeem = official.redeemScript.replace(VK_ALPHA, trap);
    expect(redeem).not.toBe(official.redeemScript);
    const r = verify(redeem, sigScriptFor(redeem, official.preparedProof), ["--image-id", IMAGE]);
    expect(r.status).toBe(1);
    expect(r.json.verifyingKeyPinned).toBe(false);
    expect(codes(r.json)).toContain("ZK_VERIFYING_KEY_NOT_PINNED");
  });

  it("H2: an output-bound lock whose output count is pushed and dropped is not consensus-enforced (exit 1)", () => {
    const bound = buildScripts(["--mode", "proof-and-output-bound", "--payout-address", ALICE, "--payout-amount", "100000000"]);
    const at = official.redeemScript.length;
    expect(bound.redeemScript.slice(at, at + 8)).toBe("69b4519d");
    const redeem = bound.redeemScript.slice(0, at) + "69b475" + bound.redeemScript.slice(at + 8);
    const ok = verify(bound.redeemScript, bound.sigScript, ["--expected-mode", "proof-and-output-bound", "--expected-payout-address", ALICE]);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.json.consensusEnforced).toBe(true);
    const r = verify(redeem, sigScriptFor(redeem, bound.preparedProof), ["--expected-mode", "proof-and-output-bound", "--expected-payout-address", ALICE]);
    expect(r.status).toBe(1);
    expect(r.json.consensusEnforced).toBe(false);
    expect(codes(r.json)).toContain("ZK_REDEEM_SCRIPT_NOT_CANONICAL");
  });

  it("H2: the change output is checked against --expected-change-address / --expected-change-amount", () => {
    const bound = buildScripts([
      "--mode", "proof-and-output-bound", "--payout-address", ALICE, "--payout-amount", "100000000",
      "--change-address", ATTACKER, "--change-amount", "15000000"
    ]);
    const r = verify(bound.redeemScript, bound.sigScript, ["--expected-payout-address", ALICE, "--expected-change-address", BOB, "--expected-change-amount", "15000000"]);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(codes(r.json)).toContain("ZK_BOUND_CHANGE_SPK_MISMATCH");
    const fine = verify(bound.redeemScript, bound.sigScript, ["--expected-change-address", ATTACKER, "--expected-change-amount", "15000000"]);
    expect(fine.status, fine.stdout + fine.stderr).toBe(0);
    expect(fine.json.boundChangeAmount).toBeDefined();
  });
});
