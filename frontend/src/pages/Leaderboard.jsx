import React, { useEffect, useState, useContext } from 'react';
import { AppContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { Trophy, ChevronLeft, CalendarClock } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Leaderboard() {
    const [leaders, setLeaders] = useState([]);
    const { user } = useContext(AppContext);
    const navigate = useNavigate();

    useEffect(() => {
        fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/leaderboard`)
            .then(res => res.json())
            .then(data => setLeaders(data))
            .catch(console.error);
    }, []);

    if (!user) {
        navigate('/');
        return null;
    }

    return (
        <div className="min-h-screen py-10 px-4 md:px-8 max-w-4xl mx-auto flex flex-col gap-8">
            <header className="flex items-center gap-4 glass-panel p-4 px-6 z-10">
                <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft size={28} />
                </button>
                <h1 className="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 flex items-center gap-3">
                    <Trophy className="text-yellow-500" /> Global Leaderboard
                </h1>
            </header>

            <main className="glass-panel p-6 md:p-10 flex-1">
                <div className="flex flex-col gap-4">
                    {leaders.length === 0 ? (
                        <div className="text-center text-slate-500 italic py-10">No data available yet...</div>
                    ) : (
                        leaders.map((leader, index) => (
                            <motion.div
                                key={leader.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className={`flex items-center justify-between p-4 rounded-xl border ${index === 0 ? 'bg-yellow-500/10 border-yellow-500/30' :
                                        index === 1 ? 'bg-slate-300/10 border-slate-300/30' :
                                            index === 2 ? 'bg-amber-700/10 border-amber-700/30' :
                                                'bg-slate-800/50 border-slate-700/50'
                                    }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${index === 0 ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' :
                                            index === 1 ? 'bg-slate-300 text-black' :
                                                index === 2 ? 'bg-amber-700 text-white' :
                                                    'bg-slate-800 text-slate-400'
                                        }`}>
                                        {index + 1}
                                    </div>
                                    <div>
                                        <div className={`font-bold text-lg ${leader.id === user.id ? 'text-action' : 'text-slate-200'}`}>
                                            {leader.name} {leader.id === user.id && '(You)'}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xl font-mono text-neonGreen font-bold">
                                    ₹{leader.walletBalance}
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </main>
        </div>
    );
}
