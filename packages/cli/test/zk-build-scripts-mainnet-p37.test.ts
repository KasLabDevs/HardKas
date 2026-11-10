// ESCALÓN 4 · P37 · `hardkas zk toccata build-scripts --address-network mainnet` returned a lock's mainnet P2SH address
// with its signature script (a ZK lock's signature script is the authorization of its spend). Every mainnet spelling,
// and a bound payout address of mainnet, is now refused with MAINNET_SIGNING_DISABLED (the JSON envelope's code, exit 1)
// before the receipt is read: no address, no redeem or signature script on stdout. The built CLI, one process per
// command; offline (kaspa-wasm only, no node, no network).
import { describe, expect, it } from "vitest";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildHardkasProgram } from "../src/program.js";

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
const RECEIPT_PATH = resolve(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official", "receipt.hex");
const IMAGE = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
const JOURNAL = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";

function hardkas(args: string[]) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf-8",
    timeout: 120000,
    env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1", NODE_OPTIONS: "--no-warnings" }
  });
  const stdout = r.stdout ?? "";
  let json: any;
  try {
    json = JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout, stderr: r.stderr ?? "", json };
}
const build = (extra: string[], receipt = RECEIPT_PATH) =>
  hardkas(["zk", "toccata", "build-scripts", "--image-id", IMAGE, "--journal-hash", JOURNAL, "--receipt", receipt, ...extra, "--json"]);
const brief = (r: { status: number | null; stdout: string; stderr: string }) => JSON.stringify({ status: r.status, stdout: r.stdout.slice(-800), stderr: r.stderr.slice(-400) });

/** The refusal is the lockdown's code, exit 1, and nothing of a lock reached stdout. */
function expectRefused(r: ReturnType<typeof hardkas>) {
  expect(r.json?.ok, brief(r)).toBe(false);
  expect(r.json?.code, brief(r)).toBe("MAINNET_SIGNING_DISABLED");
  expect(r.status, brief(r)).toBe(1);
  expect(r.stdout).not.toMatch(/redeemScript|sigScript|p2shAddresses/);
  expect(r.stdout).not.toMatch(/kaspa:p[0-9a-z]{20,}/);
}

const kaspa = loadManagedKaspaWasmSync();
const MAINNET_ADDRESS = new kaspa.PrivateKey("11".repeat(32)).toKeypair().toAddress("mainnet").toString();
const SIMNET_ADDRESS = new kaspa.PrivateKey("11".repeat(32)).toKeypair().toAddress("simnet").toString();

describe("P37 · zk toccata build-scripts builds no mainnet lock", { timeout: 300000 }, () => {
  it("every mainnet spelling of --address-network is MAINNET_SIGNING_DISABLED, acknowledged or not", () => {
    for (const net of ["mainnet", "mainnet-1", "kaspa", "kaspa-mainnet", "MAINNET", "testnet-10,Mainnet"]) {
      expectRefused(build(["--address-network", net, "--ack-image-id-only-lock"]));
    }
    expectRefused(build(["--address-network", "mainnet"]));
  });

  it("the refusal comes before the receipt is read (a receipt path that cannot be read is never reached)", () => {
    const dir = mkdtempSync(resolve(os.tmpdir(), "hk-zk-p37-"));
    try {
      expectRefused(build(["--address-network", "kaspa", "--ack-image-id-only-lock"], dir));
      // control: without the mainnet network, the same receipt option fails on the receipt itself
      const unreadable = build([], dir);
      expect(unreadable.status, brief(unreadable)).not.toBe(0);
      expect(unreadable.json?.code, brief(unreadable)).not.toBe("MAINNET_SIGNING_DISABLED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a lock bound to a mainnet payout address is refused the same way", () => {
    expectRefused(build(["--mode", "proof-and-output-bound", "--payout-address", MAINNET_ADDRESS, "--payout-amount", "100000000"]));
  });

  it("control: simnet builds; testnet-10 keeps its HK-16 answer; devnet is a usage error; the help says mainnet is refused", () => {
    const sim = build([]);
    expect(sim.status, brief(sim)).toBe(0);
    expect(sim.json.p2shAddresses.simnet).toMatch(/^kaspasim:p/);
    const bound = build(["--mode", "proof-and-output-bound", "--payout-address", SIMNET_ADDRESS, "--payout-amount", "100000000"]);
    expect(bound.status, brief(bound)).toBe(0);
    expect(bound.json.consensusEnforced).toBe(true);
    const tn = build(["--address-network", "testnet-10", "--ack-image-id-only-lock"]);
    expect(tn.status, brief(tn)).toBe(1);
    expect(tn.json.issues.map((i: any) => i.code)).toContain("ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED");
    const dev = build(["--address-network", "devnet"]);
    expect(dev.status, brief(dev)).toBe(2);
    expect(dev.json?.code).toBe("ZK_ADDRESS_NETWORK_INVALID");
    const program = buildHardkasProgram({ forDocs: true });
    const cmd = program.commands.find((c) => c.name() === "zk")?.commands.find((c) => c.name() === "toccata")?.commands.find((c) => c.name() === "build-scripts");
    const option = cmd?.options.find((o) => o.long === "--address-network");
    expect(option?.description).toMatch(/mainnet .*refused .*MAINNET_SIGNING_DISABLED/);
  });
});
