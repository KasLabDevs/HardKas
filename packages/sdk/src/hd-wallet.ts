/*
 * WALLET-HD-1 · spending from an HD wallet through HardKAS's own machinery.
 *
 * An HD wallet (@hardkas/accounts HdWalletManager) owns many addresses. This module:
 *  - SCANS them: receive and change chains, each until `gapLimit` consecutive addresses without UTXOs past the last one
 *    that has some (and past every index the wallet has handed out), asking the node for each address's UTXOs;
 *  - PLANS a payment over the UTXOs of all of them with the one payment planner (`TxPlanService.planTransactionUpstream`
 *    → the pinned kaspa-wasm Generator: maturity, covenant and pending-spend filters, mass, fee, change), the change going
 *    to the wallet's next unused change address, within the fee limit in force — a regular `hardkas.txPlan`;
 *  - SIGNS each input with the key derived for that input's own address (`sdk.tx.sign` with one PrivateKeyAuthorizer
 *    per input: the signer checks that every key controls its input);
 *  - SENDS through `sdk.tx.send` (synced node, one submission per txId, node identity, the records), then records the
 *    change index as used.
 * No second planner, no second signer, no raw submit. Mainnet is refused before any key is read or any connection is
 * opened. A plan or a send opens the wallet with its password first, so the change address and the keys come from the
 * authenticated wallet, never from an unverified file header.
 * Limit of a UTXO scan: an address whose outputs were all spent has no UTXO and counts as unused for the gap; the
 * wallet's recorded indices extend the scan over every address it handed out.
 */
import {
  HardkasError,
  assertMainnetTransactionsDisabled,
  declaredNetworkIdOf,
  getCoinbaseMaturity,
  isSimnetNetworkId,
  networkTypeOf,
  parseFeeRate,
  parseKasToSompi,
  parseMaxFeeSompi,
  systemRuntimeContext,
  type NetworkId
} from "@hardkas/core";
import {
  HdWalletManager,
  HdWatchKeyring,
  PrivateKeyAuthorizer,
  assertAccountCompatible,
  hdDerivationPath,
  validateAddressNetwork,
  type HdChain,
  type HdWalletDescriptor,
  type HdWalletManagerOptions,
  type OpenedHdWallet
} from "@hardkas/accounts";
import { TxPlanService, assertFeeWithinLimitInForce, covenantIdOf, feeLimitInForce, type UtxoProvider } from "@hardkas/tx-builder";
import { createTxPlanArtifact, type SignedTxArtifact, type TxPlanArtifact } from "@hardkas/artifacts";
import { assertSdkMayConnect } from "./mainnet-lockdown.js";
import type { SendTxOptions } from "./tx.js";
import type { Hardkas } from "./index.js";

/** The gap limit of a scan when none is given: 20 consecutive unused addresses per chain (the BIP44 convention). */
export const HD_WALLET_DEFAULT_GAP_LIMIT = 20;
/** The largest gap limit a scan accepts (each address costs one node request). */
export const HD_WALLET_MAX_GAP_LIMIT = 1000;

/** One scanned address that holds UTXOs. */
export interface HdWalletScanEntry {
  readonly account: number;
  readonly chain: HdChain;
  readonly index: number;
  readonly path: string;
  readonly address: string;
  readonly utxoCount: number;
  readonly balanceSompi: bigint;
  /** UTXOs of this address bound to a covenant: never spent by a payment (counted in the balance, not spendable). */
  readonly covenantUtxoCount: number;
}

