import React from "react";
import { NavLink } from "react-router-dom";
import { 
  LayoutDashboard, 
  Users, 
  ArrowLeftRight, 
  Package, 
  RotateCw, 
  Wallet,
  Activity,
  Box,
  ListTree,
  GitBranch
} from "lucide-react";
import { useOverview } from "@hardkas/react";

export function Sidebar() {
  const { data: overview } = useOverview();

  const links = [
    {
      to: "/",
      label: "Overview",
      icon: <LayoutDashboard size={18} />,
      badge: null
    },
    {
      to: "/accounts",
      label: "Accounts",
      icon: <Users size={18} />,
      badge: overview?.counts?.accounts ?? null
    },
    {
      to: "/transactions",
      label: "Transactions",
      icon: <ArrowLeftRight size={18} />,
      badge: overview?.counts?.transactions ?? null
    },
    {
      to: "/artifacts",
      label: "Artifacts",
      icon: <Package size={18} />,
      badge: overview?.counts?.artifacts ?? null
    },
    {
      to: "/workflows",
      label: "Workflows",
      icon: <GitBranch size={18} />,
      badge: null
    },
    {
      to: "/replay",
      label: "Replay Verifier",
      icon: <RotateCw size={18} />,
      badge: overview?.counts?.replays ?? null
    },
    {
      to: "/events",
      label: "Events Timeline",
      icon: <ListTree size={18} />,
      badge: null
    },
    {
      to: "/wallets",
      label: "Wallet Connect",
      icon: <Wallet size={18} />,
      badge: null
    }
  ];

  return (
    <aside className="sidebar-aside bg-[var(--bg-surface)] border-r border-[var(--border-muted)] flex flex-col h-screen fixed left-0 top-0 z-30 select-none">
      {/* Navigation Links */}
      <nav className="flex-1 px-4 pt-10 pb-6 space-y-1.5 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) => 
              `flex items-center justify-between px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 group border cursor-pointer nav-link ${
                isActive ? "active" : ""
              }`
            }
          >
            <div className="flex items-center gap-3">
              <span className="group-hover:scale-105 transition-transform">{link.icon}</span>
              <span>{link.label}</span>
            </div>
            
            {link.badge !== null && (
              <span className="text-[10px] font-mono font-bold bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 px-2 py-0.5 rounded-full shrink-0 group-hover:border-zinc-600 transition-colors">
                {link.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-[var(--border-muted)] bg-zinc-950/20">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
          <Activity size={12} className="text-zinc-500 animate-pulse" />
          <span>v0.7.0-alpha</span>
        </div>
      </div>
    </aside>
  );
}
