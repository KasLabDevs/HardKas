import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface HealthResponse {
  apiConnected: boolean;
  workspaceRoot: string;
  hardkasDirExists: boolean;
  queryStoreExists: boolean;
  telemetryExists: boolean;
  eventsExists: boolean;
  semanticBundleExists: boolean;
  artifactsDirExists: boolean;
  quarantineDirExists: boolean;
  reportsDirExists: boolean;
  loadedAt: string;
  warnings: string[];
}

export function DashboardHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('http://localhost:3333/api/dashboard-health')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="bg-red-500/10 border-b border-red-500/30 px-6 py-2 flex items-center gap-2 text-sm text-red-400 shrink-0">
        <XCircle size={14} />
        <span>Dashboard API not connected or outdated. Restart with: <code className="font-mono">pnpm --filter @hardkas/cli run dev dashboard</code></span>
      </div>
    );
  }

  if (!health) return null;

  const warnings = health.warnings || [];
  const warningCount = warnings.length;
  const checks = [
    health.hardkasDirExists,
    health.semanticBundleExists,
    health.artifactsDirExists,
  ];
  const passedChecks = checks.filter(Boolean).length;

  if (warningCount === 0) {
    return (
      <div className="bg-emerald-500/5 border-b border-emerald-500/20 px-6 py-2 flex items-center justify-between text-sm shrink-0">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 size={14} />
          <span>API connected · All data sources available</span>
        </div>
        <span className="text-zinc-600 text-xs font-mono">{health.workspaceRoot}</span>
      </div>
    );
  }

  return (
    <div className="bg-amber-500/5 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between text-sm shrink-0">
      <div className="flex items-center gap-2 text-amber-400">
        <AlertTriangle size={14} />
        <span>API connected · {passedChecks}/{checks.length} sources available · {warningCount} optional data warning{warningCount > 1 ? 's' : ''}</span>
      </div>
      <span className="text-zinc-600 text-xs font-mono">{health.workspaceRoot}</span>
    </div>
  );
}
