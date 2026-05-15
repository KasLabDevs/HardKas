import { Command } from "commander";
import { handleError, UI } from "../ui.js";
import { bigIntReplacer } from "@hardkas/artifacts";
import { runTxProfile } from "../runners/tx-profile-runner.js";
import { runTxPlan } from "../runners/tx-plan-runner.js";
import { runTxSign } from "../runners/tx-sign-runner.js";
import { runTxSend } from "../runners/tx-send-runner.js";
import { runTxFlow } from "../runners/tx-flow.js";
import { runTxReceipt } from "../runners/tx-receipt-runner.js";

export function registerTxCommands(program: Command) {
  const tx = program.command("tx").description("L1 Transaction commands");

  tx.command("profile <path>")
    .description(`Show detailed mass and fee breakdown for a transaction plan ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (path: string, options: { json: boolean }) => {
      try {
        await runTxProfile({ path, ...options });
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  tx.command("plan")
    .description(`Build a transaction plan artifact ${UI.maturity("stable")}`)
    .option("--from <accountOrAddress>", "Sender account name or address")
    .option("--to <address>", "Recipient address")
    .option("--amount <kas>", "Amount in KAS")
    .option("--network <name>", "Kaspa network name", "simnet")
    .option("--fee-rate <sompiPerMass>", "Fee rate in sompi per mass", "1")
    .option("--url <url>", "RPC URL (optional override)")
    .option("--out <path>", "Save plan as artifact JSON")
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(async (options: {
      from?: string;
      to?: string;
      amount?: string;
      network: string;
      feeRate: string;
      url?: string;
      out?: string;
      waitLock: boolean;
      lockTimeout: string;
      json: boolean;
    }) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "artifacts",
          command: "hardkas tx plan",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          const { loadHardkasConfig } = await import("@hardkas/config");
          const { writeArtifact, formatTxPlanArtifact } = await import("@hardkas/artifacts");
          
          const loaded = await loadHardkasConfig();
          const artifact = await runTxPlan({
            from: options.from || "alice",
            to: options.to || "bob",
            amount: options.amount || "1",
            networkId: options.network,
            feeRate: options.feeRate,
            config: loaded.config,
            ...(options.url ? { url: options.url } : {})
          });

          if (options.out) await writeArtifact(options.out, artifact);
          if (options.json) console.log(JSON.stringify(artifact, bigIntReplacer, 2));
          else {
            console.log(formatTxPlanArtifact(artifact));
            if (options.out) console.log(`\nArtifact saved to: ${options.out}`);
          }
        });
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  tx.command("sign <planPath>")
    .description(`Sign a transaction plan artifact ${UI.maturity("stable")}`)
    .option("--account <name>", "Account name to sign with")
    .option("--out <path>", "Save signed artifact JSON")
    .option("--allow-mainnet-signing", "Allow signing for mainnet", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .action(async (planPath: string, options: {
      account?: string;
      out?: string;
      allowMainnetSigning: boolean;
      waitLock: boolean;
      lockTimeout: string;
      json: boolean;
    }) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "artifacts",
          command: "hardkas tx sign",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          const { readTxPlanArtifact, writeArtifact, formatSignedTxArtifact } = await import("@hardkas/artifacts");
          const { loadHardkasConfig } = await import("@hardkas/config");

          const planArtifact = await readTxPlanArtifact(planPath);
          const loaded = await loadHardkasConfig();

          const signedArtifact = await runTxSign({
            planArtifact: planArtifact as any,
            ...(options.account ? { accountName: options.account } : {}),
            config: loaded.config,
            allowMainnetSigning: options.allowMainnetSigning
          });

          if (options.out) await writeArtifact(options.out, signedArtifact);
          if (options.json) console.log(JSON.stringify(signedArtifact, bigIntReplacer, 2));
          else {
            console.log(formatSignedTxArtifact(signedArtifact));
            if (options.out) console.log(`\nSigned artifact saved to: ${options.out}`);
          }
        });
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  tx.command("send [signedPath]")
    .description(`Broadcast a signed transaction or send directly ${UI.maturity("stable")}`)
    .option("--from <accountOrAddress>", "Sender (shortcut mode)")
    .option("--to <address>", "Recipient (shortcut mode)")
    .option("--amount <kas>", "Amount in KAS (shortcut mode)")
    .option("--network <name>", "Network name", "simnet")
    .option("--url <url>", "RPC URL (optional override)")
    .option("--yes", "Confirm broadcast", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .option("--track <label>", "Auto-track deployment with this label")
    .action(async (signedPath: string | undefined, options: {
      from?: string;
      to?: string;
      amount?: string;
      network: string;
      url?: string;
      yes: boolean;
      waitLock: boolean;
      lockTimeout: string;
      json: boolean;
      track?: string;
    }) => {
      const { withLock } = await import("@hardkas/core");
      const { handleLockError } = await import("../ui.js");
      try {
        await withLock({
          rootDir: process.cwd(),
          name: "artifacts",
          command: "hardkas tx send",
          wait: options.waitLock,
          timeoutMs: parseInt(options.lockTimeout)
        }, async () => {
          const { loadHardkasConfig } = await import("@hardkas/config");
          const loaded = await loadHardkasConfig();

          if (signedPath) {
            const { readSignedTxArtifact } = await import("@hardkas/artifacts");
            const signedArtifact = await readSignedTxArtifact(signedPath);

            if (!options.yes && signedArtifact.networkId !== "simnet") {
              console.log(`Transaction is for network: ${signedArtifact.networkId}`);
              console.log("Run with --yes to broadcast.");
              return;
            }

            const result = await runTxSend({
              signedArtifact: signedArtifact as any,
              network: options.network,
              config: loaded.config,
              ...(options.url ? { url: options.url } : {})
            });

            if (options.json) console.log(JSON.stringify(result, bigIntReplacer, 2));
            else console.log(result.formatted);

            if (options.track && result.accepted) {
              const { trackDeployment } = await import("../runners/deployment-runners.js");
              await trackDeployment({
                label: options.track,
                network: result.networkName,
                txId: result.txId,
                plan: signedArtifact.sourcePlanId,
                status: result.receipt.status === "confirmed" ? "confirmed" : "sent"
              });
            }
          } else if (options.from && options.to && options.amount) {
            const result = await runTxFlow({
              ...options,
              amount: options.amount!,
              from: options.from!,
              to: options.to!,
              send: true,
              feeRate: "1", // Default fee rate for shortcut
              config: loaded.config,
              ...(options.url ? { url: options.url } : {})
            });
            if (options.json) console.log(JSON.stringify(result, bigIntReplacer, 2));
            else console.log(result.steps.send.artifact?.formatted || "Flow completed");
          } else {
            console.error("Provide a path to a signed artifact or use --from, --to, --amount.");
            process.exitCode = 1;
          }
        });
      } catch (e) { handleLockError(e); process.exitCode = 1; }
    });

  tx.command("receipt <txId>")
    .description(`Show transaction receipt ${UI.maturity("stable")}`)
    .option("--json", "Output as JSON", false)
    .action(async (txId, options) => {
      try {
        const result = await runTxReceipt({ txId });
        if (options.json) console.log(JSON.stringify(result.receipt, bigIntReplacer, 2));
        else console.log(result.formatted);
      } catch (e) {
        handleError(e);
        process.exitCode = 1;
      }
    });

  tx.command("verify <path>")
    .description(`Perform deep semantic verification of a transaction plan ${UI.maturity("preview")}`)
    .option("--json", "Output as JSON", false)
    .action(async (path, options) => {
      const { runTxVerify } = await import("../runners/tx-verify-runner.js");
      await runTxVerify({ path, ...options });
    });

  tx.command("trace <txId>")
    .description(`Reconstruct the full operational trace of a transaction ${UI.maturity("research")}`)
    .action(async (txId: string) => {
      const { UI } = await import("../ui.js");
      UI.error("Tracing is temporarily disabled while the query API stabilizes.");
      process.exitCode = 1;
    });
}
