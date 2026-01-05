import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

// 1. Define socket OUTSIDE to prevent re-connection loops
const socket = io();

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
          <span className="invisible italic">{char}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  // 2. Properly type the initial state
  const [data, setData] = useState<LeaderboardData>({ 
    globalTotalKm: "0.00", 
    players: [] 
  });
  
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [unit, setUnit] = useState<'km' | 'miles'>('km');
  const [isPulsing, setIsPulsing] = useState(false);
  const myStravaId = "999";

  const displayVal = (kmStr: string) => {
    const val = parseFloat(kmStr) || 0;
    return unit === 'miles' ? (val * 0.621371).toFixed(2) : val.toFixed(2);
  };

  useEffect(() => {
    // 3. COMBINED EFFECT: Fetch + Listen
    console.log("🔌 Connecting to Engine...");

    // Initial Fetch
    fetch('http://localhost:3001/api/leaderboard')
      .then(res => res.json())
      .then(initialData => {
        if (initialData) setData(initialData);
      })
      .catch(err => console.error("Fetch error:", err));

    // Real-time listener
    const handleUpdate = (newData: LeaderboardData) => {
      console.log("⚡ REAL-TIME UPDATE RECEIVED:", newData);
      setData(newData);
      setIsPulsing(true);
      setTimeout(() => setIsPulsing(false), 500);
    };

    socket.on('connect', () => console.log("🟢 Connected! ID:", socket.id));
    socket.on('connect_error', (err) => console.error("❌ Socket Error:", err.message));
    socket.on('leaderboardUpdate', handleUpdate);

    // 4. CLEANUP: Vital to prevent multiple listeners
    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('leaderboardUpdate');
    };
  }, []);

  // Removed the 'if (!data)' check because we initialized with valid object structure

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

        {/* Hero Row */}
        <div className="text-7xl md:text-9xl font-black text-emerald-400 tracking-tighter leading-none flex items-baseline">
          <div className="flex items-center">
            <Odometer value={displayVal(data.globalTotalKm)} />
          </div>
          <span className="text-2xl md:text-3xl ml-2 text-zinc-800 font-mono uppercase italic select-none">
            {unit}
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 md:mb-2">
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${isPulsing ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-zinc-700'}`} />
          <div className="bg-zinc-900/50 px-4 py-2 rounded-xl border border-zinc-800/50 flex items-center gap-3 mr-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active</span>
            <span className="text-xl font-black text-zinc-200 leading-none">{data.players.length}</span>
          </div>

          {/* Unit Toggle */}
          <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
            <button onClick={() => setUnit('km')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${unit === 'km' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>KM</button>
            <button onClick={() => setUnit('miles')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${unit === 'miles' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}>MILES</button>
          </div>

          {/* View Toggle */}
          <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
            <button onClick={() => setView('list')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'list' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500'}`}>RANKING</button>
            <button onClick={() => setView('graph')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'graph' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500'}`}>DISTRIBUTION</button>
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
              <div className="flex items-end h-80 gap-1.5 w-full relative">
                {data.players.map((player) => {
                  const isMe = String(player.stravaId) === String(myStravaId);
                  const leaderDistance = data.players[0] ? parseFloat(data.players[0].distance) : 0;
                  const heightPercentage = leaderDistance > 0 ? (parseFloat(player.distance) / leaderDistance) * 100 : 0;

                  return (
                    <div key={player.stravaId} className="flex-1 group relative flex flex-col justify-end h-full px-0.5">
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
    </div>
  );
}
// import { useEffect, useState } from 'react';
// import { io } from 'socket.io-client';
// import { motion, AnimatePresence } from 'framer-motion';

// // const socket = io();
// const socket = io('http://localhost:3001');

// interface Player {
//   stravaId: string;
//   name: string;
//   distance: string;
// }

// interface LeaderboardData {
//   globalTotalKm: string;
//   players: Player[];
// }

// function Odometer({ value }: { value: string }) {
//   return (
//     <div className="flex overflow-hidden">
//       {value.split('').map((char, index) => (
//         <div key={index} className="relative w-[0.6em] h-[1em] flex justify-center">
//           <AnimatePresence mode="popLayout">
//             <motion.span
//               key={char + index}
//               initial={{ y: "100%" }}
//               animate={{ y: 0 }}
//               exit={{ y: "-100%" }}
//               transition={{ 
//                 type: "spring", 
//                 stiffness: 400, 
//                 damping: 40,
//                 mass: 0.8
//               }}
//               className="absolute italic"
//             >
//               {char}
//             </motion.span>
//           </AnimatePresence>
//           {/* Invisible spacer to maintain layout width */}
//           <span className="invisible italic">{char}</span>
//         </div>
//       ))}
//     </div>
//   );
// }

// export default function App() {
//   // const [data, setData] = useState<LeaderboardData | null>(null);
//   const [data, setData] = useState({ globalTotalKm: "0.00", players: [] });
//   const [view, setView] = useState<'list' | 'graph'>('list');
//   const [unit, setUnit] = useState<'km' | 'miles'>('km'); // New State
//   const [isPulsing, setIsPulsing] = useState(false);
//   const myStravaId = "999";

//   // Helper for unit conversion
//   const displayVal = (kmStr: string) => {
//     const val = parseFloat(kmStr);
//     return unit === 'miles' ? (val * 0.621371).toFixed(2) : val.toFixed(2);
//   };

//   useEffect(() => {
//     // 1. Get initial data via HTTP
//     fetch('http://localhost:3001/api/leaderboard')
//       .then(res => res.json())
//       .then(initialData => setData(initialData));

//     // 2. Setup Socket listeners
//     socket.on('connect', () => console.log("✅ Connected to Server!"));
//     socket.on('connect_error', (err) => console.error("❌ Socket Error:", err));
    
//     socket.on('leaderboardUpdate', (newData) => {
//       console.log("⚡ Real-time update:", newData);
//       setData(newData);
//     });

//     return () => {
//       socket.off('connect');
//       socket.off('leaderboardUpdate');
//     };
//   }, []);

//     useEffect(() => {
//     console.log("🔌 Initializing Socket Listeners...");

//     const handleUpdate = (newData: any) => {
//       console.log("⚡ REAL-TIME UPDATE RECEIVED:", newData);
//       setData(newData);
//       setIsPulsing(true);
//       setTimeout(() => setIsPulsing(false), 500);
//     };

//     socket.on('connect', () => console.log("🟢 Connected! ID:", socket.id));
//     socket.on('connect_error', (err) => console.error("❌ Connection Error:", err.message));
//     socket.on('leaderboardUpdate', handleUpdate);

//     // CLEANUP: This is vital to prevent memory leaks
//     return () => {
//       socket.off('connect');
//       socket.off('connect_error');
//       socket.off('leaderboardUpdate');
//     };
//   }, []); // Empty array is correct here

// if (!data) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-mono">Initialising...</div>;

//   return (
//     <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-8 font-sans tabular-nums">
//       <div className="max-w-screen-2xl mx-auto space-y-8">
        
//         <header className="flex justify-between items-end border-b border-zinc-900 pb-8">
//           <div>
//             <h1 className="text-4xl font-bold tracking-tighter italic uppercase">Social Distance</h1>
//             <p className="text-zinc-500 uppercase text-xs tracking-widest text-emerald-500/80 font-bold">Collective Movement Engine</p>
//           </div>
//           <a href="/login" className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-6 py-2 rounded-full font-bold text-sm transition-all">
//             CONNECT STRAVA
//           </a>
//         </header>

//         {/* Hero Row: Global Progress & Toggles */}
//         <div className="text-7xl md:text-9xl font-black text-emerald-400 tracking-tighter leading-none flex items-baseline">
  
//           {/* The Odometer Wrapper */}
//           <div className="flex items-center">
//             <Odometer value={displayVal(data.globalTotalKm)} />
//           </div>

//           <span className="text-2xl md:text-3xl ml-2 text-zinc-800 font-mono uppercase italic select-none">
//             {unit}
//           </span>
//         </div>
//         {/* Right: Controls aligned to bottom */}
//         <div className="flex flex-wrap items-center gap-3 md:mb-2">
//           {/* Active Members Badge */}
//           <div className={`w-2 h-2 rounded-full transition-all duration-300 ${isPulsing ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-zinc-700'}`} />
//           <div className="bg-zinc-900/50 px-4 py-2 rounded-xl border border-zinc-800/50 flex items-center gap-3 mr-2">
//             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active</span>
//             <span className="text-xl font-black text-zinc-200 leading-none">{data.players.length}</span>
//           </div>

//           {/* Unit Toggle */}
//           <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
//             <button 
//               onClick={() => setUnit('km')}
//               className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${unit === 'km' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
//             >
//               KM
//             </button>
//             <button 
//               onClick={() => setUnit('miles')}
//               className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${unit === 'miles' ? 'bg-emerald-500 text-black shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
//             >
//               MILES
//             </button>
//           </div>

//           {/* View Toggle */}
//           <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-1">
//             <button onClick={() => setView('list')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'list' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500'}`}>
//               RANKING
//             </button>
//             <button onClick={() => setView('graph')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${view === 'graph' ? 'bg-zinc-800 text-emerald-400 shadow-lg' : 'text-zinc-500'}`}>
//               DISTRIBUTION
//             </button>
//           </div>
//         </div>
//       </div>
//         <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="min-h-[400px]">
//           {view === 'list' ? (
//             <div className="grid gap-2">
//               {data.players.map((player, index) => {
//                 const isMe = String(player.stravaId) === String(myStravaId);
//                 return (
//                   <div key={player.stravaId} className={`flex items-center justify-between p-4 rounded-xl transition-all ${isMe ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-900/40 border border-zinc-800/50'}`}>
//                     <div className="flex items-center gap-4">
//                       <span className={`font-mono text-[10px] w-6 ${isMe ? 'text-emerald-400' : 'text-zinc-600'}`}>{String(index + 1).padStart(2, '0')}</span>
//                       <span className={`font-bold uppercase tracking-tight ${isMe ? 'text-white' : 'text-zinc-400'}`}>{player.name} {isMe && "(YOU)"}</span>
//                     </div>
//                     <div className="flex items-baseline gap-1">
//                       <span className={`font-mono font-bold text-lg ${isMe ? 'text-emerald-400' : 'text-zinc-200'}`}>{displayVal(player.distance)}</span>
//                       <span className="text-[10px] text-zinc-600 font-mono uppercase">{unit}</span>
//                     </div>
//                   </div>
//                 );
//               })}
//             </div>
//           ) : (
//             <div className="bg-zinc-900/30 border border-zinc-900 rounded-3xl p-12">
//               <div className="flex items-end h-80 gap-1.5 w-full relative overflow-visible">
//                 {data.players.map((player) => {
//                   const isMe = String(player.stravaId) === String(myStravaId);
//                   const leaderDistance = parseFloat(data.players[0].distance);
//                   const heightPercentage = leaderDistance > 0 ? (parseFloat(player.distance) / leaderDistance) * 100 : 0;

//                   return (
//                     <div key={player.stravaId} className="flex-1 group relative flex flex-col justify-end h-full px-0.5" style={{ isolation: 'isolate' }}>
//                       {/* BUBBLE - Conversion Applied Here Too */}
//                       <div className="absolute left-1/2 -translate-x-1/2 mb-3 hidden group-hover:flex flex-col items-center z-50 pointer-events-none" style={{ bottom: `${heightPercentage}%` }}>
//                         <div className="bg-zinc-800 border border-zinc-700 px-3 py-2 rounded-lg shadow-2xl flex flex-col items-center min-w-[110px]">
//                           <span className="text-[10px] font-black text-white uppercase">{player.name}</span>
//                           <span className="text-xs font-mono text-emerald-400 font-bold">{displayVal(player.distance)} {unit}</span>
//                           <div className="w-2 h-2 bg-zinc-800 border-r border-b border-zinc-700 rotate-45 -mb-3 mt-1.5"></div>
//                         </div>
//                       </div>
//                       <div className={`w-full rounded-t-sm transition-all duration-700 ${isMe ? 'bg-emerald-500 shadow-[0_0_25px_rgba(16,185,129,0.5)] z-10' : 'bg-zinc-800 group-hover:bg-zinc-700'}`} style={{ height: `${Math.max(heightPercentage, 2)}%` }} />
//                     </div>
//                   );
//                 })}
//               </div>
//             </div>
//           )}
//         </motion.div>
//       </div>
//   );
// }
