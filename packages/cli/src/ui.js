import pc from "picocolors";
import { formatSompi, maskSecrets } from "@hardkas/core";
let jsonMode = false;
export const UI = {
    setJsonMode(enabled) {
        jsonMode = enabled;
    },
    isJsonMode() {
        return jsonMode;
    },
    logHuman(msg) {
        // In JSON mode, all human-readable text MUST go to stderr to prevent stdout corruption
        if (jsonMode) {
            console.error(msg);
        }
        else {
            console.log(msg);
        }
    },
    writeJson(data) {
        // Only ever written to stdout
        console.log(JSON.stringify(data, null, 2));
    },
    header(text) {
        const masked = maskSecrets(text);
        this.logHuman(pc.bold(pc.magenta(`\n  ═══ ${masked} ═══`)));
    },
    divider() {
        this.logHuman(pc.dim("  " + "─".repeat(50)));
    },
    bullet(text) {
        this.logHuman(`  • ${text}`);
    },
    step(num, text) {
        this.logHuman(`  ${pc.dim(num.toString() + ".")} ${text}`);
    },
    raw(text) {
        this.logHuman(text);
    },
    emptyLine() {
        this.logHuman("");
    },
    info(text) {
        this.logHuman(`  ${pc.blue("ℹ")} ${text}`);
    },
    success(text) {
        this.logHuman(`  ${pc.green("✔")} ${text}`);
    },
    box(title, subtitle) {
        const width = 40;
        this.logHuman(pc.magenta(`  ╔${"═".repeat(width - 2)}╗`));
        this.logHuman(pc.magenta(`  ║${pc.bold(pc.white(title.padStart((width - 2 + title.length) / 2).padEnd(width - 2)))}║`));
        if (subtitle) {
            this.logHuman(pc.magenta(`  ║${pc.italic(pc.dim(subtitle.padStart((width - 2 + subtitle.length) / 2).padEnd(width - 2)))}║`));
        }
        this.logHuman(pc.magenta(`  ╚${"═".repeat(width - 2)}╝`));
        this.logHuman("");
    },
    warning(text) {
        const masked = maskSecrets(text);
        console.error(pc.yellow(`\n  ⚠️  WARNING:`));
        console.error(pc.yellow(`     ${masked}`));
    },
    securityWarning(code, message, suggestion) {
        console.error(pc.yellow(`\n  ⚠️  SECURITY WARNING [${code}]:`));
        console.error(pc.yellow(`     ${message}`));
        if (suggestion) {
            console.error(pc.cyan(`\n  💡 Suggestion:`));
            console.error(pc.cyan(`     ${suggestion}`));
        }
        console.error("");
    },
    error(msg, suggestion) {
        const maskedMsg = maskSecrets(msg);
        const maskedSuggestion = suggestion ? maskSecrets(suggestion) : undefined;
        console.error(pc.red(`\n  ✗ Error:`));
        console.error(pc.red(`    ${maskedMsg}`));
        if (maskedSuggestion) {
            console.error(pc.cyan(`\n  💡 Suggestion:`));
            console.error(pc.cyan(`    ${maskedSuggestion}`));
        }
    },
    field(label, value) {
        const val = value === undefined || value === null ? pc.dim("none") : maskSecrets(String(value));
        this.logHuman(`  ${pc.dim(label.padEnd(16))} ${pc.white(val)}`);
    },
    kas(label, sompi) {
        this.field(label, pc.cyan(formatSompi(BigInt(sompi))));
    },
    maturity(label) {
        const colors = {
            stable: pc.green,
            preview: pc.blue,
            experimental: pc.yellow,
            research: pc.magenta,
            internal: pc.dim
        };
        const color = colors[label.toLowerCase()] || pc.white;
        return color(label.toLowerCase());
    },
    async confirm(message) {
        const readline = await import("node:readline/promises");
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question(pc.yellow(`  ⚠️  ${message} (y/N): `));
        rl.close();
        return answer.toLowerCase() === "y";
    },
    footer(hint) {
        if (hint) {
            this.logHuman(pc.dim(`\n  Hint: ${hint}`));
        }
        this.logHuman("");
    },
    causality(title, details, nextSteps) {
        this.logHuman(`\n  ${pc.green("✔")} ${pc.bold(title)}\n`);
        for (const [key, value] of Object.entries(details)) {
            if (value) {
                this.logHuman(`  ${pc.dim(key)}`);
                this.logHuman(`    ${pc.white(value)}\n`);
            }
        }
        if (nextSteps && nextSteps.length > 0) {
            this.printNextSteps(nextSteps);
        }
    },
    printNextSteps(steps) {
        if (jsonMode)
            return;
        this.logHuman(`\n  💡 ${pc.bold("Next Steps:")}`);
        for (const step of steps) {
            this.logHuman(`     > ${pc.blue(step)}`);
        }
        this.logHuman("");
    },
    semanticError(title, cause, invariant, consequence, remediation) {
        console.error(pc.red(`\n  ✗ ${title}\n`));
        console.error(`  ${pc.dim("Cause:")}`);
        console.error(`    ${pc.white(cause)}\n`);
        console.error(`  ${pc.dim("Invariant Violated:")}`);
        console.error(`    ${pc.yellow(invariant)}\n`);
        console.error(`  ${pc.dim("Consequence:")}`);
        console.error(`    ${pc.white(consequence)}\n`);
        console.error(`  ${pc.dim("Remediation:")}`);
        console.error(`    ${pc.cyan(remediation)}\n`);
    },
    dryRun(message) {
        // Always write to stderr — must not pollute stdout (which may carry JSON)
        console.error(pc.yellow(`\n  [DRY RUN]`));
        console.error(pc.white(`  No persistent artifacts were written.`));
        console.error(pc.dim(`\n  Use:\n    ${pc.white("--yes")}\n  to persist deterministic artifacts.\n`));
    },
    writeError(msg) {
        // Unconditionally writes to stderr — safe in both JSON and human mode
        console.error(msg);
    }
};
export function handleError(e, context) {
    if (e instanceof Error && e.code === "REPLAY_DIVERGED") {
        const report = e.report;
        UI.semanticError("Replay Verification Failed", report?.errors?.[0] || "State modifications detected during deterministic replay", "deterministic execution integrity", "replay artifact is corrupted and excluded from deterministic validation", "restore the original artifact or regenerate the replay lineage");
        if (report && report.divergences && report.divergences.length > 0) {
            // Always use stderr — divergence output must not corrupt JSON stdout
            console.error(pc.bold("\n  Divergences found:"));
            for (const div of report.divergences) {
                console.error(`    ${pc.cyan(div.path)}:`);
                console.error(`      Expected: ${pc.green(JSON.stringify(div.expected))}`);
                console.error(`      Actual:   ${pc.red(JSON.stringify(div.actual))}`);
            }
        }
        return;
    }
    const rawMsg = e instanceof Error ? e.message : String(e);
    const msg = maskSecrets ? maskSecrets(rawMsg) : rawMsg;
    const errorObj = e;
    let reason = maskSecrets ? maskSecrets(errorObj.reason) : errorObj.reason;
    let suggestion = maskSecrets ? maskSecrets(errorObj.suggestion) : errorObj.suggestion;
    if (msg === "Real transaction signing is not available") {
        console.error(`\n${msg}`);
        if (reason)
            console.error(`\nReason:\n  ${reason}`);
        if (suggestion)
            console.error(`\nSuggestion:\n  ${suggestion}\n  No artifact was written.`);
        return;
    }
    if (!suggestion) {
        if (msg.includes("Localnet state not found")) {
            suggestion =
                "Run 'hardkas localnet reset' to initialize the simulated environment.";
        }
        else if (msg.includes("Insufficient funds")) {
            suggestion =
                "Use 'hardkas faucet <address> <amount>' to add funds to your account.";
        }
        else if (msg.includes("Account not found")) {
            suggestion = "Check your 'hardkas.config.ts' or use a full Kaspa address.";
        }
        else if (msg.includes("Docker") || msg.includes("container")) {
            suggestion =
                "Ensure Docker is running and you have permissions to manage containers.";
        }
        else if (msg.includes("L2 RPC") || msg.includes("L2 profile")) {
            suggestion = "Check your L2 network configuration or pass a valid --url.";
        }
        else if (msg.includes("RPC") || msg.includes("Connection refused")) {
            suggestion =
                "The Kaspa node might still be starting. Try 'hardkas rpc health --wait'.";
        }
        else if (msg.includes("submitTransaction is not exposed")) {
            suggestion =
                "Ensure your node/RPC provider supports transaction submission and you are NOT on mainnet without --allow-mainnet-signing.";
        }
    }
    UI.error(context ? `${context}: ${msg}` : msg, suggestion);
    if (e instanceof Error && e.code && e.context) {
        const ctx = e.context;
        console.error(`  ${pc.dim("Code:")}     ${pc.white(e.code)}`);
        if (ctx.endpoint)
            console.error(`  ${pc.dim("Endpoint:")} ${pc.white(ctx.endpoint)}`);
        if (ctx.network)
            console.error(`  ${pc.dim("Network:")}  ${pc.white(ctx.network)}`);
        if (ctx.protocol)
            console.error(`  ${pc.dim("Protocol:")} ${pc.white(ctx.protocol)}`);
    }
}
/**
 * Specialized error handler for lock-related errors.
 */
