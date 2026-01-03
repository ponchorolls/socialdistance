import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';

const socket = io(); // Connects to the same host by default

interface Player {
  name: string;
  distance: string;
}

interface LeaderboardData {
  globalTotalKm: string;
  players: Player[];
}

export default function App() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [view, setView] = useState<'list' | 'graph'>('list');
  // useEffect(() => {
  //   // 1. Initial Load via API
  //   fetch('/api/leaderboard').then(res => res.json()).then(setData);

  //   // 2. Real-time Listen
  //   socket.on('leaderboardUpdate', (newData) => {
  //     console.log("Live update received!");
  //     setData(newData);
  //   });

  //   return () => { socket.off('leaderboardUpdate'); };
  // }, []);
  //
  useEffect(() => {
    // 1. Initial Load with explicit error catching
    const loadInitialData = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        if (!res.ok) throw new Error('Server not responding');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Fetch error:", err);
        // Fallback: If fetch fails, we wait for the first WebSocket pulse
      }
    };

    loadInitialData();

    // 2. Real-time Listen
    socket.on('leaderboardUpdate', (newData: LeaderboardData) => {
      console.log("Live update received via WebSocket!");
      setData(newData);
    });

    // 3. Cleanup
    return () => {
      socket.off('leaderboardUpdate');
    };
  }, []);

  if (!data) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-screen-2xl mx-auto space-y-8">
        
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

        <div className="flex justify-end mb-4">
          <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
            <button 
              onClick={() => setView('list')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'list' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              RANKING
            </button>
            <button 
              onClick={() => setView('graph')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'graph' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              DISTRIBUTION
            </button>
          </div>
        </div>

        {/* Top Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 p-6 rounded-3xl flex flex-col justify-center">
            <span className="text-zinc-500 text-sm font-medium">Global Progress</span>
            <div className="text-7xl md:text-8xl font-black text-emerald-400 mt-2 tracking-tighter">
              <span className="transition-all duration-700 ease-out inline-block">
                {data.globalTotalKm}
              </span>
              <span className="text-2xl ml-2 text-zinc-600">KM</span>
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl">
            <span className="text-zinc-500 text-sm font-medium">Active Members</span>
            <div className="text-6xl font-black mt-2">{data.players.length}</div>
          </div>
        </div>

        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {view === 'list' ? (
            /* YOUR EXISTING LEADERBOARD LIST */
            <div className="grid gap-4">
               {data.players.map((player, i) => (
                 <div key={player.name} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex justify-between items-center">
                   <div className="flex items-center gap-4">
                     <span className="text-zinc-700 font-mono text-xs">{String(i + 1).padStart(2, '0')}</span>
                     <span className="font-bold uppercase tracking-tight">{player.name}</span>
                   </div>
                   <span className="font-mono text-emerald-400">{player.distance} KM</span>
                 </div>
               ))}
            </div>
          ) : (
            /* THE VERTICAL BAR GRAPH */
            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2rem] h-80 flex items-end gap-1">
              {data.players.map((player) => {
                const leaderDistance = parseFloat(data.players[0].distance);
                const height = leaderDistance > 0 ? (parseFloat(player.distance) / leaderDistance) * 100 : 0;
      
                return (
                  <div 
                    key={player.name} 
                    title={`${player.name}: ${player.distance}km`}
                    className="flex-1 bg-emerald-500/20 border-t-2 border-emerald-400/50 rounded-t-sm hover:bg-emerald-400 transition-all duration-500"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
