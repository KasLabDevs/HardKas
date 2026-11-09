import { TxPlanArtifact, recomputeDeclaredContentHash } from "@hardkas/artifacts";
import {
  HardkasKaspaAccount,
  HardkasTxPlanSigner,
  SignTxPlanInput,
  SignTxPlanResult,
  HardkasSignerKind
} from "./types.js";
import { NetworkId, getNetworkPrefix, assertMainnetTransactionsDisabled } from "@hardkas/core";
import { loadKaspaWasm, WasmProviderConfig } from "./signer-backend.js";
import { KeystoreManager } from "./keystore.js";
import { DEV_ACCOUNTS_PASSWORD } from "./dev-accounts.js";
import { parseWasmTxToRpc } from "./internal/wasm-rpc-serialization.js";
import { createBalancedTransaction, toWasmScriptPublicKey } from "./wasm-transaction.js";
import { ecdsaSpendNotSupported, isEcdsaP2pkScript, kaspaAddressVersion } from "@hardkas/tx-builder";

export interface KaspaWasmSignerOptions {
  account?: HardkasKaspaAccount;
  /** @deprecated HK-12: has no effect; mainnet signing stays disabled (MAINNET_TRANSACTIONS_ENABLED). */
  allowMainnet?: boolean;
  wasmConfig?: WasmProviderConfig;
  /** The password of the account's keystore, in memory only: never stored, logged or echoed. */
  keystorePassword?: string;
}

const keystoreError = (code: string, message: string) => Object.assign(new Error(`${code}: ${message}`), { code });

/**
 * Opens the keystore of `account` and returns its private key. A development account (marked by the
 * resolver for `.hardkas/dev-accounts/`) opens with the published development password; any other
 * keystore only with `password`, its owner's, given explicitly. Nothing is tried silently: a missing
 * password is KEYSTORE_PASSWORD_REQUIRED, one that does not open the keystore KEYSTORE_PASSWORD_INVALID.
 */
export async function unlockAccountKeystore(
  account: { name: string; keystorePath: string; keystoreKind?: "dev-account" | undefined },
  password: string | undefined
): Promise<string> {
  const devAccount = account.keystoreKind === "dev-account";
  const secret = devAccount ? DEV_ACCOUNTS_PASSWORD : password;
  if (!secret) {
    throw keystoreError("KEYSTORE_PASSWORD_REQUIRED", `account '${account.name}' is an encrypted keystore and no password was given to open it.`);
  }
  const keystore = await KeystoreManager.loadEncryptedKeystore(account.keystorePath);
  const unlock = await KeystoreManager.decryptEncryptedKeystore(keystore, secret);
  if (!unlock.success || !unlock.payload?.privateKey) {
    throw devAccount
      ? keystoreError("DEV_ACCOUNT_KEY_UNAVAILABLE", `the development keystore of account '${account.name}' does not open.`)
      : keystoreError("KEYSTORE_PASSWORD_INVALID", `the password does not open the keystore of account '${account.name}' (wrong password, or a damaged keystore).`);
  }
  return unlock.payload.privateKey;
}

/**
 * SILVER-KEYS-1: the private key of a local account, in the one order every HardKAS signer follows: the variable its
 * `privateKeyEnv` names; else its plaintext key (a legacy store entry; refused on mainnet); else its keystore
 * (unlockAccountKeystore: a development account opens with the published development password, any other only with
 * `keystorePassword`, its owner's). Returns 64-hex key material and never logs it.
 */
