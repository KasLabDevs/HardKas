import { useState } from "react";
import { Store, ShoppingCart, CheckCircle, Clock, XCircle, ShieldCheck, ArrowRight, Wallet, Check } from "lucide-react";
import { createKaspaP2shBlake2bLock } from "@hardkas/core";

export function Marketplace() {
  const [step, setStep] = useState<"IDLE" | "CREATING" | "PENDING_FUNDING" | "FUNDED">("IDLE");
  const [escrowState, setEscrowState] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const createEscrow = async () => {
    try {
      setStep("CREATING");
      setError(null);
      // Hardcoded mock identities for the demo
      const config = {
        buyer: { publicKeyHex: "030a5996ccb6b3e80c85c2921c5720bcff27d2c3e1e69da5c50674ed4466b02662" }, // Alice
        seller: { publicKeyHex: "03a85b9b8b7ed6fc01b7a2d4b8be357e60ea9b02a2491a5e128cc1e9fdf5522731" }, // Bob
        arbiter: { publicKeyHex: "023ab915359756b5394208bd165b5120ec0be4061a1290380c5ce54460decfb881" }, // Charlie
        buyerDestinationSpk: "20f69a597a760c2d3eddb5e6db24e39ee0b3b429188e63cc8d8174f8cfb5e11bbdac",
        sellerDestinationSpk: "208d1f2a36b5ec63251ed7a69b0fa6bb781e6a928421c97a5b3eeef52bc5da8669ac",
        refundAmount: 2000000000n.toString(), // 2 KAS stringified to bypass JSON bigint limitations
        releaseAmount: 2000000000n.toString()
      };

      const baseUrl = window.location.origin.includes('5173') ? 'http://127.0.0.1:3000' : '';
      const response = await fetch(`${baseUrl}/api/escrow/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hardkas-Request": "true"
        },
        body: JSON.stringify(config)
      });

      const resJson = await response.json();
      if (!resJson.ok) {
        throw new Error(resJson.error || "Failed to compile escrow");
      }

      setEscrowState({
        ...resJson.data.state,
        artifact: resJson.data.artifact,
        p2shAddress: resJson.data.state.lockingScriptHex // Placeholder since Kaspa-wasm isn't bundled directly in this component yet, we can convert SPK to address
      });
      
      setStep("PENDING_FUNDING");
    } catch (err: any) {
      setError(err.message);
      setStep("IDLE");
    }
  };

  const simulateFunding = () => {
    // In a real app we'd wait for the RPC or WebSocket event
    // Here we simulate the FUNDED state
    setStep("FUNDED");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <ShoppingCart className="text-emerald-400" />
          Escrow Marketplace
        </h1>
        <p className="text-zinc-400">
          A minimalistic escrow marketplace module.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-lg font-medium text-white mb-4">Escrow Lifecycle</h2>
            
            {step === "IDLE" && (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-zinc-800 rounded-lg bg-zinc-900/50">
                <div className="text-center">
                  <ShoppingCart className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
                  <p className="text-zinc-500 text-sm">Waiting for operation to start</p>
                </div>
              </div>
            )}

            {step === "CREATING" && (
              <div className="flex items-center justify-center h-48 border-2 border-zinc-800 rounded-lg bg-zinc-900">
                <div className="text-center flex flex-col items-center">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-zinc-400 text-sm">Compiling SilverScript Covenant...</p>
                </div>
              </div>
            )}

            {step === "PENDING_FUNDING" && escrowState && (
              <div className="space-y-4">
                <div className="p-4 border border-amber-500/20 bg-amber-500/5 rounded-md">
                  <div className="flex items-center gap-2 text-amber-500 font-medium mb-2">
                    <Clock size={18} />
                    Waiting for Funding
                  </div>
                  <p className="text-sm text-zinc-400 mb-3">
                    The escrow covenant has been compiled successfully. Please send <strong className="text-white">4.0 KAS</strong> to the following P2SH address:
                  </p>
                  <div className="bg-black/50 p-3 rounded font-mono text-xs text-zinc-300 break-all border border-zinc-800">
                    {escrowState.lockingScriptHex}
                  </div>
                </div>
              </div>
            )}

            {step === "FUNDED" && (
              <div className="space-y-4">
                <div className="p-4 border border-emerald-500/20 bg-emerald-500/5 rounded-md">
                  <div className="flex items-center gap-2 text-emerald-500 font-medium mb-2">
                    <CheckCircle size={18} />
                    Escrow Funded
                  </div>
                  <p className="text-sm text-zinc-400">
                    The escrow has received the required funds and is locked. It can now be released or refunded.
                  </p>
                </div>
                
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <button className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2">
                    Mutual Release
                  </button>
                  <button className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2">
                    Arbiter Refund
                  </button>
                  <button className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm py-2 px-3 rounded transition-colors flex items-center justify-center gap-2">
                    Arbiter Release
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2 text-red-400">
                <XCircle size={18} className="shrink-0 mt-0.5" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-lg font-medium text-white mb-4">Operation Actions</h2>
            <div className="space-y-4">
              <button 
                onClick={createEscrow}
                disabled={step !== "IDLE"}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <ShieldCheck size={18} />
                {step === "IDLE" ? "Create Escrow Operation" : "Operation Active"}
              </button>

              {step === "PENDING_FUNDING" && (
                <button 
                  onClick={simulateFunding}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Wallet size={18} />
                  Simulate Funding (Dev)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
