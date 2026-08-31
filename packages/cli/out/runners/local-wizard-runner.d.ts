import { HardkasSchemas } from "@hardkas/artifacts";
export interface LocalWizardResult {
    schema: typeof HardkasSchemas.LocalWizardV1;
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