import { ESCROW_BRANCHES, type EscrowBranch, type EscrowRole } from "./escrow-source.js";
import type { EscrowConfig } from "./types.js";

export { ESCROW_BRANCHES, type EscrowBranch, type EscrowRole } from "./escrow-source.js";

/**
 * What resolving an escrow through a branch requires, in the contract's terms.
 *
 * The spend itself is an ordinary SilverScript P2SH spend: prepare it with
 * `prepareSilverSpend` (@hardkas/accounts) using these signer slots and
 * outputs, have each signer `signSilverSpend`, then `finalizeSilverSpend`.
 * Nothing here signs or builds scripts.
 */
export interface EscrowResolution {
    readonly branch: EscrowBranch;
    /** The entry's `sig` arguments, as named signer slots in parameter order. */
    readonly args: readonly { readonly kind: "signer"; readonly signer: EscrowRole }[];
    /**
     * The outputs the contract enforces for this branch, or undefined when the
     * branch leaves the destination to the signers (mutualRelease).
     */
    readonly requiredOutputs?: readonly { readonly amountSompi: bigint; readonly scriptPublicKey: { readonly version: 0; readonly script: string } }[];
}

export function escrowResolution(config: EscrowConfig, branch: EscrowBranch): EscrowResolution {
    const spec = ESCROW_BRANCHES[branch];
    if (!spec) throw new Error(`ESCROW_BRANCH_UNKNOWN: '${branch}' is not an escrow branch`);
    const args = spec.signers.map((signer) => ({ kind: "signer" as const, signer }));
    const pay = (amount: bigint | string, spk: string) => [
        { amountSompi: BigInt(amount), scriptPublicKey: { version: 0 as const, script: spk.replace(/^0x/, "").toLowerCase() } }
    ];
    if (branch === "refundBuyer") return { branch, args, requiredOutputs: pay(config.refundAmount, config.buyerDestinationSpk) };
    if (branch === "releaseToSeller") return { branch, args, requiredOutputs: pay(config.releaseAmount, config.sellerDestinationSpk) };
    return { branch, args };
}

export function escrowSigners(branch: EscrowBranch): readonly EscrowRole[] {
    return ESCROW_BRANCHES[branch].signers;
}
