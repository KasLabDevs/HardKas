import { exec } from "node:child_process";
import util from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const execAsync = util.promisify(exec);

export interface SilverCompilerCapabilities {
    compilerAvailable: boolean;
    opcodes: {
        txOutputCount: boolean;
        txOutputSpk: boolean;
        txOutputAmount: boolean;
    };
    artifactFormat: string;
    status: string;
    commitHash: string;
}

export interface SilverCompilationArtifact {
    sourceHash: string;
    compilerCommit: string;
    compilerBinaryHash: string;
    bytecodeHash: string;
    bytecodeHex: string;
    artifactHash: string;
    deterministicRecompile: boolean;
}

export class SilverCompilerAdapter {
    private binaryPath: string;
    private compilerCommit: string = "9aa70b0d0215e7395e2a95b78472eba0a5b103a5"; // Pinned commit

    constructor(binaryPath?: string) {
        this.binaryPath = binaryPath || path.resolve(__dirname, "../../../.hardkas/bin/silverc.exe");
    }

    async probe(): Promise<SilverCompilerCapabilities> {
        let compilerAvailable = false;
        try {
            await fs.access(this.binaryPath);
            compilerAvailable = true;
        } catch {
            return {
                compilerAvailable: false,
                opcodes: { txOutputCount: false, txOutputSpk: false, txOutputAmount: false },
                artifactFormat: "none",
                status: "UNAVAILABLE",
                commitHash: this.compilerCommit
            };
        }

        // We run a small probe compiling a test script with the opcodes
        const opcodes = { txOutputCount: false, txOutputSpk: false, txOutputAmount: false };
        
        const testFeature = async (script: string) => {
            const tmpPath = path.join(__dirname, "probe.sil");
            const fullScript = `
pragma silverscript ^0.1.0;
contract Probe() {
    entrypoint function test() {
        byte[] expectedSpk = 0x00;
        ${script}
    }
}
            `;
            await fs.writeFile(tmpPath, fullScript);
            try {
                // The CLI outputs a JSON artifact. By default to <filename>.json
                await execAsync(`"${this.binaryPath}" ${tmpPath}`);
                return true;
            } catch (e: any) {
                console.error("Compile probe error:", e.stdout, e.stderr);
                return false;
            } finally {
                await fs.unlink(tmpPath).catch(() => {});
                await fs.unlink(path.join(__dirname, "probe.json")).catch(() => {});
            }
        };

        opcodes.txOutputCount = await testFeature("require(tx.outputs.length >= 0);");
        opcodes.txOutputSpk = await testFeature("require(tx.outputs[0].scriptPubKey != expectedSpk);");
        opcodes.txOutputAmount = await testFeature("require(tx.outputs[0].value >= 0);");

        const anySupported = opcodes.txOutputCount || opcodes.txOutputSpk || opcodes.txOutputAmount;
        
        return {
            compilerAvailable: true,
            opcodes,
            artifactFormat: "hex-string",
            status: anySupported ? "AVAILABLE_EXPERIMENTAL" : "BLOCKED_BY_COMPILER",
            commitHash: this.compilerCommit
        };
    }

    async compile(input: { sourcePath: string; constructorArguments?: readonly any[] }): Promise<SilverCompilationArtifact> {
        const sourceCode = await fs.readFile(input.sourcePath, "utf-8");
        const sourceHash = crypto.createHash("sha256").update(sourceCode).digest("hex");
        
        const binaryBuffer = await fs.readFile(this.binaryPath);
        const compilerBinaryHash = crypto.createHash("sha256").update(binaryBuffer).digest("hex");

        let argsArg = "";
        const tmpArgsPath = input.sourcePath.replace(/\.sil$/, "_args.json");
        if (input.constructorArguments && input.constructorArguments.length > 0) {
            await fs.writeFile(tmpArgsPath, JSON.stringify(input.constructorArguments));
            argsArg = `--constructor-args ${tmpArgsPath}`;
        }

        try {
            await execAsync(`"${this.binaryPath}" ${argsArg} ${input.sourcePath}`);
            
            const outJsonPath = input.sourcePath.replace(/\.sil$/, ".json");
            const outJsonRaw = await fs.readFile(outJsonPath, "utf-8");
            const outJson = JSON.parse(outJsonRaw);
            
            // script is an array of bytes
            const bytecodeHex = Buffer.from(outJson.script).toString("hex");
            const bytecodeHash = crypto.createHash("sha256").update(Buffer.from(bytecodeHex, "hex")).digest("hex");

            // Verify deterministic recompile
            await execAsync(`"${this.binaryPath}" ${argsArg} ${input.sourcePath}`);
            const outJsonRaw2 = await fs.readFile(outJsonPath, "utf-8");
            const outJson2 = JSON.parse(outJsonRaw2);
            const bytecodeHex2 = Buffer.from(outJson2.script).toString("hex");
            const deterministicRecompile = (bytecodeHex === bytecodeHex2);

            const artifactHash = crypto.createHash("sha256").update(sourceHash + bytecodeHash + this.compilerCommit).digest("hex");

            return {
                sourceHash,
                compilerCommit: this.compilerCommit,
                compilerBinaryHash,
                bytecodeHash,
                bytecodeHex,
                artifactHash,
                deterministicRecompile
            };
        } finally {
            if (argsArg !== "") {
                await fs.unlink(tmpArgsPath).catch(() => {});
            }
        }
    }
}
