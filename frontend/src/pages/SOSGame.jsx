import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, KeySquare, Users, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';
import VFXOverlay from '../components/VFXOverlay';

const EMOJIS = ['😂', '🥶', '🔥', '💀', '🤡', '😡'];

export default function SOSGame() {
    const { user, gameState, socket, roomCode, gameType, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();
    const [selectedLetter, setSelectedLetter] = useState('S');

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    useEffect(() => {
        if (!user || !roomCode || gameType !== 'sos') {
            navigate('/');
        }
    }, [user, roomCode, gameType, navigate]);


    const safeGameState = gameState || { players: [], winner: null, turn: null, board: Array(256).fill(null), scores: {} };
    const board = safeGameState.board || Array(256).fill(null);
    const scores = safeGameState.scores || {};
    const isMyTurn = safeGameState.turn === user?.id;

    const [vfxType, setVfxType] = useState(null);
    const [vfxTrigger, setVfxTrigger] = useState(0);

    const prevWinner = React.useRef(safeGameState.winner);
    useEffect(() => {
        if (!prevWinner.current && safeGameState.winner && safeGameState.winner !== 'draw') {
            // setTimeout to avoid synchronous cascade re-render loop
            setTimeout(() => {
                setVfxType('victory');
                setVfxTrigger(v => v + 1);
            }, 0);
        }
        prevWinner.current = safeGameState.winner;
    }, [safeGameState.winner]);

    if (!user || !roomCode) return null;

    const handleMove = (index) => {
        if (isMyTurn && board[index] === null && safeGameState.status !== 'finished') {
            socket.emit('sosMove', { roomCode, userId: user.id, index, letter: selectedLetter });
        }
    };

    const handleEmoji = (emoji) => {
        socket.emit('sendEmoji', { roomCode, userId: user.id, emoji });
    };

    const handlePlayAgain = () => {
        socket.emit('restartGame', { roomCode, userId: user.id });
    };

    const p1 = safeGameState.players[0];
    const p2 = safeGameState.players[1];
    const scoreP1 = p1 ? (scores[p1.id] || 0) : 0;
    const scoreP2 = p2 ? (scores[p2.id] || 0) : 0;

    return (
        <div className="min-h-screen py-4 px-4 md:px-8 max-w-7xl mx-auto flex flex-col gap-6 font-sans relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/20 via-slate-950 to-slate-950 pointer-events-none -z-10"></div>
            <EmojiOverlay />
            <VFXOverlay type={vfxType} trigger={vfxTrigger} message={safeGameState.winner === user.id ? 'VICTORY' : 'DEFEAT'} />

            <header className="flex flex-wrap justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] relative z-10 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={leaveRoom} className="text-slate-400 hover:text-red-500 transition-colors bg-slate-800/80 p-3 rounded-xl border border-slate-700 hover:border-red-500">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="flex items-center gap-2 bg-slate-950 border-2 border-slate-700 px-6 py-3 rounded-xl font-mono tracking-widest text-xl font-black text-red-500 shadow-inner">
                        <KeySquare size={24} className="text-red-800" />
                        {roomCode}
                    </div>
                </div>

                <div className="flex-1 flex justify-center scale-110">
                    <VoiceChat />
                </div>

                <div className="flex items-center gap-2 text-slate-300 bg-slate-950 border-2 border-slate-700 px-5 py-3 rounded-xl font-bold">
                    <Users size={20} className="text-red-500" /> {safeGameState.players?.length || 0}/2
                </div>
            </header>

            <main className="flex-1 flex flex-col xl:flex-row gap-8 items-center justify-center relative">

                {/* Board Area */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="glass-panel p-6 md:p-8 w-full max-w-4xl text-center border-2 border-red-500/50 relative overflow-hidden flex flex-col items-center bg-slate-900/90 shadow-[0_0_50px_rgba(239,68,68,0.15)]"
                >
                    <h1 className="text-5xl md:text-7xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-orange-500 to-red-500 tracking-tighter drop-shadow-[0_0_25px_rgba(239,68,68,0.8)] uppercase">
                        S O S  W A R S
                    </h1>

                    <div className="flex justify-between w-full items-center mb-10 px-4 bg-slate-950/50 p-6 rounded-2xl border border-slate-800">
                        <div className={`flex flex-col items-center ${safeGameState.turn === p1?.id ? 'text-orange-400 font-bold scale-125' : 'text-slate-500'} transition-all duration-300`}>
                            <span className="text-xs uppercase tracking-widest bg-red-900/50 border border-red-500/30 text-red-300 px-4 py-1.5 rounded-full mb-2 flex items-center gap-2 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                                {p1?.id === safeGameState.hostId && <Crown size={14} className="text-yellow-400" />} Player 1
                            </span>
                            <span className="text-xl">{p1?.name || 'Waiting...'}</span>
                            <span className="text-5xl font-black mt-2 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">{scoreP1}</span>
                        </div>

                        <div className="flex flex-col items-center gap-3">
                            <span className="text-sm text-slate-400 tracking-[0.3em] uppercase font-bold">Ammunition</span>
                            <div className="flex bg-slate-950 rounded-xl p-2 border-2 border-slate-700 shadow-inner gap-2">
                                <button
                                    onClick={() => setSelectedLetter('S')}
                                    className={`px-8 py-4 rounded-lg font-black text-3xl transition-all duration-300 ${selectedLetter === 'S' ? 'bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_0_20px_rgba(239,68,68,0.8)] scale-105 border-2 border-red-300' : 'bg-slate-900 text-slate-500 hover:text-red-300 hover:bg-slate-800 border-2 border-transparent'}`}
                                >S</button>
                                <button
                                    onClick={() => setSelectedLetter('O')}
                                    className={`px-8 py-4 rounded-lg font-black text-3xl transition-all duration-300 ${selectedLetter === 'O' ? 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-[0_0_20px_rgba(249,115,22,0.8)] scale-105 border-2 border-orange-300' : 'bg-slate-900 text-slate-500 hover:text-orange-300 hover:bg-slate-800 border-2 border-transparent'}`}
                                >O</button>
                            </div>
                        </div>

                        <div className={`flex flex-col items-center ${safeGameState.turn === p2?.id ? 'text-orange-400 font-bold scale-125' : 'text-slate-500'} transition-all duration-300`}>
                            <span className="text-xs uppercase tracking-widest bg-red-900/50 border border-red-500/30 text-red-300 px-4 py-1.5 rounded-full mb-2 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                                Player 2
                            </span>
                            <span className="text-xl">{p2?.name || 'Waiting...'}</span>
                            <span className="text-5xl font-black mt-2 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">{scoreP2}</span>
                        </div>
                    </div>

                    <div className="w-[85vmin] h-[85vmin] md:aspect-square md:h-auto md:w-full max-w-[700px] mx-auto bg-slate-950 rounded-2xl border-[3px] border-red-500/30 p-1 md:p-2 grid grid-cols-[repeat(16,minmax(0,1fr))] grid-rows-[repeat(16,minmax(0,1fr))] gap-[1px] md:gap-[2px] relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
                        {board.map((cell, i) => (
                            <motion.div
                                key={i}
                                className={`w-full h-full bg-slate-900 flex items-center justify-center text-[10px] md:text-sm font-black cursor-pointer overflow-hidden relative shadow-inner ${!cell && isMyTurn && safeGameState.status !== 'finished' ? 'hover:bg-red-900/30 hover:shadow-[inset_0_0_8px_rgba(239,68,68,0.5)] transition-all' : ''} ${cell ? 'bg-slate-800/80' : ''}`}
                                onClick={() => handleMove(i)}
                                whileTap={!cell && isMyTurn ? { scale: 0.8 } : {}}
                            >
                                <AnimatePresence>
                                    {cell && (
                                        <motion.div
                                            initial={{ scale: 3, opacity: 0, filter: 'blur(5px)' }}
                                            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
                                            className={`${cell === 'S' ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,1)]' : 'text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,1)]'}`}
                                        >
                                            {cell}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}

                        {/* WIN OVERLAY */}
                        {safeGameState.status === 'finished' && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                className="absolute inset-0 bg-slate-950/90 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center z-20"
                            >
                                <motion.div
                                    initial={{ scale: 0, y: 100, rotate: -10 }}
                                    animate={{ scale: 1, y: 0, rotate: 0 }}
                                    transition={{ type: 'spring', bounce: 0.6, duration: 1 }}
                                    className="text-7xl md:text-8xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-tr from-yellow-400 to-red-600 drop-shadow-[0_0_40px_rgba(239,68,68,0.8)] uppercase tracking-tighter"
                                >
                                    {safeGameState.winner === 'draw' ? 'DRAW!' : safeGameState.winner === user.id ? 'VICTORY!' : 'DEFEAT!'}
                                </motion.div>
                                <div className="text-4xl text-white mb-10 font-black tracking-widest bg-black/50 px-10 py-4 rounded-full border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                                    <span className={safeGameState.winner === p1?.id ? 'text-yellow-400' : 'text-slate-400'}>{scoreP1}</span>
                                    <span className="text-slate-600 mx-4">-</span>
                                    <span className={safeGameState.winner === p2?.id ? 'text-yellow-400' : 'text-slate-400'}>{scoreP2}</span>
                                </div>

                                {safeGameState.hostId === user.id && (
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handlePlayAgain}
                                        className="bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-2xl px-12 py-5 rounded-2xl transition-all shadow-[0_0_40px_rgba(239,68,68,0.6)] tracking-widest border-2 border-red-400 uppercase"
                                    >
                                        Deploy Again
                                    </motion.button>
                                )}
                                {safeGameState.hostId !== user.id && (
                                    <div className="text-red-400 text-lg tracking-widest bg-red-950/50 px-8 py-4 rounded-xl border border-red-900 animate-pulse">Awaiting Commander...</div>
                                )}
                            </motion.div>
                        )}
                    </div>
                </motion.div>

                {/* Emojis Panel */}
                <div className="glass-panel p-6 w-full xl:w-48 flex flex-row xl:flex-col gap-4 justify-center items-center relative overflow-hidden border-orange-500/30">
                    <h3 className="text-slate-500 font-bold uppercase tracking-widest text-xs hidden xl:block mb-2">Trash Talk</h3>
                    <div className="flex xl:flex-col gap-4 flex-wrap justify-center relative z-10">
                        {EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleEmoji(emoji)}
                                className="text-4xl hover:scale-125 transition-transform drop-shadow-lg"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>

            </main>
        </div>
    );
}
