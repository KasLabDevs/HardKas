export interface DashboardCheck {
    name: string;
    status: "success" | "warning" | "error";
    message?: string;
    source?: string;
}
export declare function runDashboardDoctor(): Promise<void>;
//# sourceMappingURL=dashboard-doctor-runner.d.ts.map