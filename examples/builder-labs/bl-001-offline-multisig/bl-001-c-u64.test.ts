import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "node:child_process";
import util from "node:util";
const execAsync = util.promisify(exec);
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateIdentities, createCanonicalMultisig } from "./setup.js";
import { pskt } from "@hardkas/sdk";

const ROOT_DIR = __dirname;
const CLI_BIN = path.join(ROOT_DIR, "cli.ts");

function canonicalStringify(obj: any): string {
  if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `"${k}":${canonicalStringify(obj[k])}`).join(',')}}`;
}

describe("BL-001C - Integer Fidelity u64", () => {
  let identities: Awaited<ReturnType<typeof generateIdentities>>;
  let multisig: ReturnType<typeof createCanonicalMultisig>;
  
  beforeAll(async () => {
    identities = await generateIdentities();
    multisig = createCanonicalMultisig([identities.alice, identities.bob, identities.charlie], 2);

    await fs.mkdir(path.join(ROOT_DIR, "u64-test"), { recursive: true });
    
    // We only need Alice and Bob to sign
    await fs.writeFile(path.join(ROOT_DIR, "u64-test", ".key_hardware-sim-alice"), identities.alice.privateKeyHex);
    await fs.writeFile(path.join(ROOT_DIR, "u64-test", ".key_hardware-sim-bob"), identities.bob.privateKeyHex);
  });

  const runCli = async (args: string[]) => {
    try {
      const { stdout, stderr } = await execAsync(`npx tsx ${CLI_BIN} ${args.join(" ")}`, { cwd: path.join(ROOT_DIR, "u64-test") });
      return { stdout, stderr, exitCode: 0 };
    } catch (e: any) {
      return { stdout: e.stdout, stderr: e.stderr, exitCode: e.code || 1 };
    }
  };

  const TEST_VALUES = [
    "1",
    "9007199254740991",
    "9007199254740992",
    "18446744073709551615"
  ];

  for (const testValue of TEST_VALUES) {
    it(`should preserve fidelity of value ${testValue}`, async () => {
      // 1. Generate PSKT primitive with amount=testValue and sequence=testValue
      const primitiveRes = await execAsync(`cargo run --bin generate-multisig-fixture -- ${identities.alice.publicKeyHex} ${identities.bob.publicKeyHex} ${identities.charlie.publicKeyHex} ${multisig.redeemScriptHex} ${testValue} ${testValue}`, { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") });
      const psktData = JSON.parse(primitiveRes.stdout);
      
      const payloadHash = crypto.createHash("sha256").update(Buffer.from(psktData.payloadBase64, "base64")).digest("hex");
      const payload = {
          format: "pskt-binary-base64",
          data: psktData.payloadBase64,
          payloadHash
      };

      const sessionIdHash = crypto.createHash("sha256").update(canonicalStringify({
        networkId: "simnet",
        planId: "plan-mock-1234",
        schemaVersion: 1,
        unsignedTransactionId: "plan-mock-1234"
      })).digest("hex");

      const unsignedSession = {
        kind: "hardkas-portable-signing-session",
        schemaVersion: 1,
        sessionId: sessionIdHash,
        revision: 0,
        planId: "plan-mock-1234",
        networkId: "simnet",
        unsignedTransactionId: "plan-mock-1234",
        state: "created",
        payload,
        participants: [],
        requirements: [],
        attestations: [],
        runtimeBinding: {
          adapterId: "rust-pskt-native",
          adapterKind: "native",
          capabilitiesHash: ""
        },
        createdAt: new Date().toISOString()
      };
      
      await pskt.registerNativeAdapter();
      const nativeCaps = await pskt.capabilities("rust-pskt-native");
      unsignedSession.runtimeBinding.capabilitiesHash = crypto.createHash("sha256").update(canonicalStringify(nativeCaps)).digest("hex");
      if (nativeCaps.providerVersion) (unsignedSession.runtimeBinding as any).providerVersion = nativeCaps.providerVersion;
      if (nativeCaps.providerHash) (unsignedSession.runtimeBinding as any).providerHash = nativeCaps.providerHash;

      const canonicalFields = {
        attestations: unsignedSession.attestations,
        kind: unsignedSession.kind,
        networkId: unsignedSession.networkId,
        parentRevisionHash: undefined,
        participants: unsignedSession.participants,
        payload: unsignedSession.payload,
        planId: unsignedSession.planId,
        requirements: unsignedSession.requirements,
        revision: unsignedSession.revision,
        runtimeBinding: unsignedSession.runtimeBinding,
        schemaVersion: unsignedSession.schemaVersion,
        sessionId: unsignedSession.sessionId,
        state: unsignedSession.state,
        unsignedTransactionId: unsignedSession.unsignedTransactionId
      };
      unsignedSession.integrityHash = crypto.createHash("sha256").update(canonicalStringify(canonicalFields)).digest("hex");

      const prefix = `val-${testValue}`;
      await fs.writeFile(path.join(ROOT_DIR, "u64-test", `${prefix}-unsigned.json`), canonicalStringify(unsignedSession));
      
      // 2. Sign Alice
      let res = await runCli([
        "pskt-sign", `${prefix}-unsigned.json`,
        "--adapter", "rust-pskt-native",
        "--signer", "hardware-sim-alice",
        "--input", "0",
        "--out", `${prefix}-alice-signed.json`
      ]);
      if (res.exitCode !== 0) console.error("Alice sign failed", res.stdout, res.stderr);
      expect(res.exitCode).toBe(0);

      // 3. Sign Bob
      res = await runCli([
        "pskt-sign", `${prefix}-unsigned.json`,
        "--adapter", "rust-pskt-native",
        "--signer", "hardware-sim-bob",
        "--input", "0",
        "--out", `${prefix}-bob-signed.json`
      ]);
      if (res.exitCode !== 0) console.error("Bob sign failed", res.stdout, res.stderr);
      expect(res.exitCode).toBe(0);

      // 4. Merge
      res = await runCli([
        "pskt-merge", 
        `${prefix}-alice-signed.json`, 
        `${prefix}-bob-signed.json`,
        "--out", `${prefix}-merged.json`
      ]);
      if (res.exitCode !== 0) console.error("Merge failed", res.stdout, res.stderr);
      expect(res.exitCode).toBe(0);

      // 5. Finalize
      res = await runCli([
        "pskt-finalize", `${prefix}-merged.json`,
        "--out", `${prefix}-finalized.json`
      ]);
      if (res.exitCode !== 0) console.error("Finalize failed", res.stdout, res.stderr);
      expect(res.exitCode).toBe(0);

      // 6. Extract
      res = await runCli([
        "pskt-extract", `${prefix}-finalized.json`,
        "--out", `${prefix}-tx.json`
      ]);
      if (res.exitCode !== 0) console.error("Extract failed", res.stdout, res.stderr);
      expect(res.exitCode).toBe(0);

      // 7. Verify Fidelity
      const txRaw = await fs.readFile(path.join(ROOT_DIR, "u64-test", `${prefix}-tx.json`), "utf-8");
      const tx = JSON.parse(txRaw);
      
      // Output value should be exactly preserved as string
      expect(tx.transaction.outputs[0].value).toBe(testValue);
    }, 60000);
  }
});
