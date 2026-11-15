import { getOutput } from "../output.js";
import fs from "node:fs/promises";
import path from "node:path";
import { runTxFlow, type TxFlowResult } from "./tx-flow.js";
import { accountNeedsKeystorePassword } from "./tx-sign-runner.js";
import { sendOutcomeLabel } from "./next-steps.js";
import { loadHardkasConfig, type HardkasConfig } from "@hardkas/config";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { stripBom } from "@hardkas/core";
import { utxoOutpointKey } from "@hardkas/tx-builder";

/**
 * TX-BATCH-1: the keystore password of the batch's encrypted payers, read ONCE, before the first payment — from
 * --password-env, --password-stdin, or a prompt on a terminal (never with --json) — and checked against every encrypted
 * payer's keystore. A missing or wrong password stops the batch before anything is planned, signed or sent, so a batch
 * is never left half paid for want of it. Undefined when no payer needs one.
 */
async function batchKeystorePassword(args: {
  payments: any[];
  config: HardkasConfig;
  workspaceRoot: string;
  network: string;
  passwordEnv?: string | undefined;
  passwordStdin?: boolean | undefined;
  json?: boolean | undefined;
}): Promise<string | undefined> {
  const { resolveWorkspaceExecution } = await import("@hardkas/config");
  const { resolveHardkasAccount, unlockAccountKeystore } = await import("@hardkas/accounts");
  const resolvedConfig: any = { ...args.config, cwd: args.workspaceRoot };
  let execution: any;
  try {
    execution = resolveWorkspaceExecution({ config: resolvedConfig, network: args.network }).execution;
  } catch {
    return undefined; // every payment reports the refusal itself, as before
  }
  const encrypted = new Map<string, any>();
  for (const payment of args.payments) {
    if (!payment?.from) continue;
    try {
      const account: any = resolveHardkasAccount({ nameOrAddress: String(payment.from), config: resolvedConfig, executionTarget: execution });
      if (accountNeedsKeystorePassword(account)) encrypted.set(account.name, account);
    } catch {
      // a payer that does not resolve fails in its own payment, as before
    }
  }
  if (encrypted.size === 0) return undefined;
  const names = [...encrypted.keys()].join(", ");
  const nothingDone = `The batch pays from encrypted account(s) ${names}: nothing was planned, signed or sent.`;
  const { acquirePassword } = await import("./secrets.js");
  let password: string;
  try {
    password = await acquirePassword({
      env: args.passwordEnv,
      stdin: args.passwordStdin,
      interactive: !args.json,
      message: `Enter the keystore password of the batch's encrypted account(s) (${names}):`
    });
  } catch (e) {
    if (e instanceof HardkasCliError) throw new HardkasCliError(e.code, `${e.message} ${nothingDone}`, { exitCode: e.exitCode });
    throw e;
  }
  for (const account of encrypted.values()) {
    try {
      await unlockAccountKeystore({ name: account.name, keystorePath: account.keystorePath, keystoreKind: account.keystoreKind }, password);
    } catch (e) {
      // KEYSTORE_PASSWORD_INVALID (a wrong password) is the caller's to fix; a keystore that cannot be read is not
      const code = typeof (e as any)?.code === "string" ? (e as any).code : "KEYSTORE_UNLOCK_FAILED";
      throw new HardkasCliError(code, `${e instanceof Error ? e.message : String(e)} ${nothingDone}`, {
        exitCode: code === "KEYSTORE_PASSWORD_INVALID" ? HardkasExitCode.USAGE_ERROR : HardkasExitCode.RUNTIME_FAILURE
      });
    }
  }
  return password;
}

/**
 * TX-BATCH-1: the inputs of a payment whose transaction the node accepted, or may have (outcome unknown), mapped to
 * the address that owned them; a rejected or unsent one spent nothing. The simulator's state is updated by the send.
 */
function recordSpent(flow: TxFlowResult, spent: Map<string, string>): void {
  const plan: any = flow.steps.plan.artifact;
  if (!plan || plan.mode === "simulator") return;
  const send = flow.steps.send;
  const mayHaveSpent =
    send.status === "ok" && send.artifact
      ? send.artifact.accepted || sendOutcomeLabel(send.artifact.receipt, false) === "unknown"
      : send.effect?.operation === "broadcast" && (send.effect.outcome === "accepted" || send.effect.outcome === "unknown");
  if (!mayHaveSpent) return;
  for (const input of plan.inputs ?? []) {
    const key = utxoOutpointKey(input);
    if (key) spent.set(key, String(input.address ?? plan.from?.address));
  }
}

