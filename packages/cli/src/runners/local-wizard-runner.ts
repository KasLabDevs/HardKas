import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";

export interface LocalWizardResult {
  schema: "hardkas.localWizard.v1";
  step: string;
  status: "success" | "pending" | "failed";
  suggestion?: string;
  accountCreated?: boolean;
}

export async function runLocalWizard(options: { 
  profile: string; 
  account: string;
  nonInteractive: boolean;
  json: boolean;
  rpcUrl?: string;
}) {
  try {
    const config = await loadHardkasConfig();
    const networkId = (config.config as any).networkId || config.config.defaultNetwork || "simnet";
    const { getL2NetworkProfile, EvmJsonRpcClient } = await import("@hardkas/l2");
    const { listHardkasAccounts } = await import("@hardkas/accounts");
    
    if (!options.json) {
      console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
      console.log(pc.bold(`HardKAS • Local Dev Wizard`));
      console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));
    }

    const result: LocalWizardResult = {
      schema: "hardkas.localWizard.v1",
      step: "preflight",
      status: "pending"
    };

    // 1. Preflight Diagnostic
    if (!options.json) console.log(`${pc.cyan(pc.bold("1. Checking Environment"))}`);
    let profile;
    try {
      profile = await getL2NetworkProfile({
        name: options.profile,
        userProfiles: config.config.l2?.networks,
        cliOverrides: {
          rpcUrl: options.rpcUrl || (networkId === "simnet" || networkId === "localnet" ? "http://127.0.0.1:8545" : undefined),
          chainId: (networkId === "simnet" || networkId === "localnet" ? 19416 : undefined)
        }
      });
      const client = new EvmJsonRpcClient({ url: profile.rpcUrl!, timeoutMs: 2000 });
      await client.getBlockNumber();
      if (!options.json) console.log(`  ${pc.green("✓")} Igra RPC is reachable (${profile.rpcUrl})`);
    } catch (e) {
      if (!options.json) {
        console.log(`  ${pc.red("✗")} Igra RPC is unreachable.`);
        console.log(`    ${pc.dim("Please start your local node first.")}`);
      }
      result.status = "failed";
      result.suggestion = "Start local Igra node";
      if (options.json) console.log(JSON.stringify(result, null, 2));
      return;
    }

    // 2. Account Check/Creation
    result.step = "accounts";
    if (!options.json) console.log(`\n${pc.cyan(pc.bold("2. Checking Accounts"))}`);
    const accounts = listHardkasAccounts(config.config);
    let targetAccount = accounts.find(a => a.name === options.account && a.kind === "evm-private-key");

    if (!targetAccount) {
      if (options.nonInteractive) {
        result.status = "failed";
        result.suggestion = `Account "${options.account}" missing. Run in interactive mode to generate.`;
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else console.log(`  ${pc.red("✗")} Account missing (non-interactive mode).`);
        return;
      }

      if (!options.json) console.log(`  ${pc.yellow("⚠")} No EVM account named "${options.account}" found.`);
      const confirm = await UI.confirm(`Would you like to generate a new local EVM account for "${options.account}"?`);
      
      if (confirm) {
        const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
        const privKey = generatePrivateKey();
        const account = privateKeyToAccount(privKey);
        
        if (!options.json) {
          console.log(`\n  ${pc.bgYellow(pc.black(pc.bold(" SECURITY ACTION: PRIVATE KEY GENERATED ")))}`);
          console.log(`  ${pc.yellow("This key is for LOCAL DEVELOPMENT ONLY. Never use it for real assets.")}\n`);
          
          console.log(`  ${pc.green("✓")} New account generated:`);
          console.log(`    Name:    ${pc.white(options.account)}`);
          console.log(`    Address: ${pc.white(account.address)}`);
          
          console.log(`\n  ${pc.yellow("Action Required:")} Add this to your ${pc.white("hardkas.config.ts")}:`);
          console.log(pc.gray("  ----------------------------------------"));
          console.log(pc.white(`  accounts: {`));
          console.log(pc.white(`    ${options.account}: {`));
          console.log(pc.white(`      kind: "evm-private-key",`));
          console.log(pc.white(`      address: "${account.address}",`));
          console.log(pc.white(`      privateKey: "${privKey}"`));
          console.log(pc.white(`    }`));
          console.log(pc.white(`  }`));
          console.log(pc.gray("  ----------------------------------------"));
          console.log(`\n  ${pc.dim("HardKAS does not automatically write secrets to your config for safety.")}`);
          console.log(`  ${pc.dim("Please update your config and run the wizard again to finish setup.")}`);
        }
        
        result.status = "pending";
        result.accountCreated = true;
        result.suggestion = "Update hardkas.config.ts with generated key";
        if (options.json) console.log(JSON.stringify(result, null, 2));
        return;
      } else {
        if (!options.json) console.log(`  ${pc.red("✗")} Setup cancelled.`);
        result.status = "failed";
        if (options.json) console.log(JSON.stringify(result, null, 2));
        return;
      }
    } else {
      if (!options.json) console.log(`  ${pc.green("✓")} Account "${targetAccount.name}" found (${targetAccount.address})`);
    }

    // 3. Balance & Funding
    result.step = "balance";
    if (!options.json) console.log(`\n${pc.cyan(pc.bold("3. Checking Balance"))}`);
    const client = new EvmJsonRpcClient({ url: profile.rpcUrl! });
    const balance = await client.getBalanceWei(targetAccount.address as any);
    const kasBalance = Number(balance) / 1e18;

    if (kasBalance === 0) {
      if (!options.json) {
        console.log(`  ${pc.yellow("⚠")} Account has 0 iKAS.`);
        console.log(`  ${pc.dim("Please fund your account manually or via local faucet.")}`);
      }
      result.status = "failed";
      result.suggestion = "Fund local account";
    } else {
      if (!options.json) console.log(`  ${pc.green("✓")} Balance: ${kasBalance} iKAS`);
    }

    // 4. Final Success
    result.status = (kasBalance > 0 ? "success" : "failed") as any;
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.status === "success") {
      console.log(`\n${pc.cyan(pc.bold("4. MetaMask Onboarding"))}`);
      console.log(`  ${pc.dim("To add this network to MetaMask, run:")}`);
      console.log(`  ${pc.white("hardkas metamask snippet")}`);
      
      console.log(`\n${pc.bold(pc.green("READY!"))} Local environment is set up.`);
      console.log(`\n${pc.cyan("Final step:")} Import your account into MetaMask:`);
      console.log(`  hardkas metamask account ${pc.white(options.account)} --show-private-key\n`);
    }

  } catch (e) {
    handleError(e);
  }
}
