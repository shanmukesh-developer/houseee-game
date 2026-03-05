import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { Sparkles, Wallet, ShieldCheck, KeyRound, Crown, Trophy, Receipt, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
    const { user, setUser, socket, roomCode, gameType } = useContext(AppContext);
    const [nameInput, setNameInput] = useState(user?.name || '');
    const [joinCode, setJoinCode] = useState('');
    const [selectedGame, setSelectedGame] = useState('houseee');
    const navigate = useNavigate();

    // Whenever we successfully receive a roomCode, navigate to the correct room type
    useEffect(() => {
        if (roomCode && gameType) {
            if (gameType === 'houseee') navigate('/room');
            if (gameType === 'tictactoe') navigate('/tictactoe');
            if (gameType === 'sos') navigate('/sos');
            if (gameType === 'snakesladders') navigate('/snakesladders');
            if (gameType === 'ludo') navigate('/ludo');
            if (gameType === 'blockblast') navigate('/blockblast');
            if (gameType === 'territorywar') navigate('/territorywar');
            if (gameType === 'agargame') navigate('/agargame');
            if (gameType === 'battleroyale') navigate('/battleroyale');
            if (gameType === 'bombergrid') navigate('/bombergrid');
            if (gameType === 'coredefense') navigate('/coredefense');
            if (gameType === 'cararena') navigate('/cararena');
        }
    }, [roomCode, gameType, navigate]);

    const handleHostGame = () => {
        if (!nameInput.trim() && !user) return;

        let currentUser = user;
        if (!currentUser) {
            currentUser = {
                id: 'user_' + Math.random().toString(36).substr(2, 9),
                name: nameInput,
                walletBalance: 100,
                role: nameInput.toLowerCase() === 'admin' ? 'admin' : 'player'
            };
            setUser(currentUser);
        }

        socket.emit('createRoom', { userId: currentUser.id, userFallback: currentUser, gameType: selectedGame });
    };

    const handleJoinGame = (e) => {
        e.preventDefault();
        if (!nameInput.trim() && !user) return;

        let currentUser = user;
        if (!currentUser) {
            currentUser = {
                id: 'user_' + Math.random().toString(36).substr(2, 9),
                name: nameInput,
                walletBalance: 20,
                role: nameInput.toLowerCase() === 'admin' ? 'admin' : 'player'
            };
            setUser(currentUser);
        }

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

                {/* GAME SELECTION */}
                <div className="mb-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                    <button
                        onClick={() => setSelectedGame('houseee')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'houseee' ? 'bg-highlight/20 border-highlight text-highlight shadow-[0_0_15px_rgba(57,255,20,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <Sparkles size={24} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Houseee</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('tictactoe')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'tictactoe' ? 'bg-blue-500/20 border-blue-500 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <div className="text-xl font-black mb-1 leading-none tracking-widest px-1">X O</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Tic Tac Toe</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('sos')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'sos' ? 'bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <div className="text-xl font-black mb-1 leading-none tracking-widest px-1">SOS</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">S O S</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('snakesladders')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'snakesladders' ? 'bg-green-500/20 border-green-500 text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <div className="text-xl font-black mb-1 leading-none tracking-widest px-1">⚄</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Snakes&Lad</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('ludo')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'ludo' ? 'bg-purple-500/20 border-purple-500 text-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <div className="text-xl font-black mb-1 leading-none tracking-widest px-1">✚</div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Ludo</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('blockblast')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'blockblast' ? 'bg-orange-500/20 border-orange-500 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <div className="grid grid-cols-2 gap-[1px] mb-1 opacity-90"><div className="w-2.5 h-2.5 bg-current rounded-sm"></div><div className="w-2.5 h-2.5 bg-current rounded-sm"></div><div className="w-2.5 h-2.5 bg-current rounded-sm"></div><div className="w-2.5 h-2.5 bg-current rounded-sm"></div></div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Blast</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('territorywar')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'territorywar' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <div className="grid grid-cols-3 gap-0.5 mb-1 opacity-90 w-5 h-5">
                            <div className="bg-red-500"></div><div className="bg-blue-500"></div><div className="bg-green-500"></div>
                            <div className="bg-red-500"></div><div className="bg-yellow-500"></div><div className="bg-green-500"></div>
                            <div className="bg-purple-500"></div><div className="bg-yellow-500"></div><div className="bg-cyan-500"></div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center flex items-center justify-center">Territory <br /> War</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('agargame')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'agargame' ? 'bg-pink-500/20 border-pink-500 text-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <div className="relative w-6 h-6 mb-1">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-current"></div>
                            <div className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-current"></div>
                            <div className="absolute bottom-1 left-0 w-1 h-1 rounded-full bg-current"></div>
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Agar</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('battleroyale')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'battleroyale' ? 'bg-orange-500/20 border-orange-500 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <svg className="w-6 h-6 mb-1 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center flex items-center justify-center">Battle<br />Royale</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('bombergrid')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'bombergrid' ? 'bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <svg className="w-6 h-6 mb-1 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="14" r="4" /><path d="M10.5 11.5L14 8" /><circle cx="15" cy="7" r="1" fill="currentColor" /><path d="M12 4h4v4" /></svg>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Bomber<br />Grid</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('coredefense')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'coredefense' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <ShieldCheck size={24} className="mb-1" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center flex items-center justify-center">Core<br />Defense</span>
                    </button>
                    <button
                        onClick={() => setSelectedGame('cararena')}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${selectedGame === 'cararena' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        <svg className="w-6 h-6 mb-1 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-center">Car<br />Arena</span>
                    </button>
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleHostGame}
                        disabled={!user && !nameInput.trim()}
                        className={`btn-neon w-full flex items-center justify-center gap-2 text-lg py-4 ${(!user && !nameInput) ? 'opacity-50' : ''}`}
                        style={{
                            backgroundColor: selectedGame === 'tictactoe' ? 'rgba(59, 130, 246, 0.2)' : selectedGame === 'sos' ? 'rgba(239, 68, 68, 0.2)' : selectedGame === 'snakesladders' ? 'rgba(34, 197, 94, 0.2)' : selectedGame === 'ludo' ? 'rgba(168, 85, 247, 0.2)' : selectedGame === 'blockblast' ? 'rgba(249, 115, 22, 0.2)' : selectedGame === 'territorywar' ? 'rgba(6, 182, 212, 0.2)' : selectedGame === 'agargame' ? 'rgba(236, 72, 153, 0.2)' : selectedGame === 'battleroyale' ? 'rgba(249, 115, 22, 0.2)' : selectedGame === 'bombergrid' ? 'rgba(239, 68, 68, 0.2)' : selectedGame === 'coredefense' ? 'rgba(99, 102, 241, 0.2)' : selectedGame === 'cararena' ? 'rgba(234, 179, 8, 0.2)' : undefined,
                            borderColor: selectedGame === 'tictactoe' ? '#3B82F6' : selectedGame === 'sos' ? '#EF4444' : selectedGame === 'snakesladders' ? '#22C55E' : selectedGame === 'ludo' ? '#A855F7' : selectedGame === 'blockblast' ? '#F97316' : selectedGame === 'territorywar' ? '#06B6D4' : selectedGame === 'agargame' ? '#EC4899' : selectedGame === 'battleroyale' ? '#F97316' : selectedGame === 'bombergrid' ? '#EF4444' : selectedGame === 'coredefense' ? '#6366F1' : selectedGame === 'cararena' ? '#EAB308' : undefined,
                            color: selectedGame === 'tictactoe' ? '#3B82F6' : selectedGame === 'sos' ? '#EF4444' : selectedGame === 'snakesladders' ? '#22C55E' : selectedGame === 'ludo' ? '#A855F7' : selectedGame === 'blockblast' ? '#F97316' : selectedGame === 'territorywar' ? '#06B6D4' : selectedGame === 'agargame' ? '#EC4899' : selectedGame === 'battleroyale' ? '#F97316' : selectedGame === 'bombergrid' ? '#EF4444' : selectedGame === 'coredefense' ? '#818CF8' : selectedGame === 'cararena' ? '#FACC15' : undefined,
                        }}
                    >
                        <Crown fill="currentColor" /> Host {selectedGame.toUpperCase()} Game
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
