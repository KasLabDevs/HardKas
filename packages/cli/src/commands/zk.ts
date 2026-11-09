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

/**
 * INT9: the pairing engine, snarkjs, is an OPTIONAL peer dependency of @hardkas/sdk (GPL-3.0, so installing the SDK does
 * not install it). When a verification could not run because it is missing, the SDK reports the issue
 * ZK_ENGINE_UNAVAILABLE; the command then fails with that same code (exit 1, as before) instead of its generic one.
 * Nothing was verified either way, and the JSON result still lists every issue.
 */
function engineUnavailableError(result: unknown, what: string): HardkasCliError | undefined {
  const issues = (result as { issues?: Array<{ code?: string; message?: string }> } | undefined)?.issues;
  if (!Array.isArray(issues)) return undefined;
  const issue = issues.find((i) => i?.code === "ZK_ENGINE_UNAVAILABLE");
  if (!issue) return undefined;
  return new HardkasCliError(
    "ZK_ENGINE_UNAVAILABLE",
    `${what} was not verified: ${issue.message ?? "the optional peer dependency snarkjs is not installed."}`,
    {
      exitCode: HardkasExitCode.RUNTIME_FAILURE,
      suggestion: "Install snarkjs next to @hardkas/sdk, at the version @hardkas/sdk declares in peerDependencies (it is GPL-3.0 and optional)."
    }
  );
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
      `Groth16 pairing check (snarkjs, BN254; snarkjs is an optional peer of @hardkas/sdk, without it ZK_ENGINE_UNAVAILABLE) of a fixture; VERIFIED only for a pinned verification key (--expect-vk-hash or the in-code registry), otherwise VALID_UNANCHORED_VK; fixture coherence is self-attested (No on-chain claims) ${UI.maturity("alpha")}`
    )
    .option("--json", "Output as JSON", false)
    .option("--timeout <ms>", "Verification timeout in milliseconds (integer, 1..600000)", "10000")
    .option(
      "--expect-vk-hash <sha256>",
      "Pin the verification key: its fingerprint (summary.verificationKeyFingerprint) or legacy digest, obtained from a source you trust"
    )
    .option("--math-only", "Skip the self-attested fixture-coherence check; the result is labelled MATH_ONLY", false)
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
        if (result.status === "ZK_GROTH16_MATH_VALID_UNANCHORED_VK") {
          throw new HardkasCliError(
            "ZK_GROTH16_VK_UNANCHORED",
            "The pairing passed, but against a verification key nobody vouched for: not VERIFIED. Pin the key with --expect-vk-hash <fingerprint> from a source you trust.",
            { exitCode: 1 }
          );
        }
        if (!result.ok) {
          throw (
            engineUnavailableError(result, "The Groth16 proof") ??
            new HardkasCliError("ZK_GROTH16_MATH_FAILED", "Failed cryptographic Groth16 mathematical verification", { exitCode: 1 })
          );
        }
      }
    );

  const corpus = zk
    .command("corpus")
    .description("Verify experimental ZK fixture corpora");
  corpus
    .command("verify <path>")
    .description("Verify a local ZK corpus (coherence of every listed fixture; pairing check where a fixture claims it, which needs the optional peer snarkjs)")
    .option("--json", "Output as JSON", false)
    .action(async (targetPath: string, options: { json?: boolean }) => {
      const { verifyZkCorpus } = await import("@hardkas/sdk");
      const result = await verifyZkCorpus(targetPath, process.cwd());
      printResult(result, options.json);
      if (!result.ok) {
        throw engineUnavailableError(result, "The ZK corpus") ?? new HardkasCliError("ZK_CORPUS_VERIFY_FAILED", "Failed", { exitCode: 1 });
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
    .description(
      "Build P2SH redeem and signature scripts for a RISC Zero Groth16 receipt (the receipt's claim is cross-checked against imageId/journalHash). Modes: proof-only (default; the lock binds the image id only: any holder of a valid receipt spends) or proof-and-output-bound (the redeem script also enforces the payout/change outputs by introspection). Simnet address only unless public networks are requested (proof-only also needs the acknowledgement)"
    )
    .requiredOption("--image-id <hex>", "32-byte hex Image ID")
    .requiredOption("--journal-hash <hex>", "32-byte hex Journal Hash")
    .requiredOption("--receipt <pathOrHex>", "Path to receipt file (.hex) or raw receipt hex string")
    .option("--mode <mode>", "Binding mode: 'proof-only' (unbound outputs) or 'proof-and-output-bound' (consensus output introspection)", "proof-only")
    .option("--payout-address <address>", "Consensus-bound recipient address (required if mode is proof-and-output-bound)")
    .option("--payout-amount <sompi>", "Consensus-bound payout amount in sompi (required if mode is proof-and-output-bound)")
    .option("--change-address <address>", "Optional consensus-bound change address")
    .option("--change-amount <sompi>", "Optional consensus-bound change amount in sompi")
    .option("--max-fee <sompi>", "proof-and-output-bound: the most the lock may pay as fee; a UTXO above the bound outputs plus this stays locked (default 50000000)")
    .option("--address-network <networks>", "Also return P2SH addresses for these public networks (comma-separated: testnet-10,mainnet); proof-only needs --ack-image-id-only-lock; never for a public test vector")
    .option("--ack-image-id-only-lock", "Acknowledge that a proof-only lock binds only the image id (anyone with a valid receipt can spend, replay or front-run)", false)
    .option("--json", "Output as JSON", false)
    .action(
      async (options: {
        imageId: string;
        journalHash: string;
        receipt: string;
        mode?: string;
        payoutAddress?: string;
        payoutAmount?: string;
        changeAddress?: string;
        changeAmount?: string;
        maxFee?: string;
        addressNetwork?: string;
        ackImageIdOnlyLock?: boolean;
        json?: boolean;
      }) => {
        const receiptHex = await readReceiptOption(options.receipt);
        const addressNetworks = parseAddressNetworks(options.addressNetwork);
        const mode = options.mode ?? "proof-only";
        if (mode !== "proof-only" && mode !== "proof-and-output-bound") {
          throw new HardkasCliError("ZK_BINDING_MODE_INVALID", `--mode must be 'proof-only' or 'proof-and-output-bound', got '${mode}'`, { exitCode: 1 });
        }
        let bindingPolicy: any = undefined;
        if (mode === "proof-and-output-bound") {
          if (!options.payoutAddress || !options.payoutAmount) {
            throw new HardkasCliError(
              "ZK_BINDING_POLICY_INCOMPLETE",
              "--payout-address and --payout-amount are required when mode is proof-and-output-bound",
              { exitCode: 1 }
            );
          }
          if ((options.changeAddress === undefined) !== (options.changeAmount === undefined)) {
            throw new HardkasCliError("ZK_BINDING_POLICY_INCOMPLETE", "--change-address and --change-amount go together", { exitCode: 1 });
          }
          bindingPolicy = {
            mode: "proof-and-output-bound",
            payout: { address: options.payoutAddress, amountSompi: parseSompiOption("--payout-amount", options.payoutAmount) },
            ...(options.changeAddress && options.changeAmount
              ? { change: { address: options.changeAddress, amountSompi: parseSompiOption("--change-amount", options.changeAmount) } }
              : {}),
            ...(options.maxFee !== undefined ? { maxFeeSompi: parseSompiOption("--max-fee", options.maxFee) } : {})
          };
        } else if (options.payoutAddress || options.payoutAmount || options.changeAddress || options.changeAmount || options.maxFee) {
          throw new HardkasCliError(
            "ZK_BINDING_OPTIONS_WITHOUT_MODE",
            "--payout-*, --change-* and --max-fee bind outputs only with --mode proof-and-output-bound; nothing was built",
            { exitCode: 1 }
          );
        }
        const { buildR0Groth16Scripts } = await import("@hardkas/sdk");
        const result = buildR0Groth16Scripts({
          imageId: options.imageId,
          journalHash: options.journalHash,
          receiptHex,
          ...(bindingPolicy ? { bindingPolicy } : {}),
          ...(addressNetworks.length > 0 ? { addressNetworks } : {}),
          acknowledgeImageIdOnlyLock: options.ackImageIdOnlyLock === true
        });
        printResult(result, options.json);
        if (!result.ok) {
          throw new HardkasCliError("ZK_TOCCATA_SCRIPT_BUILD_FAILED", "Failed to build Toccata ZK scripts", { exitCode: 1 });
        }
      }
    );

  toccata
    .command("verify-receipt")
    .description(
      `Verify a RISC Zero Groth16 receipt locally (snarkjs, BN254; without the optional peer snarkjs, ZK_ENGINE_UNAVAILABLE) against the pinned official RISC Zero verifying key, control root and BN254 control id, for the claim of (imageId, journalHash) (No on-chain claims) ${UI.maturity("alpha")}`
    )
    .requiredOption("--image-id <hex>", "32-byte hex Image ID")
    .requiredOption("--journal-hash <hex>", "32-byte hex Journal Hash")
    .requiredOption("--receipt <pathOrHex>", "Path to receipt file (.hex) or raw receipt hex string")
    .option("--timeout <ms>", "Verification timeout in milliseconds (integer, 1..600000)", "10000")
    .option("--json", "Output as JSON", false)
    .action(async (options: { imageId: string; journalHash: string; receipt: string; timeout?: string; json?: boolean }) => {
      const timeoutMs = parseTimeoutOption(options.timeout);
      const receiptHex = await readReceiptOption(options.receipt);
      const { verifyR0Groth16ReceiptLocal } = await import("@hardkas/sdk");
      const result = await verifyR0Groth16ReceiptLocal({
        imageId: options.imageId,
        journalHash: options.journalHash,
        receiptHex,
        timeoutMs
      });
      printResult(result, options.json);
      if (!result.ok) {
        throw (
          engineUnavailableError(result, "The RISC Zero Groth16 receipt") ??
          new HardkasCliError("ZK_R0_RECEIPT_VERIFY_FAILED", "The RISC Zero Groth16 receipt did not verify", { exitCode: 1 })
        );
      }
    });

  toccata
    .command("verify-scripts")
    .description("Verify structural integrity and inspect consensus binding rules in Toccata P2SH scripts")
    .requiredOption("--redeem-script <hex>", "Redeem script hex")
    .requiredOption("--sig-script <hex>", "Signature script hex")
    .option("--image-id <hex>", "Expected 32-byte hex Image ID")
    .option("--journal-hash <hex>", "Expected 32-byte hex Journal Hash")
    .option("--expected-mode <mode>", "Expected binding mode ('proof-only' or 'proof-and-output-bound')")
    .option("--expected-payout-address <address>", "Expected consensus-bound payout address")
    .option("--expected-payout-amount <sompi>", "Expected consensus-bound payout amount in sompi")
    .option("--json", "Output as JSON", false)
    .action(async (options: {
      redeemScript: string;
      sigScript: string;
      imageId?: string;
      journalHash?: string;
      expectedMode?: "proof-only" | "proof-and-output-bound";
      expectedPayoutAddress?: string;
      expectedPayoutAmount?: string;
      json?: boolean;
    }) => {
      const { verifyR0Groth16Scripts } = await import("@hardkas/sdk");
      const result = verifyR0Groth16Scripts({
        redeemScript: options.redeemScript,
        sigScript: options.sigScript,
        ...(options.imageId ? { imageId: options.imageId } : {}),
        ...(options.journalHash ? { journalHash: options.journalHash } : {}),
        ...(options.expectedMode ? { expectedBindingMode: options.expectedMode } : {}),
        ...(options.expectedPayoutAddress ? { expectedPayoutAddress: options.expectedPayoutAddress } : {}),
        ...(options.expectedPayoutAmount ? { expectedPayoutAmount: BigInt(options.expectedPayoutAmount) } : {})
      });
      printResult(result, options.json);
      if (!result.ok) {
        throw new HardkasCliError("ZK_SCRIPTS_VERIFY_FAILED", "Toccata ZK script verification failed", { exitCode: 1 });
      }
    });
}

async function readReceiptOption(raw: string): Promise<string> {
  const fs = await import("node:fs");
  return fs.existsSync(raw) ? fs.readFileSync(raw, "utf8").trim() : raw;
}

/** A positive integer amount in sompi from a CLI option (no KAS decimals, no exponent). */
function parseSompiOption(name: string, raw: string): bigint {
  if (!/^[0-9]+$/.test(String(raw).trim())) {
    throw new HardkasCliError("ZK_BINDING_POLICY_INVALID", `${name} must be a positive integer amount in sompi, got '${raw}'`, { exitCode: 1 });
  }
  const v = BigInt(String(raw).trim());
  if (v <= 0n) throw new HardkasCliError("ZK_BINDING_POLICY_INVALID", `${name} must be positive`, { exitCode: 1 });
  return v;
}


function parseAddressNetworks(raw: string | undefined): Array<"testnet-10" | "mainnet"> {
  if (raw === undefined) return [];
  const out: Array<"testnet-10" | "mainnet"> = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part !== "testnet-10" && part !== "mainnet") {
      throw new HardkasCliError(
        "ZK_ADDRESS_NETWORK_INVALID",
        `--address-network accepts testnet-10 and mainnet (comma-separated), got '${part}'. Nothing was done.`,
        { exitCode: HardkasExitCode.USAGE_ERROR }
      );
    }
    if (!out.includes(part)) out.push(part);
  }
  return out;
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
