import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { loadHardkasConfig } from "@hardkas/config";
import type { NetworkId, KaspaAddress } from "@hardkas/core";
import type { TxPlanArtifact } from "@hardkas/artifacts";
import { HardkasSchemas } from "@hardkas/artifacts";

type WalletNetwork = "mainnet" | "testnet-10" | "simnet";

export interface KaspaWalletCreateOptions {
  network: string;
  /** SECRET-SURFACE-2 (D1): the explicit choice to receive the new private key on the terminal, once. */
  showPrivateKey?: boolean;
  json?: boolean;
}

export const WALLET_KEY_OUTPUT_REQUIRED = "WALLET_KEY_OUTPUT_REQUIRED";

/** The environment variable the printed config snippet names for the key. */
const privateKeyEnvOf = (name: string) => `${name.toUpperCase()}_PRIVATE_KEY`;

/**
 * SECRET-SURFACE-2 (D1 / P1): `kaspa wallet create` generates a key that HardKAS does not store — no file, no keystore,
 * no mnemonic — so the printed line is the only copy there will ever be. Where that copy goes is therefore decided
 * BEFORE the key exists: without `--show-private-key` the command refuses with a typed usage error and nothing is
 * generated (a key nobody chose a destination for would be lost the moment it was created); the stored, encrypted,
 * recoverable alternative is `accounts real generate --password-env`. Every network, JSON mode included.
 */
export function assertWalletKeyOutputChosen(name: string, options: Pick<KaspaWalletCreateOptions, "network" | "showPrivateKey">): void {
  if (options.showPrivateKey) return;
  throw new HardkasCliError(
    WALLET_KEY_OUTPUT_REQUIRED,
    "kaspa wallet create generates a private key that HardKAS does not store, so where it goes is decided before it is created. Nothing was generated.",
    {
      exitCode: HardkasExitCode.USAGE_ERROR,
      suggestion:
        `Print it once with 'hardkas kaspa wallet create ${name} --network ${options.network} --show-private-key' (you keep the only copy), ` +
        `or create a stored, encrypted account instead: 'hardkas accounts real generate --name ${name} --network ${options.network} --password-env <VAR>'.`
    }
  );
}

const ONLY_COPY_WARNING = (name: string, network: string) => [
  "The private key below is the ONLY copy: HardKAS stores nothing and cannot recover it.",
  "Keep it somewhere safe before leaving this screen. For a stored, encrypted account use",
  `'hardkas accounts real generate --name ${name} --network ${network} --password-env <VAR>'.`
];

