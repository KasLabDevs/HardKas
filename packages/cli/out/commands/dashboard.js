import { UI } from "../ui.js";
export function registerDashboardCommand(program) {
    const dashboardCmd = program
        .command("dashboard")
        .description(`Open the HardKAS Semantic Observability Dashboard ${UI.maturity("alpha")}`);
    dashboardCmd.action(async () => {
        try {
            const { runDashboard } = await import("../runners/dashboard-runner.js");
            await runDashboard();
        }
        catch (e) {
            console.error("Error starting semantic dashboard:", e);
        }
    });
    dashboardCmd
        .command("doctor")
        .description("Verify dashboard endpoints and diagnostic health status")
        .action(async () => {
        try {
            const { runDashboardDoctor } = await import("../runners/dashboard-doctor-runner.js");
            await runDashboardDoctor();
        }
        catch (e) {
            console.error("Error running dashboard doctor:", e);
        }
    });
}
//# sourceMappingURL=dashboard.js.map