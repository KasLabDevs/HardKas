import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "@hardkas/core";
import { DeploymentRecord, DeploymentSummary } from "./deployment.js";

// SAFETY_LEVEL: SIMULATION_ONLY

/**
 * Manages deployment records on the filesystem.
 * Storage: .hardkas/deployments/<networkId>/<label>.json
 */

export async function saveDeployment(rootDir: string, record: DeploymentRecord): Promise<string> {
  const deploymentsDir = path.join(rootDir, ".hardkas", "deployments", record.networkId);
  const targetPath = path.join(deploymentsDir, `${record.label}.json`);
  
  await writeFileAtomic(targetPath, JSON.stringify(record, null, 2));
  return targetPath;
}

export async function loadDeployment(rootDir: string, networkId: string, label: string): Promise<DeploymentRecord | null> {
  const targetPath = path.join(rootDir, ".hardkas", "deployments", networkId, `${label}.json`);
  
  if (!existsSync(targetPath)) return null;
  
  const content = await fs.readFile(targetPath, "utf-8");
  return JSON.parse(content);
}

export async function listDeployments(rootDir: string, networkId?: string): Promise<DeploymentSummary[]> {
  const baseDir = path.join(rootDir, ".hardkas", "deployments");
  if (!existsSync(baseDir)) return [];

  const summaries: DeploymentSummary[] = [];
  
  const networks = networkId ? [networkId] : await fs.readdir(baseDir);
  
  for (const net of networks) {
    const netDir = path.join(baseDir, net);
    if (!existsSync(netDir)) continue;
    
    const files = await fs.readdir(netDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      
      try {
        const content = await fs.readFile(path.join(netDir, file), "utf-8");
        const record: DeploymentRecord = JSON.parse(content);
        const summary: DeploymentSummary = {
          label: record.label,
          networkId: record.networkId,
          status: record.status,
          deployedAt: record.deployedAt,
          contentHash: record.contentHash || ""
        };
        if (record.txId) summary.txId = record.txId;
        summaries.push(summary);
      } catch (e) {
        // Skip malformed files
      }
    }
  }
  
  return summaries.sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime());
}

export async function updateDeployment(
  rootDir: string, 
  networkId: string, 
  label: string, 
  update: Partial<DeploymentRecord>
): Promise<DeploymentRecord> {
  const existing = await loadDeployment(rootDir, networkId, label);
  if (!existing) {
    throw new Error(`Deployment '${label}' not found on network '${networkId}'.`);
  }
  
  const updated: DeploymentRecord = {
    ...existing,
    ...update,
    deployedAt: new Date().toISOString()
  };
  
  // Re-calculate hash if important fields changed? 
  // Actually, helper updateDeploymentStatus should be used for status changes.
  // This is a generic update.
  
  await saveDeployment(rootDir, updated);
  return updated;
}

export async function deleteDeployment(rootDir: string, networkId: string, label: string): Promise<boolean> {
  const targetPath = path.join(rootDir, ".hardkas", "deployments", networkId, `${label}.json`);
  if (!existsSync(targetPath)) return false;
  
  await fs.unlink(targetPath);
  return true;
}
