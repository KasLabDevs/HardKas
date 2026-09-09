import { parseKasToSompi } from "@hardkas/core";
import crypto from "node:crypto";
// @ts-ignore
import kaspaWasm from "kaspa-wasm";

export interface MultisigIdentity {
  name: string;
  privateKeyHex: string;
  publicKeyHex: string;
  fullPublicKeyHex: string;
}

export async function generateIdentities(): Promise<{ alice: MultisigIdentity, bob: MultisigIdentity, charlie: MultisigIdentity }> {
  // Deterministic generation for the lab
  const generateDeterministic = (name: string): MultisigIdentity => {
    const hash = crypto.createHash("sha256").update(`bl-001-offline-multisig-${name}`).digest();
    const privKey = new kaspaWasm.PrivateKey(hash.toString("hex"));
    const pubKeyCompressed = privKey.toKeypair().publicKey;
    // We use 32-byte x-only public keys for Schnorr
    const publicKeyHex = pubKeyCompressed.length === 66 ? pubKeyCompressed.substring(2) : pubKeyCompressed;
    return {
      name,
      privateKeyHex: privKey.toString(),
      publicKeyHex,
      fullPublicKeyHex: pubKeyCompressed
    };
  };

  return {
    alice: generateDeterministic("Alice"),
    bob: generateDeterministic("Bob"),
    charlie: generateDeterministic("Charlie")
  };
}

export function createCanonicalMultisig(identities: MultisigIdentity[], threshold: number, networkId: string = "simnet") {
  // MUST sort by the 33-byte key to match rust BTreeMap<secp256k1::PublicKey, Signature>
  const sortedPubKeys = [...identities]
    .sort((a, b) => a.fullPublicKeyHex.localeCompare(b.fullPublicKeyHex))
    .map(id => id.publicKeyHex);

  // 2-of-3 Multisig script: OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG
  // OP_2 = 0x52, OP_3 = 0x53, OP_CHECKMULTISIG = 0xae
  // For 32-byte pubkeys, the push opcode is 0x20 (32)
  const redeemScriptHex = 
    "52" + // OP_2
    "20" + sortedPubKeys[0] +
    "20" + sortedPubKeys[1] +
    "20" + sortedPubKeys[2] +
    "53" + // OP_3
    "ae";  // OP_CHECKMULTISIG

  // KIP-39 draft expects 102 bytes for 2-of-3 with 32-byte Schnorr pubkeys
  const scriptBytes = Buffer.from(redeemScriptHex, "hex");
  if (scriptBytes.length !== 102) {
    throw new Error(`Expected 102 bytes for redeem script, got ${scriptBytes.length}`);
  }

  // P2SH address requires sha256 of the redeem script
  const scriptHash = crypto.createHash('sha256').update(scriptBytes).digest();
  
  // Actually, to get a proper address we can just use kaspaWasm.Address if it takes a ScriptPublicKey.
  // But we can also use kaspaWasm.Address for P2SH directly if supported, or just mock it since the lab focuses on PSKT orchestration.
  // We'll create a fake/mock Kaspa address format for simplicity in the lab if needed, or use a known derivation.
  const p2shAddress = "kaspa:" + scriptHash.toString("hex").substring(0, 42); // Mocked address representation for the lab

  return {
    threshold,
    cosigners: sortedPubKeys,
    redeemScriptHex,
    p2shAddress
  };
}
