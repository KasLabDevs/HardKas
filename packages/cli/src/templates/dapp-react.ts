import path from "node:path";
import fs from "node:fs";

export async function dappReactTemplate(targetDir: string, projectName: string) {
  const writeFile = (file: string, content: string) => {
    const fullPath = path.join(targetDir, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content.trim() + "\n", "utf-8");
  };

  writeFile("package.json", JSON.stringify({
    name: projectName,
    version: "0.1.0",
    type: "module",
    scripts: {
      "dev": "vite",
      "build": "tsc && vite build",
      "preview": "vite preview"
    },
    dependencies: {
      "react": "^18.2.0",
      "react-dom": "^18.2.0",
      "@hardkas/sdk": "workspace:*" // Placeholder, actual installation will resolve to latest
    },
    devDependencies: {
      "@types/react": "^18.2.66",
      "@types/react-dom": "^18.2.22",
      "@vitejs/plugin-react": "^4.2.1",
      "typescript": "^5.2.2",
      "vite": "^5.2.0"
    }
  }, null, 2));

  writeFile("tsconfig.json", JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true
    },
    include: ["src"],
    references: [{ path: "./tsconfig.node.json" }]
  }, null, 2));

  writeFile("tsconfig.node.json", JSON.stringify({
    compilerOptions: {
      composite: true,
      skipLibCheck: true,
      module: "ESNext",
      moduleResolution: "bundler",
      allowSyntheticDefaultImports: true,
      strict: true
    },
    include: ["vite.config.ts"]
  }, null, 2));

  writeFile("vite.config.ts", `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
`);

  writeFile("index.html", `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HardKAS dApp</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; color: #333; margin: 0; padding: 20px; }
      .container { max-width: 800px; margin: 0 auto; }
      .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
      h1, h2 { margin-top: 0; }
      pre { background: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; }
      button { background: #0070f3; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
      button:hover { background: #0051a8; }
      .warning { background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; margin-bottom: 20px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`);

  writeFile("src/main.tsx", `
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`);

  writeFile("src/hardkas/client.ts", `
import { createHardkasClient } from "@hardkas/sdk";

// Initialize the local/dev facade targeting the HardKAS Dev Server
export const client = createHardkasClient({
  baseUrl: "http://localhost:7420",
  network: "simulated"
});
`);

  writeFile("src/App.tsx", `
import React, { useState, useEffect } from 'react';
import { client } from './hardkas/client';
import LocalnetStatus from './components/LocalnetStatus';
import AccountPanel from './components/AccountPanel';
import TxWorkflowDemo from './components/TxWorkflowDemo';
import ArtifactViewer from './components/ArtifactViewer';
import IgraReadOnlyPanel from './components/IgraReadOnlyPanel';

function App() {
  return (
    <div className="container">
      <div className="warning">
        <strong>Local/Dev Mode Only:</strong> This dApp template uses the dev-server and simulated local accounts. 
        It does NOT imply production browser wallet support. Kaspa L1 does not execute EVM.
      </div>
      <h1>HardKAS dApp Template</h1>
      
      <LocalnetStatus />
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <AccountPanel />
          <TxWorkflowDemo />
        </div>
        <div>
          <ArtifactViewer />
          <IgraReadOnlyPanel />
        </div>
      </div>
    </div>
  );
}

export default App;
`);

  writeFile("src/components/LocalnetStatus.tsx", `
import React, { useState, useEffect } from 'react';
import { client } from '../hardkas/client';

export default function LocalnetStatus() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    client.dev.status().then(res => setStatus(res.data)).catch(console.error);
  }, []);

  return (
    <div className="card">
      <h2>Localnet Status</h2>
      {status ? (
        <pre>{JSON.stringify(status, null, 2)}</pre>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  );
}
`);

  writeFile("src/components/AccountPanel.tsx", `
import React, { useState, useEffect } from 'react';
import { client } from '../hardkas/client';

export default function AccountPanel() {
  const [accounts, setAccounts] = useState<any[]>([]);

  useEffect(() => {
    client.accounts.list().then(res => setAccounts(res.data || [])).catch(console.error);
  }, []);

  return (
    <div className="card">
      <h2>Available Local Accounts</h2>
      <ul>
        {accounts.map(acc => (
          <li key={acc.address}>
            <strong>{acc.name || "Unknown"}</strong>: {acc.address}
          </li>
        ))}
      </ul>
    </div>
  );
}
`);

  writeFile("src/components/TxWorkflowDemo.tsx", `
import React, { useState } from 'react';
import { client } from '../hardkas/client';

export default function TxWorkflowDemo() {
  const [log, setLog] = useState<string[]>([]);
  const [step, setStep] = useState<"idle" | "transferring" | "success">("idle");

  const appendLog = (msg: string) => setLog(prev => [...prev, msg]);

  const runDemo = async () => {
    setLog([]);
    try {
      appendLog("Fetching accounts...");
      const accountsRes = await client.accounts.list();
      const accounts = accountsRes.data;
      if (!accounts || accounts.length < 2) {
        appendLog("Error: Need at least 2 accounts to run demo.");
        return;
      }
      const from = accounts[0];
      const to = accounts[1];

      setStep("transferring");
      appendLog(\`Executing workflow from \${from.name} to \${to.name} (10 KAS)...\`);

      // Workflow Facade handles plan -> sign -> send automatically
      const res = await client.workflow.transfer({
        from: from.address,
        to: to.address,
        amountSompi: "10",
        allowDevAutoSign: true
      });

      if (!res.ok || !res.data) {
        throw new Error(res.error?.message || "Transfer failed");
      }

      const trace = res.data;
      appendLog(\`Success! Receipt generated for tx \${trace.receipt?.txId || trace.signed?.txId}\`);
      setStep("success");
    } catch (e: any) {
      appendLog(\`Error: \${e.message}\`);
      setStep("idle");
    }
  };

  return (
    <div className="card">
      <h2>Transaction Workflow</h2>
      <button 
        onClick={runDemo}
        disabled={step === 'transferring' || step === 'success'}
      >
        {step === 'transferring' ? 'Processing Workflow...' : step === 'success' ? 'Sent!' : 'Run Local Transfer Demo'}
      </button>
      {log.length > 0 && (
        <pre style={{ marginTop: '10px' }}>{log.join('\\n')}</pre>
      )}
    </div>
  );
}
`);

  writeFile("src/components/ArtifactViewer.tsx", `
import React, { useState, useEffect } from 'react';
import { client } from '../hardkas/client';

export default function ArtifactViewer() {
  const [artifactId, setArtifactId] = useState("");
  const [explanation, setExplanation] = useState<any>(null);

  // Observational telemetry stream via HardKAS Dev Server
  useEffect(() => {
    let unsubscribe: () => void;
    if (client) {
      unsubscribe = client.artifacts.watch((event: any) => {
        console.log("Telemetry Event:", event);
      });
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [client]);

  const explain = async () => {
    try {
      const res = await client.artifacts.explain(artifactId);
      setExplanation(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="card">
      <h2>Artifact Explorer</h2>
      <p>Artifacts are the canonical source of truth. Dev-server/SQLite are just projections.</p>
      <input 
        type="text" 
        value={artifactId} 
        onChange={e => setArtifactId(e.target.value)} 
        placeholder="Enter Artifact ID"
        style={{ padding: '8px', marginRight: '10px', width: '250px' }}
      />
      <button onClick={explain}>Explain</button>
      {explanation && (
        <pre style={{ marginTop: '10px' }}>{JSON.stringify(explanation, null, 2)}</pre>
      )}
    </div>
  );
}
`);

  writeFile("src/components/IgraReadOnlyPanel.tsx", `
import React from 'react';

export default function IgraReadOnlyPanel() {
  return (
    <div className="card">
      <h2>Igra L2 (Experimental)</h2>
      <p>
        Igra L2 support is currently experimental and read-only. 
        There is no trustless exit claim unless ZK exit is verified.
        Do not use for production assets.
      </p>
    </div>
  );
}
`);

  writeFile(".env.example", `
# Example environment variables
VITE_HARDKAS_NETWORK=simulated
`);

  writeFile("hardkas.config.ts", `
import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  defaultNetwork: "simulated",
  networks: {
    simulated: {
      kind: "simulated",
      description: "Local development simulation"
    }
  },
  accounts: {
    alice: {
      kind: "simulated",
      address: "kaspa:sim_alice"
    },
    bob: {
      kind: "simulated",
      address: "kaspa:sim_bob"
    }
  }
});
`);

  writeFile("README.md", `
# ${projectName}

Bootstrapped with \`hardkas dev create\`.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   pnpm install
   \`\`\`

2. Start the HardKAS local dev environment:
   \`\`\`bash
   hardkas dev
   \`\`\`

3. In a separate terminal, start the React frontend:
   \`\`\`bash
   pnpm dev
   \`\`\`

## Important Notes
- **Local/Dev Only:** This template uses a dev-server facade. It does not imply production browser wallet support.
- **L1 Boundary:** Kaspa L1 does not execute EVM.
- **Source of Truth:** Artifacts on disk are the canonical source of truth. The dev-server and SQLite DB are projections.
- **Igra L2:** Any L2 interaction is experimental/read-only. Trustless exit must not be assumed without ZK verifiers.
`);

}
