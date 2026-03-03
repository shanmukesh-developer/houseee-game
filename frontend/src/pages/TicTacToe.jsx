import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, KeySquare, Users, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';
import VFXOverlay from '../components/VFXOverlay';

const EMOJIS = ['😂', '🥶', '🔥', '💀', '🤡', '😡'];

export default function TicTacToe() {
    const { user, gameState, socket, roomCode, gameType, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    useEffect(() => {
        if (!user || !roomCode || gameType !== 'tictactoe') {
            navigate('/');
        }
    }, [user, roomCode, gameType, navigate]);


    const safeGameState = gameState || { players: [], winner: null, turn: null, board: Array(9).fill(null) };
    const board = safeGameState.board || Array(9).fill(null);
    const isMyTurn = safeGameState.turn === user?.id;

    const [vfxType, setVfxType] = useState(null);
    const [vfxTrigger, setVfxTrigger] = useState(0);

    const prevWinner = React.useRef(safeGameState.winner);
    useEffect(() => {
        if (!prevWinner.current && safeGameState.winner && safeGameState.winner !== 'draw') {
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
            socket.emit('tictactoeMove', { roomCode, userId: user.id, index });
        }
    };

    const handleEmoji = (emoji) => {
        socket.emit('sendEmoji', { roomCode, userId: user.id, emoji });
    };

    const handlePlayAgain = () => {
        socket.emit('restartGame', { roomCode, userId: user.id });
    };

    return (
        <div className="min-h-screen py-4 px-4 md:px-8 max-w-7xl mx-auto flex flex-col gap-6 font-sans relative">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none -z-10"></div>
            <EmojiOverlay />
            <VFXOverlay type={vfxType} trigger={vfxTrigger} message={safeGameState.winner === user.id ? 'VICTORY' : 'DEFEAT'} />

            <header className="flex flex-wrap justify-between items-center bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)] relative z-10 gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={leaveRoom} className="text-slate-400 hover:text-blue-400 transition-colors bg-slate-800/80 p-3 rounded-xl border border-slate-700 hover:border-blue-500">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="flex items-center gap-2 bg-slate-950 border-2 border-slate-700 px-6 py-3 rounded-xl font-mono tracking-widest text-xl font-black text-blue-400 shadow-inner">
                        <KeySquare size={24} className="text-blue-800" />
                        {roomCode}
                    </div>
                </div>

                <div className="flex-1 flex justify-center scale-110">
                    <VoiceChat />
                </div>

                <div className="flex items-center gap-2 text-slate-300 bg-slate-950 border-2 border-slate-700 px-5 py-3 rounded-xl font-bold">
                    <Users size={20} className="text-blue-500" /> {safeGameState.players?.length || 0}/2
                </div>
            </header>

            <main className="flex-1 flex flex-col lg:flex-row gap-8 items-center justify-center relative z-10">

                {/* Board Area */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="glass-panel p-6 md:p-10 w-full max-w-2xl text-center border-2 border-blue-500/50 relative overflow-hidden flex flex-col items-center bg-slate-900/90 shadow-[0_0_50px_rgba(59,130,246,0.15)]"
                >
                    <h1 className="text-6xl md:text-7xl font-black mb-10 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 tracking-tighter drop-shadow-[0_0_25px_rgba(59,130,246,0.8)]">
                        TIC TAC TOE
                    </h1>

                    <div className="flex justify-between w-full items-center mb-6 md:mb-10 px-2 md:px-6 bg-slate-950/50 p-4 md:p-6 rounded-2xl border border-slate-800">
                        <div className={`flex flex-col items-center ${safeGameState.turn === safeGameState.players[0]?.id ? 'text-cyan-400 font-bold scale-[1.1] md:scale-125' : 'text-slate-500'} transition-all duration-300`}>
                            <span className="text-[10px] md:text-xs uppercase tracking-widest bg-blue-900/50 border border-blue-500/30 text-blue-300 px-2 md:px-4 py-1.5 rounded-full mb-1 md:mb-2 flex items-center gap-1 md:gap-2 shadow-[0_0_15px_rgba(59,130,246,0.4)]">
                                {safeGameState.players[0]?.id === safeGameState.hostId && <Crown size={12} className="text-yellow-400" />} P1
                            </span>
                            <span className="text-sm md:text-xl truncate max-w-[80px] md:max-w-[150px]">{safeGameState.players[0]?.name || 'Waiting...'}</span>
                            <span className="text-2xl md:text-4xl font-black mt-1 text-cyan-500 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]">X</span>
                        </div>
                        <div className="text-xl md:text-3xl font-black text-slate-700 mx-1 md:mx-4">VS</div>
                        <div className={`flex flex-col items-center ${safeGameState.turn === safeGameState.players[1]?.id ? 'text-red-400 font-bold scale-[1.1] md:scale-125' : 'text-slate-500'} transition-all duration-300`}>
                            <span className="text-[10px] md:text-xs uppercase tracking-widest bg-red-900/50 border border-red-500/30 text-red-300 px-2 md:px-4 py-1.5 rounded-full mb-1 md:mb-2 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                                P2
                            </span>
                            <span className="text-sm md:text-xl truncate max-w-[80px] md:max-w-[150px]">{safeGameState.players[1]?.name || 'Waiting...'}</span>
                            <span className="text-2xl md:text-4xl font-black mt-1 text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]">O</span>
                        </div>
                    </div>

                    <div className="w-[85vmin] h-[85vmin] md:aspect-square md:h-auto md:w-full max-w-[400px] mx-auto bg-slate-950 rounded-[2rem] border-[6px] border-blue-500/40 p-3 grid grid-cols-3 gap-3 relative z-10 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
                        {board.map((cell, i) => (
                            <div
                                key={i}
                                className={`bg-slate-900 rounded-2xl flex items-center justify-center text-7xl md:text-8xl font-black cursor-pointer overflow-hidden relative shadow-[inset_0_4px_20px_rgba(0,0,0,0.5)] ${!cell && isMyTurn && safeGameState.status !== 'finished' ? 'hover:bg-blue-900/20 hover:shadow-[inset_0_0_20px_rgba(59,130,246,0.5)] border border-slate-800 hover:border-blue-500/50 transition-all' : 'border border-slate-800'}`}
                                onClick={() => handleMove(i)}
                            >
                                <div className="animate-presence-wrapper">
                                    {cell && (
                                        <motion.div
                                            initial={{ scale: 5, rotate: cell === 'X' ? 180 : -180, opacity: 0, filter: 'blur(20px)' }}
                                            animate={{ scale: 1, rotate: 0, opacity: 1, filter: 'blur(0px)' }}
                                            transition={{ type: 'spring', bounce: 0.5, duration: 0.8 }}
                                            className={`${cell === 'X' ? 'text-cyan-400 drop-shadow-[0_0_25px_rgba(34,211,238,1)]' : 'text-red-500 drop-shadow-[0_0_25px_rgba(239,68,68,1)]'}`}
                                        >
                                            {cell}
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* WIN OVERLAY */}
                        {safeGameState.status === 'finished' && (
                            <motion.div
                                initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
                                className="absolute inset-x-0 -inset-y-32 md:-inset-y-10 bg-slate-950/80 rounded-xl flex flex-col items-center justify-center z-20"
                            >
                                <motion.div
                                    initial={{ scale: 0, scaleZ: 5 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', bounce: 0.7, duration: 1 }}
                                    className="text-4xl md:text-7xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 drop-shadow-[0_0_40px_rgba(255,255,255,0.6)] uppercase tracking-tighter"
                                >
                                    {safeGameState.winner === 'draw' ? 'DRAW!' : safeGameState.winner === user.id ? 'VICTORY!' : 'DEFEAT!'}
                                </motion.div>
                                {safeGameState.hostId === user.id && (
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handlePlayAgain}
                                        className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-xl md:text-2xl px-8 py-4 md:px-12 md:py-5 rounded-2xl transition-all shadow-[0_0_40px_rgba(59,130,246,0.6)] tracking-widest border-2 border-blue-400 uppercase"
                                    >
                                        Rematch
                                    </motion.button>
                                )}
                                {safeGameState.hostId !== user.id && (
                                    <div className="mt-6 text-blue-400 text-sm md:text-lg tracking-widest bg-blue-950/50 px-4 py-3 md:px-8 md:py-4 rounded-xl border border-blue-900 animate-pulse">Awaiting Host...</div>
                                )}
                            </motion.div>
                        )}
                    </div>
                </motion.div>

                {/* Emojis Panel */}
                <div className="glass-panel p-6 w-full lg:w-32 flex flex-row lg:flex-col gap-6 justify-center items-center relative overflow-hidden border-2 border-indigo-500/30 bg-slate-900/90 shadow-[0_0_30px_rgba(99,102,241,0.15)]">
                    <h3 className="text-slate-400 font-bold uppercase tracking-[0.3em] text-xs hidden lg:block text-center mb-4">Emotes</h3>
                    <div className="flex lg:flex-col gap-6 flex-wrap justify-center relative z-10">
                        {EMOJIS.map((emoji, idx) => (
                            <motion.button
                                key={emoji}
                                onClick={() => handleEmoji(emoji)}
                                whileHover={{ scale: 1.4, rotate: (idx % 2 === 0 ? 10 : -10) }}
                                whileTap={{ scale: 0.9 }}
                                className="text-4xl md:text-5xl drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] filter grayscale-[0.2] hover:grayscale-0 transition-all duration-200"
                            >
                                {emoji}
                            </motion.button>
                        ))}
                    </div>
                </div>

            </main>
        </div>
    );
}
