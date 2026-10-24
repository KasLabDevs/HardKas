import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WalletToolkit } from "@hardkas/toolkit";
import { Hardkas } from "../src/index.js";

// P0-TX-SAFETY-1B · `sdk.wallet.open` hands the toolkit the network this instance DECLARES (its config entry's
// `network`, else its name), so every wallet spend is checked against it — never against whatever the node announces.

const made: string[] = [];
afterAll(() => {
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
});

function workspace(config: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-1b-sdk-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), config);
  return ws;
}

describe("P0-TX-SAFETY-1B · sdk.wallet.open propagates the declared network", () => {
  it("simulator instance → networkId 'simulated' (the toolkit reads it as simnet)", async () => {
    const ws = workspace(
      'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
    );
    const spy = vi.spyOn(WalletToolkit, "open");
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      sdk.wallet.open("w1", { storePath: path.join(ws, "w1.json") });
      const opts = spy.mock.calls.at(-1)?.[1] as any;
      expect(opts.networkId).toBe("simulated");
      expect(opts.rpc).toBeDefined();
    } finally {
      spy.mockRestore();
      await sdk.close();
    }
  });

  it("v2: the same network spelled differently is accepted, but the INSTANCE's id is what the toolkit gets", async () => {
    const ws = workspace(SIMULATOR);
    const spy = vi.spyOn(WalletToolkit, "open");
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      sdk.wallet.open("w2", { storePath: path.join(ws, "w2.json"), networkId: "simnet" });
      expect((spy.mock.calls.at(-1)?.[1] as any).networkId).toBe("simulated");
    } finally {
      spy.mockRestore();
      await sdk.close();
    }
  });

  it("v2: a simnet instance cannot open a wallet on testnet-10 (WALLET_NETWORK_OVERRIDE_REFUSED), nothing opened", async () => {
    const ws = workspace(SIMULATOR);
    const spy = vi.spyOn(WalletToolkit, "open");
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      expect(() => sdk.wallet.open("w3", { storePath: path.join(ws, "w3.json"), networkId: "testnet-10" })).toThrow(
        expect.objectContaining({ code: "WALLET_NETWORK_OVERRIDE_REFUSED" })
      );
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      await sdk.close();
    }
  });

  it("v2: a caller cannot hand the wallet another rpc or signer through opts (runtime, despite the type)", async () => {
    const ws = workspace(SIMULATOR);
    const sdk = await Hardkas.open({ cwd: ws });
    try {
      expect(() => sdk.wallet.open("w4", { rpc: {} } as any)).toThrow(expect.objectContaining({ code: "WALLET_OPTION_NOT_ALLOWED" }));
      expect(() => sdk.wallet.open("w5", { signer: {} } as any)).toThrow(expect.objectContaining({ code: "WALLET_OPTION_NOT_ALLOWED" }));
    } finally {
      await sdk.close();
    }
  });

  it("v2: a simnet instance whose client is a TN10 node (injected) → the wallet's spend is refused, nothing signed or sent", async () => {
    const ws = workspace(SIMULATOR);
    const sdk = await Hardkas.open({ cwd: ws });
    const tn10: any = {
      submits: 0,
      async getServerInfo() { return { networkId: "testnet-10" }; },
      async getBlockDagInfo() { return { network: "testnet-10", virtualDaaScore: 1000n }; },
      async submitTransaction() { tn10.submits++; return { transactionId: "e".repeat(64) }; }
    };
    const signer: any = { signs: 0, async signTxPlan() { signer.signs++; return { txId: "e".repeat(64), signedTransaction: { payload: "{}" } }; } };
    try {
      (sdk as any).rpc = tn10;
      (sdk as any).signer = signer;
      const w = sdk.wallet.open("w6", { storePath: path.join(ws, "w6.json") });
      vi.spyOn(w, "receive").mockResolvedValue("kaspasim:qsource");
      vi.spyOn(w.utxos, "list").mockResolvedValue([{ transactionId: "aa".repeat(32), outputIndex: 0, amountSompi: 10_000_000n, scriptPublicKey: "00" }] as any);
      vi.spyOn(w as any, "planUpstream").mockResolvedValue({ plan: { inputs: [], outputs: [{ address: "kaspasim:qd", amountSompi: 1n }], estimatedMass: 1n, estimatedFeeSompi: 1n } });
      await expect(w.send({ to: "kaspasim:qd", amount: 1n, feeRate: 1n })).rejects.toMatchObject({ code: "NODE_NETWORK_MISMATCH" });
      expect(signer.signs).toBe(0);
      expect(tn10.submits).toBe(0);
    } finally {
      await sdk.close().catch(() => undefined);
    }
  });
});

const SIMULATOR =
  'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n';