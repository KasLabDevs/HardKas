import fs from "node:fs";
import type { Hardkas } from "@hardkas/sdk";
import { validateAccountName } from "@hardkas/accounts";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

/** CONTAINMENT-2: `name` as a valid account name, or a usage error (ACCOUNT_NAME_INVALID, exit 2). No I/O. */
export function assertAccountName(name: unknown): string {
  try {
    if (typeof name !== "string") throw new Error("an account name is a string");
    validateAccountName(name);
    return name;
  } catch (e) {
    throw new HardkasCliError(
      "ACCOUNT_NAME_INVALID",
      `${JSON.stringify(name)} is not an account name: ${e instanceof Error ? e.message : String(e)}. Nothing was read or written.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
}

/**
 * CONTAINMENT-2 (R1-I1): the keystore file of account `name` in this workspace (`sdk.workspace.keystorePath`), decided
 * before anything is prompted for, read or written. An invalid name is a usage error (ACCOUNT_NAME_INVALID, exit 2).
 */
export function keystorePathIn(sdk: Hardkas, name: unknown): string {
  try {
    return sdk.workspace.keystorePath(name);
  } catch (e: any) {
    if (e?.code === "ACCOUNT_NAME_INVALID") {
      throw new HardkasCliError("ACCOUNT_NAME_INVALID", e.message, { exitCode: HardkasExitCode.USAGE_ERROR, cause: e });
    }
    throw e;
  }
}

/**
 * CONTAINMENT-2 (R1-I2): refuses (ACCOUNT_NAME_TAKEN, exit 2) any of `names` that this workspace already uses, before
 * anything is prompted for or written: an account of the store with that name in any case, or, when a keystore will
 * be written (`keystoreDir`), an existing keystore file with that name in any case (on a case-insensitive file system
 * `Alice.json` IS `alice.json`, so writing it would replace another account's key).
 */
export function assertAccountNamesFree(
  names: readonly string[],
  existing: readonly { name: string }[],
  keystoreDir: string | undefined,
  nothingWas: string
): void {
  const keystores =
    keystoreDir && fs.existsSync(keystoreDir) ? new Set(fs.readdirSync(keystoreDir).map((f) => f.toLowerCase())) : new Set<string>();
  const taken = names.filter(
    (n) => existing.some((a) => a.name.toLowerCase() === n.toLowerCase()) || keystores.has(`${n}.json`.toLowerCase())
  );
  if (taken.length > 0) {
    throw new HardkasCliError(
      "ACCOUNT_NAME_TAKEN",
      `An account named ${taken.map((n) => `'${n}'`).join(", ")} already exists in this workspace (.hardkas/accounts.real.json or .hardkas/keystore/). Nothing was ${nothingWas}; choose another --name.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
}
