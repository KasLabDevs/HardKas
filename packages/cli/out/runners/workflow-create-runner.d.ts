export interface WorkflowCreateOptions {
    name: string;
    template: string;
    out?: string;
    json: boolean;
    workspaceRoot: string;
}
export declare function runWorkflowCreate(options: WorkflowCreateOptions): Promise<void>;
//# sourceMappingURL=workflow-create-runner.d.ts.map