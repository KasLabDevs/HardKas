import fs from 'fs';
import path from 'path';

const SUITE_DIR = path.resolve(process.cwd(), 'examples/showcase-suite');

const APPS = [
    'mission-control',
    'wallet-pro',
    'merchant-terminal',
    'treasury-console',
    'explorer-live',
    'time-travel-lab',
    'silver-playground',
    'cli-studio'
];

const PACKAGES = [
    'shared-backend',
    'shared-ui',
    'shared-testkit'
];

function mkdirp(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

mkdirp(SUITE_DIR);

// Workspace
fs.writeFileSync(path.join(SUITE_DIR, 'pnpm-workspace.yaml'), `packages:\n  - 'apps/*'\n  - 'packages/*'\n`);
fs.writeFileSync(path.join(SUITE_DIR, 'package.json'), JSON.stringify({
    name: "showcase-suite",
    version: "1.0.0",
    private: true,
    scripts: {
        "dev": "pnpm -r run dev",
        "build": "pnpm -r run build",
        "test": "vitest run",
        "coverage": "vitest run --coverage"
    },
    devDependencies: {
        "vitest": "^2.1.8",
        "@vitest/coverage-v8": "^2.1.8"
    }
}, null, 2));

// TSConfig Base
fs.writeFileSync(path.join(SUITE_DIR, 'tsconfig.base.json'), JSON.stringify({
    compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
    }
}, null, 2));

// Packages
PACKAGES.forEach(pkg => {
    const pkgDir = path.join(SUITE_DIR, 'packages', pkg);
    mkdirp(path.join(pkgDir, 'src'));
    
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: `@showcase/${pkg}`,
        version: "1.0.0",
        type: "module",
        main: "src/index.ts",
        dependencies: {}
    }, null, 2));

    fs.writeFileSync(path.join(pkgDir, 'tsconfig.json'), JSON.stringify({
        extends: "../../tsconfig.base.json",
        include: ["src/**/*"]
    }, null, 2));

    fs.writeFileSync(path.join(pkgDir, 'src/index.ts'), `export const name = '${pkg}';\n`);
});

// Apps
APPS.forEach((app, idx) => {
    const appDir = path.join(SUITE_DIR, 'apps', app);
    mkdirp(path.join(appDir, 'src/frontend'));
    mkdirp(path.join(appDir, 'src/backend'));
    
    const portOffset = 4000 + (idx * 10); // frontend 400x, backend 400x+1

    fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
        name: `@showcase/${app}`,
        version: "1.0.0",
        type: "module",
        scripts: {
            "dev": "concurrently \"pnpm run dev:frontend\" \"pnpm run dev:backend\"",
            "dev:frontend": `vite --port ${portOffset}`,
            "dev:backend": `tsx watch src/backend/server.ts`,
            "build": "tsc && vite build"
        },
        dependencies: {
            "react": "^18.3.1",
            "react-dom": "^18.3.1",
            "@showcase/shared-ui": "workspace:*",
            "@showcase/shared-backend": "workspace:*"
        },
        devDependencies: {
            "vite": "^5.4.11",
            "@vitejs/plugin-react": "^4.3.4",
            "tailwindcss": "^3.4.15",
            "autoprefixer": "^10.4.20",
            "postcss": "^8.4.49",
            "concurrently": "^9.1.0",
            "tsx": "^4.19.2",
            "typescript": "^5.7.2"
        }
    }, null, 2));

    fs.writeFileSync(path.join(appDir, 'tsconfig.json'), JSON.stringify({
        extends: "../../tsconfig.base.json",
        compilerOptions: {
            jsx: "react-jsx"
        },
        include: ["src/**/*"]
    }, null, 2));

    fs.writeFileSync(path.join(appDir, 'vite.config.ts'), `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:${portOffset + 1}'
    }
  }
});
`);

    fs.writeFileSync(path.join(appDir, 'tailwind.config.js'), `
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
`);

    fs.writeFileSync(path.join(appDir, 'postcss.config.js'), `
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`);

    fs.writeFileSync(path.join(appDir, 'index.html'), `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HardKAS Showcase | ${app}</title>
  </head>
  <body class="bg-gray-900 text-white font-sans">
    <div id="root"></div>
    <script type="module" src="/src/frontend/main.tsx"></script>
  </body>
</html>
`);

    fs.writeFileSync(path.join(appDir, 'src/frontend/main.tsx'), `
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`);

    fs.writeFileSync(path.join(appDir, 'src/frontend/index.css'), `
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
`);

    fs.writeFileSync(path.join(appDir, 'src/frontend/App.tsx'), `
import React, { useEffect, useState } from 'react';

export function App() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
      <div className="text-center space-y-4 p-8 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          ${app}
        </h1>
        <p className="text-gray-400">HardKAS Showcase Suite</p>
        <div className="mt-4 p-4 bg-black/50 rounded-lg text-left overflow-auto text-xs font-mono text-emerald-300 border border-emerald-900/50">
          {data ? JSON.stringify(data, null, 2) : 'Loading backend...'}
        </div>
      </div>
    </div>
  );
}
`);

    fs.writeFileSync(path.join(appDir, 'src/backend/server.ts'), `
import http from 'http';

const PORT = ${portOffset + 1};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', app: '${app}', timestamp: new Date().toISOString() }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log('${app} Backend running on http://localhost:' + PORT);
});
`);
});

console.log('Successfully bootstrapped HardKAS Full Ecosystem Showcase Suite!');
