import { createHash } from "node:crypto";
import {
  compileSilverScript,
  parseSilverSourceAst,
  loadManagedKaspaWasmSync,
  silverP2shLock,
  silverP2shAddress,
  encodeSilverEntryArgs,
  silverUnlockScript,
  decodeSilverRuntimeState,
  silContractBytecodeHex,
  getSilContract,
  executeSilverVmScenario,
  assertSafeSilverIntegers,
  assertSilverU64,
  resolveAvailableSilverRunner,
  analyzeSilverScriptSecurity,
  systemRuntimeContext,
  type CovenantEvidenceLevel,
  type SilAbiArtifact,
  type SilArtifactValue,
  type SilverVmExecutionResult,
  type SilverVmFailureDiagnostic,
  type SilverRunner,
  type SilverRunnerTrustPolicy,
  type CovenantStaticAnalysisReport
} from "@hardkas/core";
import {
  createV1TxPlanArtifact,
  expectedScriptPublicKeyHex,
  checkArtifactIdentity,
  createCovenantTransitionFactArtifact,
  deriveCovenantStatus,
  type CovenantTransitionFact,
  type CovenantStatusResult
} from "@hardkas/artifacts";
import {
  v1ContractFactsFromArtifact,
  v1ContractFactsAtState,
  buildV1Transaction,
  silToV1Arg,
  type V1ContractFacts,
  type V1NodeUtxo
} from "@hardkas/accounts";
import {
  v1StorageMass,
  estimateV1ComputeBudget,
  proposeComputeBudget,
  type V1MassMeasure,
  type V1BudgetEstimate,
  type V1PlanBody
} from "@hardkas/tx-builder";
import {
  submitAndObserveConsensus,
  type ConsensusObservationOptions,
  type ConsensusSimnetRpc,
  type ConsensusSubmissionEvidence
} from "./consensus-submission.js";

export type { CovenantEvidenceLevel };

export type CovenantPreflightLevel =
  | "STRUCTURAL_PREFLIGHT"
  | "SCRIPT_VM_PREFLIGHT"
  | "CONSENSUS_SIMNET_PREFLIGHT";

export interface CovenantTestAccount {
  readonly name: string;
  readonly privateKeyHex: string;
  readonly xOnlyPublicKey: string;
  readonly address: string;
}

export interface CompiledCovenantContract {
  readonly contractName: string;
  readonly source: string;
  readonly sourceFile?: string | undefined;
  readonly artifact: SilAbiArtifact;
  readonly artifactSha256: string;
  readonly compileRecordHash: string;
  readonly ast: Record<string, any>;
  readonly constructorArgs: readonly SilArtifactValue[];
  readonly facts: V1ContractFacts;
  readonly initialState?: Readonly<Record<string, SilArtifactValue>> | undefined;
}

export interface CovenantLiveUtxo {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly address: string;
  readonly amountSompi: bigint;
  readonly scriptPublicKey: string;
  readonly covenantId?: string | undefined;
  readonly state?: Readonly<Record<string, SilArtifactValue>> | undefined;
  readonly contract?: CompiledCovenantContract | undefined;
  readonly blockDaaScore: bigint;
  readonly isCoinbase: boolean;
}

export type CovenantUtxoFixture = CovenantLiveUtxo;

export interface CovenantTransitionAttemptParams {
  readonly contract: CompiledCovenantContract;
  /** The live covenant UTXO(s) being spent. */
  readonly utxo?: CovenantLiveUtxo | undefined;
  readonly utxos?: readonly CovenantLiveUtxo[] | undefined;
  /** Source-level covenant function name (e.g. "bump") or generated ABI entrypoint. */
  readonly entrypoint: string;
  /** Policy name if entrypoint is already the generated ABI name. */
  readonly policy?: string | undefined;
  /** Arguments to the covenant entrypoint (excluding synthesized `prev_state` / `new_state`). */
  readonly args: ReadonlyArray<
    | SilArtifactValue
    | { readonly kind: "signer"; readonly signer: string; readonly overridePrivateKeyHex?: string | undefined }
  >;
  /**
   * Optional arguments for delegate inputs (`inputs[1..N-1]`) in a multi-input
   * `binding = cov` transition where input 0 executes the leader policy and
   * inputs `1..N-1` execute the `#[covenant.delegate]` entrypoint.
   */
  readonly delegateArgs?: ReadonlyArray<
    | SilArtifactValue
    | { readonly kind: "signer"; readonly signer: string; readonly overridePrivateKeyHex?: string | undefined }
  > | undefined;
  /** Optional per-delegate-input argument list (`delegateArgsPerInput[i]` for `inputs[i + 1]`). */
  readonly delegateArgsPerInput?: ReadonlyArray<
    ReadonlyArray<
      | SilArtifactValue
      | { readonly kind: "signer"; readonly signer: string; readonly overridePrivateKeyHex?: string | undefined }
    >
  > | undefined;
  /** Next state(s) for successor outputs. Empty array = covenant termination. */
  readonly nextStates: ReadonlyArray<{
    readonly state?: Readonly<Record<string, SilArtifactValue | number | bigint | boolean | string>> | undefined;
    readonly amountSompi?: bigint | "rest" | undefined;
    readonly authorizingInput?: number | undefined;
  }>;
  /** Additional non-covenant outputs (e.g. change or withdrawal). */
  readonly extraOutputs?: ReadonlyArray<{
    readonly address: string;
    readonly amountSompi: bigint;
  }> | undefined;
  readonly feeSompi?: bigint | undefined;
  readonly computeBudget?: number | "estimate" | undefined;
  readonly sequence?: bigint | number | undefined;
  readonly lockTime?: bigint | number | undefined;
  /** Which verification backends to run (default: ["SYNTHETIC", "SCRIPT_VM"]). */
  readonly backends?: readonly CovenantEvidenceLevel[] | undefined;
  /** Capture step-by-step REPL stack and variable trace in SCRIPT_VM. */
  readonly captureTrace?: boolean | undefined;
}

export interface CovenantTransitionResult {
  readonly passed: boolean;
  /** Highest evidence level that evaluated this transition. */
  readonly evidenceLevel: CovenantEvidenceLevel;
  readonly preflightLevel: CovenantPreflightLevel;
  readonly status:
    | "SYNTHETIC_PASS"
    | "SYNTHETIC_FAIL"
    | "SCRIPT_VM_PASS"
    | "SCRIPT_VM_FAIL"
    | "CONSENSUS_SIMNET_PASS"
    | "CONSENSUS_SIMNET_FAIL"
    | "CONSENSUS_SIMNET_INCONCLUSIVE"
    | "BLOCKED";
  readonly structuralPassed: boolean;
  readonly structuralErrorCode?: string | undefined;
  readonly structuralErrorMessage?: string | undefined;
  readonly vmResult?: SilverVmExecutionResult | undefined;
  readonly diagnostic?: SilverVmFailureDiagnostic | undefined;
  readonly txId?: string | undefined;
  readonly covenantId?: string | undefined;
  readonly previousStates: ReadonlyArray<Readonly<Record<string, SilArtifactValue>> | undefined>;
  readonly successorUtxos: readonly CovenantLiveUtxo[];
  readonly computeBudgetUsed?: number | undefined;
  readonly computeBudgetEstimate?: V1BudgetEstimate | undefined;
  readonly massBreakdown?: V1MassMeasure | undefined;
  readonly plan?: Record<string, any> | undefined;
  readonly signedArtifact?: Record<string, any> | undefined;
  readonly simnetConfirmed?: boolean | undefined;
  readonly acceptingBlockHash?: string | undefined;
  /**
   * CONSENSUS_SIMNET only: the stages the submission reached and what they establish (R-01). CONSENSUS_SIMNET_PASS
   * requires outcome CONFIRMED; REJECTED is CONSENSUS_SIMNET_FAIL; NOT_SENT is BLOCKED; any other outcome is
   * CONSENSUS_SIMNET_INCONCLUSIVE. `expectedTxId` is empty when the transaction was never built.
   */
  readonly consensus?: ConsensusSubmissionEvidence | undefined;
  readonly transitionFact?: CovenantTransitionFact | undefined;
  readonly covenantStatus?: CovenantStatusResult | undefined;
}

