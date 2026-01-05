import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

// const socket = io();
const socket = io('http://localhost:3001');

interface Player {
  stravaId: string;
  name: string;
  distance: string;
}

interface LeaderboardData {
  globalTotalKm: string;
  players: Player[];
}

function Odometer({ value }: { value: string }) {
  return (
    <div className="flex overflow-hidden">
      {value.split('').map((char, index) => (
        <div key={index} className="relative w-[0.6em] h-[1em] flex justify-center">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={char + index}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ 
                type: "spring", 
                stiffness: 400, 
                damping: 40,
                mass: 0.8
              }}
              className="absolute italic"
            >
              {char}
            </motion.span>
          </AnimatePresence>
          {/* Invisible spacer to maintain layout width */}
          <span className="invisible italic">{char}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [unit, setUnit] = useState<'km' | 'miles'>('km'); // New State
  const [isPulsing, setIsPulsing] = useState(false);
  const myStravaId = "999";

  // Helper for unit conversion
  const displayVal = (kmStr: string) => {
    const val = parseFloat(kmStr);
    return unit === 'miles' ? (val * 0.621371).toFixed(2) : val.toFixed(2);
  };
// export default function App() {
//   const [data, setData] = useState<LeaderboardData | null>(null);
//   const [view, setView] = useState<'list' | 'graph'>('list');
  
//   // This ID would eventually come from your auth state/session
//   const myStravaId = "999"; 

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const res = await fetch('/api/leaderboard');
        if (!res.ok) throw new Error('Server not responding');
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Fetch error:", err);
      }
    };

    loadInitialData();

    socket.on('leaderboardUpdate', (newData) => {
      setData(newData);
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 500); // Flash for 500ms
    });
    
    return () => {
      socket.off('leaderboardUpdate');
    };
  }, []);

