/*
 * WALLET-HD-1 · L2 · HdWalletManager: recoverable BIP39/BIP32 Kaspa wallets kept in a workspace, one encrypted file
 * each (`.hardkas/wallets/<walletId>.json`, hd-keystore.ts), keys derived by the pinned kaspa-wasm (hd-derivation.ts).
 *
 * - Custody: the recovery phrase is encrypted under the wallet password; the BIP39 passphrase is never stored. Opening a
 *   wallet decrypts the phrase AND recomputes every account's extended public key from phrase + passphrase: the header
 *   is authenticated by AES-GCM, and a wrong passphrase is caught because it derives another key
 *   (HD_WALLET_PASSPHRASE_MISMATCH). Only `revealMnemonic` returns the phrase.
 * - Mainnet: no wallet is created, imported or opened for mainnet while mainnet is locked down (MAINNET_SIGNING_DISABLED
 *   for a wallet with keys, MAINNET_CONNECTION_DISABLED for a watch-only one), before any secret is read or written.
 * - Reads without the password (list, describe, watch) see the header as written: `verified: false`. A command that
 *   shows an address to RECEIVE on opens the wallet first (the CLI asks for the password), so an edited file cannot
 *   hand out someone else's address.
 * This is NOT the legacy synthetic `WalletManager` (wallet-manager.ts, simnet fixtures whose keys follow from a public
 * id): nothing is shared with it.
 */
import fs from "node:fs";
import path from "node:path";
import { HardkasError, assertMainnetConnectionsDisabled, assertMainnetTransactionsDisabled } from "@hardkas/core";
import {
  HD_DEFAULT_MNEMONIC_WORDS,
  HdSigningKeyring,
  HdWatchKeyring,
  assertValidMnemonic,
  canonicalAccountXPub,
  generateMnemonic,
  sameExtendedPublicKey,
  hdDerivationPath,
  hdNetworkTypeOf,
  parseAccountXPub,
  type HdChain,
  type HdMnemonicWordCount,
  type HdNetworkType
} from "./hd-derivation.js";
import {
  HD_WALLETS_DIR,
  assertHdWalletLabel,
  assertHdWalletPassword,
  createWatchOnlyHdWalletKeystore,
  decryptHdWalletKeystore,
  encryptHdWalletKeystore,
  hdWalletKeystorePath,
  isHdWalletId,
  newHdWalletId,
  readHdWalletKeystoreSync,
  writeHdWalletKeystore,
  type EncryptedHdWalletKeystoreV1,
  type HdWalletKeystoreHeader,
  type HdWalletKind,
  type HdWalletOrigin
} from "./hd-keystore.js";
import { withKeystoreLock } from "./keystore-lock.js";

const err = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, message, metadata ? { metadata } : undefined);

/** What a wallet is, public parts only. */
export interface HdWalletDescriptor {
  readonly walletId: string;
  readonly label: string;
  readonly network: string;
  readonly networkType: HdNetworkType;
  readonly kind: HdWalletKind;
  readonly accounts: ReadonlyArray<{ readonly index: number; readonly xpub: string; readonly nextReceive: number; readonly nextChange: number }>;
  readonly passphraseRequired: boolean;
  readonly mnemonicWords?: 12 | 24 | undefined;
  readonly createdAt: string;
  readonly origin: HdWalletOrigin;
  readonly path: string;
  /** True only when this call opened the wallet with its password (header authenticated, keys recomputed). */
  readonly verified: boolean;
}

/** One derived address. */
export interface HdWalletAddress {
  readonly walletId: string;
  readonly label: string;
  readonly account: number;
  readonly chain: HdChain;
  readonly index: number;
  readonly path: string;
  readonly address: string;
  readonly network: string;
  readonly verified: boolean;
}

export interface HdWalletManagerOptions {
  /** The workspace root; wallets live in `<root>/.hardkas/wallets/`. */
  readonly workspaceRoot: string;
  /** Argon2id parameters for files this manager writes (default: the account keystore's 64 MiB / 3 / 1). */
  readonly kdf?: Partial<{ memory: number; iterations: number; parallelism: number }>;
}

