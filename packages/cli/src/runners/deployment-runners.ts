import { UI } from "../ui.js";
import { HardkasCliError } from "../cli-errors.js";
import { withLock } from "@hardkas/core";
import {
  DeploymentRecord,
  DeploymentSummary,
  saveDeployment,
  loadDeployment,
  listDeployments,
  updateDeployment,
  deleteDeployment,
  createDeploymentRecord,
  updateDeploymentStatus
} from "@hardkas/artifacts";
import { loadHardkasConfig, resolveExecutionTarget } from "@hardkas/config";
import { NetworkId, ArtifactId, TxId } from "@hardkas/core";

// SAFETY_LEVEL: SIMULATION_ONLY



/** JSON-PAPERCUTS #39: the record that was written is returned, so `deploy track --json` can print it. */
export async function trackDeployment(opts: {
  label: string;
  network: string;
  txId?: string;
  plan?: string;
  receipt?: string;
  status?: string;
  notes?: string;
  script?: string;
  silent?: boolean;
  workspaceRoot?: string;
}): Promise<DeploymentRecord> {
  const rootDir = opts.workspaceRoot || process.cwd();

  // deployments live in .hardkas/deployments/**, outside the artifact store: their own lock, not the store's (phase 2B)
  let record: DeploymentRecord | undefined;
  await withLock(
    { rootDir, name: "deployments", command: "hardkas deploy track" },
    async () => {
      record = await trackDeploymentInternal(rootDir, opts);
    }
  );
  return record!;
}

export async function trackDeploymentInternal(
  rootDir: string,
  opts: {
    label: string;
    network: string;
    txId?: string;
    plan?: string;
    receipt?: string;
    status?: string;
    notes?: string;
    silent?: boolean;
  }
): Promise<DeploymentRecord> {
  const existing = await loadDeployment(rootDir, opts.network, opts.label);
  if (existing) {
    // Typed, so `--json` reports DEPLOYMENT_EXISTS instead of UNKNOWN_ERROR.
    throw new HardkasCliError(
      "DEPLOYMENT_EXISTS",
      `Deployment '${opts.label}' already exists on network '${opts.network}'.`,
      { exitCode: 1, suggestion: "Choose another label, or inspect the existing record with 'hardkas deploy inspect'." }
    );
  }

  const record = createDeploymentRecord({
    label: opts.label,
    networkId: opts.network as NetworkId,
    ...(opts.txId ? { txId: opts.txId as TxId } : {}),
    ...(opts.plan ? { planArtifactId: opts.plan as ArtifactId } : {}),
    ...(opts.receipt ? { receiptArtifactId: opts.receipt as ArtifactId } : {}),
    status: (opts.status || "sent") as DeploymentRecord["status"],
    ...(opts.notes ? { notes: opts.notes } : {})
  });

  await saveDeployment(rootDir, record);
  if (!opts.silent) {
    UI.success(`Tracked deployment: ${opts.label} (${opts.network})`);
  }
  return record;
}