if (!data) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-mono">Initialising...</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans tabular-nums">
      <div className="max-w-screen-2xl mx-auto space-y-8">
        
        <header className="flex justify-between items-end border-b border-zinc-900 pb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-tighter italic uppercase">Social Distance</h1>
            <p className="text-zinc-500 uppercase text-xs tracking-widest text-emerald-500/80 font-bold">Collective Movement Engine</p>
          </div>
          <a href="/login" className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-2 rounded-full font-bold text-sm transition-all">
            CONNECT STRAVA
          </a>
        </header>

        {/* Hero Row: Global Progress & Toggles */}
        <div className="text-7xl md:text-9xl font-black text-emerald-400 tracking-tighter leading-none flex items-baseline">
  
          {/* The Odometer Wrapper */}
          <div className="flex items-center">
            <Odometer value={displayVal(data.globalTotalKm)} />
          </div>

          <span className="text-2xl md:text-3xl ml-2 text-zinc-800 font-mono uppercase italic select-none">
            {unit}
          </span>
        </div>
        {/* Right: Controls aligned to bottom */}
        <div className="flex flex-wrap items-center gap-3 md:mb-2">
          {/* Active Members Badge */}
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${isPulsing ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-zinc-700'}`} />
          <div className="bg-zinc-900/50 px-4 py-2 rounded-xl border border-zinc-800/50 flex items-center gap-3 mr-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active</span>
            <span className="text-xl font-black text-zinc-200 leading-none">{data.players.length}</span>
          </div>

          {/* Unit Toggle */}
          <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
            <button 
              onClick={() => setUnit('km')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${unit === 'km' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              KM
            </button>
            <button 
              onClick={() => setUnit('miles')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${unit === 'miles' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              MILES
            </button>
          </div>

          {/* View Toggle */}
          <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
            <button onClick={() => setView('list')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'list' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500'}`}>
              RANKING
            </button>
            <button onClick={() => setView('graph')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'graph' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500'}`}>
              DISTRIBUTION
            </button>
          </div>
        </div>
      </div>
        <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="min-h-[400px]">
          {view === 'list' ? (
            <div className="grid gap-2">
              {data.players.map((player, index) => {
                const isMe = String(player.stravaId) === String(myStravaId);
                return (
                  <div key={player.stravaId} className={`flex items-center justify-between p-4 rounded-xl transition-all ${isMe ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-900/40 border border-zinc-800/50'}`}>
                    <div className="flex items-center gap-4">
                      <span className={`font-mono text-[10px] w-6 ${isMe ? 'text-emerald-400' : 'text-zinc-600'}`}>{String(index + 1).padStart(2, '0')}</span>
                      <span className={`font-bold uppercase tracking-tight ${isMe ? 'text-white' : 'text-zinc-400'}`}>{player.name} {isMe && "(YOU)"}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={`font-mono font-bold text-lg ${isMe ? 'text-emerald-400' : 'text-zinc-200'}`}>{displayVal(player.distance)}</span>
                      <span className="text-[10px] text-zinc-600 font-mono uppercase">{unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-zinc-900/30 border border-zinc-900 rounded-3xl p-12">
              <div className="flex items-end h-80 gap-1.5 w-full relative overflow-visible">
                {data.players.map((player) => {
                  const isMe = String(player.stravaId) === String(myStravaId);
                  const leaderDistance = parseFloat(data.players[0].distance);
                  const heightPercentage = leaderDistance > 0 ? (parseFloat(player.distance) / leaderDistance) * 100 : 0;

                  return (
                    <div key={player.stravaId} className="flex-1 group relative flex flex-col justify-end h-full px-0.5" style={{ isolation: 'isolate' }}>
                      {/* BUBBLE - Conversion Applied Here Too */}
                      <div className="absolute left-1/2 -translate-x-1/2 mb-3 hidden group-hover:flex flex-col items-center z-50 pointer-events-none" style={{ bottom: `${heightPercentage}%` }}>
                        <div className="bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg shadow-2xl flex flex-col items-center min-w-[110px]">
                          <span className="text-[10px] font-black text-white uppercase">{player.name}</span>
                          <span className="text-xs font-mono text-emerald-400 font-bold">{displayVal(player.distance)} {unit}</span>
                          <div className="w-2 h-2 bg-zinc-800 border-r border-b border-zinc-700 rotate-45 -mb-3 mt-1.5"></div>
                        </div>
                      </div>
                      <div className={`w-full rounded-t-sm transition-all duration-700 ${isMe ? 'bg-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.5)] z-10' : 'bg-zinc-800 group-hover:bg-zinc-700'}`} style={{ height: `${Math.max(heightPercentage, 2)}%` }} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>
  );
}
//   if (!data) return (
//     <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-mono uppercase tracking-widest">
//       Initialising Engine...
//     </div>
//   );

//   return (
//     <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans selection:bg-emerald-500 selection:text-black">
//       <div className="max-w-screen-2xl mx-auto space-y-8">
        
//         {/* Header Section */}
//         <header className="flex justify-between items-end border-b border-zinc-900 pb-8">
//           <div>
//             <h1 className="text-4xl font-bold tracking-tighter italic">SOCIAL DISTANCE</h1>
//             <p className="text-zinc-500 uppercase text-xs tracking-widest">Collective Movement Engine</p>
//           </div>
//           <a href="/login" className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-2 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95">
//             CONNECT STRAVA
//           </a>
//         </header>

//         {/* View Switcher */}
//         <div className="flex justify-end">
//           <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
//             <button 
//               onClick={() => setView('list')}
//               className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'list' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
//             >
//               RANKING
//             </button>
//             <button 
//               onClick={() => setView('graph')}
//               className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'graph' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
//             >
//               DISTRIBUTION
//             </button>
//           </div>
//         </div>

//         {/* Top Stats Grid */}
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//           <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col justify-center">
//             <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Global Progress</span>
//             <div className="text-7xl md:text-8xl font-black text-emerald-400 mt-2 tracking-tighter leading-none">
//               {data.globalTotalKm}
//               <span className="text-2xl ml-4 text-zinc-700 font-mono">KM</span>
//             </div>
//           </div>
//           <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col justify-center">
//             <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Active Members</span>
//             <div className="text-7xl font-black mt-2 leading-none text-zinc-200 tracking-tighter">{data.players.length}</div>
//           </div>
//         </div>

//         {/* Main Data View */}
//         <motion.div
//           key={view}
//           initial={{ opacity: 0, y: 10 }}
//           animate={{ opacity: 1, y: 0 }}
//           transition={{ duration: 0.2 }}
//           className="min-h-[400px]"
//         >
//           {view === 'list' ? (
//             <div className="grid gap-2">
//               {data.players.map((player, index) => {
//                 const isMe = String(player.stravaId) === String(myStravaId);

//                 return (
//                   <div 
//                     key={player.stravaId} 
//                     className={`flex items-center justify-between p-4 rounded-xl transition-all duration-300 ${
//                       isMe 
//                         ? 'bg-emerald-500/10 border border-emerald-500/30' 
//                         : 'bg-zinc-900/40 border border-zinc-800/50 hover:border-zinc-700'
//                     }`}
//                   >
//                     <div className="flex items-center gap-4">
//                       <span className={`font-mono text-[10px] w-6 ${isMe ? 'text-emerald-400' : 'text-zinc-600'}`}>
//                         {String(index + 1).padStart(2, '0')}
//                       </span>
//                       <span className={`font-bold uppercase tracking-tight ${isMe ? 'text-white' : 'text-zinc-400'}`}>
//                         {player.name} {isMe && <span className="ml-2 text-[10px] text-emerald-500 opacity-70">(YOU)</span>}
//                       </span>
//                     </div>
//                     <div className="flex items-baseline gap-1">
//                       <span className={`font-mono font-bold text-lg ${isMe ? 'text-emerald-400' : 'text-zinc-200'}`}>
//                         {player.distance}
//                       </span>
//                       <span className="text-[10px] text-zinc-600 font-mono uppercase">km</span>
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           ) : (
//             /* THE DISTRIBUTION GRAPH */
//             <div className="bg-zinc-900/30 border border-zinc-900 rounded-3xl p-12">
//               <div className="flex items-end h-80 gap-1.5 w-full relative overflow-visible">
//                 {data.players.map((player) => {
//                   const isMe = String(player.stravaId) === String(myStravaId);
//                   const leaderDistance = parseFloat(data.players[0].distance);
//                   const heightPercentage = leaderDistance > 0 ? (parseFloat(player.distance) / leaderDistance) * 100 : 0;

//                   return (
//                     <div 
//                       key={player.stravaId} 
//                       className="flex-1 group relative flex flex-col justify-end h-full px-0.5"
//                       style={{ isolation: 'isolate' }}
//                     >
//                       {/* HOVER BUBBLE */}
//                       <div 
//                         className="absolute left-1/2 -translate-x-1/2 mb-3 hidden group-hover:flex flex-col items-center z-50 pointer-events-none"
//                         style={{ bottom: `${heightPercentage}%` }}
//                       >
//                         <div className="bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg shadow-2xl flex flex-col items-center min-w-[110px] animate-in fade-in zoom-in duration-150">
//                           <span className="text-[10px] font-black text-white uppercase truncate max-w-[140px] tracking-widest">
//                             {player.name}
//                           </span>
//                           <span className="text-xs font-mono text-emerald-400 font-bold">
//                             {player.distance} <span className="text-[9px] text-emerald-600">KM</span>
//                           </span>
//                           {/* Triangle Tip */}
//                           <div className="w-2 h-2 bg-zinc-800 border-r border-b border-zinc-700 rotate-45 -mb-3 mt-1.5"></div>
//                         </div>
//                       </div>

//                       {/* THE BAR */}
//                       <div 
//                         className={`w-full rounded-t-sm transition-all duration-700 ease-out ${
//                           isMe 
//                             ? 'bg-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.5)] z-10' 
//                             : 'bg-zinc-800 group-hover:bg-zinc-700'
//                         }`}
//                         style={{ height: `${Math.max(heightPercentage, 2)}%` }}
//                       />
//                     </div>
//                   );
//                 })}
//               </div>
//               <div className="mt-6 flex justify-between text-[10px] font-mono text-zinc-600 uppercase tracking-widest border-t border-zinc-800/50 pt-4">
//                 <span>Top Performer</span>
//                 <span>Active Field Distribution</span>
//                 <span>Tail</span>
//               </div>
//             </div>
//           )}
//         </motion.div>
//       </div>
//     </div>
//   );
// }
