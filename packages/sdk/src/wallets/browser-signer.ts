import { walletRefusal } from "./errors.js";
import { addressNetworkFamily, isMainnetName, networkFamilyOf, walletNetworkIdOf } from "./networks.js";
import { checkWalletSignedTransaction, type WalletSignatureCheck } from "./signed-transaction-check.js";
import { normalizeWalletMessageSignature, type WalletMessageSignature } from "./message-signature.js";

/*
 * R3-C · the browser wallet signer: HardKAS never holds the user's key. HardKAS (Node: wallet-payments.ts,
 * covenants.ts) builds the transaction and says which inputs the wallet signs; this module, which a page loads, asks the
 * wallet to sign exactly those (SIGHASH_ALL) and checks what comes back; HardKAS then verifies every signature against
 * the key it expects over its own signature hash, assembles the final unlock of contract inputs, sends and records.
 * BROWSER-SAFE: no Node import, no Node global; it touches only the `window.<wallet>` object the extension injects.
 *
 * The wallets' interfaces come from third-party field notes (NOTES-CROSSCHECK §2.3), UNVERIFIED against the real
 * extensions until the owner runs the probe page (dev server, /wallet-probe):
 *  - `signPskt` takes ONE object — KasWare `{ txJsonString, options: { signInputs: [{ index, sighashType: 1 }] } }`,
 *    Kaspire the same plus `sender`; the two-argument form crashes inside KasWare. Contract inputs ask for
 *    `options.autoFinalized: false` (the wallet returns the bare `41 <64-byte signature> 01`; HardKAS assembles the unlock).
 *  - `txJsonString` is the SDK's safe JSON of the unsigned transaction HardKAS built, never hand-rolled.
 *  - before every signature request the wallet's active address and network are read again and must be the session's;
 *    `accountsChanged` (payload an array or `{ address }`) or `networkChanged` to anything else drops the session.
 *  - KasWare says its network (`getNetwork`), Kastle takes it in `connect`, Kaspire says it only by its address prefix
 *    (which cannot tell one testnet from another). A network HardKAS cannot read as Kaspa L1 is refused, mainnet always.
 *  - Kaspire rejects at once when locked; the extension is looked up when asked (on a click), not only at page load.
 *  - Kastle could not sign covenant inputs: a contract request to it is refused before it is asked.
 *  - A wallet never broadcasts for HardKAS: no send / push / broadcast method of a wallet is ever called.
 */

export type BrowserWalletKind = "kasware" | "kastle" | "kaspire";
export const BROWSER_WALLET_KINDS: readonly BrowserWalletKind[] = ["kasware", "kastle", "kaspire"];

/** The schema of a request HardKAS hands a page for a wallet to sign. */
export const WALLET_SIGN_REQUEST_SCHEMA = "hardkas.walletSignRequest.v1";

/** What HardKAS asks a wallet to sign (made by `prepareWalletPayment` or `sdk.covenants.walletDraftRequest`). */
export interface WalletSignRequest {
  readonly schema: typeof WALLET_SIGN_REQUEST_SCHEMA;
  /** A P2PK payment (every input the wallet's), or contract inputs of a v1 engine draft (the wallet signs its slots). */
  readonly purpose: "payment" | "contract";
  /** The HardKAS network id of the transaction ("simnet", "testnet-10", "devnet"; never mainnet). */
  readonly networkId: string;
  /** The wallet address whose key signs. */
  readonly address: string;
  /** That address's x-only public key (hex): the key each signature is verified against. */
  readonly publicKey: string;
  /** The SDK's safe JSON of the unsigned transaction HardKAS built. */
  readonly txJsonString: string;
  readonly txId: string;
  /** Exactly the inputs the wallet signs, SIGHASH_ALL. */
  readonly signInputs: ReadonlyArray<{ readonly index: number; readonly sighashType: 1 }>;
  /** false for contract inputs: the wallet returns the bare signature push, HardKAS assembles the unlock. */
  readonly autoFinalized: boolean;
  /** The plan the transaction is built from (its contentHash). */
  readonly planArtifactId: string;
  /** Contract requests: the draft whose slots the signatures fill (its contentHash). */
  readonly draftContentHash?: string | undefined;
}

