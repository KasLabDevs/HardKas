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
