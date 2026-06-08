export interface AccountsFundOptions {
    identifier: string;
    amountSompi?: bigint;
}
export declare function runAccountsFund(options: AccountsFundOptions): Promise<{
    success: boolean;
    address: string;
    amountSompi: bigint;
    mode: string;
    formatted: string;
}>;
//# sourceMappingURL=accounts-fund-runner.d.ts.map