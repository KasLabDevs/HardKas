import React, { useState } from "react";
import { useWallet, useMutation, useHardKAS } from "@hardkas/react";

function SendKasForm({ fromAlias }: { fromAlias: string }) {
  const [toAddress, setToAddress] = useState("bob");
  const [amount, setAmount] = useState("100");

  const { execute, loading, error, data } = useMutation(
    (client, variables: { from: string; to: string; amountSompi: number }) => {
      return client.txSimulate({ ...variables, allowDevAutoSign: true });
    }
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    await execute({ from: fromAlias, to: toAddress, amountSompi: parseInt(amount, 10) });
  };

  return (
    <div style={{ marginTop: "20px", padding: "10px", border: "1px solid #ccc" }}>
      <h3>Send Simulation (Dev Auto-Sign)</h3>
      <form onSubmit={handleSend}>
        <div>
          <label>To (alias/address): </label>
          <input value={toAddress} onChange={(e) => setToAddress(e.target.value)} />
        </div>
        <div>
          <label>Amount (Sompi): </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Simulator Tx"}
        </button>
      </form>
      {error && <div style={{ color: "red" }}>Error: {JSON.stringify(error)}</div>}
      {data && (
        <div style={{ color: "green" }}>Success! Receipt TXID: {data.receipt.txId}</div>
      )}
    </div>
  );
}

function App() {
  const [alias, setAlias] = useState("alice");
  const { data, loading, error, refetch } = useWallet(alias);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>HardKAS React Demo</h1>
      <div>
        <label>Dev Account Alias: </label>
        <input value={alias} onChange={(e) => setAlias(e.target.value)} />
        <button onClick={() => refetch()} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading && <p>Loading wallet info...</p>}
      {error && <p style={{ color: "red" }}>Error: {JSON.stringify(error)}</p>}

      {data && (
        <div style={{ marginTop: "20px" }}>
          <h2>Wallet Information</h2>
          <pre>{JSON.stringify(data, null, 2)}</pre>
          <SendKasForm fromAlias={alias} />
        </div>
      )}
    </div>
  );
}

export default App;
