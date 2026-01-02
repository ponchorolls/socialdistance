import { useEffect, useState } from 'react';

interface Player {
  name: string;
  distance: string;
}

export default function App() {
  const [data, setData] = useState<{ globalTotalKm: string; players: Player[] } | null>(null);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(setData);
  }, []);

  if (!data) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header Section */}
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold tracking-tighter italic">SOCIAL DISTANCE</h1>
            <p className="text-zinc-500 uppercase text-xs tracking-widest">Collective Movement Engine</p>
          </div>
          <a href="/login" className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-2 rounded-full font-bold text-sm transition-colors">
            CONNECT STRAVA
          </a>
        </header>

        {/* Top Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col justify-center">
            <span className="text-zinc-500 text-sm font-medium">Global Progress</span>
            <div className="text-6xl font-black text-emerald-400 mt-2">{data.globalTotalKm}<span className="text-2xl ml-2 text-zinc-600">KM</span></div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
            <span className="text-zinc-500 text-sm font-medium">Active Members</span>
            <div className="text-6xl font-black mt-2">{data.players.length}</div>
          </div>
        </div>

        {/* Leaderboard Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
            <h2 className="font-bold uppercase tracking-widest text-zinc-400 text-xs">Top Movers</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {data.players.map((player, i) => (
              <div key={player.name} className="flex justify-between items-center px-6 py-4 hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="text-zinc-600 font-mono w-4">0{i + 1}</span>
                  <span className="font-medium text-zinc-200">{player.name}</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold">{player.distance} KM</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