export async function runTxBatch(options: any) {
  const { file, network = "simulated", json, workspace, passwordEnv, passwordStdin } = options;

  if (!file) {
    throw new Error("Must provide --file with payments.json");
  }

  const loaded = await loadHardkasConfig({ cwd: workspace });
  // MAINNET TOTAL LOCKDOWN: the mainnet refusal comes first, with or without --one-transaction, before the file is
  // read, any payer is resolved or any keystore is opened (MAINNET_BROADCAST_DISABLED). Without this, a batch on
  // mainnet unlocked an encrypted payer's keystore before its plan step refused mainnet.
  {
    const { refuseMainnetBroadcast } = await import("../mainnet-guard.js");
    refuseMainnetBroadcast(loaded.config as any, [network], options.oneTransaction ? "tx batch --one-transaction" : "tx batch");
  }
  const filePath = path.resolve(workspace || process.cwd(), file);

  let payments: any[];
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(stripBom(content));
    // Accept both flat array and { payments: [...] } wrapper
    if (Array.isArray(parsed)) {
      payments = parsed;
    } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.payments)) {
      payments = parsed.payments;
    } else {
      throw new Error(
        "Invalid batch file format. Expected:\n" +
          '  Format 1 (array): [{"from":"alice","to":"bob","amount":"10"}]\n' +
          '  Format 2 (object): {"payments":[{"from":"alice","to":"bob","amount":"10"}]}'
      );
    }
  } catch (e) {
    if (e instanceof Error && ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).startsWith("Invalid batch file format")) throw e;
    throw new Error(
      `Failed to read or parse batch file ${file}: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`
    );
  }

  if (options.oneTransaction) {
    return runOneTransactionBatch({ payments, config: loaded.config, workspaceRoot: workspace || process.cwd(), network, json, passwordEnv, passwordStdin });
  }

  const keystorePassword = await batchKeystorePassword({
    payments,
    config: loaded.config,
    workspaceRoot: workspace || process.cwd(),
    network,
    passwordEnv,
    passwordStdin,
    json
  });

  const results = [];
  let successCount = 0;
  let failCount = 0;
  // TX-BATCH-1: what earlier payments of this batch spent (outpoint → owner address): never selected again
  const spentByBatch = new Map<string, string>();

  if (!json) {
    getOutput().writeLine(
      `Processing batch of ${payments.length} transactions sequentially...`
    );
  }

  // Strictly sequential execution for 0.7.5 to avoid UTXO race conditions
  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];

    if (!payment.from || !payment.to || !payment.amount) {
      if (!json)
        getOutput().error(
          `[${i + 1}/${payments.length}] Skipping invalid payment object (missing from/to/amount).`
        );
      results.push({
        index: i,
        ok: false,
        error: "Missing required fields (from, to, amount)"
      });
      failCount++;
      continue;
    }

    try {
      if (!json) {
        getOutput().writeLine(
          `[${i + 1}/${payments.length}] Flow: ${payment.from} -> ${payment.to} (${payment.amount} KAS) on ${network}`
        );
      }

      const flowResult = await runTxFlow({
        from: payment.from,
        to: payment.to,
        amount: payment.amount.toString(),
        network,
        feeRate: "1",
        planOnly: false,
        sign: true,
        send: true,
        yes: true,
        config: loaded.config,
        workspaceRoot: workspace || process.cwd(),
        ...(spentByBatch.size > 0 ? { spentOutpoints: new Map(spentByBatch) } : {}),
        ...(keystorePassword !== undefined ? { keystorePassword } : {})
      });
      recordSpent(flowResult, spentByBatch);

      const txId = flowResult.steps.send.artifact?.txId;
      results.push({
        index: i,
        ok: flowResult.ok,
        result: flowResult.result,
        ...(txId ? { txId } : {}),
        planError: flowResult.steps.plan.error,
        signError: flowResult.steps.sign.error,
        sendError: flowResult.steps.send.error,
        // EVENT-LEDGER-2 final closeout: a submit call that failed without an answer is not a rejection
        ...(flowResult.steps.send.artifact?.accepted === false
          ? sendOutcomeLabel(flowResult.steps.send.artifact.receipt, false) === "unknown"
            ? { sendOutcomeUnknown: true }
            : { sendRejected: true }
          : {})
      });
      if (flowResult.ok) {
        successCount++;
        if (!json) getOutput().writeLine(`  ✓ Success`);
      } else {
        failCount++;
        if (!json)
          getOutput().writeLine(
            `  ✗ Failed: Flow did not complete ok. (plan: ${flowResult.steps.plan.error}, sign: ${flowResult.steps.sign.error}, send: ${flowResult.steps.send.error})`
          );
      }
    } catch (e) {
      failCount++;
      const errorMsg = e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e);
      results.push({ index: i, ok: false, error: errorMsg });
      if (!json) getOutput().error(`  ✗ Error: ${errorMsg}`);
    }
  }

  if (json) {
    UI.writeJson({
      ok: failCount === 0,
      batchSize: payments.length,
      successCount,
      failCount,
      results
    });
  } else {
    getOutput().writeLine(`\nBatch processing complete.`);
    getOutput().writeLine(`Successful: ${successCount}`);
    getOutput().writeLine(`Failed:     ${failCount}`);
  }
  // F3: a batch with any failed payment is a failed command (exit 1); the per-payment detail is in the output above
  if (failCount > 0) {
    throw new HardkasCliError("TX_BATCH_FAILED", `${failCount} of ${payments.length} batch payment(s) failed`, {
      exitCode: HardkasExitCode.RUNTIME_FAILURE
    });
  }
}

