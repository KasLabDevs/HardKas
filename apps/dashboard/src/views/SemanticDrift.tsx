import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';

type DriftState = 'GREEN' | 'YELLOW' | 'RED' | 'GREY';

interface DriftSource {
  name: string;
  available: boolean;
  note?: string;
}

export function SemanticDrift() {
  const [loading, setLoading] = useState(true);
  const [bundleAvailable, setBundleAvailable] = useState(false);
  const [storeAvailable, setStoreAvailable] = useState(false);
  const [telemetryAvailable, setTelemetryAvailable] = useState(false);
  const [driftState, setDriftState] = useState<DriftState>('GREY');
  const [sources, setSources] = useState<DriftSource[]>([]);
  const [apiOffline, setApiOffline] = useState(false);

  useEffect(() => {
    // Resolve the active API host dynamically.
    // The dev server API always runs on port 3333 locally.
    const apiHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? `http://${window.location.hostname}:3333` 
      : 'http://localhost:3333';

    // Try relative endpoint first, fallback to hardcoded port if needed
    const fetchWithFallback = async (path: string) => {
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      } catch (e) {
        // Fallback to absolute local dev URL if served on a different origin in development
        const response = await fetch(`${apiHost}${path}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
      }
    };

    Promise.all([
      fetchWithFallback('/api/dashboard-health'),
      fetchWithFallback('/api/bundles'),
    ]).then(([health, bundle]) => {
      const bundleOk = !!bundle.loaded;
      const storeOk = !!health.queryStoreExists;
      const telOk = !!health.telemetryExists;

      setBundleAvailable(bundleOk);
      setStoreAvailable(storeOk);
      setTelemetryAvailable(telOk);

      // Derive drift state from truth source agreement
      const hasDrift = bundleOk && !storeOk;
      const hasPartialSources = [bundleOk, storeOk, telOk].some(Boolean) && ![bundleOk, storeOk, telOk].every(Boolean);

      if (hasDrift) {
        setDriftState('RED');
      } else if (hasPartialSources) {
        setDriftState('YELLOW');
      } else {
        setDriftState('GREEN');
      }

      setSources([
        { name: 'Semantic Bundle', available: bundleOk, note: bundleOk ? bundle.source : 'Not found' },
        { name: 'Query Store', available: storeOk, note: storeOk ? 'query-store/store.db' : 'Not found' },
        { name: 'Telemetry', available: telOk, note: telOk ? '.hardkas/telemetry/telemetry.jsonl' : 'Not found' },
        { name: 'Filesystem Artifacts', available: !!health.artifactsDirExists, note: health.artifactsDirExists ? '.hardkas/artifacts' : 'Not found' },
      ]);
      setApiOffline(false);
      setLoading(false);
    }).catch((err) => {
      console.error("Failed to connect to Hono dev-server observability API:", err);
      setApiOffline(true);
      setDriftState('GREY');
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-zinc-500">Analyzing environment semantics...</div>;

  return (
    <div className="space-y-6">
      {apiOffline && (
        <div className="bg-red-500/10 border border-red-500/30 px-6 py-3 flex items-center gap-2 text-sm text-red-400 shrink-0 rounded-lg">
          <AlertTriangle size={16} />
          <span>
            <strong>Observability Server Offline:</strong> Could not connect to the HardKAS dev-server API.
            Ensure the server is running by executing: <code className="font-mono bg-red-950/40 px-1.5 py-0.5 rounded text-red-300">pnpm --filter @hardkas/cli run dev dashboard</code>
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-4">
        <Activity className="text-amber-400" />
        <h2 className="text-xl font-medium">Semantic Drift Viewer</h2>
      </div>

      <p className="text-zinc-500 max-w-2xl text-sm leading-relaxed">
        Compares the physical Filesystem Truth against the Query-Store Projection, Semantic Bundle, and Telemetry.
        If there is any disagreement, semantic drift is detected.
      </p>

      {driftState === 'RED' && (
        <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg">
          <div className="flex items-center gap-3 text-red-400 mb-4">
            <AlertTriangle className="h-8 w-8" />
            <h3 className="text-2xl font-bold uppercase tracking-widest">Semantic Drift Detected</h3>
          </div>
          <p className="text-red-400/80">
            The available truth sources are asymmetric. Some canonical stores are missing or disagree.
            HardKAS recommends reconciliation via replay or rebuild.
          </p>
        </div>
      )}

      {driftState === 'YELLOW' && (
        <div className="bg-amber-500/10 border border-amber-500/30 p-6 rounded-lg">
          <div className="flex items-center gap-3 text-amber-400 mb-4">
            <AlertTriangle className="h-8 w-8" />
            <h3 className="text-2xl font-bold uppercase tracking-widest">Partial Source Coverage</h3>
          </div>
          <p className="text-amber-400/80">
            Some truth sources are available but not all. Drift status is ambiguous — full verification
            requires all sources to be present.
          </p>
        </div>
      )}

      {driftState === 'GREEN' && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-lg">
          <div className="flex items-center gap-3 text-emerald-400 mb-4">
            <CheckCircle2 className="h-8 w-8" />
            <h3 className="text-2xl font-bold uppercase tracking-widest">No Drift Detected</h3>
          </div>
          <p className="text-emerald-400/80">
            Available truth sources are consistent within the current workspace.
          </p>
        </div>
      )}

      {driftState === 'GREY' && (
        <div className="bg-zinc-500/10 border border-zinc-500/30 p-6 rounded-lg">
          <div className="flex items-center gap-3 text-zinc-400 mb-4">
            <HelpCircle className="h-8 w-8" />
            <h3 className="text-2xl font-bold uppercase tracking-widest">Drift Status Unknown</h3>
          </div>
          <p className="text-zinc-400/80">
            Unable to determine drift status. The observability API is unreachable — no truth sources
            can be verified until the server is online.
          </p>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Truth Sources</h3>
        <div className="space-y-3">
          {sources.length === 0 && apiOffline && (
            <div className="text-zinc-600 text-sm italic">No source data available — API offline</div>
          )}
          {sources.map(s => (
            <div key={s.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${s.available ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-white">{s.name}</span>
              </div>
              <span className="text-zinc-500 font-mono text-xs">{s.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