export interface HdWalletScan {
  readonly walletId: string;
  readonly label: string;
  readonly network: string;
  readonly account: number;
  readonly gapLimit: number;
  /** The addresses that hold UTXOs, receive chain first, by index. */
  readonly used: readonly HdWalletScanEntry[];
  /** Sum of every UTXO the node lists for the wallet's addresses (covenant ones included), sompi. */
  readonly totalSompi: bigint;
  readonly utxoCount: number;
  /** The first index of each chain that is past every used and every handed-out address. */
  readonly nextReceive: number;
  readonly nextChange: number;
  /** How many addresses of each chain were asked. */
  readonly scanned: { readonly receive: number; readonly change: number };
  /** True when the wallet was opened with its password for this scan (addresses from authenticated keys). */
  readonly verified: boolean;
}

export interface HdWalletPaymentOptions {
  /** A Kaspa address or a workspace account name. */
  readonly to: string;
  /** KAS as a decimal string ("1.5"), or sompi as a bigint. */
  readonly amount: string | bigint;
  readonly password: string;
  /** The BIP39 passphrase, when the wallet has one. */
  readonly passphrase?: string;
  readonly account?: number;
  readonly gapLimit?: number;
  /** Sompi per gram; default the node's "normal" estimate (as `tx.plan`). */
  readonly feeRate?: bigint;
  /** The most this payment may pay in fees, sompi (as `tx.plan`); the workspace/default limit applies anyway. */
  readonly maxFeeSompi?: bigint | number | string;
}

/** Where each input of a plan comes from in the wallet. */
export interface HdWalletPlannedInput {
  readonly index: number;
  readonly outpoint: string;
  readonly address: string;
  readonly account: number;
  readonly chain: HdChain;
  readonly addressIndex: number;
  readonly path: string;
}

export interface HdWalletPayment {
  readonly plan: TxPlanArtifact;
  readonly scan: HdWalletScan;
  readonly inputs: readonly HdWalletPlannedInput[];
  /** The change destination (the wallet's next unused change address), and whether the plan pays change at all. */
  readonly change: { readonly address: string; readonly index: number; readonly path: string; readonly amountSompi: bigint };
}

export interface HdWalletSendResult extends HdWalletPayment {
  readonly signed: SignedTxArtifact;
  readonly sent: Awaited<ReturnType<Hardkas["tx"]["send"]>>;
}

const err = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, message, metadata ? { metadata } : undefined);

/** A network id compared across spellings: the simnet family is one, `kaspa-` dropped, case ignored. */
function canonicalNetwork(n: string | undefined): string | undefined {
  if (typeof n !== "string" || n.trim() === "") return undefined;
  const lower = n.trim().toLowerCase().replace(/^kaspa-/, "");
  if (networkTypeOf(lower) === "simnet" || (isSimnetNetworkId(lower) && lower !== "simulated")) return "simnet";
  return lower;
}

const outpointKey = (u: { outpoint: { transactionId: string; index: number } }) => `${String(u.outpoint.transactionId).toLowerCase()}:${Number(u.outpoint.index)}`;
const compareOutpoints = (a: any, b: any) => {
  const ta = String(a.outpoint.transactionId).toLowerCase();
  const tb = String(b.outpoint.transactionId).toLowerCase();
  return ta < tb ? -1 : ta > tb ? 1 : Number(a.outpoint.index) - Number(b.outpoint.index);
};

/**
 * HD wallet spending for one SDK instance (its workspace, node, network and records). The wallets themselves are the
 * workspace's `HdWalletManager` (`manager`).
 */
export class HardkasHdWallets {
  readonly manager: HdWalletManager;

  constructor(
    private readonly sdk: Hardkas,
    options: Omit<HdWalletManagerOptions, "workspaceRoot"> = {}
  ) {
    this.manager = new HdWalletManager({ ...options, workspaceRoot: sdk.workspace.root });
  }

  /** This instance's network, as its config entry declares it. */
  private instanceNetwork(): string {
    return declaredNetworkIdOf(this.sdk.config.config, this.sdk.network) ?? String(this.sdk.network);
  }