export async function resolveAccountPrivateKey(
  account: { name: string; privateKeyEnv?: string | undefined; privateKey?: string | undefined; keystorePath?: string | undefined; keystoreKind?: "dev-account" | undefined },
  options: { networkId: string; keystorePassword?: string | undefined }
): Promise<string> {
  let pkValue = account.privateKeyEnv ? process.env[account.privateKeyEnv] : undefined;

  if (!pkValue && account.privateKey) {
    if (options.networkId === "mainnet") {
      throw new Error(
        `Mainnet guard: Unsafe plaintext privateKey fallback is forbidden on mainnet for account '${account.name}'. Use privateKeyEnv instead.`
      );
    }
    pkValue = account.privateKey;
  }

  if (!pkValue && account.keystorePath) {
    pkValue = await unlockAccountKeystore(
      { name: account.name, keystorePath: account.keystorePath, keystoreKind: account.keystoreKind },
      options.keystorePassword
    );
  }

  if (!pkValue) {
    const err = new Error(`DEV_ACCOUNT_KEY_UNAVAILABLE: Missing required private key for account '${account.name}'.`);
    (err as any).code = "DEV_ACCOUNT_KEY_UNAVAILABLE";
    throw err;
  }

  if (typeof pkValue !== "string" || pkValue.trim() === "" || !/^[0-9a-fA-F]{64}$/.test(pkValue)) {
    const err = new Error("INVALID_PRIVATE_KEY_MATERIAL: Private key must be a valid 64-character hex string.");
    (err as any).code = "INVALID_PRIVATE_KEY_MATERIAL";
    throw err;
  }
  return pkValue;
}

/**
 * Real Kaspa signer using the official WASM SDK (the pinned managed toolchain).
 */
export class KaspaWasmPrivateKeySigner implements HardkasTxPlanSigner {
  kind: HardkasSignerKind = "kaspa";

  constructor(
    private options: KaspaWasmSignerOptions
  ) {}

