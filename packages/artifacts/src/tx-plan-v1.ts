import { assertV1PlanShape, type V1PlanBody } from "@hardkas/tx-builder";
import { HardkasSchemas, redactUrlCredentials, type ExecutionMode, type NetworkId, type RuntimeContext } from "@hardkas/core";
import { ARTIFACT_VERSION, type TxPlan } from "./schemas.js";
import { CURRENT_HASH_VERSION } from "./canonical.js";
import { HARDKAS_VERSION } from "./constants.js";
import { deriveIntentWorkflowId, finalizeTxPlanIdentity } from "./tx-plan.js";

/**
 * F1.1 · a v1 transaction plan artifact: the TxPlan schema (`hardkas.txPlan`) with `txVersion: 1` and the v1 fields
 * (per-input kind, compute budget and contract reference; output bindings and genesis groups; payload; storage mass; the
 * mandatory fee limit; the covenant outpoints it spends; the declared next state). Its shape is checked
 * (assertV1PlanShape) before its identity is sealed, so an artifact that exists is at least well-formed; what the node
 * and the compiler say about it is checked at signing (F1.4).
 */
export interface CreateV1TxPlanArtifactOptions {
  readonly networkId: NetworkId;
  readonly mode: ExecutionMode;
  /** The funder (who pays the fee and receives the change). */
  readonly from: { readonly input: string; readonly address: string; readonly accountName?: string | undefined };
  /** The primary destination (a covenant or contract address, or a payee). */
  readonly to: { readonly input: string; readonly address: string };
  /** The value the plan moves to `to` (for a covenant: the value locked in it). */
  readonly amountSompi: bigint;
  readonly body: V1PlanBody;
  readonly rpcUrl?: string | undefined;
  readonly ctx: RuntimeContext;
  /** What produced the plan, recorded as plannerAuthorityDetail (e.g. "covenant genesis", "covenant transition"). */
  readonly purpose?: string | undefined;
}

const copyArg = (v: any): any => JSON.parse(JSON.stringify(v));

export function createV1TxPlanArtifact(options: CreateV1TxPlanArtifactOptions): TxPlan {
  const b = options.body;
  const workflowId =
    options.ctx.workflowId ??
    deriveIntentWorkflowId({
      networkId: String(options.networkId),
      mode: String(options.mode),
      fromAddress: options.from.address,
      toAddress: options.to.address,
      amountSompi: options.amountSompi.toString(),
      outpoints: b.inputs.map((i) => ({ transactionId: i.outpoint.transactionId, index: i.outpoint.index }))
    });

  const artifact: Record<string, any> = {
    schema: HardkasSchemas.TxPlan,
    hardkasVersion: HARDKAS_VERSION,
    schemaVersion: HardkasSchemas.ArtifactV1,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(options.ctx.clock.now()).toISOString(),
    networkId: options.networkId,
    mode: options.mode,
    execution: { mode: options.mode as any, domain: "kaspa-l1", network: options.networkId },
    from: { address: options.from.address, ...(options.from.accountName !== undefined ? { accountName: options.from.accountName } : {}), input: options.from.input },
    to: { address: options.to.address, input: options.to.input },
    amountSompi: options.amountSompi.toString(),
    estimatedFeeSompi: b.estimatedFeeSompi,
    estimatedMass: b.estimatedMass,
    txVersion: 1,
    storageMass: b.storageMass,
    inputs: b.inputs.map((i) => ({
      outpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index },
      amountSompi: i.amountSompi,
      address: i.address,
      scriptPublicKey: i.scriptPublicKey,
      ...(i.blockDaaScore !== undefined ? { blockDaaScore: i.blockDaaScore } : {}),
      ...(i.isCoinbase !== undefined ? { isCoinbase: i.isCoinbase } : {}),
      ...(i.covenantId !== undefined ? { covenantId: i.covenantId } : {}),
      kind: i.kind,
      computeBudget: i.computeBudget,
      ...(i.contract !== undefined ? { contract: copyArg(i.contract) } : {}),
      ...(i.signer !== undefined ? { signer: i.signer } : {})
    })),
    outputs: b.outputs.map((o) => ({
      address: o.address,
      amountSompi: o.amountSompi,
      ...(o.covenant !== undefined ? { covenant: { authorizingInput: o.covenant.authorizingInput, covenantId: o.covenant.covenantId } } : {}),
      ...(o.role !== undefined ? { role: o.role } : {})
    })),
    ...(b.genesisCovenantGroups !== undefined && b.genesisCovenantGroups.length > 0
      ? {
          genesisCovenantGroups: b.genesisCovenantGroups.map((g) => ({
            authorizingInput: g.authorizingInput,
            outputs: [...g.outputs],
            ...(g.contract !== undefined ? { contract: copyArg(g.contract) } : {}),
            ...(g.covenantId !== undefined ? { covenantId: g.covenantId } : {}),
            ...(g.states !== undefined ? { states: copyArg(g.states) } : {})
          }))
        }
      : {}),
    ...(b.payload !== undefined && b.payload !== "" ? { payload: b.payload } : {}),
    ...(b.covenantOutpoints !== undefined && b.covenantOutpoints.length > 0 ? { covenantOutpoints: [...b.covenantOutpoints] } : {}),
    ...(b.nextState !== undefined && b.nextState.length > 0 ? { nextState: copyArg(b.nextState) } : {}),
    ...(b.maxFeeSompi !== undefined ? { maxFeeSompi: b.maxFeeSompi } : {}),
    rpcUrl: options.rpcUrl ? redactUrlCredentials(options.rpcUrl) : options.rpcUrl,
    lineage: { artifactId: "", sequence: 1 },
    workflowId,
    metadata: { schema: HardkasSchemas.ArtifactV1 },
    assumptionLevel: options.ctx.assumptionLevel || (options.mode === "simulator" ? "local-simulated" : "local-dev"),
    plannerAuthority: "HARDKAS_V1_PLANNER",
    plannerAuthorityDetail: `v1 transaction plan${options.purpose ? ` (${options.purpose})` : ""}: inputs, bindings, budgets and fee chosen by HardKAS; mass and fee floor by the rusty-kaspa 2.1.0 rules`
  };
  if (artifact.rpcUrl === undefined) delete artifact.rpcUrl;
  assertV1PlanShape(artifact);
  return finalizeTxPlanIdentity(artifact as any) as TxPlan;
}
