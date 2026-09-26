import { getOutput } from "../output.js";
import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { bigIntReplacer } from "@hardkas/artifacts";
import { runTxProfile } from "../runners/tx-profile-runner.js";
import { runTxPlan } from "../runners/tx-plan-runner.js";
import { runTxSign } from "../runners/tx-sign-runner.js";
import { runTxSend } from "../runners/tx-send-runner.js";
import { runTxFlow } from "../runners/tx-flow.js";
import { runTxReceipt } from "../runners/tx-receipt-runner.js";
import { HardkasSchemas } from "@hardkas/artifacts";

/**
 * Wave 2(e) · AUX-11 — `tx send` ends in exactly one of three unambiguous outcomes:
 * `submitted` (exit 0), `not_executed` (this refusal, exit 3 = POLICY_DENIED) or a failure
 * (exit ≠ 0). Without `--yes` on a non-simulated network nothing is planned, signed,
 * broadcast or written, and the result is an explicit refusal — never a dry-run that
 * reads as success to a human or to automation.
 */
export const TX_SEND_CONFIRMATION_REQUIRED = "TX_SEND_CONFIRMATION_REQUIRED";

async function declineUnconfirmedSend(args: {
  json: boolean;
  network: string;
  retry: string;
}): Promise<never> {
  const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
  const message =
    `NOT EXECUTED: 'tx send' on ${args.network} requires explicit confirmation. ` +
    `Nothing was planned, signed, broadcast or written. To execute, re-run with --yes.`;
  if (args.json) {
    UI.writeJson({
      ok: false,
      command: "tx send",
      mode: "cli",
      outcome: "not_executed",
      code: TX_SEND_CONFIRMATION_REQUIRED,
      network: args.network,
      message,
      nextSteps: [args.retry]
    });
  }
  throw new HardkasCliError(TX_SEND_CONFIRMATION_REQUIRED, message, {
    exitCode: HardkasExitCode.POLICY_DENIED,
    suggestion: args.retry,
    context: { network: args.network }
  });
}

