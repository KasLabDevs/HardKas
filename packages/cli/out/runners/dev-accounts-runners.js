import { UI } from "../ui.js";
import { getOrCreateDevAccount, listDevAccountsSync } from "@hardkas/accounts";
import pc from "picocolors";
import { loadHardkasConfig } from "@hardkas/config";
export async function runDevAccountsList() {
    const loaded = await loadHardkasConfig();
    const accounts = listDevAccountsSync(loaded.cwd);
    if (accounts.length === 0) {
        UI.info("No dev accounts found. They will be generated automatically when running 'hardkas dev'.");
        return;
    }
    console.log(pc.bold("\nDev Accounts (Simnet Only)\n"));
    for (const acc of accounts) {
        console.log(`  ${pc.blue(acc.name)}`);
        console.log(`  Address: ${acc.address}\n`);
    }
}
export async function runDevAccountsReveal(alias) {
    const loaded = await loadHardkasConfig();
    const { resolveExecutionTarget } = await import("@hardkas/config");
    const { execution } = resolveExecutionTarget({ config: loaded.config });
    const { assertExecutionCompatibility } = await import("@hardkas/core");
    const { resolveHardkasAccount } = await import("@hardkas/accounts");
    let accountMeta;
    try {
        accountMeta = resolveHardkasAccount({ nameOrAddress: alias, config: loaded.config });
    }
    catch (e) {
        // If resolution fails, it might not be properly mapped, but we'll try to find it in dev accounts
    }
    if (accountMeta) {
        try {
            assertExecutionCompatibility({
                operation: "dev-reveal",
                target: {
                    mode: execution.mode || "simulator",
                    domain: execution.domain || "kaspa-l1",
                    network: execution.network || "simulated"
                },
                account: {
                    kind: accountMeta.kind,
                    network: accountMeta.network,
                    executionMode: accountMeta.executionMode
                }
            });
        }
        catch (e) {
            UI.error(`Execution incompatibility: ${e.message}`);
            return;
        }
    }
    else {
        // Fallback if not mapped
        if (execution.network !== "simnet" && execution.network !== "simulated") {
            UI.error("Reveal dev accounts is ONLY allowed on simnet or simulated for safety.");
            return;
        }
    }
    const accounts = listDevAccountsSync(loaded.cwd);
    const index = accounts.findIndex((a) => a.name === alias || a.name === alias.toString());
    if (index === -1) {
        UI.error(`Dev account alias '${alias}' not found.`);
        return;
    }
    const acc = await getOrCreateDevAccount(loaded.cwd, index, alias);
    console.log(pc.red(pc.bold("\n⚠️  PRIVATE KEY REVEALED ⚠️")));
    console.log(pc.red("Never use this key on testnet or mainnet."));
    console.log("\nAccount: " + pc.blue(alias));
    console.log("Address: " + acc.address);
    console.log("Private Key: " + pc.yellow(acc.privateKey) + "\n");
}
export async function runDevAccountsExport(alias) {
    const loaded = await loadHardkasConfig();
    const { resolveExecutionTarget } = await import("@hardkas/config");
    const { execution } = resolveExecutionTarget({ config: loaded.config });
    const { assertExecutionCompatibility } = await import("@hardkas/core");
    const { resolveHardkasAccount } = await import("@hardkas/accounts");
    let accountMeta;
    try {
        accountMeta = resolveHardkasAccount({ nameOrAddress: alias, config: loaded.config });
    }
    catch (e) { }
    if (accountMeta) {
        try {
            assertExecutionCompatibility({
                operation: "dev-export",
                target: {
                    mode: execution.mode || "simulator",
                    domain: execution.domain || "kaspa-l1",
                    network: execution.network || "simulated"
                },
                account: {
                    kind: accountMeta.kind,
                    network: accountMeta.network,
                    executionMode: accountMeta.executionMode
                }
            });
        }
        catch (e) {
            UI.error(`Execution incompatibility: ${e.message}`);
            return;
        }
    }
    else {
        if (execution.network !== "simnet" && execution.network !== "simulated") {
            UI.error("Exporting dev accounts is ONLY allowed on simnet or simulated for safety.");
            return;
        }
    }
    const accounts = listDevAccountsSync(loaded.cwd);
    const index = accounts.findIndex((a) => a.name === alias || a.name === alias.toString());
    if (index === -1) {
        UI.error(`Dev account alias '${alias}' not found.`);
        return;
    }
    const acc = await getOrCreateDevAccount(loaded.cwd, index, alias);
    console.log(pc.bold("\nManual Kasware Import Helper"));
    console.log(pc.dim("----------------------------------------"));
    console.log(pc.red("WARNING: Simnet development account only.\n"));
    console.log(`1. Open Kasware Extension`);
    console.log(`2. Go to Settings -> Network -> Select 'Kaspa Simnet'`);
    console.log(`3. Click 'Import Account'`);
    console.log(`4. Paste the following raw Hex private key:\n`);
    console.log(pc.yellow(acc.privateKey));
    console.log(pc.dim("\n----------------------------------------\n"));
}
//# sourceMappingURL=dev-accounts-runners.js.map