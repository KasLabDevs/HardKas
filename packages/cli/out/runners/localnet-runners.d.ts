export interface LocalnetStartOptions {
    profile?: string;
    json?: boolean;
    workspaceRoot?: string;
}
export interface LocalnetStatusOptions {
    json?: boolean;
    workspaceRoot?: string;
}
export interface LocalnetFundOptions {
    identifier: string;
    amountSompi?: bigint;
    profile?: string;
    json?: boolean;
    timeoutMs?: number;
    keepMiner?: boolean;
    workspaceRoot?: string;
}
export declare function runLocalnetStart(opts: LocalnetStartOptions): Promise<void>;
export declare function runLocalnetStop(opts: {
    json?: boolean;
    profile?: string;
    workspaceRoot?: string;
}): Promise<void>;
export declare function runLocalnetStatus(opts: LocalnetStatusOptions): Promise<void>;
export declare function runLocalnetFund(opts: LocalnetFundOptions): Promise<void>;
export declare function runLocalnetFork(opts: {
    network: string;
    addresses: string[];
    atDaaScore?: string;
    outputPath?: string;
    workspaceRoot?: string;
}): Promise<void>;
//# sourceMappingURL=localnet-runners.d.ts.map