  /** HD_WALLET_NETWORK_MISMATCH / HD_WALLET_SIMULATOR_UNSUPPORTED before anything is read. */
  private assertWorld(wallet: HdWalletDescriptor): void {
    if (this.sdk.execution.mode === "simulator") {
      throw err(
        "HD_WALLET_SIMULATOR_UNSUPPORTED",
        `This instance runs the simulator; HD wallet '${wallet.label}' holds real Kaspa addresses and is used against a node (open the SDK on a node network). Nothing was read.`
      );
    }
    if (canonicalNetwork(wallet.network) !== canonicalNetwork(this.instanceNetwork())) {
      throw err(
        "HD_WALLET_NETWORK_MISMATCH",
        `HD wallet '${wallet.label}' is declared on '${wallet.network}', but this instance runs on '${this.instanceNetwork()}'. Open the SDK on the wallet's network. Nothing was read.`,
        { walletNetwork: wallet.network, instanceNetwork: this.instanceNetwork() }
      );
    }
  }

  private gap(gapLimit: number | undefined): number {
    const g = gapLimit ?? HD_WALLET_DEFAULT_GAP_LIMIT;
    if (!Number.isSafeInteger(g) || g < 1 || g > HD_WALLET_MAX_GAP_LIMIT) {
      throw err("HD_WALLET_GAP_LIMIT_INVALID", `The gap limit is an integer from 1 to ${HD_WALLET_MAX_GAP_LIMIT} (got ${String(gapLimit)}).`);
    }
    return g;
  }

  /** The node's UTXOs of every address of `account` the scan reaches, and the address map of the scan. */
  private async scanWith(
    wallet: HdWalletDescriptor,
    watch: HdWatchKeyring,
    account: number,
    gapLimit: number,
    verified: boolean
  ): Promise<{ scan: HdWalletScan; byAddress: Map<string, { account: number; chain: HdChain; index: number }> }> {
    const recorded = wallet.accounts.find((a) => a.index === account);
    if (!recorded) throw err("HD_WALLET_ACCOUNT_NOT_FOUND", `Wallet '${wallet.label}' has no account ${account}.`);
    const used: HdWalletScanEntry[] = [];
    const byAddress = new Map<string, { account: number; chain: HdChain; index: number }>();
    const scanned = { receive: 0, change: 0 };
    const next = { receive: 0, change: 0 };
    let totalSompi = 0n;
    let utxoCount = 0;
    for (const chain of ["receive", "change"] as const) {
      const handedOut = chain === "receive" ? recorded.nextReceive : recorded.nextChange;
      let lastUsed = -1;
      let index = 0;
      while (index < Math.max(handedOut - 1, lastUsed) + 1 + gapLimit) {
        const window = Math.min(gapLimit, Math.max(handedOut - 1, lastUsed) + 1 + gapLimit - index);
        const addresses = watch.addresses(chain, index, window, wallet.network);
        for (let k = 0; k < addresses.length; k++) {
          const address = addresses[k]!;
          const i = index + k;
          byAddress.set(address, { account, chain, index: i });
          const listed: any[] = (await this.sdk.rpc.getUtxosByAddress(address)) ?? [];
          scanned[chain]++;
          if (listed.length > 0) {
            lastUsed = i;
            const balance = listed.reduce((s, u) => s + BigInt(u.amountSompi ?? 0), 0n);
            totalSompi += balance;
            utxoCount += listed.length;
            used.push({
              account,
              chain,
              index: i,
              path: hdDerivationPath(account, chain, i),
              address,
              utxoCount: listed.length,
              balanceSompi: balance,
              covenantUtxoCount: listed.filter((u) => covenantIdOf(u) !== undefined).length
            });
          }
        }
        index += addresses.length;
      }
      next[chain] = Math.max(handedOut, lastUsed + 1);
    }
    return {
      scan: {
        walletId: wallet.walletId,
        label: wallet.label,
        network: wallet.network,
        account,
        gapLimit,
        used,
        totalSompi,
        utxoCount,
        nextReceive: next.receive,
        nextChange: next.change,
        scanned,
        verified
      },
      byAddress
    };
  }