/** What a session hands back from a signature: the wallet's raw return and the structural check's result. */
export interface WalletSignedTransaction {
  readonly kind: BrowserWalletKind;
  readonly address: string;
  /** The wallet's return, as it came (hand it to HardKAS: completeWalletPayment / sdk.covenants.fillDraftFromWallet). */
  readonly returned: unknown;
  readonly check: WalletSignatureCheck;
}

/** What a session hands back from `signMessage`: the wallet's raw answer and its normalized signature (not yet verified). */
export interface WalletSignedMessage {
  readonly kind: BrowserWalletKind;
  readonly address: string;
  readonly message: string;
  readonly returned: unknown;
  readonly signature: WalletMessageSignature;
}

export interface BrowserWalletSession {
  readonly kind: BrowserWalletKind;
  readonly address: string;
  /** The HardKAS network id the session is for. */
  readonly networkId: string;
  /** How the wallet's network was established: its own answer, the id it was connected with, or its address prefix only. */
  readonly networkEvidence: "wallet" | "connect" | "address-prefix";
  /** The public key the wallet states, if it states one (informational: HardKAS verifies against the address's key). */
  readonly statedPublicKey?: string | undefined;
  /** false once the session was dropped (account or network changed, closed). */
  readonly active: boolean;
  readonly droppedReason?: string | undefined;
  /** Reads the wallet's active address and network again; refuses (and drops the session) when they are not the session's. */
  refresh(): Promise<void>;
  /** Asks the wallet to sign exactly the request's inputs, then checks what came back (see the header). */
  signTransaction(request: WalletSignRequest): Promise<WalletSignedTransaction>;
  /**
   * Asks the wallet to sign a text message (`signMessage(message)`, one argument) and normalizes its answer (one of the
   * three shapes of message-signature.ts). The signature is NOT verified here: verify it with
   * `verifyWalletMessageSignature` (a page's own kaspa-wasm) or, on the Node side, `verifyWalletMessage`.
   */
  signMessage(message: string): Promise<WalletSignedMessage>;
  /** Drops the session and its event listeners. */
  close(): void;
}

export interface ConnectBrowserWalletOptions {
  /** The HardKAS network id the session must be on (the plan's network). Mainnet is refused before the wallet is touched. */
  readonly networkId: string;
  /** Where the extension is injected (default: globalThis, read when connect is called). */
  readonly window?: unknown;
  /** Called once when the session is dropped by the wallet (account or network changed). */
  readonly onDropped?: ((reason: string) => void) | undefined;
}

type Provider = Record<string, any>;

const mainnetRefusal = (where: string) =>
  walletRefusal(
    "MAINNET_SIGNING_DISABLED",
    `${where}: mainnet signing is disabled in this HardKAS release (every path refuses it, a browser wallet's included). Nothing was asked of the wallet.`
  );

const rejected = (kind: BrowserWalletKind, what: string, e: unknown) =>
  walletRefusal(
    "WALLET_REQUEST_REJECTED",
    `${kind} refused ${what}: ${String((e as any)?.message ?? e).slice(0, 300)} (a locked wallet or a declined popup refuses at once). Nothing was signed.`,
    { kind }
  );

function providerOf(kind: BrowserWalletKind, win: unknown): Provider | undefined {
  const w = (win ?? globalThis) as Record<string, unknown>;
  const p = w?.[kind];
  return p && (typeof p === "object" || typeof p === "function") ? (p as Provider) : undefined;
}

/** The wallets whose extension is injected now (call it on a click: an extension may inject after the page loaded). */
export function detectBrowserWallets(win?: unknown): BrowserWalletKind[] {
  return BROWSER_WALLET_KINDS.filter((k) => providerOf(k, win) !== undefined);
}

/** The method names a wallet's injected object offers (what the probe page shows, to compare with the notes). */
export function describeBrowserWallet(kind: BrowserWalletKind, win?: unknown): string[] | undefined {
  const p = providerOf(kind, win);
  if (!p) return undefined;
  const names = new Set<string>();
  for (let o: any = p; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const n of Object.getOwnPropertyNames(o)) if (n !== "constructor" && typeof (p as any)[n] === "function") names.add(n);
  }
  return [...names].sort();
}

