import React, { useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Crown, Clock, Trophy } from 'lucide-react';
import VFXOverlay from '../components/VFXOverlay';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';

// Standard 15x15 Territory War Grid
const GRID_SIZE = 15;

const COLOR_MAP = {
    red: '#EF4444', blue: '#3B82F6', green: '#22C55E', yellow: '#EAB308',
    purple: '#A855F7', orange: '#F97316', pink: '#EC4899', cyan: '#06B6D4',
    gray: '#64748B' // unowned or fallback
};

export default function TerritoryWar() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();
    const [shake, setShake] = useState(false);
    const [showJoystick, setShowJoystick] = useState(false);
    const boardRef = useRef(null);

    // Ensure state safety
    const safeGameState = gameState || {
        players: [], status: 'waiting', grid: Array(15).fill(Array(15).fill(null)),
        positions: {}, colors: {}, scores: {}, timeLeft: 60, history: []
    };

    const isHost = safeGameState.hostId === user?.id;
    const amIPlaying = safeGameState.players.some(p => p.id === user?.id);
    const myPosition = safeGameState.positions[user?.id];
    const myColor = safeGameState.colors[user?.id];

    // VFX Triggers based on history (steals)
    useEffect(() => {
        if (!safeGameState.history || safeGameState.history.length === 0) return;
        const lastAction = safeGameState.history[safeGameState.history.length - 1];

        // If someone stole MY tile, screen shake!
        if (lastAction.type === 'steal' && lastAction.victim === user?.id) {
            setShake(true);
            setTimeout(() => setShake(false), 300);
        }
    }, [safeGameState.history, user?.id]);

    // Keyboard controls
    const handleKeyDown = useCallback((e) => {
        if (safeGameState.status !== 'playing' || !myPosition) return;

        let { r, c } = myPosition;
        let moved = false;

        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { r--; moved = true; }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { r++; moved = true; }
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { c--; moved = true; }
        if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { c++; moved = true; }

        if (moved) {
            // Prevent scrolling
            e.preventDefault();

            // Validate Bounds
            if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
                socket.emit('moveTerritory', { roomCode, userId: user.id, r, c });
            }
        }
    }, [safeGameState.status, myPosition, roomCode, user, socket]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const startGame = () => {
        if (isHost && safeGameState.status === 'waiting') {
            socket.emit('startGame', { roomCode, userId: user.id });
        }
    };

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    const restartGame = () => {
        socket.emit('restartGame', { roomCode, userId: user.id });
    };

    // Calculate Leaderboard
    const sortedPlayers = [...safeGameState.players].sort((a, b) => {
        const scoreA = safeGameState.scores?.[a.id] || 0;
        const scoreB = safeGameState.scores?.[b.id] || 0;
        return scoreB - scoreA;
    });

    return (
        <div className="min-h-screen flex flex-col items-center p-4 bg-slate-950 text-white font-sans overflow-hidden touch-none select-none relative">
            {/* Ambient Lighting */}
            <div className="absolute top-0 right-1/4 w-[40vw] h-[40vw] bg-cyan-600/10 blur-[150px] rounded-full pointer-events-none z-0"></div>

            <EmojiOverlay />
            <VFXOverlay />
            <VoiceChat />

            {/* Header */}
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-2xl flex items-center justify-between mb-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md relative z-10">
                <button onClick={leaveRoom} className="p-3 bg-red-600/90 text-white hover:bg-red-500 rounded-xl transition-colors shadow-lg border border-red-900">
                    <LogOut size={20} />
                </button>

                <div className="text-center flex-1 mx-4">
                    <div className="text-xs text-cyan-400 font-black tracking-widest uppercase mb-1 drop-shadow-md">TERRITORY WAR</div>
                    <div className="text-3xl font-black text-white tracking-wider flex items-center justify-center gap-2">
                        <Clock size={28} className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-cyan-400"} />
                        <span className={safeGameState.timeLeft <= 10 ? "text-red-500" : ""}>0:{safeGameState.timeLeft?.toString().padStart(2, '0') || '00'}</span>
                    </div>
                </div>

                <div className="flex bg-slate-800 p-2 rounded-xl text-sm font-bold items-center gap-2 border border-slate-700">
                    <code className="text-action tracking-widest text-lg">{roomCode}</code>
                </div>

                {amIPlaying && (
                    <button
                        onClick={() => setShowJoystick(!showJoystick)}
                        className={`ml-4 p-3 rounded-xl transition-colors shadow-lg border hidden md:flex items-center justify-center ${showJoystick ? 'bg-cyan-600 text-white border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                        title="Toggle On-Screen Joystick"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                )}
            </motion.div>

            {/* Main Stage */}
            <div className="flex flex-col md:flex-row gap-6 w-full max-w-4xl flex-1 relative z-10">

                {/* Left side: The Board */}
                <div className="flex-1 flex flex-col items-center justify-center">
                    <motion.div
                        ref={boardRef}
                        animate={shake ? { x: [-10, 10, -10, 10, 0], y: [-5, 5, -5, 5, 0] } : {}}
                        transition={{ duration: 0.4 }}
                        className="relative bg-slate-900/80 p-2 sm:p-4 rounded-2xl border border-slate-800 shadow-[0_0_50px_rgba(6,182,212,0.15)] flex-shrink-0"
                    >
                        <div
                            className="grid gap-[2px] sm:gap-1 bg-slate-800 p-1 sm:p-2 rounded-xl border border-slate-700/50"
                            style={{
                                gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                                gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`
                            }}
                        >
                            {safeGameState.grid.map((row, rIdx) => (
                                row.map((cellOwner, cIdx) => {
                                    const cellColor = cellOwner ? (COLOR_MAP[safeGameState.colors?.[cellOwner]] || COLOR_MAP.gray) : 'transparent';
                                    return (
                                        <div
                                            key={`${rIdx}-${cIdx}`}
                                            className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-[2px] sm:rounded-md transition-colors duration-200"
                                            style={{
                                                backgroundColor: cellColor,
                                                boxShadow: cellOwner ? `inset 0 0 10px rgba(0,0,0,0.5), 0 0 10px ${cellColor}40` : 'none',
                                            }}
                                        />
                                    );
                                })
                            ))}

                            {/* Entity Layer (Players) */}
                            {safeGameState.players.map(p => {
                                const pos = safeGameState.positions?.[p.id];
                                if (!pos) return null;
                                const pColor = COLOR_MAP[safeGameState.colors?.[p.id]] || COLOR_MAP.gray;
                                const isMe = p.id === user?.id;

                                return (
                                    <motion.div
                                        key={p.id}
                                        layout
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                        className="absolute z-20 w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-full border-2 sm:border-4"
                                        style={{
                                            left: `calc(0.5rem + 0.25rem + ${pos.c} * (100% - 1rem - 0.5rem) / ${GRID_SIZE})`, // rough estimation mapping, needs exact grid alignment
                                            top: `calc(0.5rem + 0.25rem + ${pos.r} * (100% - 1rem - 0.5rem) / ${GRID_SIZE})`,
                                            transform: 'translate(-0px, -0px)',
                                            borderColor: '#ffffff',
                                            backgroundColor: pColor,
                                            boxShadow: `0 0 20px ${pColor}, inset 0 0 10px rgba(255,255,255,0.8)`
                                        }}
                                    >
                                        {isMe && <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold bg-white text-black px-2 py-0.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap">YOU</div>}
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Status Overlay */}
                        {safeGameState.status === 'waiting' && (
                            <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center">
                                <Crown size={48} className="text-cyan-400 mb-4 animate-bounce" />
                                <h2 className="text-2xl font-black mb-2 text-white">WAITING FOR PLAYERS</h2>
                                <p className="text-slate-400 mb-6">Move with W A S D or Arrows.</p>
                                {isHost ? (
                                    <button onClick={startGame} className="btn-neon bg-cyan-500/20 text-cyan-400 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)] px-8 py-3 rounded-xl font-bold text-lg">
                                        START BATTLE
                                    </button>
                                ) : (
                                    <p className="text-cyan-400 font-bold animate-pulse">Waiting for host to start...</p>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* Right side: Leaderboard / Mobile D-Pad */}
                <div className="w-full md:w-64 flex flex-col gap-4">
                    <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md">
                        <h3 className="font-black text-slate-400 mb-3 flex items-center gap-2"><Trophy size={18} className="text-yellow-500" /> RANKINGS</h3>
                        <div className="space-y-2">
                            <AnimatePresence>
                                {sortedPlayers.map((p, idx) => (
                                    <motion.div
                                        key={p.id}
                                        layout
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className={`flex items-center justify-between p-3 rounded-xl border ${p.id === user?.id ? 'bg-slate-800 border-slate-600' : 'bg-slate-900/50 border-slate-800/50'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full font-black flex items-center justify-center text-xs" style={{ backgroundColor: COLOR_MAP[safeGameState.colors?.[p.id]] || COLOR_MAP.gray, color: 'white' }}>
                                                {idx + 1}
                                            </div>
                                            <span className="font-bold truncate max-w-[100px]">{p.name}</span>
                                        </div>
                                        <span className="font-black text-xl font-mono">{safeGameState.scores?.[p.id] || 0}</span>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile Controls (Visible on md and below if playing, OR if toggled on desktop) */}
                    {safeGameState.status === 'playing' && amIPlaying && showJoystick && (
                        <div className={`bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-xl flex items-center justify-center flex-col ${showJoystick ? 'flex' : 'md:hidden'}`}>
                            <div className="flex justify-between w-full mb-4 md:hidden">
                                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Controls</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 w-48 h-48">
                                <div />
                                <button onPointerDown={(e) => { e.preventDefault(); handleKeyDown({ key: 'ArrowUp', preventDefault: () => { } }); }} className="bg-slate-800 active:bg-cyan-500/50 rounded-xl border border-slate-700 shadow-lg flex items-center justify-center pb-1 text-2xl text-white">▲</button>
                                <div />
                                <button onPointerDown={(e) => { e.preventDefault(); handleKeyDown({ key: 'ArrowLeft', preventDefault: () => { } }); }} className="bg-slate-800 active:bg-cyan-500/50 rounded-xl border border-slate-700 shadow-lg flex items-center justify-center pr-1 text-2xl text-white">◀</button>
                                <div className="bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center drop-shadow-inner"><div className="w-4 h-4 rounded-full bg-cyan-500/30"></div></div>
                                <button onPointerDown={(e) => { e.preventDefault(); handleKeyDown({ key: 'ArrowRight', preventDefault: () => { } }); }} className="bg-slate-800 active:bg-cyan-500/50 rounded-xl border border-slate-700 shadow-lg flex items-center justify-center pl-1 text-2xl text-white">▶</button>
                                <div />
                                <button onPointerDown={(e) => { e.preventDefault(); handleKeyDown({ key: 'ArrowDown', preventDefault: () => { } }); }} className="bg-slate-800 active:bg-cyan-500/50 rounded-xl border border-slate-700 shadow-lg flex items-center justify-center pt-1 text-2xl text-white">▼</button>
                                <div />
                            </div>

                            <div className="md:hidden mt-4 text-center">
                                <button onClick={() => setShowJoystick(false)} className="text-xs text-slate-500 font-bold hover:text-white transition-colors uppercase border-b border-slate-700 pb-1">Hide Joystick (Use Touch / Swipe manually)</button>
                            </div>
                        </div>
                    )}

                    {/* Floating Toggle button for Mobile if hidden */}
                    {safeGameState.status === 'playing' && amIPlaying && !showJoystick && (
                        <div className="md:hidden w-full flex justify-center mt-2">
                            <button onClick={() => setShowJoystick(true)} className="bg-slate-800 border border-slate-700 text-slate-400 p-3 rounded-xl hover:text-white transition-colors shadow-lg flex items-center gap-2 text-sm font-bold uppercase">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                                Show Joystick
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Game Over Modal */}
            <AnimatePresence>
                {safeGameState.status === 'finished' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-slate-900 border border-slate-700 p-8 rounded-3xl max-w-md w-full text-center shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-cyan-500"></div>

                            <Trophy size={64} className="mx-auto text-yellow-500 mb-6" />
                            <h2 className="text-4xl font-black mb-2 text-white">TIME'S UP!</h2>
                            <p className="text-slate-400 mb-8 text-lg">Winner takes all territory.</p>

                            <div className="bg-slate-950 rounded-2xl p-6 mb-8 border border-slate-800 shadow-inner">
                                <div className="text-sm text-slate-500 font-bold mb-2">CHAMPION</div>
                                <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2">
                                    {safeGameState.players.find(p => p.id === safeGameState.winner)?.name || 'Tie Game'}
                                </div>
                                <div className="text-xl font-bold text-white">
                                    Captured <span className="text-cyan-400">{safeGameState.scores?.[safeGameState.winner] || 0}</span> tiles!
                                </div>
                            </div>

                            <div className="flex gap-4">
                                {isHost ? (
                                    <button onClick={restartGame} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 rounded-xl transition-colors shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                                        PLAY AGAIN
                                    </button>
                                ) : (
                                    <div className="flex-1 bg-slate-800 text-slate-400 font-bold py-4 rounded-xl text-center">
                                        Waiting for Host...
                                    </div>
                                )}
                                <button onClick={leaveRoom} className="px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors border border-slate-700">
                                    <LogOut size={20} />
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}
