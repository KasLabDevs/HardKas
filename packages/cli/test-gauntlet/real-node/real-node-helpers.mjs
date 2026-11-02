// Waits for the gauntlet's real-node phase (run-real-node.mjs), tracked. GAUNTLET-HELPERS-UNTRACKED: the phase imported
// these from an ignored local file, so a clean clone could not run it. Every wait is bounded and only READS the canonical
// node (JSON wRPC) or the CLI's view of an account: nothing here mines, signs or sends.
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { getCoinbaseMaturity } from "@hardkas/core";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withClient(rpcUrl, fn) {
  const client = new JsonWrpcKaspaClient({ rpcUrl });
  try {
    return await fn(client);
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

/** The node's virtual DAA score; throws when the node does not answer one. */
export async function getVirtualDaaScore(rpcUrl) {
  return withClient(rpcUrl, async (client) => {
    const info = await client.getBlockDagInfo();
    if (info?.virtualDaaScore === undefined || info?.virtualDaaScore === null) {
      throw new Error(`DAA_SCORE_UNAVAILABLE: ${rpcUrl} answered no virtualDaaScore`);
    }
    return BigInt(info.virtualDaaScore);
  });
}

/** The node's virtual DAA score, or undefined when it cannot be read (diagnostics only). */
export async function getVirtualDaaScoreBestEffort(rpcUrl) {
  try {
    return await getVirtualDaaScore(rpcUrl);
  } catch {
    return undefined;
  }
}

/** Coinbase maturity in DAA for the network (HardKAS's upstream-derived parameter; 1000 on simnet). */
export function coinbaseMaturity(networkId = "simnet") {
  return getCoinbaseMaturity(networkId);
}

/** Resolves with the DAA score once it is at least `target`; throws TOCCATA_DAA_TIMEOUT after `timeoutMs`. */
export async function waitForDaaScore({ rpcUrl, target, timeoutMs = 600_000, intervalMs = 1_000 }) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await getVirtualDaaScoreBestEffort(rpcUrl);
    if (last !== undefined && last >= BigInt(target)) return last;
    await sleep(intervalMs);
  }
  throw new Error(`TOCCATA_DAA_TIMEOUT: the virtual DAA score (${last ?? "unavailable"}) did not reach ${target} within ${timeoutMs} ms`);
}

/** An account's balance in sompi, as `hardkas accounts balance <name> --provider rpc --json` reports it. */
export function readBalanceSompi(runCmd, accountName) {
  return balanceSompi(runCmd, accountName);
}

function balanceSompi(runCmd, accountName) {
  const out = String(runCmd(`accounts balance ${accountName} --provider rpc --json`));
  const start = out.indexOf("{");
  if (start < 0) throw new Error(`BALANCE_UNREADABLE: no JSON in the output for ${accountName}`);
  const value = JSON.parse(out.slice(start))?.result?.balanceSompi;
  if (value === undefined || value === null) throw new Error(`BALANCE_UNREADABLE: no balanceSompi for ${accountName}`);
  return BigInt(String(value));
}

/**
 * Polls the account's balance until it reaches `expectedSompi`. On timeout throws TOCCATA_FUNDING_CONFIRMATION_TIMEOUT
 * with the last balance read and the DAA score at the start ("DAA End: unavailable" is filled in by the caller).
 */
export async function waitForFundingConfirmation({ runCmd, accountName, expectedSompi, timeoutMs, intervalMs, context }) {
  const deadline = Date.now() + timeoutMs;
  let last;
  let lastError;
  while (Date.now() < deadline) {
    try {
      last = balanceSompi(runCmd, accountName);
      if (last >= BigInt(expectedSompi)) return { accountName, balanceSompi: last, expectedSompi: BigInt(expectedSompi) };
    } catch (e) {
      lastError = e;
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `TOCCATA_FUNDING_CONFIRMATION_TIMEOUT: ${accountName} holds ${last ?? "no readable balance"} of the ${expectedSompi} sompi expected ` +
      `after ${timeoutMs} ms (node ${context?.strategy?.containerName ?? "unknown"}, miner ${context?.minerName ?? "unknown"}` +
      `${lastError && last === undefined ? `; last read: ${String(lastError?.message ?? lastError).slice(0, 200)}` : ""}). ` +
      `DAA Start: ${context?.daaStart ?? "unavailable"}, DAA End: unavailable`
  );
}
