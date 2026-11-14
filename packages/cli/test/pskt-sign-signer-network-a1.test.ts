import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { pskt } from "@hardkas/sdk";
import { NativePsktAdapter } from "../../sdk/src/pskt/adapters/native.js";
import { startFakeNode, type FakeNode } from "./helpers/int9-a-fake-node.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// A1 (rc2 audit) · `hardkas pskt sign` read the raw key first and let the session file's own `networkId` decide that
// the signature was not for mainnet: a session labelled testnet-10 spending a mainnet UTXO of the key was signed. Now
// the signer's network is `--network` or the workspace's (never the session's), it must be the session's, mainnet is
// refused, and the signer's node must list every input to be signed as unspent, all BEFORE the key file is read; no
// node configured (the simulator, a testnet without rpcUrl) refuses (fail closed). The workspace config is a stand-in
// (loadHardkasConfig); the node is a loopback fake (wRPC JSON); the native signer is a stand-in addon.

const config = vi.hoisted(() => ({ current: { path: undefined as string | undefined, config: { networks: {} } as any } }));
vi.mock("@hardkas/config", async () => {
  const actual: any = await vi.importActual("@hardkas/config");
  return { ...actual, loadHardkasConfig: async () => config.current };
});

const k: any = loadManagedKaspaWasmSync();
const hex = (s: string) => createHash("sha256").update(s).digest("hex");
const KEY = hex("a1 cli signer key");
const p2pkScriptOf = (key: string) => "0000" + String(k.payToAddressScript(new k.PrivateKey(key).toPublicKey().toAddress("simnet")).script);
const addressOf = (key: string, network: string) => String(new k.PrivateKey(key).toPublicKey().toAddress(network).toString());
const LISTED = hex("a1 cli listed outpoint");

function payloadFor(transactionId: string) {
  const input = {
    utxoEntry: { amount: 100_000_000, scriptPublicKey: p2pkScriptOf(KEY), blockDaaScore: 0, isCoinbase: false, covenantId: null },
    previousOutpoint: { transactionId, index: 0 },
    sequence: null,
    minTime: null,
    partialSigs: {},
    sighashType: 1,
    redeemScript: null,
    sigOpCount: null,
    bip32Derivations: {},
    finalScriptSig: null,
    proprietaries: {}
  };
  const bundle = [{ global: { version: 1, txVersion: 0, inputCount: 0, outputCount: 0, xpubs: {}, id: null, proprietaries: {}, payload: null }, inputs: [input], outputs: [] }];
  const data = Buffer.from("PSKB" + Buffer.from(JSON.stringify(bundle), "utf8").toString("hex"), "utf8").toString("base64");
  const bytes = Buffer.from(data, "base64");
  return { format: "pskt-binary-base64" as const, encoding: "base64" as const, data, payloadHash: createHash("sha256").update(bytes).digest("hex"), byteLength: bytes.length };
}

const calls = { sign: 0 };
const ADAPTER = "a1-cli-native";
let dir = "";
let fake: FakeNode;
const missingKey = () => path.join(dir, "no-such-key.txt");

async function sessionFile(name: string, networkId: string, transactionId = LISTED): Promise<string> {
  const caps = await pskt.capabilities(ADAPTER);
  const s: any = {
    kind: "hardkas-portable-signing-session",
    schemaVersion: 1,
    revision: 0,
    planId: `plan-${name}`,
    networkId,
    unsignedTransactionId: `plan-${name}`,
    state: "created",
    payload: payloadFor(transactionId),
    participants: [],
    requirements: [],
    attestations: [],
    runtimeBinding: { adapterId: ADAPTER, adapterKind: "native-bridge", capabilitiesHash: pskt.computeCapabilitiesHash(caps), providerVersion: caps.providerVersion, providerHash: caps.providerHash },
    createdAt: new Date().toISOString()
  };
  s.sessionId = pskt.computeSessionId(s);
  s.integrityHash = pskt.computeIntegrityHash(s);
  const file = path.join(dir, `${name}.session.json`);
  fs.writeFileSync(file, JSON.stringify(s));
  return file;
}

