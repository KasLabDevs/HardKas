import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { 
  QueryClient, 
  QueryClientProvider 
} from "@tanstack/react-query";
import { 
  HardKasProvider,
  useHardKasHealth,
  useHardKas
} from "@hardkas/react";
import { Layout } from "./components/Layout";
import { OverviewPage } from "./pages/OverviewPage";
import { AccountsPage } from "./pages/AccountsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { TransactionDetailPage } from "./pages/TransactionDetailPage";
import { ArtifactsPage } from "./pages/ArtifactsPage";
import { ArtifactDetailPage } from "./pages/ArtifactDetailPage";
import { ReplayPage } from "./pages/ReplayPage";
import { WalletsPage } from "./pages/WalletsPage";
import { BridgePage } from "./pages/BridgePage";
import { EventsPage } from "./pages/EventsPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";

const queryClient = new QueryClient();

type ErrorBoundaryState = {
  error: Error | null;
};

class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <RuntimeOfflineCard
          title="HardKAS Dashboard Error"
          description="The dashboard failed to render, but the app is still alive."
          details={this.state.error.message}
        />
      );
    }

    return this.props.children;
  }
}

function RuntimeOfflineCard({
  title = "HardKAS Runtime Offline",
  description = "Cockpit is disconnected from the local dev server.",
  details,
}: {
  title?: string;
  description?: string;
  details?: string;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6 font-sans">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl">
        <div className="mb-4">
          <p className="text-xs uppercase tracking-widest text-amber-400 font-mono">
            Runtime status
          </p>
          <h1 className="mt-2 text-xl font-black text-zinc-100 tracking-tight">
            ⚠️ {title}
          </h1>
          <p className="mt-2 text-xs text-zinc-400 leading-normal">
            {description}
          </p>
        </div>

        {details ? (
          <pre className="mb-4 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-red-300 font-mono">
            {details}
          </pre>
        ) : null}

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
            Try these commands:
          </p>

          <div className="space-y-2 font-mono text-xs text-indigo-300">
            <div className="rounded-lg bg-zinc-900 px-3 py-2 border border-zinc-800">
              hardkas node start
            </div>
            <div className="rounded-lg bg-zinc-900 px-3 py-2 border border-zinc-800">
              hardkas node status
            </div>
            <div className="rounded-lg bg-zinc-900 px-3 py-2 border border-zinc-800">
              hardkas node logs
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProjectionBanner() {
  const { projectionStatus } = useHardKas();
  
  if (projectionStatus !== "stale" && projectionStatus !== "syncing") {
    return null;
  }
  
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center w-full pointer-events-none mt-2">
      <div className="bg-amber-500/10 border border-amber-500/50 text-amber-500 px-4 py-1.5 rounded-full text-xs font-mono font-medium shadow-lg backdrop-blur-md flex items-center space-x-2">
        <svg className="animate-spin h-3 w-3 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Projection updating — displayed data may be stale</span>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { isError, error } = useHardKasHealth();

  if (isError) {
    return (
      <RuntimeOfflineCard
        title="HardKAS Runtime Offline"
        description="Cockpit is disconnected from the local dev server."
        details={error instanceof Error ? error.message : String(error || "Dev server is unreachable")}
      />
    );
  }

  return (
    <>
      <ProjectionBanner />
      <Layout>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/:id" element={<TransactionDetailPage />} />
          <Route path="/artifacts" element={<ArtifactsPage />} />
          <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/bridge" element={<BridgePage />} />
        </Routes>
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HardKasProvider 
        config={{
          kaspaRpcUrl: "ws://127.0.0.1:18210",
          igraRpcUrl: "http://127.0.0.1:8545",
          localOnly: true,
          devServerUrl: typeof window !== "undefined" ? (window.location.port === "5173" ? "http://localhost:7420" : window.location.origin) : undefined
        }}
      >
        <DashboardErrorBoundary>
          <DashboardContent />
        </DashboardErrorBoundary>
      </HardKasProvider>
    </QueryClientProvider>
  );
}
