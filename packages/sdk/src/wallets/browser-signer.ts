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
 * What each wallet is asked, and what was verified against the REAL extensions on Testnet-10 on 21-nov-2026 with the probe
 * page (dev server, /wallet-probe): KasWare 0.11.6, Kaspire and Kastle.
 *  - KasWare and Kaspire: `signPskt` takes ONE object — KasWare `{ txJsonString, options: { signInputs: [{ index,
 *    sighashType: 1 }] } }`, Kaspire the same plus `sender`; the two-argument form crashes inside KasWare. VERIFIED for a
 *    payment on both: the signatures checked here and by HardKAS (every one against the address's key), KasWare's sent and
 *    accepted. Contract inputs ask for `options.autoFinalized: false` (the wallet returns the bare `41 <64-byte signature>
 *    01`; HardKAS assembles the unlock); a contract spend was not part of the 21-nov run.
 *  - Kastle has no signPskt (VERIFIED: its methods live on the prototype of a class instance). HardKAS calls its own
 *    `signTx(networkId, txJson, scripts)` — forbole/kastle 2.63.2 (commit 2aba91b6, api/browser.ts) — with the session's
 *    network, the same JSON and one `{ inputIndex, signType: "All" }` per input HardKAS chose; Kastle answers the signed
 *    transaction's safe JSON (a string), checked like the others. STILL UNVERIFIED against the extension until the probe
 *    is run again with Kastle. Per its source: signTx refuses any transaction that is not version 0 unless it decodes as a
 *    KCC-20 transfer of its own pieces (api/background/handlers/kaspa/signTx.ts), so a version-1 payment and every contract
 *    request are refused here before Kastle is asked; when HardKAS's options leave inputs unsigned, Kastle signs every
 *    other input its key owns too (lib/wallet/sign-script.ts), which the check below refuses as a change; a Ledger account
 *    refuses sign-only requests.
 *  - `txJsonString` is the SDK's safe JSON of the unsigned transaction HardKAS built, never hand-rolled.
 *  - before every signature request the wallet's active address and network are read again and must be the session's;
 *    `accountsChanged` (payload an array or `{ address }`) or `networkChanged` to anything else drops the session.
 *  - the network: each wallet's own `getNetwork()` when it offers one — KasWare "kaspa_testnet_10" (and "" before it is
 *    connected, so it is read after the accounts), Kaspire and Kastle "testnet-10" (VERIFIED). A wallet that offers it is
 *    held to it: an answer HardKAS cannot read as Kaspa L1 is refused, another network is refused, mainnet always. Without
 *    it, Kaspire is read by its address prefix (which cannot tell one testnet from another) and Kastle by the id it was
 *    connected with (Kastle 2.63.2's connect() takes no network: only getNetwork() says it). KasWare must offer it.
 *  - Kaspire rejects at once when locked; the extension is looked up when asked (on a click), not only at page load.
 *  - signMessage (one argument) VERIFIED on all three: KasWare and Kastle answer 128 hex characters, Kaspire `{ address,
 *    publicKey, signedMessage, signature }`.
 *  - A wallet never broadcasts for HardKAS: no send / push / broadcast method of a wallet is ever called (Kastle's
 *    signAndBroadcastTx and sendKaspa included).
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

/**
 * forbole/kastle 2.63.2 (api/background/background-service.ts): a request handler that rejects with anything but an
 * Error reaches the page as "Unknown error". Its sign popup rejects with strings ("User denied" on Cancel, "Failed to
 * sign transaction: …") and its timeout with an object, so Kastle's answer cannot say which one happened (TN10, 21-nov).
 */
const KASTLE_OPAQUE_ERROR = "Unknown error";

const rejected = (kind: BrowserWalletKind, what: string, e: unknown) => {
  const said = String((e as any)?.message ?? e).slice(0, 300);
  const why =
    kind === "kastle" && said === KASTLE_OPAQUE_ERROR
      ? "Kastle answers this same text when its popup is declined, when its popup fails to sign and when its request expires: it does not say which"
      : "a locked wallet or a declined popup refuses at once";
  return walletRefusal("WALLET_REQUEST_REJECTED", `${kind} refused ${what}: ${said} (${why}). Nothing was signed.`, { kind });
};

function providerOf(kind: BrowserWalletKind, win: unknown): Provider | undefined {
  const w = (win ?? globalThis) as Record<string, unknown>;
  const p = w?.[kind];
  return p && (typeof p === "object" || typeof p === "function") ? (p as Provider) : undefined;
}

/** The wallets whose extension is injected now (call it on a click: an extension may inject after the page loaded). */
export function detectBrowserWallets(win?: unknown): BrowserWalletKind[] {
  return BROWSER_WALLET_KINDS.filter((k) => providerOf(k, win) !== undefined);
}

/** The method names an injected object offers, its prototype chain's included (Kastle's are all on its class's prototype). */
function methodNamesOf(p: Provider): string[] {
  const names = new Set<string>();
  for (let o: any = p; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const n of Object.getOwnPropertyNames(o)) {
      if (n === "constructor") continue;
      try {
        if (typeof (p as any)[n] === "function") names.add(n);
      } catch {
        /* a property that throws when read is no method */
      }
    }
  }
  return [...names].sort();
}

