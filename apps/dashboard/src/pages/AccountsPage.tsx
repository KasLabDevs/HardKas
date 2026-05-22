import React, { useState } from "react";
import { useAccounts } from "@hardkas/react";
import { Copy, Check, Users, Search, Terminal } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { ProvenancePanel } from "../components/ProvenancePanel";

export function AccountsPage() {
  const { data, isLoading } = useAccounts();
  const accounts = data?.accounts || [];
  const provenance = data?.provenance;
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const filteredAccounts = (accounts || []).filter((acc: any) => {
    const term = searchTerm.toLowerCase();
    return (
      (acc.alias || "").toLowerCase().includes(term) ||
      (acc.address || "").toLowerCase().includes(term) ||
      (acc.type || "").toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            Simulated Accounts
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-normal">
            Deterministic local accounts and addresses. Balances are derived dynamically from UTXOs in the localnet state.
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search accounts or addresses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-sans"
          />
        </div>
      </div>

      {provenance && (
        <ProvenancePanel
          authority={provenance.authority}
          derivedFrom={provenance.derivedFrom}
          originalPath={provenance.originalPath}
          integrity={provenance.integrity}
          replayScope={provenance.replayScope}
          consensusValidated={provenance.consensusValidated}
        />
      )}

      {/* Main Grid Layout */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-zinc-900/20 border border-zinc-800 rounded-2xl p-6 space-y-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 bg-zinc-800 rounded w-24" />
                <div className="h-4 bg-zinc-800 rounded-full w-16" />
              </div>
              <div className="h-8 bg-zinc-800 rounded w-full" />
              <div className="h-6 bg-zinc-800 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filteredAccounts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredAccounts.map((account: any, i: number) => {
            const isCopied = copiedAddress === account.address;
            const balanceUnit = account.address.startsWith("kaspa:") ? "KAS" : "iKAS";
            const accountType = account.type || "simulated";
            
            return (
              <div 
                key={account.address || i} 
                className="bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700/60 rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 group relative overflow-hidden shadow-md hover:shadow-indigo-500/5 hover:scale-[1.02]"
              >

                <div className="space-y-4">
                  {/* Alias & Type Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-zinc-200 flex items-center gap-1.5 truncate">
                      {account.alias || "Unnamed Account"}
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      accountType === "rpc" 
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                        : accountType === "external"
                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                          : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                    }`}>
                      {accountType}
                    </span>
                  </div>

                  {/* Copyable Address block */}
                  <div className="bg-zinc-950/50 border border-zinc-900/80 hover:border-zinc-805 rounded-xl p-3 flex items-center justify-between gap-3 group/address transition-all">
                    <span className="font-mono text-[10px] text-zinc-400 truncate select-all" title={account.address}>
                      {account.address}
                    </span>
                    <button
                      onClick={() => handleCopy(account.address)}
                      className="shrink-0 p-1.5 bg-zinc-900 border border-zinc-850 hover:border-zinc-700 hover:bg-zinc-850 rounded-lg text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                    >
                      {isCopied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                    </button>
                  </div>
                </div>

                {/* Account Balances */}
                <div className="mt-6 pt-4 border-t border-zinc-800/60 flex items-end justify-between">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 font-bold">UTXO Balance</span>
                    <div className="flex items-baseline gap-1 mt-1.5">
                      <span className="text-xl font-black font-mono text-zinc-100">
                        {account.balanceKas !== undefined ? account.balanceKas : account.balance !== undefined ? account.balance.toLocaleString() : "0"}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">{balanceUnit}</span>
                    </div>
                  </div>
                  
                  {account.derivationPath && (
                    <span className="text-[8px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900 font-bold">
                      path: {account.derivationPath}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No Accounts Found"
          description="We couldn't find any simulated accounts matching your criteria. Active sessions should automatically discover available accounts."
          command="hardkas session create --alias my-session"
          icon={<Users size={32} />}
        />
      )}
    </div>
  );
}