function describeFile(file: EncryptedHdWalletKeystoreV1, filePath: string, verified: boolean): HdWalletDescriptor {
  const h = file.header;
  return {
    walletId: h.walletId,
    label: h.label,
    network: h.network,
    networkType: h.networkType,
    kind: h.kind,
    accounts: [...h.accounts]
      .sort((a, b) => a.index - b.index)
      .map((a) => ({
        index: a.index,
        xpub: a.xpub,
        nextReceive: file.state.accounts[String(a.index)]?.nextReceive ?? 0,
        nextChange: file.state.accounts[String(a.index)]?.nextChange ?? 0
      })),
    passphraseRequired: h.passphraseRequired,
    ...(h.mnemonicWords !== undefined ? { mnemonicWords: h.mnemonicWords } : {}),
    createdAt: h.createdAt,
    origin: h.origin,
    path: filePath,
    verified
  };
}

/**
 * A wallet opened with its password (and passphrase): its keys are in memory until `close()`. The signer asks it for
 * the private key of an address it derived; nothing here prints or stores a key.
 */
export class OpenedHdWallet {
  private keyring: HdSigningKeyring | undefined;

  constructor(
    readonly descriptor: HdWalletDescriptor,
    keyring: HdSigningKeyring
  ) {
    this.keyring = keyring;
  }

  private ring(): HdSigningKeyring {
    if (!this.keyring) throw err("HD_WALLET_KEYRING_DISPOSED", `Wallet '${this.descriptor.label}' was closed; open it again.`);
    return this.keyring;
  }

  private assertAccount(account: number): void {
    if (!this.descriptor.accounts.some((a) => a.index === account)) {
      throw err("HD_WALLET_ACCOUNT_NOT_FOUND", `Wallet '${this.descriptor.label}' has no account ${account} (add one with addAccount).`);
    }
  }

  /** The address of `account`/`chain`/`index` on the wallet's network. */
  address(account: number, chain: HdChain, index: number): string {
    this.assertAccount(account);
    return this.ring().address(account, chain, index, this.descriptor.network);
  }

  /** The watch-only view of one account. */
  watch(account = 0): HdWatchKeyring {
    this.assertAccount(account);
    return this.ring().watch(account, this.descriptor.network);
  }

  /** SECRET: the private key (hex) of `account`/`chain`/`index`, for the signer. */
  privateKeyHex(account: number, chain: HdChain, index: number): string {
    this.assertAccount(account);
    return this.ring().privateKeyHex(account, chain, index);
  }

  /** Drops the keys. */
  close(): void {
    this.keyring?.dispose();
    this.keyring = undefined;
  }
}

export class HdWalletManager {
  readonly workspaceRoot: string;
  private readonly kdf: HdWalletManagerOptions["kdf"];

  constructor(options: HdWalletManagerOptions) {
    if (!options?.workspaceRoot) throw err("HD_WALLET_WORKSPACE_REQUIRED", "HdWalletManager needs a workspace root.");
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.kdf = options.kdf;
  }

  /** `<root>/.hardkas/wallets`. */
  get walletsDir(): string {
    return path.join(this.workspaceRoot, HD_WALLETS_DIR);
  }

  private files(): Array<{ file: EncryptedHdWalletKeystoreV1; filePath: string }> {
    if (!fs.existsSync(this.walletsDir)) return [];
    return fs
      .readdirSync(this.walletsDir)
      .filter((n) => /^[0-9a-f]{32}\.json$/.test(n))
      .sort()
      .map((n) => {
        const filePath = path.join(this.walletsDir, n);
        return { file: readHdWalletKeystoreSync(filePath), filePath };
      });
  }

  /** Every wallet of the workspace (public header; nothing decrypted, `verified: false`). */
  list(): HdWalletDescriptor[] {
    return this.files().map(({ file, filePath }) => describeFile(file, filePath, false));
  }