export interface CovenantTestbedOptions {
  readonly networkId?: "simnet" | undefined;
  readonly runnerPath?: string | undefined;
  /**
   * The runner as an object instead of `runnerPath`: a path, optionally driven through another program with
   * `prefixArgs` (how tests drive a stand-in runner through node). Identified from its bytes and subject to the same trust
   * policy as any runner; one with `prefixArgs` is never VERIFIED.
   */
  readonly runner?: SilverRunner | undefined;
  /**
   * R-04: whether SCRIPT_VM may run a SilverScript runner that is not VERIFIED (today: every runner — upstream publishes
   * no binary). Default HARDKAS_SILVER_RUNNER_TRUST, else "require-verified": the VM step is then BLOCKED with
   * RUNNER_UNVERIFIED and nothing runs. "allow-unverified" runs it; its identity (trust UNVERIFIED) is in every vmResult.
   */
  readonly runnerTrust?: SilverRunnerTrustPolicy | undefined;
  readonly defaultBackends?: readonly CovenantEvidenceLevel[] | undefined;
  /**
   * Optional RPC client connected to an isolated rusty-kaspad simnet node for CONSENSUS_SIMNET level (a
   * JsonWrpcKaspaClient, or `testbedSimnetRpc(session)`). A pass needs the node's UTXO index to show the transaction's
   * effect; `mineBlocks`, when present, mines one block after the submission.
   */
  readonly simnetRpc?: ConsensusSimnetRpc | undefined;
  /** How long CONSENSUS_SIMNET observes the node's UTXO index for the transaction's effect (default 60 × 250 ms). */
  readonly consensusObservation?: ConsensusObservationOptions | undefined;
}

function toSilValue(raw: unknown): SilArtifactValue {
  if (typeof raw === "object" && raw !== null && "kind" in raw) {
    return raw as SilArtifactValue;
  }
  if (typeof raw === "number" || typeof raw === "bigint") {
    return { kind: "int", value: raw };
  }
  if (typeof raw === "boolean") {
    return { kind: "bool", value: raw };
  }
  if (typeof raw === "string") {
    if (/^0x[0-9a-fA-F]*$/.test(raw) && raw.length % 2 === 0) {
      return { kind: "bytes", value: [...Buffer.from(raw.slice(2), "hex")] };
    }
    return { kind: "text", value: raw };
  }
  throw new Error(`Cannot infer SilArtifactValue from ${JSON.stringify(raw)}`);
}

export function normalizeStateRecord(
  raw: Readonly<Record<string, SilArtifactValue | number | bigint | boolean | string>>
): Record<string, SilArtifactValue> {
  const out: Record<string, SilArtifactValue> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = toSilValue(v);
  }
  return out;
}

/**
 * Creates a native Kaspa L1 / SilverScript v1.0.0 Covenant Testbed supporting
 * three strict verification levels:
 * - Level A (`SYNTHETIC`): Structural v1 transaction validation, topology, state_span & fee/mass rules.
 * - Level B (`SCRIPT_VM`): the SilverScript runner (`cli-debugger`, `kaspa-txscript` engine) executing real `.sil`
 *   bytecode. Upstream publishes no runner binary: a local build is UNVERIFIED and runs only under the
 *   "allow-unverified" opt-in (`runnerTrust`); its identity travels with every verdict (R-04).
 * - Level C (`CONSENSUS_SIMNET`): Real `rusty-kaspad --simnet` consensus execution when connected.
 */
