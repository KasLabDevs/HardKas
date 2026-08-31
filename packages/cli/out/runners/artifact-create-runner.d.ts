export interface ArtifactCreateOptions {
    type: string;
    input: string;
    out?: string;
    json: boolean;
    workspaceRoot: string;
}
export declare function runArtifactCreate(options: ArtifactCreateOptions): Promise<void>;
//# sourceMappingURL=artifact-create-runner.d.ts.map