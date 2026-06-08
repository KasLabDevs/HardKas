export interface KaspaDoctorCheck {
    name: string;
    status: "success" | "warning" | "error";
    message?: string;
}
export interface KaspaDoctorResult {
    schema: "hardkas.kaspaDoctor.v1";
    status: "ready" | "warning" | "failed";
    checks: KaspaDoctorCheck[];
}
export declare function runKaspaDoctor(options: {
    rpcUrl: string;
    json: boolean;
}): Promise<void>;
//# sourceMappingURL=kaspa-doctor-runner.d.ts.map