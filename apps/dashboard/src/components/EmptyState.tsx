import React from "react";
import { Terminal, Copy, Check } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  description: string;
  command: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, description, command, icon }: EmptyStateProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20 max-w-xl mx-auto my-8">
      {icon && (
        <div className="p-4 rounded-full bg-indigo-500/5 text-indigo-400 mb-4 border border-indigo-500/10">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold text-zinc-100 mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{description}</p>
      
      <div className="w-full bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-4 text-left font-mono relative group">
        <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider mb-2 font-sans select-none">
          <span className="flex items-center gap-1.5">
            <Terminal size={10} />
            Try this in your CLI
          </span>
          <button 
            onClick={handleCopy}
            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-900"
          >
            {copied ? (
              <>
                <Check size={10} className="text-emerald-400" />
                <span className="text-emerald-400 font-sans">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={10} />
                <span className="font-sans">Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="text-xs text-indigo-300 whitespace-pre-wrap break-all pr-8 select-all">
          {command}
        </pre>
      </div>
    </div>
  );
}