  async signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult> {
    const plan = input.planArtifact as TxPlanArtifact;

    // 1. Load SDK & Capabilities
    const sdk = await loadKaspaWasm(this.options.wasmConfig);
    const { detectCapabilities } = await import("./signer-backend.js");
    const capabilities = detectCapabilities(sdk);

    if (plan.computeBudget !== undefined || plan.outputs.some(o => o.covenant)) {
      if (!capabilities.transactionV1Signing) {
        throw new Error("Transaction V1 signing is not supported by the installed kaspa-wasm version");
      }
    }

    // 2. Mainnet guard
    assertSigningNetworkAllowed({
      network: plan.networkId,
      mode: plan.mode,
      allowMainnet: this.options.allowMainnet
    });

    // 2a. RC1 · D7: what this signer does not make, refused before any key is resolved — a lock time other than 0 (every
    // transaction it builds has lock time 0; it used to sign 0 whatever the plan said) and a signature for an ECDSA P2PK
    // input (it signs Schnorr only). An ECDSA input with no authorizer of the caller's is refused here (it used to fail
    // untyped, MISSING_INPUT_AUTHORIZER); one with an authorizer of the caller's is refused below unless that authorizer
    // hands its own unlocking script (a signature-script authorization, as for a P2SH input without a contract): with a
    // signing authorizer it used to put a Schnorr signature on the ECDSA input.
    assertPlanLockTimeZero(plan);
    const ecdsaInputs = new Set<number>();
    (plan.inputs || (plan as any).selectedUtxos || []).forEach((u: any, i: number) => {
      if (kaspaAddressVersion(u?.address) === 1 || isEcdsaP2pkScript(u?.scriptPublicKey)) {
        ecdsaInputs.add(i);
        if (!input.authorizers?.[i]) throw ecdsaSpendNotSupported(`input ${i}`, u?.address);
      }
    });

    // 2b. Each input's compute budget, before any key is resolved. v1: the budget the plan states for the input
    // (`inputs[].computeBudget`, the v1 planner's and the ZK lock's), or the legacy plan-level one; both stated must agree.
    // It used to read the plan-level budget only, so a v1 plan's per-input budgets were signed as 0 (9 999 script units:
    // another transaction than the plan, and too few for any signature check). None stated is refused: every v1 unlock
    // is metered against it, and the signer cannot tell what a caller-supplied unlock needs. v0: unchanged.
    const budgetInputs: any[] = plan.inputs || (plan as any).selectedUtxos || [];
    const inputBudgets = budgetInputs.map((u: any, i: number) => v1InputComputeBudget(plan, u, i));

    // 3. Synthesize missing authorizers from account
    let authorizers = input.authorizers ? { ...input.authorizers } : {};
    const numInputs = plan.inputs?.length || (plan as any).selectedUtxos?.length || 0;
    
    if (this.options.account) {
        const account = this.options.account;
        // SILVER-KEYS-1: the shared key-resolution order (`hardkas silver` resolves keys through it too)
        const pkValue = await resolveAccountPrivateKey(account as any, { networkId: plan.networkId, keystorePassword: this.options.keystorePassword });

        const expectedAddress = (new sdk.PrivateKey(pkValue) as any).toKeypair().toAddress(getNetworkPrefix(plan.networkId || "simnet")).toString();
        const { PrivateKeyAuthorizer } = await import("./authorizers.js");
        const sourceInputs = plan.inputs || (plan as any).selectedUtxos || [];
        
        for (let i = 0; i < numInputs; i++) {
            if (!authorizers[i]) {
                const inputAddress = (sourceInputs[i] as any)?.address;
                if (inputAddress === expectedAddress) {
                    authorizers[i] = new PrivateKeyAuthorizer(account.name, pkValue);
                }
            }
        }
    }

    // A p2sh input without a contract (assertV1PlanShape allows it: a ZK lock's plan) has no unlock this signer could
    // make: only an unlocking script the caller supplies (a signature-script authorization) is used for it.
    const sourcePlanInputs: any[] = plan.inputs || (plan as any).selectedUtxos || [];
    const p2shWithoutContract = (i: number) => sourcePlanInputs[i]?.kind === "p2sh" && sourcePlanInputs[i]?.contract === undefined;
    const p2shUnlockUnavailable = (i: number) =>
      Object.assign(
        new Error(
          `V1_P2SH_UNLOCK_UNAVAILABLE: input ${i} is a p2sh input without a contract; this signer makes no unlock for it. Supply its unlocking script (a signature-script authorization), or spend it with the builder that does.`
        ),
        { code: "V1_P2SH_UNLOCK_UNAVAILABLE" }
      );
    for (let i = 0; i < numInputs; i++) {
      if (p2shWithoutContract(i) && !authorizers[i]) throw p2shUnlockUnavailable(i);
    }

    // 4. Verify all inputs have authorizers
    for (let i = 0; i < numInputs; i++) {
        if (!authorizers[i]) {
            throw new Error(`MISSING_INPUT_AUTHORIZER: No authorizer was provided for input index ${i}.`);
        }
    }

    try {
      const sourceInputs = plan.inputs || (plan as any).selectedUtxos || [];
      const utxos = sourceInputs.map((u: any) => {
        if (!u.outpoint.transactionId || u.outpoint.index === undefined) {
          throw new Error(`UTXO is missing transactionId or index. Re-run tx plan.`);
        }

        const spk = (u as { scriptPublicKey?: any }).scriptPublicKey;
        if (!spk) {
          throw new Error(
            "UTXO is missing scriptPublicKey. Real signing flows must never fabricate cryptographic state."
          );
        }

        // ADJ-002 Transport Rule (toWasmScriptPublicKey): `{ version, scriptPublicKey }` keeps its explicit version and
        // script bytes; a string starting with `0000` is version 0 + its script of any length (L1-12: it used to be
        // decoded at 72 hex only, a 34-byte script); any other string is a bare version-0 script.
        return {
          address: (u as any).address || plan.from.address,
          outpoint: {
            transactionId: u.outpoint.transactionId,
            index: u.outpoint.index
          },
          utxoEntry: {
            amount: BigInt(u.amountSompi),
            scriptPublicKey: toWasmScriptPublicKey(sdk, spk),
            blockDaaScore: BigInt((u as any).blockDaaScore || "0"),
            isCoinbase: !!(u as any).isCoinbase
          }
        };
      });

      const priorityFee = BigInt(plan.estimatedFeeSompi);

      const createFreshTx = () => {
        const isV1 = plan.txVersion === 1;
        if (isV1 && !capabilities.transactionV1Signing) {
          throw new Error("Transaction V1 signing is not supported by the installed kaspa-wasm version");
        }

        // kaspa-wasm 2.x adds no change output: change is an explicit output, and
        // createBalancedTransaction refuses plans whose values do not balance.
        const allOutputs = [...plan.outputs];
        if (plan.change && BigInt(plan.change.amountSompi) > 0n) {
          allOutputs.push({
            address: plan.change.address,
            amountSompi: plan.change.amountSompi
          });
        }

        // WASM objects are consumed when passed by value, so each call builds fresh ones.
        const outputs = allOutputs.map((o) => {
          if (!o.address) throw new Error("Output is missing address.");
          const amount = BigInt(o.amountSompi);
          if (isV1 && o.covenant && o.covenant.covenantId) {
            const binding = new sdk.CovenantBinding(o.covenant.authorizingInput, new sdk.Hash(o.covenant.covenantId));
            return { amountSompi: amount, output: sdk.PaymentOutput.withCovenant(new sdk.Address(o.address), amount, binding) };
          }
          return { amountSompi: amount, output: new sdk.PaymentOutput(new sdk.Address(o.address), amount) };
        });

        // TX-SEQUENCE-1 / L1-14: every input gets sequence 0, v1 included (the v1 path used to keep kaspa-wasm's numbering,
        // input k = sequence k: a relative lock of k DAA); an input whose plan states a sequence (V1-ENGINE-2) gets that one.
        const unsignedTx = createBalancedTransaction(sdk, { utxos, outputs, feeSompi: priorityFee });
        const statedSequences = sourceInputs.map((u: any) => (u?.sequence !== undefined ? BigInt(u.sequence) : undefined));
        const hasStatedSequence = statedSequences.some((s: bigint | undefined) => s !== undefined && s !== 0n);

        if (isV1) {
          // Group outputs with empty covenantId by authorizingInput to populate genesis covenants
          const genesisGroups = new Map<number, number[]>();
          allOutputs.forEach((o, idx) => {
            if (o.covenant && !o.covenant.covenantId) {
              const authIn = o.covenant.authorizingInput;
              if (!genesisGroups.has(authIn)) genesisGroups.set(authIn, []);
              genesisGroups.get(authIn)!.push(idx);
            }
          });

          if (genesisGroups.size > 0) {
            const groupsArray = Array.from(genesisGroups.entries()).map(([authIn, outIndices]) => {
              return new sdk.GenesisCovenantGroup(authIn, outIndices);
            });
            unsignedTx.populateGenesisCovenants(groupsArray);
          }
          unsignedTx.version = 1;

          if (plan.storageMass !== undefined) {
            unsignedTx.storageMass = BigInt(plan.storageMass);
          }
        }

        const inputs = unsignedTx.inputs;
        for (let i = 0; i < inputs.length; i++) {
          const budget = inputBudgets[i];
          if (budget !== undefined) inputs[i].computeBudget = budget;
          if (unsignedTx.version === 1) {
            inputs[i].sigOpCount = 0;
          }
          const stated = statedSequences[i];
          if (stated !== undefined) inputs[i].sequence = stated;
        }
        // V1-TXID-1: the version, compute budgets, sig-op counts and stated sequences set above are covered by the
        // transaction's id, which kaspa-wasm recomputes only on finalize(): without it the txId declared below would be
        // the id of the transaction as built (version 0), not of the one signed and serialized. (RC1 · D1: the storage
        // mass is not covered by the id, in v0 or v1 — measured with the official kaspa-wasm 2.1.0; it is committed.)
        if (isV1 || plan.computeBudget !== undefined || hasStatedSequence) unsignedTx.finalize();
        return unsignedTx;
      };

      // 5. Execute authorizers per input
      const inputOverrides: Record<number, { signatureScript: string }> = {};
      
      if (!authorizers || Object.keys(authorizers).length === 0) {
        throw new Error("MISSING_INPUT_AUTHORIZER: No authorizers were provided for the transaction.");
      }
      
      // Need a temporary transaction to get the number of inputs
      const dummyTx = createFreshTx();
      const numInputsWasm = dummyTx.inputs.length;
      
      for (let i = 0; i < numInputsWasm; i++) {
        const authorizer = authorizers[i];
        if (!authorizer) {
           throw new Error(`MISSING_INPUT_AUTHORIZER: No authorizer was provided for input index ${i}.`);
        }
        
        // Use a fresh transaction for each authorizer to avoid mutation side-effects
        const txForAuth = createFreshTx();
        
        const authorization = await authorizer.authorize({
          inputIndex: i,
          plan: plan,
          wasmTransaction: txForAuth,
          wasm: sdk
        });
        
        let sigScript: string | undefined;

        if (p2shWithoutContract(i) && authorization.kind !== "signature-script") throw p2shUnlockUnavailable(i);
        // RC1 · D7: an ECDSA input takes only the caller's own unlocking script; this signer never signs one (Schnorr only)
        if (ecdsaInputs.has(i) && authorization.kind !== "signature-script") throw ecdsaSpendNotSupported(`input ${i}`, (sourceInputs[i] as any)?.address);

        if (authorization.kind === "signature-script") {
          sigScript = authorization.signatureScript;
        } else if (authorization.kind === "wasm-signer") {
          sigScript = await authorization.signer.signInput({
            inputIndex: i,
            plan: plan,
            wasmTransaction: txForAuth,
            wasm: sdk
          });
        }
        
        if (!sigScript || sigScript.trim() === "") {
           throw new Error(`INVALID_SIGNATURE_SCRIPT: Authorizer for input ${i} failed to return a signatureScript.`);
        }
        
        if (!/^[0-9a-fA-F]+$/.test(sigScript)) {
           throw new Error(`INVALID_SIGNATURE_SCRIPT: Authorizer for input ${i} returned a non-hex signatureScript.`);
        }
        
        inputOverrides[i] = { signatureScript: sigScript };
      }
      
      // Final transaction for JSON serialization
      const finalTx = createFreshTx();
      const signedTx = finalTx;

      // 6. Serialize (serializeToObject keeps amounts as exact bigints)
      const rpcTx = parseWasmTxToRpc(signedTx.serializeToObject(), signedTx, inputOverrides, plan);
      const rawTx = JSON.stringify(rpcTx);

      return {
        signatureKind: "kaspa",
        signerAddress: input.accountName || plan.from.address || "authorized",
        signedTransaction: {
          format: "hex",
          payload: rawTx
        },
        txId: signedTx.id,
        signature: {
          // We use the txid as the signature identifier in the artifact
          value: signedTx.id || plan.contentHash || recomputeDeclaredContentHash(plan)
        }
      };
    } catch (error: any) {
      // RC1 · D7: the typed refusal of an ECDSA signature goes out as it is (it names no key material)
      if (error?.code === "ECDSA_SPEND_NOT_SUPPORTED") throw error;
      // Never log the private key
      const wrapped = new Error(
        `Kaspa WASM signing failed: ${error instanceof Error ? error.stack || error.message : JSON.stringify(error, Object.getOwnPropertyNames(error))}`
      );
      // a typed refusal keeps its code through the wrapper
      if (error?.code === "V1_P2SH_UNLOCK_UNAVAILABLE") (wrapped as any).code = error.code;
      throw wrapped;
    }
  }
}

