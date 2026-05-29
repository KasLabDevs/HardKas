import React, { useState } from "react";
import { AlertCircle } from "lucide-react";

export interface StatusBadgeProps {
  status: string;
  reasons?: string[];
}

export function StatusBadge({ status, reasons }: StatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const colors: Record<string, { bg: string; text: string; label: string }> = {
    healthy: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", label: "Online" },
    online: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", label: "Online" },
    offline: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", label: "Offline" },
    stale: { bg: "rgba(245, 158, 11, 0.15)", text: "#f59e0b", label: "Stale State" },
    "simulated-mode": {
      bg: "rgba(99, 102, 241, 0.15)",
      text: "#6366f1",
      label: "Simulated"
    },
    "not-configured": {
      bg: "rgba(255, 255, 255, 0.05)",
      text: "#71717a",
      label: "Not configured"
    }
  };

  const c = colors[status.toLowerCase()] || colors["offline"];
  const isStale = status.toLowerCase() === "stale";

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono cursor-default"
        style={{
          background: c.bg,
          color: c.text,
          border: `1px solid ${c.text}20`
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full mr-1.5"
          style={{ background: c.text }}
        />
        {c.label}
        {isStale && <AlertCircle size={10} className="ml-1.5" />}
      </span>

      {isStale && showTooltip && reasons && reasons.length > 0 && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-lg p-3 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
          <div className="text-[9px] font-bold uppercase tracking-widest text-amber-500 mb-2 border-b border-zinc-800 pb-1">
            Staleness Diagnostics
          </div>
          <div className="space-y-1.5 text-[10px] font-mono text-zinc-300">
            {reasons.map((r, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-zinc-600">-</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
