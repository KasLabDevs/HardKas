import React from "react";
import { Sidebar } from "./Sidebar";
import { useOverview, useHardKas } from "@hardkas/react";
import { Network, Server, Box } from "lucide-react";
import { useLocation } from "react-router-dom";

export interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { data: overview } = useOverview();
  const { sseStatus } = useHardKas();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans antialiased">
      {/* Glassmorphic Global Header - Fixed at Top */}
      <header className="app-header flex items-center justify-between fixed top-0 left-0 right-0 z-40 select-none">
        {/* Left brand area - aligned with sidebar */}
        <div className="w-[var(--sidebar-width)] h-full flex items-center px-6 border-r border-[var(--border-muted)] gap-3 shrink-0">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Box size={18} className="animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="font-sans font-bold text-xs text-zinc-100 leading-tight tracking-wide">
              HardKAS
            </span>
            <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest leading-none mt-0.5">
              Localnet Explorer
            </span>
          </div>
        </div>

        {/* Right context area - full-width of content */}
        <div className="flex-1 px-8 flex items-center justify-between h-full">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-extrabold tracking-wide font-sans text-zinc-100 uppercase">
              {overview?.project?.name ?? "HARDKAS COCKPIT"}
            </h2>

            {overview?.project?.network && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase">
                <Network size={10} />
                {overview.project.network}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Dev Server Connection Status */}
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-zinc-500 uppercase tracking-widest text-[8px]">
                Server status
              </span>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold ${
                  sseStatus === "connected"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : sseStatus === "reconnecting"
                      ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}
              >
                <Server
                  size={8}
                  className={sseStatus === "reconnecting" ? "animate-spin" : ""}
                />
                {sseStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Sidebar */}
      <Sidebar />

      {/* Main Container */}
      <div className="main-layout flex flex-col min-h-screen">
        {/* Content Wrapper */}
        <main
          key={location.pathname}
          className="flex-1 p-8 overflow-y-auto w-full max-w-7xl mx-auto"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
