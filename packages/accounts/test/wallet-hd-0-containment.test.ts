/*
 * WALLET-HD-0 · containment of the synthetic (legacy) wallet derivation.
 *
 * F-01 (AUDIT-WALLET-ARCHITECTURE-1): `WalletManager.create()` derives `seedRef` from the PUBLIC walletId and
 * `AddressManager.derive()` derives the private key as sha256(seedRef:path:network) — no secret anywhere. Such an
 * identity may exist on simnet only. These tests:
 *   - REPRODUCE the property (a third party recomputes seedRef, key and address from the walletId) — true before and
 *     after, on simnet, by design: it is WHY the identity is confined;
 *   - PIN the simnet addresses byte for byte (vectors captured on develop 5b1bf4ee1 before the change);
 *   - require every other network (testnet-10, other testnets, devnet, mainnet, unknown names, address prefixes) to be
 *     refused BEFORE any address exists — red on the base, green after.
 * Hermetic: the pinned kaspa-wasm in HARDKAS_HOME, no node, no network, synthetic identities only.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { AddressManager } from "../src/address-manager.js";
import { WalletManagerImpl, WalletManager } from "../src/wallet-manager.js";
import { loadKaspaWasmSync } from "../src/signer-backend.js";

const BLOCKED = "SYNTHETIC_DERIVATION_NETWORK_BLOCKED";

/** The whole legacy chain, re-implemented WITHOUT HardKAS code: what anyone who knows the walletId computes. */
function thirdParty(walletId: string, network: string, accountIndex = 0, chain: 0 | 1 = 0, addressIndex = 0) {
  const seedRef = "seedref_" + createHash("sha256").update(`dev-fixture:${walletId}`).digest("hex").slice(0, 32);
  const derivationPath = `m/44'/111111'/${accountIndex}'/${chain}/${addressIndex}`;
  const privateKeyHex = createHash("sha256").update(`${seedRef}:${derivationPath}:${network}`).digest("hex");
  const kaspa = loadKaspaWasmSync();
  const address = new kaspa.PrivateKey(privateKeyHex).toKeypair().toAddress("simnet").toString();
  return { seedRef, privateKeyHex, address };
}

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e: any) {
    return String(e?.code ?? "");
  }
};

describe("WALLET-HD-0 · F-01 reproduced: the synthetic key is computable from the public walletId (simnet, by design)", () => {
  it.each(["alice", "merchant-1", "smoke-test-bot"])("walletId %s: a third party recomputes seedRef, key and address", (walletId) => {
    const wm = new WalletManagerImpl();
    const artifact = wm.create({ walletId, network: "simnet" });
    const derived = AddressManager.deriveReceive({ seedRef: wm.getSeedRef(walletId), accountIndex: 0, addressIndex: 0, network: "simnet" });
    const tp = thirdParty(walletId, "simnet");
    expect(artifact.seedRef).toBe(tp.seedRef);
    expect(derived.address).toBe(tp.address);
    expect(derived.derivationModel).toBe("deterministic-simulated-v1");
    expect(derived.claims.realBip39).toBe(false);
    expect(derived.claims.productionCustody).toBe(false);
  });
});

describe("WALLET-HD-0 · simnet vectors are preserved byte for byte (captured on develop 5b1bf4ee1)", () => {
  // walletId → receive address (account 0, index 0) through WalletManager.create + AddressManager.deriveReceive
  it.each([
    ["alice", "kaspasim:qzcsttemz9f8u6yjy8eazwshu97cam9nh0jd7974h2m7hnxe0lvrq66hhz32c"],
    ["merchant-1", "kaspasim:qq5v3vv94lha628dhxsllg4szsg8hk85l8rthp0cj7qf7gnfj7ckuh24fk397"],
    ["smoke-test-bot", "kaspasim:qq6te2qh54u92aj8nz4h503ye5g0f2tj4ctr2msqj550spzqq4q9yqv3pwvfc"],
    ["alice-simnet", "kaspasim:qrmqyd748ms7shdvh8gysfqkjfjxkq9ttejc0w2a7643u7nwtp82ymnnlxdzk"],
    ["merchant-1-simnet", "kaspasim:qquqv35w6k0jtr8wjz3f0lrsg7y9nqjqrptcmg8k0zcv3g4z8rajknnelvynu"],
    ["smoke-test-bot-simnet", "kaspasim:qr40e5cj8wqxpm8jvx6l4tshv7gy9w2p8c6hqfsnzmp5zpr5vln4x7ux54y7j"]
  ])("create(%s) → receive[0] = %s", (walletId, expected) => {
    const wm = new WalletManagerImpl();
    wm.create({ walletId, network: "simnet" });
    const seedRef = wm.getSeedRef(walletId);
    expect(AddressManager.deriveReceive({ seedRef, accountIndex: 0, addressIndex: 0, network: "simnet" }).address).toBe(expected);
    // the network default (undefined) is simnet and gives the same address
    expect(AddressManager.deriveReceive({ seedRef, accountIndex: 0, addressIndex: 0 }).address).toBe(expected);
  });

  it("merchant-1: receive[1] and change[0] (the per-invoice derivation of the templates)", () => {
    const wm = new WalletManagerImpl();
    wm.create({ walletId: "merchant-1" });
    const seedRef = wm.getSeedRef("merchant-1");
    expect(AddressManager.deriveReceive({ seedRef, accountIndex: 0, addressIndex: 1 }).address).toBe(
      "kaspasim:qr03z6fp2j9zvecnex5pjeys5afkauwyqthjq8cxwj86ccedej0dqmppm9hfw"
    );
    expect(AddressManager.deriveChange({ seedRef, accountIndex: 0, addressIndex: 0 }).address).toBe(
      "kaspasim:qzfhncyry3a49cqqpzhn8sy7x6lt8mhluemeln9szet63nne4nphc45kcvh9m"
    );
  });

  it("the simnet aliases are accepted and always give a kaspasim: address", () => {
    for (const network of ["simnet", "simulated", "local-docker-simnet", "simnet-1", "SIMNET", "kaspa-simnet", undefined]) {
      const wm = new WalletManagerImpl();
      const artifact = wm.create({ walletId: `alias-${String(network)}`, ...(network === undefined ? {} : { network: network as any }) });
      expect(artifact.network === undefined ? "simnet" : String(artifact.network)).toBeTruthy();
      const addr = AddressManager.deriveReceive({ seedRef: artifact.seedRef, accountIndex: 0, addressIndex: 0, ...(network === undefined ? {} : { network: network as any }) });
      expect(addr.address, String(network)).toMatch(/^kaspasim:/);
    }
  });
});

