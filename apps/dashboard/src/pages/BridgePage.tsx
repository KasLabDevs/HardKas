import React from "react";
import { ArrowLeftRight, Clock, HelpCircle, Terminal } from "lucide-react";
import { EmptyState } from "../components/EmptyState";

export function BridgePage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Panel */}
      <div className="pb-5 border-b border-zinc-800">
        <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
          L1 ⇄ L2 Bridge Sandbox
        </h1>
        <p className="text-xs text-zinc-400 mt-1 leading-normal">
          Cross-chain transfer playground between Kaspa L1 and Igra L2 Rollup.
        </p>
      </div>

      <EmptyState
        title="Bridge Portal Offline"
        description="L1 ⇄ L2 bridging operations are fully integrated into the CLI. Run a bridge transaction plan locally to see it sync."
        command="hardkas bridge send --amount 500 --from alice --to bob"
        icon={<ArrowLeftRight size={32} />}
      />

      {/* Info card explaining bridging */}
      <div className="bg-zinc-900/35 border border-zinc-800 rounded-2xl p-6 max-w-xl mx-auto space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
          <HelpCircle size={14} className="text-indigo-400" />
          Deterministic Bridging Flow
        </h4>
        <p className="text-xs text-zinc-500 leading-relaxed font-sans">
          Bridging locks KAS on the L1 state network using a multi-sig script. The Igra L2
          sequencer automatically indexes these lock receipts, mints iKAS (wrapped KAS on
          L2), and distributes it to the recipient's rollup address. All steps are
          reproducible and verified.
        </p>
      </div>
    </div>
  );
}