  private locate(ref: string): { file: EncryptedHdWalletKeystoreV1; filePath: string } {
    if (typeof ref !== "string" || ref.trim() === "") throw err("HD_WALLET_NOT_FOUND", "No wallet named: give a wallet name or id.");
    if (isHdWalletId(ref)) {
      const filePath = hdWalletKeystorePath(this.workspaceRoot, ref);
      if (fs.existsSync(filePath)) return { file: readHdWalletKeystoreSync(filePath), filePath };
    }
    const byLabel = this.files().filter((f) => f.file.header.label === ref);
    if (byLabel.length === 1) return byLabel[0]!;
    if (byLabel.length > 1) throw err("HD_WALLET_AMBIGUOUS", `${byLabel.length} wallets are named '${ref}': name one by its id.`);
    throw err("HD_WALLET_NOT_FOUND", `No HD wallet '${ref}' in ${this.walletsDir}.`);
  }

  /** One wallet's public description (nothing decrypted, `verified: false`). */
  describe(ref: string): HdWalletDescriptor {
    const { file, filePath } = this.locate(ref);
    return describeFile(file, filePath, false);
  }

  private assertLabelFree(label: string): void {
    if (this.files().some((f) => f.file.header.label === label)) {
      throw err("HD_WALLET_LABEL_EXISTS", `A wallet named '${label}' already exists in this workspace. Nothing was written.`);
    }
  }

  private static refuseMainnetKeys(network: string, context: string): void {
    assertMainnetTransactionsDisabled("sign", [network], `${context}: no mainnet key is made or opened while mainnet is locked down`);
  }

  private async writeNew(header: HdWalletKeystoreHeader, mnemonic: string | undefined, password: string | undefined): Promise<HdWalletDescriptor> {
    const filePath = hdWalletKeystorePath(this.workspaceRoot, header.walletId);
    const file =
      header.kind === "hd"
        ? await encryptHdWalletKeystore({ header, mnemonic: mnemonic!, password: password!, ...(this.kdf ? { kdf: this.kdf } : {}) })
        : createWatchOnlyHdWalletKeystore(header);
    // one lock for the whole directory: two creations cannot both take the same name
    await withKeystoreLock(path.join(this.walletsDir, "wallets-directory"), async () => {
      this.assertLabelFree(header.label);
      if (fs.existsSync(filePath)) throw err("HD_WALLET_KEYSTORE_INVALID", `A wallet file ${path.basename(filePath)} already exists.`);
      await writeHdWalletKeystore(filePath, file);
    });
    return describeFile(file, filePath, header.kind === "hd");
  }

  private async createFromPhrase(
    opts: { label: string; network: string; password: string; passphrase?: string | undefined },
    phrase: string,
    origin: HdWalletOrigin
  ): Promise<HdWalletDescriptor> {
    const label = assertHdWalletLabel(opts.label);
    const networkType = hdNetworkTypeOf(opts.network);
    assertHdWalletPassword(opts.password);
    this.assertLabelFree(label);
    const passphrase = opts.passphrase ?? "";
    const keyring = HdSigningKeyring.fromMnemonic(phrase, passphrase);
    try {
      const header: HdWalletKeystoreHeader = {
        walletId: newHdWalletId(),
        label,
        network: opts.network,
        networkType,
        kind: "hd",
        derivation: { scheme: "kaspa-bip44", purpose: 44, coinType: 111111 },
        accounts: [{ index: 0, xpub: keyring.accountXPub(0, opts.network) }],
        passphraseRequired: passphrase !== "",
        mnemonicWords: phrase.split(" ").length as 12 | 24,
        createdAt: new Date().toISOString(),
        origin
      };
      return await this.writeNew(header, phrase, opts.password);
    } finally {
      keyring.dispose();
    }
  }