/** The first address of an accounts answer or event payload (an array, `{ address }`, or a string). */
function addressIn(payload: unknown): string | undefined {
  const v = Array.isArray(payload) ? payload[0] : payload && typeof payload === "object" ? (payload as any).address : payload;
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

async function call<T>(kind: BrowserWalletKind, what: string, f: () => Promise<T> | T): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw rejected(kind, what, e);
  }
}

/** The wallet's active address (and network, where it says one), read without a popup where the wallet allows. */
async function readState(kind: BrowserWalletKind, p: Provider, connected: boolean): Promise<{ address: string | undefined; network: unknown }> {
  if (kind === "kastle") {
    if (typeof p.getAccount !== "function") throw unavailable(kind, "getAccount", p);
    const account = await call(kind, "to give its account", () => p.getAccount());
    return { address: addressIn(account), network: undefined };
  }
  const accountsMethod = connected ? "getAccounts" : "requestAccounts";
  if (typeof p[accountsMethod] !== "function") throw unavailable(kind, accountsMethod, p);
  const accounts = await call(kind, connected ? "to give its active account" : "the connection", () => p[accountsMethod]());
  if (kind === "kaspire") return { address: addressIn(accounts), network: undefined };
  if (typeof p.getNetwork !== "function") throw unavailable(kind, "getNetwork", p);
  const network = await call(kind, "to give its network", () => p.getNetwork());
  return { address: addressIn(accounts), network };
}

const unavailable = (kind: BrowserWalletKind, method: string, p: Provider) =>
  walletRefusal(
    "WALLET_METHOD_UNAVAILABLE",
    `${kind} offers no ${method}() (its object has: ${Object.keys(p).filter((n) => typeof p[n] === "function").join(", ") || "no method"}). HardKAS cannot use it as described in its notes. Nothing was signed.`,
    { kind, method }
  );

/** The session's network from the wallet's state, refused when it is mainnet, unknown, or not the one expected. */
function settleNetwork(kind: BrowserWalletKind, address: string, network: unknown, expected: string): "wallet" | "connect" | "address-prefix" {
  const family = addressNetworkFamily(address);
  if (family === "mainnet" || isMainnetName(network)) throw mainnetRefusal(`${kind} is on mainnet (${String(network ?? address)})`);
  if (family === undefined) {
    throw walletRefusal("WALLET_NETWORK_UNKNOWN", `${kind}'s active address ${address} is not a Kaspa L1 address HardKAS can read. Nothing was signed.`, { kind, address });
  }
  const expectedFamily = networkFamilyOf(expected);
  if (family !== expectedFamily) {
    throw walletRefusal("WALLET_NETWORK_MISMATCH", `${kind}'s active address ${address} is a ${family} address; the transaction is for ${expected}. Nothing was signed.`, { kind, address, expected });
  }
  if (kind === "kasware") {
    const id = walletNetworkIdOf(network);
    if (id === undefined) {
      throw walletRefusal(
        "WALLET_NETWORK_UNKNOWN",
        `${kind} says it is on '${String(network)}', which HardKAS cannot read as a Kaspa L1 network (a wallet on an L2 keeps a Kaspa-looking address). Nothing was signed.`,
        { kind, network: String(network) }
      );
    }
    if (id !== walletNetworkIdOf(expected)) {
      throw walletRefusal("WALLET_NETWORK_MISMATCH", `${kind} is on ${id}; the transaction is for ${expected}. Switch the wallet's network. Nothing was signed.`, { kind, network: id, expected });
    }
    return "wallet";
  }
  return kind === "kastle" ? "connect" : "address-prefix";
}

/**
 * Connects to a browser wallet for transactions on `options.networkId`: mainnet refused before the wallet is touched; the
 * extension looked up now; the connection asked (a popup); the active address and network read and checked; the
 * session dropped on `accountsChanged` / `networkChanged`.
 */