export function registerTxCommands(program: Command) {
  const tx = program.command("tx").description("L1 Transaction commands");

  tx.command("profile <path>")
    .description(
      `Show detailed mass and fee breakdown for a transaction plan ${UI.maturity("stable")}`
    )
    .option("--json", "Output as JSON", false)
    .action(async (path: string, options: { json: boolean }) => {
      try {
        await runTxProfile({ path, ...options, workspaceRoot: process.cwd() });
      } catch (e) {
        throw e;
      }
    });

  tx.command("batch")
    .description(`Process a batch of transactions sequentially ${UI.maturity("stable")}`)
    .requiredOption("--file <path>", "Path to JSON file containing batch payments")
    .option("--network <name>", "Network name")
    .option("--workspace <path>", "Override workspace root directory")
    .option("--json", "Output as JSON", false)
    .action(async (options: any) => {
      try {
        const { runTxBatch } = await import("../runners/tx-batch-runner.js");
        if (options.json) UI.setJsonMode(true);
        await runTxBatch(options);
      } catch (e) {
        throw e;
      }
    });

  tx.command("plan [from] [to]")
    .description(`Build a transaction plan artifact ${UI.maturity("stable")}`)
    .option("--target <name>", "Named execution target from hardkas.config.ts")
    .option("--from <accountOrAddress>", "Sender account name or address")
    .option("--to <address>", "Recipient address")
    .option("--amount <kas>", "Amount in KAS")
    .option("--network <name>", "Kaspa network name")
    .option("--fee-rate <sompiPerMass>", "Fee rate in sompi per mass")
    .option("--change <accountOrAddress>", "Change destination (account name or address); default: the sender")
    .option("--provider <type>", "Provider mode (auto, rpc, simulated)", "auto")
    .option("--url <url>", "RPC URL (optional override)")
    .option("--out <path>", "Save plan as artifact JSON")
    .option("--save <path>", "Alias for --out (Save plan as artifact JSON)")
    .option("--workflow-id <id>", "Optional deterministic workflow ID override")
    .option("--assumption-level <level>", "Optional assumption level override")
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(
      async (
        fromArg?: string,
        toArg?: string,
        rawOptions?: any
      ) => {
        let positionalFrom: string | undefined = undefined;
        let positionalTo: string | undefined = undefined;
        let options = rawOptions;

        if (typeof fromArg === "object" && fromArg !== null) {
          options = fromArg;
        } else {
          positionalFrom = fromArg;
          positionalTo = toArg;
        }

        options = options || {};

        const { withLock } = await import("@hardkas/core");
        try {
          if (options.json) UI.setJsonMode(true);
          await withLock(
            {
              rootDir: process.cwd(),
              name: "artifacts",
              command: "hardkas tx plan",
              wait: options.waitLock,
              timeoutMs: parseInt(options.lockTimeout || "30000")
            },
            async () => {
              const { loadHardkasConfig } = await import("@hardkas/config");
              const { writeArtifact, formatTxPlanArtifact } =
                await import("@hardkas/artifacts");

              const loaded = await loadHardkasConfig({ workspaceRoot: process.cwd() });
              const artifact = await runTxPlan({
                ...(options.target ? { targetName: options.target } : {}),
                from: options.from || positionalFrom || "alice",
                to: options.to || positionalTo || "bob",
                amount: options.amount || "1",
                ...(options.network ? { networkId: options.network } : {}),
                provider: options.provider || "auto",
                ...(options.feeRate ? { feeRate: options.feeRate } : {}),
                ...(options.change ? { changeAddress: options.change } : {}),
                config: loaded.config,
                ...(options.workflowId ? { workflowId: options.workflowId } : {}),
                ...(options.assumptionLevel
                  ? { assumptionLevel: options.assumptionLevel }
                  : {}),
                ...(options.url ? { url: options.url } : {})
              });

              const outPath = options.out || options.save;
              if (outPath) await writeArtifact(outPath, artifact);

              // Always persist to .hardkas/artifacts/ for lattice indexing
              const artifactsDir = (await import("node:path")).join(
                process.cwd(),
                ".hardkas",
                "artifacts"
              );
              const fsNode = await import("node:fs");
              if (
                fsNode.existsSync(
                  (await import("node:path")).join(process.cwd(), ".hardkas")
                )
              ) {
                if (!fsNode.existsSync(artifactsDir))
                  fsNode.mkdirSync(artifactsDir, { recursive: true });
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const planId = artifact.planId || "unknown";
                const latticeFile = (await import("node:path")).join(
                  artifactsDir,
                  `${timestamp}-${planId}.plan.json`
                );
                await writeArtifact(latticeFile, artifact);
              }

              if (options.json) {
                UI.writeJson(artifact);
              } else {
                getOutput().writeLine(formatTxPlanArtifact(artifact));
                if (outPath) getOutput().writeLine(`\nArtifact saved to: ${outPath}`);
              }
            }
          );
        } catch (e) {
          throw e;
        }
      }
    );

  tx.command("sign <planPath>")
    .description(`Sign a transaction plan artifact ${UI.maturity("stable")}`)
    .option("--account <name>", "Account name to sign with")
    .option("--out <path>", "Save signed artifact JSON")
    .option("--fixture", "Use fixture signer for Docker testing on simnet", false)
    .option("--allow-mainnet-signing", "Allow signing for mainnet", false)
    .option("--threshold <number>", "Multisig threshold")
    .option("--required-signers <list>", "Comma-separated list of required signers")
    .option("--append", "Append signature to a partially signed transaction", false)
    .option("--target <name>", "Named execution target from hardkas.config.ts")
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(
      async (
        planPath: string,
        options: {
          account?: string;
          out?: string;
          fixture: boolean;
          allowMainnetSigning: boolean;
          threshold?: string;
          requiredSigners?: string;
          append: boolean;
          target?: string;
          waitLock: boolean;
          lockTimeout: string;
          json: boolean;
        }
      ) => {
        const { withLock } = await import("@hardkas/core");
        try {
          if (options.json) UI.setJsonMode(true);
          await withLock(
            {
              rootDir: process.cwd(),
              name: "artifacts",
              command: "hardkas tx sign",
              wait: options.waitLock,
              timeoutMs: parseInt(options.lockTimeout)
            },
            async () => {
              const {
                readArtifact,
                readTxPlanArtifact,
                readSignedTxArtifact,
                writeArtifact,
                formatSignedTxArtifact
              } = await import("@hardkas/artifacts");
              const { loadHardkasConfig } = await import("@hardkas/config");

              const raw = (await readArtifact(planPath)) as any;
              let planArtifact;
              if (raw && raw.schema === HardkasSchemas.SignedTx) {
                planArtifact = await readSignedTxArtifact(planPath);
              } else {
                planArtifact = await readTxPlanArtifact(planPath);
              }
              const loaded = await loadHardkasConfig({ workspaceRoot: process.cwd() });

              let signer;
              if (options.fixture) {
                const { HardkasFixtureSigner } = await import("@hardkas/testing");
                const networkId = (planArtifact as any).networkId || "simnet";
                signer = new HardkasFixtureSigner(networkId);
              }

              const signedArtifact = await runTxSign({
                planArtifact: planArtifact as any,
                ...(options.account ? { accountName: options.account } : {}),
                config: loaded.config,
                ...(options.target ? { targetName: options.target } : {}),
                ...(signer ? { signer } : {}),
                allowMainnetSigning: options.allowMainnetSigning,
                append: options.append,
                ...(options.threshold !== undefined
                  ? { threshold: parseInt(options.threshold) }
                  : {}),
                ...(options.requiredSigners !== undefined
                  ? { requiredSigners: options.requiredSigners.split(",") }
                  : {})
              });

              if (options.out) await writeArtifact(options.out, signedArtifact);
              if (options.json) {
                UI.writeJson(signedArtifact);
              } else {
                getOutput().writeLine(formatSignedTxArtifact(signedArtifact));
                if (options.out)
                  getOutput().writeLine(`\nSigned artifact saved to: ${options.out}`);
              }
            }
          );
        } catch (e) {
          throw e;
        }
      }
    );

  tx.command("status <path>")
    .description("Show the signature coverage and status of a transaction artifact")
    .option("--json", "Output as JSON", false)
    .action(async (artifactPath: string, options: { json: boolean }) => {
      try {
        if (options.json) UI.setJsonMode(true);
        const { readArtifact } = await import("@hardkas/artifacts");
        const raw = (await readArtifact(artifactPath)) as any;
        if (
          !raw ||
          (raw.schema !== HardkasSchemas.SignedTx && raw.schema !== HardkasSchemas.TxPlan)
        ) {
          throw new Error("Artifact is not a transaction plan or signed transaction.");
        }

        if (options.json) {
          UI.writeJson({
            schema: raw.schema,
            status: raw.status || "planned",
            multisig: raw.multisig || null
          });
          return;
        }

        getOutput().writeLine(`\nHardKAS Transaction Status`);
        getOutput().writeLine(`==========================`);
        getOutput().writeLine(`File:         ${artifactPath}`);
        getOutput().writeLine(`Schema:       ${raw.schema}`);

        if (raw.schema === HardkasSchemas.TxPlan) {
          getOutput().writeLine(`Status:       PLANNED`);
          getOutput().writeLine(`Plan ID:      ${raw.planId}`);
          getOutput().writeLine(`From:         ${raw.from.address}`);
          getOutput().writeLine(`To:           ${raw.to.address}`);
          getOutput().writeLine(`Amount:       ${raw.amountSompi} sompi`);
        } else {
          getOutput().writeLine(`Status:       ${raw.status.toUpperCase()}`);
          getOutput().writeLine(`Signed ID:    ${raw.signedId}`);
          getOutput().writeLine(`Plan ID:      ${raw.sourcePlanId}`);
          getOutput().writeLine(`From:         ${raw.from.address}`);
          getOutput().writeLine(`To:           ${raw.to.address}`);
          getOutput().writeLine(`Amount:       ${raw.amountSompi} sompi`);

          if (raw.multisig) {
            getOutput().writeLine(
              `Threshold:    ${raw.multisig.signatures.length} of ${raw.multisig.threshold} Required Signers`
            );
            getOutput().writeLine(`\nSignatures Collected:`);
            const signatures = raw.multisig.signatures || [];
            const required = raw.multisig.requiredSigners || [];
            required.forEach((addr: string) => {
              const hasSigned = signatures.some((s: any) => s.signer === addr);
              getOutput().writeLine(`  [${hasSigned ? "✓" : " "}] ${addr}`);
            });
          } else {
            getOutput().writeLine(`Signers:      Single-signature transaction`);
          }
        }
        getOutput().writeLine("");
      } catch (e) {
        getOutput().error(e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e));
        throw e;
      }
    });

  tx.command("send [signedPath]")
    .description(
      `Broadcast a signed transaction or send directly ${UI.maturity("stable")}`
    )
    .option("--target <name>", "Named execution target from hardkas.config.ts")
    .option("--from <accountOrAddress>", "Sender (shortcut mode)")
    .option("--to <address>", "Recipient (shortcut mode)")
    .option("--amount <kas>", "Amount in KAS (shortcut mode)")
    .option("--network <name>", "Network name")
    .option("--fee-rate <sompiPerMass>", "Fee rate in sompi per mass (shortcut mode)")
    .option("--provider <type>", "Provider mode (auto, rpc, simulated)", "auto")
    .option("--url <url>", "RPC URL (optional override)")
    .option(
      "--yes",
      "Confirm broadcast. Required on any non-simulated network: without it the send is refused (NOT EXECUTED, exit 3) and nothing is written",
      false
    )
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .option("--track <label>", "Auto-track deployment with this label")
    .action(
      async (
        signedPath: string | undefined,
        options: {
          target?: string;
          from?: string;
          to?: string;
          amount?: string;
          network?: string;
          feeRate?: string;
          provider: string;
          url?: string;
          yes: boolean;
          waitLock: boolean;
          lockTimeout: string;
          json: boolean;
          track?: string;
        }
      ) => {
        const { withLock } = await import("@hardkas/core");
        try {
          if (options.json) UI.setJsonMode(true);
          await withLock(
            {
              rootDir: process.cwd(),
              name: "artifacts",
              command: "hardkas tx send",
              wait: options.waitLock,
              timeoutMs: parseInt(options.lockTimeout)
            },
            async () => {
              const { loadHardkasConfig } = await import("@hardkas/config");
              const loaded = await loadHardkasConfig({ workspaceRoot: process.cwd() });

              if (signedPath) {
                const { readSignedTxArtifact } = await import("@hardkas/artifacts");
                const signedArtifact = await readSignedTxArtifact(signedPath);

                if (
                  !options.yes &&
                  signedArtifact.networkId !== "simulated" &&
                  signedArtifact.networkId !== "simnet"
                ) {
                  await declineUnconfirmedSend({
                    json: options.json,
                    network: String(signedArtifact.networkId),
                    retry: `hardkas tx send ${signedPath} --yes`
                  });
                }

                const result = await runTxSend({
                  ...(options.target ? { targetName: options.target } : {}),
                  signedArtifact: signedArtifact as any,
                  ...(options.network ? { network: options.network } : {}),
                  provider: options.provider,
                  config: loaded.config,
                  ...(options.url ? { url: options.url } : {})
                });

                // Wave 1.2 · CLI-NEXTSTEPS-1 / IC-5′.11: artifactId is the receipt's
                // canonical identity; the txId is labelled as a txId.
                // Wave 1.3 · R-iii: the verdict comes from the authenticated outcome.
                const { nextStepsAfterSend, receiptArtifactId, sendExplanation, sendOutcome } = await import("../runners/next-steps.js");
                const outcome = sendOutcome(result.receipt);
                if (options.json) {
                  UI.writeJson({
                    ok: result.accepted,
                    // AUX-11: one of three unambiguous outcomes (submitted | rejected | not_executed).
                    outcome: result.accepted ? "submitted" : "rejected",
                    data: {
                      plan: undefined,
                      signed: signedArtifact,
                      receipt: result.receipt,
                      artifacts: [signedArtifact, result.receipt],
                      warnings: [],
                      explanation: sendExplanation({ receipt: result.receipt, txId: result.txId })
                    },
                    meta: {
                      network: result.networkName,
                      workspace: process.cwd(),
                      mode: "developer"
                    }
                  });
                } else {
                  const { UI } = await import("../ui.js");
                  const isSimulated =
                    result.networkName === "simulated" || result.rpcUrl === "simulated://local";

                  // Wave 1.5 · AUD-14 (simulator part): only computed outcomes are printed.
                  // The title is the authenticated outcome; no replay ran here, so no
                  // replay id or replay verdict is printed.
                  UI.causality(
                    isSimulated
                      ? "Transaction simulated successfully"
                      : result.accepted
                        ? "Transaction broadcast successfully"
                        : "Transaction broadcast NOT accepted by the node",
                    {
                      "Execution ID": result.executionId,
                      "Artifact ID": receiptArtifactId(result.receipt) ?? "unknown",
                      "Tx ID": result.txId,
                      Network: result.networkName,
                      "Execution Scope": isSimulated
                        ? "local simulated execution"
                        : "network broadcast",
                      "Artifact Written": result.receiptPath || ".hardkas/artifacts/...",
                      Projection: "SQLite query-store (indexed while the dashboard runs)",
                      "Replay Status": isSimulated
                        ? "not run (hardkas replay verify <artifactId>)"
                        : "network state dependent",
                      "Consensus Validated": isSimulated ? "NO" : "YES"
                    },
                    nextStepsAfterSend({ receipt: result.receipt, txId: result.txId })
                  );
                }

                if (!result.accepted) {
                  const { HardkasCliError } = await import("../cli-errors.js");
                  throw new HardkasCliError(
                    "TX_SUBMISSION_REJECTED",
                    `The node did not accept the transaction (${(result.receipt as any)?.submitResult?.error ?? "no reason returned"}); the submission was recorded as ${receiptArtifactId(result.receipt) ?? "unknown"}.`,
                    { exitCode: 1 }
                  );
                }

                if (options.track && result.accepted) {
                  const { trackDeploymentInternal } =
                    await import("../runners/deployment-runners.js");
                  await trackDeploymentInternal(process.cwd(), {
                    label: options.track,
                    network: result.networkName,
                    txId: result.txId,
                    plan: signedArtifact.sourcePlanId,
                    // Only an authenticated `confirmed` status counts; a submission is "sent".
                    status: outcome.kind === "receipt" && outcome.decided && outcome.status === "confirmed" ? "confirmed" : "sent",
                    silent: options.json
                  });
                }
              } else if (options.from && options.to && options.amount) {
                // AUX-11: the confirmation policy of `tx send` — required unless the network is
                // the simulator or a local simnet. Once it is satisfied the flow is told so
                // (`yes`); otherwise the flow's own guard blocks its send step and this command
                // would have nothing to report as a broadcast.
                const confirmationExempt =
                  options.network === "simulated" || options.network === "simnet";
                if (!options.yes && !confirmationExempt) {
                  await declineUnconfirmedSend({
                    json: options.json,
                    network: String(options.network ?? loaded.config.defaultNetwork ?? "unknown"),
                    retry: `hardkas tx send --from ${options.from} --to ${options.to} --amount ${options.amount}${options.network ? ` --network ${options.network}` : ""} --yes`
                  });
                }

                const result = await runTxFlow({
                  amount: options.amount!,
                  from: options.from!,
                  to: options.to!,
                  send: true,
                  yes: options.yes || confirmationExempt,
                  provider: options.provider,
                  config: loaded.config,
                  ...(options.network ? { network: options.network } : {}),
                  ...(options.feeRate ? { feeRate: options.feeRate } : {}),
                  ...(options.url ? { url: options.url } : {})
                });

                const { nextStepsAfterSend, receiptArtifactId, sendExplanation } = await import("../runners/next-steps.js");
                // R-iii: when the flow broadcast, the verdict is the runner's authenticated outcome.
                // AUX-11: only a send step that ran ("ok") can be submitted or rejected. A step the
                // flow blocked or skipped is NOT executed; a step (or an earlier step) that errored
                // is a failure. Neither may exit 0 or print anything that reads as a broadcast.
                const flowSend = result.steps.send;
                if (flowSend.status !== "ok") {
                  const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
                  const stepStatuses = {
                    plan: result.steps.plan.status,
                    sign: result.steps.sign.status,
                    send: flowSend.status
                  };
                  const erroredStep = (["plan", "sign", "send"] as const).find(
                    (k) => result.steps[k].status === "error"
                  );
                  const notExecuted = erroredStep === undefined;
                  const reason = erroredStep
                    ? `${erroredStep} step failed: ${result.steps[erroredStep].error ?? "no error message"}`
                    : flowSend.reason ?? "the send step did not run";
                  const code = notExecuted ? "TX_SEND_NOT_EXECUTED" : "TX_SEND_FAILED";
                  const message = `${notExecuted ? "NOT EXECUTED" : "FAILED"}: 'tx send' did not broadcast (${reason}).`;
                  if (options.json) {
                    UI.writeJson({
                      ok: false,
                      command: "tx send",
                      mode: "cli",
                      outcome: notExecuted ? "not_executed" : "failed",
                      code,
                      message,
                      network: result.networkId,
                      steps: stepStatuses
                    });
                  }
                  throw new HardkasCliError(code, message, {
                    exitCode: notExecuted ? HardkasExitCode.POLICY_DENIED : HardkasExitCode.RUNTIME_FAILURE,
                    context: { network: result.networkId, ...stepStatuses }
                  });
                }
                const flowAccepted = flowSend.artifact?.accepted !== false;
                if (options.json) {
                  const sendResult = result.steps.send;
                  UI.writeJson({
                    ok: flowAccepted,
                    // AUX-11: one of three unambiguous outcomes (submitted | rejected | not_executed).
                    outcome: flowAccepted ? "submitted" : "rejected",
                    data: {
                      plan: result.steps.plan.artifact,
                      signed: result.steps.sign.artifact,
                      receipt: sendResult?.artifact?.receipt,
                      artifacts: [
                        result.steps.plan.artifact,
                        result.steps.sign.artifact,
                        sendResult?.artifact?.receipt
                      ].filter(Boolean),
                      warnings: [],
                      explanation: sendExplanation({
                        receipt: sendResult?.artifact?.receipt,
                        txId: sendResult?.artifact?.txId
                      })
                    },
                    meta: {
                      network: options.network || "simulated",
                      workspace: process.cwd(),
                      mode: "developer"
                    }
                  });
                } else {
                  const { UI } = await import("../ui.js");
                  const sendResult = result.steps.send;
                  const isSimulated =
                    sendResult?.artifact?.rpcUrl === "simulated://local" ||
                    options.network === "simulated";

                  UI.causality(
                    isSimulated
                      ? "Transaction simulated successfully"
                      : flowAccepted
                        ? "Transaction broadcast successfully"
                        : "Transaction broadcast NOT accepted by the node",
                    {
                      // Wave 1.5 · AUD-14 (simulator part): no replay ran here, so no
                      // replay id or replay verdict is printed.
                      "Execution ID": `exec_${Date.now().toString(36)}`,
                      "Artifact ID": receiptArtifactId(sendResult?.artifact?.receipt) ?? "unknown",
                      "Tx ID": sendResult?.artifact?.txId ?? "unknown",
                      Network: options.network || "simulated",
                      "Execution Scope": isSimulated
                        ? "local simulated execution"
                        : "network broadcast",
                      "Artifact Written":
                        sendResult?.artifact?.receiptPath || ".hardkas/artifacts/...",
                      Projection: "SQLite query-store (indexed while the dashboard runs)",
                      "Replay Status": isSimulated
                        ? "not run (hardkas replay verify <artifactId>)"
                        : "network state dependent",
                      "Consensus Validated": isSimulated ? "NO" : "YES"
                    },
                    [
                      ...nextStepsAfterSend({ receipt: sendResult?.artifact?.receipt, txId: sendResult?.artifact?.txId }),
                      "hardkas dev last --replay",
                      "hardkas status"
                    ]
                  );
                }
                if (!flowAccepted) {
                  const { HardkasCliError } = await import("../cli-errors.js");
                  throw new HardkasCliError(
                    "TX_SUBMISSION_REJECTED",
                    `The node did not accept the transaction; the submission was recorded as ${receiptArtifactId(flowSend?.artifact?.receipt) ?? "unknown"}.`,
                    { exitCode: 1 }
                  );
                }
              } else {
                getOutput().error(
                  "Provide a path to a signed artifact or use --from, --to, --amount."
                );
                throw new Error("Command failed");
              }
            }
          );
        } catch (e) {
          throw e;
        }
      }
    );

  tx.command("receipt <txId>")
    .description(`Show transaction receipt ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (txId, options) => {
      try {
        const result = await runTxReceipt({ txId });
        if (options.json) {
          getOutput().writeJson({ ok: true, command: "tx receipt", mode: "cli", result: result.receipt });
        } else {
          getOutput().writeLine(result.formatted);
        }
      } catch (e) {
        throw e;
      }
    });

  tx.command("wait <txId>")
    .description(`Wait for transaction to be confirmed ${UI.maturity("stable")}`)
    .option("--timeout <seconds>", "Timeout in seconds", "60")
    .option("--url <url>", "Override RPC URL")
    .option("-n, --network <network>", "Network to use")
    .option("--address <address>", "Recipient address to verify UTXO maturity")
    .action(async (txId, options) => {
      try {
        const { loadHardkasConfig } = await import("@hardkas/config");
        const config = await loadHardkasConfig();
        const { runTxWait } = await import("../runners/tx-wait-runner.js");
        await runTxWait({
          txId,
          config: config.config,
          url: options.url,
          network: options.network,
          timeoutMs: parseInt(options.timeout) * 1000,
          address: options.address
        });
      } catch (e) {
        throw e;
      }
    });

  tx.command("verify <path>")
    .description(
      `Perform deep semantic verification of a transaction plan ${UI.maturity("preview")}`
    )
    .option("--json", "Output as JSON", false)
    .action(async (path, options) => {
      try {
        const { runTxVerify } = await import("../runners/tx-verify-runner.js");
        await runTxVerify({ path, json: options.json, workspaceRoot: process.cwd() });
      } catch (e) {
        throw e;
      }
    });

  tx.command("trace <txId>")
    .description(
      `Reconstruct the full operational trace of a transaction ${UI.maturity("research")}`
    )
    .action(async (txId: string) => {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError("TX_TRACE_DISABLED", "Tracing is temporarily disabled while the query API stabilizes.");
    });

  tx.command("compare <simulatedPath> <realPath>")
    .description(
      `Compare simulated vs real receipts for fidelity ${UI.maturity("stable")}`
    )
    .action(async (simulatedPath, realPath) => {
      try {
        const { runTxCompare } = await import("../runners/tx-compare-runner.js");
        await runTxCompare({ simulatedPath, realPath });
      } catch (e) {
        throw e;
      }
    });
}
