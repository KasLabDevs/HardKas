import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createTxPlanArtifact } from "@hardkas/artifacts";
import { systemRuntimeContext } from "@hardkas/core";
import { loadKaspaWasm } from "@hardkas/accounts";
import { TxPlanService } from "@hardkas/tx-builder";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 120_000 });

// PAPERCUTS-1 · `tx verify` on a real (localnet/rpc) plan failed with a u16 error from the pinned kaspa-wasm: the runner
// passed the artifact as a TxPlan, so the artifact's FORMAT version ("1.0.0-alpha") reached `new Transaction({ version })`,
// whose `version` is the transaction version (0 or 1, the artifact's `txVersion`). The mapping is the one the fee check
// already uses (artifacts/src/feeVerify.ts).

/** A real simnet plan, built the way `tx plan` builds one, over one UTXO held in memory (no node). */
async function localnetPlan(file: string) {
  const k: any = await loadKaspaWasm();
  const address = (hex: string) => {
    const key = new k.PrivateKey(hex);
    return String(typeof key.toAddress === "function" ? key.toAddress("simnet") : key.toKeypair().toAddress("simnet"));
  };
  const from = address("11".repeat(32));
  const to = address("22".repeat(32));
  const spk = k.payToAddressScript(from);
  const packed = Number(spk.version).toString(16).padStart(4, "0") + String(spk.script);
  const amount = 100_000_000n;
  const utxo = { outpoint: { transactionId: "ab".repeat(32), index: 0 }, address: from, amountSompi: 2_000_000_000n, scriptPublicKey: packed, isCoinbase: false, blockDaaScore: 1n };
  const service = new TxPlanService({ getUtxos: async () => [utxo as any], getVirtualDaaScore: async () => 100_000n });
  const result = await service.planTransactionUpstream({ fromAddress: from, toAddress: to, amountSompi: amount, feeRate: 100n, networkId: "simnet" });
  const plan = createTxPlanArtifact({
    networkId: "simnet" as any,
    mode: "localnet" as any,
    from: { input: from, address: from },
    to: { input: to, address: to },
    amountSompi: amount,
    plan: result.plan,
    rpcUrl: "ws://127.0.0.1:18210",
    ctx: {
      ...systemRuntimeContext,
      utxoSelection: result.utxoSelection,
      ...(result.plannerAuthority ? { plannerAuthority: result.plannerAuthority } : {})
    } as any
  });
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return plan;
}

describe("tx verify · a real plan is verified, not rejected by its artifact format version", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tx-verify-"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("a localnet plan passes semantic verification", async () => {
    const plan: any = await localnetPlan(path.join(ws, "plan.json"));
    expect(plan.mode).toBe("localnet");
    expect(plan.version, "the artifact format version").toBe("1.0.0-alpha");
    const r = spawnSync(process.execPath, [cliDist, "tx", "verify", "plan.json", "--json"], { cwd: ws, env: childEnv(), encoding: "utf8", timeout: 120_000 });
    const all = `${r.stdout}\n${r.stderr}`;
    expect(all).not.toMatch(/u16/i);
    expect(r.status, all).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.ok, all).toBe(true);
    expect(out.issues).toEqual([]);
  });
});
