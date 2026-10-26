import { loadManagedKaspaWasmSync } from "@hardkas/core";
import type { Hardkas } from "@hardkas/sdk";
import type { V1EngineFacts, V1KeyResolver } from "@hardkas/accounts";
import type { V1ArgValue } from "@hardkas/tx-builder";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";

/**
 * V1-ENGINE-2 · `hardkas silver deploy | spend | covenant genesis | covenant transition` on the SDK's v1 engine
 * (sdk.covenants): the planner, the F1.4 validation before any key is read, the signing and the one send (F1.6) of
 * `silver engine` and of the SDK. The commands keep their options, their records (same schemas, same fields) and their
 * codes; what they send is a v1 transaction the engine planned and checked. The node is the canonical localnet's, after
 * it proved its identity; the keys are the ones the command resolved before contacting it. Local validation does not
 * execute the scripts: a transition the contract's policy refuses is the node's final rejection, never re-sent.
 */

const NETWORK = "simnet";

const fail = (code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never => {
  throw new HardkasCliError(code, message, { exitCode });
};

/** A local account a command resolved (SILVER-KEYS-1): the names it was given by, its key, its address. */
export interface SilverEngineAccount {
  readonly names: readonly string[];
  readonly privateKey: string;
  readonly address: string;
}

/** The x-only public key (hex) of a private key. */
export function silverXOnlyOf(privateKey: string): string {
  const k: any = loadManagedKaspaWasmSync();
  return String(new k.PrivateKey(privateKey).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
}

/**
 * The engine's key resolver over the accounts a command already resolved (by any name it was given, and by address).
 * The engine reads a private key only after F1.4, and checks it against the key the input or the contract expects.
 */
export function silverEngineKeys(accounts: readonly SilverEngineAccount[]): V1KeyResolver {
  const known = new Map<string, { privateKey: string; publicKey: string }>();
  for (const a of accounts) {
    const entry = { privateKey: a.privateKey, publicKey: silverXOnlyOf(a.privateKey) };
    for (const name of [...a.names, a.address]) known.set(name, entry);
  }
  return {
    publicKeyOf: (account) => known.get(account)?.publicKey,
    privateKeyOf: async (account) => {
      const entry = known.get(account);
      if (!entry) return fail("SILVER_ACCOUNT_KEY_UNAVAILABLE", `account '${account}' was not resolved by this command`, HardkasExitCode.USAGE_ERROR);
      return entry.privateKey;
    }
  };
}

/**
 * The SDK on this workspace's simnet, which must be the canonical localnet (refused before when it is not), its client
 * the canonical node's — the one that proved its identity. The caller closes it (the node's client stays the caller's).
 */
export async function openCanonicalSilverSdk(workspaceRoot: string, rpc: unknown): Promise<Hardkas> {
  const { Hardkas } = await import("@hardkas/sdk");
  const { declaredNetworkIdOf } = await import("@hardkas/core");
  const sdk = await Hardkas.open({ cwd: workspaceRoot, network: NETWORK, autoBootstrap: true });
  const e = sdk.execution;
  if (e.mode !== "localnet" || e.domain !== "kaspa-l1" || sdk.network !== NETWORK || (declaredNetworkIdOf(sdk.config.config, NETWORK) ?? NETWORK) !== NETWORK) {
    await sdk.close();
    fail("SILVER_NETWORK_NOT_SUPPORTED", `this workspace's ${NETWORK} is not the canonical localnet (${e.mode} ${e.domain} ${e.network})`, HardkasExitCode.USAGE_ERROR);
  }
  (sdk as any).rpc = rpc;
  return sdk;
}

/**
 * ESCROW-BROADCAST-SAFETY-1 on the engine's send (sdk.tx.send, F1.6): the node's own refusal is SILVER_REJECTED_BY_NODE
 * (final: never re-sent), a request that certainly never left SILVER_SUBMIT_NOT_SENT, anything else after it may have left
 * SILVER_SUBMIT_OUTCOME_UNKNOWN with the txId to observe. A refusal before the broadcast keeps the engine's own code:
 * nothing was sent.
 */
export async function sendSilverEngineTransaction(
  sdk: Hardkas,
  signed: any,
  label: string,
  options: { readonly facts?: V1EngineFacts | undefined; readonly compileRecords?: ReadonlyArray<Record<string, any>> | undefined } = {}
): Promise<string> {
  const { submitOutcomeOf } = await import("@hardkas/artifacts");
  const { isNodeNetworkIdentityError, isRpcRequestNotSentError } = await import("@hardkas/kaspa-rpc");
  const txId = String(signed?.txId ?? "").toLowerCase();
  let r: any;
  try {
    r = await sdk.covenants.send(signed, options);
  } catch (e: any) {
    if (e instanceof HardkasCliError) throw e;
    const message = String(e?.message ?? e);
    if (e?.code === "SUBMIT_NOT_SENT" || isRpcRequestNotSentError(e) || isNodeNetworkIdentityError(e)) return fail("SILVER_SUBMIT_NOT_SENT", `${label}: nothing was sent (${message})`);
    throw e;
  }
  const named = typeof r?.txId === "string" ? r.txId.toLowerCase() : undefined;
  if ((r?.submitted === true || r?.alreadySubmitted === true) && named === txId) return txId;
  const result = r?.submission?.submitResult ?? {};
  if (submitOutcomeOf(result) === "rejected") {
    return fail("SILVER_REJECTED_BY_NODE", `${label}: ${String(result.error ?? "the node refused the transaction")}${r?.rejection?.code ? ` (${r.rejection.code})` : ""}`);
  }
  return fail(
    "SILVER_SUBMIT_OUTCOME_UNKNOWN",
    `${label}: the outcome is unknown (${String(result.error ?? "no answer naming the transaction")}); the node may have transaction ${txId || "(id unknown)"}. ` +
      "It was not re-submitted: observe it before building another transaction."
  );
}

/** The signature script (hex) of input `index` of a signed v1 artifact. */
function signatureScriptOf(signed: any, index: number): string {
  const tx = JSON.parse(String(signed?.signedTransaction?.payload ?? "{}"));
  const script = tx?.inputs?.[index]?.signatureScript;
  return typeof script === "string" ? script.toLowerCase() : fail("SILVER_SIGNED_TX_INVALID", `the signed transaction has no signature script at input ${index}`);
}

/** The address of a locking script on the canonical simnet. */
function addressOfLock(lock: { readonly version: number; readonly script: string }): string {
  const k: any = loadManagedKaspaWasmSync();
  return String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(lock.version, lock.script), NETWORK));
}

