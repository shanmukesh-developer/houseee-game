import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';
import { Sparkles, Play, Wallet, ShieldCheck, KeyRound, Crown, Trophy, Receipt, User } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Home() {
    const { user, setUser, socket, roomCode } = useContext(AppContext);
    const [nameInput, setNameInput] = useState(user?.name || '');
    const [joinCode, setJoinCode] = useState('');
    const navigate = useNavigate();

    // Whenever we successfully receive a roomCode, navigate to room
    useEffect(() => {
        if (roomCode) {
            navigate('/room');
        }
    }, [roomCode, navigate]);

    const handleCreateUser = (e) => {
        if (e) e.preventDefault();
        if (!nameInput.trim()) return false;
        if (!user) {
            setUser({
                id: 'user_' + Math.random().toString(36).substr(2, 9),
                name: nameInput,
                walletBalance: 20,
                role: nameInput.toLowerCase() === 'admin' ? 'admin' : 'player'
            });
        }
        return true;
    };

    const handleHostGame = () => {
        const currentUser = user || { id: 'user_' + Math.random().toString(36).substr(2, 9), name: nameInput, walletBalance: 20 };
        if (!user) setUser(currentUser);
        socket.emit('createRoom', { userId: currentUser.id, userFallback: currentUser });
    };

    const handleJoinGame = (e) => {
        e.preventDefault();
        const currentUser = user || { id: 'user_' + Math.random().toString(36).substr(2, 9), name: nameInput, walletBalance: 20 };
        if (!user) setUser(currentUser);

        if (joinCode.length === 5) {
            socket.emit('joinRoom', { userId: currentUser.id, roomCode: joinCode.toUpperCase(), userFallback: currentUser });
        } else {
            alert('Room code must be 5 characters');
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-8 md:p-12 w-full max-w-lg text-center relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Sparkles size={120} />
                </div>

                <h1 className="text-5xl md:text-6xl font-black mb-2 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-neonGreen to-action drop-shadow-[0_0_15px_rgba(57,255,20,0.5)]">
                    HOUSEEE...
                </h1>
                <p className="text-slate-400 text-lg mb-8 font-light">Private Games for Real Friends.</p>

                {(!user) && (
                    <div className="text-left mb-6">
                        <label className="block text-slate-400 text-sm mb-2 ml-1">Choose your identity</label>
                        <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onBlur={handleCreateUser}
                            placeholder="Enter your name..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:border-action focus:ring-1 focus:ring-action transition-all"
                            required
                        />
                    </div>
                )}

                {user && (
                    <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700 mb-6 relative overflow-hidden group hover:border-slate-600 transition-colors">
                        <div className="flex justify-between items-center mb-2 relative z-10">
                            <span className="text-slate-400">Welcome back,</span>
                            <span className="font-bold text-white text-xl">{user.name}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900 rounded-lg p-3 relative z-10">
                            <div className="flex items-center gap-2 text-action">
                                <Wallet size={20} />
                                <span>Wallet Balance</span>
                            </div>
                            <span className="text-2xl font-bold text-neonGreen">₹{user.walletBalance}</span>
                        </div>
                        <div className="flex gap-2 mt-4 relative z-10 w-full">
                            <button onClick={() => navigate('/profile')} className="flex-1 bg-action/10 hover:bg-action/20 text-action border border-action/20 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                                <User size={16} /> Profile
                            </button>
                            <button onClick={() => navigate('/ledger')} className="flex-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                                <Receipt size={16} /> Ledger
                            </button>
                            <button onClick={() => navigate('/leaderboard')} className="flex-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors">
                                <Trophy size={16} /> Leaders
                            </button>
                        </div>
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={handleHostGame}
                        disabled={!user && !nameInput.trim()}
                        className={`btn-neon w-full flex items-center justify-center gap-2 text-lg py-4 ${(!user && !nameInput) ? 'opacity-50' : ''}`}
                    >
                        <Crown fill="currentColor" /> Host a Game
                    </button>

                    <div className="flex items-center gap-4 text-slate-500 text-sm my-4">
                        <div className="flex-1 h-px bg-slate-800"></div>
                        <span>OR JOIN EXISTING</span>
                        <div className="flex-1 h-px bg-slate-800"></div>
                    </div>

                    <form onSubmit={handleJoinGame} className="flex gap-2">
                        <input
                            type="text"
                            placeholder="5-Digit Code"
                            maxLength={5}
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-4 text-center tracking-[0.5em] font-mono text-xl text-white uppercase focus:border-highlight focus:outline-none"
                            required
                        />
                        <button
                            type="submit"
                            disabled={!user && !nameInput.trim()}
                            className="bg-highlight text-black font-bold px-6 rounded-xl hover:bg-neonGreen transition-colors whitespace-nowrap"
                        >
                            <KeyRound size={24} />
                        </button>
                    </form>

                    {user?.role === 'admin' && (
                        <button
                            onClick={() => navigate('/admin')}
                            className="w-full text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2 mt-4"
                        >
                            <ShieldCheck size={18} /> Master Admin Panel
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
