import { Command } from "commander";
import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

const MAX_TIMEOUT_MS = 600000;

function parseTimeoutOption(raw: string | undefined): number {
  if (raw === undefined) return 10000;
  if (!/^[1-9][0-9]*$/.test(raw) || Number(raw) > MAX_TIMEOUT_MS) {
    throw new HardkasCliError(
      "ZK_TIMEOUT_INVALID",
      `--timeout must be an integer number of milliseconds in [1, ${MAX_TIMEOUT_MS}], got '${raw}'. Nothing was done.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  return Number(raw);
}

function parseSha256Option(raw: string | undefined, flag: string): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new HardkasCliError(
      "ZK_HASH_OPTION_INVALID",
      `${flag} must be a 64-hex SHA-256 digest, got '${raw}'. Nothing was done.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  return value;
}

export function registerZkCommands(program: Command) {
  const zk = program
    .command("zk")
    .description(
      "Experimental local-only ZK proof artifact tools (fixture coherence, Groth16 pairing check, Toccata script building; no on-chain claims)"
    );

  zk.command("capabilities")
    .description("Show experimental ZK lab capabilities")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json?: boolean }) => {
      const { createZkCapabilities } = await import("@hardkas/sdk");
      const result = createZkCapabilities();
      printResult(result, options.json);
    });

  const proof = zk
    .command("proof")
    .description("Inspect and verify local proof artifacts");

  proof
    .command("inspect <path>")
    .description("Inspect a local proof fixture or artifact")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options: { json?: boolean }) => {
      const { inspectZkProof } = await import("@hardkas/sdk");
      const result = await inspectZkProof(targetPath, process.cwd());
      printResult(result, options.json);
      if (!result.ok) {
        throw new HardkasCliError("ZK_INSPECT_FAILED", "Failed", { exitCode: 1 });
      }
    });

  proof
    .command("verify <path>")
    .alias("verify-local")
    .description(`Verify local fixture coherence for a proof artifact (No cryptographic proof or on-chain claims) ${UI.maturity("alpha")}`)
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options: { json?: boolean }) => {
      const { verifyZkProofLocal } = await import("@hardkas/sdk");
      const result = await verifyZkProofLocal(targetPath, process.cwd());
      printResult(result, options.json);
      if (!result.ok) {
        throw new HardkasCliError("ZK_FIXTURE_COHERENCE_FAILED", "Failed to verify local ZK fixture coherence", { exitCode: 1 });
      }
    });

  proof
    .command("verify-math <path>")
    .description(
      `Groth16 pairing check (snarkjs, BN254) of a fixture, bound to its content hashes by default; reports the key, inputs and proof digests it used (No on-chain claims) ${UI.maturity("alpha")}`
    )
    .option("--json", "Output as JSON", false)
    .option("--timeout <ms>", "Verification timeout in milliseconds (integer, 1..600000)", "10000")
    .option("--expect-vk-hash <sha256>", "Reject unless the verification key's domain digest equals this value")
    .option("--math-only", "Skip the fixture-coherence binding; the result is labelled MATH_ONLY", false)
    .option(
      "--allow-weak-vk",
      "Accept a verification key with a known trapdoor (toy fixtures only; proofs against such keys prove nothing)",
      false
    )
    .action(
      async (
        targetPath: string,
        options: { json?: boolean; timeout?: string; expectVkHash?: string; mathOnly?: boolean; allowWeakVk?: boolean }
      ) => {
        const timeoutMs = parseTimeoutOption(options.timeout);
        const expectedVerificationKeyHash = parseSha256Option(options.expectVkHash, "--expect-vk-hash");
        const { verifyZkProofMath } = await import("@hardkas/sdk");
        const mathOptions: Parameters<typeof verifyZkProofMath>[2] = {
          timeoutMs,
          mathOnly: options.mathOnly === true,
          allowWeakVerificationKey: options.allowWeakVk === true
        };
        if (expectedVerificationKeyHash !== undefined) mathOptions.expectedVerificationKeyHash = expectedVerificationKeyHash;
        const result = await verifyZkProofMath(targetPath, process.cwd(), mathOptions);
        printResult(result, options.json);
        if (!result.ok) {
          throw new HardkasCliError("ZK_GROTH16_MATH_FAILED", "Failed cryptographic Groth16 mathematical verification", { exitCode: 1 });
        }
      }
    );

  const corpus = zk
    .command("corpus")
    .description("Verify experimental ZK fixture corpora");
  corpus
    .command("verify <path>")
    .description("Verify a local ZK corpus (coherence of every listed fixture; pairing check where a fixture claims it)")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options: { json?: boolean }) => {
      const { verifyZkCorpus } = await import("@hardkas/sdk");
      const result = await verifyZkCorpus(targetPath, process.cwd());
      printResult(result, options.json);
      if (!result.ok) {
        throw new HardkasCliError("ZK_CORPUS_VERIFY_FAILED", "Failed", { exitCode: 1 });
      }
    });

  const toccata = zk
    .command("toccata")
    .description("Kaspa Toccata L1 Zero-Knowledge covenant script tools (kaspa-wasm ZkScriptBuilder; builds only, never broadcasts)");

  toccata
    .command("rules")
    .description("Show the Kaspa Toccata L1 Groth16 precompile facts HardKAS relies on (opcode, tag, costs, compute budget)")
    .option("--json", "Output as JSON", false)
    .action(async (options: { json?: boolean }) => {
      const { getToccataPrecompileRules } = await import("@hardkas/sdk");
      const result = getToccataPrecompileRules();
      printResult(result, options.json);
    });

  toccata
    .command("build-scripts")
    .description("Build P2SH redeem and signature scripts for a RISC Zero Groth16 proof set (imageId/journalHash are not cross-checked against the receipt)")
    .requiredOption("--image-id <hex>", "32-byte hex Image ID")
    .requiredOption("--journal-hash <hex>", "32-byte hex Journal Hash")
    .requiredOption("--receipt <pathOrHex>", "Path to receipt file (.hex) or raw receipt hex string")
    .option("--json", "Output as JSON", false)
    .action(async (options: { imageId: string; journalHash: string; receipt: string; json?: boolean }) => {
      const fs = await import("node:fs");
      let receiptHex = options.receipt;
      if (fs.existsSync(receiptHex)) {
        receiptHex = fs.readFileSync(receiptHex, "utf8").trim();
      }
      const { buildR0Groth16Scripts } = await import("@hardkas/sdk");
      const result = buildR0Groth16Scripts({
        imageId: options.imageId,
        journalHash: options.journalHash,
        receiptHex
      });
      printResult(result, options.json);
      if (!result.ok) {
        throw new HardkasCliError("ZK_TOCCATA_SCRIPT_BUILD_FAILED", "Failed to build Toccata ZK scripts", { exitCode: 1 });
      }
    });
}

