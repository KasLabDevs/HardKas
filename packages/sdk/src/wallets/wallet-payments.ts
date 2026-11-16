import { HardkasError, assertMainnetTransactionsDisabled, declaredNetworkIdOf, kaspaSighashInputsFromWasm, loadManagedKaspaWasmSync, verifyKaspaInputSignature } from "@hardkas/core";
import { decodeKaspaAddress, type SignedTxArtifact, type TxPlanArtifact } from "@hardkas/artifacts";
import { StaticSignatureScriptAuthorizer, signTxPlanArtifact, type TxInputAuthorizer } from "@hardkas/accounts";
import type { Hardkas } from "../index.js";
import { WALLET_SIGN_REQUEST_SCHEMA, type WalletSignRequest } from "./browser-signer.js";
import { WalletSignerError } from "./errors.js";
import { addressNetworkFamily, networkFamilyOf } from "./networks.js";
import { checkWalletSignedTransaction, type WalletSignatureCheck } from "./signed-transaction-check.js";
import { verifyWalletMessageSignature, type WalletMessageSignature } from "./message-signature.js";

/*
 * R3-C · the HardKAS side of a browser wallet's signature (Node). HardKAS never holds the wallet's key:
 *  1. `prepareWalletPayment` plans a P2PK payment from the wallet's address with the payment planner (`sdk.tx.plan`) and
 *     hands back the request a page gives the wallet: the SDK's safe JSON of the unsigned transaction, built by the very
 *     signer that will assemble it (`signTxPlanArtifact`, whose authorizers receive the transaction they sign), and the
 *     inputs to sign (every input: all are the wallet's).
 *  2. the page asks the wallet (`connectBrowserWallet(...).signTransaction(request)`, wallets/browser-signer.ts).
 *  3. `completeWalletPayment` rebuilds the transaction from the plan (the request must be that one: WALLET_REQUEST_MISMATCH),
 *     checks what the wallet returned (wallets/signed-transaction-check.ts) and every signature against the address's key
 *     over HardKAS's own signature hash (WALLET_SIGNATURE_INVALID), then signs the plan through `sdk.tx.sign` with the
 *     wallet's signature scripts as the inputs' authorizations (every check of a payment signature, the signed artifact
 *     stored) and requires the signed transaction to be the one the wallet signed. Send it with `sdk.tx.send` (or the dev
 *     server's POST /api/tx/send): one submission per txId, node identity, synced node, the records.
 * Mainnet is refused first, before anything is planned, read or asked (MAINNET_SIGNING_DISABLED).
 */

const refuse = (code: string, message: string, metadata?: Record<string, unknown>) => new HardkasError(code, message, metadata ? { metadata } : undefined);

/** A browser-side refusal (WalletSignerError) re-thrown as HardkasError with the same code. */
function asHardkasError(e: unknown): unknown {
  return e instanceof WalletSignerError ? new HardkasError(e.code, e.message, e.metadata ? { metadata: e.metadata } : undefined) : e;
}

/** The x-only public key (hex) of a Schnorr P2PK address: the key a wallet at that address signs with. */
export function walletPublicKeyOf(address: string): string {
  const d = typeof address === "string" ? decodeKaspaAddress(address) : undefined;
  if (!d || d.version !== 0 || d.payload.length !== 32) {
    throw refuse(
      "WALLET_ADDRESS_UNSUPPORTED",
      `${String(address)} is not a Schnorr P2PK address: a browser wallet signs HardKAS transactions for its own P2PK address only. Nothing was planned or signed.`,
      { address }
    );
  }
  return Buffer.from(d.payload).toString("hex");
}

/** The HardKAS network id this instance declares (a workspace may name its network anything). */
function networkIdOf(sdk: Hardkas): string {
  return declaredNetworkIdOf(sdk.config.config, sdk.network) ?? String(sdk.network);
}

/** Mainnet (any network involved, the address's prefix included) refused before anything else; the address on the instance's network. */
function assertWalletNetwork(sdk: Hardkas, address: string, where: string, more: readonly unknown[] = []): string {
  const networkId = networkIdOf(sdk);
  assertMainnetTransactionsDisabled("sign", [sdk.network, networkId, ...(addressNetworkFamily(address) === "mainnet" ? ["mainnet"] : []), ...more], where);
  const family = addressNetworkFamily(address);
  if (family === undefined || family !== networkFamilyOf(networkId)) {
    throw refuse("WALLET_NETWORK_MISMATCH", `${where}: the wallet address ${address} is not an address of ${networkId}, this instance's network. Nothing was planned or signed.`, { address, networkId });
  }
  return networkId;
}

/** The unsigned transaction of a payment plan, as the payment signer builds it, and what its signature hash reads. */
export interface UnsignedWalletTransaction {
  readonly txJsonString: string;
  readonly txId: string;
  readonly sighash: ReturnType<typeof kaspaSighashInputsFromWasm>;
}