  /**
   * Creates a wallet with a NEW random recovery phrase (24 words by default), encrypted under `password`. The phrase
   * is not returned: back it up with `revealMnemonic` (explicit). Mainnet is refused before anything is generated.
   */
  async create(opts: { label: string; network: string; password: string; passphrase?: string; words?: HdMnemonicWordCount }): Promise<HdWalletDescriptor> {
    HdWalletManager.refuseMainnetKeys(opts?.network, "hd wallet create");
    hdNetworkTypeOf(opts.network);
    assertHdWalletLabel(opts.label);
    assertHdWalletPassword(opts.password);
    const phrase = generateMnemonic(opts.words ?? HD_DEFAULT_MNEMONIC_WORDS);
    return this.createFromPhrase(opts, phrase, "generated");
  }

  /** Recovers a wallet from its BIP39 phrase (12 or 24 English words) and its passphrase, if it had one. */
  async importMnemonic(opts: { label: string; network: string; mnemonic: string; password: string; passphrase?: string }): Promise<HdWalletDescriptor> {
    HdWalletManager.refuseMainnetKeys(opts?.network, "hd wallet import");
    hdNetworkTypeOf(opts.network);
    const phrase = assertValidMnemonic(opts.mnemonic);
    return this.createFromPhrase(opts, phrase, "imported");
  }

  /** A watch-only wallet from an ACCOUNT-level extended public key: addresses and balance, no keys. */
  async importWatchOnly(opts: { label: string; network: string; xpub: string }): Promise<HdWalletDescriptor> {
    assertMainnetConnectionsDisabled([opts?.network], "hd wallet import-watch-only: a mainnet wallet would only read mainnet");
    const networkType = hdNetworkTypeOf(opts.network);
    const label = assertHdWalletLabel(opts.label);
    const { account } = parseAccountXPub(opts.xpub);
    // stored with the network's prefix (ktub off mainnet), whatever prefix it was exported with: the same key
    const xpub = canonicalAccountXPub(opts.xpub, opts.network);
    this.assertLabelFree(label);
    const header: HdWalletKeystoreHeader = {
      walletId: newHdWalletId(),
      label,
      network: opts.network,
      networkType,
      kind: "watch-only",
      derivation: { scheme: "kaspa-bip44", purpose: 44, coinType: 111111 },
      accounts: [{ index: account, xpub }],
      passphraseRequired: false,
      createdAt: new Date().toISOString(),
      origin: "watch-only-import"
    };
    return this.writeNew(header, undefined, undefined);
  }

  private async unlock(file: EncryptedHdWalletKeystoreV1, password: string, passphrase: string | undefined): Promise<HdSigningKeyring> {
    return (await this.unlockWithPhrase(file, password, passphrase)).keyring;
  }

  private async unlockWithPhrase(
    file: EncryptedHdWalletKeystoreV1,
    password: string,
    passphrase: string | undefined
  ): Promise<{ keyring: HdSigningKeyring; phrase: string }> {
    const h = file.header;
    HdWalletManager.refuseMainnetKeys(h.network, "hd wallet open");
    if (h.kind === "watch-only") throw err("HD_WALLET_WATCH_ONLY", `Wallet '${h.label}' is watch-only: it holds no keys and cannot sign.`);
    if (h.passphraseRequired && (passphrase === undefined || passphrase === "")) {
      throw err("HD_WALLET_PASSPHRASE_REQUIRED", `Wallet '${h.label}' was created with a BIP39 passphrase; give it to open the wallet. Nothing was decrypted.`);
    }
    const phrase = await decryptHdWalletKeystore(file, password);
    const keyring = HdSigningKeyring.fromMnemonic(phrase, passphrase ?? "");
    try {
      for (const a of h.accounts) {
        if (!sameExtendedPublicKey(keyring.accountXPub(a.index, h.network), a.xpub)) {
          throw err(
            "HD_WALLET_PASSPHRASE_MISMATCH",
            `The ${h.passphraseRequired ? "passphrase" : "passphrase given to a wallet created without one"} does not derive wallet '${h.label}' ` +
              `(account ${a.index}'s public key differs). Nothing was opened.`
          );
        }
      }
      return { keyring, phrase };
    } catch (e) {
      keyring.dispose();
      throw e;
    }
  }

