import { getOutput } from "../output.js";
// @ts-nocheck
import { Command } from "commander";
import pc from "picocolors";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { SilverCompilerOutputAdapter } from "./silver-adapter.js";

const DEFAULT_NETWORK = "simnet";
const SUPPORTED_SILVERSCRIPT_NETWORKS = ["simnet", "testnet-10", "simulated"];

function getCompilerPath(explicitPath?: string) {
  if (explicitPath) return path.resolve(process.cwd(), explicitPath);
  if (process.env.HARDKAS_SILVERC_PATH) {
    return path.resolve(process.cwd(), process.env.HARDKAS_SILVERC_PATH);
  }

  const rootDir = process.cwd().includes("packages")
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();
  const candidates = [
    path.resolve(process.cwd(), ".hardkas/bin/silverc.exe"),
    path.resolve(process.cwd(), ".hardkas/bin/silverc"),
    path.resolve(rootDir, ".hardkas/bin/silverc.exe"),
    path.resolve(rootDir, ".hardkas/bin/silverc")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return "silverc"; // fallback to PATH
}

function checkCompilerReady(compilerPath: string) {
  try {
    execFileSync(compilerPath, ["--help"], { stdio: "ignore" });
    return { ok: true as const };
  } catch (error: any) {
    return { ok: false as const, message: error?.message || String(error) };
  }
}

import {
  getSilverDeployCommand as getDiscoveryDeploy,
  getSilverSpendCommand as getDiscoverySpend
} from "./silver-discovery.js";
import {
  getSilverDeployPlanCommand,
  getSilverDeployCommand,
  getSilverSpendPlanCommand,
  getSilverSpendCommand
} from "./silver-lifecycle.js";
import { getSilverSimulateCommand } from "./silver-simulate.js";

export function registerSilverCommand(program: Command) {
  const silverCmd = program
    .command("silver")
    .description("SilverScript development tools (alpha)");

  const discoveryCmd = new Command("discovery").description(
    "Experimental SilverScript discovery tools"
  );
  discoveryCmd.addCommand(getDiscoveryDeploy());
  discoveryCmd.addCommand(getDiscoverySpend());
  silverCmd.addCommand(discoveryCmd);

  silverCmd.addCommand(getSilverDeployPlanCommand());
  silverCmd.addCommand(getSilverDeployCommand());
  silverCmd.addCommand(getSilverSpendPlanCommand());
  silverCmd.addCommand(getSilverSpendCommand());
  silverCmd.addCommand(getSilverSimulateCommand());

  silverCmd
    .command("doctor")
    .description("Diagnose if the local environment can work with SilverScript")
    .option("--capabilities", "Report local node script capabilities", false)
    .option("--compiler-path <path>", "Path to silverc binary")
    .action(async (opts) => {
      getOutput().writeLine(pc.bold("\nSilverScript Diagnostic\n"));
      if (opts.compilerPath) {
        process.env.HARDKAS_SILVERC_PATH = opts.compilerPath;
      }

      let compilerVersion = "Unknown";
      try {
        const compilerCmd = getCompilerPath();
        execFileSync(compilerCmd, ["--help"], { stdio: "ignore", shell: false, timeout: 5000 });
        compilerVersion = "Available"; // silverc doesn't support --version
        getOutput().writeLine(
          `  ${pc.green("OK")} Compiler: ${pc.bold("SILVERSCRIPT_COMPILER_READY")}`
        );
        getOutput().writeLine(`  ${pc.green("✅")} Compiler: ${pc.bold("Available")}`);
      } catch (err) {
        getOutput().writeLine(
          `  ${pc.red("❌")} Compiler: ${pc.red("SILVERSCRIPT_COMPILER_UNAVAILABLE")}`
        );
        getOutput().writeLine(
          pc.dim(`     (Could not find 'silverc' binary in ${getCompilerPath()})`)
        );
        getOutput().writeLine(
          pc.dim(
            `     Hint: pass --compiler-path, set HARDKAS_SILVERC_PATH, or install to .hardkas/bin/silverc.\n`
          )
        );
      }

      // Check node network support
      try {
        throw new Error("network-unknown");
      } catch (err) {
        // Fallback: detect Docker node directly
        try {
          const dockerPs = execFileSync("docker", ["ps", "--format", "{{.Image}}"], {
            encoding: "utf8",
            shell: false,
            timeout: 5000
          });
          if (dockerPs.includes("rusty-kaspad:v2.0.0")) {
            getOutput().writeLine(
              `  ${pc.green("✅")} Network: ${pc.bold("TOCCATA_MAINNET_RELEASE_DETECTED")} (v2.0.0 node running)`
            );
            getOutput().writeLine(pc.dim("     Node is v2.0.0 Mainnet Toccata Release."));
            getOutput().writeLine(
              `  ${pc.yellow("⚠️")} ${pc.yellow("SILVERSCRIPT_MAINNET_NOT_ENABLED")} — script lifecycle restricted to testnet/simnet`
            );
          } else if (dockerPs.includes("rusty-kaspad")) {
            getOutput().writeLine(
              `  ${pc.green("✅")} Network: ${pc.bold("Kaspa node detected")} (via Docker)`
            );
          } else {
            getOutput().writeLine(
              `  ${pc.yellow("⚠️")} Network: ${pc.yellow("SILVERSCRIPT_NODE_CAPABILITY_UNKNOWN")}`
            );
          }
        } catch {
          getOutput().writeLine(
            `  ${pc.yellow("⚠️")} Network: ${pc.yellow("SILVERSCRIPT_NODE_CAPABILITY_UNKNOWN")}`
          );
          getOutput().writeLine(
            pc.dim("     (Could not determine Kaspa node network capabilities)\n")
          );
        }
      }

      if (opts.capabilities) {
        getOutput().writeLine(pc.bold("\nNode RPC Capabilities (Discovery)"));
        try {
          const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
          const { loadHardkasConfig } = await import("@hardkas/config");
          const config = await loadHardkasConfig();
          const rpcUrl =
            (config.config.networks?.["simnet"] as any)?.rpcUrl || "ws://127.0.0.1:18210";
          const client = new JsonWrpcKaspaClient({ rpcUrl });
          await (client as any).connect();

          const info = await client.getServerInfo();
          const blockdag = await client.getBlockDagInfo();
          await client.close();

          const version = info.serverVersion ?? "unknown";
          getOutput().writeLine(`  Version:            ${version}`);
          getOutput().writeLine(`  Network:            ${(blockdag as any).networkId || "unknown"}`);
          getOutput().writeLine(
            `  Script Support:     ${version.includes("2.0") ? "TOCCATA_NODE_READY" : "UNKNOWN"}`
          );
        } catch (e: any) {
          getOutput().writeLine(`  ${pc.red("❌")} Failed to query RPC: ${e.message}`);
        }
      }

      getOutput().writeLine("");
    });

  silverCmd
    .command("compile <file>")
    .description("Compile a SilverScript source file (.sil or .silver)")
    .option("--network <network>", "Target network", DEFAULT_NETWORK)
    .option("--compiler-path <path>", "Path to silverc binary")
    .action(async (file, opts) => {
      if (!file.endsWith(".sil") && !file.endsWith(".silver")) {
        getOutput().writeLine(
          pc.yellow(
            `Warning: Standard SilverScript extension is .sil. You provided: ${file}`
          )
        );
      }

      if (opts.network !== DEFAULT_NETWORK && opts.network !== "simnet") {
        getOutput().error(
          pc.red(
            `Error: SILVERSCRIPT_NETWORK_UNSUPPORTED. The official compiler currently only supports ${DEFAULT_NETWORK}.`
          )
        );
        throw new Error("Command failed");
      }

      if (!fs.existsSync(file)) {
        getOutput().error(pc.red(`Error: Source file not found: ${file}`));
        throw new Error("Command failed");
      }

      const sourceContent = fs.readFileSync(file, "utf8");
      const sourceHash = createHash("sha256").update(sourceContent).digest("hex");

      let compilerOutput = "";
      let compilerVersion = "unknown";
      const compilerCmd = getCompilerPath(opts.compilerPath);

      const compilerCheck = checkCompilerReady(compilerCmd);
      if (!compilerCheck.ok) {
        getOutput().error(pc.red(`Error: SILVERSCRIPT_COMPILER_UNAVAILABLE.`));
        getOutput().error(
          pc.dim(
            `Hint: pass --compiler-path, set HARDKAS_SILVERC_PATH, or install to .hardkas/bin/silverc.`
          )
        );
        throw new Error("Command failed");
      }

      try {
        compilerOutput = execFileSync(compilerCmd, [file, "-c"], {
          stdio: "pipe"
        }).toString();
      } catch (err: any) {
        getOutput().error(pc.red(`Compiler Error:`));
        getOutput().error(
          err.stdout?.toString() || err.stderr?.toString() || err.message
        );
        throw new Error("Command failed");
      }

      const adapter = SilverCompilerOutputAdapter.normalize(compilerOutput);

      const { writeArtifact, HARDKAS_VERSION, calculateContentHash } =
        await import("@hardkas/artifacts");

      const artifact = {
        schema: "hardkas.silver.compile",
        hardkasVersion: HARDKAS_VERSION,
        version: "1.0.0-alpha",
        hashVersion: 4,
        networkId: opts.network,
        mode: "simulated",
        createdAt: new Date().toISOString(),
        sourcePath: path.resolve(file),
        sourceHash,
        compilerName: "silverc",
        compilerVersion,
        compilerCommand: `${compilerCmd} "${file}" -c`,
        compiledScriptHex: adapter.normalized.scriptHex,
        compiledScriptHash: adapter.normalized.scriptHash,
        abi: adapter.normalized.abi,
        network: opts.network,
        assumptions: ["toccata-v2", "mainnet-disabled"]
      };

      const contentHash = calculateContentHash(artifact);
      (artifact as any).contentHash = contentHash;
      (artifact as any).artifactId = `silver-${contentHash.substring(0, 16)}`;

      const artifactPath = path.resolve(
        process.cwd(),
        `${(artifact as any).artifactId}.json`
      );
      await writeArtifact(artifactPath, artifact as any);
      getOutput().writeLine(pc.green(`✅ Compiled successfully!`));
      getOutput().writeLine(`Artifact generated: ${pc.bold(artifactPath)}`);
    });

  silverCmd
    .command("inspect <artifact_path>")
    .description("Inspect a SilverScript compiled artifact or spend plan")
    .action(async (artifactPath) => {
      const content = fs.readFileSync(artifactPath, "utf8");
      const artifact = JSON.parse(content);

      if (
        artifact.schema !== "hardkas.silver.compile" &&
        artifact.schema !== "hardkas.silver.test" &&
        artifact.schema !== "hardkas.silver.spendPlan"
      ) {
        getOutput().error(
          pc.red(`Error: Expected a SilverScript schema, got ${artifact.schema}`)
        );
        throw new Error("Command failed");
      }

      getOutput().writeLine(pc.bold("\nSilverScript Artifact Inspector"));
      if (
        artifact.schema === "hardkas.silver.compile" ||
        artifact.schema === "hardkas.silver.test"
      ) {
        getOutput().writeLine(`  Source Path:   ${artifact.sourcePath}`);
        getOutput().writeLine(`  Source Hash:   ${pc.cyan(artifact.sourceHash)}`);
        getOutput().writeLine(
          `  Compiled Hash: ${pc.cyan(artifact.compiledScriptHash || "Unknown")}`
        );
        getOutput().writeLine(
          `  Compiler:      ${artifact.compilerName} ${artifact.compilerVersion}`
        );
        getOutput().writeLine(
          `  Network:       ${artifact.network || artifact.networkId}`
        );

        if (artifact.compiledScriptHex) {
          const size = Buffer.from(artifact.compiledScriptHex, "hex").length;
          getOutput().writeLine(`  Script Size:   ${size} bytes`);
        }
      } else if (artifact.schema === "hardkas.silver.spendPlan") {
        getOutput().writeLine(`  Schema:        ${artifact.schema}`);
        getOutput().writeLine(`  Compiled Hash: ${pc.cyan(artifact.compiledScriptHash)}`);
        getOutput().writeLine(`  Locking Hash:  ${pc.cyan(artifact.scriptLockingHash)}`);
        getOutput().writeLine(`  Args Hash:     ${pc.cyan(artifact.argsHash)}`);
        getOutput().writeLine(`  Network:       ${artifact.networkId}`);
        getOutput().writeLine(`  Mode:          ${artifact.mode}`);
        getOutput().writeLine(`  Inputs:        ${artifact.selectedInputs.length}`);
        getOutput().writeLine(`  Outputs:       ${artifact.expectedOutputs.length}`);
      }

      if (artifact.assumptions && artifact.assumptions.length > 0) {
        getOutput().writeLine(`  Assumptions:   ${artifact.assumptions.join(", ")}`);
      }

      getOutput().writeLine("");
    });

  silverCmd
    .command("verify <artifact_path>")
    .description(
      "Verify the deterministic hashes and metadata of a SilverScript artifact"
    )
    .action(async (artifactPath) => {
      const { verifyArtifactIntegritySync } = await import("@hardkas/artifacts");

      try {
        const result = verifyArtifactIntegritySync(artifactPath, { strict: true });
        if (!result.ok) {
          getOutput().error(pc.red(`❌ Verification failed for ${artifactPath}`));
          result.errors.forEach((e) => getOutput().error(pc.dim(` - ${e}`)));
          throw new Error("Command failed");
        }
        getOutput().writeLine(
          pc.green(`✅ SilverScript Artifact Verified: ${artifactPath}`)
        );
      } catch (err: any) {
        getOutput().error(pc.red(`❌ Verification failed for ${artifactPath}`));
        getOutput().error(pc.dim(err.message));
        throw new Error("Command failed");
      }
    });

  silverCmd
    .command("test <file.sil>")
    .description("Run deterministic test harness for a SilverScript contract")
    .option("--vectors <path>", "Path to test vectors JSON")
    .option("--out <path>", "Output path for the SilverTestArtifact")
    .option("--expected-fail", "Mark as EXPECTED_COMPILER_FAILURE if compilation fails")
    .option("--compiler <type>", "Compiler type (native|docker)", "native")
    .option("--compiler-path <path>", "Path to silverc binary")
    .action(async (file, opts) => {
      const {
        writeArtifact,
        calculateContentHash,
        HARDKAS_VERSION,
        verifyArtifactIntegritySync
      } = await import("@hardkas/artifacts");

      const results: any[] = [];
      let status = "PARTIAL_TEST_VECTOR_SUPPORT" as string;
      let compileArtifactPath = "";

      const sourcePath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(sourcePath)) {
        getOutput().error(pc.red(`Error: Source file not found: ${file}`));
        throw new Error("Command failed");
      }
      const sourceContent = fs.readFileSync(sourcePath, "utf8");
      const sourceHash = createHash("sha256").update(sourceContent).digest("hex");

      let testVectorsHash: string | null = null;
      if (opts.vectors) {
        if (!fs.existsSync(opts.vectors)) {
          getOutput().error(
            pc.red(`Error: Test vectors file not found: ${opts.vectors}`)
          );
          throw new Error("Command failed");
        }
        try {
          const vectorsContent = fs.readFileSync(opts.vectors, "utf8");
          const parsedVectors = JSON.parse(vectorsContent); // validate JSON
          // Normalize vectors for hash
          testVectorsHash = createHash("sha256")
            .update(JSON.stringify(parsedVectors))
            .digest("hex");
        } catch (err) {
          getOutput().error(
            pc.red(`SILVERSCRIPT_TEST_VECTOR_INVALID: Malformed vectors.json`)
          );
          throw new Error("Command failed");
        }
      }

      // Run compile
      let compileStdout = "";
      try {
        compileStdout = execFileSync(
          process.execPath,
          [process.argv[1], "silver", "compile", file].concat(
            opts.compilerPath ? ["--compiler-path", opts.compilerPath] : []
          ),
          { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], shell: false, timeout: 30000 }
        );
        results.push({ name: "compile", status: "PASS" });
        const cleanStdout = compileStdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
        const match = cleanStdout.match(/Artifact generated:\s+(.+?\.json)/);
        if (match) {
          compileArtifactPath = match[1]!.trim();
        } else {
          throw new Error("Could not find artifact path in compile output");
        }
      } catch (err: any) {
        if (opts.expectedFail) {
          getOutput().writeLine(
            pc.yellow(`⚠️ Compilation failed as expected (--expected-fail)`)
          );
          results.push({ name: "compile", status: "EXPECTED_COMPILER_FAILURE" });
          status = "EXPECTED_COMPILER_FAILURE";
        } else {
          getOutput().error(pc.red(`❌ Compilation failed`));
          getOutput().error(err.stderr || err.message);
          results.push({ name: "compile", status: "FAIL", reason: err.message });
          status = "FAIL";
          throw new Error("Command failed");
        }
      }

      let compiledScriptHash = "";
      let compileArtifactHash = "";
      let compilerName = "silverc";
      let compilerVersion = "unknown";

      if (status !== "EXPECTED_COMPILER_FAILURE" && status !== "FAIL") {
        // Verify artifact
        try {
          const verifyResult = verifyArtifactIntegritySync(compileArtifactPath, {
            strict: true
          });
          if (!verifyResult.ok) {
            throw new Error(verifyResult.errors.join(", "));
          }
          results.push({ name: "artifact-verify", status: "PASS" });

          const compileArtifact = JSON.parse(
            fs.readFileSync(compileArtifactPath, "utf8")
          );
          compiledScriptHash = compileArtifact.compiledScriptHash;
          compileArtifactHash = compileArtifact.contentHash;
          compilerName = compileArtifact.compilerName;
          compilerVersion = compileArtifact.compilerVersion;
        } catch (err: any) {
          getOutput().error(pc.red(`❌ Artifact verification failed`));
          results.push({ name: "artifact-verify", status: "FAIL", reason: err.message });
          status = "FAIL";
        }
      }

      if (status !== "EXPECTED_COMPILER_FAILURE" && status !== "FAIL") {
        results.push({
          name: "semantic-vm",
          status: "SKIPPED",
          reason: "PARTIAL_TEST_VECTOR_SUPPORT"
        });
      }

      const testArtifact = {
        schema: "hardkas.silver.test",
        hardkasVersion: HARDKAS_VERSION,
        version: "1.0.0-alpha",
        hashVersion: 4,
        networkId: "simnet",
        mode: "simulated",
        createdAt: new Date().toISOString(),
        sourceHash,
        compileArtifactHash: compileArtifactHash || "unknown",
        compiledScriptHash: compiledScriptHash || "unknown",
        testVectorsHash: testVectorsHash,
        compilerName,
        compilerVersion,
        results,
        status
      };

      const contentHash = calculateContentHash(testArtifact);
      (testArtifact as any).contentHash = contentHash;
      (testArtifact as any).artifactId = `silvertst-${contentHash.substring(0, 16)}`;

      const outPath = opts.out
        ? path.resolve(process.cwd(), opts.out)
        : path.resolve(process.cwd(), `${(testArtifact as any).artifactId}.json`);
      await writeArtifact(outPath, testArtifact);

      getOutput().writeLine(pc.green(`\n✅ SilverScript Test Harness Completed`));
      getOutput().writeLine(
        `Status: ${pc.bold(status === "PASS" ? pc.green(status) : pc.yellow(status))}`
      );
      getOutput().writeLine(`Test Artifact: ${pc.bold(outPath)}`);
    });

  silverCmd
    .command("certify <file.sil>")
    .description("Execute the full certification pipeline for a SilverScript contract")
    .action((file) => {
      getOutput().writeLine(pc.bold("\n🚀 SilverScript Certification Pipeline"));

      let status = "SILVERSCRIPT_CERTIFICATION_PARTIAL_PASS";

      const runCliCommand = (args: string[]) => {
        return execFileSync(process.execPath, [process.argv[1]!, ...args], {
          encoding: "utf8",
          stdio: "inherit",
          shell: false,
          timeout: 60000
        });
      };

      const captureCliCommand = (args: string[]) => {
        return execFileSync(process.execPath, [process.argv[1]!, ...args], {
          encoding: "utf8",
          shell: false,
          timeout: 60000
        });
      };

      try {
        getOutput().writeLine(pc.cyan(`\n[1/5] Running doctor...`));
        runCliCommand(["silver", "doctor"]);

        getOutput().writeLine(pc.cyan(`\n[2/5] Running compile...`));
        const compileOut = captureCliCommand(["silver", "compile", file]);
        getOutput().writeLine(compileOut);

        const cleanCompileOut = compileOut.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
        const match = cleanCompileOut.match(/Artifact generated:\s+(.+?\.json)/);
        if (!match) throw new Error("Could not find artifact path");
        const artifactPath = match[1]!.trim();

        getOutput().writeLine(pc.cyan(`\n[3/5] Running inspect...`));
        runCliCommand(["silver", "inspect", artifactPath]);

        getOutput().writeLine(pc.cyan(`\n[4/5] Running verify...`));
        runCliCommand(["silver", "verify", artifactPath]);

        getOutput().writeLine(pc.cyan(`\n[5/5] Running test...`));
        runCliCommand(["silver", "test", file]);
      } catch (err: any) {
        getOutput().error(pc.red(`\n❌ Pipeline failed at step. Error: ${err.message}`));
        status = "SILVERSCRIPT_CERTIFICATION_BLOCKED";
      }

      getOutput().writeLine(
        pc.bold(
          `\nCertification Status: ${status === "SILVERSCRIPT_CERTIFICATION_PARTIAL_PASS" ? pc.green(status) : pc.red(status)}\n`
        )
      );
    });
}