/** The method names a wallet's injected object offers (what the probe page shows). */
export function describeBrowserWallet(kind: BrowserWalletKind, win?: unknown): string[] | undefined {
  const p = providerOf(kind, win);
  return p ? methodNamesOf(p) : undefined;
}

/** How HardKAS asks a wallet to sign a request: the method and its arguments, exactly as the session passes them. */
export interface WalletSignCall {
  readonly method: "signPskt" | "signTx";
  readonly args: readonly unknown[];
}

/**
 * The call a session makes to have `request` signed by `kind` at `address` (see the header): KasWare and Kaspire
 * `signPskt` with ONE object (Kaspire's with `sender`), Kastle `signTx(networkId, txJson, scripts)`. Nothing is checked
 * here (the session checks before it calls); the probe page shows it.
 */
export function walletSignCallOf(kind: BrowserWalletKind, request: WalletSignRequest, address: string): WalletSignCall {
  const indexes = request.signInputs.map((i) => i.index);
  if (kind === "kastle") {
    return { method: "signTx", args: [walletNetworkIdOf(request.networkId) ?? request.networkId, request.txJsonString, indexes.map((inputIndex) => ({ inputIndex, signType: "All" }))] };
  }
  const arg: Record<string, unknown> = {
    txJsonString: request.txJsonString,
    options: { signInputs: indexes.map((index) => ({ index, sighashType: 1 })), ...(request.autoFinalized === false ? { autoFinalized: false } : {}) }
  };
  if (kind === "kaspire") arg.sender = address;
  // ONE argument, always: the two-argument form crashes inside KasWare
  return { method: "signPskt", args: [arg] };
}

