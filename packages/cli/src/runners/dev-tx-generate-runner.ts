import { runTxFlow } from "./tx-flow.js";
import { loadHardkasConfig } from "@hardkas/config";
import { UI } from "../ui.js";
import { systemRuntimeContext } from "@hardkas/core";

export async function runDevTxGenerate(options: any) {
  const { count, network = "simulated", json, workspace } = options;

  if (network !== "simulated" && network !== "simnet") {
    throw new Error(
      "dev tx generate in 0.7.5 is strictly limited to local simulated networks to avoid accidental mainnet broadcasts."
    );
  }

  const numCount = parseInt(count, 10);
  if (isNaN(numCount) || numCount <= 0) {
    throw new Error("--count must be a positive number.");
  }

  const loaded = await loadHardkasConfig({ cwd: workspace });

  // Pick some default dev accounts
  const devAccounts = ["alice", "bob", "carol"];
  const results = [];
  let successCount = 0;
  let failCount = 0;

  if (!json) {
    console.log(`Generating ${numCount} transactions on ${network} (MOCK/LOAD TEST)`);
  }

  for (let i = 0; i < numCount; i++) {
    // Always send from alice in 0.7.5 to avoid UTXO errors since only alice is pre-funded
    const toIndex = (i + 1) % devAccounts.length;
    const from = "alice";
    const to = devAccounts[toIndex] === "alice" ? "bob" : devAccounts[toIndex]!;
    // amount varies slightly
    const amount = (0.01 + (i % 10) * 0.001).toFixed(3);

    try {
      const flowResult = await runTxFlow({
        from,
        to,
        amount,
        network,
        feeRate: "1",
        planOnly: false,
        sign: true,
        send: true,
        yes: true,
        config: loaded.config,
        workspaceRoot: workspace || process.cwd()
      });

      if (flowResult.ok) {
        successCount++;
      } else {
        failCount++;
      }

      results.push({
        index: i,
        ok: flowResult.ok,
        result: flowResult.result,
        planError: flowResult.steps.plan.error,
        signError: flowResult.steps.sign.error,
        sendError: flowResult.steps.send.error
      });
    } catch (e) {
      failCount++;
      results.push({
        index: i,
        ok: false,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  if (json) {
    UI.writeJson({
      generated: numCount,
      successCount,
      failCount,
      mode: "simulated",
      purpose: "load-test",
      securityModel: "mock-fixture",
      results
    });
  } else {
    console.log(
      `\nGeneration complete (mode: simulated, purpose: load-test, securityModel: mock-fixture).`
    );
    console.log(`Success: ${successCount}`);
    console.log(`Failed:  ${failCount}`);
  }
}