const budgetError = (code: string, message: string) => Object.assign(new Error(`${code}: ${message}`), { code });

/**
 * RC1 · D7: HardKAS builds every transaction with lock time 0 (no CLTV in this release). A plan stating another lock
 * time — or one that is not an integer — is refused (LOCK_TIME_NOT_SUPPORTED); an absent or explicit 0 is what is signed.
 */
export function assertPlanLockTimeZero(plan: unknown): void {
  const stated = (plan as { lockTime?: unknown } | null | undefined)?.lockTime;
  if (stated === undefined || stated === null) return;
  let value: bigint | undefined;
  try {
    value = typeof stated === "bigint" ? stated : typeof stated === "number" || (typeof stated === "string" && /^\d+$/.test(stated)) ? BigInt(stated) : undefined;
  } catch {
    value = undefined;
  }
  if (value === 0n) return;
  throw Object.assign(
    new Error(
      `LOCK_TIME_NOT_SUPPORTED: the plan states lock time ${JSON.stringify(typeof stated === "bigint" ? stated.toString() : stated)}; HardKAS builds and signs ` +
        "every transaction with lock time 0 (absolute time locks, CLTV, are not supported in this release). Nothing was signed."
    ),
    { code: "LOCK_TIME_NOT_SUPPORTED" }
  );
}

