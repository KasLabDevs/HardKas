import { sha256 } from "@noble/hashes/sha2.js";
import { schnorr } from "@noble/curves/secp256k1";
import { encodeKaspaAddress } from "./bech32.js";
import { bytesToHex, signKaspaInput, type KaspaSighashTransaction, type KaspaSighashUtxo } from "./kaspa-sighash.js";
import type { DevAccount, NetworkId } from "../types.js";

const SIMULATOR_SEED = "hardkas-simulator-dev-seed-v1";

export const DEV_ACCOUNT_NAMES = ["alice", "bob", "carol", "dave", "erin", "miner"] as const;
export type DevAccountName = (typeof DEV_ACCOUNT_NAMES)[number];

export function getNetworkPrefix(networkId: NetworkId = "simnet"): string {
  switch (networkId) {
    case "mainnet":
      return "kaspa";
    case "testnet-10":
    case "testnet-11":
      return "kaspatest";
    case "devnet":
      return "kaspadev";
    case "simnet":
    default:
      return "kaspasim";
  }
}

export function p2pkScriptFromPublicKey(publicKeyHex: string): string {
  const clean = publicKeyHex.toLowerCase().replace(/^0x/, "");
  if (clean.length !== 64) {
    throw new Error(`Invalid public key length for P2PK: expected 64 hex chars (32 bytes), got ${clean.length}`);
  }
  return `20${clean}ac`;
}

/**
 * Derives a deterministic dev account with real Schnorr keys and authentic Kaspa Bech32 address.
 */
export function deriveAccountFromSeed(name: string, index: number, networkId: NetworkId = "simnet"): DevAccount {
  const seedBytes = new TextEncoder().encode(`${SIMULATOR_SEED}-${name}-${index}`);
  const privBytes = sha256(seedBytes);
  const privateKey = bytesToHex(privBytes);

  // 32-byte x-only Schnorr public key
  const pubBytes = schnorr.getPublicKey(privBytes);
  const publicKey = bytesToHex(pubBytes);

  const prefix = getNetworkPrefix(networkId);
  const address = encodeKaspaAddress(prefix, 0, pubBytes);
  const scriptPublicKey = p2pkScriptFromPublicKey(publicKey);

  return {
    name,
    address,
    publicKey,
    privateKey,
    scriptPublicKey
  };
}

export function createDefaultDevAccounts(networkId: NetworkId = "simnet"): Record<DevAccountName, DevAccount> {
  const accounts: Partial<Record<DevAccountName, DevAccount>> = {};
  for (let i = 0; i < DEV_ACCOUNT_NAMES.length; i++) {
    const name = DEV_ACCOUNT_NAMES[i]!;
    accounts[name] = deriveAccountFromSeed(name, i, networkId);
  }
  return accounts as Record<DevAccountName, DevAccount>;
}

/**
 * Signs a transaction input using a DevAccount's private key.
 * Returns the unlock signatureScript: "41" + signature (65 bytes hex).
 */
export function signInputForAccount(
  account: DevAccount,
  tx: any,
  inputIndex: number,
  utxoOrUtxos: any
): string {
  const utxoObj = Array.isArray(utxoOrUtxos) ? utxoOrUtxos[0] : utxoOrUtxos;
  const utxo: KaspaSighashUtxo = {
    amount: BigInt(utxoObj.amountSompi ?? utxoObj.amount ?? utxoObj.utxoEntry?.amount ?? 0),
    scriptPublicKey: {
      version: utxoObj.scriptPublicKey?.version ?? 0,
      script: typeof utxoObj.scriptPublicKey === "string"
        ? utxoObj.scriptPublicKey
        : (utxoObj.scriptPublicKey?.scriptPublicKey ?? utxoObj.scriptPublicKey?.script ?? "")
    }
  };

  const sighashTx: KaspaSighashTransaction = {
    version: tx.version ?? 0,
    inputs: tx.inputs.map((inp: any) => ({
      transactionId: inp.previousOutpoint?.transactionId ?? inp.transactionId,
      index: inp.previousOutpoint?.index ?? inp.index ?? 0,
      sequence: BigInt(inp.sequence ?? 0),
      sigOpCount: inp.sigOpCount ?? 1
    })),
    outputs: tx.outputs.map((out: any) => ({
      value: BigInt(out.amount ?? out.value),
      scriptPublicKey: {
        version: out.scriptPublicKey?.version ?? 0,
        script: typeof out.scriptPublicKey === "string"
          ? out.scriptPublicKey
          : (out.scriptPublicKey?.scriptPublicKey ?? out.scriptPublicKey?.script ?? "")
      },
      ...(out.covenant ? { covenant: out.covenant } : {})
    })),
    lockTime: BigInt(tx.lockTime ?? 0),
    subnetworkId: tx.subnetworkId ?? "00".repeat(20),
    gas: BigInt(tx.gas ?? 0),
    payload: tx.payload ?? ""
  };

  // SIM-15: a signing failure is an error; it used to become a zero signature, which only failed later and elsewhere
  const sig65Hex = signKaspaInput(sighashTx, inputIndex, utxo, account.privateKey);
  const unlockScript = `41${sig65Hex}`;
  if (tx.inputs && tx.inputs[inputIndex]) {
    tx.inputs[inputIndex].signatureScript = unlockScript;
  }
  return unlockScript;
}
