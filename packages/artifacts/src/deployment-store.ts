import fs from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { HardkasError, plainChildPath, writeFileAtomic } from "@hardkas/core";
import { DeploymentRecord, DeploymentSummary } from "./deployment.js";

// SAFETY_LEVEL: SIMULATION_ONLY

/**
 * Manages deployment records on the filesystem.
 * Storage: `.hardkas/deployments/{networkId}/{label}.json`
 *
 * DEPLOYMENT-PATH-CONTAINMENT-1: a network and a label are each one plain path component (no '/', '\', ':', NUL, "." or
 * ".."), and a network directory must really be inside `.hardkas/deployments` (no link out of it). Anything else is
 * refused before any record is read, written or removed, whoever supplies the name: a command's argument, a caller of
 * this API, or the fields of a record being saved again.
 */

function deploymentsRoot(rootDir: string): string {
  return path.resolve(rootDir, ".hardkas", "deployments");
}

function networkDir(rootDir: string, networkId: unknown): string {
  const root = deploymentsRoot(rootDir);
  const dir = plainChildPath(root, networkId);
  if (!dir) {
    throw new HardkasError(
      "DEPLOYMENT_NETWORK_INVALID",
      `${JSON.stringify(networkId)} is not a deployment network: use one plain name (no '/', '\\', ':', '.' or '..'), stored under ${root}; nothing was read or written`
    );
  }
  // physical containment: an existing network directory that really lives elsewhere (a junction or symlink) is refused
  if (existsSync(dir)) {
    const real = path.relative(realpathSync.native(root), realpathSync.native(dir));
    if (real === "" || real === ".." || real.startsWith(`..${path.sep}`) || path.isAbsolute(real)) {
      throw new HardkasError(
        "DEPLOYMENT_PATH_OUTSIDE_STORE",
        `${dir} is linked outside the deployments directory ${root}; nothing was read or written`
      );
    }
  }
  return dir;
}

function recordPath(rootDir: string, networkId: unknown, label: unknown): string {
  const dir = networkDir(rootDir, networkId);
  if (!plainChildPath(dir, label)) {
    throw new HardkasError(
      "DEPLOYMENT_LABEL_INVALID",
      `${JSON.stringify(label)} is not a deployment label: use one plain name (no '/', '\\', ':', '.' or '..'), stored under ${dir}; nothing was read or written`
    );
  }
  return path.join(dir, `${label}.json`);
}

export async function saveDeployment(
  rootDir: string,
  record: DeploymentRecord
): Promise<string> {
  const targetPath = recordPath(rootDir, record.networkId, record.label);

  await writeFileAtomic(targetPath, JSON.stringify(record, null, 2));
  return targetPath;
}

export async function loadDeployment(
  rootDir: string,
  networkId: string,
  label: string
): Promise<DeploymentRecord | null> {
  const targetPath = recordPath(rootDir, networkId, label);

  if (!existsSync(targetPath)) return null;

  const content = await fs.readFile(targetPath, "utf-8");
  return JSON.parse(content);
}

export async function listDeployments(
  rootDir: string,
  networkId?: string
): Promise<DeploymentSummary[]> {
  if (networkId !== undefined) networkDir(rootDir, networkId); // an invalid network is refused before anything is read
  const baseDir = deploymentsRoot(rootDir);
  if (!existsSync(baseDir)) return [];

  const summaries: DeploymentSummary[] = [];

  const networks = networkId ? [networkId] : await fs.readdir(baseDir);

  for (const net of networks) {
    const netDir = networkDir(rootDir, net);
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

  return summaries.sort(
    (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()
  );
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

export async function deleteDeployment(
  rootDir: string,
  networkId: string,
  label: string
): Promise<boolean> {
  const targetPath = recordPath(rootDir, networkId, label);
  if (!existsSync(targetPath)) return false;

  await fs.unlink(targetPath);
  return true;
}
