import fs from "node:fs";
import path from "node:path";
import { HardkasCliError, HardkasExitCode } from "@hardkas/cli/extension-kit";
import type { LocalNode } from "./local-node.js";
import { readWorkspaceJson } from "../compile/forge-build.js";

/**
 * L2-EXT stage 6 · where each contract was deployed, per local node instance. Anvil keeps its state in memory, so an
 * address recorded for another instance (another PID or start time) no longer exists: it is refused as stale instead
 * of being called.
 */
export const L2_DEPLOYMENTS_SCHEMA = "hardkas.l2Deployments.v1";

export interface L2Deployment {
  readonly key: string;
  readonly address: `0x${string}`;
  readonly txHash: `0x${string}`;
  readonly deployedAt: string;
}

interface DeploymentsFile {
  readonly schema: typeof L2_DEPLOYMENTS_SCHEMA;
  readonly node: { readonly pid: number; readonly startedAt: string; readonly chainId: number };
  readonly contracts: Record<string, L2Deployment>;
}

const fileOf = (root: string) => path.join(root, ".hardkas", "l2-deployments.json");
const sameNode = (f: DeploymentsFile, n: LocalNode) => f.node.pid === n.pid && f.node.startedAt === n.startedAt && f.node.chainId === n.chainId;

/** F-04 · the deployments record, validated; a malformed one is the typed L2_DEPLOYMENTS_INVALID, never trusted. */
function read(root: string): DeploymentsFile | undefined {
  const f = fileOf(root);
  if (!fs.existsSync(f)) return undefined;
  const d = readWorkspaceJson(f) as any;
  const ok =
    d &&
    d.schema === L2_DEPLOYMENTS_SCHEMA &&
    d.node &&
    Number.isInteger(d.node.pid) &&
    typeof d.node.startedAt === "string" &&
    Number.isInteger(d.node.chainId) &&
    d.contracts &&
    typeof d.contracts === "object" &&
    Object.values<any>(d.contracts).every((c) => c && typeof c.key === "string" && /^0x[0-9a-fA-F]{40}$/.test(c.address) && /^0x[0-9a-fA-F]{64}$/.test(c.txHash));
  if (!ok) {
    throw new HardkasCliError("L2_DEPLOYMENTS_INVALID", `${f} is not a valid deployments record; delete it and deploy again`, { exitCode: HardkasExitCode.CORRUPTION_DETECTED });
  }
  return d as DeploymentsFile;
}

export function recordDeployment(root: string, node: LocalNode, name: string, d: L2Deployment): void {
  const prev = read(root);
  const contracts = prev && sameNode(prev, node) ? { ...prev.contracts } : {};
  contracts[name] = d;
  const file = fileOf(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ schema: L2_DEPLOYMENTS_SCHEMA, node: { pid: node.pid, startedAt: node.startedAt, chainId: node.chainId }, contracts }, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** The address of `target`: an address as given, or the name of a contract deployed on THIS node instance. */
export function resolveTarget(root: string, node: LocalNode, target: string): { address: `0x${string}`; name?: string } {
  if (/^0x[0-9a-fA-F]{40}$/.test(target)) return { address: target as `0x${string}` };
  const f = read(root);
  const d = f?.contracts[target];
  if (!f || !d) throw new HardkasCliError("L2_DEPLOYMENT_NOT_FOUND", `no deployment named '${target}' (deploy it with: hardkas l2 dev deploy ${target})`, { exitCode: HardkasExitCode.USAGE_ERROR });
  if (!sameNode(f, node)) {
    throw new HardkasCliError(
      "L2_DEPLOYMENT_STALE",
      `'${target}' was deployed on another local node instance (PID ${f.node.pid}, started ${f.node.startedAt}); that state is gone. Deploy it again.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  return { address: d.address, name: target };
}

export function deploymentOf(root: string, name: string): L2Deployment | undefined {
  return read(root)?.contracts[name];
}
