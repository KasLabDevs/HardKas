import { Command } from "commander";
import { assertMainnetTransactionsDisabled, summarizeNodeIdentity } from "@hardkas/core";
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
    .description(
      "Kaspa Toccata L1 Zero-Knowledge lock tools (kaspa-wasm ZkScriptBuilder): build and verify locks; `spend` sends a lock's spend through HardKAS's send (recorded, one submission per txId) and `observe` looks at it"
    );

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
    .option("--address-network <networks>", "Also return the P2SH address for testnet-10; proof-only needs --ack-image-id-only-lock, and is never built for a public test program (an output-bound lock of one is, with a warning: anyone can trigger its payout). mainnet (any spelling) is refused while mainnet is locked down (MAINNET_SIGNING_DISABLED): nothing is built")
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
        // ESCALÓN 4 · P37: the networks are decided first (a mainnet one is refused before the receipt is read)
        const addressNetworks = parseAddressNetworks(options.addressNetwork);
        const receiptHex = await readReceiptOption(options.receipt);
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
    .description(
      "Verify Toccata P2SH scripts: the pinned RISC Zero verifying key, control root and control id, and a redeem script byte-identical to the one HardKAS builds for the parameters it carries; consensusEnforced only for such an output-bound lock (payout, change, one input, input limit), never from the presence of opcodes. The scripts come from a lock's record (--scripts, as 'spend' takes it) or as hex (--redeem-script and --sig-script)"
    )
    .option(
      "--scripts <file>",
      "The lock's record: the JSON 'zk toccata build-scripts --json' printed (as 'spend --scripts' takes it). Its scripts are verified against what the record claims (image id, journal hash, binding mode, bound outputs) and any --image-id / --journal-hash / --expected-* given; its P2SH script and addresses must be its redeem script's. Not with --redeem-script / --sig-script"
    )
    .option("--redeem-script <hex>", "Redeem script hex (with --sig-script; not with --scripts)")
    .option("--sig-script <hex>", "Signature script hex (with --redeem-script; not with --scripts)")
    .option("--image-id <hex>", "Expected 32-byte hex Image ID")
    .option("--journal-hash <hex>", "Expected 32-byte hex Journal Hash")
    .option("--expected-mode <mode>", "Expected binding mode ('proof-only' or 'proof-and-output-bound')")
    .option("--expected-payout-address <address>", "Expected consensus-bound payout address")
    .option("--expected-payout-amount <sompi>", "Expected consensus-bound payout amount in sompi")
    .option("--expected-change-address <address>", "Expected consensus-bound change address (output 1)")
    .option("--expected-change-amount <sompi>", "Expected consensus-bound change amount in sompi")
    .option("--json", "Output as JSON", false)
    .action(async (options: {
      scripts?: string;
      redeemScript?: string;
      sigScript?: string;
      imageId?: string;
      journalHash?: string;
      expectedMode?: "proof-only" | "proof-and-output-bound";
      expectedPayoutAddress?: string;
      expectedPayoutAmount?: string;
      expectedChangeAddress?: string;
      expectedChangeAmount?: string;
      json?: boolean;
    }) => {
      // BETA-FIX W2: the scripts come from ONE place — a record (--scripts) or the hex pair — decided before anything is read
      const usageV = (code: string, message: string) => new HardkasCliError(code, `${message} Nothing was verified.`, { exitCode: HardkasExitCode.USAGE_ERROR });
      if (options.scripts !== undefined && (options.redeemScript !== undefined || options.sigScript !== undefined)) {
        throw usageV("ZK_VERIFY_SCRIPTS_INPUT_CONFLICT", "--scripts gives the lock's redeem and signature scripts (its record); do not also pass --redeem-script or --sig-script.");
      }
      if (options.scripts === undefined && (options.redeemScript === undefined || options.sigScript === undefined)) {
        throw usageV(
          "ZK_VERIFY_SCRIPTS_INPUT_REQUIRED",
          "Give the lock: --scripts <record> (the JSON 'zk toccata build-scripts --json' prints), or --redeem-script <hex> with --sig-script <hex>."
        );
      }
      const expected = {
        ...(options.imageId ? { imageId: options.imageId } : {}),
        ...(options.journalHash ? { journalHash: options.journalHash } : {}),
        ...(options.expectedMode ? { expectedBindingMode: options.expectedMode } : {}),
        ...(options.expectedPayoutAddress ? { expectedPayoutAddress: options.expectedPayoutAddress } : {}),
        ...(options.expectedPayoutAmount ? { expectedPayoutAmount: BigInt(options.expectedPayoutAmount) } : {}),
        ...(options.expectedChangeAddress ? { expectedChangeAddress: options.expectedChangeAddress } : {}),
        ...(options.expectedChangeAmount
          ? { expectedChangeAmount: parseSompiOption("--expected-change-amount", options.expectedChangeAmount) }
          : {})
      };
      const { verifyR0Groth16Scripts } = await import("@hardkas/sdk");
      if (options.scripts === undefined) {
        const result = verifyR0Groth16Scripts({ redeemScript: options.redeemScript!, sigScript: options.sigScript!, ...expected });
        printResult(result, options.json);
        if (!result.ok) {
          throw new HardkasCliError("ZK_SCRIPTS_VERIFY_FAILED", "Toccata ZK script verification failed", { exitCode: 1 });
        }
        return;
      }
      const result = await verifyZkScriptsRecord(options.scripts, expected);
      printResult(result, options.json);
      if (!result.ok) {
        throw new HardkasCliError("ZK_SCRIPTS_VERIFY_FAILED", "Toccata ZK script verification failed", { exitCode: 1 });
      }
    });

  // ZK-SEND-1 · the spend of a lock through HardKAS's send, and a look at it
  toccata
    .command("spend")
    .description(
      "Spend a RISC Zero Groth16 lock through HardKAS's send (the SDK's spendR0Groth16Lock): the lock is rebuilt from the receipt and its record (--scripts) or its parameters and checked as verify-scripts checks it; the plan, the signed transaction, the ZK fact and the submission are recorded in the workspace (one submission per txId); the node must prove its network and say it is synced. mainnet is refused; testnet-10 needs experimental + network.allowPublic"
    )
    .requiredOption("--receipt <pathOrHex>", "Path to receipt file (.hex) or raw receipt hex string (the lock's proof)")
    .requiredOption("--utxo <txid:index>", "The lock's UTXO to spend (its amount is read from the node)")
    .option("--scripts <file>", "The lock's record: the JSON 'zk toccata build-scripts --json' printed (its parameters are used; its scripts must be the ones the receipt rebuilds)")
    .option("--image-id <hex>", "Without --scripts: the lock's 32-byte hex Image ID")
    .option("--journal-hash <hex>", "Without --scripts: the lock's 32-byte hex Journal Hash")
    .option("--mode <mode>", "Without --scripts: the lock's binding mode, 'proof-only' (default) or 'proof-and-output-bound'")
    .option("--payout-address <address>", "Without --scripts, proof-and-output-bound: the lock's bound payout address")
    .option("--payout-amount <sompi>", "Without --scripts, proof-and-output-bound: the lock's bound payout amount in sompi")
    .option("--change-address <address>", "Without --scripts, proof-and-output-bound: the lock's bound change address")
    .option("--change-amount <sompi>", "Without --scripts, proof-and-output-bound: the lock's bound change amount in sompi")
    .option("--max-fee <sompi>", "Without --scripts, proof-and-output-bound: the lock's fee cap (default 50000000)")
    .option("--to <address>", "proof-only: where the UTXO minus the fee goes (required); proof-and-output-bound: the bound payout (default; another address is refused)")
    .option("--fee <sompi>", "proof-only: the fee in sompi (default: the recommended fee for the measured spend); proof-and-output-bound: implied by the lock (a different one is refused)")
    .option("--compute-budget <n>", "The input's compute budget (default 1600; at least what the verifier needs)")
    .option("--ack-image-id-only-lock", "testnet-10, proof-only: acknowledge that the lock binds only the image id (whoever sees the proof in the mempool can redirect the spend)", false)
    .option("--network <name>", "Network: simnet or testnet-10 (default: the workspace's, else simnet). mainnet is refused; testnet-10 needs experimental + network.allowPublic in the config")
    .option("--url <url>", "Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet)")
    .option("--yes", "Confirm the broadcast. Required unless the network is simnet: without it the spend is refused (NOT EXECUTED, exit 3) and nothing is written", false)
    .option("--wait", "After the send, wait until the node accepts the spend (observed, as 'tx wait --until accepted')", false)
    .option("--timeout <seconds>", "With --wait: how long to wait (integer seconds, 1..3600)", "120")
    .option("--json", "Output as JSON", false)
    .action(async (options: ZkSpendCliOptions) => {
      if (options.json) UI.setJsonMode(true);
      await runZkSpend(options);
    });

  toccata
    .command("observe <txId>")
    .description(
      "One look at a ZK spend through the node (as 'tx status' looks: the observation is recorded) and its ZK operation status, from the ZK fact 'zk toccata spend' recorded (or --fact). mainnet is refused"
    )
    .option("--fact <file>", "The ZK fact (hardkas.zkVerificationFact.v1) of the spend, when the workspace does not hold it")
    .option("--network <name>", "Network: simnet or testnet-10 (default: the workspace's, else simnet). mainnet is refused; testnet-10 needs experimental + network.allowPublic in the config")
    .option("--url <url>", "Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet)")
    .option("--json", "Output as JSON", false)
    .action(async (txId: string, options: { fact?: string; network?: string; url?: string; json?: boolean }) => {
      if (options.json) UI.setJsonMode(true);
      await runZkObserve(txId, options);
    });
}

