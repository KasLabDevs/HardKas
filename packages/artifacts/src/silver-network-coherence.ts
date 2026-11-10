import { HardkasSchemas, addressPrefixMatchesNetwork, addressPrefixNetworkHint, networkFamilyOf } from "@hardkas/core";

// INT9-A (I-1) · offline coherence of a Silver record with the network it names. The schema says which networks a
// record may name; this says whether the rest of the record agrees with it:
//  - the node the record names must have reported that same network (`node.network`): a devnet record whose node
//    served simnet (or the reverse) is never accepted silently;
//  - every address the record carries must have the prefix of that network's family. A prefix proves nothing by
//    itself (every testnet shares `kaspatest`), but a prefix of ANOTHER family disproves the record's network;
//  - `mode: "localnet"` with a node proven by its endpoint is the label records carried before INT9-A (review M-3):
//    still valid, reported as a warning, and read by `node.verification`, never by the mode.
// Pure and offline: nothing is contacted, on any network (mainnet included).

export interface SilverCoherenceIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly path?: string;
}

const SILVER_RECORD_SCHEMAS: ReadonlySet<string> = new Set([
  HardkasSchemas.SilverCompileV1,
  HardkasSchemas.SilverDeployV1,
  HardkasSchemas.SilverSpendV1,
  HardkasSchemas.SilverCovenantV1
]);

export function checkSilverRecordNetworkCoherence(record: unknown): SilverCoherenceIssue[] {
  const v = record as Record<string, any> | null | undefined;
  if (!v || typeof v !== "object" || !SILVER_RECORD_SCHEMAS.has(String(v.schema))) return [];
  const networkId = v.networkId;
  if (!networkFamilyOf(networkId)) return []; // the schema refuses it; nothing more to compare against
  const issues: SilverCoherenceIssue[] = [];

  const node = v.node as Record<string, unknown> | undefined;
  if (node && typeof node.network === "string" && node.network !== networkId) {
    issues.push({
      code: "NETWORK_IDENTITY_MISMATCH",
      severity: "error",
      message: `the record says ${networkId} but the node it names reported ${node.network}: one network is never read as another`,
      path: "node.network"
    });
  }

  const addresses: Array<[string, unknown]> = [];
  if (v.address !== undefined) addresses.push(["address", v.address]);
  if (v.to !== undefined) addresses.push(["to", v.to]);
  if (Array.isArray(v.contracts)) v.contracts.forEach((c: any, i: number) => addresses.push([`contracts.${i}.address`, c?.address]));
  for (const [path, address] of addresses) {
    if (typeof address !== "string") continue;
    if (!addressPrefixMatchesNetwork(address, networkId)) {
      const hint = addressPrefixNetworkHint(address);
      issues.push({
        code: "NETWORK_ADDRESS_PREFIX_MISMATCH",
        severity: "error",
        message: `${path} ${address.slice(0, Math.max(0, address.indexOf(":")) + 1) || address} is ${hint ? `a ${hint} address` : "not a Kaspa address"}, the record says ${networkId}`,
        path
      });
    }
  }

  if (v.mode === "localnet" && node?.verification === "endpoint") {
    issues.push({
      code: "LEGACY_MODE_LABEL",
      severity: "warning",
      message: `mode "localnet" on a record whose node was proven by its endpoint (written before INT9-A): read as an rpc record, by node.verification`,
      path: "mode"
    });
  }
  if (v.mode === "rpc" && node && node.verification !== "endpoint") {
    issues.push({
      code: "NETWORK_IDENTITY_MISMATCH",
      severity: "error",
      message: `mode "rpc" names a node HardKAS does not manage, but the record's node claims a container check`,
      path: "mode"
    });
  }
  return issues;
}