  /** Opens a wallet: decrypts the phrase and recomputes its account keys; the keys stay in memory until `close()`. */
  async open(ref: string, opts: { password: string; passphrase?: string }): Promise<OpenedHdWallet> {
    const { file, filePath } = this.locate(ref);
    const keyring = await this.unlock(file, opts?.password, opts?.passphrase);
    return new OpenedHdWallet(describeFile(file, filePath, true), keyring);
  }

  /** The watch-only view of an account from the header as written (unverified: see the module comment). */
  watch(ref: string, account = 0): HdWatchKeyring {
    const { file } = this.locate(ref);
    const entry = file.header.accounts.find((a) => a.index === account);
    if (!entry) throw err("HD_WALLET_ACCOUNT_NOT_FOUND", `Wallet '${file.header.label}' has no account ${account}.`);
    return new HdWatchKeyring(entry.xpub);
  }

  private async nextAddress(
    ref: string,
    chain: HdChain,
    opts: { account?: number; index?: number; password?: string; passphrase?: string }
  ): Promise<HdWalletAddress> {
    const account = opts?.account ?? 0;
    const { file, filePath } = this.locate(ref);
    const h = file.header;
    const entry = h.accounts.find((a) => a.index === account);
    if (!entry) throw err("HD_WALLET_ACCOUNT_NOT_FOUND", `Wallet '${h.label}' has no account ${account}.`);
    let verified = false;
    if (opts?.password !== undefined) {
      (await this.unlock(file, opts.password, opts.passphrase)).dispose();
      verified = true;
    }
    const watch = new HdWatchKeyring(entry.xpub);
    let index = opts?.index;
    if (index === undefined) {
      index = await withKeystoreLock(filePath, async () => {
        const fresh = readHdWalletKeystoreSync(filePath);
        const st = fresh.state.accounts[String(account)] ?? { nextReceive: 0, nextChange: 0 };
        const next = chain === "receive" ? st.nextReceive : st.nextChange;
        const updated = { ...st, ...(chain === "receive" ? { nextReceive: next + 1 } : { nextChange: next + 1 }) };
        await writeHdWalletKeystore(filePath, {
          ...fresh,
          state: { ...fresh.state, accounts: { ...fresh.state.accounts, [String(account)]: updated }, updatedAt: new Date().toISOString() }
        });
        return next;
      });
    }
    return {
      walletId: h.walletId,
      label: h.label,
      account,
      chain,
      index,
      path: hdDerivationPath(account, chain, index),
      address: watch.address(chain, index, h.network),
      network: h.network,
      verified
    };
  }

  /**
   * A receive address. Without `index`: the next unused one, and the wallet's receive index advances. With `password`
   * (and the passphrase) the wallet is opened first, so the address comes from authenticated keys (`verified: true`).
   */
  receiveAddress(ref: string, opts: { account?: number; index?: number; password?: string; passphrase?: string } = {}): Promise<HdWalletAddress> {
    return this.nextAddress(ref, "receive", opts);
  }

  /** A change address, as `receiveAddress` (the change index advances when no index is given). */
  changeAddress(ref: string, opts: { account?: number; index?: number; password?: string; passphrase?: string } = {}): Promise<HdWalletAddress> {
    return this.nextAddress(ref, "change", opts);
  }

  /**
   * Records that `chain`/`index` of `account` is used (a payment received there, or change sent there): the next index
   * offered becomes at least `index + 1`. Never moves an index back.
   */
  async markUsed(ref: string, used: { account: number; chain: HdChain; index: number }): Promise<HdWalletDescriptor> {
    const { filePath } = this.locate(ref);
    return withKeystoreLock(filePath, async () => {
      const fresh = readHdWalletKeystoreSync(filePath);
      const key = String(used.account);
      const st = fresh.state.accounts[key] ?? { nextReceive: 0, nextChange: 0 };
      const updated =
        used.chain === "receive"
          ? { ...st, nextReceive: Math.max(st.nextReceive, used.index + 1) }
          : { ...st, nextChange: Math.max(st.nextChange, used.index + 1) };
      const next = { ...fresh, state: { ...fresh.state, accounts: { ...fresh.state.accounts, [key]: updated }, updatedAt: new Date().toISOString() } };
      await writeHdWalletKeystore(filePath, next);
      return describeFile(next, filePath, false);
    });
  }

