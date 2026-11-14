import { HardkasError, assertMainnetTransactionsDisabled, getNetworkPrefix, loadManagedKaspaWasmSync, redactUrlCredentialsInText } from "@hardkas/core";
import { covenantIdOf } from "@hardkas/tx-builder";
import { decodeNativePsktBundle } from "./native-sign-preflight.js";

/*
 * A1 (rc2 audit) · a Kaspa signature does not commit to a network, and a PSKT session is a document a counterparty hands
 * over: its `networkId` is only what that party wrote. A session labelled "testnet-10" whose PSKT spends a mainnet UTXO
 * of the signer's key passed every check, and the signature it produced was valid on mainnet. So, before any adapter
 * signs anything:
 *  - the caller states ITS OWN network (its workspace's, or one it chose explicitly), never read from the session
 *    (PSKT_SIGNER_NETWORK_REQUIRED), and it must be the session's (PSKT_NETWORK_MISMATCH); neither is mainnet;
 *  - the caller's node for that network must list every input to be signed as unspent (PSKT_INPUT_NOT_ON_NETWORK), as
 *    `tx.sign` requires of a plan; a node that cannot be asked, no node at all, or inputs that cannot be read from the
 *    payload leave the inputs unverified, and nothing is signed (PSKT_INPUTS_UNVERIFIED, fail closed).
 */

/** What a PSKT signer's node must answer: the unspent outputs it holds at an address. */
export interface PsktUtxoSource {
  getUtxosByAddress(address: string): Promise<ReadonlyArray<unknown>>;
}

/** The caller's side of a PSKT signature (A1): its own network and its node for that network. */
export interface PsktSignContext {
  /** The network the caller signs for: its workspace's, or one it chose explicitly. Never read from the session. */
  readonly networkId?: string | undefined;
  /** The caller's node for `networkId`; every input to be signed must be listed by it as unspent. */
  readonly node?: PsktUtxoSource | undefined;
}

const refuse = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, `${message} Nothing was signed.`, metadata ? { metadata } : undefined);

/**
 * Refuses (typed) a signature the caller's own network does not back: no caller network, a session for another
 * network, mainnet on either side. Pure: reads no key, contacts nothing.
 */
export function assertPsktSignerNetwork(sessionNetworkId: unknown, context: PsktSignContext | undefined, where = "pskt.signSession"): string {
  // MAINNET TOTAL LOCKDOWN first: the session's label, then the caller's network
  assertMainnetTransactionsDisabled("sign", [sessionNetworkId], where);
  const caller = context?.networkId;
  assertMainnetTransactionsDisabled("sign", [caller], `${where} (the caller's network)`);
  if (typeof caller !== "string" || caller.trim() === "") {
    throw refuse(
      "PSKT_SIGNER_NETWORK_REQUIRED",
      `A PSKT is signed only for the signer's own network (its workspace's, or one it names explicitly, e.g. --network), ` +
        `never for the network the session file declares: a signature does not commit to a network.`
    );
  }
  if (typeof sessionNetworkId !== "string" || caller.trim() !== sessionNetworkId.trim()) {
    throw refuse(
      "PSKT_NETWORK_MISMATCH",
      `This session declares network '${String(sessionNetworkId)}', but the signer's network is '${caller.trim()}'.`,
      { sessionNetworkId, signerNetworkId: caller.trim() }
    );
  }
  return caller.trim();
}

interface InputToCheck {
  readonly pskt: number;
  readonly input: number;
  readonly transactionId: string;
  readonly index: number;
  readonly address: string;
}

/** The address a UTXO entry's script ("<2-byte version hex><script hex>") pays, on `networkId`; undefined if none. */
function addressOfScript(scriptHex: unknown, networkId: string): string | undefined {
  if (typeof scriptHex !== "string" || !/^[0-9a-fA-F]{6,}$/.test(scriptHex) || scriptHex.length % 2 !== 0) return undefined;
  try {
    const k: any = loadManagedKaspaWasmSync();
    const spk = new k.ScriptPublicKey(parseInt(scriptHex.slice(0, 4), 16), scriptHex.slice(4));
    const address = k.addressFromScriptPublicKey(spk, getNetworkPrefix(networkId));
    return address ? String(address.toString()) : undefined;
  } catch {
    return undefined;
  }
}