/** JSON when asked; otherwise a short human summary (the JSON document is one flag away). */
function printResult(result: unknown, json?: boolean) {
  const out = getOutput();
  if (json || !result || typeof result !== "object") {
    out.writeJson(result);
    return;
  }
  const r = result as Record<string, unknown>;
  const lines: string[] = [];
  for (const key of ["ok", "status", "verified", "path", "proofSystem", "engine", "schema"]) {
    if (key in r && (typeof r[key] === "string" || typeof r[key] === "boolean")) lines.push(`${key}: ${String(r[key])}`);
  }
  const summary = r.summary;
  if (summary && typeof summary === "object") {
    for (const [k, v] of Object.entries(summary as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") lines.push(`summary.${k}: ${String(v)}`);
    }
  }
  const issues = Array.isArray(r.issues) ? (r.issues as Array<{ code?: string; message?: string }>) : [];
  for (const issue of issues) lines.push(`issue: ${issue.code ?? "?"} - ${issue.message ?? ""}`);
  const warnings = Array.isArray(r.warnings) ? (r.warnings as Array<{ code?: string; message?: string }>) : [];
  for (const w of warnings) lines.push(`warning: ${w.code ?? "?"} - ${w.message ?? ""}`);
  if (lines.length === 0) {
    out.writeJson(result);
    return;
  }
  lines.push("(--json prints the full document)");
  out.writeLine(lines.join("\n"));
}
