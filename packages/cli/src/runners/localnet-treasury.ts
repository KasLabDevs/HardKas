import { getOutput } from "../output.js";
import { UI } from "../ui.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { loadHardkasConfig } from "@hardkas/config";
import {
  assertExecutionCompatibility,
  formatSompiToKas,
  getCoinbaseMaturity,
  systemRuntimeContext,
  type NetworkId
} from "@hardkas/core";
import { requireNodeIdentity } from "@hardkas/node-runner";
import {
  ensureDevAccounts,
  getLocalnetTreasuryAccount,
  listDevAccountsSync,
  resolveHardkasAccount,
  signTxPlanArtifact,
  type LocalnetTreasuryAccount
} from "@hardkas/accounts";
import {
  createTxPlanArtifact,
  getBroadcastableSignedTransaction,
  HardkasSchemas
} from "@hardkas/artifacts";
import {
  filterMatureUtxos,
  GeneratorPlanError,
  isCovenantUtxo,
  planPaymentWithGenerator,
  type Utxo
} from "@hardkas/tx-builder";
import { createFundingStateReader, type FundingStateJson } from "./localnet-funding-state.js";
import {
  TOCCATA_MINER_CONTAINER,
  TOCCATA_PROFILE,
  getAddressFundingState,
  inspectDockerContainer,
  livenessMinerRewardAddress,
  restartToccataMiner,
  sleep,
  stopToccataMiner,
  waitForMatureFunding,
  waitForVirtualDagSettle,
  withOptionalSilentConsole
} from "./localnet-runners.js";

const SOMPI_PER_KAS = 100_000_000n;
export const DEFAULT_LOCALNET_SEED_AMOUNT_SOMPI = 100n * SOMPI_PER_KAS;
/** Reserve headroom mined alongside initial treasury funding so follow-up transfers settle in one block. */
const TREASURY_RESERVE_HEADROOM_SOMPI = 200n * SOMPI_PER_KAS;
const MIN_FEE_BUFFER_SOMPI = 1n * SOMPI_PER_KAS;

export interface LocalnetSeedOptions {
  amountSompi?: bigint;
  onlyEmpty?: boolean;
  accounts?: readonly string[];
  profile?: string;
  timeoutMs?: number;
  stopMiner?: boolean;
  json?: boolean;
  silentOutput?: boolean;
  workspaceRoot?: string;
}

export interface SeededAccountResult {
  name: string;
  address: string;
  beforeBalanceSompi: string;
  afterBalanceSompi: string;
  fundedSompi: string;
  skipped: boolean;
  txId?: string;
}

export interface LocalnetSeedResult {
  schema: string;
  profile: string;
  status: string;
  treasuryAddress: string;
  amountPerAccountSompi: string;
  txIds: string[];
  accounts: SeededAccountResult[];
  miner: unknown;
  minerRewardAddress?: string;
}

interface TreasuryRecipient {
  name: string;
  address: string;
  beforeBalanceSompi: bigint;
  amountSompi: bigint;
}

