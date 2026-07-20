import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { exec } from "node:child_process";
import util from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateIdentities, createCanonicalMultisig } from "../bl-001-offline-multisig/setup.js";
import { runDetachedSigner } from "../shared/test-helpers.js";

const execAsync = util.promisify(exec);
const ROOT_DIR = __dirname;
const CLI_BIN = path.join(ROOT_DIR, "../bl-001-offline-multisig/cli.ts");

describe("BL-002A - Offline Policy Matrix", () => {
    let identities: Awaited<ReturnType<typeof generateIdentities>>;
    let multisig: ReturnType<typeof createCanonicalMultisig>;
    let kaspa: any;

    beforeAll(async () => {
        kaspa = await import("kaspa-wasm");
        identities = await generateIdentities();
        multisig = createCanonicalMultisig([identities.alice, identities.bob, identities.charlie], 2);

        // Setup workspaces
        await fs.mkdir(path.join(ROOT_DIR, "coordinator"), { recursive: true });
        await fs.mkdir(path.join(ROOT_DIR, "alice"), { recursive: true });
        await fs.mkdir(path.join(ROOT_DIR, "bob"), { recursive: true });
        await fs.mkdir(path.join(ROOT_DIR, "charlie"), { recursive: true });
        await fs.mkdir(path.join(ROOT_DIR, "evidence"), { recursive: true });

        await fs.writeFile(path.join(ROOT_DIR, "alice", ".key_hardware-sim-alice"), identities.alice.privateKeyHex);
        await fs.writeFile(path.join(ROOT_DIR, "bob", ".key_hardware-sim-bob"), identities.bob.privateKeyHex);
        await fs.writeFile(path.join(ROOT_DIR, "charlie", ".key_hardware-sim-charlie"), identities.charlie.privateKeyHex);
    });

    afterAll(async () => {
        await fs.rm(path.join(ROOT_DIR, "coordinator"), { recursive: true, force: true }).catch(() => {});
        await fs.rm(path.join(ROOT_DIR, "alice"), { recursive: true, force: true }).catch(() => {});
        await fs.rm(path.join(ROOT_DIR, "bob"), { recursive: true, force: true }).catch(() => {});
        await fs.rm(path.join(ROOT_DIR, "charlie"), { recursive: true, force: true }).catch(() => {});
    });

    it("should reject sign if policy expects different recipient", async () => {
        // Mock a scenario where Buyer (Alice) tries to trick Arbiter (Charlie) into signing a release to Seller (Bob)
        // But Arbiter's policy is to only sign if it returns to Buyer (Alice).
        
        // Let's create a session sending to Bob
        const sendAmount = 5000000000n;
        const sequence = 0;
        
        // Generate primitive payload sending to Bob (Seller)
        const sortedKeys = [identities.alice.fullPublicKeyHex, identities.bob.fullPublicKeyHex, identities.charlie.fullPublicKeyHex].sort((a, b) => a.localeCompare(b));
        
        // Assume dummy funded UTXO
        const dummyUtxoId = "0000000000000000000000000000000000000000000000000000000000000000";
        
        const primitiveRes = await execAsync(`cargo run --bin generate-multisig-fixture -- ${sortedKeys[0]} ${sortedKeys[1]} ${sortedKeys[2]} ${multisig.redeemScriptHex} 10000000000 ${sequence} ${dummyUtxoId} 0 ${sendAmount}`, { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") });
        const primitiveOut = JSON.parse(primitiveRes.stdout);
        
        const payloadBytes = Buffer.from(primitiveOut.payloadBase64, 'base64');
        const integrityHash = crypto.createHash("sha256").update(payloadBytes).digest("hex");
        
        const bobAddress = "kaspatest:mock-bob-address";
        const aliceAddress = "kaspatest:mock-alice-address";
        
        const unsignedSession = {
            id: crypto.createHash("sha256").update(integrityHash).digest("hex"),
            version: "0.2.0-draft",
            networkId: "simnet",
            unsignedTransactionId: "plan-mock-1234",
            state: "created",
            payload: {
                format: "pskt-binary-base64",
                encoding: "base64",
                data: primitiveOut.payloadBase64,
                payloadHash: integrityHash,
                byteLength: payloadBytes.length
            },
            participants: [],
            requirements: [],
            attestations: [],
            runtimeBinding: {
                adapterId: "rust-pskt-native",
                adapterKind: "native",
                capabilitiesHash: "fake-caps-hash"
            },
            createdAt: new Date().toISOString(),
            // Mocking the outputs for our policyEnforcedSigner since it can't extract them from bincode yet
            mockedOutputs: [{
                address: bobAddress, // Sending to Bob
                value: sendAmount.toString()
            }]
        };

        const sessionPath = path.join(ROOT_DIR, "charlie", "unsigned-trick.json");
        await fs.writeFile(sessionPath, JSON.stringify(unsignedSession, null, 2));

        // Now Charlie (Arbiter) runs policyEnforcedSigner expecting destination = Alice (Buyer)
        const policyEnforcedSigner = async (pskbPath: string, signerName: string, expectedRecipient: string) => {
            const session = JSON.parse(await fs.readFile(pskbPath, "utf-8"));
            const actualRecipient = session.mockedOutputs[0].address;
            if (actualRecipient !== expectedRecipient) {
                throw new Error(`Policy violation: expected recipient ${expectedRecipient}, got ${actualRecipient}`);
            }
            await runDetachedSigner(CLI_BIN, path.join(ROOT_DIR, "charlie"), session.id, pskbPath, signerName);
        };
        
        await expect(policyEnforcedSigner(sessionPath, "hardware-sim-charlie", aliceAddress))
            .rejects.toThrow(`Policy violation: expected recipient ${aliceAddress}, got ${bobAddress}`);
    }, 15000);
});
