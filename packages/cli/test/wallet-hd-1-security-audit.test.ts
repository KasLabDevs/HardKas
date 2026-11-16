/*
 * WALLET-HD-1 · `security audit` finds a plaintext recovery phrase under the names an HD wallet tool writes
 * (`phrase`, as kaspa-wasm's Mnemonic.toJSON, `recoveryPhrase`, `mnemonicPhrase`), and finds NOTHING in an encrypted HD
 * wallet file. In-process (the exported detector); fictitious phrases; the wallet is a throwaway in a temp directory.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findSecretMaterial } from "../src/commands/security.js";
import { HdWalletManager } from "@hardkas/accounts";

const WORDS = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";

describe("WALLET-HD-1 · findSecretMaterial", () => {
  it.each(["phrase", "recoveryPhrase", "mnemonicPhrase", "mnemonic"])("finds a phrase under %s", (field) => {
    const findings = findSecretMaterial(`{ "${field}": "${WORDS}" }`);
    expect(findings.map((f) => f.kind)).toContain("mnemonic");
    expect(JSON.stringify(findings)).not.toContain("charlie");
  });

  it("an encrypted HD wallet file holds nothing it would report", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hd1-audit-"));
    try {
      const m = new HdWalletManager({ workspaceRoot: root, kdf: { memory: 19_456, iterations: 2, parallelism: 1 } });
      const w = await m.create({ label: "audit", network: "simnet", password: "audit-password-1", passphrase: "extra words here" });
      expect(findSecretMaterial(fs.readFileSync(w.path, "utf8"))).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
