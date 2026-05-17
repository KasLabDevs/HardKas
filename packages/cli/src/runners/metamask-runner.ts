import pc from "picocolors";
import { UI, handleError } from "../ui.js";
import { loadHardkasConfig } from "@hardkas/config";

export async function runMetamaskNetwork(options: { profile: string; json: boolean }) {
  try {
    const config = await loadHardkasConfig();
    const networkId = (config.config as any).networkId || config.config.defaultNetwork || "simnet";

    // Security Gate: No metamask commands on mainnet/testnet
    if (networkId === "mainnet" || networkId.startsWith("testnet")) {
       throw new Error(`MetaMask onboarding is only allowed on local development networks (simnet, localnet). Current network: ${networkId}`);
    }

    const { getL2NetworkProfile } = await import("@hardkas/l2");
    const { generateAddEthereumChainPayload } = await import("@hardkas/l2");
    
    // Provide local defaults if it's the built-in Igra profile
    const profile = await getL2NetworkProfile({
      name: options.profile,
      userProfiles: config.config.l2?.networks,
      cliOverrides: {
        rpcUrl: networkId === "simnet" || networkId === "localnet" ? "http://127.0.0.1:8545" : undefined,
        chainId: networkId === "simnet" || networkId === "localnet" ? 19416 : undefined
      }
    });
    const payload = generateAddEthereumChainPayload(profile);

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.bold(`HardKAS • MetaMask Network`));
    console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

    console.log(`${pc.cyan(pc.bold("Network Details"))}`);
    console.log(`  Name:      ${pc.white(payload.chainName)}`);
    console.log(`  RPC URL:   ${pc.white(payload.rpcUrls[0])}`);
    console.log(`  Chain ID:  ${pc.white(parseInt(payload.chainId, 16))} (${payload.chainId})`);
    console.log(`  Currency:  ${pc.white(payload.nativeCurrency.symbol)} (${payload.nativeCurrency.name})`);
    if (payload.blockExplorerUrls) {
      console.log(`  Explorer:  ${pc.white(payload.blockExplorerUrls[0])}`);
    }

    console.log(`\n${pc.yellow("To add this network to MetaMask:")}`);
    console.log(`  1. Open MetaMask settings`);
    console.log(`  2. Go to Networks -> Add a network -> Add a network manually`);
    console.log(`  3. Fill in the details above.\n`);
    
    console.log(`${pc.dim("Alternatively, run: ")} ${pc.cyan("hardkas metamask snippet")}\n`);
  } catch (e) {
    handleError(e);
  }
}

export async function runMetamaskSnippet(options: { profile: string }) {
  try {
    const config = await loadHardkasConfig();
    const networkId = (config.config as any).networkId || config.config.defaultNetwork || "simnet";

    // Security Gate
    if (networkId === "mainnet" || networkId.startsWith("testnet")) {
       throw new Error(`MetaMask onboarding is only allowed on local development networks (simnet, localnet).`);
    }

    const { getL2NetworkProfile } = await import("@hardkas/l2");
    const { generateMetaMaskSnippet } = await import("@hardkas/l2");
    
    const profile = await getL2NetworkProfile({
      name: options.profile,
      userProfiles: config.config.l2?.networks,
      cliOverrides: {
        rpcUrl: networkId === "simnet" || networkId === "localnet" ? "http://127.0.0.1:8545" : undefined,
        chainId: networkId === "simnet" || networkId === "localnet" ? 19416 : undefined
      }
    });
    const snippet = generateMetaMaskSnippet(profile);

    console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.bold(`HardKAS • MetaMask Snippet`));
    console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

    console.log(`${pc.yellow("Copy and paste this snippet into your browser console while MetaMask is open:")}\n`);
    console.log(pc.gray("```javascript"));
    console.log(pc.white(snippet));
    console.log(pc.gray("```\n"));
  } catch (e) {
    handleError(e);
  }
}

export async function runMetamaskAccount(name: string, options: { showPrivateKey: boolean; json: boolean; includeSecret: boolean }) {
  try {
    const config = await loadHardkasConfig();
    const { resolveHardkasAccount, prepareEvmAccountExport } = await import("@hardkas/accounts");
    
    const account = resolveHardkasAccount({ nameOrAddress: name, config: config.config });
    const networkId = (config.config as any).networkId || config.config.defaultNetwork || "simnet";

    // Master Security Gate: Require BOTH flags for JSON secret output for maximum hardening
    const includeSecretRequested = options.json ? (options.includeSecret && options.showPrivateKey) : options.showPrivateKey;

    const exportData = await prepareEvmAccountExport(account, networkId, { 
      includeSecret: includeSecretRequested
    });

    if (options.json) {
      // Remove privateKey if not explicitly requested in JSON
      if (!options.includeSecret) {
        delete exportData.privateKey;
      }
      console.log(JSON.stringify(exportData, null, 2));
      return;
    }

    console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.bold(`HardKAS • MetaMask Export`));
    console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

    console.log(`${pc.cyan(pc.bold("Account"))}`);
    console.log(`  Name:      ${pc.white(name)}`);
    console.log(`  Address:   ${pc.white(exportData.address)}`);

    if (options.showPrivateKey && exportData.privateKey) {
      console.log(`\n  ${pc.bgRed(pc.white(pc.bold(" SECURITY WARNING ")))}`);
      console.log(`  ${pc.red("This is a LOCAL DEV ONLY account. Never share private keys.")}\n`);
      console.log(`  Private Key: ${pc.white(exportData.privateKey)}`);
    } else {
      console.log(`\n  Private Key: ${pc.dim("[HIDDEN]")}`);
      console.log(`  ${pc.dim("Run with ")} ${pc.cyan("--show-private-key")} ${pc.dim("to reveal.")}`);
    }

    console.log(`\n${pc.yellow("To import this account into MetaMask:")}`);
    console.log(`  1. Open MetaMask`);
    console.log(`  2. Click the Account menu (top right)`);
    console.log(`  3. Click "Import Account"`);
    console.log(`  4. Paste the private key above.\n`);

  } catch (e) {
    handleError(e);
  }
}
