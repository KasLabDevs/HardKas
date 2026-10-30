import {
  ESCROW_FULL_BRANCHES,
  ESCROW_SPLIT_BRANCHES,
  type EscrowBranch,
  type EscrowRole
} from "./escrow-source.js";
import type { EscrowConfig } from "./types.js";

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

export function escrowResolution(
  config: EscrowConfig,
  branch: EscrowBranch,
  options?: EscrowResolutionOptions
): EscrowResolution {
    const isLegacy = config.version === "v1" || (!config.version && !config.principal && !config.mode);
    const mode = config.mode ?? (config.buyerAmount !== undefined && config.sellerAmount !== undefined ? "split" : "full");

    const pay = (amount: bigint | string, spk: string) => ({
        amountSompi: BigInt(amount),
        scriptPublicKey: { version: 0 as const, script: spk.replace(/^0x/, "").toLowerCase() }
    });

    if (isLegacy) {
      const spec = ESCROW_FULL_BRANCHES[branch as keyof typeof ESCROW_FULL_BRANCHES];
      if (!spec) throw new Error(`ESCROW_BRANCH_UNKNOWN: '${branch}' is not an escrow branch`);
      const args = spec.signers.map((signer) => ({ kind: "signer" as const, signer }));
      if (branch === "refundBuyer") {
        return { branch, args, requiredOutputs: [pay(config.refundAmount!, config.buyerDestinationSpk)] };
      }
      if (branch === "releaseToSeller") {
        return { branch, args, requiredOutputs: [pay(config.releaseAmount!, config.sellerDestinationSpk)] };
      }
      return { branch, args };
    }

    if (mode === "split") {
      const spec = ESCROW_SPLIT_BRANCHES[branch as keyof typeof ESCROW_SPLIT_BRANCHES];
      if (!spec) throw new Error(`ESCROW_BRANCH_UNKNOWN: '${branch}' is not an escrow branch`);
      const args = spec.signers.map((signer) => ({ kind: "signer" as const, signer }));
      const bAmt = BigInt(config.buyerAmount ?? config.refundAmount ?? 0n);
      const sAmt = BigInt(config.sellerAmount ?? config.releaseAmount ?? 0n);

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
    const principal = BigInt(config.principal ?? (branch === "releaseToSeller" ? config.releaseAmount : config.refundAmount) ?? 0n);

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