/**
 * The unsigned transaction of a payment plan exactly as the payment signer (`signTxPlanArtifact`) builds it to sign: its
 * authorizers receive that transaction. A placeholder authorization lets the signer finish; what it returns is discarded
 * (nothing is stored, nothing has a valid signature).
 */
async function unsignedPaymentTransaction(sdk: Hardkas, plan: TxPlanArtifact): Promise<UnsignedWalletTransaction> {
  let captured: { json: string; id: string; object: any } | undefined;
  const capture: TxInputAuthorizer = {
    authorize(ctx) {
      if (captured === undefined) {
        const tx: any = ctx.wasmTransaction;
        captured = { json: String(tx.serializeToSafeJSON()), id: String(tx.id), object: tx.serializeToObject() };
      }
      // the shape of a real P2PK unlock (one 65-byte push), all zeros: never a signature
      return { kind: "signature-script", signatureScript: `41${"00".repeat(65)}` };
    }
  };
  const inputs: unknown[] = Array.isArray((plan as any).inputs) ? (plan as any).inputs : [];
  if (inputs.length === 0) throw refuse("WALLET_SIGN_REQUEST_INVALID", "the plan has no inputs to sign. Nothing was signed.");
  const { resolveExecutionTarget } = await import("@hardkas/config");
  const target = (plan as any).execution || resolveExecutionTarget({ config: sdk.config.config, network: (plan as any).networkId as string }).target;
  let builtTxId: string | undefined;
  try {
    const built = await signTxPlanArtifact({
      target,
      planArtifact: plan,
      authorizers: Object.fromEntries(inputs.map((_, i) => [i, capture])),
      config: sdk.config.config,
      allowMainnet: false
    });
    builtTxId = String((built as any).txId);
  } catch (e) {
    // a refusal before the transaction was built (mainnet, a v1 plan, a covenant input…) is the signer's to say
    if (captured === undefined) throw e;
  }
  if (captured === undefined || (builtTxId !== undefined && builtTxId !== captured.id)) {
    throw refuse("WALLET_SIGN_REQUEST_INVALID", "the payment signer did not build one transaction for every input. Nothing was signed.");
  }
  return { txJsonString: captured.json, txId: captured.id, sighash: kaspaSighashInputsFromWasm(captured.object) };
}

/** Every input of a payment the wallet signs is the wallet's: its UTXO script is the P2PK script of the wallet's key. */
function assertInputsOwned(unsigned: UnsignedWalletTransaction, publicKey: string, address: string): void {
  const p2pk = `20${publicKey}ac`;
  unsigned.sighash.utxos.forEach((u, i) => {
    if (!u || u.scriptPublicKey.version !== 0 || u.scriptPublicKey.script.toLowerCase() !== p2pk) {
      throw refuse("WALLET_INPUT_NOT_OWNED", `input ${i} is not an output of ${address} (its script is not the P2PK script of that address's key): the wallet is not asked to sign it. Nothing was signed.`, { input: i, address });
    }
  });
}

/**
 * The full check of a wallet's signed transaction: what the page checks (the same transaction, every asked input with a
 * well-formed SIGHASH_ALL signature, nothing else changed) and, per asked input, a valid BIP340 signature by the request's
 * key over HardKAS's own signature hash of the transaction it built (WALLET_SIGNATURE_INVALID).
 */
export function verifyWalletSignedTransaction(input: {
  readonly request: WalletSignRequest;
  readonly returned: unknown;
  readonly sighash: UnsignedWalletTransaction["sighash"];
}): WalletSignatureCheck {
  let check: WalletSignatureCheck;
  try {
    check = checkWalletSignedTransaction(input.request.txJsonString, input.returned, input.request.signInputs.map((i) => i.index));
  } catch (e) {
    throw asHardkasError(e);
  }
  for (const { index } of input.request.signInputs) {
    const utxo = input.sighash.utxos[index];
    const valid =
      utxo !== undefined &&
      verifyKaspaInputSignature({ tx: input.sighash.tx, inputIndex: index, utxo, publicKey: input.request.publicKey, signature: check.signatures[index]! });
    if (!valid) {
      throw refuse(
        "WALLET_SIGNATURE_INVALID",
        `input ${index}'s signature is well formed but is not a valid SIGHASH_ALL signature by ${input.request.address} (key ${input.request.publicKey}) over the transaction HardKAS built: ` +
          "the wallet signed another transaction, or with another key. Nothing was signed or sent.",
        { input: index, address: input.request.address }
      );
    }
  }
  return check;
}

/**
 * A browser wallet's `signMessage` answer (any of the three shapes) verified with the managed kaspa-wasm's
 * `verifyMessage` against `address` (see wallets/message-signature.ts); refusals are HardkasError with the same codes.
 */
export function verifyWalletMessage(input: { readonly address: string; readonly message: string; readonly returned: unknown }): WalletMessageSignature & { readonly publicKey: string } {
  try {
    return verifyWalletMessageSignature({ kaspa: loadManagedKaspaWasmSync() as any, ...input });
  } catch (e) {
    throw asHardkasError(e);
  }
}

