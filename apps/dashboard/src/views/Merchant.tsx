import { Store, Terminal, Activity } from "lucide-react";

export function Merchant() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Store className="text-emerald-400" />
          Merchant Dashboard
        </h1>
        <p className="text-zinc-400">
          Point of Sale and Merchant management module.
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center text-zinc-500 py-12">
        <Terminal className="mx-auto h-12 w-12 text-zinc-700 mb-4" />
        <p>Merchant module is pending integration from reference applications.</p>
      </div>
    </div>
  );
}