/**
 * An input's compute budget when the command was given none: the certified one of this template and entry (F1.8), else
 * rusty-kaspa's heuristic upper bound ("estimate") — what the SDK uses when asked for it. A shortfall is the node's final
 * COMPUTE_BUDGET_INSUFFICIENT: a budget is never raised after a rejection.
 */
async function defaultBudget(kind: "p2sh" | "covenant", templateHash: string, entry: string): Promise<number | "estimate"> {
  const { proposeComputeBudget } = await import("@hardkas/tx-builder");
  return proposeComputeBudget({ kind, templateHash, entry })?.budget ?? "estimate";
}

const insufficientFunds = (e: any, who: string) =>
  e?.code === "V1_FEE_INPUTS_INSUFFICIENT" ? fail("SILVER_INSUFFICIENT_FUNDS", `${who} cannot pay this transaction: ${String(e?.message ?? e).replace("V1_FEE_INPUTS_INSUFFICIENT: ", "")}`) : undefined;

export interface SilverEngineContext {
  /** The SDK on the canonical simnet localnet (openCanonicalSilverSdk). */
  readonly sdk: Hardkas;
  /** The contract facts: the compile records this command read, reproduced by the pinned silverc. */
  readonly facts: V1EngineFacts;
  /** The compile records this command read (and verified). */
  readonly compileRecords: ReadonlyArray<Record<string, any>>;
  readonly keys: V1KeyResolver;
}

const signOptions = (c: SilverEngineContext) => ({ facts: c.facts, compileRecords: c.compileRecords, keys: c.keys });

type RecordRef = { readonly contentHash: string; readonly artifactSha256: string; readonly path?: string | undefined };

