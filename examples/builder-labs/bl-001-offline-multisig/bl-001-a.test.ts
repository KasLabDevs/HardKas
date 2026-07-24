import { describe, it, expect, beforeAll } from "vitest";
import { exec } from "node:child_process";
import util from "node:util";
const execAsync = util.promisify(exec);
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateIdentities, createCanonicalMultisig } from "./setup.js";
import { pskt } from "@hardkas/sdk";
import { HardkasSchemas } from "@hardkas/core";
import { TxPlanArtifactV1 } from "@hardkas/artifacts";

const ROOT_DIR = __dirname;
const CLI_BIN = path.join(ROOT_DIR, "cli.ts");

function canonicalStringify(obj: any): string {
  if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `"${k}":${canonicalStringify(obj[k])}`).join(',')}}`;
}

describe("BL-001A - Offline Multisig Ceremony", () => {
  let identities: Awaited<ReturnType<typeof generateIdentities>>;
  let multisig: ReturnType<typeof createCanonicalMultisig>;
  
  beforeAll(async () => {
    identities = await generateIdentities();
    multisig = createCanonicalMultisig([identities.alice, identities.bob, identities.charlie], 2);

    // Setup isolated directories
    await fs.mkdir(path.join(ROOT_DIR, "coordinator"), { recursive: true });
    await fs.mkdir(path.join(ROOT_DIR, "alice"), { recursive: true });
    await fs.mkdir(path.join(ROOT_DIR, "bob"), { recursive: true });
    await fs.mkdir(path.join(ROOT_DIR, "charlie"), { recursive: true });
    await fs.mkdir(path.join(ROOT_DIR, "evidence"), { recursive: true });

    // Write keys to isolated directories
    await fs.writeFile(path.join(ROOT_DIR, "alice", ".key_hardware-sim-alice"), identities.alice.privateKeyHex);
    await fs.writeFile(path.join(ROOT_DIR, "bob", ".key_hardware-sim-bob"), identities.bob.privateKeyHex);
    await fs.writeFile(path.join(ROOT_DIR, "charlie", ".key_hardware-sim-charlie"), identities.charlie.privateKeyHex);

    // Create a real TxPlan in coordinator conforming to TxPlanArtifactV1
    const mockTxPlan: TxPlanArtifactV1 = {
      schema: HardkasSchemas.TxPlanV1,
      hardkasVersion: "0.11.4-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "developer",
      createdAt: new Date().toISOString(),
      status: "built",
      planId: "plan-mock-1234",
      from: {
        input: "0",
        address: multisig.p2shAddress,
      },
      to: {
        input: "0",
        address: identities.alice.publicKeyHex, // Mock address
      },
      amountSompi: "490000000",
      amount: "4.9",
      selectedUtxos: [
        {
          outpoint: {
            transactionId: "0000000000000000000000000000000000000000000000000000000000000000",
            index: 0
          },
          address: multisig.p2shAddress,
          amountSompi: "500000000",
          scriptPublicKey: "aa20" + crypto.createHash("sha256").update(Buffer.from(multisig.redeemScriptHex, 'hex')).digest("hex") + "87", 
        }
      ],
      outputs: [
        {
          address: identities.alice.publicKeyHex,
          amountSompi: "490000000"
        }
      ],
      estimatedMass: "1000",
      estimatedFeeSompi: "10000000",
      estimatedFee: "0.1"
    };

    // We also need to embed the multisig details into the plan so exportSession knows it's a multisig session.
    // In HardKAS, this is typically done via `metadata` or by the adapter reading the script logic.
    // For our lab, `pskt.exportSession` might expect `multisig` config on the plan or we inject it into the session.
    (mockTxPlan as any).multisig = {
      threshold: multisig.threshold,
      requiredSigners: multisig.cosigners,
      redeemScript: multisig.redeemScriptHex,
      signatures: []
    };

    await fs.writeFile(path.join(ROOT_DIR, "coordinator", "plan.json"), JSON.stringify(mockTxPlan, null, 2));
  });

  const runCli = async (cwd: string, args: string[]) => {
    try {
      const { stdout, stderr } = await execAsync(`npx tsx ${CLI_BIN} ${args.join(" ")}`, { cwd: path.join(ROOT_DIR, cwd) });
      return { stdout, stderr, exitCode: 0 };
    } catch (e: any) {
      return { stdout: e.stdout, stderr: e.stderr, exitCode: e.code || 1 };
    }
  };

  it("1. Coordinator exports PSKT (Manually using primitives)", async () => {
    // Because HardKAS does not yet support `exportPlan` in any PSKT adapter,
    // we construct the PSKB using primitives (a Rust helper simulating primitive construction).
    const primitiveRes = await execAsync(`cargo run --bin generate-multisig-fixture -- ${identities.alice.fullPublicKeyHex} ${identities.bob.fullPublicKeyHex} ${identities.charlie.fullPublicKeyHex} ${multisig.redeemScriptHex} 1000 0`, { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") });
    
    const psktData = JSON.parse(primitiveRes.stdout);
    
    const payloadHash = crypto.createHash("sha256").update(Buffer.from(psktData.payloadBase64, "base64")).digest("hex");
    const payload = {
        format: "pskt-binary-base64",
        data: psktData.payloadBase64,
        payloadHash
    };
    
    // We compute the sessionId like SDK does
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
        capabilitiesHash: "fake-caps-hash" // This would normally be computed from probe(), we can just pass a string since Native adapter check might complain if capabilities changed, but for our test it just needs to be a string
      },
      createdAt: new Date().toISOString()
    };
    
    // Actually we need the REAL capabilities hash for the native adapter so verifyAdapterCapabilities doesn't throw PsktCapabilitiesChangedError!
    // We can probe it here.
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

    await fs.writeFile(path.join(ROOT_DIR, "coordinator", "unsigned.json"), canonicalStringify(unsignedSession));
    
    // Copy to Alice and Bob
    await fs.copyFile(path.join(ROOT_DIR, "coordinator", "unsigned.json"), path.join(ROOT_DIR, "alice", "unsigned.json"));
    await fs.copyFile(path.join(ROOT_DIR, "coordinator", "unsigned.json"), path.join(ROOT_DIR, "bob", "unsigned.json"));
  }, 15000);

  it("2. Alice signs isolated", async () => {
    const res = await runCli("alice", [
      "pskt-sign", path.join(ROOT_DIR, "alice", "unsigned.json"),
      "--adapter", "rust-pskt-native",
      "--signer", "hardware-sim-alice",
      "--input", "0",
      "--out", path.join(ROOT_DIR, "alice", "alice-signed.json")
    ]);
    if (res.exitCode !== 0) console.error("Sign Alice failed:", res.stdout, res.stderr);
    expect(res.exitCode).toBe(0);
  });

  it("3. Bob signs isolated", async () => {
    const res = await runCli("bob", [
      "pskt-sign", path.join(ROOT_DIR, "bob", "unsigned.json"),
      "--adapter", "rust-pskt-native",
      "--signer", "hardware-sim-bob",
      "--input", "0",
      "--out", path.join(ROOT_DIR, "bob", "bob-signed.json")
    ]);
    if (res.exitCode !== 0) console.error("Sign Bob failed:", res.stdout, res.stderr);
    expect(res.exitCode).toBe(0);
  });

  it("4. Merge and Finalize by Coordinator", async () => {
    // Copy back to coordinator
    await fs.copyFile(path.join(ROOT_DIR, "alice", "alice-signed.json"), path.join(ROOT_DIR, "coordinator", "alice-signed.json"));
    await fs.copyFile(path.join(ROOT_DIR, "bob", "bob-signed.json"), path.join(ROOT_DIR, "coordinator", "bob-signed.json"));

    const mergeRes = await runCli("coordinator", [
      "pskt-merge", 
      path.join(ROOT_DIR, "coordinator", "alice-signed.json"), 
      path.join(ROOT_DIR, "coordinator", "bob-signed.json"),
      "--out", path.join(ROOT_DIR, "coordinator", "merged.json")
    ]);
    if (mergeRes.exitCode !== 0) console.error("Merge failed:", mergeRes.stderr);
    expect(mergeRes.exitCode).toBe(0);

    const finalizeRes = await runCli("coordinator", [
      "pskt-finalize", path.join(ROOT_DIR, "coordinator", "merged.json"),
      "--out", path.join(ROOT_DIR, "coordinator", "finalized.json")
    ]);
    if (finalizeRes.exitCode !== 0) console.error("Finalize failed:", finalizeRes.stderr);
    expect(finalizeRes.exitCode).toBe(0);

    const extractRes = await runCli("coordinator", [
      "pskt-extract", path.join(ROOT_DIR, "coordinator", "finalized.json"),
      "--out", path.join(ROOT_DIR, "coordinator", "tx.json")
    ]);
    if (extractRes.exitCode !== 0) console.error("Extract failed:", extractRes.stderr);
    expect(extractRes.exitCode).toBe(0);
  }, 120000);
});
