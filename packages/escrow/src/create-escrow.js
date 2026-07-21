import { exec } from "node:child_process";
import util from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { createKaspaP2shBlake2bLock } from "@hardkas/core";
const execAsync = util.promisify(exec);
export async function createEscrow(config, silvercPath, workDir, escrowSilPath) {
    const bytesExpr = (hexStr) => {
        const bytes = Buffer.from(hexStr, "hex");
        return {
            kind: "array",
            data: Array.from(bytes).map(b => ({ kind: "byte", data: b }))
        };
    };
    const ctorArgs = [
        bytesExpr(config.buyer.publicKeyHex),
        bytesExpr(config.seller.publicKeyHex),
        bytesExpr(config.arbiter.publicKeyHex),
        bytesExpr("0000" + config.buyerDestinationSpk),
        bytesExpr("0000" + config.sellerDestinationSpk),
        { kind: "int", data: Number(config.refundAmount) },
        { kind: "int", data: Number(config.releaseAmount) }
    ];
    const ctorArgsPath = path.join(workDir, "escrow-ctor.json");
    const outPath = path.join(workDir, "escrow.json");
    await fs.writeFile(ctorArgsPath, JSON.stringify(ctorArgs));
    await execAsync(`"${silvercPath}" "${escrowSilPath}" --constructor-args "${ctorArgsPath}" -o "${outPath}"`);
    const artifactStr = await fs.readFile(outPath, "utf-8");
    const artifact = JSON.parse(artifactStr);
    const covenantBytecodeHex = Buffer.from(artifact.script).toString("hex");
    const p2shLock = createKaspaP2shBlake2bLock(Buffer.from(covenantBytecodeHex, "hex"));
    return {
        artifact,
        state: {
            lockingScriptHex: p2shLock.lockingScriptHex,
            redeemScriptHex: covenantBytecodeHex
        }
    };
}
//# sourceMappingURL=create-escrow.js.map