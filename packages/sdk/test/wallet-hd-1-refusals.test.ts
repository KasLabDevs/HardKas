/*
 * WALLET-HD-1 · the HD wallet spender's refusals, decided before any key is read or any node is contacted:
 *   - mainnet (an instance opened on mainnet, its endpoint a loopback DECOY that counts connections): scan and plan
 *     MAINNET_CONNECTION_DISABLED, send MAINNET_BROADCAST_DISABLED — even with a wrong password (the password is never
 *     tried) — and the decoy sees no connection;
 *   - the simulator, a wallet of another network, an SDK instance with an external signer, an invalid gap limit.
 * Hermetic: temp workspaces, unreachable or decoy endpoints, throwaway wallets.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startDecoy, type Decoy } from "../../cli/test/helpers/mainnet-decoy.js";
import { Hardkas, HardkasHdWallets, HdWalletManager } from "../src/index.js";

const PW = "hd1-refusal-password";
const FAST = { memory: 19_456, iterations: 2, parallelism: 1 };
const made: string[] = [];
const sdks: Hardkas[] = [];
let decoy: Decoy;
let ws = "";

async function open(options: Parameters<typeof Hardkas.open>[0]): Promise<Hardkas> {
  const sdk = await Hardkas.open(options);
  sdks.push(sdk);
  return sdk;
}

beforeAll(async () => {
  decoy = await startDecoy("mainnet");
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hd1-refusals-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    // the public-network gate opened, as an adversarial workspace would: mainnet must still be refused by the lockdown
    network: { allowPublic: true },
    experimental: true,
    networks: {
      simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:9" },
      mainnet: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: decoy.url, allowMainnet: true },
      prod: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: decoy.url, allowMainnet: true }
    }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  const m = new HdWalletManager({ workspaceRoot: ws, kdf: FAST });
  await m.create({ label: "sim", network: "simnet", password: PW });
  await m.create({ label: "dev", network: "devnet", password: PW });
});

afterAll(async () => {
  for (const sdk of sdks) await sdk.close?.();
  await decoy?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("WALLET-HD-1 · mainnet is refused first, nothing contacted", () => {
  it.each(["mainnet", "prod"])("an instance on %s: scan / plan MAINNET_CONNECTION_DISABLED, send MAINNET_BROADCAST_DISABLED (wrong password never tried)", async (network) => {
    const sdk = await open({ cwd: ws, network });
    const hd = new HardkasHdWallets(sdk, { kdf: FAST });
    await expect(hd.scan("sim")).rejects.toMatchObject({ code: "MAINNET_CONNECTION_DISABLED" });
    await expect(hd.scan("sim", { password: PW })).rejects.toMatchObject({ code: "MAINNET_CONNECTION_DISABLED" });
    await expect(hd.plan("sim", { to: "kaspa:qz7ulu4c25dh7fzec9zjyrmlhnkzrg4wmf89q7gzr3gfrsj3uz6xjellj43pf", amount: "1", password: PW })).rejects.toMatchObject({
      code: "MAINNET_CONNECTION_DISABLED"
    });
    await expect(hd.send("sim", { to: "kaspa:qz7ulu4c25dh7fzec9zjyrmlhnkzrg4wmf89q7gzr3gfrsj3uz6xjellj43pf", amount: "1", password: "not-the-password" })).rejects.toMatchObject({
      code: "MAINNET_BROADCAST_DISABLED"
    });
    expect(decoy.connections).toBe(0);
    expect(decoy.methods).toEqual([]);
  });
});

describe("WALLET-HD-1 · world refusals before any read", () => {
  it("the simulator: HD_WALLET_SIMULATOR_UNSUPPORTED", async () => {
    const sdk = await open({ cwd: ws, network: "simulated" });
    const hd = new HardkasHdWallets(sdk, { kdf: FAST });
    await expect(hd.scan("sim")).rejects.toMatchObject({ code: "HD_WALLET_SIMULATOR_UNSUPPORTED" });
    await expect(hd.send("sim", { to: "alice", amount: "1", password: PW })).rejects.toMatchObject({ code: "HD_WALLET_SIMULATOR_UNSUPPORTED" });
  });

  it("a wallet of another network: HD_WALLET_NETWORK_MISMATCH; a bad gap limit: HD_WALLET_GAP_LIMIT_INVALID", async () => {
    const sdk = await open({ cwd: ws, network: "simnet" });
    const hd = new HardkasHdWallets(sdk, { kdf: FAST });
    await expect(hd.scan("dev")).rejects.toMatchObject({ code: "HD_WALLET_NETWORK_MISMATCH" });
    await expect(hd.send("dev", { to: "alice", amount: "1", password: PW })).rejects.toMatchObject({ code: "HD_WALLET_NETWORK_MISMATCH" });
    for (const gapLimit of [0, -1, 1.5, 100_000]) {
      await expect(hd.scan("sim", { gapLimit })).rejects.toMatchObject({ code: "HD_WALLET_GAP_LIMIT_INVALID" });
    }
    await expect(hd.scan("nope")).rejects.toMatchObject({ code: "HD_WALLET_NOT_FOUND" });
  });

  it("an instance with an external signer would sign instead of the wallet: HD_WALLET_EXTERNAL_SIGNER_CONFLICT", async () => {
    const signer = { signTransaction: async () => { throw new Error("must not be called"); } } as any;
    const sdk = await open({ cwd: ws, network: "simnet", signer });
    const hd = new HardkasHdWallets(sdk, { kdf: FAST });
    await expect(hd.send("sim", { to: "alice", amount: "1", password: PW })).rejects.toMatchObject({ code: "HD_WALLET_EXTERNAL_SIGNER_CONFLICT" });
  });
});