/**
 * R4-T · the payer of each payment, resolved as the planner resolves it (the workspace's execution target for the batch's
 * network): address → the spellings the file uses for it. A network or a payer that does not resolve is refused here,
 * typed, before anything is planned (one transaction pays all of the file or none of it).
 */
async function batchPayers(payments: any[], config: HardkasConfig, workspaceRoot: string, network: string): Promise<Map<string, Set<string>>> {
  const { resolveWorkspaceExecution } = await import("@hardkas/config");
  const { resolveHardkasAccount } = await import("@hardkas/accounts");
  const resolvedConfig: any = { ...config, cwd: workspaceRoot };
  const execution = resolveWorkspaceExecution({ config: resolvedConfig, network }).execution;
  const payers = new Map<string, Set<string>>();
  for (const payment of payments) {
    const account: any = resolveHardkasAccount({ nameOrAddress: String(payment.from), config: resolvedConfig, executionTarget: execution });
    const address = String(account?.address ?? payment.from);
    payers.set(address, (payers.get(address) ?? new Set<string>()).add(String(payment.from)));
  }
  return payers;
}

/**
 * R4-T · `tx batch --one-transaction`: every payment of the file in ONE transaction — one payer, one payment output per
 * payment in the file's order (output i pays payment i), one change output and one fee — planned, signed and sent by the
 * runners of `tx plan`, `tx sign` and `tx send` (the SDK's send machinery: one submission recorded). Refused before
 * anything is planned, signed or sent: mainnet (MAINNET_BROADCAST_DISABLED, in runTxBatch before the file is read), an
 * empty file (TX_BATCH_EMPTY), a payment without from/to/amount (TX_BATCH_PAYMENT_INVALID), payments from more than one
 * payer (TX_BATCH_MULTIPLE_PAYERS: a transaction has one payer), and, by the planner, more recipients than fit in one
 * standard transaction (TOO_MANY_OUTPUTS, which names how many fit). A failed step fails the whole batch: no payment of
 * it was made unless the send step ran (the JSON says which step failed and whether the node rejected the transaction).
 */
