import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Dice5, Trophy } from 'lucide-react';
import VoiceChat from '../components/VoiceChat';
import EmojiOverlay from '../components/EmojiOverlay';

export default function SnakesLadders() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    const [isRolling, setIsRolling] = useState(false);

    if (!user || !roomCode) return null;

    const safeGameState = gameState || { players: [], winner: null, turn: null, positions: {}, history: [] };
    const isMyTurn = safeGameState.turn === user.id;

    // Generate Boustrophedon 10x10 Grid (1 to 100)
    // Row 9 (top) down to Row 0 (bottom)
    const boardCells = [];
    for (let row = 9; row >= 0; row--) {
        for (let col = 0; col < 10; col++) {
            if (row % 2 === 0) {
                // Left to right
                boardCells.push(row * 10 + col + 1);
            } else {
                // Right to left
                boardCells.push(row * 10 + (9 - col) + 1);
            }
        }
    }

    const handleRoll = () => {
        if (!isMyTurn || safeGameState.winner || safeGameState.status === 'waiting') return;
        setIsRolling(true);
        setTimeout(() => {
            socket.emit('rollDiceSL', { roomCode, userId: user.id });
            setIsRolling(false);
        }, 600);
    };

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    // Color palette for players (up to 10)
    const playerColors = [
        '#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7',
        '#EC4899', '#06B6D4', '#F97316', '#8B5CF6', '#14B8A6'
    ];

    // Determine color for each player based on join order
    const getPlayerColor = (playerId) => {
        const index = safeGameState.players?.findIndex(p => p.id === playerId) || 0;
        return playerColors[index % playerColors.length];
    };

    return (
        <div className="min-h-screen flex flex-col items-center p-2 md:p-4">
            <EmojiOverlay />

            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-6xl flex flex-wrap items-center justify-between mb-4 bg-slate-900/80 p-3 md:p-4 rounded-3xl border border-slate-700/50 backdrop-blur-xl gap-3">
                <div className="flex items-center gap-3 md:gap-4">
                    <button onClick={leaveRoom} className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-colors">
                        <LogOut size={20} />
                    </button>
                    <div>
                        <div className="text-[10px] md:text-xs text-slate-400 font-bold tracking-widest uppercase">Room Code</div>
                        <div className="text-lg md:text-xl font-black text-white tracking-[0.2em]">{roomCode}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <VoiceChat />
                </div>
            </motion.div>

            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-6xl flex flex-col xl:flex-row gap-4 items-start pb-20">
                {/* GAME BOARD */}
                <div className="w-full aspect-square max-w-[95vw] md:max-w-[70vh] xl:max-w-[800px] xl:h-[800px] mx-auto bg-slate-950 rounded-2xl md:rounded-3xl border-4 border-green-500/30 p-1 md:p-2 relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.8)]">

                    {/* Visual Snake/Ladder overlays could go here as SVGs */}
                    <div className="absolute inset-2 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>

                    <div className="w-full h-full grid grid-cols-[repeat(10,minmax(0,1fr))] grid-rows-[repeat(10,minmax(0,1fr))] gap-[1px] md:gap-0.5 relative">
                        {boardCells.map((cellNum) => {
                            // Find players currently on this cell
                            const playersHere = safeGameState.players?.filter(p => (safeGameState.positions[p.id] === cellNum));

                            // Snakes & Ladders background coloring for visual cues
                            const isSnakeHead = [16, 47, 49, 56, 62, 64, 87, 93, 95, 98].includes(cellNum);
                            const isSnakeTail = [6, 26, 11, 53, 19, 60, 24, 73, 75, 78].includes(cellNum);
                            const isLadderBot = [1, 4, 9, 21, 28, 36, 51, 71, 80].includes(cellNum);
                            const isLadderTop = [38, 14, 31, 42, 84, 44, 67, 91, 100].includes(cellNum);

                            return (
                                <div key={cellNum} className={`relative flex items-center justify-center border border-slate-800/50 rounded-sm overflow-hidden 
                                    ${isSnakeHead ? 'bg-red-950/60' : isSnakeTail ? 'bg-red-900/20' : ''}
                                    ${isLadderBot ? 'bg-green-950/60' : isLadderTop ? 'bg-green-900/20' : ''}
                                    ${!isSnakeHead && !isSnakeTail && !isLadderBot && !isLadderTop ? 'bg-slate-900/40' : ''}
                                `}>
                                    <span className="absolute top-0.5 left-1 text-[8px] md:text-[10px] font-bold text-slate-500/50 pointer-events-none select-none">{cellNum}</span>

                                    {/* Tokens */}
                                    <div className="flex flex-wrap items-center justify-center gap-0.5 w-full h-full p-1 md:p-2 z-10">
                                        <AnimatePresence>
                                            {playersHere?.map(p => (
                                                <motion.div
                                                    key={p.id}
                                                    layoutId={`token-${p.id}`}
                                                    initial={{ scale: 0, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0, opacity: 0 }}
                                                    className="w-3 h-3 md:w-5 md:h-5 rounded-full shadow-[0_0_10px_currentColor] border border-white/50"
                                                    style={{ backgroundColor: getPlayerColor(p.id), color: getPlayerColor(p.id) }}
                                                    title={p.name}
                                                />
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    {/* Overlays for Snake/Ladder visuals */}
                                    {isSnakeHead && <span className="absolute bottom-0 right-0 text-[10px] md:text-xs opacity-40">🐍</span>}
                                    {isLadderBot && <span className="absolute bottom-0 right-0 text-[10px] md:text-xs opacity-40">🪜</span>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* SIDEBAR */}
                <div className="w-full xl:w-80 flex flex-col gap-4">

                    {/* DICE CONTROLS */}
                    <div className="bg-slate-900 rounded-3xl p-6 border border-slate-700/50 shadow-xl flex flex-col items-center">
                        <div className="w-full flex justify-between items-center mb-6">
                            <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Play</span>
                            {safeGameState.winner ? (
                                <span className="text-yellow-500 font-black uppercase text-xs animate-pulse flex items-center gap-1"><Trophy size={14} /> Game Over</span>
                            ) : (
                                <span className={`${isMyTurn ? 'text-green-500' : 'text-slate-500'} font-black uppercase text-xs flex items-center gap-2`}>
                                    {isMyTurn ? (
                                        <><span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span> YOUR TURN</>
                                    ) : 'WAITING...'}
                                </span>
                            )}
                        </div>

                        <motion.button
                            onClick={handleRoll}
                            disabled={!isMyTurn || isRolling || safeGameState.winner || safeGameState.status === 'waiting'}
                            animate={isRolling ? { rotate: 360, scale: 0.9 } : { rotate: 0, scale: 1 }}
                            transition={{ duration: 0.5 }}
                            className={`w-32 h-32 rounded-3xl flex items-center justify-center border-4 shadow-2xl transition-all ${!isMyTurn || safeGameState.winner ? 'bg-slate-800 border-slate-700 text-slate-600 opacity-50 cursor-not-allowed'
                                    : 'bg-green-500 border-green-400 text-slate-950 hover:bg-green-400 hover:scale-105 shadow-[0_0_40px_rgba(34,197,94,0.4)]'
                                }`}
                        >
                            <Dice5 size={64} />
                        </motion.button>

                        {/* Recent History */}
                        <div className="w-full mt-6 space-y-2">
                            {safeGameState.history?.slice().reverse().map((h, i) => {
                                const p = safeGameState.players?.find(p => p.id === h.userId);
                                return (
                                    <div key={i} className="flex justify-between items-center text-xs bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                                        <span className="text-slate-300 font-bold truncate max-w-[100px]">{p?.name}</span>
                                        <span className="text-slate-500">Rolled a</span>
                                        <span className="font-black text-white text-base w-6 text-center">{h.dice}</span>
                                    </div>
                                )
                            })}
                        </div>

                        {safeGameState.winner && (
                            <button onClick={() => socket.emit('restartGame', { roomCode, userId: user.id })} className="mt-6 w-full py-3 bg-action/20 text-action hover:bg-action/30 rounded-xl font-bold uppercase tracking-widest border border-action/30">
                                Play Again
                            </button>
                        )}
                    </div>

                    {/* PLAYERS */}
                    <div className="bg-slate-900 rounded-3xl p-5 border border-slate-700/50 shadow-xl flex-1">
                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">Leaderboard ({safeGameState.players?.length}/10)</h3>
                        <div className="space-y-2">
                            {safeGameState.players?.slice().sort((a, b) => (safeGameState.positions?.[b.id] || 0) - (safeGameState.positions?.[a.id] || 0)).map((p) => {
                                const pos = safeGameState.positions?.[p.id] || 0;
                                return (
                                    <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${safeGameState.turn === p.id ? 'bg-slate-800 shadow-lg border-l-4 border-green-500' : 'bg-slate-950 block transform scale-[0.98]'}`}>
                                        <div className="w-8 h-8 rounded-full border-2 bg-slate-900 flex items-center justify-center font-black text-xs shadow-inner" style={{ borderColor: getPlayerColor(p.id), color: getPlayerColor(p.id) }}>
                                            {pos}
                                        </div>
                                        <div className="flex-1 overflow-hidden flex justify-between items-center">
                                            <div className="text-sm font-bold text-white truncate">{p.name} {p.id === user.id && <span className="text-slate-500">(You)</span>}</div>
                                            {safeGameState.winner === p.id && <Trophy size={16} className="text-yellow-500" />}
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
