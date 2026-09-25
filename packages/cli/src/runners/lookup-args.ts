import type { LookupNamespace } from "@hardkas/artifacts";

// Wave 1.2 · Closure Pack IC-5′.2 · CLI surface of the namespaced lookups:
// `--artifact <id|path>`, `--plan <planId>`, `--signed <signedId>`, `--tx <txId>`,
// `--workflow <workflowId>`, or the bare positional (contained path or 64-hex artifactId).

export interface LookupFlags {
  artifact?: string;
  plan?: string;
  signed?: string;
  tx?: string;
  workflow?: string;
}

export interface LookupArgs {
  input: string;
  namespace?: LookupNamespace;
}

export class LookupUsageError extends Error {
  readonly code = "LOOKUP_USAGE";
}

export function lookupFromArgs(positional: string | undefined, flags: LookupFlags): LookupArgs {
  const given: Array<[LookupNamespace, string]> = [];
  for (const ns of ["artifact", "plan", "signed", "tx", "workflow"] as const) {
    const v = flags[ns];
    if (typeof v === "string" && v.length > 0) given.push([ns, v]);
  }
  if (positional !== undefined && positional.length > 0) given.push(["artifact", positional]);
  if (given.length === 0) {
    throw new LookupUsageError("Pass a 64-hex artifactId or a workspace path, or one of --plan, --signed, --tx, --workflow");
  }
  if (given.length > 1) {
    throw new LookupUsageError(`Pass exactly one target (got ${given.map(([ns, v]) => `${ns}=${v}`).join(", ")})`);
  }
  const [namespace, input] = given[0]!;
  // The bare positional and --artifact share the untyped contract (path or artifactId).
  return namespace === "artifact" ? { input } : { input, namespace };
}

/** Human hint for a NAMESPACE_REQUIRED error raised by the resolver. */
export function namespaceRequiredHint(command: string, error: any): string {
  const replacement = error?.context?.replacement;
  const namespace = error?.context?.namespace;
  if (replacement && namespace) {
    return `run: hardkas ${command} --${namespace} ${String((replacement as Record<string, string>)[namespace])}`;
  }
  return `pass a 64-hex artifactId or a workspace path, or name the namespace with --plan, --signed, --tx or --workflow`;
}
