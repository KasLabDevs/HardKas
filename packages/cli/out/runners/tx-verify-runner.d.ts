export interface TxVerifyOptions {
    path: string;
    workspaceRoot: string;
    json?: boolean;
}
export declare function runTxVerify(options: TxVerifyOptions): Promise<import("@hardkas/tx-builder").SemanticVerificationResult>;
//# sourceMappingURL=tx-verify-runner.d.ts.map