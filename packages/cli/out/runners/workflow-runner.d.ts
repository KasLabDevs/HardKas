export declare function runWorkflowRun(file: string, options: {
    workspaceRoot?: string;
    dryRun?: boolean;
    json?: boolean;
    network?: string;
    offline?: boolean;
    timeout?: string;
}): Promise<void>;
export declare function runWorkflowInspect(id: string, options: {
    workspaceRoot?: string;
    json?: boolean;
}): Promise<void>;
export declare function runWorkflowReplay(id: string, options: any): Promise<void>;
export declare function runWorkflowDiff(idA: string, idB: string, options: {
    workspaceRoot?: string;
}): Promise<void>;
//# sourceMappingURL=workflow-runner.d.ts.map