import { UI } from "../ui.js";
export function registerMetamaskCommands(program) {
    const metamaskCmd = program
        .command("metamask", { hidden: true })
        .description("MetaMask onboarding and account export (local-dev only)");
    metamaskCmd.hook("preAction", () => {
        if (!process.env.HARDKAS_EXPERIMENTAL) {
            console.warn("\n⚠️  WARNING: 'metamask' commands are highly experimental and unsupported. Set HARDKAS_EXPERIMENTAL=1 to acknowledge.\n");
        }
    });
    metamaskCmd
        .command("network")
        .description(`Show local Igra network parameters for MetaMask ${UI.maturity("stable")}`)
        .option("--profile <name>", "L2 network profile name", "igra")
        .option("--json", "Output as JSON", false)
        .action(async (options) => {
        const { runMetamaskNetwork } = await import("../runners/metamask-runner.js");
        await runMetamaskNetwork(options);
    });
    metamaskCmd
        .command("snippet")
        .description(`Generate JS snippet to add local network to MetaMask ${UI.maturity("stable")}`)
        .option("--profile <name>", "L2 network profile name", "igra")
        .action(async (options) => {
        const { runMetamaskSnippet } = await import("../runners/metamask-runner.js");
        await runMetamaskSnippet(options);
    });
    metamaskCmd
        .command("account <name>")
        .description(`Export a local EVM account for MetaMask import ${UI.maturity("stable")}`)
        .option("--show-private-key", "Reveal the private key (LOCAL DEV ONLY)", false)
        .option("--json", "Output as JSON", false)
        .option("--include-secret", "Include secret in JSON output (UNSAFE)", false)
        .action(async (name, options) => {
        const { runMetamaskAccount } = await import("../runners/metamask-runner.js");
        await runMetamaskAccount(name, options);
    });
}
//# sourceMappingURL=metamask.js.map