async function runOneTransactionBatch(args: {
  payments: any[];
  config: HardkasConfig;
  workspaceRoot: string;
  network: string;
  json?: boolean | undefined;
  passwordEnv?: string | undefined;
  passwordStdin?: boolean | undefined;
}): Promise<void> {
  const { payments, config, workspaceRoot, network, json } = args;
  const usage = (code: string, message: string): never => {
    throw new HardkasCliError(code, `--one-transaction: ${message} Nothing was planned, signed or sent.`, { exitCode: HardkasExitCode.USAGE_ERROR });
  };
  if (payments.length === 0) usage("TX_BATCH_EMPTY", "the batch file has no payments.");
  const invalid = payments.map((p, i) => (!p?.from || !p?.to || !p?.amount ? i : -1)).filter((i) => i >= 0);
  if (invalid.length > 0) {
    usage(
      "TX_BATCH_PAYMENT_INVALID",
      `the payment(s) at index ${invalid.join(", ")} (0-based, as in \`results\`) miss from, to or amount, and one transaction pays all of the file or none of it.`
    );
  }
  const payers = await batchPayers(payments, config, workspaceRoot, network);
  if (payers.size > 1) {
    const named = [...payers.entries()].map(([address, names]) => `${[...names].join(" / ")}${names.has(address) ? "" : ` (${address})`}`).join(", ");
    usage(
      "TX_BATCH_MULTIPLE_PAYERS",
      `the batch pays from ${payers.size} payers (${named}), and one transaction has one payer. Split the file per payer, or run it without --one-transaction (one transaction per payment).`
    );
  }

  const keystorePassword = await batchKeystorePassword({ ...args, payments });
  const from = String(payments[0].from);
  const outputs = payments.map((p) => ({ to: String(p.to), amount: p.amount.toString() }));
  if (!json) {
    getOutput().writeLine(`Paying ${payments.length} payment(s) from ${from} in one transaction on ${network}...`);
    outputs.forEach((o, i) => getOutput().writeLine(`  [${i + 1}/${payments.length}] -> ${o.to} (${o.amount} KAS)`));
  }

  const { runTxPlan } = await import("./tx-plan-runner.js");
  const { runTxSign } = await import("./tx-sign-runner.js");
  const { runTxSend } = await import("./tx-send-runner.js");
  let step: "plan" | "sign" | "send" = "plan";
  let plan: any;
  let sent: Awaited<ReturnType<typeof runTxSend>> | undefined;
  let failure: unknown;
  try {
    plan = await runTxPlan({ from, outputs, networkId: network, feeRate: "1", provider: "auto", config, workspaceRoot });
    step = "sign";
    const signed = await runTxSign({
      planArtifact: plan,
      config,
      workspaceRoot,
      ...(keystorePassword !== undefined ? { keystorePassword } : {}),
      ...(json ? { json: true } : {})
    });
    step = "send";
    sent = await runTxSend({ signedArtifact: signed, config, workspaceRoot });
  } catch (e) {
    failure = e;
  }

  const txId = sent?.txId;
  const ok = failure === undefined && sent?.accepted === true;
  const errorCode = failure !== undefined && typeof (failure as any)?.code === "string" ? ((failure as any).code as string) : undefined;
  const errorMessage = failure !== undefined ? (failure instanceof Error ? failure.message : String(failure)) : undefined;
  const notAccepted =
    sent?.accepted === false ? (sendOutcomeLabel(sent.receipt, false) === "unknown" ? { sendOutcomeUnknown: true } : { sendRejected: true }) : {};
  const results = payments.map((p, i) => ({
    index: i,
    ok,
    to: String(p.to),
    ...(plan?.outputs?.[i] ? { address: plan.outputs[i].address, amountSompi: plan.outputs[i].amountSompi, outputIndex: i } : {}),
    ...(txId ? { txId } : {})
  }));

  if (json) {
    UI.writeJson({
      ok,
      oneTransaction: true,
      batchSize: payments.length,
      successCount: ok ? payments.length : 0,
      failCount: ok ? 0 : payments.length,
      ...(txId ? { txId } : {}),
      ...(plan ? { planArtifactId: plan.contentHash, feeSompi: plan.estimatedFeeSompi } : {}),
      ...(failure !== undefined ? { failedStep: step, [`${step}Error`]: errorMessage, ...(errorCode ? { code: errorCode } : {}) } : {}),
      ...notAccepted,
      results
    });
  } else if (ok) {
    getOutput().writeLine(`  ✓ Success: transaction ${txId} pays ${payments.length} recipient(s)`);
    getOutput().writeLine(`\nBatch processing complete.`);
    getOutput().writeLine(`Successful: ${payments.length}`);
    getOutput().writeLine(`Failed:     0`);
  } else {
    getOutput().writeLine(
      failure !== undefined
        ? `  ✗ Failed at the ${step} step${errorCode ? ` (${errorCode})` : ""}: ${errorMessage}`
        : `  ✗ Failed: the node did not accept transaction ${txId} (${sendOutcomeLabel(sent?.receipt, false)})`
    );
  }
  if (!ok) {
    const outcomeUnknown = (notAccepted as { sendOutcomeUnknown?: boolean }).sendOutcomeUnknown === true;
    const message =
      failure !== undefined
        ? `the one transaction of the batch failed at its ${step} step (${errorCode ? `${errorCode}: ` : ""}${errorMessage}); ` +
          (step === "send"
            ? "the send step did not complete: check what the node holds (hardkas tx status) before paying again."
            : `nothing was sent: none of the ${payments.length} payment(s) was made.`)
        : outcomeUnknown
          ? `the outcome of the one transaction of the batch (${txId}) is unknown (the submit call failed without an answer): check hardkas tx status ${txId} before paying again.`
          : `the node rejected the one transaction of the batch (${txId}): none of the ${payments.length} payment(s) was made.`;
    throw new HardkasCliError(errorCode ?? "TX_BATCH_FAILED", message, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
}
