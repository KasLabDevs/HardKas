export interface LocalWizardResult {
    schema: "hardkas.localWizard.v1";
    step: string;
    status: "success" | "pending" | "failed";
    suggestion?: string;
    accountCreated?: boolean;
}
export declare function runLocalWizard(options: {
    profile: string;
    account: string;
    nonInteractive: boolean;
    json: boolean;
    rpcUrl?: string;
}): Promise<void>;
//# sourceMappingURL=local-wizard-runner.d.ts.map