import path from "node:path";
import { HardkasError } from "@hardkas/core";
import type { Hardkas } from "@hardkas/sdk";

/**
 * F1.10 · `hardkas silver engine`: the v1 engine of the SDK (`sdk.covenants`) driven from the CLI. A JSON spec is read as
 * the SDK's own options (sompi amounts as decimal strings) and handed to the SDK: the same planner, the same F1.4
 * validation before any key is read, the same signing, the same artifacts and the same typed errors. The send is the one
 * send of every HardKAS transaction (`hardkas tx send`, F1.6). The CLI adds no rule of its own; it only parses the spec
 * and finds the keystore password of the accounts a plan names.
 */

export const SILVER_ENGINE_OPS = ["genesis", "transition", "deploy", "spend"] as const;
export type SilverEngineOp = (typeof SILVER_ENGINE_OPS)[number];

const SPEC_KEYS: Record<SilverEngineOp, readonly string[]> = {
  genesis: ["contract", "outputs", "funder", "feeSompi", "maxFeeSompi"],
  transition: ["covenantId", "inputs", "continuations", "payments", "funder", "feeSompi", "maxFeeSompi"],
  deploy: ["contract", "amountSompi", "state", "funder", "feeSompi", "maxFeeSompi"],
  spend: ["outpoint", "contract", "payments", "computeBudget", "maxFeeSompi"]
};

const invalid = (message: string) => new HardkasError("SILVER_ENGINE_SPEC_INVALID", message);

function sompi(value: unknown, where: string): bigint {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw invalid(`${where}: a sompi amount is a decimal string (or a safe integer)`);
}

function list(value: unknown, where: string): any[] {
  if (!Array.isArray(value)) throw invalid(`${where}: a JSON list`);
  return value;
}

function object(value: unknown, where: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(`${where}: a JSON object`);
  return value as Record<string, any>;
}

/** The SDK options of one engine operation, from its JSON spec: amounts become bigint; nothing else is changed. */
export function engineOptionsOf(op: SilverEngineOp, spec: unknown): any {
  if (!SILVER_ENGINE_OPS.includes(op)) throw invalid(`'${String(op)}' is not an engine operation (${SILVER_ENGINE_OPS.join(", ")})`);
  const s = object(spec, "the spec");
  const unknown = Object.keys(s).filter((k) => !SPEC_KEYS[op].includes(k));
  if (unknown.length > 0) throw invalid(`the ${op} spec does not take ${unknown.join(", ")} (it takes ${SPEC_KEYS[op].join(", ")})`);
  const fees = {
    ...(s.feeSompi !== undefined ? { feeSompi: sompi(s.feeSompi, "feeSompi") } : {}),
    ...(s.maxFeeSompi !== undefined ? { maxFeeSompi: sompi(s.maxFeeSompi, "maxFeeSompi") } : {})
  };
  const amounts = (items: unknown, where: string) =>
    list(items, where).map((o, i) => ({ ...object(o, `${where}[${i}]`), amountSompi: sompi(o?.amountSompi, `${where}[${i}].amountSompi`) }));
  switch (op) {
    case "genesis":
      return { ...s, outputs: amounts(s.outputs, "outputs"), ...fees };
    case "transition":
      return { ...s, continuations: amounts(s.continuations, "continuations"), ...(s.payments !== undefined ? { payments: amounts(s.payments, "payments") } : {}), ...fees };
    case "deploy":
      return { ...s, amountSompi: sompi(s.amountSompi, "amountSompi"), ...fees };
    case "spend":
      return { ...s, payments: amounts(s.payments, "payments"), ...fees };
  }
}

/** Plans one engine operation with the SDK (the plan is sealed and stored in the workspace by the SDK). */
export async function runSilverEnginePlan(sdk: Hardkas, op: SilverEngineOp, spec: unknown): Promise<{ plan: any; path: string }> {
  const options = engineOptionsOf(op, spec);
  const c = sdk.covenants;
  const plan =
    op === "genesis"
      ? await c.planGenesis(options)
      : op === "transition"
        ? await c.planTransition(options)
        : op === "deploy"
          ? await c.planContractDeploy(options)
          : await c.planContractSpend(options);
  return { plan, path: await storePathOf(sdk, plan) };
}

/** The accounts a v1 plan signs with: its P2PK inputs' signers and the signer slots of its contract arguments. */
export function engineSignersOf(plan: any): string[] {
  const found = new Set<string>();
  const visit = (v: any) => {
    if (!v || typeof v !== "object") return;
    if (v.kind === "signer" && typeof v.signer === "string") found.add(v.signer);
    if (v.kind === "array" && Array.isArray(v.value)) v.value.forEach(visit);
    if (v.kind === "object" && v.value && typeof v.value === "object") Object.values(v.value).forEach(visit);
  };
  for (const input of Array.isArray(plan?.inputs) ? plan.inputs : []) {
    if (typeof input?.signer === "string") found.add(input.signer);
    for (const a of Array.isArray(input?.contract?.args) ? input.contract.args : []) visit(a);
  }
  return [...found];
}

/** The plan's signers that are encrypted accounts of this workspace (their owner's keystore password opens them). */
export async function encryptedEngineSigners(sdk: Hardkas, plan: unknown): Promise<string[]> {
  const { resolveHardkasAccount } = await import("@hardkas/accounts");
  const { accountNeedsKeystorePassword } = await import("./tx-sign-runner.js");
  return engineSignersOf(plan).filter((name) => {
    try {
      return accountNeedsKeystorePassword(
        resolveHardkasAccount({ nameOrAddress: name, config: { ...sdk.config.config, cwd: sdk.workspace.root } as any, executionTarget: sdk.execution as any })
      );
    } catch {
      return false; // not an account of this workspace: the engine reports it
    }
  });
}

/**
 * Signs a v1 plan with the SDK's engine. F1.4 runs first, without any key (sdk.covenants.check): a plan the engine refuses
 * never asks for a password. Then the keystore password, when an encrypted account signs (`password` asks for it), then
 * the engine signs (F1.4 again, then each key once).
 */
export async function runSilverEngineSign(
  sdk: Hardkas,
  plan: unknown,
  options: { readonly password?: ((accounts: readonly string[]) => Promise<string | undefined>) | undefined } = {}
): Promise<{ signed: any; txId: string; warnings: readonly string[]; feeSompi: bigint; mass: any; path: string }> {
  await sdk.covenants.check(plan);
  const encrypted = await encryptedEngineSigners(sdk, plan);
  const keystorePassword = encrypted.length > 0 && options.password ? await options.password(encrypted) : undefined;
  const r = await sdk.covenants.sign(plan, keystorePassword !== undefined ? { keystorePassword } : {});
  return { ...r, path: await storePathOf(sdk, r.signed) };
}

/** Where the workspace store holds an artifact the SDK wrote (nothing is written here). */
async function storePathOf(sdk: Hardkas, artifact: any): Promise<string> {
  const { storeEntryFor } = await import("@hardkas/artifacts");
  return path.join(sdk.workspace.root, ".hardkas", "artifacts", storeEntryFor(artifact).rel);
}