  /** Adds the next BIP44 account (its public key derived from the phrase); needs the password and passphrase. */
  async addAccount(ref: string, opts: { password: string; passphrase?: string }): Promise<HdWalletDescriptor> {
    const { filePath } = this.locate(ref);
    return withKeystoreLock(filePath, async () => {
      const file = readHdWalletKeystoreSync(filePath);
      const { keyring, phrase } = await this.unlockWithPhrase(file, opts?.password, opts?.passphrase);
      try {
        const index = Math.max(...file.header.accounts.map((a) => a.index)) + 1;
        const header: HdWalletKeystoreHeader = {
          ...file.header,
          accounts: [...file.header.accounts, { index, xpub: keyring.accountXPub(index, file.header.network) }]
        };
        const next = await encryptHdWalletKeystore({
          header,
          mnemonic: phrase,
          password: opts.password,
          state: { ...file.state, accounts: { ...file.state.accounts, [String(index)]: { nextReceive: 0, nextChange: 0 } } },
          kdf: { memory: file.kdf!.memory, iterations: file.kdf!.iterations, parallelism: file.kdf!.parallelism }
        });
        await writeHdWalletKeystore(filePath, next);
        return describeFile(next, filePath, true);
      } finally {
        keyring.dispose();
      }
    });
  }

  /**
   * Whether `mnemonic` (+ `passphrase`) recovers this wallet: it derives every account key the wallet records. Needs no
   * password; returns false (never throws) for a phrase that is not valid BIP39.
   */
  async verifyRecovery(ref: string, opts: { mnemonic: string; passphrase?: string }): Promise<boolean> {
    const { file } = this.locate(ref);
    let keyring: HdSigningKeyring;
    try {
      keyring = HdSigningKeyring.fromMnemonic(opts?.mnemonic, opts?.passphrase ?? "");
    } catch {
      return false;
    }
    try {
      return file.header.accounts.every((a) => sameExtendedPublicKey(keyring.accountXPub(a.index, file.header.network), a.xpub));
    } finally {
      keyring.dispose();
    }
  }

  /** SECRET, explicit: the recovery phrase of an HD wallet (password required). */
  async revealMnemonic(ref: string, opts: { password: string; passphrase?: string }): Promise<string> {
    const { file } = this.locate(ref);
    if (file.header.kind === "watch-only") throw err("HD_WALLET_WATCH_ONLY", `Wallet '${file.header.label}' is watch-only: it holds no recovery phrase.`);
    HdWalletManager.refuseMainnetKeys(file.header.network, "hd wallet reveal");
    return decryptHdWalletKeystore(file, opts?.password);
  }

  /** Re-encrypts the phrase under a new password (new salt and nonce; header, KDF parameters and state kept). */
  async changePassword(ref: string, opts: { oldPassword: string; newPassword: string }): Promise<HdWalletDescriptor> {
    assertHdWalletPassword(opts?.newPassword, "The new wallet password");
    const { filePath } = this.locate(ref);
    return withKeystoreLock(filePath, async () => {
      const file = readHdWalletKeystoreSync(filePath);
      if (file.header.kind === "watch-only") throw err("HD_WALLET_WATCH_ONLY", `Wallet '${file.header.label}' is watch-only: it has no password.`);
      const phrase = await decryptHdWalletKeystore(file, opts.oldPassword);
      const next = await encryptHdWalletKeystore({
        header: file.header,
        mnemonic: phrase,
        password: opts.newPassword,
        state: file.state,
        kdf: { memory: file.kdf!.memory, iterations: file.kdf!.iterations, parallelism: file.kdf!.parallelism }
      });
      await writeHdWalletKeystore(filePath, next);
      return describeFile(next, filePath, false);
    });
  }
}
