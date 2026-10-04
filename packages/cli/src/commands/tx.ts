import { getOutput } from "../output.js";
import { Command } from "commander";
import { errorCodeOf, handleError, UI } from "../ui.js";
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

/**
 * JSON-PAPERCUTS #19 / DEPLOYMENT-PATH-CONTAINMENT-1 — a `--track` label that cannot be recorded
 * (not a plain name, or already recorded on this network) is refused BEFORE anything is broadcast,
 * so a bad label never costs a transaction. Nothing is planned, signed, broadcast or written.
 */
async function refuseUnrecordableTrackLabel(args: {
  label: string;
  network: string;
  json: boolean;
}): Promise<void> {
  const { loadDeployment } = await import("@hardkas/artifacts");
  const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
  let existing: unknown = null;
  let invalid: { code: string; message: string } | null = null;
  try {
    existing = await loadDeployment(process.cwd(), args.network, args.label);
  } catch (e: unknown) {
    invalid = { code: errorCodeOf(e), message: e instanceof Error ? e.message : String(e) };
  }
  if (!invalid && !existing) return;
  const code = invalid ? invalid.code : "DEPLOYMENT_EXISTS";
  const message = invalid
    ? `NOT EXECUTED: '--track ${args.label}' cannot be recorded (${invalid.message}). Nothing was broadcast or written.`
    : `NOT EXECUTED: deployment '${args.label}' already exists on network '${args.network}'. Nothing was broadcast or written: choose another label, or inspect the record with 'hardkas deploy inspect ${args.label} --network ${args.network}'.`;
  if (args.json) {
    UI.writeJson({
      ok: false,
      command: "tx send",
      mode: "cli",
      outcome: "not_executed",
      code,
      message,
      network: args.network,
      label: args.label
    });
  }
  throw new HardkasCliError(code, message, {
    exitCode: invalid ? HardkasExitCode.USAGE_ERROR : HardkasExitCode.RUNTIME_FAILURE,
    context: { network: args.network, label: args.label }
  });
}

/**
 * Demo-cut step 2 · T-A14b — what a network send may say about the transaction:
 * the state DERIVED from the evidence just recorded (the submission, plus any
 * observation already in the workspace), through `sdk.tx.status`. Right after a send
 * that is SUBMITTED (submitTransaction succeeded at that instant on the responding
 * node) or REJECTED_BY_NODE — never a claim of consensus validation.
 */
