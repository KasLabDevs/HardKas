import { Command } from "commander";
import { getOutput } from "../output.js";

export function registerZkCommands(program: Command) {
  const zk = program
    .command("zk")
    .description(
      "Experimental local-only ZK proof artifact tools (Outputs JSON by default)"
    );

  zk.command("capabilities")
    .description("Show experimental ZK lab capabilities")
    .option("--json", "Output as JSON", false)
    .action(async () => {
      const { createZkCapabilities } = await import("@hardkas/sdk");
      const result = createZkCapabilities();
      printResult(result);
    });

  const proof = zk
    .command("proof")
    .description("Inspect and verify local proof artifacts");

  proof
    .command("inspect <path>")
    .description("Inspect a local proof fixture or artifact")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string) => {
      const { inspectZkProof } = await import("@hardkas/sdk");
      const result = await inspectZkProof(targetPath, process.cwd());
      printResult(result);
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("ZK_INSPECT_FAILED", "Failed", { exitCode: 1 });
      }
    });

  proof
    .command("verify-local <path>")
    .description("Verify a local proof fixture without network or on-chain claims")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string) => {
      const { verifyZkProofLocal } = await import("@hardkas/sdk");
      const result = await verifyZkProofLocal(targetPath, process.cwd());
      printResult(result);
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("ZK_VERIFY_LOCAL_FAILED", "Failed", { exitCode: 1 });
      }
    });

  const corpus = zk
    .command("corpus")
    .description("Verify experimental ZK fixture corpora");
  corpus
    .command("verify <path>")
    .description("Verify a local ZK corpus")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string) => {
      const { verifyZkCorpus } = await import("@hardkas/sdk");
      const result = await verifyZkCorpus(targetPath, process.cwd());
      printResult(result);
      if (!result.ok) {
        const { HardkasCliError } = await import("../cli-errors.js");
        throw new HardkasCliError("ZK_CORPUS_VERIFY_FAILED", "Failed", { exitCode: 1 });
      }
    });
}

function printResult(result: unknown) {
  getOutput().writeJson(result);
}
