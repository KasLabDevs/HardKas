import { resolveHardkasAccount } from "@hardkas/accounts";
import { Hardkas } from "@hardkas/sdk";
import { UI } from "../ui.js";
/**
 * Reusable logic for transaction signing.
 */
export async function runTxSign(input) {
    const { planArtifact, accountName, config, allowMainnetSigning, append, threshold, requiredSigners, workspaceRoot, signer } = input;
    const targetAccountName = accountName ||
        planArtifact.from?.accountName ||
        planArtifact.from?.input ||
        planArtifact.from?.address;
    const account = resolveHardkasAccount({ nameOrAddress: targetAccountName, config });
    const artifactNetwork = planArtifact.networkId;
    const accountAddressNetwork = getNetworkFromAddress(account.address || "");
    if (artifactNetwork === "mainnet") {
        UI.warning("CRITICAL: You are signing a transaction for MAINNET.");
        UI.info("HardKAS is developer infrastructure, not production custody software.");
        UI.info("Do not use high-value mainnet keys in this environment.");
        if (!allowMainnetSigning) {
            throw new Error("Mainnet signing is blocked. Use --allow-mainnet-signing if you understand the risks.");
        }
    }
    // Check for network mismatch
    if (artifactNetwork !== accountAddressNetwork && accountAddressNetwork !== "unknown") {
        if (artifactNetwork === "mainnet" || accountAddressNetwork === "mainnet") {
            throw new Error(`Network mismatch: Plan is for '${artifactNetwork}' but account is for '${accountAddressNetwork}'. Refusing to sign.`);
        }
    }
    // Open the SDK to perform transaction signing & event emission & SQLite indexing
    const sdk = await Hardkas.open({ cwd: workspaceRoot || process.cwd(), signer });
    const signedArtifact = await sdk.tx.sign(planArtifact, accountName, {
        ...(append !== undefined ? { append } : {}),
        ...(threshold !== undefined ? { threshold } : {}),
        ...(requiredSigners !== undefined ? { requiredSigners } : {})
    });
    return signedArtifact;
}
export function getNetworkFromAddress(address) {
    if (address.startsWith("kaspa:sim_") || address.startsWith("kaspasim:"))
        return "simnet";
    if (address.startsWith("kaspa:"))
        return "mainnet";
    if (address.startsWith("kaspatest:"))
        return "testnet-10";
    return "unknown";
}
//# sourceMappingURL=tx-sign-runner.js.map