async function readMatureSpendableUtxos(
  rpc: { getUtxosByAddress(address: string): Promise<any[]>; getInfo(): Promise<any> },
  address: string
): Promise<{ utxos: Utxo[]; totalMatureSompi: bigint }> {
  const [rawUtxos, info] = await Promise.all([rpc.getUtxosByAddress(address), rpc.getInfo()]);
  const virtualDaaScore = BigInt((info as any)?.virtualDaaScore ?? 0);
  const normalized: Utxo[] = (rawUtxos ?? []).map((u: any) => ({
    outpoint: {
      transactionId: String(u.outpoint?.transactionId ?? ""),
      index: Number(u.outpoint?.index ?? 0)
    },
    address: String(u.address || address),
    amountSompi: BigInt(u.amountSompi ?? u.amount ?? 0),
    scriptPublicKey: typeof u.scriptPublicKey === "string" ? u.scriptPublicKey : String(u.scriptPublicKey?.script ?? ""),
    ...(u.blockDaaScore !== undefined && u.blockDaaScore !== null ? { blockDaaScore: BigInt(u.blockDaaScore) } : {}),
    ...(u.isCoinbase !== undefined ? { isCoinbase: Boolean(u.isCoinbase) } : {}),
    ...(u.covenantId !== undefined ? { covenantId: String(u.covenantId) } : {})
  }));
  const nonCovenant = normalized.filter((u) => !isCovenantUtxo(u));
  const filtered = filterMatureUtxos<Utxo>({
    networkId: "simnet",
    virtualDaaScore,
    utxos: nonCovenant,
    readEntry: (u) => ({
      amountSompi: u.amountSompi,
      blockDaaScore: u.blockDaaScore === undefined ? 0n : BigInt(u.blockDaaScore),
      isCoinbase: Boolean(u.isCoinbase) || (Boolean(u.isCoinbase) && u.blockDaaScore === undefined)
    })
  });
  const maturityMargin = filtered.coinbaseMaturity + 10n;
  const spendable = filtered.mature
    .filter((u) => {
      if (!u.isCoinbase) return true;
      if (u.blockDaaScore === undefined) return false;
      return virtualDaaScore - BigInt(u.blockDaaScore) >= maturityMargin;
    })
    .sort((a, b) => (a.amountSompi > b.amountSompi ? -1 : a.amountSompi < b.amountSompi ? 1 : 0));

  const totalMatureSompi = spendable.reduce((sum, u) => sum + u.amountSompi, 0n);
  return { utxos: spendable, totalMatureSompi };
}

async function ensureTreasuryMatureFunds(
  sdk: any,
  treasuryAddress: string,
  minNeededSompi: bigint,
  timeoutMs: number
): Promise<{ utxos: Utxo[]; totalMatureSompi: bigint }> {
  const current = await readMatureSpendableUtxos(sdk.rpc, treasuryAddress);
  if (current.totalMatureSompi >= minNeededSompi) {
    return current;
  }

  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  const treasuryReader = createFundingStateReader(treasuryAddress, getCoinbaseMaturity("simnet"));
  const targetMature = minNeededSompi + TREASURY_RESERVE_HEADROOM_SOMPI;
  await restartToccataMiner(treasuryAddress);
  try {
    try {
      await waitForMatureFunding(sdk.rpc, treasuryReader, {
        minSpendableSompi: targetMature,
        timeoutMs
      });
    } catch (e: any) {
      if (e?.code !== "LOCALNET_FUND_MATURITY_TIMEOUT") throw e;
    }

    // `readMatureSpendableUtxos` enforces coinbaseMaturity + 10 DAA safety margin; keep
    // mining until those mature non-covenant UTXOs are actually visible via RPC.
    while (Date.now() < deadline) {
      const ready = await readMatureSpendableUtxos(sdk.rpc, treasuryAddress);
      if (ready.totalMatureSompi >= minNeededSompi) break;
      await sleep(500);
    }
  } finally {
    await stopToccataMiner();
    await waitForVirtualDagSettle(sdk.rpc);
  }

  const settled = await readMatureSpendableUtxos(sdk.rpc, treasuryAddress);
  if (settled.totalMatureSompi < minNeededSompi) {
    throw new HardkasCliError(
      "LOCALNET_TREASURY_FUNDING_TIMEOUT",
      `Localnet treasury ${treasuryAddress} has only ${formatSompiToKas(settled.totalMatureSompi)} KAS mature ` +
        `(needed at least ${formatSompiToKas(minNeededSompi)} KAS) before timeout.`
    );
  }
  return settled;
}

function selectMinimalUtxos(utxos: readonly Utxo[], targetSompi: bigint, count: number): Utxo[] {
  const chosen: Utxo[] = [];
  let sum = 0n;
  for (const u of utxos) {
    chosen.push(u);
    sum += u.amountSompi;
    if (chosen.length >= count && sum >= targetSompi) break;
  }
  return chosen;
}

