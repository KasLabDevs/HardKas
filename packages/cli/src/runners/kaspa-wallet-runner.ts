import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";
import type { NetworkId, KaspaAddress, ContentHash } from "@hardkas/core";
import type { TxPlanArtifact } from "@hardkas/artifacts";

export async function runKaspaWalletCreate(name: string, options: { network: string }) {
  try {
    const { createLocalKaspaWallet } = await import("@hardkas/accounts");

    console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.bold(`HardKAS • Kaspa Wallet Creation`));
    console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

    const wallet = await createLocalKaspaWallet({
      networkId: options.network as "mainnet" | "testnet-10" | "simnet"
    });

    console.log(`  ${pc.green("✓")} New Kaspa L1 wallet generated:`);
    console.log(`    Name:    ${pc.white(name)}`);
    console.log(`    Address: ${pc.white(wallet.address)}`);
    console.log(`    Network: ${pc.white(options.network)}`);

    console.log(
      `\n  ${pc.yellow("Action Required:")} Add this to your ${pc.white("hardkas.config.ts")}:`
    );
    console.log(pc.gray("  ----------------------------------------"));
    console.log(pc.white(`  accounts: {`));
    console.log(pc.white(`    ${name}: {`));
    console.log(pc.white(`      kind: "kaspa-private-key",`));
    console.log(pc.white(`      address: "${wallet.address}",`));
    console.log(pc.white(`      privateKeyEnv: "${name.toUpperCase()}_PRIVATE_KEY"`));
    console.log(pc.white(`    }`));
    console.log(pc.white(`  }`));
    console.log(pc.gray("  ----------------------------------------"));
    console.log(`\n  ${pc.dim("Set your private key in .env:")}`);
    console.log(`  ${name.toUpperCase()}_PRIVATE_KEY=${wallet.privateKey}\n`);

    console.log(`${pc.dim("HardKAS never auto-writes secrets for your protection.")}`);
  } catch (e) {
    handleError(e);
  }
}

export async function runKaspaWalletList(options: { json: boolean }) {
  try {
    const config = await loadHardkasConfig();
    const { listHardkasAccounts } = await import("@hardkas/accounts");
    const accounts = listHardkasAccounts(config.config).filter(
      (a) => a.kind === "kaspa-private-key" || a.kind === "simulated"
    );

    if (options.json) {
      console.log(JSON.stringify(accounts, null, 2));
      return;
    }

    console.log(pc.bold("\nLocal Kaspa Wallets"));
    console.log(pc.dim("----------------------------------------"));
    for (const acc of accounts) {
      console.log(
        `${pc.white(acc.name.padEnd(12))} ${pc.cyan(acc.address?.padEnd(40))} ${pc.dim(`(${acc.kind})`)}`
      );
    }
    console.log("");
  } catch (e) {
    handleError(e);
  }
}

export async function runKaspaWalletAddress(name: string) {
  try {
    const config = await loadHardkasConfig();
    const { resolveHardkasAccountAddress } = await import("@hardkas/accounts");
    const address = resolveHardkasAccountAddress(name, config.config);
    console.log(address);
  } catch (e) {
    handleError(e);
    process.exitCode = 1;
  }
}

