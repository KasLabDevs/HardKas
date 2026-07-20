import { exec } from "node:child_process";
import util from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execAsync = util.promisify(exec);

export interface CalcSigRequest {
    privateKeyHex: string;
    utxo: {
        amount: bigint | number;
        scriptPublicKeyHex: string;
        blockDaaScore: number;
        isCoinbase: boolean;
    };
    tx: {
        version: number;
        inputs: { txid: string; index: number; sequence: number; sigOpCount?: number }[];
        outputs: { amount: bigint | number; scriptPublicKeyHex: string }[];
        lockTime: number;
        subnetworkId: string;
        gas: number;
        payload: string;
    };
    inputIndex: number;
}

export const sighashSigner = {
    signSchnorr: async (req: CalcSigRequest): Promise<string> => {
        // Map to Rust structure
        const rustReq = {
            private_key_hex: req.privateKeyHex,
            utxo: {
                amount: Number(req.utxo.amount),
                script_public_key_hex: req.utxo.scriptPublicKeyHex,
                block_daa_score: req.utxo.blockDaaScore,
                is_coinbase: req.utxo.isCoinbase
            },
            tx: {
                version: req.tx.version,
                inputs: req.tx.inputs.map(i => ({
                    txid: i.txid,
                    index: i.index,
                    sequence: i.sequence,
                    sig_op_count: i.sigOpCount
                })),
                outputs: req.tx.outputs.map(o => ({
                    amount: Number(o.amount),
                    script_public_key_hex: o.scriptPublicKeyHex
                })),
                lock_time: req.tx.lockTime,
                subnetwork_id: req.tx.subnetworkId,
                gas: req.tx.gas,
                payload: req.tx.payload
            },
            input_index: req.inputIndex
        };

        const rustToolDir = path.join(__dirname, "calc-signature");
        const tmpFile = path.join(rustToolDir, `req-${Date.now()}.json`);
        await fs.writeFile(tmpFile, JSON.stringify(rustReq));

        try {
            const cmd = `cargo run --release --manifest-path ${path.join(rustToolDir, "Cargo.toml")} -- "${tmpFile}"`;
            const { stdout } = await execAsync(cmd);
            const jsonLine = stdout.split('\n').filter(l => l.trim().startsWith('{')).pop();
            if (!jsonLine) throw new Error("Could not parse calc-signature output");
            const res = JSON.parse(jsonLine);
            return res.signature_hex;
        } finally {
            await fs.unlink(tmpFile).catch(() => {});
        }
    }
};