export async function connectBrowserWallet(kind: BrowserWalletKind, options: ConnectBrowserWalletOptions): Promise<BrowserWalletSession> {
  if (isMainnetName(options.networkId)) throw mainnetRefusal(`connectBrowserWallet(${kind}, ${options.networkId})`);
  const expected = walletNetworkIdOf(options.networkId);
  if (expected === undefined) {
    throw walletRefusal("WALLET_NETWORK_UNKNOWN", `'${options.networkId}' is not a Kaspa L1 network id HardKAS can sign for with a browser wallet. Nothing was asked of the wallet.`);
  }
  if (!BROWSER_WALLET_KINDS.includes(kind)) throw walletRefusal("WALLET_NOT_FOUND", `'${String(kind)}' is not a wallet HardKAS supports (${BROWSER_WALLET_KINDS.join(", ")}).`);
  const p = providerOf(kind, options.window);
  if (!p) throw walletRefusal("WALLET_NOT_FOUND", `no ${kind} extension is injected in this page (window.${kind} is undefined): install or unlock it, then try again.`, { kind });

  if (kind === "kastle") {
    if (typeof p.connect !== "function") throw unavailable(kind, "connect", p);
    await call(kind, "the connection", () => p.connect(expected));
  }
  const first = await readState(kind, p, false);
  if (!first.address) throw walletRefusal("WALLET_REQUEST_REJECTED", `${kind} gave no active account (locked, or the connection was declined). Nothing was signed.`, { kind });
  const address = first.address;
  const networkEvidence = settleNetwork(kind, address, first.network, expected);
  let statedPublicKey: string | undefined;
  if (kind === "kastle") {
    try {
      const a: any = await p.getAccount();
      if (typeof a?.publicKey === "string") statedPublicKey = a.publicKey;
    } catch {
      /* informational only */
    }
  } else if (typeof p.getPublicKey === "function") {
    try {
      const k = await p.getPublicKey();
      if (typeof k === "string") statedPublicKey = k;
    } catch {
      /* informational only */
    }
  }

  let active = true;
  let droppedReason: string | undefined;
  const listeners: Array<[string, (payload: unknown) => void]> = [];
  const off = () => {
    for (const [event, h] of listeners.splice(0)) {
      try {
        if (typeof p.removeListener === "function") p.removeListener(event, h);
        else if (typeof p.off === "function") p.off(event, h);
      } catch {
        /* a wallet that cannot remove a listener: the session is inactive anyway */
      }
    }
  };
  const drop = (reason: string) => {
    if (!active) return;
    active = false;
    droppedReason = reason;
    off();
    try {
      options.onDropped?.(reason);
    } catch {
      /* the page's callback never breaks the session's state */
    }
  };
  const listen = (event: string, h: (payload: unknown) => void) => {
    if (typeof p.on !== "function") return;
    try {
      p.on(event, h);
      listeners.push([event, h]);
    } catch {
      /* a wallet without events: the re-read before every request still holds */
    }
  };
  listen("accountsChanged", (payload) => {
    const now = addressIn(payload);
    if (now !== address) drop(`the wallet's account changed${now ? ` to ${now}` : " (locked or disconnected)"}`);
  });
  listen("networkChanged", (payload) => {
    const now = walletNetworkIdOf(typeof payload === "string" ? payload : (payload as any)?.network);
    if (now !== expected) drop(`the wallet's network changed to ${String((payload as any)?.network ?? payload)}`);
  });

  const accountChanged = (detail: string) =>
    walletRefusal("WALLET_ACCOUNT_CHANGED", `${kind}: ${detail}. The session was dropped: connect again. Nothing was signed.`, { kind, address });

  const refresh = async (): Promise<void> => {
    if (!active) throw accountChanged(droppedReason ?? "the session is closed");
    const now = await readState(kind, p, true);
    if (now.address !== address) {
      drop(`the wallet's active account is ${now.address ?? "none"}, the session's ${address}`);
      throw accountChanged(`the active account is ${now.address ?? "none (locked?)"}, not the session's ${address}`);
    }
    try {
      settleNetwork(kind, now.address, now.network, expected);
    } catch (e) {
      drop(`the wallet's network is no longer ${expected}`);
      throw e;
    }
  };

  const session: BrowserWalletSession = {
    kind,
    address,
    networkId: expected,
    networkEvidence,
    ...(statedPublicKey !== undefined ? { statedPublicKey } : {}),
    get active() {
      return active;
    },
    get droppedReason() {
      return droppedReason;
    },
    refresh,
    close: () => drop("closed"),
    async signTransaction(request: WalletSignRequest): Promise<WalletSignedTransaction> {
      // decided before the wallet is touched: mainnet, the request's network and address, its inputs and sighash
      if (isMainnetName(request?.networkId)) throw mainnetRefusal(`${kind}.signTransaction`);
      if (request?.schema !== WALLET_SIGN_REQUEST_SCHEMA || typeof request.txJsonString !== "string" || !Array.isArray(request.signInputs) || request.signInputs.length === 0) {
        throw walletRefusal("WALLET_SIGN_REQUEST_INVALID", "the request is not a HardKAS wallet sign request with at least one input to sign. Nothing was asked of the wallet.");
      }
      if (walletNetworkIdOf(request.networkId) !== expected) {
        throw walletRefusal("WALLET_NETWORK_MISMATCH", `the request is for ${request.networkId}; this ${kind} session is for ${expected}. Nothing was asked of the wallet.`, { kind });
      }
      if (request.address !== address) throw accountChanged(`the request is for ${request.address}, the session's account is ${address}`);
      if (request.signInputs.some((i) => !Number.isInteger(i?.index) || i.index < 0 || i.sighashType !== 1)) {
        throw walletRefusal("WALLET_SIGN_REQUEST_INVALID", "every input to sign is a non-negative index with sighashType 1 (SIGHASH_ALL). Nothing was asked of the wallet.");
      }
      if (request.purpose === "contract" && kind === "kastle") {
        throw walletRefusal("WALLET_COVENANT_SIGNING_UNSUPPORTED", "Kastle could not sign contract or covenant inputs (field notes): HardKAS does not ask it. Use KasWare. Nothing was asked of the wallet.", { kind });
      }
      if (typeof p.signPskt !== "function") throw unavailable(kind, "signPskt", p);
      await refresh();
      const signInputs = request.signInputs.map((i) => ({ index: i.index, sighashType: 1 as const }));
      const arg: Record<string, unknown> = {
        txJsonString: request.txJsonString,
        options: { signInputs, ...(request.autoFinalized === false ? { autoFinalized: false } : {}) }
      };
      if (kind === "kaspire") arg.sender = address;
      // ONE argument, always: the two-argument form crashes inside KasWare
      const returned = await call(kind, "to sign", () => p.signPskt(arg));
      // the account may have changed while the popup was open: nothing it returned is used then
      if (!active) throw accountChanged(droppedReason ?? "the session was dropped while the wallet was signing");
      await refresh();
      let check: WalletSignatureCheck;
      try {
        check = checkWalletSignedTransaction(request.txJsonString, returned, signInputs.map((i) => i.index));
      } catch (e) {
        // what the wallet returned stays readable on the refusal (non-enumerable: never logged by accident), for a probe
        if (e && typeof e === "object") Object.defineProperty(e, "walletReturned", { value: returned, enumerable: false });
        throw e;
      }
      return { kind, address, returned, check };
    },
    async signMessage(message: string): Promise<WalletSignedMessage> {
      if (typeof message !== "string" || message.length === 0) {
        throw walletRefusal("WALLET_SIGN_REQUEST_INVALID", "the message to sign is empty. Nothing was asked of the wallet.");
      }
      if (typeof p.signMessage !== "function") throw unavailable(kind, "signMessage", p);
      await refresh();
      const returned = await call(kind, "to sign the message", () => p.signMessage(message));
      if (!active) throw accountChanged(droppedReason ?? "the session was dropped while the wallet was signing");
      await refresh();
      let signature: WalletMessageSignature;
      try {
        signature = normalizeWalletMessageSignature(returned);
      } catch (e) {
        if (e && typeof e === "object") Object.defineProperty(e, "walletReturned", { value: returned, enumerable: false });
        throw e;
      }
      return { kind, address, message, returned, signature };
    }
  };
  return session;
}
