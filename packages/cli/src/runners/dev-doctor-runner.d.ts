export interface DevDoctorCheck {
    name: string;
    status: "success" | "warning" | "error" | "info";
    message?: string;
    details?: any;
    code?: string;
    suggestion?: string;
}
export interface DevDoctorResult {
    schema: "hardkas.devDoctor.v1";
    schemaVersion?: string;
    status: "ready" | "warning" | "failed";
    checks: DevDoctorCheck[];
}
export declare function runDevDoctor(options: {
    profile: string;
    rpcUrl?: string;
    account?: string;
    timeout?: string;
    json: boolean;
    release?: boolean;
}): Promise<void>;
//# sourceMappingURL=dev-doctor-runner.d.ts.map