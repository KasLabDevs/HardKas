export interface TxVerifyOptions {
    path: string;
    workspaceRoot: string;
    json?: boolean;
}
export declare function runTxVerify(options: TxVerifyOptions): Promise<import("@hardkas/tx-builder").SemanticVerificationResult | undefined>;
//# sourceMappingURL=tx-verify-runner.d.ts.map