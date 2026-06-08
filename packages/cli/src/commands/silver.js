import pc from "picocolors";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { SilverCompilerOutputAdapter } from "./silver-adapter.js";
const DEFAULT_NETWORK = "testnet-12";
function getCompilerPath() {
    const localBin = path.resolve(process.cwd(), ".hardkas/bin/silverc.exe");
    const localBinLinux = path.resolve(process.cwd(), ".hardkas/bin/silverc");
    if (fs.existsSync(localBin))
        return localBin;
    if (fs.existsSync(localBinLinux))
        return localBinLinux;
    return "silverc"; // fallback to PATH
}
export function registerSilverCommand(program) {
    const silverCmd = program
        .command("silver")
        .description("SilverScript readiness track (CashScript-inspired covenant programming)");
    silverCmd
        .command("doctor")
        .description("Diagnose if the local environment can work with SilverScript")
        .action(() => {
        console.log(pc.bold("\nSilverScript Diagnostic\n"));
        let compilerVersion = "Unknown";
        try {
            const compilerCmd = getCompilerPath();
            const output = execSync(`"${compilerCmd}" --version`, { stdio: "pipe" }).toString().trim();
            compilerVersion = output;
            console.log(`  ${pc.green("✅")} Compiler: ${pc.bold("Available")} (${compilerVersion})`);
        }
        catch (err) {
            console.log(`  ${pc.red("❌")} Compiler: ${pc.red("SILVERSCRIPT_COMPILER_UNAVAILABLE")}`);
            console.log(pc.dim("     (Could not find 'silverscript' binary in $PATH)\n"));
        }
        // Check node network support. Assuming we rely on configuration or node status.
        // For now, hardcode the check logic to look for testnet-12 support.
        try {
            const nodeInfo = execSync("npx hardkas node status --json", { stdio: "pipe" }).toString();
            const info = JSON.parse(nodeInfo);
            if (info.network === DEFAULT_NETWORK || info.network === "toccata") {
                console.log(`  ${pc.green("✅")} Network: ${pc.bold("Supported")} (${info.network})`);
            }
            else {
                console.log(`  ${pc.yellow("⚠️")} Network: ${pc.yellow("SILVERSCRIPT_NETWORK_UNSUPPORTED")} (Requires ${DEFAULT_NETWORK})`);
            }
        }
        catch (err) {
            console.log(`  ${pc.yellow("⚠️")} Network: ${pc.yellow("SILVERSCRIPT_NODE_CAPABILITY_UNKNOWN")}`);
            console.log(pc.dim("     (Could not determine Kaspa node network capabilities)\n"));
        }
        console.log("");
    });
    silverCmd
        .command("compile <file>")
        .description("Compile a SilverScript source file (.sil or .silver)")
        .option("--network <network>", "Target network", DEFAULT_NETWORK)
        .action(async (file, opts) => {
        if (!file.endsWith(".sil") && !file.endsWith(".silver")) {
            console.log(pc.yellow(`Warning: Standard SilverScript extension is .sil. You provided: ${file}`));
        }
        if (opts.network !== DEFAULT_NETWORK && opts.network !== "testnet-12") {
            console.error(pc.red(`Error: SILVERSCRIPT_NETWORK_UNSUPPORTED. The official compiler currently only supports ${DEFAULT_NETWORK}.`));
            process.exit(1);
        }
        if (!fs.existsSync(file)) {
            console.error(pc.red(`Error: Source file not found: ${file}`));
            process.exit(1);
        }
        const sourceContent = fs.readFileSync(file, "utf8");
        const sourceHash = createHash("sha256").update(sourceContent).digest("hex");
        let compilerOutput = "";
        let compilerVersion = "unknown";
        const compilerCmd = getCompilerPath();
        try {
            compilerVersion = execSync(`"${compilerCmd}" --version`, { stdio: "pipe" }).toString().trim();
        }
        catch (err) {
            console.error(pc.red(`Error: SILVERSCRIPT_COMPILER_UNAVAILABLE.`));
            console.error(pc.dim(`Please install the silverscript compiler to build ${file}.`));
            process.exit(1);
        }
        try {
            compilerOutput = execSync(`"${compilerCmd}" "${file}" -c`, { stdio: "pipe" }).toString();
        }
        catch (err) {
            console.error(pc.red(`Compiler Error:`));
            console.error(err.stdout?.toString() || err.message);
            process.exit(1);
        }
        const adapter = SilverCompilerOutputAdapter.normalize(compilerOutput);
        const { writeArtifact, HARDKAS_VERSION } = await import("@hardkas/artifacts");
        const artifact = {
            schema: "hardkas.silver.compile",
            hardkasVersion: HARDKAS_VERSION,
            version: "1.0.0-alpha",
            networkId: opts.network,
            mode: "simulated",
            createdAt: new Date().toISOString(),
            sourcePath: path.resolve(file),
            sourceHash,
            compilerName: "silverc",
            compilerVersion,
            compilerCommand: `silverc "${file}" -c`,
            compiledScriptHex: adapter.normalized.scriptHex,
            compiledScriptHash: adapter.normalized.scriptHash,
            abi: adapter.normalized.abi,
            network: opts.network,
            assumptions: ["compiler-trusted", "tn12-only"]
        };
        const artifactPath = path.resolve(process.cwd(), `silver-${sourceHash.substring(0, 8)}.json`);
        await writeArtifact(artifactPath, artifact);
        console.log(pc.green(`✅ Compiled successfully!`));
        console.log(`Artifact generated: ${pc.bold(artifactPath)}`);
    });
    silverCmd
        .command("inspect <artifact_path>")
        .description("Inspect a SilverScript compiled artifact")
        .action(async (artifactPath) => {
        const content = fs.readFileSync(artifactPath, "utf8");
        const artifact = JSON.parse(content);
        if (artifact.schema !== "hardkas.silver.compile") {
            console.error(pc.red(`Error: Expected schema hardkas.silver.compile, got ${artifact.schema}`));
            process.exit(1);
        }
        console.log(pc.bold("\nSilverScript Artifact Inspector"));
        console.log(`  Source Path:   ${artifact.sourcePath}`);
        console.log(`  Source Hash:   ${pc.cyan(artifact.sourceHash)}`);
        console.log(`  Compiled Hash: ${pc.cyan(artifact.compiledScriptHash || "Unknown")}`);
        console.log(`  Compiler:      ${artifact.compilerName} ${artifact.compilerVersion}`);
        console.log(`  Network:       ${artifact.network}`);
        if (artifact.compiledScriptHex) {
            const size = Buffer.from(artifact.compiledScriptHex, 'hex').length;
            console.log(`  Script Size:   ${size} bytes`);
        }
        if (artifact.assumptions && artifact.assumptions.length > 0) {
            console.log(`  Assumptions:   ${artifact.assumptions.join(", ")}`);
        }
        console.log("");
    });
    silverCmd
        .command("verify <artifact_path>")
        .description("Verify the deterministic hashes and metadata of a SilverScript artifact")
        .action(async (artifactPath) => {
        const { verifyArtifactIntegritySync } = await import("@hardkas/artifacts");
        try {
            const result = verifyArtifactIntegritySync(artifactPath, { strict: true });
            if (!result.ok) {
                console.error(pc.red(`❌ Verification failed for ${artifactPath}`));
                result.errors.forEach(e => console.error(pc.dim(` - ${e}`)));
                process.exit(1);
            }
            console.log(pc.green(`✅ SilverScript Artifact Verified: ${artifactPath}`));
        }
        catch (err) {
            console.error(pc.red(`❌ Verification failed for ${artifactPath}`));
            console.error(pc.dim(err.message));
            process.exit(1);
        }
    });
}
//# sourceMappingURL=silver.js.map