/**
 * The compute budget the internal signer commits for input `index` of `plan`. v1: the input's own `computeBudget` (a u16
 * number, as the plan schema has it) or the legacy plan-level one (a decimal string), equal when both are stated;
 * V1_COMPUTE_BUDGET_INVALID for anything else, V1_COMPUTE_BUDGET_REQUIRED when neither is. v0: the plan-level value as
 * before (undefined when absent).
 */
function v1InputComputeBudget(plan: any, input: any, index: number): number | undefined {
  if (plan.txVersion !== 1) return plan.computeBudget !== undefined ? Number(plan.computeBudget) : undefined;
  const u16 = (v: unknown, where: string): number => {
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : Number.NaN;
    if (!Number.isInteger(n) || n < 0 || n > 0xffff) {
      throw budgetError("V1_COMPUTE_BUDGET_INVALID", `${where} ${JSON.stringify(v)} is not a compute budget (u16)`);
    }
    return n;
  };
  if (input?.computeBudget !== undefined && typeof input.computeBudget !== "number") {
    throw budgetError("V1_COMPUTE_BUDGET_INVALID", `input ${index}.computeBudget ${JSON.stringify(input.computeBudget)} is not a compute budget (u16 number)`);
  }
  const own = input?.computeBudget !== undefined ? u16(input.computeBudget, `input ${index}.computeBudget`) : undefined;
  const whole = plan.computeBudget !== undefined ? u16(plan.computeBudget, "the plan's computeBudget") : undefined;
  if (own !== undefined && whole !== undefined && own !== whole) {
    throw budgetError("V1_COMPUTE_BUDGET_INVALID", `input ${index} states compute budget ${own} and the plan ${whole}`);
  }
  const budget = own ?? whole;
  if (budget === undefined) {
    throw budgetError(
      "V1_COMPUTE_BUDGET_REQUIRED",
      `input ${index} of a v1 plan states no compute budget: its unlock runs metered against budget × 10 000 + 9 999 script units ` +
        "(a Schnorr signature check alone takes 100 000), and the signer does not sign with an unstated 0"
    );
  }
  return budget;
}

/**
 * Security guard for network types.
 */
export function assertSigningNetworkAllowed(input: {
  network: NetworkId;
  mode: string;
  allowMainnet?: boolean | undefined;
}): void {
  // SDK-MAINNET-BROADCAST-GUARD-1 / HK-12: the product's mainnet policy, typed (MAINNET_SIGNING_DISABLED). The constant
  // decides; `allowMainnet` (deprecated) no longer lifts it, for a direct library call either (mainnet-policy.ts).
  void input.allowMainnet;
  assertMainnetTransactionsDisabled("sign", [input.network], "kaspa-wasm signer");
}
