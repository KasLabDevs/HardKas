export interface SnapshotState {
    [key: string]: any;
}

export interface SnapshotParticipant {
    /** 
     * Extracts the current internal state of the toolkit/store 
     */
    snapshot(): Promise<SnapshotState>;

    /** 
     * Restores the internal state from the provided snapshot state 
     */
    restore(state: SnapshotState): Promise<void>;

    /** 
     * Reloads any caches, queues, or in-memory representations 
     * based on the newly restored state 
     */
    reload(): Promise<void>;
}

export interface SnapshotManifest {
    schema: "hardkas.snapshot.v1";
    snapshotId: string;
    name: string;
    createdAt: number;
    backend: "memory" | "filesystem";
    path?: string;
    participants: string[];
    stateHashes: Record<string, string>;
    claims: {
        containsFullStateInline: boolean;
        restorableLocalState: boolean;
        networkStateCaptured: boolean;
    };
}

export interface SnapshotBackend {
    save(id: string, name: string, state: Record<string, SnapshotState>): Promise<SnapshotManifest>;
    load(id: string): Promise<{ manifest: SnapshotManifest; state: Record<string, SnapshotState> }>;
    list(): Promise<SnapshotManifest[]>;
    delete(id: string): Promise<void>;
    branch(baseId: string, newId: string, newName: string): Promise<SnapshotManifest>;
}
