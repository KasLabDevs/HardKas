import React from "react";
import { Loader2 } from "lucide-react";

export interface LoadingStateProps {
  message?: string;
  minHeight?: string;
}

export function LoadingState({ message = "Loading...", minHeight = "200px" }: LoadingStateProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center w-full bg-zinc-900/10 border border-dashed border-zinc-800/50 rounded-2xl animate-pulse"
      style={{ minHeight }}
    >
      <Loader2 className="animate-spin text-zinc-500 mb-4" size={24} />
      <span className="text-sm font-mono text-zinc-500 tracking-wider uppercase">{message}</span>
    </div>
  );
}
