export interface ArtifactVerifyOptions {
    path: string;
    json?: boolean;
    recursive?: boolean;
    strict?: boolean;
    deep?: boolean;
    workspaceRoot: string;
}
export declare function runArtifactVerify(options: ArtifactVerifyOptions): Promise<void | import("@hardkas/artifacts").ArtifactVerificationResult>;
//# sourceMappingURL=artifact-verify-runner.d.ts.map