import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Activity, GitMerge, FileCheck, ShieldAlert, ShieldCheck, Cpu, Layers } from 'lucide-react'
import { DashboardHealth } from './components/DashboardHealth'
import { TruthStatus } from './views/TruthStatus'
import { LineageGraph } from './views/LineageGraph'
import { SemanticDrift } from './views/SemanticDrift'
import { Quarantine } from './views/Quarantine'
import { ReplayVerification } from './views/ReplayVerification'
import { Telemetry } from './views/Telemetry'
import { Bundles } from './views/Bundles'

// Layout wrapper
function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  
  const navItems = [
    { path: '/', label: 'Truth Status', icon: FileCheck },
    { path: '/lineage', label: 'Lineage Graph', icon: GitMerge },
    { path: '/drift', label: 'Semantic Drift', icon: Activity },
    { path: '/replay', label: 'Replay Verification', icon: ShieldCheck },
    { path: '/quarantine', label: 'Quarantine', icon: ShieldAlert },
    { path: '/telemetry', label: 'Telemetry', icon: Cpu },
    { path: '/bundles', label: 'Semantic Bundles', icon: Layers },
  ]

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Health Strip */}
      <DashboardHealth />
      
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
          <div className="p-6 border-b border-zinc-800">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="text-emerald-400">HardKAS</span>
              <span className="text-zinc-500 font-normal text-sm">Observability</span>
            </h1>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium ${
                    active 
                      ? 'bg-emerald-500/10 text-emerald-400' 
                      : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        
        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col relative">
          <header className="h-14 border-b border-zinc-800 flex items-center px-8 shrink-0 bg-zinc-900/50">
            <h2 className="text-lg font-medium text-white">
              {navItems.find(i => i.path === location.pathname)?.label || 'Dashboard'}
            </h2>
          </header>
          <div className="flex-1 overflow-auto p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<TruthStatus />} />
          <Route path="/lineage" element={<LineageGraph />} />
          <Route path="/drift" element={<SemanticDrift />} />
          <Route path="/replay" element={<ReplayVerification />} />
          <Route path="/quarantine" element={<Quarantine />} />
          <Route path="/telemetry" element={<Telemetry />} />
          <Route path="/bundles" element={<Bundles />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
