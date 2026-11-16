import { HardkasError, assertMainnetTransactionsDisabled, kaspaSighashInputsFromWasm } from "@hardkas/core";
import { CURRENT_HASH_VERSION, calculateContentHash } from "@hardkas/artifacts";
import { silverSpendUnsignedTransaction, type SilverSpendDraft } from "@hardkas/accounts";
import { WALLET_SIGN_REQUEST_SCHEMA, type WalletSignRequest } from "./browser-signer.js";
import { addressNetworkFamily, networkFamilyOf } from "./networks.js";
import { verifyWalletSignedTransaction, walletPublicKeyOf } from "./wallet-payments.js";

/*
 * R3-C · a v0 SilverScript spend (`prepareSilverSpend` draft, `hardkas silver spend`'s multi-party form) whose `sig`
 * argument a browser wallet provides (Node). The wallet signs input 0 of the draft's own unsigned transaction
 * (`silverSpendUnsignedTransaction`, the one `signSilverSpend` signs) with SIGHASH_ALL and returns the bare
 * `41 <64-byte signature> 01` (autoFinalized false); HardKAS checks it in full (the same transaction, nothing else
 * changed, a valid signature by the address's key over HardKAS's signature hash) and hands back the 65-byte `sig` value
 * for the existing `finalizeSilverSpend(draft, artifact, args, { [signer]: sig })`, which assembles the unlock (entry
 * arguments, dispatch tag, redeem script). No second unlock builder. Whether the contract checks that key is the
 * contract's: a signature by another key than the one it requires is the node's refusal, as with `signSilverSpend`.
 */

const refuse = (code: string, message: string, metadata?: Record<string, unknown>) => new HardkasError(code, message, metadata ? { metadata } : undefined);

/** The draft's identity (its canonical content hash): what a request for it names. */
function draftIdOf(draft: SilverSpendDraft): string {
  return calculateContentHash(JSON.parse(JSON.stringify(draft)), CURRENT_HASH_VERSION);
}

function requestOf(draft: SilverSpendDraft, address: string): { request: WalletSignRequest; sighash: ReturnType<typeof kaspaSighashInputsFromWasm> } {
  assertMainnetTransactionsDisabled("sign", [draft?.networkId, ...(addressNetworkFamily(address) === "mainnet" ? ["mainnet"] : [])], "silverSpendWalletRequest");
  const family = addressNetworkFamily(address);
  if (family === undefined || family !== networkFamilyOf(String(draft?.networkId))) {
    throw refuse("WALLET_NETWORK_MISMATCH", `${String(address)} is not an address of ${String(draft?.networkId)}, the draft's network. Nothing was signed.`, { address });
  }
  const publicKey = walletPublicKeyOf(address);
  const unsigned = silverSpendUnsignedTransaction(draft);
  const id = draftIdOf(draft);
  const request: WalletSignRequest = {
    schema: WALLET_SIGN_REQUEST_SCHEMA,
    purpose: "contract",
    networkId: String(draft.networkId),
    address,
    publicKey,
    txJsonString: String(unsigned.serializeToSafeJSON()),
    txId: draft.unsignedTxId,
    signInputs: [{ index: 0, sighashType: 1 }],
    autoFinalized: false,
    planArtifactId: id,
    draftContentHash: id
  };
  return { request, sighash: kaspaSighashInputsFromWasm(unsigned.serializeToObject()) };
}

/**
 * The request a browser wallet signs for a v0 SilverScript spend draft (`connectBrowserWallet(...).signTransaction`):
 * input 0 of the draft's unsigned transaction, SIGHASH_ALL, autoFinalized false. Mainnet refused first; no key read.
 */
export function silverSpendWalletRequest(draft: SilverSpendDraft, address: string): WalletSignRequest {
  return requestOf(draft, address).request;
}

/**
 * The 65-byte `sig` value (hex) a browser wallet returned for a v0 SilverScript spend draft, checked in full: the request
 * must be the one the draft gives now (WALLET_REQUEST_MISMATCH), the returned transaction the one sent with input 0
 * signed `41 <sig> 01` (WALLET_SIGNED_TRANSACTION_CHANGED, WALLET_SIGNATURE_MISSING), the signature valid by the
 * address's key over HardKAS's signature hash (WALLET_SIGNATURE_INVALID). Give it to `finalizeSilverSpend`.
 */
export function silverSpendSignatureFromWallet(draft: SilverSpendDraft, request: WalletSignRequest, returned: unknown): string {
  assertMainnetTransactionsDisabled("sign", [draft?.networkId, request?.networkId], "silverSpendSignatureFromWallet");
  if (request?.schema !== WALLET_SIGN_REQUEST_SCHEMA || request.purpose !== "contract") {
    throw refuse("WALLET_SIGN_REQUEST_INVALID", "not a HardKAS wallet request for a SilverScript spend. Nothing was signed.");
  }
  const { request: rebuilt, sighash } = requestOf(draft, request.address);
  const same = (r: WalletSignRequest) => JSON.stringify([r.networkId, r.publicKey, r.txJsonString, r.txId, r.signInputs.map((i) => [i.index, i.sighashType]), r.autoFinalized, r.planArtifactId, r.draftContentHash]);
  if (same(rebuilt) !== same(request)) {
    throw refuse("WALLET_REQUEST_MISMATCH", "the request is not the one this draft gives for this address (another transaction, input or draft). Nothing was signed.");
  }
  return verifyWalletSignedTransaction({ request: rebuilt, returned, sighash }).signatures[0]!;
}
