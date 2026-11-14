import {
  ESCROW_FULL_BRANCHES,
  ESCROW_SPLIT_BRANCHES,
  type EscrowBranch,
  type EscrowRole
} from "./escrow-source.js";
import type { EscrowConfig } from "./types.js";
import { escrowTermsOf } from "./create-escrow.js";

export { ESCROW_FULL_BRANCHES, ESCROW_SPLIT_BRANCHES, type EscrowBranch, type EscrowRole } from "./escrow-source.js";

export interface EscrowResolutionOptions {
  /** For mutualRelease: custom sompi allocation between buyer and seller */
  readonly mutualSplit?: { readonly buyerSompi: bigint; readonly sellerSompi: bigint };
}

export interface EscrowResolution {
    readonly branch: EscrowBranch;
    readonly contractName?: string;
    readonly args: readonly { readonly kind: "signer"; readonly signer: EscrowRole }[];
    readonly requiredOutputs?: readonly { readonly amountSompi: bigint; readonly scriptPublicKey: { readonly version: 0; readonly script: string } }[];
}

/**
 * The arguments and the outputs a branch of the escrow `config` describes must have. The config is read by
 * escrowTermsOf, as createEscrow reads it to compile the contract (C-10): no `version` is v2 (EscrowFull, or EscrowSplit
 * with both split amounts), a legacy v1 escrow says `version: "v1"`; a v2 full config naming different amounts for its
 * principal is ESCROW_CONFIG_INVALID here as it is at creation.
 */
export function escrowResolution(
  config: EscrowConfig,
  branch: EscrowBranch,
  options?: EscrowResolutionOptions
): EscrowResolution {
    const terms = escrowTermsOf(config);

    const pay = (amount: bigint | string, spk: string) => ({
        amountSompi: BigInt(amount),
        scriptPublicKey: { version: 0 as const, script: spk.replace(/^0x/, "").toLowerCase() }
    });

    if (terms.version === "v1") {
      const spec = ESCROW_FULL_BRANCHES[branch as keyof typeof ESCROW_FULL_BRANCHES];
      if (!spec) throw new Error(`ESCROW_BRANCH_UNKNOWN: '${branch}' is not an escrow branch`);
      const args = spec.signers.map((signer) => ({ kind: "signer" as const, signer }));
      if (branch === "refundBuyer") {
        return { branch, args, requiredOutputs: [pay(terms.refundAmount!, config.buyerDestinationSpk)] };
      }
      if (branch === "releaseToSeller") {
        return { branch, args, requiredOutputs: [pay(terms.releaseAmount!, config.sellerDestinationSpk)] };
      }
      return { branch, args };
    }

    if (terms.mode === "split") {
      const spec = ESCROW_SPLIT_BRANCHES[branch as keyof typeof ESCROW_SPLIT_BRANCHES];
      if (!spec) throw new Error(`ESCROW_BRANCH_UNKNOWN: '${branch}' is not an escrow branch`);
      const args = spec.signers.map((signer) => ({ kind: "signer" as const, signer }));
      const bAmt = terms.buyerAmount!;
      const sAmt = terms.sellerAmount!;

      if (branch === "executeSplit") {
        return {
          branch,
          args,
          requiredOutputs: [pay(bAmt, config.buyerDestinationSpk), pay(sAmt, config.sellerDestinationSpk)]
        };
      }
      if (branch === "fullRefund") {
        return {
          branch,
          args,
          requiredOutputs: [pay(bAmt + sAmt, config.buyerDestinationSpk)]
        };
      }
      if (branch === "fullRelease") {
        return {
          branch,
          args,
          requiredOutputs: [pay(bAmt + sAmt, config.sellerDestinationSpk)]
        };
      }
      if (branch === "mutualRelease") {
        const split = options?.mutualSplit ?? { buyerSompi: bAmt, sellerSompi: sAmt };
        if (split.buyerSompi + split.sellerSompi !== bAmt + sAmt) {
          throw new Error(`ESCROW_SPLIT_SUM_MISMATCH: mutual split (${split.buyerSompi} + ${split.sellerSompi}) must equal total principal (${bAmt + sAmt})`);
        }
        return {
          branch,
          args,
          requiredOutputs: [pay(split.buyerSompi, config.buyerDestinationSpk), pay(split.sellerSompi, config.sellerDestinationSpk)]
        };
      }
    }

    // V2 Full mode
    const spec = ESCROW_FULL_BRANCHES[branch as keyof typeof ESCROW_FULL_BRANCHES];
    if (!spec) throw new Error(`ESCROW_BRANCH_UNKNOWN: '${branch}' is not an escrow branch`);
    const args = spec.signers.map((signer) => ({ kind: "signer" as const, signer }));
    // the one principal the contract was compiled with (escrowTermsOf: the same for every branch)
    const principal = terms.principal!;

    if (branch === "releaseToSeller") {
      return {
        branch,
        args,
        requiredOutputs: [pay(principal, config.sellerDestinationSpk)]
      };
    }
    if (branch === "refundBuyer") {
      return {
        branch,
        args,
        requiredOutputs: [pay(principal, config.buyerDestinationSpk)]
      };
    }
    if (branch === "mutualRelease") {
      if (options?.mutualSplit) {
        const { buyerSompi, sellerSompi } = options.mutualSplit;
        if (buyerSompi + sellerSompi !== principal) {
          throw new Error(`ESCROW_SPLIT_SUM_MISMATCH: mutual split (${buyerSompi} + ${sellerSompi}) must equal principal (${principal})`);
        }
        if (sellerSompi === 0n) {
          return { branch, args, requiredOutputs: [pay(buyerSompi, config.buyerDestinationSpk)] };
        }
        if (buyerSompi === 0n) {
          return { branch, args, requiredOutputs: [pay(sellerSompi, config.sellerDestinationSpk)] };
        }
        return {
          branch,
          args,
          requiredOutputs: [pay(buyerSompi, config.buyerDestinationSpk), pay(sellerSompi, config.sellerDestinationSpk)]
        };
      }
      // Default: 50/50 split of principal
      const half = principal / 2n;
      const otherHalf = principal - half;
      return {
        branch,
        args,
        requiredOutputs: [pay(half, config.buyerDestinationSpk), pay(otherHalf, config.sellerDestinationSpk)]
      };
    }

    throw new Error(`ESCROW_BRANCH_UNHANDLED: branch ${branch}`);
}

export function escrowSigners(branch: EscrowBranch, mode: "full" | "split" = "full"): readonly EscrowRole[] {
    const branches = mode === "split" ? ESCROW_SPLIT_BRANCHES : ESCROW_FULL_BRANCHES;
    return (branches as any)[branch]?.signers ?? ["buyer", "seller"];
}