  /**
   * The wallet's balance: every address of `account` the gap-limit scan reaches. Without `password` the addresses come
   * from the wallet file's header as written (`verified: false`); with it the wallet is opened first.
   */
  async scan(ref: string, options: { account?: number; gapLimit?: number; password?: string; passphrase?: string } = {}): Promise<HdWalletScan> {
    const described = this.manager.describe(ref);
    // MAINNET TOTAL LOCKDOWN: a scan reads the node; refused before anything is opened or read
    assertSdkMayConnect(this.sdk, "hd wallet scan", described.network);
    this.assertWorld(described);
    const account = options.account ?? 0;
    const gapLimit = this.gap(options.gapLimit);
    if (options.password !== undefined) {
      const opened = await this.manager.open(ref, { password: options.password, ...(options.passphrase !== undefined ? { passphrase: options.passphrase } : {}) });
      try {
        return (await this.scanWith(opened.descriptor, opened.watch(account), account, gapLimit, true)).scan;
      } finally {
        opened.close();
      }
    }
    return (await this.scanWith(described, this.manager.watch(ref, account), account, gapLimit, false)).scan;
  }

  private async planOpened(opened: OpenedHdWallet, options: HdWalletPaymentOptions): Promise<HdWalletPayment & { byAddress: Map<string, { account: number; chain: HdChain; index: number }> }> {
    const wallet = opened.descriptor;
    const account = options.account ?? 0;
    const planMaxFeeSompi = options.maxFeeSompi === undefined ? undefined : parseMaxFeeSompi(options.maxFeeSompi, "hd wallet plan maxFeeSompi");
    if (options.feeRate !== undefined) parseFeeRate(options.feeRate, "hd wallet plan feeRate");
    const amountSompi =
      typeof options.amount === "bigint"
        ? options.amount
        : typeof options.amount === "string"
          ? parseKasToSompi(options.amount)
          : (() => {
              throw err("HD_WALLET_AMOUNT_INVALID", "The amount is KAS as a decimal string (\"1.5\") or sompi as a bigint.");
            })();
    if (amountSompi <= 0n) throw err("HD_WALLET_AMOUNT_INVALID", "A payment pays an amount above 0.");

    const world = this.sdk.execution;
    const toAccount = await this.sdk.accounts.resolve(options.to, world);
    assertAccountCompatible(toAccount, world);
    if (!toAccount.address) throw err("HD_WALLET_RECIPIENT_INVALID", `The recipient '${options.to}' has no address.`);
    const network = this.instanceNetwork();
    validateAddressNetwork(toAccount.address, network, false, { simulated: false });

    const { scan, byAddress } = await this.scanWith(wallet, opened.watch(account), account, this.gap(options.gapLimit), true);
    const changeIndex = scan.nextChange;
    const changeAddress = opened.address(account, "change", changeIndex);
    byAddress.set(changeAddress, { account, chain: "change", index: changeIndex });
    validateAddressNetwork(changeAddress, network, false, { simulated: false });

    // the spendable UTXOs of every used address: the node's list minus what its mempool is already spending
    let observedAtDaaScore: bigint | undefined;
    try {
      const info = await this.sdk.rpc.getBlockDagInfo();
      observedAtDaaScore = info.virtualDaaScore !== undefined ? BigInt(info.virtualDaaScore) : undefined;
    } catch {
      observedAtDaaScore = undefined;
    }
    const candidates: any[] = [];
    for (const entry of scan.used) {
      const res = await this.sdk.query.getSpendableUtxos({
        address: entry.address,
        excludePending: true,
        ...(observedAtDaaScore !== undefined ? { observedAtDaaScore } : {})
      });
      for (const u of res.data as any[]) {
        const utxo: any = {
          outpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
          address: u.address ?? entry.address,
          amountSompi: BigInt(u.amountSompi),
          scriptPublicKey: u.scriptPublicKey || "",
          isCoinbase: u.isCoinbase
        };
        if (u.blockDaaScore !== undefined) utxo.blockDaaScore = BigInt(u.blockDaaScore);
        const covenantId = covenantIdOf(u);
        if (covenantId !== undefined) utxo.covenantId = covenantId;
        candidates.push(utxo);
      }
    }
    candidates.sort(compareOutpoints);
    // the wallet's first used address stands for the sender (the planner's interface); every candidate is the wallet's
    const fromAddress = scan.used[0]?.address ?? opened.address(account, "receive", 0);
    const provider: UtxoProvider = {
      getUtxos: async () => candidates.map((u) => ({ ...u })),
      getVirtualDaaScore: async () => {
        const info = await this.sdk.rpc.getBlockDagInfo();
        return info.virtualDaaScore !== undefined ? BigInt(info.virtualDaaScore) : 0n;
      }
    };
    const networkConfig = this.sdk.config.config.networks?.[this.sdk.network as string];
    const coinbaseMaturity = getCoinbaseMaturity(
      this.sdk.network as string,
      networkConfig?.kind === "kaspa-node" || networkConfig?.kind === "kaspa-rpc" || networkConfig?.kind === "simulated" ? networkConfig.consensusParams : undefined
    );
    let feeRate = options.feeRate;
    if (feeRate === undefined) {
      ({ feeRate } = await this.sdk.fees.estimate({ priority: "normal", inputs: 1, outputs: 2, network: this.sdk.network as NetworkId }));
    }
    let result;
    try {
      result = await new TxPlanService(provider, { coinbaseMaturity }).planTransactionUpstream({
        fromAddress,
        toAddress: toAccount.address,
        amountSompi,
        feeRate,
        networkId: this.sdk.network as string,
        changeAddress
      });
    } catch (e: any) {
      if (e?.code === "NO_SPENDABLE_UTXOS") {
        throw err(
          "NO_SPENDABLE_UTXOS",
          `HD wallet '${wallet.label}' has no spendable UTXOs on the ${scan.scanned.receive + scan.scanned.change} addresses scanned (account ${account}, gap limit ${scan.gapLimit}): ` +
            `immature coinbase outputs, covenant outputs and outputs already being spent in the mempool are left out. Nothing was planned.`,
          { found: scan.utxoCount }
        );
      }
      throw e;
    }
    const builderPlan = result.plan;
    assertFeeWithinLimitInForce(
      BigInt(builderPlan.estimatedFeeSompi),
      feeLimitInForce({ planMaxFeeSompi, config: this.sdk.config.config, network: this.sdk.network as string }),
      "plan",
      this.sdk.network as string
    );
    const plan = createTxPlanArtifact({
      networkId: this.sdk.network as NetworkId,
      mode: world.mode,
      from: { input: `hd-wallet:${wallet.label}`, address: fromAddress },
      to: { input: options.to, address: toAccount.address },
      amountSompi,
      plan: builderPlan,
      ...(planMaxFeeSompi !== undefined ? { maxFeeSompi: planMaxFeeSompi } : {}),
      ctx: {
        ...systemRuntimeContext,
        assumptionLevel: (this.sdk.network as string) === "simnet" ? "local-rpc" : (this.sdk.network as string),
        utxoSelection: result.utxoSelection,
        ...(result.plannerAuthority ? { plannerAuthority: result.plannerAuthority } : {}),
        ...(result.plannerAuthorityDetail ? { plannerAuthorityDetail: result.plannerAuthorityDetail } : {})
      } as any
    }) as unknown as TxPlanArtifact;

    const inputs: HdWalletPlannedInput[] = (plan.inputs as any[]).map((input, i) => {
      const where = byAddress.get(String(input.address));
      if (!where) {
        throw err("HD_WALLET_INPUT_NOT_OWNED", `Input ${i} of the plan (${outpointKey(input)}) is at ${String(input.address)}, which is not an address of wallet '${wallet.label}'. Nothing was signed.`);
      }
      return {
        index: i,
        outpoint: outpointKey(input),
        address: String(input.address),
        account: where.account,
        chain: where.chain,
        addressIndex: where.index,
        path: hdDerivationPath(where.account, where.chain, where.index)
      };
    });
    const changeSompi = BigInt((plan as any).change?.amountSompi ?? 0);
    return {
      plan,
      scan,
      inputs,
      change: { address: changeAddress, index: changeIndex, path: hdDerivationPath(account, "change", changeIndex), amountSompi: changeSompi },
      byAddress
    };
  }