/** The inputs to be signed, read from the payload: each one's outpoint and the address its UTXO pays. */
function inputsToCheck(payload: { format?: unknown; data?: unknown }, inputIndexes: readonly number[], networkId: string): InputToCheck[] {
  if (!Array.isArray(inputIndexes) || inputIndexes.length === 0) {
    throw refuse("PSKT_SIGNING_INPUTS_REQUIRED", "inputIndexes cannot be empty.");
  }
  if (new Set(inputIndexes).size !== inputIndexes.length || inputIndexes.some((i) => !Number.isSafeInteger(i) || i < 0)) {
    throw refuse("PSKT_SIGNING_INPUT_OUT_OF_RANGE", `inputIndexes ${JSON.stringify(inputIndexes)} must be distinct non-negative integers.`);
  }
  if (payload?.format !== "pskt-binary-base64") {
    throw refuse("PSKT_INPUTS_UNVERIFIED", `HardKAS cannot read the inputs of a '${String(payload?.format)}' payload, so it cannot check them on the signer's node.`);
  }
  let bundle: any[];
  try {
    bundle = decodeNativePsktBundle(String(payload.data ?? ""));
  } catch (e: any) {
    throw refuse("PSKT_INPUTS_UNVERIFIED", `HardKAS cannot read the inputs of this PSKT (${String(e?.message ?? e).replace(/ Nothing was signed\.$/, "")}), so it cannot check them on the signer's node.`);
  }
  const out: InputToCheck[] = [];
  for (const [n, inner] of bundle.entries()) {
    const inputs: any[] = inner.inputs;
    for (const i of inputIndexes) {
      if (i >= inputs.length) {
        throw refuse("PSKT_SIGNING_INPUT_OUT_OF_RANGE", `PSKT ${n} has ${inputs.length} input(s); input ${i} does not exist.`);
      }
      const entry = inputs[i];
      const transactionId = entry?.previousOutpoint?.transactionId;
      const index = entry?.previousOutpoint?.index;
      const address = addressOfScript(entry?.utxoEntry?.scriptPublicKey, networkId);
      if (typeof transactionId !== "string" || !/^[0-9a-fA-F]{64}$/.test(transactionId) || !Number.isSafeInteger(index) || index < 0 || !address) {
        throw refuse(
          "PSKT_INPUTS_UNVERIFIED",
          `PSKT ${n} input ${i} carries no readable outpoint or UTXO script, so HardKAS cannot check it on the signer's node.`,
          { pskt: n, input: i }
        );
      }
      out.push({ pskt: n, input: i, transactionId: transactionId.toLowerCase(), index, address });
    }
  }
  return out;
}

/**
 * A1: refuses unless the caller's node for its own network lists every input to be signed as unspent (and none as a
 * covenant's UTXO). Fail closed: no node, a node that cannot be asked or a payload whose inputs cannot be read refuse.
 * Call {@link assertPsktSignerNetwork} first; reads no key.
 */
export async function assertPsktInputsOnSignerNetwork(
  payload: { format?: unknown; data?: unknown },
  inputIndexes: readonly number[],
  networkId: string,
  node: PsktUtxoSource | undefined
): Promise<{ readonly checked: number }> {
  const toCheck = inputsToCheck(payload, inputIndexes, networkId);
  if (!node || typeof node.getUtxosByAddress !== "function") {
    throw refuse(
      "PSKT_INPUTS_UNVERIFIED",
      `No node of ${networkId} was given to check the inputs to be signed. A PSKT is signed only when the signer's own node ` +
        `lists every input it signs as unspent (a signature does not commit to a network: an input of another network, ` +
        `mainnet included, would be signed for that network).`,
      { networkId }
    );
  }
  const byAddress = new Map<string, InputToCheck[]>();
  for (const c of toCheck) byAddress.set(c.address, [...(byAddress.get(c.address) ?? []), c]);
  const missing: string[] = [];
  const covenant: string[] = [];
  for (const [address, group] of byAddress) {
    let listed: ReadonlyArray<any>;
    try {
      listed = (await node.getUtxosByAddress(address)) ?? [];
    } catch (e: unknown) {
      throw refuse(
        "PSKT_INPUTS_UNVERIFIED",
        `The node of ${networkId} could not be asked what the inputs at ${address} are ` +
          `(${redactUrlCredentialsInText(e instanceof Error ? e.message : String(e))}).`,
        { networkId, address }
      );
    }
    const byOutpoint = new Map(listed.map((u: any) => [`${String(u?.outpoint?.transactionId).toLowerCase()}:${Number(u?.outpoint?.index)}`, u]));
    for (const c of group) {
      const found = byOutpoint.get(`${c.transactionId}:${c.index}`);
      const label = `PSKT ${c.pskt} input ${c.input} (${c.transactionId}:${c.index})`;
      if (found === undefined) missing.push(label);
      else if (covenantIdOf(found) !== undefined) covenant.push(label);
    }
  }
  if (covenant.length > 0) {
    throw refuse("COVENANT_UTXO_NOT_PAYMENT_INPUT", `The node of ${networkId} lists ${covenant.join(", ")} as a covenant's UTXO; the PSKT signer signs payments only.`);
  }
  if (missing.length > 0) {
    throw refuse(
      "PSKT_INPUT_NOT_ON_NETWORK",
      `The node of ${networkId} does not list ${missing.length} input(s) to be signed as unspent: ${missing.join(", ")}. ` +
        `It may be spent, not accepted yet, or an output of another network (mainnet included); a signature would be valid wherever it exists.`,
      { networkId, inputs: missing }
    );
  }
  return { checked: toCheck.length };
}