async function planTreasuryBatch(
  spendable: readonly Utxo[],
  treasuryAddress: string,
  batch: readonly TreasuryRecipient[]
) {
  const outputs = batch.map((r) => ({ address: r.address, amountSompi: r.amountSompi }));
  const totalOut = batch.reduce((s, r) => s + r.amountSompi, 0n);

  let count = 1;
  while (count <= spendable.length) {
    const candidates = selectMinimalUtxos(spendable, totalOut + MIN_FEE_BUFFER_SOMPI, count);
    try {
      return await planPaymentWithGenerator({
        networkId: "simnet",
        utxos: candidates,
        outputs,
        changeAddress: treasuryAddress,
        version: 0
      });
    } catch (e: any) {
      if (e instanceof GeneratorPlanError && e.code === "MULTI_TRANSACTION_PLAN_REQUIRED") {
        throw e;
      }
      if (candidates.length >= spendable.length) {
        throw e;
      }
      count = Math.max(candidates.length + 1, count + 1);
    }
  }
  return await planPaymentWithGenerator({
    networkId: "simnet",
    utxos: [...spendable],
    outputs,
    changeAddress: treasuryAddress,
    version: 0
  });
}

async function waitForRecipientsConfirmed(
  rpc: { getBalanceByAddress(address: string): Promise<{ balanceSompi: bigint }> },
  recipients: readonly TreasuryRecipient[],
  timeoutMs: number
): Promise<Map<string, bigint>> {
  const deadline = Date.now() + timeoutMs;
  const latest = new Map<string, bigint>();

  while (Date.now() < deadline) {
    let allConfirmed = true;
    for (const r of recipients) {
      const bal = await rpc.getBalanceByAddress(r.address);
      const val = BigInt(bal?.balanceSompi ?? 0);
      latest.set(r.address, val);
      if (val < r.beforeBalanceSompi + r.amountSompi) {
        allConfirmed = false;
      }
    }
    if (allConfirmed) return latest;
    await sleep(500);
  }

  throw new HardkasCliError(
    "LOCALNET_TREASURY_CONFIRM_TIMEOUT",
    "Timed out waiting for localnet treasury funding transaction to confirm on-chain."
  );
}

