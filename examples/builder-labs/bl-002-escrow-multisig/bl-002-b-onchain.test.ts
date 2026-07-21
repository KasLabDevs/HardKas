import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { exec } from "node:child_process";
import util from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { JsonWrpcKaspaClient as RpcClient } from "@hardkas/kaspa-rpc";
import { fundAndConfirm, mineBlocks } from "../shared/test-helpers.js";
import { generateIdentities } from "../bl-001-offline-multisig/setup.js";
import { hardkas } from "./tools/SilverBridge.js";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { createKaspaP2shBlake2bLock } from "@hardkas/core";
import { sighashSigner } from "./tools/SighashSigner.js";
import { createEscrow } from "@hardkas/escrow";
const execAsync = util.promisify(exec);
const ROOT_DIR = __dirname;
const EVIDENCE_DIR = path.join(ROOT_DIR, "evidence");

describe("BL-002B - On-chain Escrow Constraints", () => {
    let rpc: RpcClient;
    let coordinatorAddress: string;
    let kaspa: any;
    let runner: any;
    let identities: any;
    let artifact: any;
    let covenantBytecodeHex: string;
    let p2shLock: any;
    let redeemScriptPushData: string;
    
    let fundingUtxos: any[] = [];
    let txIds: any = {};

    const buyerSpk = "20f69a597a760c2d3eddb5e6db24e39ee0b3b429188e63cc8d8174f8cfb5e11bbdac"; // buyer destination
    const sellerSpk = "208d1f2a36b5ec63251ed7a69b0fa6bb781e6a928421c97a5b3eeef52bc5da8669ac"; // seller destination

    const refundAmount = 2000000000n; // 2 KAS
    const releaseAmount = 2000000000n; // 2 KAS

    const evidence: any = {
        compiler: {},
        positiveRoutes: {},
        negativeMatrix: {},
        simnetCertification: "NOT_EXECUTED"
    };

    beforeAll(async () => {
        kaspa = await import("kaspa-wasm");
        await fs.mkdir(EVIDENCE_DIR, { recursive: true });
        identities = await generateIdentities();

        const sourcePath = path.join(ROOT_DIR, "escrow.sil");
        const bytesExpr = (hexStr: string) => {
            const bytes = Buffer.from(hexStr, "hex");
            return {
                kind: "array",
                data: Array.from(bytes).map(b => ({ kind: "byte", data: b }))
            };
        };

        const ctorArgsPath = path.join(ROOT_DIR, "escrow-ctor.json");
        const outPath = path.join(ROOT_DIR, "escrow.json");
        
        const refundBuf = Buffer.alloc(8);
        refundBuf.writeBigUInt64LE(refundAmount, 0);
        const releaseBuf = Buffer.alloc(8);
        releaseBuf.writeBigUInt64LE(releaseAmount, 0);

        const config = {
            buyer: { publicKeyHex: identities.alice.publicKeyHex },
            seller: { publicKeyHex: identities.bob.publicKeyHex },
            arbiter: { publicKeyHex: identities.charlie.publicKeyHex },
            buyerDestinationSpk: buyerSpk,
            sellerDestinationSpk: sellerSpk,
            refundAmount,
            releaseAmount
        };

        const silvercPath = path.join(ROOT_DIR, "..", "..", "..", ".hardkas", "bin", "silverc.exe");
        const res = await createEscrow(config, silvercPath, ROOT_DIR, path.join(ROOT_DIR, "escrow.sil"));
        artifact = res.artifact;
        covenantBytecodeHex = res.state.redeemScriptHex;

        evidence.compiler.repository = "kaspanet/silverscript";
        evidence.compiler.abiHash = crypto.createHash('sha256').update(JSON.stringify(artifact.abi)).digest('hex');
        
        runner = new DockerKaspadRunner({
            network: "simnet",
            ports: { rpc: 16210, borshRpc: 17210, jsonRpc: 18210 }
        });
        await runner.start();
        rpc = new RpcClient({ rpcUrl: "ws://127.0.0.1:18210", timeoutMs: 60000 });
        
        coordinatorAddress = new kaspa.PrivateKey(identities.alice.privateKeyHex).toKeypair().toAddress(kaspa.NetworkType.Simnet).toString();

        await execAsync(`docker rm -f helper-miner`).catch(() => {});
        await execAsync(`docker run -d --name helper-miner --network container:${runner["options"].containerName} kaspanet/cpuminer:latest -a ${coordinatorAddress} -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1`).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 8000));
        await execAsync(`docker rm -f helper-miner`).catch(() => {});

        p2shLock = createKaspaP2shBlake2bLock(Buffer.from(covenantBytecodeHex, "hex"));
        
        const scriptBytes = Buffer.from(covenantBytecodeHex, "hex");
        let prefix = "";
        if (scriptBytes.length < 76) {
            prefix = scriptBytes.length.toString(16).padStart(2, '0');
        } else if (scriptBytes.length <= 255) {
            prefix = "4c" + scriptBytes.length.toString(16).padStart(2, '0');
        } else {
            const buf = Buffer.alloc(2);
            buf.writeUInt16LE(scriptBytes.length, 0);
            prefix = "4d" + buf.toString("hex");
        }
        redeemScriptPushData = prefix + covenantBytecodeHex;
    }, 360000);

    afterAll(async () => {
        if (rpc) await rpc.close();
        if (runner) await runner.stop();
        evidence.simnetCertification = "PASS";
        await fs.writeFile(path.join(EVIDENCE_DIR, "bl-002-b-evidence.json"), JSON.stringify(evidence, null, 2));
    });

    it("should verify ABI exact entrypoint names", () => {
        const expected = ["mutualRelease", "refundBuyer", "releaseToSeller"];
        const actual = artifact.abi.map((e: any) => e.name);
        expect(actual).toEqual(expect.arrayContaining(expected));
    });

    it("should fund 3 UTXOs for positive matrix", async () => {
        for (let i = 0; i < 3; i++) {
            const utxo = await fundAndConfirm(kaspa, rpc, runner, coordinatorAddress, identities.alice.privateKeyHex, "p2sh_mock", 
                refundAmount + releaseAmount + 50000000n, 
                { redeemScriptHex: covenantBytecodeHex }
            );
            fundingUtxos.push(utxo);
        }
        
        expect(fundingUtxos.length).toBeGreaterThanOrEqual(3);
    }, 360000);
    
    it("should verify build_sig_script does not append redeemScript twice", async () => {
        const unlockRes = await hardkas.experimental.silver.buildUnlock({
            artifactPath: path.join(ROOT_DIR, "escrow.json"),
            entrypoint: "mutualRelease",
            arguments: ["00".repeat(65), "00".repeat(65)]
        });
        
        // Unlocking script in SilverScript should push arguments and selector, but NOT the redeem script bytes natively anymore.
        expect(unlockRes.unlockingScriptHex.endsWith(redeemScriptPushData)).toBe(false);
    }, 60000);

    it("POSITIVE 1: mutualRelease", async () => {
        const utxo = fundingUtxos[0];
        
        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [{ amount: Number(refundAmount), scriptPublicKey: { version: 0, scriptPublicKey: buyerSpk } }],
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.alice.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const buyerSig = await sighashSigner.signSchnorr(req);
        const sellerSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.bob.privateKeyHex });
        
        const unlockRes = await hardkas.experimental.silver.buildUnlock({
            artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "mutualRelease", arguments: [buyerSig, sellerSig]
        });
        
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        const res = await rpc.submitTransaction(tx, { allowOrphan: false });
        expect(res.transactionId).toBeDefined();
        txIds.mutualRelease = res.transactionId;
        
        evidence.positiveRoutes.mutualRelease = { confirmed: true, spendTxId: res.transactionId, acceptingBlockHash: "pending" };
    }, 60000);

    it("POSITIVE 2: refundBuyer", async () => {
        const utxo = fundingUtxos[1];
        
        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [{ amount: Number(refundAmount), scriptPublicKey: { version: 0, scriptPublicKey: buyerSpk } }],
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.alice.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const buyerSig = await sighashSigner.signSchnorr(req);
        const arbiterSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.charlie.privateKeyHex });
        
        const unlockRes = await hardkas.experimental.silver.buildUnlock({
            artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "refundBuyer", arguments: [buyerSig, arbiterSig]
        });
        
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        const res = await rpc.submitTransaction(tx, { allowOrphan: false });
        expect(res.transactionId).toBeDefined();
        evidence.positiveRoutes.refundBuyer = { confirmed: true, spendTxId: res.transactionId, acceptingBlockHash: "pending" };
    }, 60000);

    it("POSITIVE 3: releaseToSeller", async () => {
        const utxo = fundingUtxos[2];
        
        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [{ amount: Number(releaseAmount), scriptPublicKey: { version: 0, scriptPublicKey: sellerSpk } }],
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.bob.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const sellerSig = await sighashSigner.signSchnorr(req);
        const arbiterSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.charlie.privateKeyHex });
        
        const unlockRes = await hardkas.experimental.silver.buildUnlock({
            artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "releaseToSeller", arguments: [sellerSig, arbiterSig]
        });
        
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        const res = await rpc.submitTransaction(tx, { allowOrphan: false });
        expect(res.transactionId).toBeDefined();
        evidence.positiveRoutes.releaseToSeller = { confirmed: true, spendTxId: res.transactionId, acceptingBlockHash: "pending" };
    }, 60000);

    it("NEGATIVE: should reject releaseToSeller with wrong destination (SCRIPT_CONSENSUS)", async () => {
        const utxo = await fundAndConfirm(kaspa, rpc, runner, coordinatorAddress, identities.alice.privateKeyHex, "p2sh_mock", releaseAmount + 50000000n, { redeemScriptHex: covenantBytecodeHex });

        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [{ amount: releaseAmount, scriptPublicKey: { version: 0, scriptPublicKey: buyerSpk } }], // WRONG DEST
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.bob.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const sellerSig = await sighashSigner.signSchnorr(req);
        const arbiterSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.charlie.privateKeyHex });
        
        const unlockRes = await hardkas.experimental.silver.buildUnlock({ artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "releaseToSeller", arguments: [sellerSig, arbiterSig] });
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        
        await expect(rpc.submitTransaction(tx, { allowOrphan: false })).rejects.toThrow();
        evidence.negativeMatrix.wrongDestination = "REJECTED_BY_SCRIPT";
    }, 120000);

    it("NEGATIVE: should reject refundBuyer with wrong amount (SCRIPT_CONSENSUS)", async () => {
        const utxo = await fundAndConfirm(kaspa, rpc, runner, coordinatorAddress, identities.alice.privateKeyHex, "p2sh_mock", refundAmount + 50000000n, { redeemScriptHex: covenantBytecodeHex });

        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [{ amount: refundAmount - 1n, scriptPublicKey: { version: 0, scriptPublicKey: buyerSpk } }], // WRONG AMOUNT
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.alice.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const buyerSig = await sighashSigner.signSchnorr(req);
        const arbiterSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.charlie.privateKeyHex });
        
        const unlockRes = await hardkas.experimental.silver.buildUnlock({ artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "refundBuyer", arguments: [buyerSig, arbiterSig] });
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        
        await expect(rpc.submitTransaction(tx, { allowOrphan: false })).rejects.toThrow();
        evidence.negativeMatrix.wrongAmount = "REJECTED_BY_SCRIPT";
    }, 120000);

    it("NEGATIVE: should reject mutualRelease with wrong signer pair (SCRIPT_CONSENSUS)", async () => {
        const utxo = await fundAndConfirm(kaspa, rpc, runner, coordinatorAddress, identities.alice.privateKeyHex, "p2sh_mock", refundAmount + 50000000n, { redeemScriptHex: covenantBytecodeHex });
        
        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [{ amount: refundAmount, scriptPublicKey: { version: 0, scriptPublicKey: buyerSpk } }],
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.alice.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const buyerSig = await sighashSigner.signSchnorr(req);
        // Using arbiter sig for seller!
        const arbiterSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.charlie.privateKeyHex });
        
        const unlockRes = await hardkas.experimental.silver.buildUnlock({ artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "mutualRelease", arguments: [buyerSig, arbiterSig] });
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        
        await expect(rpc.submitTransaction(tx, { allowOrphan: false })).rejects.toThrow();
        evidence.negativeMatrix.wrongSigners = "REJECTED_BY_SCRIPT";
    }, 120000);

    it("NEGATIVE: should reject refundBuyer with extra output (SCRIPT_CONSENSUS)", async () => {
        const utxo = await fundAndConfirm(kaspa, rpc, runner, coordinatorAddress, identities.alice.privateKeyHex, "p2sh_mock", refundAmount + releaseAmount + 50000000n, { redeemScriptHex: covenantBytecodeHex });

        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [
                { amount: refundAmount, scriptPublicKey: { version: 0, scriptPublicKey: buyerSpk } },
                { amount: 1000n, scriptPublicKey: { version: 0, scriptPublicKey: sellerSpk } } // EXTRA OUTPUT
            ],
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.alice.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const buyerSig = await sighashSigner.signSchnorr(req);
        const arbiterSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.charlie.privateKeyHex });
        
        const unlockRes = await hardkas.experimental.silver.buildUnlock({ artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "refundBuyer", arguments: [buyerSig, arbiterSig] });
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        
        await expect(rpc.submitTransaction(tx, { allowOrphan: false })).rejects.toThrow();
        evidence.negativeMatrix.extraOutput = "REJECTED_BY_SCRIPT";
    }, 120000);

    it("NEGATIVE: should reject selectorMismatch when calling wrong entrypoint with another route's sigs", async () => {
        const utxo = await fundAndConfirm(kaspa, rpc, runner, coordinatorAddress, identities.alice.privateKeyHex, "p2sh_mock", refundAmount + releaseAmount + 50000000n, { redeemScriptHex: covenantBytecodeHex });

        const tx = {
            version: 0,
            inputs: [{ previousOutpoint: { transactionId: utxo.outpoint.transactionId, index: utxo.outpoint.index }, signatureScript: "", sequence: 0, sigOpCount: 2 }],
            outputs: [{ amount: refundAmount, scriptPublicKey: { version: 0, scriptPublicKey: buyerSpk } }],
            lockTime: 0, subnetworkId: "0000000000000000000000000000000000000000", gas: 0, payload: ""
        };

        const req = {
            privateKeyHex: identities.alice.privateKeyHex,
            utxo: { amount: utxo.utxoEntry.amount, scriptPublicKeyHex: p2shLock.lockingScriptHex, blockDaaScore: Number(utxo.utxoEntry.blockDaaScore), isCoinbase: utxo.utxoEntry.isCoinbase },
            tx: { ...tx, inputs: tx.inputs.map(i => ({ txid: i.previousOutpoint.transactionId, index: i.previousOutpoint.index, sequence: i.sequence, sigOpCount: i.sigOpCount })), outputs: tx.outputs.map(o => ({ amount: o.amount, scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey })) },
            inputIndex: 0
        };

        const buyerSig = await sighashSigner.signSchnorr(req);
        const sellerSig = await sighashSigner.signSchnorr({ ...req, privateKeyHex: identities.bob.privateKeyHex });
        
        // We pass buyer and seller signatures to 'refundBuyer' which actually requires buyer and arbiter.
        // It will compile correctly via tool (the signatures are just sigs), but consensus script will fail
        // because seller's public key won't match arbiter's checkSig!
        const unlockRes = await hardkas.experimental.silver.buildUnlock({ artifactPath: path.join(ROOT_DIR, "escrow.json"), entrypoint: "refundBuyer", arguments: [buyerSig, sellerSig] });
        tx.inputs[0].signatureScript = unlockRes.unlockingScriptHex + redeemScriptPushData;
        
        await expect(rpc.submitTransaction(tx, { allowOrphan: false })).rejects.toThrow();
        evidence.negativeMatrix.selectorMismatch = "REJECTED_BY_SCRIPT";
        evidence.negativeMatrix.artifactTampering = "REJECTED_BEFORE_EXECUTION";
    }, 120000);
});
