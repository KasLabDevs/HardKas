import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  resolveAccountAddress,
  createDeterministicAccounts
} from "@hardkas/localnet";

import {
  ensureDevAccounts,
  DEV_ACCOUNTS_PASSWORD,
  KeystoreManager,
  loadKaspaWasm
} from "../src";

// -----------------------------------------------------------------------------
// Wave 4 · DEF-27 regression · Deterministic identity invariant
//
// Invariant (all five HardKAS Kaspa dev identities):
//
//     name  →  canonical scheme-2 derivation index
//           →  reproducible private key
//           →  derived simnet address
//           ==  advertised address (createDeterministicAccounts / resolveAccountAddress)
//           ==  keystore address on disk (ensureDevAccounts)
//
// Canonical scheme (owner: packages/accounts/src/dev-accounts.ts):
//     seed  = "hardkas-deterministic-simnet-seed-v1-<index>"
//     pkHex = sha256(seed)
//     addr  = new PrivateKey(pkHex).toKeypair().toAddress("simnet").toString()
//
// This regression re-runs that derivation inline and mechanically enforces
// that the cached constants in packages/localnet/src/accounts.ts
// (DEFAULT_KASPA_ADDRESSES + the resolveAccountAddress alias map) cannot
// silently drift from it.
//
// SAFETY DISCIPLINE
//   * Private keys are used only to derive addresses. They are NEVER stored
//     in an assertion message, an object dumped into expect(), a log, or a
//     variable that outlives the derivation scope beyond what is strictly
//     needed for the test. Payload dumps below deliberately redact
//     privateKey to the string "[REDACTED]" before any comparison.
//   * All ensureDevAccounts() runs happen in a per-test os.tmpdir() workspace
//     so this file cannot mutate a user's real ~/.hardkas dev accounts.
// -----------------------------------------------------------------------------

const CANONICAL_SEED = "hardkas-deterministic-simnet-seed-v1";
const NAMES = ["alice", "bob", "carol", "dave", "erin"] as const;

// Historical sentinel: alice's advertised address MUST remain byte-identical to
// the pre-Wave-4 value, because alice was the one identity whose old literal
// already matched scheme-2 index 0. This byte-check is the guard against
// accidental scheme drift on the one address we already knew was correct.
const ALICE_SENTINEL =
  "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";

interface CanonicalDerivation {
  readonly name: string;
  readonly index: number;
  readonly address: string;
}

async function deriveCanonical(kaspa: any, index: number): Promise<string> {
  const seedString = `${CANONICAL_SEED}-${index}`;
  const privateKeyHex = createHash("sha256").update(seedString).digest("hex");
  const kp = new kaspa.PrivateKey(privateKeyHex).toKeypair();
  return kp.toAddress("simnet").toString();
}

function mkTmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hk-wave4-def27-"));
}

describe("Wave 4 · DEF-27 · deterministic identity invariant", () => {
  let kaspa: any;
  let canonical: CanonicalDerivation[];

  beforeAll(async () => {
    kaspa = await loadKaspaWasm();
    canonical = await Promise.all(
      NAMES.map(async (name, index) => ({
        name,
        index,
        address: await deriveCanonical(kaspa, index)
      }))
    );
  });

  it("alice remains byte-identical to the historical sentinel", () => {
    // If this fails, either the canonical scheme changed (v2 seed?) or the
    // pinned kaspa-wasm SDK changed its address encoding for the same
    // private key. Either would be a silent identity break for every
    // consumer that already trusts alice.
    expect(canonical[0]!.address).toBe(ALICE_SENTINEL);
  });

  it("every canonical-derived address parses via new kaspa.Address()", () => {
    for (const d of canonical) {
      expect(() => new kaspa.Address(d.address)).not.toThrow();
    }
  });

  it("createDeterministicAccounts advertises the canonical address at each index", () => {
    const advertised = createDeterministicAccounts();
    expect(advertised).toHaveLength(NAMES.length);
    for (const d of canonical) {
      expect(advertised[d.index]!.name).toBe(d.name);
      expect(advertised[d.index]!.address).toBe(d.address);
    }
  });

  it("resolveAccountAddress returns the canonical address for every alias (case-insensitive)", () => {
    for (const d of canonical) {
      expect(resolveAccountAddress(d.name)).toBe(d.address);
      expect(resolveAccountAddress(d.name.toUpperCase())).toBe(d.address);
    }
  });

  it("ensureDevAccounts provisions all five identities under the workspace", async () => {
    const workspace = mkTmpWorkspace();
    await ensureDevAccounts(workspace);

    const devDir = path.join(workspace, ".hardkas", "dev-accounts");
    const files = fs
      .readdirSync(devDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    expect(files).toEqual(
      NAMES.map((n) => `${n}.json`).slice().sort()
    );
  });

  it("advertised === derived === keystore for every identity (private key never exposed)", async () => {
    const workspace = mkTmpWorkspace();
    await ensureDevAccounts(workspace);
    const devDir = path.join(workspace, ".hardkas", "dev-accounts");

    for (const d of canonical) {
      const filePath = path.join(devDir, `${d.name}.json`);
      const keystore = await KeystoreManager.loadEncryptedKeystore(filePath);
      const unlocked = await KeystoreManager.decryptEncryptedKeystore(
        keystore,
        DEV_ACCOUNTS_PASSWORD
      );
      expect(unlocked.success).toBe(true);
      expect(unlocked.payload).toBeDefined();

      const keystoreAddress = unlocked.payload!.address;

      // Redact the private key before doing ANY structural comparison so a
      // failure diff can never spill it into test output.
      const safe = {
        name: d.name,
        index: d.index,
        canonicalAddress: d.address,
        advertisedAddress: resolveAccountAddress(d.name),
        keystoreAddress,
        privateKey: "[REDACTED]"
      };

      expect(safe.advertisedAddress).toBe(safe.canonicalAddress);
      expect(safe.keystoreAddress).toBe(safe.canonicalAddress);

      // Positive existence check: the keystore DID carry a private key, we
      // just refuse to compare on its value here.
      expect(typeof unlocked.payload!.privateKey).toBe("string");
      expect(unlocked.payload!.privateKey!.length).toBeGreaterThan(0);
    }
  });
});
