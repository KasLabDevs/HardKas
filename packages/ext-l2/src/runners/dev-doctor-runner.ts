import { loadHardkasConfig } from "@hardkas/config";
import {
  collectWorkspaceDoctorChecks,
  renderWorkspaceDoctorReport,
  type WorkspaceDoctorCheck,
  type WorkspaceDoctorStatus
} from "@hardkas/cli/extension-kit";

/**
 * NEW-11 (L2-EXT stage 2b): the doctor split by responsibility.
 *   - `hardkas doctor workspace` (core): the L1 checks (workspace, config, artifacts, ledger, store, SDK, release);
 *   - `hardkas l2 doctor` (here): only the L2 checks (profile, EVM JSON-RPC, chain id, EVM account);
 *   - `hardkas dev doctor` (alias for one version, here): both, in the order and with the report `dev doctor` had.
 */

export type DevDoctorCheck = WorkspaceDoctorCheck;

export interface DevDoctorOptions {
  profile: string;
  rpcUrl?: string;
  account?: string;
  timeout?: string;
  json: boolean;
  release?: boolean;
}

/** Report schema of `l2 doctor` (owned by the extension). */
export const L2_DOCTOR_SCHEMA = "hardkas.l2Doctor.v1";

/** The L2 section: what `dev doctor` checked after the L1 checks, and nothing else. */
export async function collectL2DoctorChecks(
  config: any,
  options: Pick<DevDoctorOptions, "profile" | "rpcUrl" | "account" | "timeout">
): Promise<{ checks: DevDoctorCheck[]; status: WorkspaceDoctorStatus }> {
  const checks: DevDoctorCheck[] = [];
  const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : 3000;

  // L2 Experimental Status
  checks.push({
    name: "Igra/L2 Features",
    status: "warning",
    message: "Experimental / Read-Only mode"
  });

  const { getL2NetworkProfile, EvmJsonRpcClient } = await import("@hardkas/l2");
  const { listHardkasAccounts } = await import("@hardkas/accounts");

  // Resolve Profile (L2 RPC Checks)
  let profile;
  try {
    profile = await getL2NetworkProfile({
      name: options.profile,
      userProfiles: config?.config?.l2?.networks,
      // No implicit endpoint or chain rewrite: the selected profile (default `local`) decides.
      cliOverrides: {
        ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {})
      }
    });
  } catch (e: unknown) {
    checks.push({ name: "L2 Profile", status: "warning", message: e instanceof Error ? e.message : String(e) });
  }

  if (profile) {
    const rpcUrl = options.rpcUrl || profile.rpcUrl;

    if (rpcUrl) {
      const client = new EvmJsonRpcClient({ url: rpcUrl, timeoutMs });

      try {
        const block = await client.getBlockNumber();
        checks.push({
          name: "Igra RPC Connectivity",
          status: "success",
          message: `Reachable (Block #${block})`
        });
      } catch (e: unknown) {
        checks.push({
          name: "Igra RPC Connectivity",
          status: "warning",
          message: `Unreachable: ${e instanceof Error ? e.message : String(e)}`
        });
      }

      if (profile.chainId !== undefined) {
        try {
          const chainId = await client.getChainId();
          if (chainId === profile.chainId) {
            checks.push({
              name: "Chain ID Verification",
              status: "success",
              message: `Matches profile (${chainId})`
            });
          } else {
            checks.push({
              name: "Chain ID Verification",
              status: "warning",
              message: `Mismatch: profile expects ${profile.chainId}, node reports ${chainId}`
            });
          }
        } catch (e) {}
      }

      const accounts = config ? listHardkasAccounts(config.config) : [];
      const evmAccounts = accounts.filter((a: any) => a.kind === "evm-private-key");

      const targetAccount = options.account
        ? evmAccounts.find((a: any) => a.name === options.account)
        : evmAccounts[0];

      if (targetAccount) {
        checks.push({
          name: "Local EVM Account",
          status: "success",
          message: `Found "${targetAccount.name}"`
        });
      } else {
        checks.push({
          name: "Local EVM Account",
          status: "warning",
          message: "No EVM accounts found in config"
        });
      }
    }
  }

  return { checks, status: "warning" };
}

/** `hardkas dev doctor`: the core's workspace checks with the L2 section where it always was. */
export async function runDevDoctor(options: DevDoctorOptions) {
  const result = await collectWorkspaceDoctorChecks({
    release: options.release,
    extend: (config) => collectL2DoctorChecks(config, options)
  });
  await renderWorkspaceDoctorReport(result, {
    json: options.json,
    title: "Dev Doctor",
    failureCode: "DEV_DOCTOR_FAILED",
    failureMessage: "Dev doctor checks failed."
  });
}

/** `hardkas l2 doctor`: the L2 checks alone (the L1 ones are `hardkas doctor workspace`). */
export async function runL2Doctor(options: DevDoctorOptions) {
  let config: any;
  try {
    config = await loadHardkasConfig();
  } catch {
    config = undefined; // built-in profiles, no configured accounts
  }
  const result = await collectL2DoctorChecks(config, options);
  await renderWorkspaceDoctorReport(result, {
    json: options.json,
    title: "L2 Doctor",
    failureCode: "L2_DOCTOR_FAILED",
    failureMessage: "L2 doctor checks failed.",
    schema: L2_DOCTOR_SCHEMA
  });
}
