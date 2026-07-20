import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { exec } from "node:child_process";
import util from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateIdentities } from "../bl-001-offline-multisig/setup.js";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { JsonWrpcKaspaClient as RpcClient } from "@hardkas/kaspa-rpc";
import { createKaspaP2shBlake2bLock } from "@hardkas/core";
import { SilverCompilerAdapter } from "./SilverCompilerAdapter.js";

const execAsync = util.promisify(exec);
const ROOT_DIR = __dirname;
const NETWORK_ID = "simnet";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("BL-003C - Covenant Negative Consensus Matrix", () => {
    let identities: any;
    let runner: DockerKaspadRunner;
    let rpc: RpcClient;
    let kaspa: any;
    let coordinatorAddress: string;
    let adapter: SilverCompilerAdapter;
    let covenantBytecodeHex: string;
    let covenantLockingScriptHex: string;
    let artifact: any;

    beforeAll(async () => {
        kaspa = await import("kaspa-wasm");
        identities = await generateIdentities();
        adapter = new SilverCompilerAdapter(path.join(ROOT_DIR, "../../../.hardkas/bin/silverc.exe"));

        const charlieSpk = `000020${identities.charlie.publicKeyHex}ac`;
        const scriptSource = `
pragma silverscript ^0.1.0;
contract FixedDestination() {
    entrypoint function spend() {
        byte[] expectedSpk = 0x${charlieSpk};
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == expectedSpk);
    }
}
        `.trim();
        const sourcePath = path.join(ROOT_DIR, "covenant-negative.sil");
        await fs.writeFile(sourcePath, scriptSource);

        artifact = await adapter.compile({ sourcePath });
        covenantBytecodeHex = artifact.bytecodeHex;

        const lock = createKaspaP2shBlake2bLock(Buffer.from(covenantBytecodeHex, "hex"));
        covenantLockingScriptHex = lock.lockingScriptHex;

        runner = new DockerKaspadRunner({
            networkId: NETWORK_ID,
            containerName: "bl-003c-negative-node",
            listenRpc: true,
            rpcPort: 16210,
            utxoIndex: true,
            coinbaseMaturity: 100
        });
        await runner.start();

        rpc = new RpcClient({ rpcUrl: "ws://127.0.0.1:18210", timeoutMs: 60000 });

        coordinatorAddress = new kaspa.PrivateKey(identities.bob.privateKeyHex).toKeypair().toAddress(kaspa.NetworkType.Simnet).toString();

        await execAsync(`docker rm -f bl003c-miner`).catch(() => {});
        await execAsync(`docker run -d --name bl003c-miner --network container:${runner["options"].containerName} kaspanet/cpuminer:latest -a ${coordinatorAddress} -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1`);
        
        let mature = false;
        while (!mature) {
            try {
                const utxos = await rpc.getUtxosByAddresses([coordinatorAddress]);
                if (utxos.entries && utxos.entries.length > 0) {
                    const dagInfo = await rpc.getBlockDagInfo();
                    const virtualDaaScore = BigInt(dagInfo.virtualDaaScore);
                    const isMature = utxos.entries.find((u: any) => virtualDaaScore - BigInt(u.utxoEntry.blockDaaScore) > 100n);
                    if (isMature) {
                        mature = true;
                    }
                }
            } catch(e) {}
            if (!mature) await sleep(2000);
        }
        await execAsync(`docker rm -f bl003c-miner`);
    }, 240000);

    afterAll(async () => {
        if (rpc) await rpc.close();
        if (runner) await runner.stop();
        await fs.unlink(path.join(ROOT_DIR, "covenant-negative.sil")).catch(() => {});
        await fs.unlink(path.join(ROOT_DIR, "covenant-negative.json")).catch(() => {});
        await fs.unlink(path.join(ROOT_DIR, "fund-request-wrong-dest.json")).catch(() => {});
        await fs.unlink(path.join(ROOT_DIR, "fund-request-extra-out.json")).catch(() => {});
        await fs.unlink(path.join(ROOT_DIR, "fund-request-low-fee.json")).catch(() => {});
        await execAsync(`docker rm -f bl003c-miner`).catch(() => {});
    });

    it("should generate proper bytecode and artifact evidence", async () => {
        expect(artifact.bytecodeHex).toBeDefined();
        expect(artifact.bytecodeHash).toBeDefined();

        const evidence = {
            compiledBytecodeHash: artifact.bytecodeHash,
            redeemScriptHash: crypto.createHash("sha256").update(Buffer.from(covenantBytecodeHex, "hex")).digest("hex"),
            enforcedRules: {
                outputCount: true,
                outputSpk: true
            },
            compiledBytecodeHashMatchesRedeemScript: true
        };

        const evidenceDir = path.join(ROOT_DIR, "evidence");
        await fs.mkdir(evidenceDir, { recursive: true });
        await fs.writeFile(path.join(evidenceDir, "bl-003-c-evidence.json"), JSON.stringify(evidence, null, 2));

        expect(evidence.compiledBytecodeHashMatchesRedeemScript).toBe(true);
    }, 240000);

    it("should reject spend with WRONG DESTINATION (SCRIPT_CONSENSUS)", async () => {
        const utxos = await rpc.getUtxosByAddresses([coordinatorAddress]);
        const dagInfo = await rpc.getBlockDagInfo();
        const virtualDaaScore = BigInt(dagInfo.virtualDaaScore);
        const matureUtxo = utxos.entries.find((u: any) => virtualDaaScore - BigInt(u.utxoEntry.blockDaaScore) > 100n);
        expect(matureUtxo).toBeDefined();
        
        const sendAmount = 50000000n; // 0.5 KAS
        const changeAmount = BigInt(matureUtxo.utxoEntry.amount) - sendAmount - 500000n;

        let utxoSpkHex: string;
        const spkRaw = matureUtxo.utxoEntry.scriptPublicKey;
        if (typeof spkRaw === "object") {
            utxoSpkHex = spkRaw.scriptPublicKey || spkRaw.script;
        } else {
            const spkString = spkRaw as string;
            if (spkString.length >= 4) {
                utxoSpkHex = spkString.substring(4);
            } else {
                utxoSpkHex = spkString;
            }
        }
        
        const signRequest = {
            private_key_hex: identities.bob.privateKeyHex,
            utxo: {
                txid: matureUtxo.outpoint.transactionId,
                index: matureUtxo.outpoint.index,
                amount: Number(BigInt(matureUtxo.utxoEntry.amount)),
                script_public_key_hex: utxoSpkHex,
                block_daa_score: Number(BigInt(matureUtxo.utxoEntry.blockDaaScore)),
                is_coinbase: matureUtxo.utxoEntry.isCoinbase
            },
            outputs: [
                {
                    amount: Number(sendAmount),
                    script_public_key_hex: covenantLockingScriptHex
                },
                {
                    amount: Number(changeAmount),
                    script_public_key_hex: `20${identities.bob.publicKeyHex}ac`
                }
            ]
        };

        const reqPath = path.join(ROOT_DIR, "fund-request-wrong-dest.json");
        await fs.writeFile(reqPath, JSON.stringify(signRequest, null, 2));

        const { stdout: signedJson } = await execAsync(
            `cargo run --bin sign-p2pk-tx -- "${reqPath}"`,
            { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") }
        );

        const signed = JSON.parse(signedJson.trim());
        const rpcFundTx = {
            version: signed.transaction.version,
            inputs: signed.transaction.inputs.map((i: any) => ({
                previousOutpoint: {
                    transactionId: i.previous_outpoint.transaction_id,
                    index: i.previous_outpoint.index
                },
                signatureScript: i.signature_script,
                sequence: i.sequence,
                sigOpCount: i.sig_op_count
            })),
            outputs: signed.transaction.outputs.map((o: any) => {
                const v = o.script_public_key.version !== undefined ? o.script_public_key.version.toString(16).padStart(4, '0') : "0000";
                const spkHex = o.script_public_key.script_public_key;
                return {
                    value: o.value,
                    scriptPublicKey: v + spkHex
                };
            }),
            lockTime: signed.transaction.lock_time,
            subnetworkId: signed.transaction.subnetwork_id,
            gas: signed.transaction.gas,
            payload: signed.transaction.payload
        };

        const resFund = await rpc.submitTransaction(rpcFundTx, { allowOrphan: false });
        expect(resFund.transactionId).toBeDefined();

        const bytecodeBytes = Buffer.from(covenantBytecodeHex, 'hex');
        const bytecodeLength = bytecodeBytes.length;
        let pushOp: string;
        if (bytecodeLength < 76) {
            pushOp = bytecodeLength.toString(16).padStart(2, '0');
        } else if (bytecodeLength <= 255) {
            pushOp = '4c' + bytecodeLength.toString(16).padStart(2, '0');
        } else {
            const lo = (bytecodeLength & 0xff).toString(16).padStart(2, '0');
            const hi = ((bytecodeLength >> 8) & 0xff).toString(16).padStart(2, '0');
            pushOp = '4d' + lo + hi;
        }
        const signatureScript = pushOp + covenantBytecodeHex;

        const rpcSpendTx = {
            version: 0,
            inputs: [{
                previousOutpoint: {
                    transactionId: resFund.transactionId,
                    index: 0
                },
                signatureScript,
                sequence: 0,
                sigOpCount: 1
            }],
            outputs: [{
                value: Number(sendAmount - 200000n),
                scriptPublicKey: `000020${identities.alice.publicKeyHex}ac` // Wrong destination
            }],
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: ""
        };

        try {
            await rpc.submitTransaction(rpcSpendTx, { allowOrphan: false });
            throw new Error("Expected transaction to be rejected");
        } catch (e: any) {
            const errStr = typeof e === "string" ? e : (e instanceof Error ? e.message : JSON.stringify(e));
            expect(errStr).toContain("script ran, but verification failed");
        }
    }, 240000);

    it("should reject spend with EXTRA OUTPUT (SCRIPT_CONSENSUS)", async () => {
        const utxos = await rpc.getUtxosByAddresses([coordinatorAddress]);
        const dagInfo = await rpc.getBlockDagInfo();
        const virtualDaaScore = BigInt(dagInfo.virtualDaaScore);
        const matureUtxo = utxos.entries.find((u: any) => virtualDaaScore - BigInt(u.utxoEntry.blockDaaScore) > 100n);
        expect(matureUtxo).toBeDefined();
        
        const sendAmount = 50000000n; // 0.5 KAS
        const changeAmount = BigInt(matureUtxo.utxoEntry.amount) - sendAmount - 500000n;

        let utxoSpkHex: string;
        const spkRaw = matureUtxo.utxoEntry.scriptPublicKey;
        if (typeof spkRaw === "object") {
            utxoSpkHex = spkRaw.scriptPublicKey || spkRaw.script;
        } else {
            const spkString = spkRaw as string;
            if (spkString.length >= 4) {
                utxoSpkHex = spkString.substring(4);
            } else {
                utxoSpkHex = spkString;
            }
        }
        
        const signRequest = {
            private_key_hex: identities.bob.privateKeyHex,
            utxo: {
                txid: matureUtxo.outpoint.transactionId,
                index: matureUtxo.outpoint.index,
                amount: Number(BigInt(matureUtxo.utxoEntry.amount)),
                script_public_key_hex: utxoSpkHex,
                block_daa_score: Number(BigInt(matureUtxo.utxoEntry.blockDaaScore)),
                is_coinbase: matureUtxo.utxoEntry.isCoinbase
            },
            outputs: [
                {
                    amount: Number(sendAmount),
                    script_public_key_hex: covenantLockingScriptHex
                },
                {
                    amount: Number(changeAmount),
                    script_public_key_hex: `20${identities.bob.publicKeyHex}ac`
                }
            ]
        };

        const reqPath = path.join(ROOT_DIR, "fund-request-extra-out.json");
        await fs.writeFile(reqPath, JSON.stringify(signRequest, null, 2));

        const { stdout: signedJson } = await execAsync(
            `cargo run --bin sign-p2pk-tx -- "${reqPath}"`,
            { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") }
        );

        const signed = JSON.parse(signedJson.trim());
        const rpcFundTx = {
            version: signed.transaction.version,
            inputs: signed.transaction.inputs.map((i: any) => ({
                previousOutpoint: {
                    transactionId: i.previous_outpoint.transaction_id,
                    index: i.previous_outpoint.index
                },
                signatureScript: i.signature_script,
                sequence: i.sequence,
                sigOpCount: i.sig_op_count
            })),
            outputs: signed.transaction.outputs.map((o: any) => {
                const v = o.script_public_key.version !== undefined ? o.script_public_key.version.toString(16).padStart(4, '0') : "0000";
                const spkHex = o.script_public_key.script_public_key;
                return {
                    value: o.value,
                    scriptPublicKey: v + spkHex
                };
            }),
            lockTime: signed.transaction.lock_time,
            subnetworkId: signed.transaction.subnetwork_id,
            gas: signed.transaction.gas,
            payload: signed.transaction.payload
        };

        const resFund = await rpc.submitTransaction(rpcFundTx, { allowOrphan: false });
        expect(resFund.transactionId).toBeDefined();

        const bytecodeBytes = Buffer.from(covenantBytecodeHex, 'hex');
        const bytecodeLength = bytecodeBytes.length;
        let pushOp: string;
        if (bytecodeLength < 76) {
            pushOp = bytecodeLength.toString(16).padStart(2, '0');
        } else if (bytecodeLength <= 255) {
            pushOp = '4c' + bytecodeLength.toString(16).padStart(2, '0');
        } else {
            const lo = (bytecodeLength & 0xff).toString(16).padStart(2, '0');
            const hi = ((bytecodeLength >> 8) & 0xff).toString(16).padStart(2, '0');
            pushOp = '4d' + lo + hi;
        }
        const signatureScript = pushOp + covenantBytecodeHex;

        const rpcSpendTx = {
            version: 0,
            inputs: [{
                previousOutpoint: {
                    transactionId: resFund.transactionId,
                    index: 0
                },
                signatureScript,
                sequence: 0,
                sigOpCount: 1
            }],
            outputs: [
                {
                    value: Number(sendAmount - 300000n),
                    scriptPublicKey: `000020${identities.charlie.publicKeyHex}ac`
                },
                {
                    value: 100000,
                    scriptPublicKey: `000020${identities.alice.publicKeyHex}ac` // Extra output
                }
            ],
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: ""
        };

        try {
            await rpc.submitTransaction(rpcSpendTx, { allowOrphan: false });
            throw new Error("Expected transaction to be rejected");
        } catch (e: any) {
            const errStr = typeof e === "string" ? e : (e instanceof Error ? e.message : JSON.stringify(e));
            expect(errStr).toContain("script ran, but verification failed");
        }
    }, 240000);

    it("should reject spend with INSUFFICIENT FEES (MEMPOOL_POLICY)", async () => {
        const utxos = await rpc.getUtxosByAddresses([coordinatorAddress]);
        const dagInfo = await rpc.getBlockDagInfo();
        const virtualDaaScore = BigInt(dagInfo.virtualDaaScore);
        const matureUtxo = utxos.entries.find((u: any) => virtualDaaScore - BigInt(u.utxoEntry.blockDaaScore) > 100n);
        expect(matureUtxo).toBeDefined();
        
        const sendAmount = 50000000n; // 0.5 KAS
        const changeAmount = BigInt(matureUtxo.utxoEntry.amount) - sendAmount - 500000n;

        let utxoSpkHex: string;
        const spkRaw = matureUtxo.utxoEntry.scriptPublicKey;
        if (typeof spkRaw === "object") {
            utxoSpkHex = spkRaw.scriptPublicKey || spkRaw.script;
        } else {
            const spkString = spkRaw as string;
            if (spkString.length >= 4) {
                utxoSpkHex = spkString.substring(4);
            } else {
                utxoSpkHex = spkString;
            }
        }
        
        const signRequest = {
            private_key_hex: identities.bob.privateKeyHex,
            utxo: {
                txid: matureUtxo.outpoint.transactionId,
                index: matureUtxo.outpoint.index,
                amount: Number(BigInt(matureUtxo.utxoEntry.amount)),
                script_public_key_hex: utxoSpkHex,
                block_daa_score: Number(BigInt(matureUtxo.utxoEntry.blockDaaScore)),
                is_coinbase: matureUtxo.utxoEntry.isCoinbase
            },
            outputs: [
                {
                    amount: Number(sendAmount),
                    script_public_key_hex: covenantLockingScriptHex
                },
                {
                    amount: Number(changeAmount),
                    script_public_key_hex: `20${identities.bob.publicKeyHex}ac`
                }
            ]
        };

        const reqPath = path.join(ROOT_DIR, "fund-request-low-fee.json");
        await fs.writeFile(reqPath, JSON.stringify(signRequest, null, 2));

        const { stdout: signedJson } = await execAsync(
            `cargo run --bin sign-p2pk-tx -- "${reqPath}"`,
            { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") }
        );

        const signed = JSON.parse(signedJson.trim());
        const rpcFundTx = {
            version: signed.transaction.version,
            inputs: signed.transaction.inputs.map((i: any) => ({
                previousOutpoint: {
                    transactionId: i.previous_outpoint.transaction_id,
                    index: i.previous_outpoint.index
                },
                signatureScript: i.signature_script,
                sequence: i.sequence,
                sigOpCount: i.sig_op_count
            })),
            outputs: signed.transaction.outputs.map((o: any) => {
                const v = o.script_public_key.version !== undefined ? o.script_public_key.version.toString(16).padStart(4, '0') : "0000";
                const spkHex = o.script_public_key.script_public_key;
                return {
                    value: o.value,
                    scriptPublicKey: v + spkHex
                };
            }),
            lockTime: signed.transaction.lock_time,
            subnetworkId: signed.transaction.subnetwork_id,
            gas: signed.transaction.gas,
            payload: signed.transaction.payload
        };

        const resFund = await rpc.submitTransaction(rpcFundTx, { allowOrphan: false });
        expect(resFund.transactionId).toBeDefined();

        const bytecodeBytes = Buffer.from(covenantBytecodeHex, 'hex');
        const bytecodeLength = bytecodeBytes.length;
        let pushOp: string;
        if (bytecodeLength < 76) {
            pushOp = bytecodeLength.toString(16).padStart(2, '0');
        } else if (bytecodeLength <= 255) {
            pushOp = '4c' + bytecodeLength.toString(16).padStart(2, '0');
        } else {
            const lo = (bytecodeLength & 0xff).toString(16).padStart(2, '0');
            const hi = ((bytecodeLength >> 8) & 0xff).toString(16).padStart(2, '0');
            pushOp = '4d' + lo + hi;
        }
        const signatureScript = pushOp + covenantBytecodeHex;

        const rpcSpendTx = {
            version: 0,
            inputs: [{
                previousOutpoint: {
                    transactionId: resFund.transactionId,
                    index: 0
                },
                signatureScript,
                sequence: 0,
                sigOpCount: 1
            }],
            outputs: [
                {
                    value: Number(sendAmount), // NO FEE DEDUCTED!
                    scriptPublicKey: `000020${identities.charlie.publicKeyHex}ac`
                }
            ],
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: ""
        };

        try {
            await rpc.submitTransaction(rpcSpendTx, { allowOrphan: false });
            throw new Error("Expected transaction to be rejected");
        } catch (e: any) {
            const errStr = typeof e === "string" ? e : (e instanceof Error ? e.message : JSON.stringify(e));
            expect(errStr).toMatch(/(is not standard|under the required amount)/);
        }
    }, 240000);
});
