import { SnapshotBackend, SnapshotManifest, SnapshotState } from "../types.js";
import crypto from "crypto";
import { snapshotReplacer, snapshotReviver } from "../serialization.js";

export class MemorySnapshotBackend implements SnapshotBackend {
    private snapshots = new Map<string, { manifest: SnapshotManifest; state: Record<string, SnapshotState> }>();

    async save(id: string, name: string, state: Record<string, SnapshotState>): Promise<SnapshotManifest> {
        const stateHashes: Record<string, string> = {};
        const participants = Object.keys(state);

        for (const [pId, pState] of Object.entries(state)) {
            stateHashes[pId] = crypto.createHash("sha256").update(JSON.stringify(pState, snapshotReplacer)).digest("hex");
        }

        const manifest: SnapshotManifest = {
            schema: "hardkas.snapshot.v1",
            snapshotId: id,
            name,
            createdAt: Date.now(),
            backend: "memory",
            participants,
            stateHashes,
            claims: {
                containsFullStateInline: true,
                restorableLocalState: true,
                networkStateCaptured: false
            }
        };

        // Deep copy state to ensure isolation
        const deepCopiedState = JSON.parse(JSON.stringify(state, snapshotReplacer), snapshotReviver);
        this.snapshots.set(id, { manifest, state: deepCopiedState });

        return manifest;
    }

    async load(id: string): Promise<{ manifest: SnapshotManifest; state: Record<string, SnapshotState> }> {
        const entry = this.snapshots.get(id);
        if (!entry) {
            throw new Error(`Snapshot ${id} not found in memory backend`);
        }
        // Return a deep copy to prevent mutation of the snapshot itself
        return {
            manifest: JSON.parse(JSON.stringify(entry.manifest)),
            state: JSON.parse(JSON.stringify(entry.state, snapshotReplacer), snapshotReviver)
        };
    }

    async list(): Promise<SnapshotManifest[]> {
        return Array.from(this.snapshots.values()).map(s => s.manifest);
    }

    async delete(id: string): Promise<void> {
        this.snapshots.delete(id);
    }

    async branch(baseId: string, newId: string, newName: string): Promise<SnapshotManifest> {
        const entry = this.snapshots.get(baseId);
        if (!entry) throw new Error(`Base snapshot ${baseId} not found`);

        const newState = JSON.parse(JSON.stringify(entry.state, snapshotReplacer), snapshotReviver);
        return this.save(newId, newName, newState);
    }
}
