import { SnapshotBackend, SnapshotManifest, SnapshotState } from "../types.js";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import { snapshotReplacer, snapshotReviver } from "../serialization.js";

export class FsSnapshotBackend implements SnapshotBackend {
    private baseDir: string;

    constructor(baseDir: string = ".hardkas-snapshots") {
        this.baseDir = baseDir;
    }

    async save(id: string, name: string, state: Record<string, SnapshotState>): Promise<SnapshotManifest> {
        const snapshotDir = path.join(this.baseDir, id);
        await fs.ensureDir(snapshotDir);

        const stateHashes: Record<string, string> = {};
        const participants = Object.keys(state);

        // Write each participant's state to a separate file
        for (const [pId, pState] of Object.entries(state)) {
            const data = JSON.stringify(pState, snapshotReplacer, 2);
            stateHashes[pId] = crypto.createHash("sha256").update(data).digest("hex");
            await fs.writeFile(path.join(snapshotDir, `${pId}.json`), data);
        }

        const manifest: SnapshotManifest = {
            schema: "hardkas.snapshot.v1",
            snapshotId: id,
            name,
            createdAt: Date.now(),
            backend: "filesystem",
            path: snapshotDir,
            participants,
            stateHashes,
            claims: {
                containsFullStateInline: false,
                restorableLocalState: true,
                networkStateCaptured: false
            }
        };

        // Write manifest
        await fs.writeFile(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2));

        return manifest;
    }

    async load(id: string): Promise<{ manifest: SnapshotManifest; state: Record<string, SnapshotState> }> {
        const snapshotDir = path.join(this.baseDir, id);
        if (!await fs.pathExists(snapshotDir)) {
            throw new Error(`Snapshot ${id} not found in filesystem backend at ${snapshotDir}`);
        }

        const manifestData = await fs.readFile(path.join(snapshotDir, "manifest.json"), "utf8");
        const manifest: SnapshotManifest = JSON.parse(manifestData);

        const state: Record<string, SnapshotState> = {};
        for (const pId of manifest.participants) {
            const stateData = await fs.readFile(path.join(snapshotDir, `${pId}.json`), "utf8");
            state[pId] = JSON.parse(stateData, snapshotReviver);
        }

        return { manifest, state };
    }

    async list(): Promise<SnapshotManifest[]> {
        if (!await fs.pathExists(this.baseDir)) {
            return [];
        }

        const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
        const manifests: SnapshotManifest[] = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const manifestPath = path.join(this.baseDir, entry.name, "manifest.json");
                if (await fs.pathExists(manifestPath)) {
                    const data = await fs.readFile(manifestPath, "utf8");
                    manifests.push(JSON.parse(data));
                }
            }
        }

        return manifests;
    }

    async delete(id: string): Promise<void> {
        const snapshotDir = path.join(this.baseDir, id);
        if (await fs.pathExists(snapshotDir)) {
            await fs.remove(snapshotDir);
        }
    }

    async branch(baseId: string, newId: string, newName: string): Promise<SnapshotManifest> {
        const { state } = await this.load(baseId);
        return this.save(newId, newName, state);
    }
}