/**
 * `silver deploy`: the funder's coins (F1.7: mature, never a covenant's, not pending) pay the contract's P2SH output — the
 * P2SH of the compile record's own artifact — and the fee (the node's floor, F1.2); the change goes back to the funder.
 */
export async function silverEngineDeploy(
  c: SilverEngineContext,
  input: { readonly compileRecord: RecordRef; readonly contract: string; readonly address: string; readonly valueSompi: bigint; readonly funder: string }
): Promise<{ txId: string; feeSompi: bigint }> {
  let plan: any;
  try {
    plan = await c.sdk.covenants.planContractDeploy({ contract: { compileRecord: input.compileRecord, contract: input.contract }, amountSompi: input.valueSompi, funder: input.funder }, signOptions(c));
  } catch (e: any) {
    insufficientFunds(e, input.funder);
    throw e;
  }
  if (plan.outputs[0]?.address !== input.address) fail("SILVER_RECORD_NOT_REPRODUCED", `the engine funds ${plan.outputs[0]?.address}, the compile record's contract is at ${input.address}`);
  const s = await c.sdk.covenants.sign(plan, signOptions(c));
  const txId = await sendSilverEngineTransaction(c.sdk, s.signed, "deploy", signOptions(c));
  return { txId, feeSompi: BigInt(plan.estimatedFeeSompi) };
}

/**
 * `silver spend`: the contract output as the node lists it, swept to `to` through `entry` (signer slots signed by the
 * engine), the fee the node's floor measured on this very transaction. The deployed address must be the one the pinned
 * silverc reproduces with these constructor arguments.
 */
export async function silverEngineSpend(
  c: SilverEngineContext,
  input: {
    readonly contract: { readonly compileRecord: RecordRef; readonly contract: string; readonly constructorArgs: readonly V1ArgValue[] };
    readonly entry: string;
    readonly args: readonly V1ArgValue[];
    readonly outpoint: { readonly transactionId: string; readonly index: number };
    readonly address: string;
    readonly to: string;
    readonly sequence?: bigint | undefined;
    readonly computeBudget?: number | "estimate" | undefined;
  }
): Promise<{ txId: string; outputSompi: bigint; feeSompi: bigint; sequence: string; signatureScriptHex: string; computeBudget: number }> {
  const facts = await c.facts.contract(input.contract as any);
  if (addressOfLock(facts.lock) !== input.address) {
    fail("SILVER_RECORD_NOT_REPRODUCED", `the contract the pinned silverc reproduces with these constructor arguments is at ${addressOfLock(facts.lock)}, not at the deployed ${input.address}`);
  }
  const computeBudget = input.computeBudget ?? (await defaultBudget("p2sh", facts.templateHash, input.entry));
  const plan = await c.sdk.covenants.planContractSpend(
    {
      outpoint: input.outpoint,
      contract: { ...input.contract, entry: input.entry, args: input.args },
      payments: [],
      sweepTo: input.to,
      computeBudget,
      ...(input.sequence !== undefined ? { sequence: input.sequence } : {})
    },
    signOptions(c)
  );
  const s = await c.sdk.covenants.sign(plan, signOptions(c));
  const txId = await sendSilverEngineTransaction(c.sdk, s.signed, "spend", signOptions(c));
  return {
    txId,
    outputSompi: BigInt(plan.outputs[0].amountSompi),
    feeSompi: BigInt(plan.estimatedFeeSompi),
    sequence: String(plan.inputs[0].sequence ?? "0"),
    signatureScriptHex: signatureScriptOf(s.signed, 0),
    computeBudget: Number(plan.inputs[0].computeBudget)
  };
}

/**
 * `silver covenant genesis`: the funder's coins pay one covenant output (the record's contract in its own state) and the
 * fee; the covenant id is the one kaspa-wasm derives for the genesis (populateGenesisCovenants), before any signature.
 */