  private async openForSpend(ref: string, options: HdWalletPaymentOptions, operation: "plan" | "send"): Promise<OpenedHdWallet> {
    const described = this.manager.describe(ref);
    // MAINNET TOTAL LOCKDOWN: before the password is used, a key derived or the node asked
    if (operation === "send") {
      assertMainnetTransactionsDisabled(
        "broadcast",
        [described.network, this.sdk.network, declaredNetworkIdOf(this.sdk.config.config, this.sdk.network)],
        "hd wallet send"
      );
    }
    assertSdkMayConnect(this.sdk, `hd wallet ${operation}`, described.network);
    this.assertWorld(described);
    if (this.sdk.signer) {
      throw err(
        "HD_WALLET_EXTERNAL_SIGNER_CONFLICT",
        "This SDK instance has an external signer, which would sign instead of the wallet's keys. Open an instance without `signer` to spend from an HD wallet. Nothing was signed."
      );
    }
    return this.manager.open(ref, { password: options.password, ...(options.passphrase !== undefined ? { passphrase: options.passphrase } : {}) });
  }

  /** Plans a payment from the wallet (opened with its password); nothing is signed or sent. */
  async plan(ref: string, options: HdWalletPaymentOptions): Promise<HdWalletPayment> {
    const opened = await this.openForSpend(ref, options, "plan");
    try {
      const { byAddress: _byAddress, ...planned } = await this.planOpened(opened, options);
      return planned;
    } finally {
      opened.close();
    }
  }