/** Kastle's own test (api/background/handlers/kaspa/utils.ts isCovenantTxJson): only a parseable version-0 transaction is not a covenant one. */
function isVersionZeroTxJson(txJson: string): boolean {
  try {
    return JSON.parse(txJson)?.version === 0;
  } catch {
    return false;
  }
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

/** What a read of the wallet gives: its active address and, when it offers getNetwork(), its own network answer. */
interface WalletState {
  readonly address: string | undefined;
  readonly network: unknown;
  /** The wallet offers getNetwork() and was asked: it is then held to its answer. */
  readonly saysNetwork: boolean;
}

/**
 * The wallet's active address and, where it says one (getNetwork), its network, read without a popup where the wallet
 * allows. KasWare must offer getNetwork; Kaspire and Kastle are asked when they offer it (both did on 21-nov-2026).
 */
async function readState(kind: BrowserWalletKind, p: Provider, connected: boolean): Promise<WalletState> {
  let address: string | undefined;
  if (kind === "kastle") {
    if (typeof p.getAccount !== "function") throw unavailable(kind, "getAccount", p);
    address = addressIn(await call(kind, "to give its account", () => p.getAccount()));
  } else {
    const accountsMethod = connected ? "getAccounts" : "requestAccounts";
    if (typeof p[accountsMethod] !== "function") throw unavailable(kind, accountsMethod, p);
    address = addressIn(await call(kind, connected ? "to give its active account" : "the connection", () => p[accountsMethod]()));
  }
  // read after the accounts: KasWare answers "" before it is connected
  if (typeof p.getNetwork !== "function") {
    if (kind === "kasware") throw unavailable(kind, "getNetwork", p);
    return { address, network: undefined, saysNetwork: false };
  }
  const network = await call(kind, "to give its network", () => p.getNetwork());
  return { address, network, saysNetwork: true };
}

const unavailable = (kind: BrowserWalletKind, method: string, p: Provider) =>
  walletRefusal(
    "WALLET_METHOD_UNAVAILABLE",
    `${kind} offers no ${method}() (its object has: ${methodNamesOf(p).join(", ") || "no method"}). HardKAS cannot ask it this way. Nothing was signed.`,
    { kind, method }
  );

/** The session's network from the wallet's state, refused when it is mainnet, unknown, or not the one expected. */
function settleNetwork(kind: BrowserWalletKind, address: string, state: WalletState, expected: string): BrowserWalletSession["networkEvidence"] {
  const { network } = state;
  const family = addressNetworkFamily(address);
  if (family === "mainnet" || isMainnetName(network)) throw mainnetRefusal(`${kind} is on mainnet (${String(network ?? address)})`);
  if (family === undefined) {
    throw walletRefusal("WALLET_NETWORK_UNKNOWN", `${kind}'s active address ${address} is not a Kaspa L1 address HardKAS can read. Nothing was signed.`, { kind, address });
  }
  const expectedFamily = networkFamilyOf(expected);
  if (family !== expectedFamily) {
    throw walletRefusal("WALLET_NETWORK_MISMATCH", `${kind}'s active address ${address} is a ${family} address; the transaction is for ${expected}. Nothing was signed.`, { kind, address, expected });
  }
  // a wallet that says its network is held to it (KasWare always; Kaspire and Kastle when they offer getNetwork)
  if (state.saysNetwork) {
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
  // no getNetwork: Kastle by the id it was connected with, Kaspire by its address prefix only
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
  const networkEvidence = settleNetwork(kind, address, first, expected);
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
      settleNetwork(kind, now.address, now, expected);
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
      if (kind === "kastle" && (request.purpose === "contract" || !isVersionZeroTxJson(request.txJsonString))) {
        // forbole/kastle api/background/handlers/kaspa/signTx.ts: a transaction that is not version 0 is a covenant one to
        // Kastle, refused unless it decodes as a KCC-20 transfer of the wallet's own pieces (a HardKAS draft never does)
        throw walletRefusal(
          "WALLET_COVENANT_SIGNING_UNSUPPORTED",
          `Kastle's signTx refuses ${request.purpose === "contract" ? "contract and covenant inputs" : "a transaction that is not version 0"} unless it is a KCC-20 transfer of its own pieces: HardKAS does not ask it. Plan a version-0 payment (the default), or use KasWare. Nothing was asked of the wallet.`,
          { kind }
        );
      }
      const signCall = walletSignCallOf(kind, { ...request, networkId: expected }, address);
      if (typeof p[signCall.method] !== "function") throw unavailable(kind, signCall.method, p);
      await refresh();
      const signInputs = request.signInputs.map((i) => ({ index: i.index, sighashType: 1 as const }));
      // called on the wallet's object (Kastle's methods use `this`); only signPskt or signTx, never a broadcast method
      const returned = await call(kind, "to sign", () => p[signCall.method](...signCall.args));
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