interface ZkSpendCliOptions {
  receipt: string;
  utxo: string;
  scripts?: string;
  imageId?: string;
  journalHash?: string;
  mode?: string;
  payoutAddress?: string;
  payoutAmount?: string;
  changeAddress?: string;
  changeAmount?: string;
  maxFee?: string;
  to?: string;
  fee?: string;
  computeBudget?: string;
  ackImageIdOnlyLock?: boolean;
  network?: string;
  url?: string;
  yes?: boolean;
  wait?: boolean;
  timeout?: string;
  json?: boolean;
}

const usage = (code: string, message: string) => new HardkasCliError(code, `${message} Nothing was sent.`, { exitCode: HardkasExitCode.USAGE_ERROR });

/**
 * The network of a ZK spend or look: --network, else the workspace's (a `simulated` workspace's is simnet), else simnet.
 * Only simnet and testnet-10 (the networks a lock has an address on), each as itself (an alias that declares another
 * network is refused). Mainnet was refused before this, by name and by what an alias declares.
 */
async function zkNodeNetwork(explicit: string | undefined, config: any): Promise<"simnet" | "testnet-10"> {
  const { workspaceNetworkOf } = await import("../mainnet-guard.js");
  const { declaredNetworkIdOf } = await import("@hardkas/core");
  let n = explicit ?? workspaceNetworkOf(config) ?? "simnet";
  if (explicit === undefined && n === "simulated") n = "simnet";
  const declared = declaredNetworkIdOf(config, n) ?? n;
  if ((n !== "simnet" && n !== "testnet-10") || declared !== n) {
    throw usage("ZK_SPEND_NETWORK_UNSUPPORTED", `A ZK lock is spent and observed on simnet or testnet-10, not on '${n}'${declared !== n ? ` (declared ${declared})` : ""}.`);
  }
  return n;
}

