import { useState, useEffect } from "react";
import { ShieldCheck, Clock, CheckCircle, XCircle, Wallet, FileKey, UploadCloud, Check, Hammer } from "lucide-react";

export function Escrow() {
  const [escrowId, setEscrowId] = useState<string | null>(null);
  const [escrowState, setEscrowState] = useState<any>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchEscrow = async (id: string) => {
    try {
      const baseUrl = window.location.origin.includes('5173') ? 'http://127.0.0.1:3000' : '';
      const res = await fetch(`${baseUrl}/api/escrows/${id}`);
      const json = await res.json();
      if (json.ok) {
        setEscrowState(json.data);
      } else {
        setEscrowState(null);
        setEscrowId(null);
      }
    } catch (err) {
      console.error("Failed to fetch escrow", err);
    }
  };

  const executeAction = async (actionName: string, endpoint: string, method: string = "POST", body?: any) => {
    try {
      setLoadingAction(actionName);
      setError(null);
      const baseUrl = window.location.origin.includes('5173') ? 'http://127.0.0.1:3000' : '';
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json", "X-Hardkas-Request": "true" },
        body: body ? JSON.stringify(body) : undefined
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || `Failed to execute ${actionName}`);
      
      if (actionName === "Create") {
        setEscrowId(json.data.id);
        await fetchEscrow(json.data.id);
      } else if (actionName === "Mine Block") {
        // Mine block is decoupled, just refresh the escrow after it
        if (escrowId) {
            await fetchEscrow(escrowId);
            await fetch(`${baseUrl}/api/escrows/${escrowId}/reconcile`, { method: "POST", headers: { "X-Hardkas-Request": "true" } });
            await fetchEscrow(escrowId);
        }
      } else if (escrowId) {
        await fetchEscrow(escrowId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const reconcile = () => {
     if (escrowId) executeAction("Reconcile", `/api/escrows/${escrowId}/reconcile`);
  };

  const createEscrow = () => {
    const config = {
      buyer: { publicKeyHex: "030a5996ccb6b3e80c85c2921c5720bcff27d2c3e1e69da5c50674ed4466b02662" }, 
      seller: { publicKeyHex: "03a85b9b8b7ed6fc01b7a2d4b8be357e60ea9b02a2491a5e128cc1e9fdf5522731" }, 
      arbiter: { publicKeyHex: "023ab915359756b5394208bd165b5120ec0be4061a1290380c5ce54460decfb881" }, 
      buyerDestinationSpk: "20f69a597a760c2d3eddb5e6db24e39ee0b3b429188e63cc8d8174f8cfb5e11bbdac",
      sellerDestinationSpk: "208d1f2a36b5ec63251ed7a69b0fa6bb781e6a928421c97a5b3eeef52bc5da8669ac",
      refundAmount: 2000000000n.toString(), 
      releaseAmount: 2000000000n.toString()
    };
    executeAction("Create", "/api/escrows", "POST", config);
  };

  const fundEscrow = () => executeAction("Fund", `/api/escrows/${escrowId}/fund`);
  const mineBlock = () => executeAction("Mine Block", `/api/simnet/mine`);
  
  const prepareRelease = (branch: string) => executeAction(`Prepare ${branch}`, `/api/escrows/${escrowId}/release/prepare`, "POST", { branch });
  const sign = (role: string) => executeAction(`Sign ${role}`, `/api/escrows/${escrowId}/sign`, "POST", { role });
  const broadcastRelease = () => executeAction("Release", `/api/escrows/${escrowId}/release`);

  const resolutionPolicy: any = {
      mutualRelease: { req: ["buyer", "seller"] },
      refundBuyer: { req: ["buyer", "arbiter"] },
      releaseToSeller: { req: ["seller", "arbiter"] }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <ShieldCheck className="text-emerald-400" />
          Escrow Policy Resolution
        </h1>
        <p className="text-zinc-400">
          Matrix deterministic P2SH execution over Simnet.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
            <h2 className="text-lg font-medium text-white mb-6 border-b border-zinc-800 pb-2 flex justify-between">
               Execution Trace
               {escrowId && <span className="text-xs font-mono text-zinc-500">{escrowId.split("-")[0]}...</span>}
            </h2>
            
            {!escrowState && !loadingAction && (
              <div className="flex items-center justify-center h-48 border-2 border-dashed border-zinc-800 rounded-lg bg-zinc-900/50">
                <div className="text-center">
                  <ShieldCheck className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
                  <p className="text-zinc-500 text-sm">No active escrow. Create one to begin.</p>
                </div>
              </div>
            )}

            {loadingAction === "Create" && (
              <div className="flex items-center gap-3 p-4 bg-zinc-800/50 rounded-lg">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-zinc-300">Compiling Covenant & Initializing...</span>
              </div>
            )}

            {escrowState && (
              <div className="space-y-6">
                
                {/* 1. CREATED */}
                <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="text-emerald-500" size={18} />
                    <h3 className="font-medium text-white">Escrow Created</h3>
                  </div>
                  <div className="space-y-2 text-sm text-zinc-400">
                    <div className="flex justify-between">
                      <span>P2SH Address:</span>
                      <span className="font-mono text-xs text-zinc-300 bg-black/50 px-2 py-0.5 rounded border border-zinc-800">{escrowState.p2shState.lockingScriptHex.substring(0, 20)}...</span>
                    </div>
                  </div>
                </div>

                {/* 2. FUNDING */}
                {(escrowState.state !== "CREATED" || loadingAction === "Fund") && (
                  <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
                    <div className="flex items-center gap-2 mb-3">
                      {escrowState.funding?.status === "confirmed" ? (
                        <CheckCircle className="text-emerald-500" size={18} />
                      ) : escrowState.funding?.status === "verification_timeout" ? (
                        <Clock className="text-amber-500" size={18} />
                      ) : (
                        <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                      )}
                      <h3 className="font-medium text-white">Funding</h3>
                    </div>
                    
                    {escrowState.funding?.transactionId && (
                      <div className="space-y-2 text-sm text-zinc-400">
                        <div className="flex justify-between">
                          <span>Funding TX:</span>
                          <span className="font-mono text-xs text-zinc-300 bg-black/50 px-2 py-0.5 rounded border border-zinc-800">{escrowState.funding.transactionId.substring(0, 16)}...</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>Status:</span>
                          <div className="flex items-center gap-2">
                             <span className={escrowState.funding.status === "confirmed" ? "text-emerald-400" : "text-amber-400"}>
                               {escrowState.funding.status.toUpperCase()}
                             </span>
                             {escrowState.funding.status === "verification_timeout" && (
                                <button onClick={reconcile} className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded">Recheck</button>
                             )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. RELEASE BRANCHES */}
                {escrowState.state === "FUNDED" && !escrowState.preparedRelease && (
                  <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
                     <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                        <FileKey className="text-blue-400" size={18} /> Select Resolution Branch
                     </h3>
                     <div className="grid grid-cols-3 gap-3">
                        <button onClick={() => prepareRelease("mutualRelease")} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 px-3 rounded transition-colors flex items-center justify-center gap-2">
                           Mutual Release
                        </button>
                        <button onClick={() => prepareRelease("refundBuyer")} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 px-3 rounded transition-colors flex items-center justify-center gap-2">
                           Buyer Refund
                        </button>
                        <button onClick={() => prepareRelease("releaseToSeller")} className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-2 px-3 rounded transition-colors flex items-center justify-center gap-2">
                           Seller Release
                        </button>
                     </div>
                  </div>
                )}

                {/* 3. RELEASE PREPARED */}
                {(escrowState.preparedRelease) && (
                  <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
                    <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
                        <div className="flex items-center gap-2">
                           <FileKey className="text-blue-400" size={18} />
                           <h3 className="font-medium text-white">Branch: <span className="text-blue-400 font-mono text-xs">{escrowState.preparedRelease.branch}</span></h3>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm text-zinc-400">
                        <span>Expected Policy Hash:</span>
                        <span className="font-mono text-xs text-blue-300 bg-black/50 px-2 py-0.5 rounded border border-zinc-800" title={escrowState.preparedRelease.policyHash}>{escrowState.preparedRelease.policyHash.substring(0,10)}...</span>
                      </div>
                      <div className="flex justify-between text-sm text-zinc-400">
                        <span>Expected Outputs Hash:</span>
                        <span className="font-mono text-xs text-emerald-300/80 bg-black/50 px-2 py-0.5 rounded border border-zinc-800" title={escrowState.preparedRelease.expectedOutputsHash}>{escrowState.preparedRelease.expectedOutputsHash.substring(0,10)}...</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        {resolutionPolicy[escrowState.preparedRelease.branch].req.map((role: string) => (
                           <div key={role} className="bg-zinc-800/50 p-3 rounded-md border border-zinc-700/50">
                             <div className="flex justify-between items-center mb-2">
                               <span className="text-sm font-medium text-zinc-300 capitalize">{role}</span>
                               {escrowState.signatures?.[role] ? <Check size={16} className="text-emerald-400" /> : <Clock size={16} className="text-zinc-500" />}
                             </div>
                             {escrowState.signatures?.[role] ? (
                               <span className="text-xs text-emerald-400/80 font-mono break-all">{escrowState.signatures[role].substring(0,16)}...</span>
                             ) : (
                               <button onClick={() => sign(role)} disabled={loadingAction !== null} className="w-full py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-white transition-colors">
                                 Sign with DevKey
                               </button>
                             )}
                           </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. BROADCAST SPEND */}
                {(escrowState.state === "RELEASED" || escrowState.release || loadingAction === "Release") && (
                  <div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
                    <div className="flex items-center gap-2 mb-3">
                      {escrowState.state === "RELEASED" ? (
                        <CheckCircle className="text-emerald-500" size={18} />
                      ) : escrowState.release?.status === "verification_timeout" ? (
                        <Clock className="text-amber-500" size={18} />
                      ) : (
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      )}
                      <h3 className="font-medium text-white">Spend Transaction</h3>
                    </div>
                    
                    {escrowState.release ? (
                      <div className="space-y-2 text-sm text-zinc-400">
                         <div className="flex justify-between">
                            <span>Spend TX:</span>
                            <span className="font-mono text-xs text-zinc-300 bg-black/50 px-2 py-0.5 rounded border border-zinc-800">{escrowState.release.transactionId.substring(0, 16)}...</span>
                         </div>
                         <div className="flex justify-between">
                            <span>Actual Outputs Hash:</span>
                            <span className="font-mono text-xs text-emerald-300/80 bg-black/50 px-2 py-0.5 rounded border border-zinc-800" title={escrowState.release.actualOutputsHash}>{escrowState.release.actualOutputsHash.substring(0, 10)}...</span>
                         </div>
                         <div className="flex justify-between">
                            <span>Paid Fee:</span>
                            <span className="font-mono text-xs text-zinc-300">{escrowState.release.feeSompi} sompi</span>
                         </div>
                         <div className="flex justify-between items-center pt-2">
                          <span>Status:</span>
                          <div className="flex items-center gap-2">
                             <span className={escrowState.release.status === "confirmed" ? "text-emerald-400 font-medium" : "text-amber-400"}>
                               {escrowState.release.status.toUpperCase()}
                             </span>
                             {escrowState.release.status === "verification_timeout" && (
                                <button onClick={reconcile} className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded">Recheck</button>
                             )}
                          </div>
                        </div>
                      </div>
                    ) : (
                       <div className="text-sm text-zinc-400">
                        Broadcasting and verifying spend...
                      </div>
                    )}
                  </div>
                )}

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
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 sticky top-6">
            <h2 className="text-lg font-medium text-white mb-4">Actions</h2>
            <div className="space-y-3">
              <button 
                onClick={createEscrow}
                disabled={loadingAction !== null || escrowState !== null}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-md transition-colors flex items-center gap-3"
              >
                <ShieldCheck size={18} className="text-zinc-400" />
                1. Create Escrow
              </button>

              <button 
                onClick={fundEscrow}
                disabled={loadingAction !== null || !escrowState || escrowState.state !== "CREATED"}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-md transition-colors flex items-center gap-3"
              >
                <Wallet size={18} className="text-zinc-400" />
                2. Fund (Real Simnet)
              </button>

              <button 
                onClick={broadcastRelease}
                disabled={loadingAction !== null || !escrowState || escrowState.state !== "READY_TO_RELEASE"}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-md transition-colors flex items-center gap-3"
              >
                <UploadCloud size={18} className="text-emerald-400" />
                3. Broadcast Release
              </button>
            </div>
            
            <div className="mt-6 pt-6 border-t border-zinc-800">
               <div className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-3">Simnet Miner</div>
               <button 
                onClick={mineBlock}
                disabled={loadingAction !== null}
                className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <Hammer size={16} />
                Mine Blocks (Push DAG)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
