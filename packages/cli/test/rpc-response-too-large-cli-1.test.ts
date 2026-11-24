import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { startUtxoHeavyWrpcNode, type UtxoHeavyNode } from "../../kaspa-rpc/test/helpers/fake-utxo-heavy-wrpc-node.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

// RPC-RESPONSE-TOO-LARGE-1 · the CLI side (LFU diagnosis, 21-oct-2026): an address holding more than about 277,000 UTXOs
// cannot have its UTXO list read in one RPC message (100 MiB), and every command reported that as UNKNOWN_ERROR.
//  - `rpc utxos` needs the list: it fails with the transport's typed RPC_RESPONSE_TOO_LARGE (limit + remedy), exit 1.
//  - `accounts balance` needs only the total, which the node gives in one number (getBalancesByAddresses): it succeeds
//    (exit 0) with the balance; the UTXO count and the covenant split, which need the list, are null with a note.
// The REAL client (kaspa-wasm 2.1.0, the HardKAS session) against a loopback fake node whose answer for BIG is one byte
// over the limit (padded JSON; no 277,000 entries are built). SMALL is an ordinary address (control).

const BIG = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
const SMALL = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const BIG_BALANCE = 67_091_960n * 100_000_000n; // the parked demo chain's miner: 67,091,960 KAS

const { registerAccountsCommands } = await import("../src/commands/accounts.js");
const { registerRpcCommands } = await import("../src/commands/rpc.js");
const { createCommandOutput, setGlobalOutput } = await import("../src/output.js");
const { handleError, errorCodeOf, exitCodeOf } = await import("../src/ui.js");

let node: UtxoHeavyNode;
let dir: string;
const originalCwd = process.cwd();
let savedExitCode: typeof process.exitCode;

beforeAll(async () => {
  node = await startUtxoHeavyWrpcNode({
    replies: { [BIG]: { kind: "bytes", size: 100 * 1024 * 1024 + 1 }, [SMALL]: { kind: "entries", count: 2 } },
    balances: { [BIG]: BIG_BALANCE }
  });
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rtl-cli-"));
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), "export default { defaultNetwork: 'simnet' };");
  process.chdir(dir);
});
afterAll(async () => {
  process.chdir(originalCwd);
  fs.rmSync(dir, { recursive: true, force: true });
  await node?.close();
});
beforeEach(() => {
  savedExitCode = process.exitCode;
  process.exitCode = undefined;
});
afterEach(() => {
  process.exitCode = savedExitCode;
  setGlobalOutput(createCommandOutput({ mode: "human" }));
});

async function hardkas(register: (p: Command) => void, args: string[], mode: "human" | "json") {
  let stdout = "";
  let stderr = "";
  setGlobalOutput(createCommandOutput({ mode, stdout: { write: (m: string) => void (stdout += m) }, stderr: { write: (m: string) => void (stderr += m) } }));
  const program = new Command();
  program.exitOverride();
  register(program);
  let error: unknown;
  try {
    await program.parseAsync(["node", "hardkas", ...args]);
  } catch (e) {
    error = e;
  }
  return { stdout: () => stdout, stderr: () => stderr, error };
}

const balanceArgs = (address: string, json: boolean) => [
  "accounts",
  "balance",
  address,
  "--network",
  "simnet",
  "--provider",
  "rpc",
  "--url",
  node.url,
  ...(json ? ["--json"] : [])
];

