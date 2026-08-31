export declare function runDevServer(options: {
    port: string;
    host: string;
    unsafeExternal: boolean;
    unsafeNoAuth?: boolean;
    showToken?: boolean;
    open: boolean;
    json: boolean;
    once?: boolean;
    workspaceRoot?: string;
    sandboxMode?: boolean;
    quietHeader?: boolean;
    preventTeardown?: boolean;
}): Promise<{
    store: import("@hardkas/query-store").HardkasStore;
    nodeServer: import("@hono/node-server").ServerType;
    stopHardkasWatcher: typeof import("@hardkas/dev-server").stopHardkasWatcher;
    isNodeRunning: boolean;
    miningAlias: string;
    port: number;
    devAccounts: any[];
} | undefined>;
export declare function runDevServerToken(options: {
    json?: boolean;
    workspaceRoot?: string;
}): Promise<void>;
//# sourceMappingURL=dev-server-runner.d.ts.map