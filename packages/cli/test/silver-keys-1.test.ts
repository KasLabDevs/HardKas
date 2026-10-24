import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getOrCreateDevAccount, KeystoreManager } from "@hardkas/accounts";
import { getNetworkPrefix, loadManagedKaspaWasmSync } from "@hardkas/core";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// SILVER-KEYS-1 (2026-10-22). Found running the demo D:\prueba\hardkas-demo on the release candidate: `hardkas silver` signed only with a
// PLAINTEXT key (`accounts.real.json` privateKey). A localnet development account (`.hardkas/dev-accounts/`, opened with
// the published development password) and an encrypted account (`.hardkas/keystore/`, opened with its owner's password)
// were both refused with SILVER_ACCOUNT_KEY_UNAVAILABLE — so the demo wrote its keys in clear to sign at all. The owner:
// silver must sign through the secure account mechanism, keystores included, plus the localnet dev accounts.
// Fixed: silver resolves keys exactly as every HardKAS signer does (one shared function: key variable, plaintext legacy
// entry, development keystore, encrypted keystore with --password-env / --password-stdin / a terminal prompt), and
// refuses an account of another network than the canonical localnet's (simnet).
// Each case is `silver deploy` as a real process on the built dist. The key is resolved before the node is contacted;
// the node is then unreachable on purpose (DOCKER_HOST points at a closed port, node ports are denied), so a resolved
// key ends in NODE_IDENTITY_UNVERIFIED and an unresolved one in a key error — nothing is ever sent.
// Test keys are synthetic constants; the fixture record is `silver compile` of the demo's VaultRelease.sil for the
// x-only key of "4444…" (scripts/110-sk1-fixture.ps1 of the release-candidate closure).
// -----------------------------------------------------------------------------

const PASSWORD = "sk1-owner-password";
const WRONG = "sk1-wrong-password";
const KEY_ENC = "5555".padStart(64, "0");
const KEY_PLAIN = "6666".padStart(64, "0");
const KEY_TN = "7777".padStart(64, "0");
const scaffold =
  'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } }, network: { allowPublic: false } };\n';
const FIXTURES = path.join(__dirname, "fixtures", "silver-keys-1");

let ws: string;
let logs: string;
let devKey: string;
const outputs: string[] = [];

async function encryptedAccount(name: string, privateKey: string, network: string) {
  const k = loadManagedKaspaWasmSync();
  const kp = new k.PrivateKey(privateKey).toKeypair();
  const address = kp.toAddress(getNetworkPrefix(network)).toString();
  const keystore = await KeystoreManager.createEncryptedKeystore({ address, privateKey, network, publicKey: kp.publicKey }, PASSWORD, { label: name, network });
  await KeystoreManager.saveEncryptedKeystore(path.join(ws, ".hardkas", "keystore", `${name}.json`), keystore);
  return address;
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sk1-"));
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sk1-logs-"));
  fs.mkdirSync(path.join(ws, ".hardkas", "keystore"), { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), scaffold);
  devKey = (await getOrCreateDevAccount(ws, 0, "alice")).privateKey;
  await encryptedAccount("enc-carol", KEY_ENC, "simnet");
  await encryptedAccount("tn-erin", KEY_TN, "testnet-10");
  const k = loadManagedKaspaWasmSync();
  const plainAddress = new k.PrivateKey(KEY_PLAIN).toKeypair().toAddress(getNetworkPrefix("simnet")).toString();
  fs.writeFileSync(
    path.join(ws, ".hardkas", "accounts.real.json"),
    JSON.stringify({ version: 1, accounts: [{ name: "plain-dave", address: plainAddress, privateKey: KEY_PLAIN, network: "simnet", createdAt: "2026-10-22T00:00:00.000Z" }] }, null, 2)
  );
});
afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(logs, { recursive: true, force: true });
});

function deploy(name: string, account: string, extra: string[] = [], env: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [cliDist, "silver", "deploy", path.join(FIXTURES, "vault-compile-record.json"), "--from", account, "--amount", "1", "--json", ...extra], {
    cwd: ws,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, `${name}.net.log`), { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210", DOCKER_HOST: "tcp://127.0.0.1:9", ...env }),
    timeout: 200_000
  });
  let json: any;
  try {
    json = JSON.parse((r.stdout ?? "").trim());
  } catch {
    json = undefined;
  }
  outputs.push(`${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  return { status: r.status, json, brief: `exit ${r.status}\n${(r.stdout ?? "").slice(0, 1200)}\n${(r.stderr ?? "").slice(0, 900)}` };
}
const codeOf = (r: { json: any; brief: string }) => r.json?.code ?? r.json?.error?.code ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(r.brief)?.[1];

describe("SILVER-KEYS-1 · silver signs through the secure account mechanism", () => {
  it("K-1 a localnet development account (dev keystore, development password): the key resolves, no plaintext needed", () => {
    const r = deploy("k1", "alice");
    expect(codeOf(r), r.brief).toBe("NODE_IDENTITY_UNVERIFIED");
  });

  it("K-2 an encrypted account with --password-env: the key resolves", () => {
    const r = deploy("k2", "enc-carol", ["--password-env", "SK1_PW"], { SK1_PW: PASSWORD });
    expect(codeOf(r), r.brief).toBe("NODE_IDENTITY_UNVERIFIED");
  });

  it("K-3 an encrypted account without a password under --json: KEYSTORE_PASSWORD_REQUIRED, a usage error, nothing sent", () => {
    const r = deploy("k3", "enc-carol");
    expect(codeOf(r), r.brief).toBe("KEYSTORE_PASSWORD_REQUIRED");
    expect(r.status, r.brief).toBe(2);
  });

  it("K-4 an encrypted account with a wrong password: KEYSTORE_PASSWORD_INVALID", () => {
    const r = deploy("k4", "enc-carol", ["--password-env", "SK1_PW"], { SK1_PW: WRONG });
    expect(codeOf(r), r.brief).toBe("KEYSTORE_PASSWORD_INVALID");
  });

  it("K-5 control: a plaintext legacy account (simnet) still resolves", () => {
    const r = deploy("k5", "plain-dave");
    expect(codeOf(r), r.brief).toBe("NODE_IDENTITY_UNVERIFIED");
  });

  it("K-6 an account of another network (testnet-10 keystore) is refused for the simnet localnet: ACCOUNT_NETWORK_MISMATCH", () => {
    const r = deploy("k6", "tn-erin", ["--password-env", "SK1_PW"], { SK1_PW: PASSWORD });
    expect(codeOf(r), r.brief).toBe("ACCOUNT_NETWORK_MISMATCH");
  });

  it("K-7 no secret is ever printed: no password, no private key in any output above", () => {
    expect(outputs.length).toBe(6);
    const all = outputs.join("\n").toLowerCase();
    for (const secret of [PASSWORD, WRONG, KEY_ENC, KEY_PLAIN, KEY_TN, devKey]) expect(all.includes(secret.toLowerCase())).toBe(false);
  });
});
