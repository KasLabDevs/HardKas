import React from "react";
import ReactDOM from "react-dom/client";
import { 
  HardKasProvider, 
  useHardKasSession, 
  useKaspaBalance, 
  useIgraBalance,
  useBridgeLocalPlan
} from "@hardkas/react";

function App() {
  const { data: session, isLoading: sessionLoading } = useHardKasSession();
  const { data: kaspaBalance } = useKaspaBalance({ refetchInterval: 5000 });
  const { data: igraBalance } = useIgraBalance({ refetchInterval: 5000 });
  
  // Bridge planning example (10 KAS)
  const { data: bridgePlan } = useBridgeLocalPlan(
    session ? { amountSompi: 1000000000n } : null
  );

  if (sessionLoading) return <div>Loading session...</div>;

  return (
    <div>
      <h1>HardKas React Demo</h1>
      
      {!session ? (
        <div className="card status-error">
          No active session. Run <code>hardkas session use &lt;name&gt;</code> in your terminal.
        </div>
      ) : (
        <>
          <div className="card">
            <h3>Session Info</h3>
            <p><strong>Name:</strong> {session.name}</p>
            <p><strong>L1 Wallet:</strong> {session.l1.wallet} ({session.l1.address})</p>
            <p><strong>L2 Account:</strong> {session.l2.account} ({session.l2.address})</p>
          </div>

          <div className="card">
            <h3>Balances</h3>
            <p><strong>Kaspa L1:</strong> {kaspaBalance !== undefined ? (Number(kaspaBalance) / 1e8).toFixed(2) : "..."} KAS</p>
            <p><strong>Igra L2:</strong> {igraBalance !== undefined ? (Number(igraBalance) / 1e18).toFixed(4) : "..."} iKAS</p>
          </div>

          <div className="card">
            <h3>Bridge Simulation</h3>
            {bridgePlan ? (
              <div>
                <p className="status-ok">Bridge Entry Plan Ready!</p>
                <p><strong>Fee:</strong> {(Number(bridgePlan.estimatedFeeSompi) / 1e8).toFixed(6)} KAS</p>
                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}><strong>Payload:</strong> {bridgePlan.serializedPayload}</p>
              </div>
            ) : (
              <p>Planning bridge entry...</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HardKasProvider 
      config={{
        kaspaRpcUrl: "http://127.0.0.1:16110",
        igraRpcUrl: "http://127.0.0.1:8545",
        localOnly: true
      }}
    >
      <App />
    </HardKasProvider>
  </React.StrictMode>
);
