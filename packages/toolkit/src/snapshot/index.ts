import { SnapshotBackend, SnapshotManifest, SnapshotParticipant, SnapshotState } from "./types.js";
import { MemorySnapshotBackend } from "./backends/MemorySnapshotBackend.js";
import { FsSnapshotBackend } from "./backends/FsSnapshotBackend.js";
import crypto from "crypto";

export interface SnapshotToolkitOptions {
    backend?: "memory" | "filesystem";
    dir?: string;
}

export class SnapshotToolkit {
    private backend: SnapshotBackend;
    private participants = new Map<string, SnapshotParticipant>();

    private constructor(options: SnapshotToolkitOptions) {
        if (options.backend === "filesystem") {
            this.backend = new FsSnapshotBackend(options.dir);
        } else {
            this.backend = new MemorySnapshotBackend();
        }
    }

    public static open(options: SnapshotToolkitOptions = { backend: "memory" }): SnapshotToolkit {
        return new SnapshotToolkit(options);
    }

    public register(id: string, participant: SnapshotParticipant): void {
        this.participants.set(id, participant);
    }

    public async create(name: string): Promise<SnapshotManifest> {
        const id = crypto.randomUUID();
        const state: Record<string, SnapshotState> = {};

        // Snapshot all participants
        for (const [pId, participant] of this.participants.entries()) {
            state[pId] = await participant.snapshot();
        }

        return this.backend.save(id, name, state);
    }

    public async restore(id: string): Promise<void> {
        const { state } = await this.backend.load(id);

        // 1. load state & restore (but don't reload yet in case something fails)
        for (const [pId, pState] of Object.entries(state)) {
            const participant = this.participants.get(pId);
            if (!participant) {
                throw new Error(`Cannot restore state for participant '${pId}' because it is not registered`);
            }
            try {
                await participant.restore(pState);
            } catch (err: any) {
                throw new Error(`Failed to restore participant '${pId}': ${err.message}`);
            }
        }

        // 2. reload all
        for (const [pId, _] of Object.entries(state)) {
            const participant = this.participants.get(pId)!;
            try {
                await participant.reload();
            } catch (err: any) {
                throw new Error(`Failed to reload participant '${pId}' after restoration: ${err.message}`);
            }
        }
    }

    public async branch(baseId: string, newName: string): Promise<SnapshotManifest> {
        const newId = crypto.randomUUID();
        return this.backend.branch(baseId, newId, newName);
    }

    public async diff(idA: string, idB: string): Promise<Record<string, any>> {
        const [a, b] = await Promise.all([this.backend.load(idA), this.backend.load(idB)]);
        
        const differences: Record<string, any> = {};
        const allParticipants = new Set([...a.manifest.participants, ...b.manifest.participants]);

        for (const pId of allParticipants) {
            const hashA = a.manifest.stateHashes[pId];
            const hashB = b.manifest.stateHashes[pId];
            if (hashA !== hashB) {
                differences[pId] = {
                    a: a.state[pId] || null,
                    b: b.state[pId] || null
                };
            }
        }
        return differences;
    }

    public async compare(idA: string, idB: string): Promise<boolean> {
        const diff = await this.diff(idA, idB);
        return Object.keys(diff).length === 0;
    }

    public async list(): Promise<SnapshotManifest[]> {
        return this.backend.list();
    }
}
