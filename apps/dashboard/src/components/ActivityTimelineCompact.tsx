import { useEffect, useState } from "react";
import { Activity, ShieldCheck, FileText, Cpu, AlertTriangle } from "lucide-react";

interface StreamEvent {
  type: string;
  artifactId: string;
  timestamp: string;
  status: string;
  data: any;
}

export function ActivityTimelineCompact() {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  useEffect(() => {
    // For Vite dev server, we point to localhost:7420, in prod we use relative paths
    const apiBase = process.env.NODE_ENV === "development" ? "http://localhost:7420" : "";
    const token = (window as any).__HARDKAS_DEV_TOKEN__ || "";

    // Add token to query param for EventSource since headers aren't supported
    const url = `${apiBase}/api/artifacts/stream${token ? `?token=${token}` : ""}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener("artifact", (e) => {
      try {
        const payload = JSON.parse(e.data) as StreamEvent;
        setEvents((prev) => [payload, ...prev].slice(0, 5)); // Keep last 5
      } catch (err) {
        console.error("Failed to parse SSE event", err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const getIcon = (type: string) => {
    if (type.includes("plan")) return <FileText size={14} className="text-violet-400" />;
    if (type.includes("signed"))
      return <ShieldCheck size={14} className="text-cyan-400" />;
    if (type.includes("receipt"))
      return <ShieldCheck size={14} className="text-emerald-400" />;
    if (type.includes("replay")) return <Activity size={14} className="text-amber-400" />;
    return <Cpu size={14} className="text-zinc-400" />;
  };

  const getColor = (type: string) => {
    if (type.includes("plan"))
      return "border-violet-500/20 bg-violet-500/10 text-violet-400";
    if (type.includes("signed")) return "border-cyan-500/20 bg-cyan-500/10 text-cyan-400";
    if (type.includes("receipt"))
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
    if (type.includes("replay"))
      return "border-amber-500/20 bg-amber-500/10 text-amber-400";
    return "border-zinc-700 bg-zinc-800 text-zinc-400";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Activity
        </h3>
      </div>

      <div className="space-y-2">
        {events.length === 0 ? (
          <div className="text-xs text-zinc-500 italic py-2 border border-zinc-800/50 rounded px-3 bg-zinc-950/50">
            Waiting for activity... Try sending a transaction.
          </div>
        ) : (
          events.map((ev, i) => (
            <div
              key={`${ev.artifactId}-${i}`}
              className="bg-zinc-950 p-2 rounded border border-zinc-800 flex items-center justify-between animate-in fade-in slide-in-from-top-1"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <span className={`p-1 rounded shrink-0 ${getColor(ev.type)}`}>
                  {getIcon(ev.type)}
                </span>
                <span
                  className="font-mono text-zinc-300 text-xs truncate max-w-[120px]"
                  title={ev.artifactId}
                >
                  {ev.artifactId}
                </span>
              </div>
              <span className="text-xs text-zinc-500 shrink-0">
                {new Date(ev.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
