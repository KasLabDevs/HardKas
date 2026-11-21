/*
 * R3-C · the browser wallet signer, BROWSER-SAFE: everything this file exports runs in a page (no Node import, no Node
 * global, only relative imports of browser-safe modules; packages/sdk/test/wallet-browser-signer.test.ts checks it).
 * The HardKAS side (plan, verify against the expected key, assemble, send, record) is wallet-payments.ts and
 * sdk.covenants, which are Node.
 */
export {
  BROWSER_WALLET_KINDS,
  WALLET_SIGN_REQUEST_SCHEMA,
  connectBrowserWallet,
  describeBrowserWallet,
  detectBrowserWallets,
  walletSignCallOf,
  type BrowserWalletKind,
  type BrowserWalletSession,
  type ConnectBrowserWalletOptions,
  type WalletSignCall,
  type WalletSignRequest,
  type WalletSignedMessage,
  type WalletSignedTransaction
} from "./browser-signer.js";
export {
  normalizeWalletMessageSignature,
  verifyWalletMessageSignature,
  type KaspaMessageVerifier,
  type WalletMessageSignature,
  type WalletMessageSignatureShape
} from "./message-signature.js";
export { checkWalletSignedTransaction, type WalletSignatureCheck } from "./signed-transaction-check.js";
export { WalletSignerError } from "./errors.js";
export { addressNetworkFamily, isMainnetName, networkFamilyOf, walletNetworkIdOf, type WalletNetworkFamily } from "./networks.js";