async function executeTreasuryBatches(params: {
  sdk: any;
  treasury: LocalnetTreasuryAccount;
  recipients: readonly TreasuryRecipient[];
  timeoutMs: number;
  stopMiner: boolean;
  onBroadcast?: (txId: string, batch: readonly TreasuryRecipient[]) => void;
}): Promise<{ txIds: string[]; finalBalances: Map<string, bigint>; minerRewardAddress?: string }> {
  const { sdk, treasury, recipients, timeoutMs } = params;
  const queue: TreasuryRecipient[][] = [Array.from(recipients)];
  const txIds: string[] = [];
  const finalBalances = new Map<string, bigint>();
  let livenessAddress: string | undefined;

  while (queue.length > 0) {
    const batch = queue.shift()!;
    const batchTotal = batch.reduce((s, r) => s + r.amountSompi, 0n);
    const { utxos: spendable } = await ensureTreasuryMatureFunds(
      sdk,
      treasury.address,
      batchTotal + MIN_FEE_BUFFER_SOMPI,
      timeoutMs
    );

    let builderPlan;
    try {
      builderPlan = await planTreasuryBatch(spendable, treasury.address, batch);
    } catch (e: any) {
      if (e instanceof GeneratorPlanError && e.code === "MULTI_TRANSACTION_PLAN_REQUIRED" && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        queue.unshift(batch.slice(mid));
        queue.unshift(batch.slice(0, mid));
        continue;
      }
      throw e;
    }

    const firstRecipient = batch[0]!;
    const planArtifact = createTxPlanArtifact({
      networkId: "simnet" as NetworkId,
      mode: "localnet",
      from: { input: treasury.name, address: treasury.address, accountName: treasury.name },
      to: { input: firstRecipient.name, address: firstRecipient.address },
      amountSompi: batchTotal,
      plan: builderPlan,
      ctx: {
        ...systemRuntimeContext,
        plannerAuthority: "KASPA_WASM_GENERATOR"
      }
    }) as any;

    const signedArtifact = await signTxPlanArtifact({
      target: { domain: "kaspa-l1", mode: "localnet", network: "simnet" },
      planArtifact,
      account: treasury
    });
    const broadcastable = getBroadcastableSignedTransaction(signedArtifact);
    const expectedTxId = String(signedArtifact.txId || "");

    const submitRes: any = await sdk.rpc.submitTransaction(broadcastable.rawTransaction as any, { expectedTxId } as any);
    if (submitRes?.accepted === false) {
      throw new HardkasCliError(
        "LOCALNET_TREASURY_SUBMIT_FAILED",
        `Treasury funding transaction ${expectedTxId} was rejected by the node${submitRes?.error ? `: ${submitRes.error}` : "."}`
      );
    }
    txIds.push(expectedTxId);
    params.onBroadcast?.(expectedTxId, batch);

    livenessAddress = await livenessMinerRewardAddress();
    await restartToccataMiner(livenessAddress);
    try {
      const batchBalances = await waitForRecipientsConfirmed(sdk.rpc, batch, timeoutMs);
      for (const [addr, bal] of batchBalances) finalBalances.set(addr, bal);
    } finally {
      await stopToccataMiner();
      await waitForVirtualDagSettle(sdk.rpc);
    }
  }

  let minerRewardAddress: string | undefined;
  if (!params.stopMiner) {
    minerRewardAddress = livenessAddress ?? (await livenessMinerRewardAddress());
    await restartToccataMiner(minerRewardAddress);
  }

  return { txIds, finalBalances, ...(minerRewardAddress ? { minerRewardAddress } : {}) };
}

export function formatLocalnetSeedHuman(result: LocalnetSeedResult): string {
  const lines = [
    `${result.status} (${result.accounts.filter((a) => !a.skipped).length} funded, ${result.accounts.filter((a) => a.skipped).length} skipped)`,
    `Treasury: ${result.treasuryAddress}`,
    `Amount per account: ${formatSompiToKas(BigInt(result.amountPerAccountSompi))} KAS`,
    ...(result.txIds.length > 0 ? [`Transactions: ${result.txIds.join(", ")}`] : []),
    ...result.accounts.map(
      (a) =>
        `  ${a.name.padEnd(8)} ${a.skipped ? "skipped" : "funded "} ${formatSompiToKas(BigInt(a.afterBalanceSompi))} KAS (${a.address})`
    )
  ];
  return lines.join("\n");
}

/**
 * Funds local dev accounts with an exact non-coinbase amount from the deterministic simnet Treasury
 * in a batched 1 -> N transaction (single coinbase maturity wait when Treasury itself is empty).
 */
