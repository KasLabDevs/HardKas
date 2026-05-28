import { useEffect, useState } from 'react';
import { Activity, ShieldCheck, FileText, Cpu, AlertTriangle, Clock } from 'lucide-react';

interface StreamEvent {
  type: string;
  artifactId: string;
  timestamp: string;
  status: string;
  data: any;
}

export function ActivityTimelinePage() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const apiBase = process.env.NODE_ENV === 'development' ? 'http://localhost:7420' : '';
    const token = (window as any).__HARDKAS_DEV_TOKEN__ || '';
    
    const url = `${apiBase}/api/artifacts/stream${token ? `?token=${token}` : ''}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('connected', () => {
      setConnected(true);
    });

    eventSource.addEventListener('artifact', (e) => {
      try {
        const payload = JSON.parse(e.data) as StreamEvent;
        setEvents(prev => [payload, ...prev].slice(0, 100)); // Keep last 100
      } catch (err) {
        console.error("Failed to parse SSE event", err);
      }
    });

    eventSource.onerror = () => {
      setConnected(false);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const getIcon = (type: string) => {
    if (type.includes('plan')) return <FileText size={18} className="text-violet-400" />;
    if (type.includes('signed')) return <ShieldCheck size={18} className="text-cyan-400" />;
    if (type.includes('receipt')) return <ShieldCheck size={18} className="text-emerald-400" />;
    if (type.includes('replay')) return <Activity size={18} className="text-amber-400" />;
    return <Cpu size={18} className="text-zinc-400" />;
  };

  const getColor = (type: string) => {
    if (type.includes('plan')) return 'border-violet-500/20 bg-violet-500/10 text-violet-400';
    if (type.includes('signed')) return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400';
    if (type.includes('receipt')) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
    if (type.includes('replay')) return 'border-amber-500/20 bg-amber-500/10 text-amber-400';
    return 'border-zinc-700 bg-zinc-800 text-zinc-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          <Clock className="text-blue-400" />
          <h2 className="text-xl font-medium">Activity Timeline</h2>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Stream
            </span>
          ) : (
            <span className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
              <AlertTriangle size={12} />
              Disconnected
            </span>
          )}
        </div>
      </div>

      <p className="text-zinc-500 max-w-2xl text-sm leading-relaxed">
        Real-time observation of artifact creation, lineage resolution, and replay verification.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {events.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-zinc-400 font-medium">Listening for artifact activity...</p>
            <p className="text-zinc-600 text-sm mt-2">Execute a workflow to see events populate here.</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {events.map((ev, i) => (
              <div key={`${ev.artifactId}-${i}`} className="p-4 flex items-start gap-4 hover:bg-zinc-800/30 transition-colors animate-in fade-in slide-in-from-top-2">
                <div className={`p-2 rounded mt-0.5 shrink-0 ${getColor(ev.type)}`}>
                  {getIcon(ev.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-white truncate pr-4">
                      {ev.type.toUpperCase()} <span className="font-mono text-zinc-500 font-normal ml-2">{ev.artifactId}</span>
                    </h4>
                    <span className="text-xs text-zinc-500 whitespace-nowrap">
                      {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {ev.data?.summary || ev.data?.description || `New ${ev.type} generated.`}
                  </div>
                  {ev.parentArtifactIds && ev.parentArtifactIds.length > 0 && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {ev.parentArtifactIds.map((pid: string) => (
                        <span key={pid} className="text-[10px] font-mono text-zinc-500 bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded">
                          parent: {pid.substring(0, 8)}...
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
