/**
 * The escrow contract, SilverScript v1 (language 0.1.0, silverc v1.0.0).
 *
 * A two-of-three escrow on one P2SH output. Every branch needs two
 * signatures; the arbiter-assisted branches pay one fixed amount to one fixed
 * destination. Destinations are version-prefixed script public keys, the form
 * `tx.outputs[i].scriptPubKey` has in SilverScript.
 */
export const ESCROW_SOURCE = `pragma silverscript ^0.1.0;

// Two-of-three escrow on a single P2SH output. Each branch needs two signatures;
// the arbiter-assisted branches pay one fixed amount to one fixed destination.
contract Escrow(
    pubkey buyer,
    pubkey seller,
    pubkey arbiter,
    byte[] buyerSpk,
    byte[] sellerSpk,
    int refundAmount,
    int releaseAmount
) {
    entry mutualRelease(sig buyerSig, sig sellerSig) {
        require(checkSig(buyerSig, buyer));
        require(checkSig(sellerSig, seller));
    }

    entry refundBuyer(sig buyerSig, sig arbiterSig) {
        require(checkSig(buyerSig, buyer));
        require(checkSig(arbiterSig, arbiter));
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == buyerSpk);
        require(tx.outputs[0].value == refundAmount);
    }

    entry releaseToSeller(sig sellerSig, sig arbiterSig) {
        require(checkSig(sellerSig, seller));
        require(checkSig(arbiterSig, arbiter));
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == sellerSpk);
        require(tx.outputs[0].value == releaseAmount);
    }
}
`;

/** Contract declared in {@link ESCROW_SOURCE}. */
export const ESCROW_CONTRACT_NAME = "Escrow";

export type EscrowRole = "buyer" | "seller" | "arbiter";
export type EscrowBranch = "mutualRelease" | "refundBuyer" | "releaseToSeller";

/** Each branch's entry and its signers, in the entry's parameter order. */
export const ESCROW_BRANCHES: Readonly<Record<EscrowBranch, { readonly signers: readonly [EscrowRole, EscrowRole] }>> = {
  mutualRelease: { signers: ["buyer", "seller"] },
  refundBuyer: { signers: ["buyer", "arbiter"] },
  releaseToSeller: { signers: ["seller", "arbiter"] }
};