/** A Kaspa outpoint "txid:index". */
function parseOutpointOption(raw: string): { transactionId: string; index: number } {
  const m = /^([0-9a-fA-F]{64}):(\d{1,10})$/.exec(String(raw).trim());
  if (!m || Number(m[2]) > 0xffffffff) throw usage("ZK_SPEND_UTXO_INVALID", `--utxo must be <64-hex txid>:<output index>, got '${raw}'.`);
  return { transactionId: m[1]!.toLowerCase(), index: Number(m[2]) };
}

/**
 * A lock's record: the JSON `zk toccata build-scripts --json` prints (a successful hardkas.zkToccataScripts.v1), read the
 * same way by `spend --scripts` and `verify-scripts --scripts`, its output binding (proof-and-output-bound) with exact
 * amounts. `invalid` makes the command's own refusal (ZK_SPEND_SCRIPTS_INVALID, ZK_VERIFY_SCRIPTS_RECORD_INVALID).
 */
async function readZkScriptsRecord(file: string, invalid: (message: string) => HardkasCliError): Promise<{ record: any; bindingPolicy?: any }> {
  const fs = await import("node:fs");
  const { stripBom } = await import("@hardkas/core");
  let record: any;
  try {
    record = JSON.parse(stripBom(fs.readFileSync(file, "utf8")));
  } catch (e: any) {
    throw invalid(`--scripts ${file} is not a readable JSON record (${e?.code ?? e?.message}).`);
  }
  const { HardkasSchemas } = await import("@hardkas/artifacts");
  if (
    record?.schema !== HardkasSchemas.ZkToccataScriptsV1 ||
    record?.ok !== true ||
    typeof record.imageId !== "string" ||
    typeof record.journalHash !== "string" ||
    typeof record.redeemScript !== "string" ||
    typeof record.sigScript !== "string"
  ) {
    throw invalid(`--scripts ${file} is not a successful '${HardkasSchemas.ZkToccataScriptsV1}' record (the JSON 'zk toccata build-scripts --json' prints).`);
  }
  const p = record.bindingMode === "proof-and-output-bound" ? record.bindingPolicy : undefined;
  const amount = (v: unknown, what: string) => {
    try {
      return BigInt(String(v));
    } catch {
      throw invalid(`--scripts: ${what} is not an amount.`);
    }
  };
  const bindingPolicy = p
    ? {
        mode: "proof-and-output-bound",
        payout: { address: String(p.payout?.address), amountSompi: amount(p.payout?.amountSompi, "the payout amount") },
        ...(p.change ? { change: { address: String(p.change.address), amountSompi: amount(p.change.amountSompi, "the change amount") } } : {}),
        ...(p.maxFeeSompi !== undefined ? { maxFeeSompi: amount(p.maxFeeSompi, "the fee cap") } : {})
      }
    : undefined;
  return { record, ...(bindingPolicy ? { bindingPolicy } : {}) };
}

