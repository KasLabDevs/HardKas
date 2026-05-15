import { UI } from "../ui.js";
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
import { loadHardkasConfig, resolveNetworkTarget } from "@hardkas/config";
import { NetworkId, ArtifactId, TxId } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

// SAFETY_LEVEL: SIMULATION_ONLY

export async function trackDeployment(opts: {
  label: string;
  network: string;
  txId?: string;
  plan?: string;
  receipt?: string;
  status?: string;
  notes?: string;
}): Promise<void> {
  const rootDir = process.cwd();
  
  await withLock({ rootDir, name: "artifacts", command: "hardkas deploy track" }, async () => {
    const existing = await loadDeployment(rootDir, opts.network, opts.label);
    if (existing) {
      throw new Error(`Deployment '${opts.label}' already exists on network '${opts.network}'.`);
    }

    const record = createDeploymentRecord({
      label: opts.label,
      networkId: opts.network as NetworkId,
      ...(opts.txId ? { txId: opts.txId as TxId } : {}),
      ...(opts.plan ? { planArtifactId: opts.plan as ArtifactId } : {}),
      ...(opts.receipt ? { receiptArtifactId: opts.receipt as ArtifactId } : {}),
      status: (opts.status || "sent") as any,
      ...(opts.notes ? { notes: opts.notes } : {})
    });

    await saveDeployment(rootDir, record);
    UI.success(`Tracked deployment: ${opts.label} (${opts.network})`);
  });
}

export async function listAllDeployments(opts: { 
  network?: string; 
  status?: string; 
  json?: boolean 
}): Promise<void> {
  const rootDir = process.cwd();
  const deployments = await listDeployments(rootDir, opts.network);
  
  const filtered = opts.status 
    ? deployments.filter(d => d.status === opts.status)
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
      const statusIcon = d.status === "confirmed" ? "✅" : d.status === "failed" ? "❌" : "⏳";
      const txIdShort = d.txId ? d.txId.slice(0, 12) + "..." : "(none)";
      const ago = formatAgo(d.deployedAt);
      console.log(`    ${statusIcon} ${d.label.padEnd(20)} ${d.status.padEnd(10)} ${txIdShort.padEnd(16)} ${ago}`);
      total++;
    }
  }

  console.log(`\n  Total: ${total} deployments across ${Object.keys(byNetwork).length} networks`);
}

export async function inspectDeployment(opts: {
  label: string;
  network: string;
  json?: boolean;
}): Promise<void> {
  const rootDir = process.cwd();
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
}): Promise<void> {
  const rootDir = process.cwd();
  const record = await loadDeployment(rootDir, opts.network, opts.label);
  
  if (!record) {
    throw new Error(`Deployment '${opts.label}' not found on network '${opts.network}'.`);
  }

  if (!opts.verify) {
    if (opts.json) console.log(JSON.stringify({ label: record.label, status: record.status }, null, 2));
    else console.log(`Current status: ${record.status}`);
    return;
  }

  if (!record.txId) {
    throw new Error(`Cannot verify deployment '${opts.label}' without a transaction ID.`);
  }

  UI.info(`Checking ${record.label} on ${record.networkId}...`);
  const { config } = await loadHardkasConfig();
  const netTarget = resolveNetworkTarget({ config, network: record.networkId });
  const rpcUrl = (netTarget.target as any).rpcUrl;
  console.log(`  RPC: ${rpcUrl || "simulated"}`);
  console.log(`  TxId: ${record.txId}`);

  if (record.networkId === "simnet") {
    UI.info("  Simnet deployment — status preserved.");
  } else if (!rpcUrl) {
     UI.error("  No RPC URL configured for this network.");
  } else {
    try {
      const client = new JsonWrpcKaspaClient({ rpcUrl: rpcUrl });
      const tx = await client.getTransaction(record.txId) as any;
      
      let newStatus: DeploymentRecord["status"] = record.status;
      if (tx) {
        // Basic confirmation check: if we found it in a block or it's accepted
        const isAccepted = tx.isAccepted || (tx.transaction && tx.transaction.block_hash);
        if (isAccepted) newStatus = "confirmed";
      } else {
        // If not found, maybe it's still pending or failed.
        // We'll keep it as is unless we know for sure it failed.
      }

      if (newStatus !== record.status) {
        await withLock({ rootDir, name: "artifacts", command: "hardkas deploy status" }, async () => {
          const updated = updateDeploymentStatus(record, newStatus);
          await saveDeployment(rootDir, updated);
          UI.success(`  Status updated: ${newStatus}`);
        });
      } else {
        UI.info(`  Status remains: ${record.status}`);
      }
      
      await client.close();
    } catch (e: any) {
      UI.error(`  RPC check failed: ${e.message}`);
    }
  }
}

export async function showDeploymentHistory(opts: { json?: boolean }): Promise<void> {
  const options = {
    ...(opts.json !== undefined ? { json: opts.json } : {})
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