export async function silverEngineGenesis(
  c: SilverEngineContext,
  input: {
    readonly contract: { readonly compileRecord: RecordRef; readonly contract: string; readonly constructorArgs: readonly V1ArgValue[] };
    readonly address: string;
    readonly valueSompi: bigint;
    readonly funder: string;
    readonly fundingComputeBudget?: number | undefined;
    readonly feeSompi?: bigint | undefined;
  }
): Promise<{ txId: string; covenantId: string; feeSompi: bigint; computeBudget: number }> {
  let plan: any;
  try {
    plan = await c.sdk.covenants.planGenesis(
      {
        contract: input.contract,
        outputs: [{ amountSompi: input.valueSompi }],
        funder: input.funder,
        ...(input.feeSompi !== undefined ? { feeSompi: input.feeSompi } : {}),
        ...(input.fundingComputeBudget !== undefined ? { fundingComputeBudget: input.fundingComputeBudget } : {})
      },
      signOptions(c)
    );
  } catch (e: any) {
    insufficientFunds(e, input.funder);
    throw e;
  }
  if (plan.outputs[0]?.address !== input.address) fail("SILVER_RECORD_NOT_REPRODUCED", `the engine starts the covenant at ${plan.outputs[0]?.address}, the compile record's contract is at ${input.address}`);
  const s = await c.sdk.covenants.sign(plan, signOptions(c));
  const covenantId = String(JSON.parse(s.signed.signedTransaction.payload)?.outputs?.[0]?.covenant?.covenantId ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(covenantId)) fail("SILVER_COVENANT_ID_MISSING", "the signed genesis binds no covenant id to its first output");
  const txId = await sendSilverEngineTransaction(c.sdk, s.signed, "covenant genesis", signOptions(c));
  return { txId, covenantId, feeSompi: BigInt(plan.estimatedFeeSompi), computeBudget: Number(plan.inputs[0].computeBudget) };
}

/**
 * `silver covenant transition`: the covenant's UTXO through the policy's generated entry, one continuation — the record's
 * template holding the next state (silverscript-abi) — that keeps what the fee leaves of its value (the fee: the node's
 * floor on this very transaction, or more when given). The continuation must be the successor the command compiled
 * (`expectedSuccessorAddress`), checked before any key is read.
 */
export async function silverEngineTransition(
  c: SilverEngineContext,
  input: {
    readonly contract: { readonly compileRecord: RecordRef; readonly contract: string; readonly constructorArgs: readonly V1ArgValue[] };
    readonly covenantId: string;
    readonly outpoint: { readonly transactionId: string; readonly index: number };
    readonly policy: string;
    readonly entry: string;
    readonly args: readonly V1ArgValue[];
    readonly nextState: Readonly<Record<string, V1ArgValue>>;
    readonly expectedSuccessorAddress: string;
    readonly computeBudget?: number | "estimate" | undefined;
    readonly feeSompi?: bigint | undefined;
  }
): Promise<{ txId: string; valueSompi: bigint; feeSompi: bigint; computeBudget: number }> {
  const facts = await c.facts.contract(input.contract as any);
  const computeBudget = input.computeBudget ?? (await defaultBudget("covenant", facts.templateHash, input.entry));
  const plan = await c.sdk.covenants.planTransition(
    {
      covenantId: input.covenantId,
      inputs: [{ outpoint: input.outpoint, contract: { ...input.contract, entry: input.entry, policy: input.policy, args: input.args }, computeBudget }],
      continuations: [{ amountSompi: "rest", state: input.nextState }],
      ...(input.feeSompi !== undefined ? { feeSompi: input.feeSompi } : {})
    },
    signOptions(c)
  );
  if (plan.outputs[0]?.address !== input.expectedSuccessorAddress) {
    fail(
      "SILVER_RECORD_NOT_REPRODUCED",
      `the engine's continuation (the template holding the next state) is at ${plan.outputs[0]?.address}, the successor silverc compiled is at ${input.expectedSuccessorAddress}: check --state-map`
    );
  }
  const s = await c.sdk.covenants.sign(plan, signOptions(c));
  const txId = await sendSilverEngineTransaction(c.sdk, s.signed, "covenant transition", signOptions(c));
  return { txId, valueSompi: BigInt(plan.outputs[0].amountSompi), feeSompi: BigInt(plan.estimatedFeeSompi), computeBudget: Number(plan.inputs[0].computeBudget) };
}
