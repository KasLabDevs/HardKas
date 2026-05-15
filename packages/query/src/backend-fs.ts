import fs from "node:fs/promises";
import path from "node:path";
import type { QueryBackend, ArtifactDocument, EventDocument, LineageEdgeDocument } from "./backend.js";
import { ExecutionMode, NetworkId } from "@hardkas/core";

export class FilesystemQueryBackend implements QueryBackend {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  isReady(): boolean {
    return true; // Filesystem is always "ready" if dir exists
  }

  kind(): "filesystem" {
    return "filesystem";
  }

  async findArtifacts(filters?: { schema?: string; mode?: string; networkId?: string }): Promise<ArtifactDocument[]> {
    const files = await this.scanFiles(this.rootDir);
    const docs: ArtifactDocument[] = [];

    for (const f of files) {
      const raw = await this.readJson(f);
      if (!raw || !raw.schema) continue;

      if (filters?.schema && raw.schema !== filters.schema) continue;
      if (filters?.mode && raw.mode !== filters.mode) continue;
      if (filters?.networkId && raw.networkId !== filters.networkId) continue;

      docs.push({
        contentHash: raw.contentHash || "",
        schema: raw.schema,
        version: raw.version || "unknown",
        kind: raw.kind || raw.schema,
        mode: raw.mode as ExecutionMode,
        networkId: raw.networkId as NetworkId,
        createdAt: raw.createdAt || null,
        txId: raw.txId || null,
        artifactId: raw.artifactId || raw.contentHash || "",
        path: f,
        payload: raw
      });
    }

    return docs;
  }

  async getArtifact(idOrHash: string): Promise<ArtifactDocument | null> {
    const artifacts = await this.findArtifacts();
    return artifacts.find(a => 
      a.contentHash === idOrHash || 
      a.payload.lineage?.artifactId === idOrHash || 
      a.payload.artifactId === idOrHash ||
      a.payload.txId === idOrHash
    ) || null;
  }

  async getEvents(filters?: { kind?: string; txId?: string }): Promise<EventDocument[]> {
    const eventsPath = path.join(this.rootDir, ".hardkas", "events.jsonl");
    const docs: EventDocument[] = [];
    try {
      const content = await fs.readFile(eventsPath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim() !== "");
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (filters?.kind && parsed.kind !== filters.kind) continue;
          if (filters?.txId && parsed.txId !== filters.txId) continue;
          
          docs.push({
            eventId: parsed.eventId,
            kind: parsed.kind,
            domain: parsed.domain,
            timestamp: parsed.timestamp || null,
            workflowId: parsed.workflowId,
            correlationId: parsed.correlationId,
            causationId: parsed.causationId || null,
            txId: parsed.txId || null,
            artifactId: parsed.artifactId || null,
            networkId: parsed.networkId,
            payload: parsed.payload
          });
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    return docs;
  }

  async getLineageEdges(filters?: { parentHash?: string; childHash?: string }): Promise<LineageEdgeDocument[]> {
    const artifacts = await this.findArtifacts();
    const edges: LineageEdgeDocument[] = [];

    for (const a of artifacts) {
      if (a.payload.lineage?.parentArtifactId) {
        edges.push({
          parentArtifactId: a.payload.lineage.parentArtifactId,
          childArtifactId: a.artifactId,
          lineageId: a.payload.lineage.lineageId || "unknown",
          rule: "parent",
          createdAt: a.createdAt
        });
      }
    }

    return edges.filter(e => {
      if (filters?.parentHash && e.parentArtifactId !== filters.parentHash) return false;
      if (filters?.childHash && e.childArtifactId !== filters.childHash) return false;
      return true;
    });
  }

  async getStoreStatus(): Promise<string> {
    return "fresh"; // Filesystem is always live
  }

  async doctor(): Promise<any> {
    return { ok: true, backend: "filesystem" };
  }

  async rebuild(options?: { strict?: boolean }): Promise<any> {
    // No-op for filesystem, but return a valid schema
    return {
      schema: "hardkas.queryRebuild.v1",
      ok: true,
      artifacts: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      events: { scanned: 0, indexed: 0, duplicates: 0, corrupted: 0 },
      warnings: ["Filesystem backend does not support indexing"],
      errors: []
    };
  }

  async findReceipts(filters?: { status?: string; networkId?: string }): Promise<ArtifactDocument[]> {
    return this.findArtifacts({ schema: "hardkas.txReceipt", ...filters });
  }

  async findTraces(filters?: { txId?: string }): Promise<ArtifactDocument[]> {
    const artifacts = await this.findArtifacts({ schema: "hardkas.txTrace" });
    if (filters?.txId) {
      return artifacts.filter(a => a.payload.txId === filters.txId);
    }
    return artifacts;
  }

  async sync(options?: { strict?: boolean }): Promise<any> {
    return this.rebuild(options);
  }

  async migrate(): Promise<{ applied: number }> {
    return { applied: 0 };
  }

  async executeRawSql(_sql: string): Promise<any[]> {
    throw new Error("Raw SQL execution not supported by Filesystem backend. Use SQLite backend.");
  }

  private async scanFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          results.push(...(await this.scanFiles(fullPath)));
        } else if (entry.name.endsWith(".json") && !entry.name.endsWith(".enc.json") && entry.name !== "events.jsonl") {
          results.push(fullPath);
        }
      }
    } catch {
      // Ignore
    }
    return results;
  }

  private async readJson(file: string): Promise<any> {
    try {
      const content = await fs.readFile(file, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}
