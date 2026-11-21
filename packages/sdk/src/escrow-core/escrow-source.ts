/**
 * The escrow contracts, SilverScript v1 (language 0.1.0, silverc v1.0.0).
 *
 * Supports two distinct economic models:
 * 1. EscrowFull: Full Purchase Mode (single principal P).
 * 2. EscrowSplit: Split Mode (pre-allocated buyer and seller amounts).
 * Also maintains legacy Escrow (v1) for backward compatibility and safe recovery.
 */

/**
 * EscrowFull: Two-of-three escrow on a single P2SH output for a single principal.
 * Every arbiter-assisted branch pays the 100% principal to one destination.
 * Mutual release allows amicable settlement where outputs sum exactly to principal.
 * Committed escrowNonce guarantees unique P2SH address per order.
 */
export const ESCROW_FULL_SOURCE = `pragma silverscript ^0.1.0;

contract EscrowFull(
    pubkey buyer,
    pubkey seller,
    pubkey arbiter,
    byte[] buyerSpk,
    byte[] sellerSpk,
    int principal,
    byte[] escrowNonce
) {
    entry releaseToSeller(sig sellerSig, sig arbiterSig) {
        require(checkSig(sellerSig, seller));
        require(checkSig(arbiterSig, arbiter));
        require(escrowNonce.length == 32);
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == sellerSpk);
        require(tx.outputs[0].value == principal);
    }

    entry refundBuyer(sig buyerSig, sig arbiterSig) {
        require(checkSig(buyerSig, buyer));
        require(checkSig(arbiterSig, arbiter));
        require(escrowNonce.length == 32);
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == buyerSpk);
        require(tx.outputs[0].value == principal);
    }

    entry mutualRelease(sig buyerSig, sig sellerSig) {
        require(checkSig(buyerSig, buyer));
        require(checkSig(sellerSig, seller));
        require(escrowNonce.length == 32);
        if (tx.outputs.length == 1) {
            require(tx.outputs[0].value == principal);
            require(tx.outputs[0].scriptPubKey == buyerSpk || tx.outputs[0].scriptPubKey == sellerSpk);
        } else {
            require(tx.outputs.length == 2);
            require(tx.outputs[0].scriptPubKey == buyerSpk);
            require(tx.outputs[1].scriptPubKey == sellerSpk);
            require(tx.outputs[0].value + tx.outputs[1].value == principal);
        }
    }
}
`;

/**
 * EscrowSplit: Two-of-three escrow with two pre-allocated target amounts.
 * Arbitrated executeSplit distributes both amounts simultaneously (2 outputs).
 * Full refund or release awards total deposit (1 output).
 */
export const ESCROW_SPLIT_SOURCE = `pragma silverscript ^0.1.0;

contract EscrowSplit(
    pubkey buyer,
    pubkey seller,
    pubkey arbiter,
    byte[] buyerSpk,
    byte[] sellerSpk,
    int buyerAmount,
    int sellerAmount,
    byte[] escrowNonce
) {
    entry executeSplit(sig partySig, sig arbiterSig) {
        require(checkSig(arbiterSig, arbiter));
        require(checkSig(partySig, buyer) || checkSig(partySig, seller));
        require(escrowNonce.length == 32);
        require(tx.outputs.length == 2);
        require(tx.outputs[0].scriptPubKey == buyerSpk);
        require(tx.outputs[0].value == buyerAmount);
        require(tx.outputs[1].scriptPubKey == sellerSpk);
        require(tx.outputs[1].value == sellerAmount);
    }

    entry fullRefund(sig buyerSig, sig arbiterSig) {
        require(checkSig(buyerSig, buyer));
        require(checkSig(arbiterSig, arbiter));
        require(escrowNonce.length == 32);
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == buyerSpk);
        require(tx.outputs[0].value == buyerAmount + sellerAmount);
    }

    entry fullRelease(sig sellerSig, sig arbiterSig) {
        require(checkSig(sellerSig, seller));
        require(checkSig(arbiterSig, arbiter));
        require(escrowNonce.length == 32);
        require(tx.outputs.length == 1);
        require(tx.outputs[0].scriptPubKey == sellerSpk);
        require(tx.outputs[0].value == buyerAmount + sellerAmount);
    }

    entry mutualRelease(sig buyerSig, sig sellerSig) {
        require(checkSig(buyerSig, buyer));
        require(checkSig(sellerSig, seller));
        require(escrowNonce.length == 32);
        require(tx.outputs.length == 2);
        require(tx.outputs[0].scriptPubKey == buyerSpk);
        require(tx.outputs[1].scriptPubKey == sellerSpk);
        require(tx.outputs[0].value + tx.outputs[1].value == buyerAmount + sellerAmount);
    }
}
`;

/** Legacy v1 contract source for backward compatibility and safe recovery. */
export const ESCROW_V1_SOURCE = `pragma silverscript ^0.1.0;

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

/** Default source is EscrowFull in v2. */
export const ESCROW_SOURCE = ESCROW_FULL_SOURCE;
export const ESCROW_CONTRACT_NAME = "EscrowFull";
export const ESCROW_SPLIT_CONTRACT_NAME = "EscrowSplit";
export const ESCROW_V1_CONTRACT_NAME = "Escrow";

export type EscrowRole = "buyer" | "seller" | "arbiter";
export type EscrowFullBranch = "mutualRelease" | "refundBuyer" | "releaseToSeller";
export type EscrowSplitBranch = "executeSplit" | "fullRefund" | "fullRelease" | "mutualRelease";
export type EscrowBranch = EscrowFullBranch | EscrowSplitBranch;

export const ESCROW_FULL_BRANCHES: Readonly<Record<EscrowFullBranch, { readonly signers: readonly [EscrowRole, EscrowRole] }>> = {
  mutualRelease: { signers: ["buyer", "seller"] },
  refundBuyer: { signers: ["buyer", "arbiter"] },
  releaseToSeller: { signers: ["seller", "arbiter"] }
};

export const ESCROW_SPLIT_BRANCHES: Readonly<Record<EscrowSplitBranch, { readonly signers: readonly [EscrowRole, EscrowRole] }>> = {
  executeSplit: { signers: ["buyer", "arbiter"] },
  fullRefund: { signers: ["buyer", "arbiter"] },
  fullRelease: { signers: ["seller", "arbiter"] },
  mutualRelease: { signers: ["buyer", "seller"] }
};

export const ESCROW_BRANCHES = ESCROW_FULL_BRANCHES;
