import fs from "node:fs/promises";
import path from "node:path";
import { runTxFlow } from "./tx-flow.js";
import { loadHardkasConfig } from "@hardkas/config";
import { UI } from "../ui.js";

export async function runTxBatch(options: any) {
  const { file, network = "simulated", json, workspace } = options;

  if (!file) {
    throw new Error("Must provide --file with payments.json");
  }

  const loaded = await loadHardkasConfig({ cwd: workspace });
  const filePath = path.resolve(workspace || process.cwd(), file);

  let payments: any[];
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
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
    if (e instanceof Error && e.message.startsWith("Invalid batch file format")) throw e;
    throw new Error(
      `Failed to read or parse batch file ${file}: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;

  if (!json) {
    console.log(`Processing batch of ${payments.length} transactions sequentially...`);
  }

  // Strictly sequential execution for 0.7.5 to avoid UTXO race conditions
  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];

    if (!payment.from || !payment.to || !payment.amount) {
      if (!json)
        console.error(
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
        console.log(
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
        workspaceRoot: workspace || process.cwd()
      });

      results.push({
        index: i,
        ok: flowResult.ok,
        result: flowResult.result,
        planError: flowResult.steps.plan.error,
        signError: flowResult.steps.sign.error,
        sendError: flowResult.steps.send.error
      });
      if (flowResult.ok) {
        successCount++;
        if (!json) console.log(`  ✓ Success`);
      } else {
        failCount++;
        if (!json)
          console.log(
            `  ✗ Failed: Flow did not complete ok. (plan: ${flowResult.steps.plan.error}, sign: ${flowResult.steps.sign.error}, send: ${flowResult.steps.send.error})`
          );
      }
    } catch (e) {
      failCount++;
      const errorMsg = e instanceof Error ? e.message : String(e);
      results.push({ index: i, ok: false, error: errorMsg });
      if (!json) console.error(`  ✗ Error: ${errorMsg}`);
    }
  }

  if (json) {
    UI.writeJson({
      batchSize: payments.length,
      successCount,
      failCount,
      results
    });
  } else {
    console.log(`\nBatch processing complete.`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed:     ${failCount}`);
  }
}