export interface WalletPaymentOptions {
  /** The wallet's P2PK address (the session's): it pays, and gets the change. */
  readonly address: string;
  readonly to: string;
  /** A string is KAS, a bigint is sompi (as `sdk.tx.plan`). */
  readonly amount: string | bigint;
  readonly feeRate?: bigint | undefined;
  readonly maxFeeSompi?: bigint | number | string | undefined;
}

/**
 * Plans a P2PK payment from a browser wallet's address (`sdk.tx.plan`, stored like any plan once signed) and the request
 * the page hands the wallet. Nothing is signed; no key is read (HardKAS holds none for the wallet).
 */
export async function prepareWalletPayment(sdk: Hardkas, options: WalletPaymentOptions): Promise<{ plan: TxPlanArtifact; request: WalletSignRequest }> {
  const networkId = assertWalletNetwork(sdk, options.address, "prepareWalletPayment");
  const publicKey = walletPublicKeyOf(options.address);
  const plan = await sdk.tx.plan({
    from: options.address,
    to: options.to,
    amount: options.amount,
    ...(options.feeRate !== undefined ? { feeRate: options.feeRate } : {}),
    ...(options.maxFeeSompi !== undefined ? { maxFeeSompi: options.maxFeeSompi } : {})
  });
  if ((plan as any).mode === "simulator") {
    throw refuse("WALLET_SIGN_REQUEST_INVALID", "the simulator's payments are not signed by a wallet: open the SDK on a node network (simnet, devnet, a testnet). Nothing was signed.");
  }
  const unsigned = await unsignedPaymentTransaction(sdk, plan);
  assertInputsOwned(unsigned, publicKey, options.address);
  const request: WalletSignRequest = {
    schema: WALLET_SIGN_REQUEST_SCHEMA,
    purpose: "payment",
    networkId,
    address: options.address,
    publicKey,
    txJsonString: unsigned.txJsonString,
    txId: unsigned.txId,
    signInputs: unsigned.sighash.utxos.map((_, index) => ({ index, sighashType: 1 as const })),
    autoFinalized: true,
    planArtifactId: String((plan as any).contentHash)
  };
  return { plan, request };
}

/**
 * Completes a wallet-signed payment: the request must be the plan's (rebuilt now), what the wallet returned is checked
 * in full, and the plan is signed through `sdk.tx.sign` with the wallet's signature scripts (the signed artifact stored).
 * Nothing is sent: send the result with `sdk.tx.send`.
 */
export async function completeWalletPayment(
  sdk: Hardkas,
  input: { readonly plan: TxPlanArtifact; readonly request: WalletSignRequest; readonly returned: unknown }
): Promise<{ signed: SignedTxArtifact; txId: string; check: WalletSignatureCheck }> {
  const { plan, request } = input;
  assertMainnetTransactionsDisabled("sign", [(plan as any)?.networkId, (plan as any)?.execution?.network, request?.networkId], "completeWalletPayment");
  if (request?.schema !== WALLET_SIGN_REQUEST_SCHEMA || request.purpose !== "payment") {
    throw refuse("WALLET_SIGN_REQUEST_INVALID", "not a HardKAS wallet payment request. Nothing was signed.");
  }
  assertWalletNetwork(sdk, request.address, "completeWalletPayment");
  if (request.planArtifactId !== (plan as any)?.contentHash || request.publicKey !== walletPublicKeyOf(request.address)) {
    throw refuse("WALLET_REQUEST_MISMATCH", "the request was not made for this plan and this address. Nothing was signed.");
  }
  const unsigned = await unsignedPaymentTransaction(sdk, plan);
  const allInputs = unsigned.sighash.utxos.map((_, i) => i);
  if (
    unsigned.txJsonString !== request.txJsonString ||
    unsigned.txId !== request.txId ||
    JSON.stringify(request.signInputs.map((i) => [i.index, i.sighashType])) !== JSON.stringify(allInputs.map((i) => [i, 1]))
  ) {
    throw refuse("WALLET_REQUEST_MISMATCH", `the request's transaction or inputs are not the ones the plan builds (${unsigned.txId}). Nothing was signed.`, { txId: unsigned.txId });
  }
  assertInputsOwned(unsigned, request.publicKey, request.address);
  const check = verifyWalletSignedTransaction({ request, returned: input.returned, sighash: unsigned.sighash });
  const authorizers = Object.fromEntries(allInputs.map((i) => [i, new StaticSignatureScriptAuthorizer(check.signatureScripts[i]!)]));
  const signed = await sdk.tx.sign(plan, { authorizers });
  if (String((signed as any).txId) !== request.txId) {
    throw refuse("WALLET_SIGNED_TRANSACTION_CHANGED", `the signed transaction is ${String((signed as any).txId)}, not the ${request.txId} the wallet signed. Do not send it.`, { txId: String((signed as any).txId) });
  }
  return { signed, txId: request.txId, check };
}
