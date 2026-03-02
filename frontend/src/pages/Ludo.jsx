import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Dice5, Crown } from 'lucide-react';
import VoiceChat from '../components/VoiceChat';
import EmojiOverlay from '../components/EmojiOverlay';

export default function Ludo() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    if (!user || !roomCode) return null;

    const safeGameState = gameState || { players: [], winner: null, turn: null, history: [], colors: {} };
    const isMyTurn = safeGameState.turn === user.id;

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    return (
        <div className="min-h-screen flex flex-col items-center p-4">
            <EmojiOverlay />

            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-4xl flex items-center justify-between mb-4 bg-slate-900/80 p-4 rounded-3xl border border-slate-700/50 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <button onClick={leaveRoom} className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-colors">
                        <LogOut size={24} />
                    </button>
                    <div>
                        <div className="text-xs text-slate-400 font-bold tracking-widest uppercase">Room Code</div>
                        <div className="text-xl font-black text-white tracking-[0.2em]">{roomCode}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <VoiceChat />
                </div>
            </motion.div>

            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-4xl flex flex-col md:flex-row gap-6 items-start">
                {/* LUDO BOARD SHELL */}
                <div className="w-full aspect-square max-w-[95vw] md:max-w-[70vh] xl:max-w-[700px] xl:h-[700px] mx-auto bg-slate-950 rounded-3xl border-4 border-purple-500/30 p-2 md:p-4 relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.8)] flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-6xl mb-4">✚</div>
                        <h2 className="text-3xl font-black text-purple-500 drop-shadow-[0_0_15px_rgba(168,85,247,0.8)]">LUDO Under Construction</h2>
                        <p className="text-slate-400 mt-2">The complex pathing algorithm is being finalized!</p>
                    </div>
                </div>

                {/* SIDEBAR */}
                <div className="w-full md:w-64 space-y-4">
                    <div className="bg-slate-900 rounded-3xl p-5 border border-slate-700/50 shadow-xl">
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Players</h3>
                        <div className="space-y-2">
                            {safeGameState.players?.map((p) => {
                                const pColor = safeGameState.colors?.[p.id] || 'gray';
                                const colorMap = {
                                    red: 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]',
                                    blue: 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]',
                                    green: 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]',
                                    yellow: 'text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.8)]'
                                };
                                return (
                                    <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${safeGameState.turn === p.id ? 'bg-slate-800 border-l-4 border-purple-500' : 'bg-slate-950 block opacity-70'}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colorMap[pColor]} bg-slate-900/50`}>
                                            <Crown size={18} />
                                        </div>
                                        <div className="flex-1 overflow-hidden">
                                            <div className="text-sm font-bold text-white truncate">{p.name} {p.id === user.id && '(You)'}</div>
                                            <div className="text-[10px] text-slate-400 uppercase">{pColor}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
