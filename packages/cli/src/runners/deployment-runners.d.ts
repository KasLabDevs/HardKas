export declare function runDeploymentInspect(options: {
    label: string;
    network?: string;
    json?: boolean;
    workspaceRoot: string;
}): Promise<void>;
export declare function trackDeployment(opts: {
    label: string;
    network: string;
    txId?: string;
    script?: string;
    workspaceRoot?: string;
}): Promise<void>;
export declare function trackDeploymentInternal(rootDir: string, opts: {
    label: string;
    network: string;
    txId?: string;
    plan?: string;
    receipt?: string;
    status?: string;
    notes?: string;
    silent?: boolean;
}): Promise<void>;
export declare function runDeploymentList(options: {
    json?: boolean;
    workspaceRoot: string;
    network?: string;
    status?: string;
}): Promise<void>;
export declare function listAllDeployments(opts: {
    network?: string;
    status?: string;
    json?: boolean;
    workspaceRoot: string;
}): Promise<void>;
export declare function inspectDeployment(opts: {
    label: string;
    network: string;
    json?: boolean;
    workspaceRoot: string;
}): Promise<void>;
export declare function verifyDeploymentStatus(opts: {
    label: string;
    network: string;
    verify?: boolean;
    json?: boolean;
    workspaceRoot: string;
}): Promise<void>;
export declare function showDeploymentHistory(opts: {
    json?: boolean;
    workspaceRoot: string;
}): Promise<void>;
//# sourceMappingURL=deployment-runners.d.ts.map