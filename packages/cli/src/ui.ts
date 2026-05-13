import pc from "picocolors";
import { formatSompi, maskSecrets } from "@hardkas/core";

export const UI = {
  header(text: string) {
    const masked = maskSecrets(text);
    console.log(pc.bold(pc.magenta(`\n  ═══ ${masked} ═══`)));
  },
  
  divider() {
    console.log(pc.dim("  " + "─".repeat(50)));
  },

  info(text: string) {
    console.log(`  ${pc.blue("ℹ")} ${text}`);
  },

  success(text: string) {
    console.log(`  ${pc.green("✔")} ${text}`);
  },

  box(title: string, subtitle?: string) {
    const width = 40;
    console.log(pc.magenta(`  ╔${"═".repeat(width - 2)}╗`));
    console.log(pc.magenta(`  ║${pc.bold(pc.white(title.padStart((width - 2 + title.length) / 2).padEnd(width - 2)))}║`));
    if (subtitle) {
      console.log(pc.magenta(`  ║${pc.italic(pc.dim(subtitle.padStart((width - 2 + subtitle.length) / 2).padEnd(width - 2)))}║`));
    }
    console.log(pc.magenta(`  ╚${"═".repeat(width - 2)}╝`));
    console.log("");
  },

  warning(text: string) {
    const masked = maskSecrets(text);
    console.log(pc.yellow(`\n  ⚠️  WARNING:`));
    console.log(pc.yellow(`     ${masked}`));
  },

  error(msg: string, suggestion?: string) {
    const maskedMsg = maskSecrets(msg);
    const maskedSuggestion = suggestion ? maskSecrets(suggestion) : undefined;
    console.error(pc.red(`\n  ✗ Error:`));
    console.error(pc.red(`    ${maskedMsg}`));
    if (maskedSuggestion) {
      console.error(pc.cyan(`\n  💡 Suggestion:`));
      console.error(pc.cyan(`    ${maskedSuggestion}`));
    }
  },

  field(label: string, value: string | number | boolean | undefined | null) {
    const val = value === undefined || value === null ? pc.dim("none") : maskSecrets(String(value));
    console.log(`  ${pc.dim(label.padEnd(16))} ${pc.white(val)}`);
  },

  kas(label: string, sompi: bigint | string) {
    this.field(label, pc.cyan(formatSompi(BigInt(sompi))));
  },

  maturity(label: string) {
    const colors: Record<string, any> = {
      stable: pc.green,
      preview: pc.blue,
      experimental: pc.yellow,
      research: pc.magenta,
      internal: pc.dim
    };
    const color = colors[label.toLowerCase()] || pc.white;
    return color(label.toLowerCase());
  },

  async confirm(message: string): Promise<boolean> {
    const readline = await import("node:readline/promises");
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(pc.yellow(`  ⚠️  ${message} (y/N): `));
    rl.close();
    return answer.toLowerCase() === "y";
  },

  footer(hint?: string) {
    if (hint) {
      console.log(pc.dim(`\n  Hint: ${hint}`));
    }
    console.log("");
  }
};

export function handleError(e: unknown, context?: string) {
  const rawMsg = e instanceof Error ? e.message : String(e);
  const msg = maskSecrets ? maskSecrets(rawMsg) : rawMsg;
  const errorObj = e as any;
  
  let reason = maskSecrets ? maskSecrets(errorObj.reason) : errorObj.reason;
  let suggestion = maskSecrets ? maskSecrets(errorObj.suggestion) : errorObj.suggestion;

  if (msg === "Real transaction signing is not available") {
    console.error(`\n${msg}`);
    if (reason) console.error(`\nReason:\n  ${reason}`);
    if (suggestion) console.error(`\nSuggestion:\n  ${suggestion}\n  No artifact was written.`);
    return;
  }

  if (!suggestion) {
    if (msg.includes("Localnet state not found")) {
      suggestion = "Run 'hardkas localnet reset' to initialize the simulated environment.";
    } else if (msg.includes("Insufficient funds")) {
      suggestion = "Use 'hardkas faucet <address> <amount>' to add funds to your account.";
    } else if (msg.includes("Account not found")) {
      suggestion = "Check your 'hardkas.config.ts' or use a full Kaspa address.";
    } else if (msg.includes("Docker") || msg.includes("container")) {
      suggestion = "Ensure Docker is running and you have permissions to manage containers.";
    } else if (msg.includes("L2 RPC") || msg.includes("L2 profile")) {
      suggestion = "Check your L2 network configuration or pass a valid --url.";
    } else if (msg.includes("RPC") || msg.includes("Connection refused")) {
      suggestion = "The Kaspa node might still be starting. Try 'hardkas rpc health --wait'.";
    } else if (msg.includes("submitTransaction is not exposed")) {
      suggestion = "Ensure your node/RPC provider supports transaction submission and you are NOT on mainnet without --allow-mainnet-signing.";
    }
  }

  UI.error(context ? `${context}: ${msg}` : msg, suggestion);
}