export function handleLockError(e) {
    const code = e.code || "UNKNOWN_ERROR";
    const meta = e.cause;
    if (code === "LOCK_HELD" || code === "LOCK_TIMEOUT" || code === "STALE_LOCK") {
        const title = code === "STALE_LOCK"
            ? "Stale Workspace Lock Detected"
            : "Workspace is locked by another HardKAS process";
        console.error(pc.red(`\n  ✗ ${pc.bold(title)}`));
        console.error(pc.red(`  ${"─".repeat(title.length + 4)}`));
        if (meta) {
            console.error(`  ${pc.dim("Lock:")}    ${pc.white(meta.name)}`);
            console.error(`  ${pc.dim("PID:")}     ${pc.white(meta.pid)}`);
            console.error(`  ${pc.dim("Command:")} ${pc.white(meta.command)}`);
            console.error(`  ${pc.dim("Created:")} ${pc.white(meta.createdAt)}`);
            if (meta.path)
                console.error(`  ${pc.dim("Path:")}    ${pc.white(meta.path)}`);
        }
        console.error(pc.cyan(`\n  💡 Suggestion:`));
        if (code === "STALE_LOCK") {
            console.error(`    The process (PID ${meta?.pid}) appears to be dead.`);
            console.error(`    Run 'hardkas lock clear ${meta?.name} --if-dead' to release it safely.`);
        }
        else {
            console.error(`    Wait for the process to finish, or run:`);
            console.error(`    hardkas lock doctor`);
            console.error(`\n    If you believe the process is dead:`);
            console.error(`    hardkas lock clear ${meta?.name} --if-dead`);
        }
        console.error("");
        return;
    }
    handleError(e);
}
//# sourceMappingURL=ui.js.map