export async function listAllDeployments(opts: {
  network?: string;
  status?: string;
  json?: boolean;
  workspaceRoot: string;
}): Promise<void> {
  const rootDir = opts.workspaceRoot;
  const deployments = await listDeployments(rootDir, opts.network);

  const filtered = opts.status
    ? deployments.filter((d) => d.status === opts.status)
    : deployments;

  if (opts.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (filtered.length === 0) {
    UI.info("No deployments found.");
    return;
  }

  UI.header("Deployments");

  // Group by network
  const byNetwork: Record<string, DeploymentSummary[]> = {};
  for (const d of filtered) {
    const net = d.networkId || "unknown";
    if (!byNetwork[net]) byNetwork[net] = [];
    byNetwork[net].push(d);
  }

  let total = 0;
  for (const [net, items] of Object.entries(byNetwork)) {
    console.log(`\n  ${net}`);
    for (const d of items) {
      const statusIcon =
        d.status === "confirmed" ? "✅" : d.status === "failed" ? "❌" : "⏳";
      const txIdShort = d.txId ? d.txId.slice(0, 12) + "..." : "(none)";
      const ago = formatAgo(d.deployedAt);
      console.log(
        `    ${statusIcon} ${d.label.padEnd(20)} ${d.status.padEnd(10)} ${txIdShort.padEnd(16)} ${ago}`
      );
      total++;
    }
  }

  console.log(
    `\n  Total: ${total} deployments across ${Object.keys(byNetwork).length} networks`
  );
}

export async function inspectDeployment(opts: {
  label: string;
  network: string;
  json?: boolean;
  workspaceRoot: string;
}): Promise<void> {
  const rootDir = opts.workspaceRoot;
  const record = await loadDeployment(rootDir, opts.network, opts.label);

  if (!record) {
    throw new Error(`Deployment '${opts.label}' not found on network '${opts.network}'.`);
  }

  if (opts.json) {
    console.log(JSON.stringify(record, null, 2));
    return;
  }

  UI.header(`Deployment: ${record.label}`);
  console.log(`  Network:        ${record.networkId}`);
  console.log(`  Status:         ${record.status}`);
  console.log(`  TxId:           ${record.txId || "(none)"}`);
  console.log(`  Plan artifact:  ${record.planArtifactId || "(none)"}`);
  console.log(`  Receipt:        ${record.receiptArtifactId || "(none)"}`);
  console.log(`  Deployed at:    ${record.deployedAt}`);
  console.log(`  Content hash:   ${record.contentHash}`);
  if (record.notes) console.log(`  Notes:          ${record.notes}`);
}

export async function verifyDeploymentStatus(opts: {
  label: string;
  network: string;
  verify?: boolean;
  json?: boolean;
  workspaceRoot: string;
}): Promise<void> {
  const rootDir = opts.workspaceRoot;
  const record = await loadDeployment(rootDir, opts.network, opts.label);

  if (!record) {
    throw new Error(`Deployment '${opts.label}' not found on network '${opts.network}'.`);
  }

  if (!opts.verify) {
    if (opts.json)
      console.log(
        JSON.stringify({ label: record.label, status: record.status }, null, 2)
      );
    else console.log(`Current status: ${record.status}`);
    return;
  }

  if (!record.txId) {
    throw new HardkasCliError("DEPLOYMENT_TXID_MISSING", `Cannot verify deployment '${opts.label}' without a transaction ID.`, { exitCode: 1 });
  }

  const { config } = await loadHardkasConfig();
  // the network must be one the config knows (the resolver refuses it otherwise)
  resolveExecutionTarget({ config, network: record.networkId });

  // DEPLOY-VERIFY-OBSERVE-1 (L1-CORE-1 B2): the state is read the way `tx status` reads it — one observation of the
  // node's virtual chain and mempool (sdk.tx.observe), which needs no TxIndex. It used `getTransaction`, which a node
  // without TxIndex (rusty-kaspad's default) answers `null`, so a deployment was never confirmed; on simnet it did not
  // look at all ("status preserved"); a failed look was printed and the command still exited 0; --json was ignored.
  // Every network is read the same way now, through the endpoint the workspace declares for it (TESTNET-PORT-COLLISION-1:
  // never an inferred one) and from a node that proves it serves that network (NODE-NETWORK-IDENTITY-1).
  if (!opts.json) UI.info(`Checking ${record.label} on ${record.networkId}...`);
  const { Hardkas } = await import("@hardkas/sdk");
  const sdk = await Hardkas.open({ cwd: rootDir, network: String(record.networkId) });
  let derived: { status: string; reasons?: string[]; confirmations?: unknown } | undefined;
  try {
    derived = (await sdk.tx.observe(String(record.txId))).derived as any;
  } catch (e: unknown) {
    const code = typeof (e as any)?.code === "string" ? (e as any).code : "DEPLOYMENT_VERIFY_FAILED";
    throw new HardkasCliError(code, `Deployment '${record.label}' could not be verified: ${e instanceof Error ? e.message : String(e)}`, { exitCode: 1 });
  } finally {
    // RESOURCE-LIFECYCLE-1 (RL-I3): released on the error path too.
    await sdk.close();
  }

  const observed = String(derived?.status ?? "UNKNOWN");
  let newStatus: DeploymentRecord["status"] = record.status;
  if (observed === "CONFIRMED" || observed === "FINALIZED") newStatus = "confirmed";
  else if (observed === "REJECTED" || observed === "REJECTED_BY_NODE") newStatus = "failed";

  const updated = newStatus !== record.status;
  if (updated) {
    await withLock({ rootDir, name: "deployments", command: "hardkas deploy status" }, async () => {
      await saveDeployment(rootDir, updateDeploymentStatus(record, newStatus));
    });
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          command: "deploy status",
          label: record.label,
          networkId: record.networkId,
          txId: record.txId,
          previousStatus: record.status,
          status: newStatus,
          updated,
          observed: { state: observed, ...(derived?.reasons ? { reasons: derived.reasons } : {}) }
        },
        null,
        2
      )
    );
    return;
  }
  console.log(`  TxId: ${record.txId}`);
  console.log(`  Observed: ${observed}`);
  if (updated) UI.success(`  Status updated: ${newStatus}`);
  else UI.info(`  Status remains: ${record.status}`);
}

export async function showDeploymentHistory(opts: {
  json?: boolean;
  workspaceRoot: string;
}): Promise<void> {
  const options = {
    ...(opts.json !== undefined ? { json: opts.json } : {}),
    workspaceRoot: opts.workspaceRoot
  };
  await listAllDeployments(options);
}

function formatAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hours ago`;
  return `${Math.floor(diffHour / 24)} days ago`;
}