async function networkSendState(txId: string | undefined, network: string): Promise<string> {
  if (!txId || !/^[0-9a-f]{64}$/.test(txId)) return "not derivable: the node returned no txId";
  try {
    const { runTxStatus, stateHeadline } = await import("../runners/tx-status-runner.js");
    const r = await runTxStatus({ txId, observe: false, network, workspaceRoot: process.cwd() });
    return `${stateHeadline(r.derived)} — ${r.derived.reasons.join(" · ")}`;
  } catch (e: any) {
    return `not derivable here (${e?.message ?? String(e)}); run \`hardkas tx status ${txId}\``;
  }
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
    .option("--from <accountOrAddress>", "Sender account name or address (default: alice)")
    .option("--to <address>", "Recipient address or account name (default: bob)")
    .option("--amount <kas>", "Amount in KAS, up to 8 decimals (default: 1)")
    .option("--network <name>", "simulated, simnet, devnet, testnet-10, testnet-12 or mainnet (default: the config's default target)")
    .option("--fee-rate <sompiPerMass>", "Whole sompi per gram of mass (default: 1 in the simulator, 100 on real networks; not a live estimate)")
    .option("--change <accountOrAddress>", "Change destination (account name or address); default: the sender")
    .option("--provider <type>", "Provider mode (auto, rpc, simulated)", "auto")
    .option("--url <url>", "Node wRPC URL (default: ws://127.0.0.1:18210 for simnet and devnet; the config's rpcUrl is not used)")
    .option("--out <path>", "Save plan as artifact JSON")
    .option("--save <path>", "Alias for --out (Save plan as artifact JSON)")
    .option("--workflow-id <id>", "Optional deterministic workflow ID override")
    .option("--assumption-level <level>", "Optional assumption level override")
    .option("--wait-lock", "No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s)", false)
    .option("--lock-timeout <ms>", "No effect, kept for compatibility (see --wait-lock)", "30000")
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

        try {
          if (options.json) UI.setJsonMode(true);
          // ARTIFACT-MUTATION-UNITS (phase 2B): no command-level hold of the store; each store write takes it through the
          // gate. The command used to hold it across planner RPC calls, password prompts and the broadcast.
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
          let persistedPlanPath: string | undefined;
          if (
            fsNode.existsSync(
              (await import("node:path")).join(process.cwd(), ".hardkas")
            )
          ) {
            // the store directory is created by the store's gate when the lattice copy is written (ARTIFACT-MUTATION-1)
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const planId = artifact.planId || "unknown";
            const latticeFile = (await import("node:path")).join(
              artifactsDir,
              `${timestamp}-${planId}.plan.json`
            );
            await writeArtifact(latticeFile, artifact);
            persistedPlanPath = latticeFile;
          }

          if (options.json) {
            UI.writeJson(artifact);
          } else {
            getOutput().writeLine(formatTxPlanArtifact(artifact));
            if (outPath) getOutput().writeLine(`\nArtifact saved to: ${outPath}`);
            // Demo-ready · E21: say where the plan was persisted (the path actually written),
            // so `tx sign` can be given it without searching .hardkas/artifacts/.
            if (persistedPlanPath) {
              const shown = (await import("node:path")).relative(process.cwd(), persistedPlanPath);
              getOutput().writeLine(`${outPath ? "" : "\n"}Plan saved to: ${shown}`);
              const signer = options.from || positionalFrom;
              if (!outPath && signer && !String(signer).includes(":")) {
                getOutput().writeLine(`Next: hardkas tx sign ${shown} --account ${signer}`);
              }
            } else if (!outPath) {
              getOutput().writeLine(`\nPlan not saved (no .hardkas workspace here); use --out <file> to keep it.`);
            }
          }
        } catch (e) {
          throw e;
        }
      }
    );

  tx.command("sign <planPath>")
    .description(`Sign a transaction plan artifact ${UI.maturity("stable")}`)
    .option("--account <name>", "Account name to sign with")
    .option("--out <path>", "Save signed artifact JSON")
    .option("--fixture", "Sign with the built-in fixture test key (any network except mainnet)", false)
    .option("--allow-mainnet-signing", "Mainnet signing stays refused in this release; the flag only lets synthetic --threshold entries through", false)
    .option("--threshold <number>", "Synthetic multisig threshold for tests (no Kaspa multisig script is produced)")
    .option("--required-signers <list>", "Comma-separated signers, no spaces (with --threshold above 1)")
    .option("--append", "Append signature to a partially signed transaction", false)
    .option("--target <name>", "Named execution target from hardkas.config.ts")
    .option("--password-env <env>", "Read the encrypted account's keystore password from this environment variable")
    .option("--password-stdin", "Read the encrypted account's keystore password from stdin", false)
    .option("--wait-lock", "No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s)", false)
    .option("--lock-timeout <ms>", "No effect, kept for compatibility (see --wait-lock)", "30000")
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
          passwordEnv?: string;
          passwordStdin: boolean;
          waitLock: boolean;
          lockTimeout: string;
          json: boolean;
        }
      ) => {
        try {
          if (options.json) UI.setJsonMode(true);
          // ARTIFACT-MUTATION-UNITS (phase 2B): no command-level hold of the store; each store write takes it through the
          // gate. The command used to hold it across planner RPC calls, password prompts and the broadcast.
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
              : {}),
            ...(options.passwordEnv ? { passwordEnv: options.passwordEnv } : {}),
            passwordStdin: options.passwordStdin,
            json: options.json
          });

          if (options.out) await writeArtifact(options.out, signedArtifact);
          if (options.json) {
            UI.writeJson(signedArtifact);
          } else {
            getOutput().writeLine(formatSignedTxArtifact(signedArtifact));
            if (options.out)
              getOutput().writeLine(`\nSigned artifact saved to: ${options.out}`);
          }
        } catch (e) {
          throw e;
        }
      }
    );

  tx.command("status <txIdOrPath>")
    .description(
      "Show the derived state of a txId (SUBMITTED, MEMPOOL_ACCEPTED, ACCEPTED, CONFIRMED, FINALIZED, REORGED, …) from the workspace evidence plus one new observation, or the signature coverage of a plan/signed artifact path"
    )
    .option("--no-observe", "Derive from the evidence already in the workspace; take no new observation")
    .option("-n, --network <network>", "Network whose configured node observes (default: the network of the recorded submission)")
    .option("--json", "Output as JSON", false)
    .action(async (artifactPath: string, options: { json: boolean; observe: boolean; network?: string }) => {
      try {
        if (options.json) UI.setJsonMode(true);
        // Demo-cut step 2 · T-A14b: a txId shows the Q4 derived state (the same
        // `sdk.tx.status` the SDK exposes); a path keeps the signature-coverage view.
        const fsMod = await import("node:fs");
        const { isTxIdentifier, runTxStatus, renderTxStatusRows, txStatusJson, stateHeadline } = await import("../runners/tx-status-runner.js");
        if (isTxIdentifier(artifactPath) && !fsMod.existsSync(artifactPath)) {
          const r = await runTxStatus({
            txId: artifactPath,
            observe: options.observe !== false,
            ...(options.network ? { network: options.network } : {}),
            workspaceRoot: process.cwd()
          });
          if (options.json) {
            UI.writeJson(txStatusJson(r));
          } else {
            UI.causality(`Transaction state: ${stateHeadline(r.derived)}`, renderTxStatusRows(r), [
              `hardkas tx wait ${r.txId} --until confirmed`
            ], "info");
          }
          return;
        }
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
    .option("--target <name>", "Named execution target from hardkas.config.ts (signed-artifact mode: it must match the artifact and never redirects the send)")
    .option("--from <accountOrAddress>", "Sender (shortcut mode)")
    .option("--to <address>", "Recipient (shortcut mode)")
    .option("--amount <kas>", "Amount in KAS (shortcut mode)")
    .option("--network <name>", "Network name")
    .option("--fee-rate <sompiPerMass>", "Fee rate in sompi per mass (shortcut mode)")
    .option("--provider <type>", "Provider mode (auto, rpc, simulated; signed-artifact mode only)", "auto")
    .option("--url <url>", "RPC URL (optional override)")
    .option(
      "--yes",
      "Confirm broadcast. Required unless the network is simulated or simnet (in shortcut mode, unless --network simulated or simnet is given): without it the send is refused (NOT EXECUTED, exit 3) and nothing is written",
      false
    )
    .option("--wait-lock", "No effect, kept for compatibility: the command takes no lock of its own, and each store write waits for the store (up to 30 s)", false)
    .option("--lock-timeout <ms>", "No effect, kept for compatibility (see --wait-lock)", "30000")
    .option("--json", "Output as JSON", false)
    .option("--track <label>", "Signed-artifact mode: after an accepted broadcast, record a deployment with this label")
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
        try {
          if (options.json) UI.setJsonMode(true);
          // ARTIFACT-MUTATION-UNITS (phase 2B): no command-level hold of the store; each store write takes it through the
          // gate. The command used to hold it across planner RPC calls, password prompts and the broadcast.
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

            if (options.track) {
              await refuseUnrecordableTrackLabel({
                label: options.track,
                network: options.network ?? String(signedArtifact.networkId),
                json: options.json
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

            // JSON-PAPERCUTS #19: the deployment record (`--track`) is written BEFORE anything is
            // printed, so the one JSON envelope (or the human block) states whether it was recorded.
            // A record that could not be written never turns the broadcast into a failure exit
            // (AUX-11: submitted = exit 0; a non-zero exit reads as "not sent" and invites a
            // re-send): it is reported as `tracking.recorded: false` with the typed code, a warning
            // and the exact `deploy track` command to re-run.
            type TrackingOutcome =
              | { requested: true; label: string; recorded: true; record: unknown }
              | { requested: true; label: string; recorded: false; code: string; message: string; retry: string };
            let tracking: TrackingOutcome | undefined;
            if (options.track && result.accepted) {
              const label = options.track;
              // Only an authenticated `confirmed` status counts; a submission is "sent".
              const trackStatus =
                outcome.kind === "receipt" && outcome.decided && outcome.status === "confirmed" ? "confirmed" : "sent";
              const retry =
                `hardkas deploy track ${label} --network ${result.networkName}` +
                (result.txId ? ` --tx-id ${result.txId}` : "") +
                (signedArtifact.sourcePlanId ? ` --plan ${signedArtifact.sourcePlanId}` : "") +
                ` --status ${trackStatus}`;
              try {
                const { trackDeploymentInternal } = await import("../runners/deployment-runners.js");
                // the record goes under the deployments' own lock, as `deploy track` does; already broadcast, it waits for
                // that lock instead of failing on it
                const { withLock } = await import("@hardkas/core");
                const record = await withLock(
                  { rootDir: process.cwd(), name: "deployments", command: "hardkas tx send --track", wait: true },
                  () =>
                    trackDeploymentInternal(process.cwd(), {
                      label,
                      network: result.networkName,
                      txId: result.txId,
                      plan: signedArtifact.sourcePlanId,
                      status: trackStatus,
                      silent: true
                    })
                );
                tracking = { requested: true, label, recorded: true, record };
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                tracking = { requested: true, label, recorded: false, code: errorCodeOf(e), message, retry };
              }
            }
            const trackingWarning =
              tracking && !tracking.recorded
                ? `DEPLOYMENT_TRACK_FAILED: the transaction was broadcast, but the deployment record '${tracking.label}' was not written (${tracking.code}: ${tracking.message}). Re-run: ${tracking.retry}`
                : null;

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
                  warnings: trackingWarning ? [trackingWarning] : [],
                  explanation: sendExplanation({ receipt: result.receipt, txId: result.txId })
                },
                ...(tracking ? { tracking } : {}),
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
              // Demo-cut · T-A14b (network part): a network send states the DERIVED state
              // (SUBMITTED / REJECTED_BY_NODE), never "Consensus Validated: YES".
              const txIdShown = result.txId && /^[0-9a-f]{64}$/.test(result.txId) ? result.txId : (signedArtifact as any).txId;
              const networkRows: Record<string, string | undefined> = isSimulated
                ? {
                    "Replay Status": "not run (hardkas replay verify <artifactId>)",
                    "Consensus Validated": "NO"
                  }
                : {
                    State: await networkSendState(txIdShown, String(result.networkName)),
                    "Replay Status": "not supported for network submissions"
                  };
              UI.causality(
                isSimulated
                  ? "Transaction simulated successfully"
                  : result.accepted
                    ? "Transaction submitted to the node"
                    : "Transaction NOT accepted by the node",
                {
                  "Execution ID": result.executionId,
                  "Artifact ID": receiptArtifactId(result.receipt) ?? "unknown",
                  [txIdShown === result.txId ? "Tx ID" : "Tx ID (as signed)"]: txIdShown ?? "unknown",
                  Network: result.networkName,
                  "Execution Scope": isSimulated
                    ? "local simulated execution"
                    : "network submission",
                  "Artifact Written": result.receiptPath || ".hardkas/artifacts/...",
                  Projection: "SQLite query-store (indexed while the dashboard runs)",
                  ...networkRows
                },
                [
                  ...nextStepsAfterSend({ receipt: result.receipt, txId: result.txId }),
                  ...(!isSimulated && txIdShown ? [`hardkas tx status ${txIdShown}`] : [])
                ],
                !isSimulated && !result.accepted ? "fail" : "ok"
              );
              if (tracking?.recorded) {
                UI.success(`Tracked deployment: ${tracking.label} (${result.networkName})`);
              } else if (trackingWarning) {
                UI.warning(trackingWarning);
              }
            }

            if (!result.accepted) {
              const { HardkasCliError } = await import("../cli-errors.js");
              throw new HardkasCliError(
                "TX_SUBMISSION_REJECTED",
                `The node did not accept the transaction (${(result.receipt as any)?.submitResult?.error ?? "no reason returned"}); the submission was recorded as ${receiptArtifactId(result.receipt) ?? "unknown"}.`,
                { exitCode: 1 }
              );
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
              // Demo-cut · T-A14b: the network state is derived, never asserted.
              const flowTxId = sendResult?.artifact?.txId;
              const txIdShown = flowTxId && /^[0-9a-f]{64}$/.test(flowTxId) ? flowTxId : (result.steps.sign.artifact as any)?.txId;
              const networkRows: Record<string, string | undefined> = isSimulated
                ? {
                    "Replay Status": "not run (hardkas replay verify <artifactId>)",
                    "Consensus Validated": "NO"
                  }
                : {
                    State: await networkSendState(txIdShown, String(result.networkId)),
                    "Replay Status": "not supported for network submissions"
                  };

              UI.causality(
                isSimulated
                  ? "Transaction simulated successfully"
                  : flowAccepted
                    ? "Transaction submitted to the node"
                    : "Transaction NOT accepted by the node",
                {
                  // Wave 1.5 · AUD-14 (simulator part): no replay ran here, so no
                  // replay id or replay verdict is printed.
                  "Execution ID": `exec_${Date.now().toString(36)}`,
                  "Artifact ID": receiptArtifactId(sendResult?.artifact?.receipt) ?? "unknown",
                  [txIdShown === flowTxId ? "Tx ID" : "Tx ID (as signed)"]: txIdShown ?? "unknown",
                  Network: options.network || "simulated",
                  "Execution Scope": isSimulated
                    ? "local simulated execution"
                    : "network submission",
                  "Artifact Written":
                    sendResult?.artifact?.receiptPath || ".hardkas/artifacts/...",
                  Projection: "SQLite query-store (indexed while the dashboard runs)",
                  ...networkRows
                },
                [
                  ...nextStepsAfterSend({ receipt: sendResult?.artifact?.receipt, txId: sendResult?.artifact?.txId }),
                  ...(!isSimulated && txIdShown ? [`hardkas tx status ${txIdShown}`] : []),
                  "hardkas dev last --replay",
                  "hardkas status"
                ],
                !isSimulated && !flowAccepted ? "fail" : "ok"
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
    .description(
      `Wait until the derived state of a txId reaches ACCEPTED or CONFIRMED (blue-score depth ≥ the HardKAS policy), observing the configured node, then until that node's UTXO view reflects it ${UI.maturity("stable")}`
    )
    .option("--until <target>", "accepted or confirmed", "confirmed")
    .option("--timeout <seconds>", "Timeout in seconds", "60")
    .option("--interval <seconds>", "Seconds between observations", "2")
    .option("-n, --network <network>", "Network whose configured node observes (default: the network of the recorded submission)")
    .option("--json", "Output as JSON", false)
    .action(async (txId: string, options: { until: string; timeout: string; interval: string; network?: string; json: boolean }) => {
      if (options.json) UI.setJsonMode(true);
      const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
      if (options.until !== "accepted" && options.until !== "confirmed") {
        throw new HardkasCliError("TX_WAIT_TARGET_INVALID", `--until must be "accepted" or "confirmed" (got "${options.until}")`, {
          exitCode: HardkasExitCode.USAGE_ERROR
        });
      }
      // Demo-cut step 2 · T-A14b: the wait follows the Q4 derived state; it never
      // assumes confirmation and never prints "Settlement Proof".
      const { runTxWait } = await import("../runners/tx-wait-runner.js");
      const { renderTxStatusRows, stateHeadline } = await import("../runners/tx-status-runner.js");
      const r = await runTxWait({
        txId,
        until: options.until,
        timeoutMs: Math.max(0, Number(options.timeout)) * 1000,
        intervalMs: Math.max(0.2, Number(options.interval)) * 1000,
        ...(options.network ? { network: options.network } : {}),
        workspaceRoot: process.cwd(),
        onUpdate: (line) => {
          if (!options.json) UI.logHuman(`  • ${line}`);
        }
      });
      if (options.json) {
        UI.writeJson({
          ok: true,
          command: "tx wait",
          mode: "cli",
          txId: r.txId,
          network: r.network,
          outcome: r.outcome,
          until: r.until,
          state: r.derived.status,
          ...(r.derived.confirmations ? { confirmations: r.derived.confirmations } : {}),
          looks: r.looks,
          ...(r.utxoView ? { utxoView: r.utxoView } : {}),
          derived: r.derived
        });
        return;
      }
      const rows: Record<string, string | undefined> = renderTxStatusRows({
        txId: r.txId,
        network: r.network,
        derived: r.derived,
        look: r.lastObservationArtifactId
          ? { taken: true, artifactId: r.lastObservationArtifactId }
          : { taken: false, reason: "a simulator txId: there is no network to observe" }
      });
      // Demo-ready: the node's UTXO view after the target was reached (a view, not a state).
      if (r.utxoView) {
        rows["UTXO View"] = r.utxoView.checked
          ? `reflects this transaction: an output of it is listed for ${r.utxoView.addresses.length} address(es) and the inputs it spent are no longer listed (${r.utxoView.looks} look(s))`
          : `not checked: ${r.utxoView.reason}`;
      }
      UI.causality(
        r.outcome === "synthetic"
          ? `${r.derived.status}: executed by the HardKAS simulator; there is no network to wait for`
          : `Reached ${r.until.toUpperCase()}: ${stateHeadline(r.derived)}`,
        rows,
        undefined,
        r.outcome === "synthetic" ? "info" : "ok"
      );
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
