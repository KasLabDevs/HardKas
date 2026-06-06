import React from "react";
import ReactDOM from "react-dom/client";
import {
  HardKASProvider,
  useWallet
} from "@hardkas/react";

function App() {
  const { data: walletData, loading: sessionLoading } = useWallet('alice');

  if (sessionLoading) return <div>Loading session...</div>;

  return (
    <div>
      <h1>HardKAS React Demo (0.8.18-alpha Refactored)</h1>

      {!walletData ? (
        <div className="card status-error">
          No active session or wallet found. Ensure HardKAS Dev Server is running.
        </div>
      ) : (
        <>
          <div className="card">
            <h3>Wallet Info</h3>
            <pre style={{ fontSize: '0.8rem' }}>{JSON.stringify(walletData, null, 2)}</pre>
          </div>
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HardKASProvider baseUrl="http://127.0.0.1:7420">
      <App />
    </HardKASProvider>
  </React.StrictMode>
);
