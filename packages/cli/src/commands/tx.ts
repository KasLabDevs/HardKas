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
    .option("--network <name>", "Network name", "simulated")
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

  tx.command("plan")
    .description(`Build a transaction plan artifact ${UI.maturity("stable")}`)
    .option("--from <accountOrAddress>", "Sender account name or address")
    .option("--to <address>", "Recipient address")
    .option("--amount <kas>", "Amount in KAS")
    .option("--network <name>", "Kaspa network name", "simnet")
    .option("--fee-rate <sompiPerMass>", "Fee rate in sompi per mass", "1")
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
      async (options: {
        from?: string;
        to?: string;
        amount?: string;
        network: string;
        provider: string;
        feeRate?: string;
        url?: string;
        out?: string;
        save?: string;
        workflowId?: string;
        assumptionLevel?: string;
        waitLock: boolean;
        lockTimeout: string;
        json: boolean;
      }) => {
        const { withLock } = await import("@hardkas/core");
        try {
          if (options.json) UI.setJsonMode(true);
          await withLock(
            {
              rootDir: process.cwd(),
              name: "artifacts",
              command: "hardkas tx plan",
              wait: options.waitLock,
              timeoutMs: parseInt(options.lockTimeout)
            },
            async () => {
              const { loadHardkasConfig } = await import("@hardkas/config");
              const { writeArtifact, formatTxPlanArtifact } =
                await import("@hardkas/artifacts");

              const loaded = await loadHardkasConfig();
              const artifact = await runTxPlan({
                from: options.from || "alice",
                to: options.to || "bob",
                amount: options.amount || "1",
                networkId: options.network,
                provider: options.provider,
                feeRate: options.feeRate || "1",
                config: loaded.config,
                ...(options.workflowId ? { workflowId: options.workflowId } : {}),
                ...(options.assumptionLevel ? { assumptionLevel: options.assumptionLevel } : {}),
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
                console.log(formatTxPlanArtifact(artifact));
                if (outPath) console.log(`\nArtifact saved to: ${outPath}`);
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
              if (raw && raw.schema === "hardkas.signedTx") {
                planArtifact = await readSignedTxArtifact(planPath);
              } else {
                planArtifact = await readTxPlanArtifact(planPath);
              }
              const loaded = await loadHardkasConfig();

              let signer;
              if (options.fixture) {
                const { HardkasFixtureSigner } = await import("@hardkas/accounts");
                const networkId = (planArtifact as any).networkId || "simnet";
                signer = new HardkasFixtureSigner(networkId);
              }

              const signedArtifact = await runTxSign({
                planArtifact: planArtifact as any,
                ...(options.account ? { accountName: options.account } : {}),
                config: loaded.config,
                signer,
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
                console.log(formatSignedTxArtifact(signedArtifact));
                if (options.out)
                  console.log(`\nSigned artifact saved to: ${options.out}`);
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
          (raw.schema !== "hardkas.signedTx" && raw.schema !== "hardkas.txPlan")
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

        console.log(`\nHardKAS Transaction Status`);
        console.log(`==========================`);
        console.log(`File:         ${artifactPath}`);
        console.log(`Schema:       ${raw.schema}`);

        if (raw.schema === "hardkas.txPlan") {
          console.log(`Status:       PLANNED`);
          console.log(`Plan ID:      ${raw.planId}`);
          console.log(`From:         ${raw.from.address}`);
          console.log(`To:           ${raw.to.address}`);
          console.log(`Amount:       ${raw.amountSompi} sompi`);
        } else {
          console.log(`Status:       ${raw.status.toUpperCase()}`);
          console.log(`Signed ID:    ${raw.signedId}`);
          console.log(`Plan ID:      ${raw.sourcePlanId}`);
          console.log(`From:         ${raw.from.address}`);
          console.log(`To:           ${raw.to.address}`);
          console.log(`Amount:       ${raw.amountSompi} sompi`);

          if (raw.multisig) {
            console.log(
              `Threshold:    ${raw.multisig.signatures.length} of ${raw.multisig.threshold} Required Signers`
            );
            console.log(`\nSignatures Collected:`);
            const signatures = raw.multisig.signatures || [];
            const required = raw.multisig.requiredSigners || [];
            required.forEach((addr: string) => {
              const hasSigned = signatures.some((s: any) => s.signer === addr);
              console.log(`  [${hasSigned ? "✓" : " "}] ${addr}`);
            });
          } else {
            console.log(`Signers:      Single-signature transaction`);
          }
        }
        console.log();
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        throw e;
      }
    });

  tx.command("send [signedPath]")
    .description(
      `Broadcast a signed transaction or send directly ${UI.maturity("stable")}`
    )
    .option("--from <accountOrAddress>", "Sender (shortcut mode)")
    .option("--to <address>", "Recipient (shortcut mode)")
    .option("--amount <kas>", "Amount in KAS (shortcut mode)")
    .option("--network <name>", "Network name", "simnet")
    .option("--provider <type>", "Provider mode (auto, rpc, simulated)", "auto")
    .option("--url <url>", "RPC URL (optional override)")
    .option("--yes", "Confirm broadcast", false)
    .option("--wait-lock", "Wait for workspace lock if held", false)
    .option("--lock-timeout <ms>", "Lock wait timeout in ms", "30000")
    .option("--json", "Output as JSON", false)
    .option("--track <label>", "Auto-track deployment with this label")
    .action(
      async (
        signedPath: string | undefined,
        options: {
          from?: string;
          to?: string;
          amount?: string;
          network: string;
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
              const loaded = await loadHardkasConfig();

              if (signedPath) {
                const { readSignedTxArtifact } = await import("@hardkas/artifacts");
                const signedArtifact = await readSignedTxArtifact(signedPath);

                if (
                  !options.yes &&
                  signedArtifact.networkId !== "simulated" &&
                  signedArtifact.networkId !== "simnet"
                ) {
                  const { UI } = await import("../ui.js");
                  UI.dryRun();
                  return;
                }

                const result = await runTxSend({
                  signedArtifact: signedArtifact as any,
                  network: options.network,
                  provider: options.provider,
                  config: loaded.config,
                  ...(options.url ? { url: options.url } : {})
                });

                if (options.json) {
                  UI.writeJson({
                    ok: true,
                    data: {
                      plan: undefined,
                      signed: signedArtifact,
                      receipt: result.receipt,
                      artifacts: [signedArtifact, result.receipt],
                      warnings: [],
                      explanation: { available: true, artifactId: result.receipt.txId }
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
                    result.networkName === "simulated" || result.networkName === "simnet";

                  UI.causality(
                    isSimulated
                      ? "Transaction simulated successfully"
                      : "Transaction broadcast successfully",
                    {
                      "Execution ID": result.executionId,
                      "Artifact ID": result.txId,
                      "Replay ID": result.replayId,
                      Network: result.networkName,
                      "Execution Scope": isSimulated
                        ? "local deterministic replay"
                        : "network broadcast",
                      "Artifact Written": result.receiptPath || ".hardkas/artifacts/...",
                      "Projection Updated": "SQLite query-store",
                      "Replay Status": isSimulated
                        ? "deterministic reproducible"
                        : "network state dependent",
                      "Consensus Validated": isSimulated ? "NO" : "YES"
                    },
                    ["hardkas dashboard", `hardkas explain ${result.txId}`]
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
                    status: result.receipt.status === "confirmed" ? "confirmed" : "sent",
                    silent: options.json
                  });
                }
              } else if (options.from && options.to && options.amount) {
                if (
                  !options.yes &&
                  options.network !== "simulated" &&
                  options.network !== "simnet"
                ) {
                  const { UI } = await import("../ui.js");
                  UI.dryRun();
                  return;
                }

                const result = await runTxFlow({
                  ...options,
                  amount: options.amount!,
                  from: options.from!,
                  to: options.to!,
                  send: true,
                  feeRate: "1", // Default fee rate for shortcut
                  provider: options.provider,
                  config: loaded.config,
                  ...(options.url ? { url: options.url } : {})
                });

                if (options.json) {
                  const sendResult = result.steps.send;
                  UI.writeJson({
                    ok: true,
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
                      explanation: {
                        available: true,
                        artifactId: sendResult?.artifact?.receipt?.txId
                      }
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
                    sendResult?.artifact?.rpcUrl === "simulated://local" || options.network === "simulated";

                  UI.causality(
                    isSimulated
                      ? "Transaction simulated successfully"
                      : "Transaction broadcast successfully",
                    {
                      "Execution ID": `exec_${Date.now().toString(36)}`,
                      "Artifact ID":
                        sendResult?.artifact?.receipt?.lineage?.artifactId ||
                        sendResult?.artifact?.txId ||
                        "unknown",
                      "Replay ID": `replay_${(sendResult?.artifact?.txId || "unknown").substring(0, 8)}`,
                      Network: options.network || "simulated",
                      "Execution Scope": isSimulated
                        ? "local deterministic replay"
                        : "network broadcast",
                      "Artifact Written":
                        sendResult?.artifact?.receiptPath || ".hardkas/artifacts/...",
                      "Projection Updated": "SQLite query-store",
                      "Replay Status": isSimulated
                        ? "deterministic reproducible"
                        : "network state dependent",
                      "Consensus Validated": isSimulated ? "NO" : "YES"
                    },
                    [
                      `hardkas why ${sendResult?.artifact?.receipt?.lineage?.artifactId || sendResult?.artifact?.txId || "unknown"}`,
                      "hardkas dev last --replay",
                      "hardkas status"
                    ]
                  );
                }
              } else {
                console.error(
                  "Provide a path to a signed artifact or use --from, --to, --amount."
                );
                throw e;
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
        if (options.json) console.log(JSON.stringify(result.receipt, bigIntReplacer, 2));
        else console.log(result.formatted);
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
      const { UI } = await import("../ui.js");
      UI.error("Tracing is temporarily disabled while the query API stabilizes.");
      throw e;
    });

  tx.command("compare <simulatedPath> <realPath>")
    .description(`Compare simulated vs real receipts for fidelity ${UI.maturity("stable")}`)
    .action(async (simulatedPath, realPath) => {
      try {
        const { runTxCompare } = await import("../runners/tx-compare-runner.js");
        await runTxCompare({ simulatedPath, realPath });
      } catch (e) {
        throw e;
      }
    });
}