/**
 * BETA-FIX W2 · `verify-scripts --scripts <record>`: the record's scripts verified (verifyR0Groth16Scripts) against what
 * the record claims — image id, journal hash, binding mode and, output-bound, its payout and change — and, when the
 * caller gives any, against the caller's expectations too (both must hold; the issues of both are reported). The record
 * itself must be its redeem script's: its P2SH script public key the hash of it, each address it carries (simnet,
 * testnet-10) that script's address on that network — what a user funds. Mainnet addresses are never computed (locked
 * down). Offline: no node.
 */
async function verifyZkScriptsRecord(file: string, expected: Record<string, unknown>): Promise<any> {
  const { record, bindingPolicy } = await readZkScriptsRecord(file, (message) =>
    new HardkasCliError("ZK_VERIFY_SCRIPTS_RECORD_INVALID", `${message} Nothing was verified.`, { exitCode: HardkasExitCode.USAGE_ERROR })
  );
  const { verifyR0Groth16Scripts } = await import("@hardkas/sdk");
  const scripts = { redeemScript: String(record.redeemScript), sigScript: String(record.sigScript) };
  const claimed = verifyR0Groth16Scripts({
    ...scripts,
    imageId: record.imageId,
    journalHash: record.journalHash,
    ...(record.bindingMode === "proof-only" || record.bindingMode === "proof-and-output-bound" ? { expectedBindingMode: record.bindingMode } : {}),
    ...(bindingPolicy
      ? {
          expectedPayoutAddress: bindingPolicy.payout.address,
          expectedPayoutAmount: bindingPolicy.payout.amountSompi,
          ...(bindingPolicy.change ? { expectedChangeAddress: bindingPolicy.change.address, expectedChangeAmount: bindingPolicy.change.amountSompi } : {})
        }
      : {})
  });
  const issues: Array<{ code: string; message: string }> = [...claimed.issues];
  const seen = new Set(issues.map((i) => `${i.code}\u0000${i.message}`));
  let ok = claimed.ok;
  if (Object.keys(expected).length > 0) {
    const asked = verifyR0Groth16Scripts({ ...scripts, ...expected } as any);
    ok = ok && asked.ok;
    for (const i of asked.issues) {
      const key = `${i.code}\u0000${i.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(i);
      }
    }
  }
  // the record is what a user funds: its P2SH script and addresses must be the redeem script's
  const core = await import("@hardkas/core");
  const redeem = scripts.redeemScript.trim().toLowerCase();
  let spk: { version: number; script: string } | undefined;
  try {
    spk = core.silverP2shLock(redeem);
  } catch {
    spk = undefined;
  }
  const recorded = record.p2shScriptPublicKey;
  const p2shScriptPublicKeyMatches =
    spk !== undefined && Number(recorded?.version) === Number(spk.version) && String(recorded?.script ?? "").toLowerCase() === String(spk.script).toLowerCase();
  if (!p2shScriptPublicKeyMatches) {
    issues.push({ code: "ZK_SCRIPTS_RECORD_P2SH_MISMATCH", message: "The record's p2shScriptPublicKey is not the P2SH script of its redeem script: funding it would not lock to these scripts" });
  }
  const addressesMatch: Record<string, boolean> = {};
  for (const [key, network] of [["simnet", "simnet"], ["testnet10", "testnet-10"]] as const) {
    const given = record.p2shAddresses?.[key];
    if (given === undefined || given === "") continue;
    let derived: string | undefined;
    try {
      derived = core.silverP2shAddress(redeem, network);
    } catch {
      derived = undefined;
    }
    addressesMatch[key] = derived !== undefined && String(given) === derived;
    if (!addressesMatch[key]) {
      issues.push({ code: "ZK_SCRIPTS_RECORD_ADDRESS_MISMATCH", message: `The record's ${network} P2SH address ${String(given)} is not its redeem script's (${derived ?? "not derivable"}): do not fund it` });
    }
  }
  ok = ok && p2shScriptPublicKeyMatches && Object.values(addressesMatch).every(Boolean);
  return { ...claimed, ok, issues, scriptsRecord: { path: file, p2shScriptPublicKeyMatches, addressesMatch } };
}

/** The lock's parameters: from its record (--scripts) or from the options; never both. */
async function zkLockParameters(options: ZkSpendCliOptions): Promise<{ imageId: string; journalHash: string; bindingPolicy?: any; record?: any }> {
  const given = ["imageId", "journalHash", "mode", "payoutAddress", "payoutAmount", "changeAddress", "changeAmount", "maxFee"].filter((k) => (options as any)[k] !== undefined);
  if (options.scripts !== undefined) {
    if (given.length > 0) throw usage("ZK_SPEND_LOCK_OPTIONS_CONFLICT", `--scripts gives the lock's parameters; do not also pass ${given.map((k) => "--" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())).join(", ")}.`);
    const { record, bindingPolicy } = await readZkScriptsRecord(options.scripts, (message) => usage("ZK_SPEND_SCRIPTS_INVALID", message));
    return { imageId: record.imageId, journalHash: record.journalHash, ...(bindingPolicy ? { bindingPolicy } : {}), record };
  }
  if (!options.imageId || !options.journalHash) throw usage("ZK_SPEND_LOCK_REQUIRED", "Give the lock: --scripts <record>, or --image-id and --journal-hash (and its binding options).");
  const mode = options.mode ?? "proof-only";
  if (mode !== "proof-only" && mode !== "proof-and-output-bound") throw usage("ZK_BINDING_MODE_INVALID", `--mode must be 'proof-only' or 'proof-and-output-bound', got '${mode}'.`);
  if (mode === "proof-only") {
    if (options.payoutAddress || options.payoutAmount || options.changeAddress || options.changeAmount || options.maxFee) {
      throw usage("ZK_BINDING_OPTIONS_WITHOUT_MODE", "--payout-*, --change-* and --max-fee describe a lock of --mode proof-and-output-bound.");
    }
    return { imageId: options.imageId, journalHash: options.journalHash };
  }
  if (!options.payoutAddress || !options.payoutAmount) throw usage("ZK_BINDING_POLICY_INCOMPLETE", "--payout-address and --payout-amount describe a proof-and-output-bound lock.");
  if ((options.changeAddress === undefined) !== (options.changeAmount === undefined)) throw usage("ZK_BINDING_POLICY_INCOMPLETE", "--change-address and --change-amount go together.");
  return {
    imageId: options.imageId,
    journalHash: options.journalHash,
    bindingPolicy: {
      mode: "proof-and-output-bound",
      payout: { address: options.payoutAddress, amountSompi: parseSompiOption("--payout-amount", options.payoutAmount) },
      ...(options.changeAddress && options.changeAmount ? { change: { address: options.changeAddress, amountSompi: parseSompiOption("--change-amount", options.changeAmount) } } : {}),
      ...(options.maxFee !== undefined ? { maxFeeSompi: parseSompiOption("--max-fee", options.maxFee) } : {})
    }
  };
}

/**
 * The SDK on the spend's network, its client the node that proved its identity: this workspace's kaspa-l1 execution of
 * that network (by rpc or localnet; never the simulator, which cannot run the precompile). The caller closes it.
 */
async function openZkSdk(workspaceRoot: string, rpc: unknown, network: string): Promise<any> {
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: workspaceRoot, network, autoBootstrap: true });
  const e: any = sdk.execution;
  if ((e?.mode !== "rpc" && e?.mode !== "localnet") || e?.domain !== "kaspa-l1" || sdk.network !== network) {
    await sdk.close();
    throw usage("ZK_SPEND_NODE_REQUIRED", `This workspace runs ${network} as ${e?.mode} ${e?.domain} ${e?.network}: a ZK spend needs a kaspa-l1 node execution of ${network} (the simulator cannot run the Groth16 precompile).`);
  }
  (sdk as any).rpc = rpc;
  return sdk;
}

