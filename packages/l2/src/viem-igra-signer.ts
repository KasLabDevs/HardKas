import { IgraTxSigner, IgraTxSigningInput, IgraTxSigningResult } from "./igra-signer.js";
import { EvmSignerChainMismatchError, L2SafetyError } from "./errors.js";
import { assertFeeWithinLimits, assertL2WriteAllowed, resolveFeeLimits } from "./network-guard.js";

export interface ViemIgraTxSignerOptions {
  /**
   * Optional custom loader for viem main package.
   * Useful for testing without real viem dependency.
   */
  readonly viemLoader?: () => Promise<any>;

  /**
   * Optional custom loader for viem/accounts package.
   */
  readonly accountsLoader?: () => Promise<any>;
}

/**
 * Real EVM-compatible signer adapter for Igra L2 transactions using viem.
 */
export class ViemIgraTxSigner implements IgraTxSigner {
  private readonly viemLoader: () => Promise<any>;
  private readonly accountsLoader: () => Promise<any>;

  constructor(options?: ViemIgraTxSignerOptions) {
    this.viemLoader = options?.viemLoader || (() => import("viem"));
    this.accountsLoader = options?.accountsLoader || (() => import("viem/accounts"));
  }

  async getAddress(): Promise<string> {
    // This method is primarily for generic signer discovery.
    // In this flow, the address is resolved from the account store.
    throw new Error("ViemIgraTxSigner requires explicit account input for signing.");
  }

  async sign(input: IgraTxSigningInput): Promise<IgraTxSigningResult> {
    const { plan, account } = input;

    // 1. Basic Schema & Status Validation
    if (plan.schema !== "hardkas.igraTxPlan.v1") {
      throw new Error(
        `Invalid plan schema: ${plan.schema}. Expected hardkas.igraTxPlan.v1`
      );
    }
    if (plan.status !== "built") {
      throw new Error(
        `Plan must be in 'built' status to be signed. Current: ${plan.status}`
      );
    }

    // 2. Account & Private Key Validation
    if (!account) {
      throw new Error("Signer requires an account input.");
    }
    if (!account.privateKey) {
      throw new Error(
        `Account '${account.name}' has no private key available for signing.`
      );
    }

    // 3. Address Guardrail
    if (!account.address || !account.address.startsWith("0x")) {
      throw new Error("Igra L2 signing requires an EVM 0x account address.");
    }

    // 4. Address Match Validation
    if (
      plan.request.from &&
      plan.request.from.toLowerCase() !== account.address.toLowerCase()
    ) {
      throw new Error(
        `Account address '${account.address}' does not match plan 'from' address '${plan.request.from}'.`
      );
    }

    // 5. Plan Completeness Check (Gas & Nonce)
    if (plan.request.gasLimit === undefined || plan.request.gasLimit === null) {
      throw new Error(
        "Igra transaction plan is incomplete. Rebuild the plan with gas limit."
      );
    }
    if (plan.request.gasPriceWei === undefined || plan.request.gasPriceWei === null) {
      throw new Error(
        "Igra transaction plan is incomplete. Rebuild the plan with gas price."
      );
    }
    if (plan.request.nonce === undefined || plan.request.nonce === null) {
      throw new Error(
        "Igra transaction plan is incomplete. Rebuild the plan with nonce."
      );
    }

    // 5b. Network binding: chain, mainnet authorization and fee ceilings are mandatory.
    const guard = input.guard;
    if (!guard) {
      throw new L2SafetyError(
        "L2_CHAIN_ID_REQUIRED",
        "Igra plan signing requires a network guard (expectedChainId from the selected profile)."
      );
    }
    if (plan.chainId !== guard.expectedChainId) {
      throw new EvmSignerChainMismatchError(guard.expectedChainId, plan.chainId);
    }
    assertL2WriteAllowed({
      chainId: plan.chainId,
      profile: guard.profile,
      allowMainnet: guard.allowMainnet,
      operation: "l2 tx sign"
    });
    const gasLimit = BigInt(plan.request.gasLimit);
    const gasPrice = BigInt(plan.request.gasPriceWei);
    assertFeeWithinLimits(
      { gasLimit, feePerGasWei: gasPrice },
      resolveFeeLimits(guard.feeLimits, guard.profile?.feePolicy)
    );

    // 6. Private Key Normalization & Validation
    let normalizedPk = account.privateKey;
    if (!normalizedPk.startsWith("0x")) {
      normalizedPk = `0x${normalizedPk}`;
    }

    // Simple hex validation (64 chars + 0x)
    const pkRegex = /^0x[a-fA-F0-9]{64}$/;
    if (!pkRegex.test(normalizedPk)) {
      throw new Error(`Invalid EVM private key format for account '${account.name}'.`);
    }

    // 7. Load Dependencies
    let viem: any;
    let accounts: any;
    try {
      viem = await this.viemLoader();
      accounts = await this.accountsLoader();
    } catch (e) {
      throw new Error(
        "EVM signing dependency (viem) is not installed. Install viem to enable Igra L2 signing."
      );
    }

    // 8. Perform Signing
    let signed: `0x${string}`;
    try {
      const viemAccount = accounts.privateKeyToAccount(normalizedPk);

      signed = await viemAccount.signTransaction({
        chainId: plan.chainId,
        to: plan.request.to as `0x${string}`,
        data: plan.request.data as `0x${string}`,
        value: BigInt(plan.request.valueWei),
        gas: gasLimit,
        gasPrice,
        nonce: Number(plan.request.nonce)
      });
    } catch (e) {
      // Re-throw without leaking private key
      throw new Error(
        `Igra signing failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    // 9. The serialized transaction must carry the bound chain ID.
    if (typeof viem.parseTransaction === "function") {
      const decoded = viem.parseTransaction(signed);
      if (decoded.chainId !== guard.expectedChainId) {
        throw new L2SafetyError(
          "L2_SIGNED_TX_MISMATCH",
          `Serialized transaction chain ID ${String(decoded.chainId)} differs from bound chain ${guard.expectedChainId}.`
        );
      }
    }

    return {
      rawTransaction: signed,
      txHash: viem.keccak256 ? viem.keccak256(signed) : undefined
    };
  }
}
