import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, calculateContentHash } from "@hardkas/artifacts";
import { registerSilverCommand } from "../src/commands/silver.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";

// -----------------------------------------------------------------------------
// V1-COMPAT (the owner's decision, 26-oct): `hardkas silver deploy` and `spend` send transaction v0 by default — the
// certified path, unchanged — and the SDK's v1 engine only with `--tx-version 1`. Each version refuses the other's
// options before any key is read or any node contacted. In-process, no network.
// -----------------------------------------------------------------------------

const COMPILE = path.join(__dirname, "fixtures", "silver-keys-1", "vault-compile-record.json");
const made: string[] = [];
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

async function silver(args: string[]) {
  setGlobalOutput(createCommandOutput({ mode: "json", stdout: { write: () => undefined }, stderr: { write: () => undefined } }));
  const program = new Command();
  program.exitOverride();
  registerSilverCommand(program);
  try {
    await program.parseAsync(["node", "hardkas", "silver", ...args]);
    return { code: "RESOLVED", exitCode: 0 };
  } catch (e: any) {
    return { code: String(e?.code ?? `UNCODED ${e?.message}`), exitCode: e?.exitCode };
  }
}

/** A sealed deploy record of the SILVER-KEYS-1 vault compile record (simnet), as `silver deploy` writes one. */
function deployRecord(): string {
  const compile = JSON.parse(fs.readFileSync(COMPILE, "utf8"));
  const draft: Record<string, unknown> = {
    schema: "hardkas.silverDeploy.v1",
    hardkasVersion: compile.hardkasVersion,
    createdAt: "2026-10-26T00:00:00.000Z",
    networkId: "simnet",
    capability: "silver.p2sh.deploy-spend.v1",
    compileRecord: { path: COMPILE, contentHash: compile.contentHash, artifactSha256: compile.provenance.artifactSha256 },
    contract: compile.contracts[0].name,
    lockingScript: compile.contracts[0].lockingScript,
    address: compile.contracts[0].address,
    txId: "ab".repeat(32),
    outpoint: { transactionId: "ab".repeat(32), index: 0 },
    valueSompi: "100000000",
    feeSompi: "2036",
    status: "confirmed",
    node: { verified: true, imageDigest: "sha256:" + "0".repeat(64) },
    version: ARTIFACT_VERSION,
    mode: "localnet",
    hashVersion: CURRENT_HASH_VERSION
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-txv-"));
  made.push(dir);
  const file = path.join(dir, "deploy.json");
  fs.writeFileSync(file, JSON.stringify({ ...draft, contentHash: calculateContentHash(draft, CURRENT_HASH_VERSION) }, null, 2));
  return file;
}

describe("V1-COMPAT · silver deploy and spend: v0 by default, the v1 engine when asked for", () => {
  it("TV-1 the default is transaction v0 (deploy and spend); --tx-version is 0 or 1, anything else a usage error before any record is read", async () => {
    const all = new Command();
    registerSilverCommand(all);
    const silverCmd = all.commands.find((c) => c.name() === "silver")!;
    for (const name of ["deploy", "spend"]) {
      const option = silverCmd.commands.find((c) => c.name() === name)!.options.find((o) => o.long === "--tx-version")!;
      expect([name, option.defaultValue]).toEqual([name, "0"]);
    }
    expect(await silver(["deploy", "no-such-record.json", "--from", "alice", "--amount", "1", "--tx-version", "2"])).toEqual({ code: "SILVER_TX_VERSION_INVALID", exitCode: 2 });
    expect(await silver(["spend", "no-such-record.json", "--entry", "release", "--to", "x", "--tx-version", "v1"])).toEqual({ code: "SILVER_TX_VERSION_INVALID", exitCode: 2 });
  });

  it("TV-2 a v0 spend refuses the v1 options (--constructor-args, --compute-budget); a v1 spend refuses --sig-op-count — before any key or node", async () => {
    const file = deployRecord();
    const base = ["spend", file, "--entry", "release", "--to", "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw"];
    expect(await silver([...base, "--compute-budget", "12"])).toEqual({ code: "SILVER_OPTION_NEEDS_TX_V1", exitCode: 2 });
    expect(await silver([...base, "--constructor-args", "ctor.json"])).toEqual({ code: "SILVER_OPTION_NEEDS_TX_V1", exitCode: 2 });
    expect(await silver([...base, "--tx-version", "1", "--sig-op-count", "1"])).toEqual({ code: "SILVER_SIG_OP_COUNT_NOT_V1", exitCode: 2 });
  });
});