export async function runKaspaWalletCreate(name: string, options: KaspaWalletCreateOptions) {
  // D1: decided before the accounts package is even loaded — no key, no file, no output but the typed error.
  assertWalletKeyOutputChosen(name, options);
  try {
    const { createLocalKaspaWallet } = await import("@hardkas/accounts");
    const out = getOutput();
    const network = options.network as WalletNetwork;
    const privateKeyEnv = privateKeyEnvOf(name);

    if (options.json) {
      const wallet = await createLocalKaspaWallet({ networkId: network });
      // the warning reaches the user on stderr; stdout carries exactly one document, the key in it once (asked for)
      for (const line of ONLY_COPY_WARNING(name, options.network)) out.warn(`${pc.yellow("⚠")} ${line}`);
      out.writeJson({
        ok: true,
        command: "kaspa wallet create",
        mode: "cli",
        result: {
          name,
          network: options.network,
          address: wallet.address,
          ...(wallet.publicKey ? { publicKey: wallet.publicKey } : {}),
          privateKeyEnv,
          privateKey: wallet.privateKey,
          persisted: false
        }
      });
      return;
    }

    out.writeLine(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    out.writeLine(pc.bold(`HardKAS • Kaspa Wallet Creation`));
    out.writeLine(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

    const wallet = await createLocalKaspaWallet({ networkId: network });

    out.writeLine(`  ${pc.green("✓")} New Kaspa L1 wallet generated:`);
    out.writeLine(`    Name:    ${pc.white(name)}`);
    out.writeLine(`    Address: ${pc.white(wallet.address)}`);
    out.writeLine(`    Network: ${pc.white(options.network)}`);

    out.writeLine(`\n  ${pc.yellow("Action Required:")} Add this to your ${pc.white("hardkas.config.ts")}:`);
    out.writeLine(pc.gray("  ----------------------------------------"));
    out.writeLine(pc.white(`  accounts: {`));
    out.writeLine(pc.white(`    ${name}: {`));
    out.writeLine(pc.white(`      kind: "kaspa-private-key",`));
    out.writeLine(pc.white(`      address: "${wallet.address}",`));
    out.writeLine(pc.white(`      privateKeyEnv: "${privateKeyEnv}"`));
    out.writeLine(pc.white(`    }`));
    out.writeLine(pc.white(`  }`));
    out.writeLine(pc.gray("  ----------------------------------------"));

    // the warning first, then the key — printed once, here only (never through handleError, an event or evidence)
    const [first, ...rest] = ONLY_COPY_WARNING(name, options.network);
    out.writeLine(`\n  ${pc.red("⚠")} ${pc.red(pc.bold(first!))}`);
    for (const line of rest) out.writeLine(`    ${pc.red(line)}`);
    out.writeLine(`\n  ${pc.dim("Set your private key in .env:")}`);
    out.writeLine(`  ${privateKeyEnv}=${wallet.privateKey}\n`);

    out.writeLine(`${pc.dim("HardKAS never auto-writes secrets for your protection.")}`);
  } catch (e) {
    handleError(e);
  }
}

export async function runKaspaWalletList(options: { json: boolean }) {
  try {
    const config = await loadHardkasConfig();
    const { listHardkasAccounts } = await import("@hardkas/accounts");
    const accounts = listHardkasAccounts(config.config).filter(
      (a) => a.kind === "kaspa" || a.kind === "synthetic"
    );

    if (options.json) {
      // EVIDENCE-TRUST-1 (D9): a listing reveals no secret. A plaintext account's privateKey (and any other field named
      // as a secret) is left out; revealing a key is the job of the commands whose contract is to reveal or export it.
      const { redactSecretFields } = await import("@hardkas/core");
      console.log(JSON.stringify(redactSecretFields(accounts.map((a) => ({ ...a })), "drop"), null, 2));
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
    const address = await resolveHardkasAccountAddress(name, config.config);
    console.log(address);
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("WALLET_ERROR", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "Unknown error", {
      exitCode: 1,
      cause: e
    });
  }
}

export async function runKaspaWalletBalance(
  name: string,
  options: { rpcUrl: string; json: boolean }
) {
  // RESOURCE-LIFECYCLE-1 (RL-I1): releases the client this command creates, in the finally below.
  let release: (() => Promise<void>) | undefined;
  try {
    const config = await loadHardkasConfig();
    const { resolveHardkasAccountAddress } = await import("@hardkas/accounts");
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
    const { formatSompiToKas } = await import("@hardkas/core");

    const address = await resolveHardkasAccountAddress(name, config.config);
    const client = new JsonWrpcKaspaClient({ rpcUrl: options.rpcUrl });
    release = () => client.close();
    const balance = await client.getBalanceByAddress(address);

    if (options.json) {
      console.log(
        JSON.stringify(balance, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2)
      );
      return;
    }

    console.log(`\nWallet:  ${pc.white(name)}`);
    console.log(`Address: ${pc.dim(address)}`);
    console.log(`Balance: ${pc.green(formatSompiToKas(balance.balanceSompi))} KAS\n`);
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("WALLET_OPERATION_FAILED", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "Unknown error", {
      exitCode: 1,
      cause: e
    });
  } finally {
    await release?.();
  }
}

export async function runKaspaWalletSend(
  from: string,
  to: string,
  options: { amount: string; dryRun: boolean; rpcUrl: string }
) {
  // RESOURCE-LIFECYCLE-1 (RL-I1): releases the client this command creates, in the finally below.
  let release: (() => Promise<void>) | undefined;
  try {
    const config = await loadHardkasConfig();
    const { resolveHardkasAccount, resolveHardkasAccountAddress } =
      await import("@hardkas/accounts");
    const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
    const { planPaymentWithGenerator } = await import("@hardkas/tx-builder");
    const { signTxPlanArtifact } = await import("@hardkas/accounts");
    const { HARDKAS_VERSION, finalizeTxPlanIdentity } = await import("@hardkas/artifacts");
    const { parseKasToSompi, formatSompiToKas } = await import("@hardkas/core");
    const configObj = config.config as Record<string, unknown>;
    const networkId =
      typeof configObj.networkId === "string"
        ? (configObj.networkId)
        : config.config.defaultNetwork || "simnet";

    const { resolveExecutionTarget } = await import("@hardkas/config");
    const { execution } = resolveExecutionTarget({ config: config.config, network: networkId });
    const target = {
      mode: execution.mode || "rpc",
      domain: execution.domain || "kaspa-l1",
      network: execution.network || networkId
    } as const;

    const sender = resolveHardkasAccount({ nameOrAddress: from, config: config.config, executionTarget: target });
    const targetAddress = await resolveHardkasAccountAddress(to, config.config);
    const amountSompi = parseKasToSompi(options.amount);

    const client = new JsonWrpcKaspaClient({ rpcUrl: options.rpcUrl });
    release = () => client.close();
    const utxos = await client.getUtxosByAddress(sender.address!);

    // 1. Build Plan: the kaspa-wasm Generator selects the inputs, prices the
    //    transaction (network minimum rate) and makes the change.
    const plan = await planPaymentWithGenerator({
      networkId,
      utxos: utxos.map((u) => ({
        outpoint: u.outpoint,
        address: u.address,
        amountSompi: u.amountSompi,
        scriptPublicKey: u.scriptPublicKey || "",
        ...(u.blockDaaScore !== undefined ? { blockDaaScore: BigInt(u.blockDaaScore) } : {}),
        ...(u.isCoinbase !== undefined ? { isCoinbase: u.isCoinbase } : {})
      })),
      outputs: [{ address: targetAddress, amountSompi }],
      changeAddress: sender.address!
    });

    console.log(pc.bold("\nTransaction Plan"));
    console.log(pc.dim("----------------------------------------"));
    console.log(`From:    ${pc.white(from)} (${sender.address})`);
    console.log(`To:      ${pc.white(to)} (${targetAddress})`);
    console.log(`Amount:  ${pc.green(formatSompiToKas(amountSompi))} KAS`);
    console.log(`Fee:     ${pc.yellow(formatSompiToKas(plan.estimatedFeeSompi))} KAS`);
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
    // 2. Sign
    // Map internal plan to Artifact format for the signer

    // The plan handed to the signer is sealed like every plan (IC-1′.1c): its
    // planId derives from its real identity, never from an ad-hoc digest.
    const planDraft: any = {
      schema: HardkasSchemas.TxPlan,
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      createdAt: new Date().toISOString(),
      networkId: networkId as NetworkId,
      mode: execution.mode,
      execution: execution as any,
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
        : {})
    };
    const planArtifact: TxPlanArtifact = finalizeTxPlanIdentity(planDraft) as TxPlanArtifact;

    const signedArtifact = await signTxPlanArtifact({
      target: execution as any,
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
      JSON.parse(signedArtifact.signedTransaction.payload)
    );

    if (submitResult.accepted) {
      console.log(`  ${pc.green("✓")} Transaction accepted by node.`);
      console.log(`  TXID: ${pc.bold(pc.white(submitResult.transactionId))}\n`);
    } else {
      const { HardkasCliError } = await import("../cli-errors.js");
      throw new HardkasCliError(
        "TX_REJECTED",
        `Transaction rejected by node.\nDetails: ${JSON.stringify(submitResult.raw)}`,
        { exitCode: 1 }
      );
    }
  } catch (e: unknown) {
    if (((e as any).name) === "HardkasCliError") throw e;
    const { HardkasCliError } = await import("../cli-errors.js");
    throw new HardkasCliError("WALLET_OPERATION_FAILED", ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) || "Unknown error", {
      exitCode: 1,
      cause: e
    });
  } finally {
    await release?.();
  }
}