describe("WALLET-HD-0 · AddressManager refuses every non-simnet network before deriving (direct API, no CLI)", () => {
  it.each([
    ["testnet"],
    ["testnet-10"],
    ["testnet-11"],
    ["kaspa-testnet-10"],
    ["devnet"],
    ["devnet-1"],
    ["foo"],
    [""],
    ["kaspatest"], // an address PREFIX is not a network identity
    ["kaspa"],
    ["kaspasim"] // nor is the simnet prefix
  ])("derive(network=%j) → %s, no address", (network) => {
    expect(codeOf(() => AddressManager.deriveReceive({ seedRef: "test-seed-123", accountIndex: 0, addressIndex: 0, network: network as any }))).toBe(BLOCKED);
    expect(codeOf(() => AddressManager.deriveChange({ seedRef: "test-seed-123", accountIndex: 0, addressIndex: 0, network: network as any }))).toBe(BLOCKED);
    expect(codeOf(() => AddressManager.derive({ seedRef: "test-seed-123", accountIndex: 0, chain: 0, addressIndex: 0, network: network as any }))).toBe(BLOCKED);
  });

  it("mainnet keeps its own refusal code", () => {
    expect(() => AddressManager.deriveReceive({ seedRef: "s", accountIndex: 0, addressIndex: 0, network: "mainnet" })).toThrow(/ADDRESS_MANAGER_MAINNET_BLOCKED/);
  });

  it("the refusal names no key material", () => {
    try {
      AddressManager.deriveReceive({ seedRef: "super-secret-seed", accountIndex: 0, addressIndex: 0, network: "testnet-10" as any });
      throw new Error("expected a refusal");
    } catch (e: any) {
      expect(e.code).toBe(BLOCKED);
      expect(String(e.message)).not.toContain("super-secret-seed");
    }
  });
});

describe("WALLET-HD-0 · WalletManager refuses to create or import a synthetic wallet outside simnet", () => {
  it.each([["testnet"], ["testnet-10"], ["devnet"], ["foo"], ["kaspatest"]])("create/importMnemonic(network=%s) → refused, nothing registered", (network) => {
    const wm = new WalletManagerImpl();
    expect(codeOf(() => wm.create({ walletId: "w", network: network as any }))).toBe(BLOCKED);
    expect(codeOf(() => wm.importMnemonic({ walletId: "w2", mnemonic: "not a bip39 phrase", network: network as any }))).toBe(BLOCKED);
    expect(() => wm.getSeedRef("w")).toThrow(/Wallet not found/);
    expect(() => wm.getSeedRef("w2")).toThrow(/Wallet not found/);
  });

  it("mainnet keeps its own refusal code", () => {
    expect(() => WalletManager.create({ walletId: "m", network: "mainnet" })).toThrow(/WALLET_MANAGER_MAINNET_BLOCKED/);
  });

  it("a created wallet says what it is: synthetic, not BIP39, not custody", () => {
    const artifact: any = new WalletManagerImpl().create({ walletId: "says" });
    expect(artifact.network).toBe("simnet");
    expect(artifact.derivationModel).toBe("deterministic-simulated-v1");
    expect(artifact.claims.realBip39).toBe(false);
    expect(artifact.claims.productionCustody).toBe(false);
    const imported: any = new WalletManagerImpl().importMnemonic({ walletId: "imp", mnemonic: "test" });
    expect(imported.derivationModel).toBe("deterministic-simulated-v1");
    expect(imported.claims.realBip39).toBe(false);
  });
});