  /**
   * Plans, signs and sends a payment from the wallet: the plan over every scanned address's UTXOs, each input signed by
   * the key of its own address, sent by `sdk.tx.send` (`send` options as there). On success the change index (and any
   * receive index the scan found used) is recorded, so the next payment changes to a fresh address.
   */
  async send(ref: string, options: HdWalletPaymentOptions & { send?: SendTxOptions }): Promise<HdWalletSendResult> {
    const opened = await this.openForSpend(ref, options, "send");
    try {
      const { byAddress, ...planned } = await this.planOpened(opened, options);
      const authorizers: Record<number, PrivateKeyAuthorizer> = {};
      for (const input of planned.inputs) {
        const where = byAddress.get(input.address)!;
        authorizers[input.index] = new PrivateKeyAuthorizer(`hd-wallet:${opened.descriptor.label}`, opened.privateKeyHex(where.account, where.chain, where.index));
      }
      const signed = (await this.sdk.tx.sign(planned.plan, { authorizers })) as SignedTxArtifact;
      const sent = await this.sdk.tx.send(signed, options.send ?? {});
      if (sent?.submitted === true || sent?.alreadySubmitted === true) {
        const account = options.account ?? 0;
        if (planned.change.amountSompi > 0n) {
          await this.manager.markUsed(ref, { account, chain: "change", index: planned.change.index });
        }
        if (planned.scan.nextReceive > 0) {
          await this.manager.markUsed(ref, { account, chain: "receive", index: planned.scan.nextReceive - 1 });
        }
      }
      return { ...planned, signed, sent };
    } finally {
      opened.close();
    }
  }
}