async function sign(file: string, opts: { network?: string; key?: string; out?: string } = {}) {
  const { runPsktSign } = await import("../src/runners/pskt/mutating.js");
  try {
    await runPsktSign(file, {
      privateKeyFile: opts.key ?? missingKey(),
      inputs: "0",
      ...(opts.network !== undefined ? { network: opts.network } : {}),
      out: opts.out ?? path.join(dir, `${path.basename(file)}.out.json`),
      force: true,
      json: false
    });
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, code: e?.code as string | undefined, exitCode: e?.exitCode as number | undefined, message: String(e?.message ?? e) };
  }
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-a1-cli-"));
  const adapter: any = new NativePsktAdapter(ADAPTER);
  adapter.addon = {
    psktProbe: () => JSON.stringify({ bridge_version: "0.0.0-test", rusty_kaspa_commit: "test", operations: { inspect: true, sign: true, combine: true, finalize: true, extract: true } }),
    psktSign: (data: string) => {
      calls.sign++;
      return JSON.stringify({ payloadBase64: data, outputPayloadHash: hex(data) });
    }
  };
  if (!pskt.adapterRegistry.has(ADAPTER)) pskt.adapterRegistry.register(adapter);
  fake = await startFakeNode("a1-cli", {
    network: "simnet",
    utxos: [{ address: addressOf(KEY, "simnet"), transactionId: LISTED, index: 0, amount: "100000000", blockDaaScore: "1" }]
  });
});
afterAll(async () => {
  await fake?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  calls.sign = 0;
  config.current = { path: undefined, config: { networks: {} } };
});

const workspace = (cfg: Record<string, unknown>) => {
  config.current = { path: path.join(dir, "hardkas.config.ts"), config: cfg };
};
const ownSimnetNode = () => ({ defaultNetwork: "simnet", networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: fake.url } } });

describe("A1 · hardkas pskt sign: the signer's own network and node decide, before the key is read", () => {
  it("no --network and no workspace → PSKT_SIGNER_NETWORK_REQUIRED (exit 2); the key file is never opened", async () => {
    const r = await sign(await sessionFile("no-net", "simnet"));
    expect(r).toMatchObject({ ok: false, code: "PSKT_SIGNER_NETWORK_REQUIRED", exitCode: 2 });
    expect(calls.sign).toBe(0);
  });

  it("--network other than the session's → PSKT_NETWORK_MISMATCH (exit 3), before any node or key", async () => {
    workspace(ownSimnetNode());
    const before = fake.methods.length;
    const r = await sign(await sessionFile("mismatch", "testnet-10"), { network: "simnet" });
    expect(r).toMatchObject({ ok: false, code: "PSKT_NETWORK_MISMATCH", exitCode: 3 });
    expect({ asked: fake.methods.length - before, signs: calls.sign }).toEqual({ asked: 0, signs: 0 });
  });

  it("a mainnet session, or --network mainnet → MAINNET_SIGNING_DISABLED (exit 3)", async () => {
    expect(await sign(await sessionFile("mainnet", "mainnet"), { network: "simnet" })).toMatchObject({ ok: false, code: "MAINNET_SIGNING_DISABLED", exitCode: 3 });
    expect(await sign(await sessionFile("mainnet-flag", "simnet"), { network: "kaspa-mainnet" })).toMatchObject({ ok: false, code: "MAINNET_SIGNING_DISABLED", exitCode: 3 });
    expect(calls.sign).toBe(0);
  });

  it("no node configured (a testnet without rpcUrl, the simulator) → PSKT_INPUTS_UNVERIFIED (fail closed)", async () => {
    workspace({ defaultNetwork: "testnet-10", networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "" } } });
    expect(await sign(await sessionFile("tn-no-node", "testnet-10"))).toMatchObject({ ok: false, code: "PSKT_INPUTS_UNVERIFIED" });
    workspace({ defaultNetwork: "simulated", networks: { simulated: { kind: "simulated", network: "simulated" } } });
    expect(await sign(await sessionFile("sim", "simulated"))).toMatchObject({ ok: false, code: "PSKT_INPUTS_UNVERIFIED" });
    expect(calls.sign).toBe(0);
  });

  it("THE ATTACK: the workspace's own node does not list the input (an output of another network) → PSKT_INPUT_NOT_ON_NETWORK, key never opened", async () => {
    workspace(ownSimnetNode());
    const r = await sign(await sessionFile("attack", "simnet", hex("an outpoint the simnet node never saw")));
    expect(r).toMatchObject({ ok: false, code: "PSKT_INPUT_NOT_ON_NETWORK" });
    expect(fake.methods).toContain("getUtxosByAddresses");
    expect(calls.sign).toBe(0);
  });

  it("control: the workspace's network (no --network), its node lists the input → signed once, the session saved", async () => {
    workspace(ownSimnetNode());
    const keyFile = path.join(dir, "key.txt");
    fs.writeFileSync(keyFile, KEY);
    const out = path.join(dir, "signed.session.json");
    const r = await sign(await sessionFile("control", "simnet"), { key: keyFile, out });
    expect(r, JSON.stringify(r)).toEqual({ ok: true });
    expect(calls.sign).toBe(1);
    expect(JSON.parse(fs.readFileSync(out, "utf8")).revision).toBe(1);
  });
});
