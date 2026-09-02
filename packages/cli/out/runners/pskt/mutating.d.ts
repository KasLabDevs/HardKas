export declare function runPsktExport(options: {
    plan: string;
    out: string;
    adapter?: string;
    force: boolean;
    json: boolean;
}): Promise<void>;
export declare function runPsktImport(options: {
    file: string;
    payload: string;
    out: string;
    force: boolean;
    json: boolean;
}): Promise<void>;
export declare function runPsktSign(sessionPath: string, options: {
    account?: string;
    keystore?: string;
    keyStdin?: boolean;
    privateKeyFile?: string;
    out: string;
    force: boolean;
    json: boolean;
}): Promise<void>;
export declare function runPsktMerge(sessionA: string, sessionB: string, options: {
    out: string;
    force: boolean;
    json: boolean;
}): Promise<void>;
export declare function runPsktFinalize(sessionPath: string, options: {
    out: string;
    force: boolean;
    json: boolean;
}): Promise<void>;
export declare function runPsktExtract(sessionPath: string, options: {
    out: string;
    force: boolean;
    json: boolean;
}): Promise<void>;
//# sourceMappingURL=mutating.d.ts.map