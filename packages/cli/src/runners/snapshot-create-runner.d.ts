export interface SnapshotCreateOptions {
    name: string;
    workspaceRoot: string;
    consensusValidated: boolean;
    json?: boolean;
}
export declare function runSnapshotCreate(options: SnapshotCreateOptions): Promise<void>;
//# sourceMappingURL=snapshot-create-runner.d.ts.map