describe("RPC-RESPONSE-TOO-LARGE-1 · CLI · commands on an address whose UTXO list is too large to read", () => {
  it("CLI-1 `rpc utxos <big> --url … --json`: the envelope says RPC_RESPONSE_TOO_LARGE (was UNKNOWN_ERROR), exit 1, the remedy in the message", async () => {
    const r = await hardkas(registerRpcCommands, ["rpc", "utxos", BIG, "--url", node.url, "--json"], "json");
    expect(errorCodeOf(r.error), String((r.error as Error)?.message)).toBe("RPC_RESPONSE_TOO_LARGE");
    handleError(r.error);
    const envelope = JSON.parse(r.stdout());
    expect(envelope).toMatchObject({ ok: false, code: "RPC_RESPONSE_TOO_LARGE", mode: "cli" });
    expect(envelope.message).toMatch(/100 MiB/);
    expect(envelope.message).toMatch(/The node is fine/);
    expect(envelope.message).toMatch(/Use another address/);
    expect(exitCodeOf(r.error)).toBe(1);
    expect(process.exitCode).toBe(1);
    expect(r.stdout() + r.stderr()).not.toMatch(/UNKNOWN_ERROR/);
  });

  it("CLI-2 `rpc utxos <big>` (human): the remedy as the suggestion, never 'the node might still be starting'", async () => {
    const r = await hardkas(registerRpcCommands, ["rpc", "utxos", BIG, "--url", node.url], "human");
    handleError(r.error);
    expect(r.stderr()).toMatch(/RPC_RESPONSE_TOO_LARGE/);
    expect(r.stderr()).toMatch(/Use another address/);
    expect(r.stderr()).not.toMatch(/might still be starting/);
  });

  it("CLI-3 `accounts balance <big> --json`: ok, exit 0, the node's total; utxoCount and the covenant split null, with a note (the fields kept)", async () => {
    const r = await hardkas(registerAccountsCommands, balanceArgs(BIG, true), "json");
    expect(r.error, String((r.error as Error)?.message)).toBeUndefined();
    expect(process.exitCode ?? 0).toBe(0);
    const out = JSON.parse(r.stdout());
    expect(out).toMatchObject({ ok: true, command: "accounts balance" });
    expect(out.result).toMatchObject({
      address: BIG,
      network: "simnet",
      balanceSompi: BIG_BALANCE.toString(),
      utxoCount: null,
      spendableSompi: null,
      covenantBoundSompi: null,
      covenantUtxoCount: null
    });
    expect(Object.keys(out.result)).toEqual(
      expect.arrayContaining(["name", "address", "balanceSompi", "utxoCount", "network", "spendableSompi", "covenantBoundSompi", "covenantUtxoCount", "note"])
    );
    expect(out.result.note).toMatch(/RPC_RESPONSE_TOO_LARGE/);
    expect(out.result.note).toMatch(/277,000/);
    expect(out.result.note).toMatch(/balance is the node's own total/);
  });

  it("CLI-4 `accounts balance <big>` (human): Balance printed, 'UTXOs: not counted', and the note", async () => {
    const r = await hardkas(registerAccountsCommands, balanceArgs(BIG, false), "human");
    expect(r.error, String((r.error as Error)?.message)).toBeUndefined();
    expect(r.stdout()).toMatch(/Balance:\s+67091960 KAS/);
    expect(r.stdout()).toMatch(/UTXOs:\s+not counted \(see the note\)/);
    expect(r.stdout()).toMatch(/Note:\s+UTXOs not counted: /);
  });

  it("CLI-5 control · `accounts balance <small> --json`: the count is read as before, no note", async () => {
    const r = await hardkas(registerAccountsCommands, balanceArgs(SMALL, true), "json");
    expect(r.error, String((r.error as Error)?.message)).toBeUndefined();
    const out = JSON.parse(r.stdout());
    expect(out.result).toMatchObject({ address: SMALL, utxoCount: 2, balanceSompi: "10000000000", spendableSompi: "10000000000", covenantUtxoCount: 0 });
    expect(out.result.note).toBeUndefined();
  });

  it("CLI-6 `tx plan --from <big>` (the runner `tx flow` and `tx batch` share): the typed refusal after ONE read, no retry, never 'UNKNOWN: Unknown connection error'", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rtl-plan-"));
    try {
      fs.writeFileSync(
        path.join(ws, "hardkas.config.js"),
        `export default { defaultNetwork: "simulated", networks: { simulated: { kind: "simulated" }, simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "${node.url}" } } };`
      );
      const { loadHardkasConfig } = await import("@hardkas/config");
      const { config } = await loadHardkasConfig({ workspaceRoot: ws });
      const { runTxPlan } = await import("../src/runners/tx-plan-runner.js");
      const before = node.utxoReads(BIG);
      let error: any;
      try {
        await runTxPlan({ from: BIG, to: SMALL, amount: "1", networkId: "simnet", provider: "auto", url: node.url, feeRate: "1000", config, workspaceRoot: ws });
      } catch (e) {
        error = e;
      }
      expect(error?.code, String(error?.message)).toBe("RPC_RESPONSE_TOO_LARGE");
      expect(error?.message).toMatch(/Use another address/);
      expect(node.utxoReads(BIG) - before).toBe(1);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