export function createCovenantTestbed(options: CovenantTestbedOptions = {}) {
  const k = loadManagedKaspaWasmSync();
  const networkId = options.networkId ?? "simnet";
  const defaultBackends: readonly CovenantEvidenceLevel[] = options.defaultBackends ?? ["SYNTHETIC", "SCRIPT_VM"];
  const accounts = new Map<string, CovenantTestAccount>();
  const utxos = new Map<string, CovenantLiveUtxo>();
  const txHistory = new Map<string, { plan: Record<string, any>; signed: Record<string, any>; rpcTx: any }>();
  const recordedResults: CovenantTransitionResult[] = [];
  let txCounter = 1;

  const outpointKey = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;

  function registerAccount(name: string, seedOrPrivateKeyHex?: string): CovenantTestAccount {
    const privHex =
      seedOrPrivateKeyHex && /^[0-9a-fA-F]{64}$/.test(seedOrPrivateKeyHex)
        ? seedOrPrivateKeyHex.toLowerCase()
        : createHash("sha256").update(`hardkas-covenant-testbed-account-${seedOrPrivateKeyHex ?? name}`).digest("hex");
    const priv = new k.PrivateKey(privHex);
    const xOnly = String(priv.toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
    const address = String(priv.toPublicKey().toAddress(networkId).toString());
    const acct: CovenantTestAccount = {
      name,
      privateKeyHex: privHex,
      xOnlyPublicKey: xOnly,
      address
    };
    accounts.set(name, acct);
    return acct;
  }

  // Pre-register standard fixture accounts
  registerAccount("owner");
  registerAccount("alice");
  registerAccount("bob");
  registerAccount("mallory");
  registerAccount("funder");

  function getAccount(name: string): CovenantTestAccount {
    return accounts.get(name) ?? registerAccount(name);
  }

  function fundAccount(accountName: string, amountSompi: bigint = 10_000_000_000n): CovenantLiveUtxo {
    const acct = getAccount(accountName);
    const txId = (txCounter++).toString(16).padStart(64, "0");
    const spk = k.payToAddressScript(new k.Address(acct.address));
    const spkObj = typeof spk.serializeToObject === "function" ? spk.serializeToObject() : spk;
    const spkHex = Number(spkObj.version ?? 0).toString(16).padStart(4, "0") + String(spkObj.script);
    const utxo: CovenantLiveUtxo = {
      outpoint: { transactionId: txId, index: 0 },
      address: acct.address,
      amountSompi,
      scriptPublicKey: spkHex,
      blockDaaScore: 1_000n,
      isCoinbase: false
    };
    utxos.set(outpointKey(utxo.outpoint), utxo);
    return utxo;
  }

  const buildLiveUtxoMap = (): ReadonlyMap<string, V1NodeUtxo> => {
    const map = new Map<string, V1NodeUtxo>();
    for (const [kOut, u] of utxos.entries()) {
      map.set(kOut, {
        amountSompi: u.amountSompi,
        scriptPublicKey: u.scriptPublicKey,
        ...(u.covenantId ? { covenantId: u.covenantId } : {}),
        blockDaaScore: u.blockDaaScore,
        isCoinbase: u.isCoinbase
      });
    }
    return map;
  };

  async function compileContract(params: {
    readonly source: string;
    readonly sourceFile?: string | undefined;
    readonly constructorArgs?: ReadonlyArray<SilArtifactValue | number | bigint | boolean | string> | undefined;
    readonly contractName?: string | undefined;
  }): Promise<CompiledCovenantContract> {
    const ctorArgs = (params.constructorArgs ?? []).map(toSilValue);
    const compiled = await compileSilverScript({
      source: params.source,
      constructorArgs: ctorArgs
    });
    const artifact = compiled.artifact;
    const ast = await parseSilverSourceAst(params.source);
    const { name, contract } = getSilContract(artifact, params.contractName);
    const artifactSha256 = compiled.provenance.artifactSha256;
    const compileRecordHash = createHash("sha256").update(`compile:${artifactSha256}`).digest("hex");

    const facts = v1ContractFactsFromArtifact({
      compileRecordHash,
      artifactSha256,
      artifact,
      contractName: name,
      constructorArgs: ctorArgs,
      ast
    });

    let initialState: Readonly<Record<string, SilArtifactValue>> | undefined;
    if (contract.compiled.state_span && contract.compiled.state_span.len > 0) {
      const bc = silContractBytecodeHex(contract);
      const start = contract.compiled.state_span.offset * 2;
      const end = start + contract.compiled.state_span.len * 2;
      initialState = decodeSilverRuntimeState(artifact, name, bc.slice(start, end));
    }

    return {
      contractName: name,
      source: params.source,
      ...(params.sourceFile ? { sourceFile: params.sourceFile } : {}),
      artifact,
      artifactSha256,
      compileRecordHash,
      ast,
      constructorArgs: ctorArgs,
      facts,
      ...(initialState ? { initialState } : {})
    };
  }

  async function deployGenesis(params: {
    readonly contract: CompiledCovenantContract;
    readonly initialState?: Readonly<Record<string, SilArtifactValue | number | bigint | boolean | string>> | undefined;
    readonly amountSompi?: bigint | undefined;
    readonly funder?: string | undefined;
    readonly feeSompi?: bigint | undefined;
  }): Promise<{
    readonly txId: string;
    readonly covenantId: string;
    readonly utxo: CovenantLiveUtxo;
    readonly signedArtifact: Record<string, any>;
  }> {
    const funderName = params.funder ?? "funder";
    const funderAcct = getAccount(funderName);
    const amountSompi = params.amountSompi ?? 1_000_000_000n;
    const feeSompi = params.feeSompi ?? 500_000n;

    let fundingUtxo = [...utxos.values()].find(
      (u) => u.address === funderAcct.address && !u.covenantId && u.amountSompi >= amountSompi + feeSompi + 10_000_000n
    );
    if (!fundingUtxo) {
      fundingUtxo = fundAccount(funderName, amountSompi + feeSompi + 5_000_000_000n);
    }

    const stateRecord = params.initialState
      ? normalizeStateRecord(params.initialState)
      : params.contract.initialState;

    const targetFacts = stateRecord
      ? v1ContractFactsAtState(params.contract.facts, stateRecord)
      : params.contract.facts;

    const lock = silverP2shLock(targetFacts.bytecodeHex);
    const covAddress = silverP2shAddress(targetFacts.bytecodeHex, networkId);
    const covSpk = lock.version.toString(16).padStart(4, "0") + lock.script;

    const changeSompi = fundingUtxo.amountSompi - amountSompi - feeSompi;
    const storage =
      v1StorageMass(
        [
          {
            amountSompi: fundingUtxo.amountSompi,
            scriptBytes: fundingUtxo.scriptPublicKey.length / 2 - 2,
            covenantId: false
          }
        ],
        [
          {
            amountSompi,
            scriptBytes: covSpk.length / 2 - 2,
            covenantId: true
          },
          ...(changeSompi > 0n
            ? [
                {
                  amountSompi: changeSompi,
                  scriptBytes: fundingUtxo.scriptPublicKey.length / 2 - 2,
                  covenantId: false
                }
              ]
            : [])
        ]
      ) ?? 0n;

    const body: V1PlanBody = {
      txVersion: 1,
      inputs: [
        {
          outpoint: fundingUtxo.outpoint,
          address: fundingUtxo.address,
          amountSompi: fundingUtxo.amountSompi.toString(),
          scriptPublicKey: fundingUtxo.scriptPublicKey,
          blockDaaScore: fundingUtxo.blockDaaScore.toString(),
          isCoinbase: false,
          kind: "p2pk",
          signer: funderAcct.name,
          computeBudget: 10
        }
      ],
      outputs: [
        {
          address: covAddress,
          amountSompi: amountSompi.toString()
        },
        ...(changeSompi > 0n
          ? [
              {
                address: funderAcct.address,
                amountSompi: changeSompi.toString(),
                role: "change" as const
              }
            ]
          : [])
      ],
      genesisCovenantGroups: [
        {
          authorizingInput: 0,
          outputs: [0],
          contract: {
            compileRecord: {
              contentHash: params.contract.compileRecordHash,
              artifactSha256: params.contract.artifactSha256
            },
            contract: params.contract.contractName,
            constructorArgs: params.contract.constructorArgs.map((a) => silToV1Arg(a))
          },
          ...(stateRecord
            ? {
                states: [
                  Object.fromEntries(
                    Object.entries(stateRecord).map(([kField, vVal]) => [kField, silToV1Arg(vVal)])
                  )
                ]
              }
            : {})
        }
      ],
      estimatedFeeSompi: feeSompi.toString(),
      estimatedMass: "2000",
      storageMass: storage.toString(),
      maxFeeSompi: (feeSompi * 10n).toString()
    };

    const planCandidate = createV1TxPlanArtifact({
      networkId: networkId as any,
      mode: "localnet" as any,
      from: { input: funderAcct.name, address: funderAcct.address },
      to: { input: "covenant", address: covAddress },
      amountSompi,
      body,
      ctx: systemRuntimeContext as any
    });

    const liveMap = buildLiveUtxoMap();
    const built = await buildV1Transaction({
      plan: planCandidate,
      node: {
        networkId,
        utxosByAddresses: async () => liveMap
      },
      facts: {
        contract: async () => params.contract.facts,
        successor: async () => targetFacts
      },
      keys: {
        publicKeyOf: (a: string) => getAccount(a).xOnlyPublicKey,
        privateKeyOf: async (a: string) => getAccount(a).privateKeyHex
      }
    });

    // Update live UTXO set
    utxos.delete(outpointKey(fundingUtxo.outpoint));
    const txPayload = JSON.parse(built.signed.signedTransaction.payload);
    const covenantId = String(txPayload.outputs[0].covenant.covenantId);

    const covUtxo: CovenantLiveUtxo = {
      outpoint: { transactionId: built.txId, index: 0 },
      address: covAddress,
      amountSompi,
      scriptPublicKey: covSpk,
      covenantId,
      ...(stateRecord ? { state: stateRecord } : {}),
      contract: params.contract,
      blockDaaScore: 1_001n,
      isCoinbase: false
    };
    utxos.set(outpointKey(covUtxo.outpoint), covUtxo);

    if (changeSompi > 0n) {
      const changeUtxo: CovenantLiveUtxo = {
        outpoint: { transactionId: built.txId, index: 1 },
        address: funderAcct.address,
        amountSompi: changeSompi,
        scriptPublicKey: fundingUtxo.scriptPublicKey,
        blockDaaScore: 1_001n,
        isCoinbase: false
      };
      utxos.set(outpointKey(changeUtxo.outpoint), changeUtxo);
    }

    txHistory.set(built.txId, { plan: planCandidate, signed: built.signed, rpcTx: built.rpcTransaction });
    return {
      txId: built.txId,
      covenantId,
      utxo: covUtxo,
      signedArtifact: built.signed
    };
  }

  async function deployP2sh(params: {
    readonly contract: CompiledCovenantContract;
    readonly amountSompi?: bigint | undefined;
    readonly blockDaaScore?: bigint | undefined;
  }): Promise<{
    readonly txId: string;
    readonly address: string;
    readonly scriptPublicKey: string;
    readonly utxo: CovenantLiveUtxo;
  }> {
    const amountSompi = params.amountSompi ?? 1_000_000_000n;
    const blockDaaScore = params.blockDaaScore ?? 1_001n;
    const lock = silverP2shLock(params.contract.facts.bytecodeHex);
    const p2shAddress = silverP2shAddress(params.contract.facts.bytecodeHex, networkId);
    const p2shSpk = lock.version.toString(16).padStart(4, "0") + lock.script;
    const txId = (txCounter++).toString(16).padStart(64, "0");
    const p2shUtxo: CovenantLiveUtxo = {
      outpoint: { transactionId: txId, index: 0 },
      address: p2shAddress,
      amountSompi,
      scriptPublicKey: p2shSpk,
      contract: params.contract,
      blockDaaScore,
      isCoinbase: false
    };
    utxos.set(outpointKey(p2shUtxo.outpoint), p2shUtxo);
    return {
      txId,
      address: p2shAddress,
      scriptPublicKey: p2shSpk,
      utxo: p2shUtxo
    };
  }

  function resolveEntryAndPolicy(
    contract: CompiledCovenantContract,
    entrypointOrPolicy: string,
    explicitPolicy?: string
  ): { abiEntry: string; policyName: string; isCovenant: boolean } {
    const { contract: silContract } = getSilContract(contract.artifact, contract.contractName);
    const covMap = silContract.cov_decl_to_abi ?? {};
    if (entrypointOrPolicy in covMap) {
      return {
        abiEntry: covMap[entrypointOrPolicy]!,
        policyName: entrypointOrPolicy,
        isCovenant: true
      };
    }
    const reverseMatch = Object.entries(covMap).find(([, abi]) => abi === entrypointOrPolicy);
    if (reverseMatch) {
      return {
        abiEntry: entrypointOrPolicy,
        policyName: explicitPolicy ?? reverseMatch[0],
        isCovenant: true
      };
    }
    return {
      abiEntry: entrypointOrPolicy,
      policyName: explicitPolicy ?? entrypointOrPolicy,
      isCovenant: Boolean(explicitPolicy)
    };
  }

  async function executeTransition(
    params: CovenantTransitionAttemptParams
  ): Promise<CovenantTransitionResult> {
    const spentUtxos = params.utxos ? [...params.utxos] : params.utxo ? [params.utxo] : [];
    if (spentUtxos.length === 0) {
      throw new Error("CovenantTransitionAttemptParams requires at least one UTXO (`utxo` or `utxos`).");
    }
    // B-1: an argument's int given as an unsafe JS number is refused before any verdict, structural or SCRIPT_VM (the
    // transaction plan would otherwise carry it rounded); states are refused by their own encoder
    params.args.forEach((a, i) => assertSafeSilverIntegers(a, `args[${i}]`));
    // N-10: so are the transition's lock time and sequence, which both the plan and the SCRIPT_VM scenario carry
    if (params.lockTime !== undefined) assertSilverU64(params.lockTime, "lockTime");
    if (params.sequence !== undefined) assertSilverU64(params.sequence, "sequence");

    const primaryUtxo = spentUtxos[0]!;
    const covenantId = primaryUtxo.covenantId;
    const feeSompi = params.feeSompi ?? 300_000n;
    const backends = params.backends ?? defaultBackends;
    const { abiEntry, policyName, isCovenant } = resolveEntryAndPolicy(
      params.contract,
      params.entrypoint,
      params.policy
    );

    // 1. Build input facts & successor states
    const inputFactsList = spentUtxos.map((u) =>
      u.state ? v1ContractFactsAtState(params.contract.facts, u.state) : params.contract.facts
    );

    const totalInSompi = spentUtxos.reduce((acc, u) => acc + u.amountSompi, 0n);
    const extraOutSompi = (params.extraOutputs ?? []).reduce((acc, o) => acc + o.amountSompi, 0n);
    let remainingSompi = totalInSompi - extraOutSompi - feeSompi;

    const resolvedContinuations = params.nextStates.map((ns) => {
      const amt =
        ns.amountSompi === undefined || ns.amountSompi === "rest"
          ? remainingSompi
          : ns.amountSompi;
      remainingSompi -= amt;
      const stateRec = ns.state ? normalizeStateRecord(ns.state) : undefined;
      const succFacts = stateRec
        ? v1ContractFactsAtState(params.contract.facts, stateRec)
        : params.contract.facts;
      const lock = silverP2shLock(succFacts.bytecodeHex);
      const addr = silverP2shAddress(succFacts.bytecodeHex, networkId);
      const spk = lock.version.toString(16).padStart(4, "0") + lock.script;
      return {
        amountSompi: amt,
        state: stateRec,
        facts: succFacts,
        address: addr,
        scriptPublicKey: spk,
        authorizingInput: ns.authorizingInput ?? 0
      };
    });

    // Format v1 args for @hardkas/accounts engine
    // When a covenant entrypoint takes a synthesized state prefix in ABI (`__covenant_entry_*`),
    // inspect ABI params to see if the first param is `State` or `State[]`.
    const { contract: silContract } = getSilContract(params.contract.artifact, params.contract.contractName);
    const abiEntryDef = silContract.entries[abiEntry];
    const abiFirstParam = abiEntryDef?.params[0];
    const hasStateStructPrefix =
      abiFirstParam?.type.kind === "struct" && abiFirstParam.type.name === "State";
    const hasStateArrayPrefix =
      abiFirstParam?.type.kind === "dynamic_array" &&
      abiFirstParam.type.item.kind === "struct" &&
      abiFirstParam.type.item.name === "State";

    const v1UserArgs = params.args.map((a) => {
      if (typeof a === "object" && a !== null && a.kind === "signer") {
        return { kind: "signer" as const, signer: a.signer };
      }
      return silToV1Arg(a as SilArtifactValue);
    });

    const needsStatePrefix =
      (hasStateStructPrefix || hasStateArrayPrefix) &&
      params.args.length < (abiEntryDef?.params.length ?? 0);

    const fullV1EntryArgs: any[] = [];
    if (needsStatePrefix && hasStateStructPrefix && resolvedContinuations.length === 1 && resolvedContinuations[0]!.state) {
      fullV1EntryArgs.push(silToV1Arg({ kind: "object", value: resolvedContinuations[0]!.state }));
    } else if (needsStatePrefix && hasStateArrayPrefix) {
      fullV1EntryArgs.push({
        kind: "array",
        value: resolvedContinuations
          .filter((c) => c.state !== undefined)
          .map((c) => silToV1Arg({ kind: "object", value: c.state! }))
      });
    }
    fullV1EntryArgs.push(...v1UserArgs);

    // Build placeholder signatureScriptHex to measure exact upper-bound script units via @hardkas/tx-builder
    const placeholderSilArgs: SilArtifactValue[] = [];
    if (needsStatePrefix && hasStateStructPrefix && resolvedContinuations.length === 1 && resolvedContinuations[0]!.state) {
      placeholderSilArgs.push({ kind: "object", value: resolvedContinuations[0]!.state });
    } else if (needsStatePrefix && hasStateArrayPrefix) {
      placeholderSilArgs.push({
        kind: "array",
        value: resolvedContinuations
          .filter((c) => c.state !== undefined)
          .map((c) => ({ kind: "object", value: c.state! }) as SilArtifactValue)
      });
    }
    for (const a of params.args) {
      if (typeof a === "object" && a !== null && a.kind === "signer") {
        placeholderSilArgs.push({ kind: "bytes", value: new Uint8Array(65) });
      } else {
        placeholderSilArgs.push(a as SilArtifactValue);
      }
    }
    let placeholderUnlockHex = "";
    try {
      placeholderUnlockHex = silverUnlockScript(
        inputFactsList[0]!.bytecodeHex,
        encodeSilverEntryArgs({
          artifact: params.contract.artifact,
          contractName: params.contract.contractName,
          entry: abiEntry,
          args: placeholderSilArgs
        })
      );
    } catch {
      placeholderUnlockHex = silverUnlockScript(inputFactsList[0]!.bytecodeHex, "");
    }

    const budgetEst = estimateV1ComputeBudget({
      signatureScriptHex: placeholderUnlockHex,
      scriptPublicKeyHex: primaryUtxo.scriptPublicKey
    });
    const certifiedBudget = proposeComputeBudget({
      kind: isCovenant ? "covenant" : "p2sh",
      templateHash: params.contract.facts.templateHash,
      entry: abiEntry
    });
    const effectiveComputeBudget =
      params.computeBudget === undefined || params.computeBudget === "estimate"
        ? Math.max(certifiedBudget?.budget ?? budgetEst.budget, 15)
        : params.computeBudget;

    // Step 1: Run Level A (SYNTHETIC) validation & transaction construction
    let builtTx: Awaited<ReturnType<typeof buildV1Transaction>> | undefined;
    let structuralPassed = false;
    let structuralErrorCode: string | undefined;
    let structuralErrorMessage: string | undefined;
    let massBreakdown: V1MassMeasure | undefined;
    let planCandidate: Record<string, any> = {};

    try {
      if (!Number.isInteger(effectiveComputeBudget) || effectiveComputeBudget <= 0) {
        const err = new Error(
          `COMPUTE_BUDGET_NON_POSITIVE: computeBudget must be a positive integer, got ${effectiveComputeBudget}`
        );
        (err as any).code = "COMPUTE_BUDGET_NON_POSITIVE";
        throw err;
      }
      if (effectiveComputeBudget > 0xffff) {
        const err = new Error(
          `COMPUTE_BUDGET_EXCEEDED: computeBudget ${effectiveComputeBudget} exceeds u16 maximum (65535)`
        );
        (err as any).code = "COMPUTE_BUDGET_EXCEEDED";
        throw err;
      }
      if (
        params.computeBudget !== undefined &&
        params.computeBudget !== "estimate" &&
        effectiveComputeBudget < budgetEst.budget
      ) {
        const err = new Error(
          `COMPUTE_BUDGET_INSUFFICIENT: declared computeBudget ${effectiveComputeBudget} is below required budget ${budgetEst.budget} (${budgetEst.units} script units)`
        );
        (err as any).code = "COMPUTE_BUDGET_INSUFFICIENT";
        throw err;
      }

      const planInputs = spentUtxos.map((u, idx) => {
        const isDelegate = idx > 0 && isCovenant && silContract.delegate_entry_abi !== undefined;
        const inputEntry = isDelegate ? silContract.delegate_entry_abi! : abiEntry;
        const rawDelArgs = isDelegate
          ? (params.delegateArgsPerInput?.[idx - 1] ?? params.delegateArgs ?? [])
          : [];
        rawDelArgs.forEach((a, i) => assertSafeSilverIntegers(a, `delegateArgs[${idx - 1}][${i}]`));
        const inputArgs = isDelegate
          ? rawDelArgs.map((a) => {
              if (typeof a === "object" && a !== null && a.kind === "signer") {
                return { kind: "signer" as const, signer: a.signer };
              }
              return silToV1Arg(a as SilArtifactValue);
            })
          : fullV1EntryArgs;
        let inputBudget = effectiveComputeBudget;
        if (isDelegate && (params.computeBudget === undefined || params.computeBudget === "estimate")) {
          const delPlaceholderArgs: SilArtifactValue[] = rawDelArgs.map((a) =>
            typeof a === "object" && a !== null && a.kind === "signer"
              ? { kind: "bytes", value: new Uint8Array(65) }
              : (a as SilArtifactValue)
          );
          let delUnlockHex = "";
          try {
            delUnlockHex = silverUnlockScript(
              inputFactsList[idx]!.bytecodeHex,
              encodeSilverEntryArgs({
                artifact: params.contract.artifact,
                contractName: params.contract.contractName,
                entry: inputEntry,
                args: delPlaceholderArgs
              })
            );
          } catch {
            delUnlockHex = silverUnlockScript(inputFactsList[idx]!.bytecodeHex, "");
          }
          const delEst = estimateV1ComputeBudget({
            signatureScriptHex: delUnlockHex,
            scriptPublicKeyHex: u.scriptPublicKey
          });
          inputBudget = Math.max(delEst.budget, 15);
        }
        return {
          outpoint: u.outpoint,
          address: u.address,
          amountSompi: u.amountSompi.toString(),
          scriptPublicKey: u.scriptPublicKey,
          blockDaaScore: u.blockDaaScore.toString(),
          isCoinbase: u.isCoinbase,
          ...(u.covenantId ? { covenantId: u.covenantId } : {}),
          kind: (isCovenant ? "covenant" : "p2sh") as "covenant" | "p2sh",
          computeBudget: inputBudget,
          contract: {
            compileRecord: {
              contentHash: params.contract.compileRecordHash,
              artifactSha256: params.contract.artifactSha256
            },
            contract: params.contract.contractName,
            constructorArgs: params.contract.constructorArgs.map((a) => silToV1Arg(a)),
            ...(u.state
              ? {
                  state: Object.fromEntries(
                    Object.entries(u.state).map(([kField, vVal]) => [kField, silToV1Arg(vVal)])
                  )
                }
              : {}),
            entry: inputEntry,
            ...(isCovenant ? { policy: policyName } : {}),
            args: inputArgs
          },
          ...(params.sequence !== undefined ? { sequence: String(params.sequence) } : {})
        };
      });

      const planOutputs = [
        ...resolvedContinuations.map((c) => ({
          address: c.address,
          amountSompi: c.amountSompi.toString(),
          ...(covenantId
            ? {
                covenant: {
                  authorizingInput: c.authorizingInput,
                  covenantId
                }
              }
            : {})
        })),
        ...(params.extraOutputs ?? []).map((eo) => ({
          address: eo.address,
          amountSompi: eo.amountSompi.toString(),
          role: "payment" as const
        }))
      ];

      const storage =
        v1StorageMass(
          planInputs.map((inp) => ({
            amountSompi: BigInt(inp.amountSompi),
            scriptBytes: inp.scriptPublicKey.length / 2 - 2,
            covenantId: Boolean(inp.covenantId)
          })),
          planOutputs.map((out) => ({
            amountSompi: BigInt(out.amountSompi),
            scriptBytes: (expectedScriptPublicKeyHex(out.address) ?? "0000").length / 2,
            covenantId: Boolean((out as any).covenant)
          }))
        ) ?? 0n;

      const body: V1PlanBody = {
        txVersion: 1,
        inputs: planInputs,
        outputs: planOutputs,
        ...(isCovenant && covenantId
          ? {
              covenantOutpoints: spentUtxos.map(
                (u) => `${u.outpoint.transactionId}:${u.outpoint.index}`
              ),
              nextState: [
                {
                  covenantId,
                  input: 0,
                  outputs: resolvedContinuations.map((_, idx) => idx),
                  states: resolvedContinuations.map((c) =>
                    Object.fromEntries(
                      Object.entries(c.state ?? {}).map(([kField, vVal]) => [
                        kField,
                        silToV1Arg(vVal)
                      ])
                    )
                  )
                }
              ]
            }
          : {}),
        estimatedFeeSompi: feeSompi.toString(),
        estimatedMass: "1000",
        storageMass: storage.toString(),
        maxFeeSompi: (feeSompi > 0n ? feeSompi * 100n : 10_000_000n).toString()
      };

      const toAddr =
        planOutputs[0]?.address ?? primaryUtxo.address;
      const toAmt =
        planOutputs[0] ? BigInt(planOutputs[0].amountSompi) : 0n;

      planCandidate = createV1TxPlanArtifact({
        networkId: networkId as any,
        mode: "localnet" as any,
        from: { input: "covenant", address: primaryUtxo.address },
        to: { input: "continuation", address: toAddr },
        amountSompi: toAmt,
        body,
        ctx: systemRuntimeContext as any
      });

      const liveMap = buildLiveUtxoMap();
      builtTx = await buildV1Transaction({
        plan: planCandidate,
        node: {
          networkId,
          utxosByAddresses: async () => liveMap
        },
        facts: {
          contract: async () => params.contract.facts,
          successor: async (_p: any, idx: number) =>
            resolvedContinuations[idx]?.facts ?? params.contract.facts
        },
        keys: {
          publicKeyOf: (a: string) => getAccount(a).xOnlyPublicKey,
          privateKeyOf: async (a: string) => getAccount(a).privateKeyHex
        }
      });
      massBreakdown = builtTx.validation.mass;
      structuralPassed = true;
    } catch (e: any) {
      structuralPassed = false;
      structuralErrorCode = e?.code ?? "V1_STRUCTURAL_VALIDATION_FAILED";
      structuralErrorMessage = e?.message ?? String(e);
    }

    // If only SYNTHETIC was requested, or if SYNTHETIC failed and SCRIPT_VM is not forced with override keys
    const allSignerArgs = [
      ...params.args,
      ...(params.delegateArgs ?? []),
      ...((params.delegateArgsPerInput ?? []).flat())
    ];
    const hasOverrideSignerKey = allSignerArgs.some(
      (a) => typeof a === "object" && a !== null && a.kind === "signer" && a.overridePrivateKeyHex !== undefined
    );

    if (!backends.includes("SCRIPT_VM") && !backends.includes("CONSENSUS_SIMNET")) {
      const res: CovenantTransitionResult = {
        passed: structuralPassed,
        evidenceLevel: "SYNTHETIC",
        preflightLevel: "STRUCTURAL_PREFLIGHT",
        status: structuralPassed ? "SYNTHETIC_PASS" : "SYNTHETIC_FAIL",
        structuralPassed,
        ...(structuralErrorCode ? { structuralErrorCode } : {}),
        ...(structuralErrorMessage ? { structuralErrorMessage } : {}),
        ...(builtTx ? { txId: builtTx.txId } : {}),
        ...(covenantId ? { covenantId } : {}),
        previousStates: spentUtxos.map((u) => u.state),
        successorUtxos: [],
        computeBudgetUsed: effectiveComputeBudget,
        computeBudgetEstimate: budgetEst,
        ...(massBreakdown ? { massBreakdown } : {}),
        plan: planCandidate,
        ...(builtTx ? { signedArtifact: builtTx.signed } : {})
      };
      recordedResults.push(res);
      return res;
    }

    // If structural check failed for a reason other than an intentional script-level signature override,
    // and SYNTHETIC preflight is active, report it directly.
    if (!structuralPassed && !hasOverrideSignerKey && backends.includes("SYNTHETIC")) {
      const res: CovenantTransitionResult = {
        passed: false,
        evidenceLevel: "SYNTHETIC",
        preflightLevel: "STRUCTURAL_PREFLIGHT",
        status: "SYNTHETIC_FAIL",
        structuralPassed: false,
        ...(structuralErrorCode ? { structuralErrorCode } : {}),
        ...(structuralErrorMessage ? { structuralErrorMessage } : {}),
        ...(covenantId ? { covenantId } : {}),
        previousStates: spentUtxos.map((u) => u.state),
        successorUtxos: [],
        computeBudgetUsed: effectiveComputeBudget,
        computeBudgetEstimate: budgetEst,
        plan: planCandidate
      };
      recordedResults.push(res);
      return res;
    }

    // Step 2: Run Level B (SCRIPT_VM) on the SilverScript runner, only when requested: CONSENSUS_SIMNET does not imply
    // it (R-01), and its own evidence comes from the node.
    let vmResult: SilverVmExecutionResult | undefined;
    if (backends.includes("SCRIPT_VM")) {
      const mapVmArg = (a: (typeof params.args)[number]) => {
        if (typeof a === "object" && a !== null && a.kind === "signer") {
          if (a.overridePrivateKeyHex) {
            return { privateKeyHex: a.overridePrivateKeyHex };
          }
          return { signature: a.signer };
        }
        return a as SilArtifactValue;
      };
      const vmArgs: any[] = [];
      if (needsStatePrefix && hasStateStructPrefix && resolvedContinuations.length === 1 && resolvedContinuations[0]!.state) {
        vmArgs.push({ kind: "object", value: resolvedContinuations[0]!.state });
      } else if (needsStatePrefix && hasStateArrayPrefix) {
        vmArgs.push({
          kind: "array",
          value: resolvedContinuations
            .filter((c) => c.state !== undefined)
            .map((c) => ({ kind: "object", value: c.state! }) as SilArtifactValue)
        });
      }
      vmArgs.push(...params.args.map(mapVmArg));

      const runnerOpt = resolveAvailableSilverRunner(options.runner ?? options.runnerPath, { trust: options.runnerTrust });
      if (!runnerOpt.available || !runnerOpt.runner) {
        const blockedVmResult: SilverVmExecutionResult = {
          evidenceLevel: "SCRIPT_VM",
          status: "BLOCKED",
          outcomeClass: runnerOpt.reasonCode ?? "RUNNER_NOT_FOUND",
          passed: false,
          contractName: params.contract.contractName,
          entrypoint: policyName,
          exitCode: null,
          stdout: "",
          stderr: runnerOpt.message ?? "SilverScript runner unavailable",
          blockedReason: `${runnerOpt.reasonCode ?? "RUNNER_NOT_FOUND"}: ${runnerOpt.message ?? ""}`,
          ...(runnerOpt.identity ? { runnerIdentity: runnerOpt.identity } : {})
        };
        const res: CovenantTransitionResult = {
          passed: false,
          evidenceLevel: "SCRIPT_VM",
          preflightLevel: "SCRIPT_VM_PREFLIGHT",
          status: "BLOCKED",
          structuralPassed,
          ...(structuralErrorCode ? { structuralErrorCode } : {}),
          ...(structuralErrorMessage ? { structuralErrorMessage } : {}),
          vmResult: blockedVmResult,
          ...(covenantId ? { covenantId } : {}),
          previousStates: spentUtxos.map((u) => u.state),
          successorUtxos: [],
          computeBudgetUsed: effectiveComputeBudget,
          computeBudgetEstimate: budgetEst,
          plan: planCandidate
        };
        recordedResults.push(res);
        return res;
      }
      vmResult = await executeSilverVmScenario({
        source: params.contract.source,
        ...(params.contract.sourceFile ? { sourceFile: params.contract.sourceFile } : {}),
        artifact: params.contract.artifact,
        contractName: params.contract.contractName,
        constructorArgs: params.contract.constructorArgs,
        entrypoint: policyName,
        args: vmArgs,
        tx: {
          version: 1,
          lockTime: params.lockTime ?? 0,
          activeInputIndex: 0,
          inputs: spentUtxos.map((u) => ({
            prevTxId: u.outpoint.transactionId,
            prevIndex: u.outpoint.index,
            sequence: params.sequence ?? 0,
            sigOpCount: 100,
            utxoValue: u.amountSompi,
            ...(u.covenantId ? { covenantId: u.covenantId } : {}),
            ...(u.state ? { state: u.state } : {})
          })),
          outputs: [
            ...resolvedContinuations.map((c) => ({
              value: c.amountSompi,
              ...(covenantId ? { covenantId } : {}),
              authorizingInput: c.authorizingInput,
              ...(c.state ? { state: c.state } : {})
            })),
            ...(params.extraOutputs ?? []).map((eo) => {
              const spk = k.payToAddressScript(new k.Address(eo.address));
              const spkObj = typeof spk.serializeToObject === "function" ? spk.serializeToObject() : spk;
              return {
                value: eo.amountSompi,
                scriptHex: String(spkObj.script)
              };
            })
          ]
        },
        signer: (acctName) => getAccount(acctName).privateKeyHex,
        ...(runnerOpt.runner ? { runner: runnerOpt.runner } : {}),
        ...(runnerOpt.identity ? { runnerIdentity: runnerOpt.identity } : {}),
        ...(options.runnerTrust ? { runnerTrust: options.runnerTrust } : {}),
        captureTrace: params.captureTrace
      });

      if (vmResult.passed && spentUtxos.length > 1 && isCovenant && silContract.delegate_entry_abi) {
        for (let delIdx = 1; delIdx < spentUtxos.length; delIdx++) {
          const rawDelArgs = params.delegateArgsPerInput?.[delIdx - 1] ?? params.delegateArgs ?? [];
          const delVmArgs = rawDelArgs.map(mapVmArg);
          const delVmResult = await executeSilverVmScenario({
            source: params.contract.source,
            ...(params.contract.sourceFile ? { sourceFile: params.contract.sourceFile } : {}),
            artifact: params.contract.artifact,
            contractName: params.contract.contractName,
            constructorArgs: params.contract.constructorArgs,
            entrypoint: silContract.delegate_entry_abi,
            args: delVmArgs,
            tx: {
              version: 1,
              lockTime: params.lockTime ?? 0,
              activeInputIndex: delIdx,
              inputs: spentUtxos.map((u) => ({
                prevTxId: u.outpoint.transactionId,
                prevIndex: u.outpoint.index,
                sequence: params.sequence ?? 0,
                sigOpCount: 100,
                utxoValue: u.amountSompi,
                ...(u.covenantId ? { covenantId: u.covenantId } : {}),
                ...(u.state ? { state: u.state } : {})
              })),
              outputs: [
                ...resolvedContinuations.map((c) => ({
                  value: c.amountSompi,
                  ...(covenantId ? { covenantId } : {}),
                  authorizingInput: c.authorizingInput,
                  ...(c.state ? { state: c.state } : {})
                })),
                ...(params.extraOutputs ?? []).map((eo) => {
                  const spk = k.payToAddressScript(new k.Address(eo.address));
                  const spkObj = typeof spk.serializeToObject === "function" ? spk.serializeToObject() : spk;
                  return {
                    value: eo.amountSompi,
                    scriptHex: String(spkObj.script)
                  };
                })
              ]
            },
            signer: (acctName) => getAccount(acctName).privateKeyHex,
            ...(runnerOpt.runner ? { runner: runnerOpt.runner } : {}),
            ...(runnerOpt.identity ? { runnerIdentity: runnerOpt.identity } : {}),
            ...(options.runnerTrust ? { runnerTrust: options.runnerTrust } : {}),
            captureTrace: params.captureTrace
          });
          if (!delVmResult.passed || delVmResult.status === "BLOCKED") {
            vmResult = delVmResult;
            break;
          }
        }
      }

      if (vmResult.status === "BLOCKED") {
        const res: CovenantTransitionResult = {
          passed: false,
          evidenceLevel: "SCRIPT_VM",
          preflightLevel: "SCRIPT_VM_PREFLIGHT",
          status: "BLOCKED",
          structuralPassed,
          ...(structuralErrorCode ? { structuralErrorCode } : {}),
          ...(structuralErrorMessage ? { structuralErrorMessage } : {}),
          vmResult,
          ...(covenantId ? { covenantId } : {}),
          previousStates: spentUtxos.map((u) => u.state),
          successorUtxos: [],
          computeBudgetUsed: effectiveComputeBudget,
          computeBudgetEstimate: budgetEst,
          plan: planCandidate
        };
        recordedResults.push(res);
        return res;
      }

      if (!vmResult.passed) {
        const res: CovenantTransitionResult = {
          passed: false,
          evidenceLevel: "SCRIPT_VM",
          preflightLevel: "SCRIPT_VM_PREFLIGHT",
          status: "SCRIPT_VM_FAIL",
          structuralPassed,
          ...(structuralErrorCode ? { structuralErrorCode } : {}),
          ...(structuralErrorMessage ? { structuralErrorMessage } : {}),
          vmResult,
          ...(vmResult.diagnostic ? { diagnostic: vmResult.diagnostic } : {}),
          ...(builtTx ? { txId: builtTx.txId } : {}),
          ...(covenantId ? { covenantId } : {}),
          previousStates: spentUtxos.map((u) => u.state),
          successorUtxos: [],
          computeBudgetUsed: effectiveComputeBudget,
          computeBudgetEstimate: budgetEst,
          ...(massBreakdown ? { massBreakdown } : {}),
          plan: planCandidate,
          ...(builtTx ? { signedArtifact: builtTx.signed } : {})
        };
        recordedResults.push(res);
        return res;
      }
    }

    // R-03: the structural (F1.4) validation is mandatory. A transition it refuses never passes, whatever the runner says:
    // the VM verdict (when it ran) stays in `vmResult`, apart from the transition's.
    if (!structuralPassed) {
      const res: CovenantTransitionResult = {
        passed: false,
        evidenceLevel: vmResult ? "SCRIPT_VM" : "SYNTHETIC",
        preflightLevel: vmResult ? "SCRIPT_VM_PREFLIGHT" : "STRUCTURAL_PREFLIGHT",
        status: "SYNTHETIC_FAIL",
        structuralPassed: false,
        ...(structuralErrorCode ? { structuralErrorCode } : {}),
        ...(structuralErrorMessage ? { structuralErrorMessage } : {}),
        ...(vmResult ? { vmResult } : {}),
        ...(covenantId ? { covenantId } : {}),
        previousStates: spentUtxos.map((u) => u.state),
        successorUtxos: [],
        computeBudgetUsed: effectiveComputeBudget,
        computeBudgetEstimate: budgetEst,
        plan: planCandidate
      };
      recordedResults.push(res);
      return res;
    }

    // Step 3: CONSENSUS_SIMNET. R-01: a pass needs the node's answer naming the expected txid AND the transaction's effect
    // observed in the node's UTXO index (submitAndObserveConsensus); a submission alone is never one.
    // Unified Lifecycle: assemble immutable CovenantTransitionFact (IC-2'.3 / Wave 2a)
    let transitionFact: CovenantTransitionFact | undefined;
    if (planCandidate && builtTx && primaryUtxo) {
      try {
        const planId = checkArtifactIdentity(planCandidate);
        const draftId = builtTx.signed ? checkArtifactIdentity(builtTx.signed) : undefined;
        const outpoint = { transactionId: String(primaryUtxo.outpoint.transactionId), index: Number(primaryUtxo.outpoint.index) };
        const succOutpoint = resolvedContinuations[0]
          ? { transactionId: builtTx.txId, index: 0 }
          : undefined;
        transitionFact = createCovenantTransitionFactArtifact({
          networkId,
          covenantId: covenantId ?? primaryUtxo.covenantId ?? "00".repeat(32),
          contractName: params.contract.contractName,
          artifactSha256: params.contract.artifactSha256,
          entrypoint: policyName,
          ...(params.policy ? { policy: params.policy } : {}),
          ...(primaryUtxo.state ? { previousState: primaryUtxo.state } : {}),
          ...(params.nextStates[0]?.state ? { nextState: params.nextStates[0].state as any } : {}),
          spentOutpoint: outpoint,
          ...(succOutpoint ? { successorOutpoint: succOutpoint } : {}),
          ...(resolvedContinuations[0]?.amountSompi ? { successorAmountSompi: String(resolvedContinuations[0].amountSompi) } : {}),
          planArtifactId: planId.ok ? planId.artifactId : "00".repeat(32),
          ...(draftId?.ok ? { draftArtifactId: draftId.artifactId } : {}),
          txId: builtTx.txId,
          validation: {
            structuralPassed,
            ...(vmResult ? { scriptVmPassed: vmResult.passed, vmStatus: vmResult.status, diagnostic: vmResult.diagnostic?.message } : {})
          }
        });
      } catch {
        // fact remains undefined if parameter validation fails
      }
    }

    const computeCovenantStatus = (txOutcome?: string): CovenantStatusResult | undefined => {
      if (!transitionFact) return undefined;
      const statusKind = txOutcome === "CONFIRMED"
        ? "CONFIRMED"
        : txOutcome === "REJECTED"
          ? "REJECTED_BY_NODE"
          : consensus?.outcome === "CONFIRMED"
            ? "CONFIRMED"
            : vmResult?.passed
              ? "SYNTHETIC_EXECUTED"
              : undefined;

      const dummyDerived = statusKind
        ? {
            txId: builtTx?.txId ?? "",
            status: statusKind as any,
            policy: { policyId: "hardkas.policy.v1", policyVersion: 1, origin: "hardkas-product-default" as const, minConfirmations: 10, confirmationUnit: "blue-score" as const },
            perObserver: [],
            observers: [],
            evidence: { observationArtifactIds: [], ignored: [] },
            reasons: [consensus?.detail ?? "Covenant transition preflight execution"],
            isFinal: statusKind === "CONFIRMED" || statusKind === "REJECTED_BY_NODE"
          }
        : undefined;

      return deriveCovenantStatus({
        transitionFact,
        txStatus: dummyDerived,
        isTerminated: resolvedContinuations.length === 0
      });
    };

    let consensus: ConsensusSubmissionEvidence | undefined;
    if (backends.includes("CONSENSUS_SIMNET")) {
      if (!options.simnetRpc || !builtTx) {
        const res: CovenantTransitionResult = {
          passed: false,
          evidenceLevel: "CONSENSUS_SIMNET",
          preflightLevel: "CONSENSUS_SIMNET_PREFLIGHT",
          status: "BLOCKED",
          structuralPassed,
          ...(structuralErrorCode ? { structuralErrorCode } : {}),
          ...(structuralErrorMessage ? { structuralErrorMessage } : {}),
          ...(vmResult ? { vmResult } : {}),
          ...(covenantId ? { covenantId } : {}),
          previousStates: spentUtxos.map((u) => u.state),
          successorUtxos: [],
          computeBudgetUsed: effectiveComputeBudget,
          computeBudgetEstimate: budgetEst,
          plan: planCandidate,
          consensus: {
            expectedTxId: builtTx?.txId ?? "",
            stagesReached: builtTx ? ["BUILT"] : [],
            outcome: "NOT_SENT",
            detail: builtTx
              ? "NO_SIMNET_RPC: no simnetRpc is configured; nothing was sent"
              : `NOT_BUILT: the transaction could not be built (${structuralErrorCode ?? "unknown"}); nothing was sent`
          }
        };
        recordedResults.push(res);
        return res;
      }

      consensus = await submitAndObserveConsensus(options.simnetRpc, {
        rpcTransaction: builtTx.rpcTransaction,
        expectedTxId: builtTx.txId,
        // the plan's outputs, in order: the continuations, then the extra outputs
        outputs: [
          ...resolvedContinuations.map((c, idx) => ({
            address: c.address,
            index: idx,
            amountSompi: c.amountSompi,
            ...(covenantId ? { covenantId } : {})
          })),
          ...(params.extraOutputs ?? []).map((eo, j) => ({
            address: eo.address,
            index: resolvedContinuations.length + j,
            amountSompi: eo.amountSompi
          }))
        ],
        spentInputs: spentUtxos.map((u) => ({ address: u.address, outpoint: u.outpoint })),
        observation: options.consensusObservation
      });
      if (consensus.outcome !== "CONFIRMED") {
        const res: CovenantTransitionResult = {
          passed: false,
          evidenceLevel: "CONSENSUS_SIMNET",
          preflightLevel: "CONSENSUS_SIMNET_PREFLIGHT",
          status:
            consensus.outcome === "REJECTED"
              ? "CONSENSUS_SIMNET_FAIL"
              : consensus.outcome === "NOT_SENT"
                ? "BLOCKED"
                : "CONSENSUS_SIMNET_INCONCLUSIVE",
          structuralPassed,
          ...(vmResult ? { vmResult } : {}),
          txId: builtTx.txId,
          ...(covenantId ? { covenantId } : {}),
          previousStates: spentUtxos.map((u) => u.state),
          successorUtxos: [],
          computeBudgetUsed: effectiveComputeBudget,
          computeBudgetEstimate: budgetEst,
          ...(massBreakdown ? { massBreakdown } : {}),
          plan: planCandidate,
          signedArtifact: builtTx.signed,
          simnetConfirmed: false,
          ...(transitionFact ? { transitionFact } : {}),
          ...(computeCovenantStatus(consensus.outcome) ? { covenantStatus: computeCovenantStatus(consensus.outcome) } : {}),
          consensus
        };
        recordedResults.push(res);
        return res;
      }
    }

    // Transition passed! Commit UTXO transition in testbed ledger
    const txId = builtTx?.txId ?? vmResult?.scenarioTxId ?? (txCounter++).toString(16).padStart(64, "0");
    for (const u of spentUtxos) {
      utxos.delete(outpointKey(u.outpoint));
    }

    const successorUtxos: CovenantLiveUtxo[] = resolvedContinuations.map((c, idx) => {
      const succ: CovenantLiveUtxo = {
        outpoint: { transactionId: txId, index: idx },
        address: c.address,
        amountSompi: c.amountSompi,
        scriptPublicKey: c.scriptPublicKey,
        ...(covenantId ? { covenantId } : {}),
        ...(c.state ? { state: c.state } : {}),
        contract: params.contract,
        blockDaaScore: primaryUtxo.blockDaaScore + 1n,
        isCoinbase: false
      };
      utxos.set(outpointKey(succ.outpoint), succ);
      return succ;
    });

    if (builtTx) {
      txHistory.set(txId, { plan: planCandidate, signed: builtTx.signed, rpcTx: builtTx.rpcTransaction });
    }

    const reachedSimnet = consensus?.outcome === "CONFIRMED";
    const res: CovenantTransitionResult = {
      passed: true,
      evidenceLevel: reachedSimnet ? "CONSENSUS_SIMNET" : "SCRIPT_VM",
      preflightLevel: reachedSimnet ? "CONSENSUS_SIMNET_PREFLIGHT" : "SCRIPT_VM_PREFLIGHT",
      status: reachedSimnet ? "CONSENSUS_SIMNET_PASS" : "SCRIPT_VM_PASS",
      // R-03: never asserted, the validation's own answer (refusals returned above)
      structuralPassed,
      ...(vmResult ? { vmResult } : {}),
      txId,
      ...(covenantId ? { covenantId } : {}),
      previousStates: spentUtxos.map((u) => u.state),
      successorUtxos,
      computeBudgetUsed: effectiveComputeBudget,
      computeBudgetEstimate: budgetEst,
      ...(massBreakdown ? { massBreakdown } : {}),
      plan: planCandidate,
      ...(builtTx ? { signedArtifact: builtTx.signed } : {}),
      ...(reachedSimnet ? { simnetConfirmed: true, consensus } : {}),
      ...(transitionFact ? { transitionFact } : {}),
      ...(computeCovenantStatus(reachedSimnet ? "CONFIRMED" : undefined) ? { covenantStatus: computeCovenantStatus(reachedSimnet ? "CONFIRMED" : undefined) } : {})
    };
    recordedResults.push(res);
    return res;
  }

  async function auditContract(contract: CompiledCovenantContract): Promise<CovenantStaticAnalysisReport> {
    return analyzeSilverScriptSecurity({
      source: contract.source,
      file: contract.sourceFile,
      ast: contract.ast,
      artifact: contract.artifact
    });
  }

  function toJsonReport() {
    return {
      schema: "hardkas.covenantTestReport.v1",
      createdAt: new Date().toISOString(),
      network: networkId,
      totalTransitions: recordedResults.length,
      passedTransitions: recordedResults.filter((r) => r.passed).length,
      failedTransitions: recordedResults.filter((r) => !r.passed).length,
      results: recordedResults.map((r) => ({
        status: r.status,
        passed: r.passed,
        evidenceLevel: r.evidenceLevel,
        preflightLevel: r.preflightLevel,
        structuralPassed: r.structuralPassed,
        structuralErrorCode: r.structuralErrorCode ?? null,
        txId: r.txId ?? null,
        covenantId: r.covenantId ?? null,
        computeBudgetUsed: r.computeBudgetUsed ?? null,
        consensus: r.consensus
          ? {
              outcome: r.consensus.outcome,
              stagesReached: r.consensus.stagesReached,
              expectedTxId: r.consensus.expectedTxId,
              detail: r.consensus.detail
            }
          : null,
        diagnostic: r.diagnostic
          ? {
              message: r.diagnostic.message,
              sourceLocationStatus: r.diagnostic.sourceLocationStatus,
              location: r.diagnostic.location ?? null,
              failedStatement: r.diagnostic.failedStatement ?? null,
              variables: r.diagnostic.variables
            }
          : null
      }))
    };
  }

  return {
    networkId,
    registerAccount,
    getAccount,
    fundAccount,
    compileContract,
    deployGenesis,
    deployP2sh,
    executeTransition,
    auditContract,
    /**
     * Brings a UTXO that exists outside the testbed (e.g. a covenant genesis confirmed on an isolated simnet node by
     * `createFundedCovenant`) into its ledger, so CONSENSUS_SIMNET transitions can spend it. Returns it.
     */
    adoptLiveUtxo: (utxo: CovenantLiveUtxo): CovenantLiveUtxo => {
      utxos.set(outpointKey(utxo.outpoint), utxo);
      return utxo;
    },
    getLiveUtxos: () => [...utxos.values()],
    getRecordedResults: () => [...recordedResults],
    toJsonReport
  };
}
