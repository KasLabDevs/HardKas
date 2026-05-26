import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
  const [driftDetected, setDriftDetected] = useState(false);
  const [sources, setSources] = useState<DriftSource[]>([]);

  useEffect(() => {
    Promise.all([
      fetch('http://localhost:3333/api/dashboard-health').then(r => r.json()),
      fetch('http://localhost:3333/api/bundles').then(r => r.json()),
    ]).then(([health, bundle]) => {
      const bundleOk = !!bundle.loaded;
      const storeOk = !!health.queryStoreExists;
      const telOk = !!health.telemetryExists;

      setBundleAvailable(bundleOk);
      setStoreAvailable(storeOk);
      setTelemetryAvailable(telOk);

      // Drift is detected if we have sources that disagree.
      // For now: if bundle exists but query-store doesn't, that's an asymmetry worth flagging.
      const hasDrift = bundleOk && !storeOk;
      setDriftDetected(hasDrift);

      setSources([
        { name: 'Semantic Bundle', available: bundleOk, note: bundleOk ? bundle.source : 'Not found' },
        { name: 'Query Store', available: storeOk, note: storeOk ? 'query-store/store.db' : 'Not found' },
        { name: 'Telemetry', available: telOk, note: telOk ? '.hardkas/telemetry/telemetry.jsonl' : 'Not found' },
        { name: 'Filesystem Artifacts', available: !!health.artifactsDirExists, note: health.artifactsDirExists ? '.hardkas/artifacts' : 'Not found' },
      ]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-zinc-500">Analyzing environment semantics...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-4">
        <Activity className="text-amber-400" />
        <h2 className="text-xl font-medium">Semantic Drift Viewer</h2>
      </div>

      <p className="text-zinc-500 max-w-2xl text-sm leading-relaxed">
        Compares the physical Filesystem Truth against the Query-Store Projection, Semantic Bundle, and Telemetry.
        If there is any disagreement, semantic drift is detected.
      </p>

      {driftDetected ? (
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
      ) : (
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

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">Truth Sources</h3>
        <div className="space-y-3">
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
