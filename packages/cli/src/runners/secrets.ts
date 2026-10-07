import enquirer from "enquirer";
import fs from "node:fs";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

const { Password } = enquirer as unknown as {
  Password: new (options: Record<string, unknown>) => { run(): Promise<string> };
};

export interface SecretAcquisitionOptions {
  stdin?: boolean | undefined;
  env?: string | undefined;
  message?: string | undefined;
  /** False when the command must never prompt (machine-readable output such as `--json`). */
  interactive?: boolean | undefined;
}

type SecretKind = "password" | "private-key";

// Accounts lifecycle wave (2026-10-03): without a terminal the interactive prompt never settled, Node
// exited 0 with nothing done and the workspace lock left behind. A secret now comes from the named
// environment variable, from stdin, or from a prompt only on a terminal and when the command allows
// one; otherwise the command fails with a typed error before anything is written. The secret itself
// is never part of a message.
function secretRequired(kind: SecretKind, why: string): HardkasCliError {
  return kind === "password"
    ? new HardkasCliError(
        "KEYSTORE_PASSWORD_REQUIRED",
        `A keystore password is required: ${why}. Pass it with --password-env <VAR> or --password-stdin.`,
        { exitCode: HardkasExitCode.USAGE_ERROR }
      )
    : new HardkasCliError(
        "PRIVATE_KEY_REQUIRED",
        `A private key is required: ${why}. Pass it with --private-key-env <VAR> or --private-key-stdin.`,
        { exitCode: HardkasExitCode.USAGE_ERROR }
      );
}

async function acquireSecret(kind: SecretKind, options: SecretAcquisitionOptions): Promise<string> {
  // 1. A named environment variable must hold the secret: no fallback to a prompt.
  if (options.env) {
    const value = process.env[options.env];
    if (value) return value;
    throw secretRequired(kind, `the environment variable ${options.env} is not set or is empty`);
  }

  // 2. Stdin
  if (options.stdin) {
    const data = await new Promise<string>((resolve, reject) => {
      let text = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        text += chunk;
      });
      process.stdin.on("end", () => {
        resolve(text.trim());
      });
      process.stdin.on("error", reject);
    });
    if (!data) throw secretRequired(kind, "nothing was read from stdin");
    return data;
  }

  // 3. An interactive prompt: only on a terminal, and only when the command allows one.
  if (options.interactive === false) {
    throw secretRequired(kind, "this command does not prompt when its output is machine-readable");
  }
  if (!process.stdin.isTTY) {
    throw secretRequired(kind, "there is no terminal to prompt on");
  }
  const prompt = new Password({
    name: "password",
    message: options.message || (kind === "password" ? "Enter password:" : "Enter private key (hex):")
  });
  return await prompt.run();
}

/**
 * Acquires a password from the environment, stdin, or an interactive prompt (terminal only).
 */
export async function acquirePassword(
  options: SecretAcquisitionOptions = {}
): Promise<string> {
  return acquireSecret("password", options);
}

/**
 * Acquires a private key from the environment, stdin, or an interactive prompt (terminal only).
 */
export async function acquirePrivateKey(
  options: SecretAcquisitionOptions = {}
): Promise<string> {
  return acquireSecret("private-key", options);
}