const jsonSafe = (v: unknown): any => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

async function runZkSpend(options: ZkSpendCliOptions): Promise<void> {
  const { invocationWorkspaceRoot } = await import("../workspace-root.js");
  const { refuseMainnetBroadcast, workspaceConfigForGuard } = await import("../mainnet-guard.js");
  const workspaceRoot = invocationWorkspaceRoot();
  const config = await workspaceConfigForGuard(workspaceRoot);
  // MAINNET TOTAL LOCKDOWN: a spend is a broadcast; refused first — before the network is resolved, the confirmation is
  // asked, the receipt is read or any node is contacted (any spelling, an alias that declares it, the workspace's own)
  refuseMainnetBroadcast(config, [options.network], "zk toccata spend", options.network === undefined);
  const network = await zkNodeNetwork(options.network, config);
  // AUX-11 (tx send's rule): off simnet, nothing happens without --yes
  if (!options.yes && network !== "simnet") {
    const message = `NOT EXECUTED: 'zk toccata spend' on ${network} requires explicit confirmation. Nothing was read, built, broadcast or written. To execute, re-run with --yes.`;
    if (options.json) getOutput().writeJson({ ok: false, command: "zk toccata spend", mode: "cli", outcome: "not_executed", code: "ZK_SPEND_CONFIRMATION_REQUIRED", network, message });
    throw new HardkasCliError("ZK_SPEND_CONFIRMATION_REQUIRED", message, { exitCode: HardkasExitCode.POLICY_DENIED, context: { network } });
  }
  const utxo = parseOutpointOption(options.utxo);
  const timeoutSeconds = options.timeout === undefined ? 120 : Number(options.timeout);
  if (!/^\d{1,4}$/.test(String(options.timeout ?? "120")) || timeoutSeconds < 1 || timeoutSeconds > 3600) throw usage("ZK_TIMEOUT_INVALID", `--timeout must be an integer number of seconds in [1, 3600], got '${options.timeout}'.`);
  const computeBudget = options.computeBudget === undefined ? undefined : /^\d{1,5}$/.test(options.computeBudget) ? Number(options.computeBudget) : NaN;
  if (computeBudget !== undefined && !(computeBudget <= 65535)) throw usage("ZK_COMPUTE_BUDGET_OUT_OF_RANGE", `--compute-budget must be an integer in [0, 65535], got '${options.computeBudget}'.`);
  const feeSompi = options.fee === undefined ? undefined : parseSompiOption("--fee", options.fee);
  // The node target, from the config only (nothing contacted yet): the public-network opt-in and the endpoint authority
  const { resolveL1NodeTarget, proveL1Node, recordModeOf } = await import("../runners/l1-node-target.js");
  const target = await resolveL1NodeTarget(network, options.url);

  // The lock, rebuilt by HardKAS from the receipt (a record's scripts are never used as given)
  const lock = await zkLockParameters(options);
  const receiptHex = await readReceiptOption(options.receipt);
  const { buildR0Groth16Scripts, assertSpendableZkLock } = await import("@hardkas/sdk");
  if (lock.record) {
    // a record verify-scripts refuses is refused as such, before anything is compared or built
    try {
      assertSpendableZkLock({ ...lock.record, ...(lock.bindingPolicy ? { bindingPolicy: lock.bindingPolicy } : {}) });
    } catch (e: any) {
      throw new HardkasCliError(String(e?.code ?? "ZK_SPEND_LOCK_REFUSED"), String(e?.message ?? e), { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    }
  }
  const scripts = buildR0Groth16Scripts({
    imageId: lock.imageId,
    journalHash: lock.journalHash,
    receiptHex,
    ...(lock.bindingPolicy ? { bindingPolicy: lock.bindingPolicy } : {}),
    ...(network === "testnet-10" ? { addressNetworks: ["testnet-10" as const] } : {}),
    acknowledgeImageIdOnlyLock: options.ackImageIdOnlyLock === true
  });
  if (!scripts.ok) {
    throw new HardkasCliError("ZK_SPEND_LOCK_REFUSED", `The lock is not rebuilt from this receipt: ${scripts.issues.map((i: any) => `${i.code}: ${i.message}`).join("; ")}. Nothing was sent.`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
  if (lock.record && (String(lock.record.redeemScript).toLowerCase() !== scripts.redeemScript || String(lock.record.sigScript).toLowerCase() !== scripts.sigScript)) {
    throw new HardkasCliError("ZK_SPEND_SCRIPTS_MISMATCH", `The record's scripts are not the ones this receipt and the record's parameters build: it is not this lock's record. Nothing was sent.`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }

  // The node: its identity proven (container + digest when managed, its own report otherwise) and synced
  const { identity, rpc } = await proveL1Node(target, "zk toccata spend");
  let sdk: any;
  try {
    sdk = await openZkSdk(workspaceRoot, rpc, network);
    const { spendR0Groth16Lock } = await import("@hardkas/sdk");
    const result = await spendR0Groth16Lock(sdk, {
      scripts,
      utxo,
      ...(options.to !== undefined ? { destinationAddress: options.to } : {}),
      ...(feeSompi !== undefined ? { feeSompi } : {}),
      ...(computeBudget !== undefined ? { computeBudget } : {})
    });
    const send = result.send;
    const submission: any = send.submission ?? send.receipt;
    const { submitOutcomeOf } = await import("@hardkas/artifacts");
    const outcome = send.alreadySubmitted === true ? "already-submitted" : send.submitted === true ? "submitted" : submitOutcomeOf(submission?.submitResult) === "rejected" ? "rejected" : "unknown";
    let waited: any;
    if ((outcome === "submitted" || outcome === "already-submitted") && options.wait) {
      try {
        const w = await sdk.tx.waitForAccepted({ txId: result.txId, timeoutMs: timeoutSeconds * 1000 });
        waited = { status: w.status, acceptingBlockHash: w.acceptingBlockHash, confirmations: w.confirmations, state: w.derived?.status };
      } catch (e: any) {
        throw new HardkasCliError(
          "ZK_SPEND_WAIT_TIMEOUT",
          `The spend ${result.txId} was submitted (submission ${String(submission?.contentHash)}), but it was not observed accepted within ${timeoutSeconds} s (${String(e?.message ?? e)}). It was not sent again: observe it with 'hardkas zk toccata observe ${result.txId}'.`,
          { exitCode: HardkasExitCode.RUNTIME_FAILURE }
        );
      }
    }
    const report = jsonSafe({
      ok: outcome === "submitted" || outcome === "already-submitted",
      command: "zk toccata spend",
      outcome,
      network,
      txId: result.txId,
      bindingMode: result.built.bindingMode,
      consensusEnforced: result.built.consensusEnforced,
      spent: { ...utxo, amountSompi: result.plan.inputs?.[0]?.amountSompi },
      outputs: result.plan.outputs,
      feeSompi: result.built.feeSompi,
      computeBudget: result.built.computeBudget,
      storageMass: result.plan.storageMass,
      plan: { artifactId: result.plan.contentHash, path: result.planPath },
      signed: { artifactId: result.signed.contentHash, path: result.signedPath },
      ...(result.zkFact ? { zkFact: { artifactId: result.zkFact.contentHash, path: result.zkFactPath, offChainVerification: result.zkFact.offChainVerification } } : {}),
      submission: { artifactId: submission?.contentHash, path: send.receiptPath, submitResult: submission?.submitResult },
      ...(send.rejection ? { rejection: send.rejection } : {}),
      ...(waited ? { wait: waited } : {}),
      node: { rpcUrl: target.rpcUrl, mode: recordModeOf(target), ...summarizeNodeIdentity(identity as any) },
      warnings: result.built.warnings
    });
    if (outcome === "rejected") {
      if (options.json) getOutput().writeJson(report);
      throw new HardkasCliError("ZK_SPEND_REJECTED_BY_NODE", `The node rejected the spend ${result.txId}: ${String(submission?.submitResult?.error ?? "rejected")}${send.rejection?.code ? ` (${send.rejection.code})` : ""}. It is recorded and never re-sent.`, {
        exitCode: HardkasExitCode.RUNTIME_FAILURE
      });
    }
    if (outcome === "unknown") {
      if (options.json) getOutput().writeJson(report);
      throw new HardkasCliError(
        "ZK_SPEND_OUTCOME_UNKNOWN",
        `The outcome of the spend ${result.txId} is unknown (${String(submission?.submitResult?.error ?? "no answer naming it")}); the node may hold it. It was not re-sent: observe it with 'hardkas zk toccata observe ${result.txId}'.`,
        { exitCode: HardkasExitCode.RUNTIME_FAILURE }
      );
    }
    if (options.json) {
      getOutput().writeJson(report);
      return;
    }
    getOutput().writeLine(
      [
        `${outcome === "already-submitted" ? "Already submitted (not sent again)" : "Submitted"}: ZK spend ${result.txId} on ${network}`,
        `  lock ${report.bindingMode}${report.consensusEnforced ? " (outputs bound on-chain)" : " (outputs NOT bound on-chain)"}, spent ${utxo.transactionId}:${utxo.index} (${report.spent.amountSompi} sompi)`,
        ...report.outputs.map((o: any) => `  pays ${o.amountSompi} sompi to ${o.address}`),
        `  fee ${report.feeSompi} sompi, compute budget ${report.computeBudget}`,
        `  submission ${report.submission.artifactId}${waited ? `, accepted by ${waited.acceptingBlockHash}` : ""}`,
        ...report.warnings.map((w: any) => `  warning: ${w.code} - ${w.message}`),
        `  next: hardkas zk toccata observe ${result.txId}`
      ].join("\n")
    );
  } finally {
    if (sdk) await sdk.close();
    if (rpc) await (rpc as any).close();
  }
}

async function runZkObserve(txId: string, options: { fact?: string; network?: string; url?: string; json?: boolean }): Promise<void> {
  const { invocationWorkspaceRoot } = await import("../workspace-root.js");
  const { refuseMainnetConnection, workspaceConfigForGuard } = await import("../mainnet-guard.js");
  const workspaceRoot = invocationWorkspaceRoot();
  const config = await workspaceConfigForGuard(workspaceRoot);
  refuseMainnetConnection(config, [options.network], "zk toccata observe", options.network === undefined);
  const network = await zkNodeNetwork(options.network, config);
  if (!/^[0-9a-f]{64}$/.test(txId)) throw new HardkasCliError("ZK_OBSERVE_TXID_INVALID", `<txId> must be 64 lowercase hex, got '${txId}'. Nothing was observed.`, { exitCode: HardkasExitCode.USAGE_ERROR });
  const { HardkasSchemas, checkArtifactIdentity, enumerateWorkspaceArtifactsSync, deriveZkOperationStatus } = await import("@hardkas/artifacts");
  // the fact: the one given, else the one the workspace holds for this txId (a fact that does not verify is not used)
  let fact: any;
  let factSource: string | undefined;
  const isFactOf = (a: any) => a?.schema === HardkasSchemas.ZkVerificationFactV1 && String(a?.txId).toLowerCase() === txId && checkArtifactIdentity(a).ok;
  if (options.fact !== undefined) {
    const fs = await import("node:fs");
    const { stripBom } = await import("@hardkas/core");
    try {
      fact = JSON.parse(stripBom(fs.readFileSync(options.fact, "utf8")));
    } catch (e: any) {
      throw new HardkasCliError("ZK_FACT_INVALID", `--fact ${options.fact} is not a readable JSON fact (${e?.code ?? e?.message}). Nothing was observed.`, { exitCode: HardkasExitCode.USAGE_ERROR });
    }
    if (!isFactOf(fact)) throw new HardkasCliError("ZK_FACT_INVALID", `--fact ${options.fact} is not a verified ${HardkasSchemas.ZkVerificationFactV1} of transaction ${txId}. Nothing was observed.`, { exitCode: HardkasExitCode.USAGE_ERROR });
    factSource = options.fact;
  } else {
    const found = new Map<string, { artifact: any; path?: string }>();
    for (const entry of enumerateWorkspaceArtifactsSync(workspaceRoot) as any[]) {
      if (isFactOf(entry.artifact)) found.set(String(entry.artifact.contentHash), { artifact: entry.artifact, path: entry.path ?? entry.file });
    }
    // several facts of one txId (the spend built again: another plan id) do not say which one counts: none is used
    if (found.size === 1) {
      const only = [...found.values()][0]!;
      fact = only.artifact;
      factSource = only.path ?? "workspace";
    } else if (found.size > 1) {
      factSource = `${found.size} facts of this transaction in the workspace (give one with --fact)`;
    }
  }
  const { resolveL1NodeTarget } = await import("../runners/l1-node-target.js");
  const target = await resolveL1NodeTarget(network, options.url);
  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  // NODE-NETWORK-IDENTITY-1: only a node that says it serves this network answers the look
  const rpc = new JsonWrpcKaspaClient({ rpcUrl: target.rpcUrl, expectedNetworkId: network });
  let sdk: any;
  try {
    const { Hardkas } = await import("@hardkas/sdk");
    sdk = await Hardkas.open({ cwd: workspaceRoot, network });
    sdk.rpc = rpc;
    const { observation, observationPath, derived } = await sdk.tx.observe(txId);
    const zkStatus = fact ? deriveZkOperationStatus({ zkFact: fact, txStatus: derived }) : undefined;
    const report = jsonSafe({
      ok: true,
      command: "zk toccata observe",
      network,
      txId,
      state: derived.status,
      reasons: derived.reasons,
      ...(derived.acceptingBlockHash ? { acceptingBlockHash: derived.acceptingBlockHash } : {}),
      ...(derived.confirmations ? { confirmations: derived.confirmations } : {}),
      ...(zkStatus ? { zkStatus } : {}),
      zkFact: fact ? { artifactId: fact.contentHash, source: factSource, offChainVerification: fact.offChainVerification } : factSource ? { artifactId: null, source: factSource } : null,
      observation: { artifactId: observation.contentHash, path: observationPath }
    });
    if (options.json) {
      getOutput().writeJson(report);
      return;
    }
    getOutput().writeLine(
      [
        `ZK spend ${txId} on ${network}: ${derived.status}${derived.acceptingBlockHash ? ` (accepting block ${derived.acceptingBlockHash})` : ""}`,
        ...(zkStatus ? [`  ZK operation: ${(zkStatus as any).kind ?? JSON.stringify(zkStatus)}`] : ["  no ZK fact of this spend in the workspace (--fact <file> gives one)"]),
        ...((derived.reasons ?? []) as string[]).map((r) => `  ${r}`),
        `  observation ${observation.contentHash}`
      ].join("\n")
    );
  } finally {
    if (sdk) await sdk.close();
    await rpc.close();
  }
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


/**
 * ESCALÓN 4 · P37 · MAINNET TOTAL LOCKDOWN: a lock's signature script is the authorization of its spend, so a mainnet
 * address network, in any spelling (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case), is refused with
 * MAINNET_SIGNING_DISABLED before anything is read or built (the SDK refuses it too). Then only testnet-10 is accepted.
 */
function parseAddressNetworks(raw: string | undefined): Array<"testnet-10"> {
  if (raw === undefined) return [];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  assertMainnetTransactionsDisabled("sign", parts, "zk toccata build-scripts --address-network: no mainnet lock is built");
  const out: Array<"testnet-10"> = [];
  for (const part of parts) {
    if (part !== "testnet-10") {
      throw new HardkasCliError(
        "ZK_ADDRESS_NETWORK_INVALID",
        `--address-network accepts testnet-10 (mainnet is locked down), got '${part}'. Nothing was done.`,
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