export async function runLocalnetSeed(opts: LocalnetSeedOptions = {}): Promise<LocalnetSeedResult> {
  const profile = opts.profile || TOCCATA_PROFILE;
  if (profile !== TOCCATA_PROFILE) {
    throw new Error(`Unsupported localnet funding profile: ${profile}`);
  }
  const amountSompi = opts.amountSompi ?? DEFAULT_LOCALNET_SEED_AMOUNT_SOMPI;
  if (amountSompi <= 0n) {
    throw new HardkasCliError("LOCALNET_SEED_INVALID_AMOUNT", "--amount must be positive.", {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }

  const wsRoot = opts.workspaceRoot || process.cwd();
  const { config } = await loadHardkasConfig({ workspaceRoot: wsRoot }).catch(() => ({ config: undefined }));
  await ensureDevAccounts(wsRoot);
  const devAccounts = listDevAccountsSync(wsRoot);
  const treasury = getLocalnetTreasuryAccount();

  const targetList: Array<{ name: string; address: string }> = [];
  if (opts.accounts && opts.accounts.length > 0) {
    const devByName = new Map(devAccounts.map((a) => [a.name, a]));
    const simTarget = { mode: "localnet", domain: "kaspa-l1", network: "simnet" } as const;
    for (const id of opts.accounts) {
      const dev = devByName.get(id);
      if (dev) {
        targetList.push({ name: dev.name, address: dev.address });
        continue;
      }
      let resolved;
      let address = id;
      try {
        resolved = resolveHardkasAccount({ nameOrAddress: id, config, executionTarget: simTarget });
        address = resolved.address || id;
      } catch {
        address = id;
      }
      if (resolved) {
        assertExecutionCompatibility({
          operation: "fund",
          target: simTarget,
          account: {
            kind: resolved.kind,
            network: (resolved as any).network,
            executionMode: (resolved as any).executionMode
          }
        });
      } else if (!address.startsWith("kaspasim:")) {
        throw new Error(`TOCCATA_FUNDING_REQUIRES_SIMNET_ADDRESS: ${address}`);
      }
      targetList.push({ name: resolved?.name || id, address });
    }
  } else {
    for (const acc of devAccounts) {
      targetList.push({ name: acc.name, address: acc.address });
    }
  }

  await requireNodeIdentity();

  const { Hardkas } = await import("@hardkas/sdk");
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const quiet = !!opts.json || !!opts.silentOutput;

  const { result } = await withOptionalSilentConsole(quiet, async () => {
    const sdk = await Hardkas.create({ cwd: wsRoot, network: "simnet" });
    try {
      const beforeBalances = new Map<string, bigint>();
      for (const acc of targetList) {
        const bal = await sdk.rpc.getBalanceByAddress(acc.address);
        beforeBalances.set(acc.address, BigInt(bal?.balanceSompi ?? 0));
      }

      const recipients: TreasuryRecipient[] = [];
      for (const acc of targetList) {
        const before = beforeBalances.get(acc.address) ?? 0n;
        if (opts.onlyEmpty && before > 0n) continue;
        recipients.push({
          name: acc.name,
          address: acc.address,
          beforeBalanceSompi: before,
          amountSompi
        });
      }

      const txByAddress = new Map<string, string>();
      let txIds: string[] = [];
      let afterBalances = new Map<string, bigint>(beforeBalances);
      let minerRewardAddress: string | undefined;

      if (recipients.length === 0) {
        if (opts.stopMiner) {
          await stopToccataMiner();
        }
      } else {
        const exec = await executeTreasuryBatches({
          sdk,
          treasury,
          recipients,
          timeoutMs,
          stopMiner: !!opts.stopMiner,
          onBroadcast: (txId, batch) => {
            for (const r of batch) txByAddress.set(r.address, txId);
          }
        });
        txIds = exec.txIds;
        minerRewardAddress = exec.minerRewardAddress;
        for (const [addr, bal] of exec.finalBalances) afterBalances.set(addr, bal);
      }

      const seededAccounts: SeededAccountResult[] = targetList.map((acc) => {
        const before = beforeBalances.get(acc.address) ?? 0n;
        const after = afterBalances.get(acc.address) ?? before;
        const txId = txByAddress.get(acc.address);
        const funded = txId !== undefined ? amountSompi : 0n;
        return {
          name: acc.name,
          address: acc.address,
          beforeBalanceSompi: before.toString(),
          afterBalanceSompi: after.toString(),
          fundedSompi: funded.toString(),
          skipped: txId === undefined,
          ...(txId ? { txId } : {})
        };
      });

      const payload: LocalnetSeedResult = {
        schema: "hardkas.localnetSeed.v1",
        profile,
        status: recipients.length === 0 ? "TOCCATA_ACCOUNTS_ALREADY_FUNDED" : "TOCCATA_ACCOUNTS_SEEDED",
        treasuryAddress: treasury.address,
        amountPerAccountSompi: amountSompi.toString(),
        txIds,
        accounts: seededAccounts,
        miner: await inspectDockerContainer(TOCCATA_MINER_CONTAINER),
        ...(minerRewardAddress ? { minerRewardAddress } : {})
      };

      return { result: payload };
    } finally {
      await sdk.close();
    }
  });

  if (!opts.silentOutput) {
    if (opts.json) {
      getOutput().writeJson(result);
    } else {
      UI.success(result.status);
      for (const line of formatLocalnetSeedHuman(result).split("\n").slice(1)) {
        UI.info(line);
      }
      UI.info(
        opts.stopMiner
          ? "Miner: stopped (--stop-miner): no new blocks until you mine again"
          : "Miner: running for block production; its rewards go to an unspendable address"
      );
    }
  }

  return result;
}

/**
 * Treasury-backed variant of `localnet fund <identifier>`: transfers an exact non-coinbase UTXO
 * from the deterministic Treasury and settles in one confirmation without coinbase pollution.
 */
export async function runLocalnetFundTreasury(opts: {
  address: string;
  identifier: string;
  amountSompi: bigint;
  profile: string;
  timeoutMs: number;
  stopMiner: boolean;
  json: boolean;
  workspaceRoot: string;
}): Promise<void> {
  if (opts.amountSompi <= 0n) {
    throw new HardkasCliError("LOCALNET_FUND_INVALID_AMOUNT", "--amount must be positive.", {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }

  const treasury = getLocalnetTreasuryAccount();
  const reader = createFundingStateReader(opts.address, getCoinbaseMaturity("simnet"));
  const before: FundingStateJson = await getAddressFundingState(reader, "balance-then-dag", opts.json);
  const { Hardkas } = await import("@hardkas/sdk");

  const execResult = await withOptionalSilentConsole(opts.json, async () => {
    const sdk = await Hardkas.create({ cwd: opts.workspaceRoot, network: "simnet" });
    try {
      const bal = await sdk.rpc.getBalanceByAddress(opts.address);
      const beforeTotal = BigInt(bal?.balanceSompi ?? 0);
      return await executeTreasuryBatches({
        sdk,
        treasury,
        recipients: [
          {
            name: opts.identifier,
            address: opts.address,
            beforeBalanceSompi: beforeTotal,
            amountSompi: opts.amountSompi
          }
        ],
        timeoutMs: opts.timeoutMs,
        stopMiner: opts.stopMiner
      });
    } finally {
      await sdk.close();
    }
  });

  const current = await getAddressFundingState(reader, "balance-then-dag", opts.json);
  const status =
    BigInt(current.matureBalanceSompi) > BigInt(before.matureBalanceSompi)
      ? "TOCCATA_ACCOUNT_FUNDED"
      : "TOCCATA_FUNDING_PENDING_MATURITY";

  const payload = {
    schema: HardkasSchemas.LocalnetFundingV1,
    profile: opts.profile,
    status,
    address: opts.address,
    fundingSource: "treasury",
    treasuryAddress: treasury.address,
    txIds: execResult.txIds,
    before,
    after: current,
    miner: await inspectDockerContainer(TOCCATA_MINER_CONTAINER),
    ...(execResult.minerRewardAddress ? { minerRewardAddress: execResult.minerRewardAddress } : {})
  };

  if (opts.json) {
    getOutput().writeJson(payload);
    return;
  }

  UI.success(status);
  UI.info(`Address: ${opts.address}`);
  UI.info(`Treasury tx: ${execResult.txIds.join(", ")}`);
  UI.info(`Mature balance: ${current.matureBalanceSompi.toString()} sompi`);
  UI.info(
    opts.stopMiner
      ? "Miner: stopped (--stop-miner): no new blocks until you mine again"
      : "Miner: running for block production; its rewards go to an unspendable address"
  );
}
