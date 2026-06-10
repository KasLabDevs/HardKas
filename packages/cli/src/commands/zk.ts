import { Command } from "commander";

export function registerZkCommands(program: Command) {
  const zk = program
    .command("zk")
    .description("Experimental local-only ZK proof artifact tools");

  zk
    .command("capabilities")
    .description("Show experimental ZK lab capabilities")
    .option("--json", "Output as JSON", false)
    .action(async (options) => {
      const { createZkCapabilities } = await import("@hardkas/sdk");
      const result = createZkCapabilities();
      printResult(result, options.json);
    });

  const proof = zk.command("proof").description("Inspect and verify local proof artifacts");

  proof
    .command("inspect <path>")
    .description("Inspect a local proof fixture or artifact")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options) => {
      const { inspectZkProof } = await import("@hardkas/sdk");
      const result = await inspectZkProof(targetPath, process.cwd());
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });

  proof
    .command("verify-local <path>")
    .description("Verify a local proof fixture without network or on-chain claims")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options) => {
      const { verifyZkProofLocal } = await import("@hardkas/sdk");
      const result = await verifyZkProofLocal(targetPath, process.cwd());
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });

  const corpus = zk.command("corpus").description("Verify experimental ZK fixture corpora");
  corpus
    .command("verify <path>")
    .description("Verify a local ZK corpus")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options) => {
      const { verifyZkCorpus } = await import("@hardkas/sdk");
      const result = await verifyZkCorpus(targetPath, process.cwd());
      printResult(result, options.json);
      if (!result.ok) process.exitCode = 1;
    });
}

function printResult(result: unknown, json?: boolean) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}
