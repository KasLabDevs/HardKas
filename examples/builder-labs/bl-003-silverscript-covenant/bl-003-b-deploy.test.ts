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
const CLI_BIN = path.join(ROOT_DIR, "../bl-001-offline-multisig/cli.ts");
const NETWORK_ID = "simnet";

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("BL-003B - Covenant Positive Simnet Execution", () => {
    let identities: any;
    let runner: DockerKaspadRunner;
    let rpc: RpcClient;
    let kaspa: any;
    let coordinatorAddress: string;
    let adapter: SilverCompilerAdapter;
    let covenantBytecodeHex: string;
    let covenantLockingScriptHex: string;

    beforeAll(async () => {
        kaspa = await import("kaspa-wasm");
        identities = await generateIdentities();
        adapter = new SilverCompilerAdapter(path.join(ROOT_DIR, "../../../.hardkas/bin/silverc.exe"));

        // 1. Compile the covenant
        // Destination is Charlie
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
        const sourcePath = path.join(ROOT_DIR, "covenant-positive.sil");
        await fs.writeFile(sourcePath, scriptSource);

        const artifact = await adapter.compile({ sourcePath });
        covenantBytecodeHex = artifact.bytecodeHex;

        // 2. Compute P2SH locking script
        const lock = createKaspaP2shBlake2bLock(Buffer.from(covenantBytecodeHex, "hex"));
        covenantLockingScriptHex = lock.lockingScriptHex;

        // 3. Start Simnet
        runner = new DockerKaspadRunner({
            networkId: NETWORK_ID,
            containerName: "hardkas-bl003b-node",
            rpcPort: 18210,
            simnet: true,
            miningEnabled: true,
            overridePorts: {
                rpc: 16210,
                borshRpc: 17210,
                jsonRpc: 18210
            }
        });
        await runner.start();
        
        rpc = new RpcClient({ rpcUrl: "ws://127.0.0.1:18210", timeoutMs: 60000 });
        // auto-connects

        // 4. Start Mining to coordinator (use simple P2PK address, not P2SH)
        coordinatorAddress = new kaspa.PrivateKey(identities.bob.privateKeyHex).toKeypair().toAddress(kaspa.NetworkType.Simnet).toString();
        await execAsync(`docker run -d --name bl003b-miner --network container:${runner["options"].containerName} kaspanet/cpuminer:latest -a ${coordinatorAddress} -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1`).catch(() => {});

        // Wait for UTXOs to mature (100 blocks + 1 block)
        while (true) {
            const utxos = await rpc.getUtxosByAddresses([coordinatorAddress]);
            if (utxos.entries && utxos.entries.length > 0) {
                const dagInfo = await rpc.getBlockDagInfo();
                const virtualDaaScore = BigInt(dagInfo.virtualDaaScore);
                const mature = utxos.entries.find((u: any) => virtualDaaScore - BigInt(u.utxoEntry.blockDaaScore) > 100n);
                if (mature) break;
            }
            await sleep(1000);
        }
        await execAsync(`docker rm -f bl003b-miner`).catch(() => {});
    }, 60000);

    afterAll(async () => {
        if (rpc) await rpc.close();
        await execAsync(`docker rm -f bl003b-miner`).catch(() => {});
        if (runner) await runner.stop().catch(() => {});
    });

    it("should successfully fund and spend the covenant", async () => {
        expect(covenantBytecodeHex).toBeDefined();

        // 1. Fund the covenant using native Rust signer (bypasses kaspa-wasm UtxoEntries bug)
        const utxos = await rpc.getUtxosByAddresses([coordinatorAddress]);
        const dagInfo = await rpc.getBlockDagInfo();
        const virtualDaaScore = BigInt(dagInfo.virtualDaaScore);
        const matureUtxo = utxos.entries.find((u: any) => virtualDaaScore - BigInt(u.utxoEntry.blockDaaScore) > 1000n);
        
        const sendAmount = 50000000n; // 0.5 KAS
        const changeAmount = BigInt(matureUtxo.utxoEntry.amount) - sendAmount - 500000n;

        let utxoSpkHex: string;
        let utxoSpkVersion: number = 0;
        const spkRaw = matureUtxo.utxoEntry.scriptPublicKey;
        if (typeof spkRaw === "object") {
            utxoSpkHex = spkRaw.scriptPublicKey || spkRaw.script;
            utxoSpkVersion = spkRaw.version || 0;
        } else {
            // It's a string, format is version (4 hex chars) + script
            const spkString = spkRaw as string;
            if (spkString.length >= 4) {
                utxoSpkVersion = parseInt(spkString.substring(0, 4), 16);
                utxoSpkHex = spkString.substring(4);
            } else {
                utxoSpkHex = spkString;
            }
        }
        
        console.log("coordinatorAddress:", coordinatorAddress);
        console.log("utxoSpkHex:", utxoSpkHex);

        // Write the sign request JSON for Rust signer
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

        const reqPath = path.join(ROOT_DIR, "fund-request.json");
        await fs.writeFile(reqPath, JSON.stringify(signRequest, null, 2));

        const { stdout: signedJson } = await execAsync(
            `cargo run --bin sign-p2pk-tx -- "${reqPath}"`,
            { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") }
        );

        const signed = JSON.parse(signedJson.trim());
        console.log("Signed fund tx:", signed.transaction_id);
        console.log("Sig script:", signed.transaction.inputs[0].signature_script);

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

        await sleep(2000);

        // 2. Spend the covenant — no signing needed, just push the redeem script
        // Build signatureScript: push the covenant bytecode onto the stack
        const bytecodeBytes = Buffer.from(covenantBytecodeHex, 'hex');
        const bytecodeLength = bytecodeBytes.length;
        let pushOp: string;
        if (bytecodeLength < 76) {
            pushOp = bytecodeLength.toString(16).padStart(2, '0');
        } else if (bytecodeLength <= 255) {
            pushOp = '4c' + bytecodeLength.toString(16).padStart(2, '0'); // OP_PUSHDATA1
        } else {
            const lo = (bytecodeLength & 0xff).toString(16).padStart(2, '0');
            const hi = ((bytecodeLength >> 8) & 0xff).toString(16).padStart(2, '0');
            pushOp = '4d' + lo + hi; // OP_PUSHDATA2
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
                scriptPublicKey: `000020${identities.charlie.publicKeyHex}ac`
            }],
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: ""
        };

        const resSpend = await rpc.submitTransaction(rpcSpendTx, { allowOrphan: false });
        expect(resSpend.transactionId).toBeDefined();

        // 3. Verify it is accepted in virtual chain
        await execAsync('docker rm -f bl003b-miner').catch(() => {});
        await execAsync(`docker run -d --name bl003b-miner --network container:${runner["options"].containerName} kaspanet/cpuminer:latest -a ${coordinatorAddress} -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1`).catch(() => {});
        let accepted = false;
        for (let i = 0; i < 20; i++) {
            await sleep(1000);
            try {
                const vchain = await (rpc as any).call("getVirtualChainFromBlockV2", {
                    startHash: dagInfo.tipHashes[0],
                    includeAcceptedTransactionIds: true
                });
                
                if (vchain && vchain.chainBlockAcceptedTransactions) {
                    for (const entry of vchain.chainBlockAcceptedTransactions) {
                        const txs = entry.acceptedTransactions ?? [];
                        if (txs.some((tx: any) => (tx.transactionId ?? tx.id ?? tx.verboseData?.transactionId) === resSpend.transactionId)) {
                            accepted = true;
                            break;
                        }
                    }
                }
            } catch(e) {}

            if (!accepted) {
                try {
                    const vchain = await (rpc as any).call("getVirtualChainFromBlock", {
                        startHash: dagInfo.tipHashes[0],
                        includeAcceptedTransactionIds: true
                    });
                    if (vchain && vchain.acceptedTransactionIds) {
                        for (const entry of vchain.acceptedTransactionIds) {
                            if (entry.acceptedTransactionIds?.includes(resSpend.transactionId)) {
                                accepted = true;
                                break;
                            }
                        }
                    }
                } catch(e) {}
            }

            if (accepted) break;
        }
        
        expect(accepted).toBe(true);
    }, 30000);
});