export async function runKaspaWalletBalance(
  name: string,
  options: { rpcUrl: string; json: boolean }
) {
  try {
    const config = await loadHardkasConfig();
    const { resolveHardkasAccountAddress } = await import("@hardkas/accounts");
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");

    const address = resolveHardkasAccountAddress(name, config.config);
    const client = new JsonWrpcKaspaClient({ rpcUrl: options.rpcUrl });
    const balance = await client.getBalanceByAddress(address);

    if (options.json) {
      console.log(
        JSON.stringify(balance, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
      );
      return;
    }

    console.log(`\nWallet:  ${pc.white(name)}`);
    console.log(`Address: ${pc.dim(address)}`);
    console.log(`Balance: ${pc.green(Number(balance.balanceSompi) / 1e8)} KAS\n`);
  } catch (e) {
    handleError(e);
    process.exitCode = 1;
  }
}

export async function runKaspaWalletSend(
  from: string,
  to: string,
  options: { amount: string; dryRun: boolean; rpcUrl: string }
) {
  try {
    const config = await loadHardkasConfig();
    const { resolveHardkasAccount, resolveHardkasAccountAddress } =
      await import("@hardkas/accounts");
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
    const { buildPaymentPlan } = await import("@hardkas/tx-builder");
    const { signTxPlanArtifact } = await import("@hardkas/accounts");
    const { HARDKAS_VERSION, calculateContentHash } = await import("@hardkas/artifacts");

    const sender = resolveHardkasAccount({ nameOrAddress: from, config: config.config });
    const targetAddress = resolveHardkasAccountAddress(to, config.config);
    const amountSompi = BigInt(Math.floor(parseFloat(options.amount) * 1e8));

    const client = new JsonWrpcKaspaClient({ rpcUrl: options.rpcUrl });
    const utxos = await client.getUtxosByAddress(sender.address!);

    // 1. Build Plan
    const plan = buildPaymentPlan({
      fromAddress: sender.address!,
      outputs: [{ address: targetAddress, amountSompi }],
      availableUtxos: utxos.map((u) => ({
        outpoint: u.outpoint,
        address: u.address,
        amountSompi: u.amountSompi,
        scriptPublicKey: u.scriptPublicKey || ""
      })),
      feeRateSompiPerMass: 1n, // Default 1 sompi/mass
      changeAddress: sender.address!
    });

    console.log(pc.bold("\nTransaction Plan"));
    console.log(pc.dim("----------------------------------------"));
    console.log(`From:    ${pc.white(from)} (${sender.address})`);
    console.log(`To:      ${pc.white(to)} (${targetAddress})`);
    console.log(`Amount:  ${pc.green(Number(amountSompi) / 1e8)} KAS`);
    console.log(`Fee:     ${pc.yellow(Number(plan.estimatedFeeSompi) / 1e8)} KAS`);
    console.log(`Mass:    ${plan.estimatedMass}`);
    console.log(`Inputs:  ${plan.inputs.length} UTXOs`);
    console.log(pc.dim("----------------------------------------\n"));

    if (options.dryRun) {
      console.log(pc.blue("Dry-run mode: Transaction NOT signed or broadcast.\n"));
      return;
    }

    const confirm = await UI.confirm(
      `Proceed with signing and broadcasting this transaction?`
    );
    if (!confirm) {
      console.log(pc.red("Cancelled.\n"));
      return;
    }

    // 2. Sign
    // Map internal plan to Artifact format for the signer
    const configObj = config.config as Record<string, unknown>;
    const networkId =
      typeof configObj.networkId === "string"
        ? (configObj.networkId as NetworkId)
        : config.config.defaultNetwork || "simnet";
    const planArtifact: TxPlanArtifact = {
      schema: "hardkas.txPlan",
      planId: `plan-${calculateContentHash({ from: sender.address, to: targetAddress, amount: amountSompi.toString() }).slice(0, 16)}`,
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      createdAt: new Date().toISOString(),
      networkId: networkId as NetworkId,
      mode: sender.kind === "simulated" ? "simulated" : "real",
      from: { address: sender.address as KaspaAddress },
      to: { address: targetAddress as KaspaAddress },
      amountSompi: amountSompi.toString(),
      inputs: plan.inputs.map((i) => ({
        outpoint: {
          transactionId: i.outpoint.transactionId,
          index: i.outpoint.index
        },
        amountSompi: i.amountSompi.toString()
      })),
      outputs: plan.outputs.map((o) => ({
        address: o.address as KaspaAddress,
        amountSompi: o.amountSompi.toString()
      })),
      estimatedFeeSompi: plan.estimatedFeeSompi.toString(),
      estimatedMass: plan.estimatedMass.toString(),
      ...(plan.change
        ? {
            change: {
              address: plan.change.address as KaspaAddress,
              amountSompi: plan.change.amountSompi.toString()
            }
          }
        : {}),
      contentHash: "synthetic-plan-hash" as ContentHash
    };

    const signedArtifact = await signTxPlanArtifact({
      planArtifact,
      account: sender,
      config: config.config
    });

    console.log(`  ${pc.green("✓")} Transaction signed.`);

    // 3. Broadcast
    if (!signedArtifact.signedTransaction) {
      throw new Error(
        "Failed to sign transaction: signedTransaction payload is missing."
      );
    }
    const submitResult = await client.submitTransaction(
      signedArtifact.signedTransaction.payload
    );

    if (submitResult.accepted) {
      console.log(`  ${pc.green("✓")} Transaction accepted by node.`);
      console.log(`  TXID: ${pc.bold(pc.white(submitResult.transactionId))}\n`);
    } else {
      console.log(`  ${pc.red("✗")} Transaction rejected by node.`);
      console.log(`  Details: ${JSON.stringify(submitResult.raw)}\n`);
      process.exitCode = 1;
    }
  } catch (e) {
    handleError(e);
    process.exitCode = 1;
  }
}
