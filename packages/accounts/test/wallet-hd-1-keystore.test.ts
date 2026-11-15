/*
 * WALLET-HD-1 · L1 + L2 · the encrypted wallet keystore (`hardkas.encryptedWalletKeystore.v1`) and HdWalletManager.
 * Every wallet lives in a temporary workspace of this test; the phrases are generated here or are public test vectors.
 * No phrase, key or password is printed: comparisons of generated secrets are booleans.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXTENDED_PRIVATE_KEY_PATTERN } from "@hardkas/core";
import { HdWalletManager } from "../src/hd-wallet-manager.js";
import {
  HD_WALLET_KEYSTORE_TYPE,
  encryptHdWalletKeystore,
  hdWalletKeystorePath,
  readHdWalletKeystoreSync,
  writeHdWalletKeystore,
  newHdWalletId
} from "../src/hd-keystore.js";
import { HdSigningKeyring, validateMnemonic } from "../src/hd-derivation.js";

const V = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "wallet-hd-1", "vectors.json"), "utf8"));
const VA = V.rustyKaspaGen1.wallet_from_mnemonic;
const VB = V.rustyKaspaGen1.address_test_by_ktrv;
const PW = "hd-test-password-1";
const FAST = { memory: 19_456, iterations: 2, parallelism: 1 };

let root = "";
let m: HdWalletManager;

async function codeOfAsync(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e: any) {
    return String(e?.code ?? "UNCODED");
  }
}
function codeOfSync(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e: any) {
    return String(e?.code ?? "UNCODED");
  }
}
const walletFiles = () => (fs.existsSync(path.join(root, ".hardkas", "wallets")) ? fs.readdirSync(path.join(root, ".hardkas", "wallets")).filter((n) => n.endsWith(".json")) : []);
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wallet-hd-1-"));
  m = new HdWalletManager({ workspaceRoot: root, kdf: FAST });
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("WALLET-HD-1 · create: one encrypted file, the phrase never in clear, random id", () => {
  it("default KDF (Argon2id 64 MiB / 3 / 1, the account keystore's), AES-256-GCM, 24 words, nothing secret in clear", async () => {
    const dm = new HdWalletManager({ workspaceRoot: root });
    const w = await dm.create({ label: "main", network: "simnet", password: PW });
    expect(w.walletId).toMatch(/^[0-9a-f]{32}$/);
    expect(w.path).toBe(hdWalletKeystorePath(root, w.walletId));
    expect(w.kind).toBe("hd");
    expect(w.mnemonicWords).toBe(24);
    expect(w.passphraseRequired).toBe(false);
    expect(w.accounts).toHaveLength(1);
    expect(w.accounts[0]!.xpub).toMatch(/^ktub/);
    const file = readJson(w.path);
    expect(file.type).toBe(HD_WALLET_KEYSTORE_TYPE);
    expect(file.kdf).toMatchObject({ algorithm: "argon2id", memory: 65_536, iterations: 3, parallelism: 1 });
    expect(file.cipher.algorithm).toBe("aes-256-gcm");
    const text = fs.readFileSync(w.path, "utf8");
    const phrase = await dm.revealMnemonic("main", { password: PW });
    expect(validateMnemonic(phrase)).toBe(true);
    expect(phrase.split(" ").length).toBe(24);
    expect(text.includes(phrase)).toBe(false);
    expect(text.includes(phrase.split(" ").slice(0, 3).join(" "))).toBe(false);
    expect(new RegExp(EXTENDED_PRIVATE_KEY_PATTERN.source).test(text)).toBe(false);
    expect(/privateKey|mnemonic"\s*:/i.test(text)).toBe(false);
    // the id is not derived from the phrase: a second wallet from the same phrase gets another id
    const again = await dm.importMnemonic({ label: "again", network: "simnet", mnemonic: phrase, password: PW });
    expect(again.walletId).not.toBe(w.walletId);
    expect(again.accounts[0]!.xpub).toBe(w.accounts[0]!.xpub);
  });

  it("12 words on request; two wallets never share a phrase; a name is unique; short passwords refused", async () => {
    const a = await m.create({ label: "a", network: "simnet", password: PW, words: 12 });
    const b = await m.create({ label: "b", network: "simnet", password: PW });
    expect(a.mnemonicWords).toBe(12);
    expect(a.accounts[0]!.xpub).not.toBe(b.accounts[0]!.xpub);
    expect(await codeOfAsync(m.create({ label: "a", network: "simnet", password: PW }))).toBe("HD_WALLET_LABEL_EXISTS");
    expect(await codeOfAsync(m.create({ label: "c", network: "simnet", password: "short" }))).toBe("KEYSTORE_PASSWORD_TOO_SHORT");
    expect(await codeOfAsync(m.create({ label: "bad name", network: "simnet", password: PW }))).toBe("HD_WALLET_LABEL_INVALID");
    expect(await codeOfAsync(m.create({ label: "d", network: "simulated", password: PW }))).toBe("HD_WALLET_NETWORK_UNKNOWN");
    expect(walletFiles()).toHaveLength(2);
  });
});

describe("WALLET-HD-1 · mainnet: no wallet with keys is made or opened; nothing is written", () => {
  it.each(["mainnet", "MAINNET", "kaspa", "mainnet-1", "kaspa-mainnet"])("create / import on %s → MAINNET_SIGNING_DISABLED", async (network) => {
    expect(await codeOfAsync(m.create({ label: "x", network, password: PW }))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOfAsync(m.importMnemonic({ label: "y", network, mnemonic: VA.mnemonic, password: PW }))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOfAsync(m.importWatchOnly({ label: "z", network, xpub: VA.accountKpub }))).toBe("MAINNET_CONNECTION_DISABLED");
    expect(walletFiles()).toEqual([]);
  });

  it("a wallet file that says mainnet (written by hand) is refused before anything is decrypted", async () => {
    const ring = HdSigningKeyring.fromMnemonic(VA.mnemonic);
    const walletId = newHdWalletId();
    const header = {
      walletId,
      label: "handmade",
      network: "mainnet",
      networkType: "mainnet" as const,
      kind: "hd" as const,
      derivation: { scheme: "kaspa-bip44" as const, purpose: 44 as const, coinType: 111111 as const },
      accounts: [{ index: 0, xpub: ring.accountXPub(0, "mainnet") }],
      passphraseRequired: false,
      mnemonicWords: 24 as const,
      createdAt: new Date().toISOString(),
      origin: "imported" as const
    };
    await writeHdWalletKeystore(hdWalletKeystorePath(root, walletId), await encryptHdWalletKeystore({ header, mnemonic: VA.mnemonic, password: PW, kdf: FAST }));
    expect(await codeOfAsync(m.open("handmade", { password: PW }))).toBe("MAINNET_SIGNING_DISABLED");
    expect(await codeOfAsync(m.revealMnemonic("handmade", { password: PW }))).toBe("MAINNET_SIGNING_DISABLED");
  });
});

describe("WALLET-HD-1 · opening: wrong password, tampered header, passphrase", () => {
  it("a wrong password is refused (HD_WALLET_UNLOCK_FAILED); the right one opens and recomputes the account key", async () => {
    await m.create({ label: "w", network: "simnet", password: PW });
    expect(await codeOfAsync(m.open("w", { password: "not-the-password" }))).toBe("HD_WALLET_UNLOCK_FAILED");
    expect(await codeOfAsync(m.open("w", { password: "" }))).toBe("HD_WALLET_UNLOCK_FAILED");
    const opened = await m.open("w", { password: PW });
    expect(opened.descriptor.verified).toBe(true);
    expect(opened.address(0, "receive", 0)).toBe(m.watch("w").address("receive", 0, "simnet"));
    opened.close();
    expect(() => opened.privateKeyHex(0, "receive", 0)).toThrow(/closed/);
  });

  it.each([
    ["network", (f: any) => (f.header.network = "devnet")],
    ["networkType", (f: any) => (f.header.networkType = "testnet")],
    ["label", (f: any) => (f.header.label = "renamed")],
    ["account key", (f: any) => (f.header.accounts[0].xpub = VB.accountKtub)],
    ["passphraseRequired", (f: any) => (f.header.passphraseRequired = true)],
    ["createdAt", (f: any) => (f.header.createdAt = "2020-01-01T00:00:00.000Z")],
    ["origin", (f: any) => (f.header.origin = "imported")],
    ["KDF iterations", (f: any) => (f.kdf.iterations = 3)],
    ["salt", (f: any) => (f.kdf.salt = Buffer.alloc(16, 7).toString("base64"))],
    ["ciphertext", (f: any) => (f.encryptedPayload = Buffer.from("x".repeat(40)).toString("base64"))]
  ])("an edited %s makes the file refuse to open, like a wrong password", async (_what, edit) => {
    const w = await m.create({ label: "w", network: "simnet", password: PW });
    const file = readJson(w.path);
    edit(file);
    writeJson(w.path, file);
    const code = await codeOfAsync(m.open(file.header.label, { password: PW, ...(file.header.passphraseRequired ? { passphrase: "anything" } : {}) }));
    expect(code).toBe("HD_WALLET_UNLOCK_FAILED");
  });

  it("KDF parameters outside the bounds are refused before any derivation; a swapped file name is refused", async () => {
    const w = await m.create({ label: "w", network: "simnet", password: PW });
    const file = readJson(w.path);
    writeJson(w.path, { ...file, kdf: { ...file.kdf, memory: 4_194_304 } });
    expect(await codeOfAsync(m.open("w", { password: PW }))).toBe("KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS");
    writeJson(w.path, file);
    const other = path.join(path.dirname(w.path), `${newHdWalletId()}.json`);
    fs.renameSync(w.path, other);
    expect(codeOfSync(() => readHdWalletKeystoreSync(other))).toBe("HD_WALLET_KEYSTORE_INVALID");
  });

  it("the index state is not authenticated by design: editing it only moves the next index; the address still comes from the key", async () => {
    const w = await m.create({ label: "w", network: "simnet", password: PW });
    const file = readJson(w.path);
    file.state.accounts["0"].nextReceive = 7;
    writeJson(w.path, file);
    const opened = await m.open("w", { password: PW });
    const a = await m.receiveAddress("w", { password: PW });
    expect(a.index).toBe(7);
    expect(a.address).toBe(opened.address(0, "receive", 7));
    opened.close();
  });

  it("a BIP39 passphrase: required to open, never stored, a wrong one detected by the account key", async () => {
    const w = await m.create({ label: "p", network: "simnet", password: PW, passphrase: "correct horse" });
    expect(w.passphraseRequired).toBe(true);
    expect(fs.readFileSync(w.path, "utf8").includes("correct horse")).toBe(false);
    expect(await codeOfAsync(m.open("p", { password: PW }))).toBe("HD_WALLET_PASSPHRASE_REQUIRED");
    expect(await codeOfAsync(m.open("p", { password: PW, passphrase: "wrong horse" }))).toBe("HD_WALLET_PASSPHRASE_MISMATCH");
    const ok = await m.open("p", { password: PW, passphrase: "correct horse" });
    expect(ok.descriptor.verified).toBe(true);
    ok.close();
    // a passphrase given to a wallet made without one derives another wallet: refused
    await m.create({ label: "np", network: "simnet", password: PW });
    expect(await codeOfAsync(m.open("np", { password: PW, passphrase: "extra" }))).toBe("HD_WALLET_PASSPHRASE_MISMATCH");
    // recovery needs the passphrase too
    const phrase = await m.revealMnemonic("p", { password: PW });
    expect(await m.verifyRecovery("p", { mnemonic: phrase, passphrase: "correct horse" })).toBe(true);
    expect(await m.verifyRecovery("p", { mnemonic: phrase })).toBe(false);
  });
});

describe("WALLET-HD-1 · recovery, password change, accounts, addresses", () => {
  it("importMnemonic of the rusty-kaspa vector recovers its keys (account ktub, testnet receive[1]); verifyRecovery; reveal", async () => {
    const w = await m.importMnemonic({ label: "vb", network: "testnet-10", mnemonic: VB.mnemonic, password: PW });
    expect(w.origin).toBe("imported");
    expect(w.accounts[0]!.xpub).toBe(VB.accountKtub);
    expect((await m.receiveAddress("vb", { index: 1, password: PW })).address).toBe(VB.receiveTestnet1);
    expect(await m.verifyRecovery("vb", { mnemonic: VB.mnemonic })).toBe(true);
    expect(await m.verifyRecovery("vb", { mnemonic: VA.mnemonic })).toBe(false);
    expect(await m.verifyRecovery("vb", { mnemonic: "not a phrase" })).toBe(false);
    expect(await m.revealMnemonic("vb", { password: PW })).toBe(VB.mnemonic);
    expect(await codeOfAsync(m.importMnemonic({ label: "bad", network: "simnet", mnemonic: "zoo zoo zoo", password: PW }))).toBe("HD_WALLET_MNEMONIC_INVALID");
  });

  it("changePassword: the old one stops working, the new one opens; header and state kept; new salt", async () => {
    const w = await m.create({ label: "w", network: "simnet", password: PW });
    await m.receiveAddress("w");
    const before = readJson(w.path);
    const after = await m.changePassword("w", { oldPassword: PW, newPassword: "a-new-password" });
    const file = readJson(w.path);
    expect(file.header).toEqual(before.header);
    expect(file.state.accounts).toEqual(before.state.accounts);
    expect(file.kdf.salt).not.toBe(before.kdf.salt);
    expect(after.walletId).toBe(w.walletId);
    expect(await codeOfAsync(m.open("w", { password: PW }))).toBe("HD_WALLET_UNLOCK_FAILED");
    (await m.open("w", { password: "a-new-password" })).close();
    expect(await codeOfAsync(m.changePassword("w", { oldPassword: "wrong-password", newPassword: "another-one" }))).toBe("HD_WALLET_UNLOCK_FAILED");
    expect(await codeOfAsync(m.changePassword("w", { oldPassword: "a-new-password", newPassword: "short" }))).toBe("KEYSTORE_PASSWORD_TOO_SHORT");
  });

  it("addAccount derives account 1 (authenticated with the rest of the header); open checks every account", async () => {
    const w = await m.create({ label: "w", network: "simnet", password: PW });
    const after = await m.addAccount("w", { password: PW });
    expect(after.accounts.map((a) => a.index)).toEqual([0, 1]);
    const opened = await m.open("w", { password: PW });
    expect(opened.address(1, "receive", 0)).toBe(m.watch("w", 1).address("receive", 0, "simnet"));
    expect(opened.address(1, "receive", 0)).not.toBe(opened.address(0, "receive", 0));
    opened.close();
    expect(await codeOfAsync(m.receiveAddress("w", { account: 2 }))).toBe("HD_WALLET_ACCOUNT_NOT_FOUND");
    const file = readJson(w.path);
    file.header.accounts[1].xpub = file.header.accounts[0].xpub;
    writeJson(w.path, file);
    expect(await codeOfAsync(m.open("w", { password: PW }))).toBe("HD_WALLET_UNLOCK_FAILED");
  });

  it("receive / change addresses: the next one advances the index; an explicit index does not; markUsed never goes back", async () => {
    await m.create({ label: "w", network: "simnet", password: PW });
    const r0 = await m.receiveAddress("w");
    const r1 = await m.receiveAddress("w");
    const c0 = await m.changeAddress("w");
    expect([r0.index, r1.index, c0.index]).toEqual([0, 1, 0]);
    expect(r0.path).toBe("m/44'/111111'/0'/0/0");
    expect(c0.path).toBe("m/44'/111111'/0'/1/0");
    expect(r0.verified).toBe(false);
    expect(r0.address).toMatch(/^kaspasim:/);
    expect(r0.address).not.toBe(r1.address);
    expect((await m.receiveAddress("w", { index: 0 })).address).toBe(r0.address);
    expect(m.describe("w").accounts[0]).toMatchObject({ nextReceive: 2, nextChange: 1 });
    await m.markUsed("w", { account: 0, chain: "change", index: 4 });
    await m.markUsed("w", { account: 0, chain: "change", index: 1 });
    expect(m.describe("w").accounts[0]).toMatchObject({ nextReceive: 2, nextChange: 5 });
    const verified = await m.receiveAddress("w", { password: PW });
    expect(verified).toMatchObject({ index: 2, verified: true });
    expect(await codeOfAsync(m.receiveAddress("w", { password: "wrong-password" }))).toBe("HD_WALLET_UNLOCK_FAILED");
  });

  it("list and describe read the public header only (verified: false); lookup by id or name", async () => {
    const a = await m.create({ label: "a", network: "simnet", password: PW });
    await m.create({ label: "b", network: "devnet", password: PW });
    const list = m.list();
    expect(list.map((w) => w.label).sort()).toEqual(["a", "b"]);
    expect(list.every((w) => w.verified === false)).toBe(true);
    expect(m.describe(a.walletId).label).toBe("a");
    expect(m.describe("b").network).toBe("devnet");
    expect(codeOfSync(() => m.describe("nope"))).toBe("HD_WALLET_NOT_FOUND");
  });
});

describe("WALLET-HD-1 · watch-only", () => {
  it("from an account kpub: same addresses, no keys, nothing encrypted; a master key is refused", async () => {
    const w = await m.importWatchOnly({ label: "watch", network: "simnet", xpub: VA.accountKpub });
    expect(w.kind).toBe("watch-only");
    expect(w.verified).toBe(false);
    // the mainnet-prefixed kpub is stored with the simnet wallet's prefix: the same key
    expect(w.accounts[0]!.xpub).toMatch(/^ktub/);
    const file = readJson(w.path);
    expect(file.kdf).toBeUndefined();
    expect(file.encryptedPayload).toBeUndefined();
    const ring = HdSigningKeyring.fromMnemonic(VA.mnemonic);
    expect((await m.receiveAddress("watch", { index: 3 })).address).toBe(ring.address(0, "receive", 3, "simnet"));
    expect(await codeOfAsync(m.open("watch", { password: PW }))).toBe("HD_WALLET_WATCH_ONLY");
    expect(await codeOfAsync(m.revealMnemonic("watch", { password: PW }))).toBe("HD_WALLET_WATCH_ONLY");
    expect(await codeOfAsync(m.changePassword("watch", { oldPassword: PW, newPassword: "another-pw" }))).toBe("HD_WALLET_WATCH_ONLY");
    expect(await m.verifyRecovery("watch", { mnemonic: VA.mnemonic })).toBe(true);
    const k = (await import("../src/signer-backend.js")).loadKaspaWasmSync();
    const masterKpub = k.XPrv.fromXPrv(VA.masterKprv).toXPub().intoString("kpub");
    expect(await codeOfAsync(m.importWatchOnly({ label: "m", network: "simnet", xpub: masterKpub }))).toBe("HD_WALLET_XPUB_INVALID");
  });
});
