export interface L2ContractDeployPlanOptions {
    network?: string;
    url?: string;
    from: string;
    bytecode: string;
    constructor?: string;
    args?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
    nonce?: string;
    outDir?: string;
    json?: boolean;
}
export declare function runL2ContractDeployPlan(options: L2ContractDeployPlanOptions): Promise<void>;
//# sourceMappingURL=l2-contract-runners.d.ts.map