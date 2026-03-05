import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Crown, Clock, Trophy, Flame, Zap } from 'lucide-react';
import VFXOverlay from '../components/VFXOverlay';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';

export default function BomberGrid() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();
    const [shake, setShake] = useState(false);
    const [showJoystick, setShowJoystick] = useState(false);

    // Joystick/Keyboard states
    const keys = useRef({});
    const moveIntervalRef = useRef(null);

    const safeGameState = gameState || {
        players: [], status: 'waiting', grid: Array(15).fill(null).map(() => Array(15).fill(0)),
        playersState: {}, colors: {}, history: [], bombs: [], explosions: [], powerups: []
    };

    const isHost = safeGameState.hostId === user?.id;
    const amIPlaying = safeGameState.players.some(p => p.id === user?.id);
    const myState = safeGameState.playersState?.[user?.id];
    const myColor = safeGameState.colors?.[user?.id];

    // VFX Triggers based on history
    useEffect(() => {
        if (!safeGameState.history || safeGameState.history.length === 0) return;
        const lastAction = safeGameState.history[safeGameState.history.length - 1];

        // If an explosion happened, tiny shake
        if (lastAction.type === 'explosion_death') {
            setShake(true); setTimeout(() => setShake(false), 400);
        }
        if (lastAction.type === 'place_bomb' && lastAction.player !== user?.id) {
            // maybe a tiny bump
        }
    }, [safeGameState.history, user?.id]);

    // Keyboard Movement
    useEffect(() => {
        const handleKeyDown = (e) => {
            keys.current[e.key.toLowerCase()] = true;
            if (e.code === 'Space') {
                e.preventDefault();
                handlePlaceBomb();
            }
        };
        const handleKeyUp = (e) => { keys.current[e.key.toLowerCase()] = false; };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const handlePlaceBomb = useCallback(() => {
        if (!amIPlaying || safeGameState.status !== 'playing' || !myState?.isAlive) return;
        socket.emit('placeBomb', { roomCode, userId: user.id });
    }, [amIPlaying, safeGameState.status, myState, roomCode, socket, user?.id]);

    // High frequency physics emit loop for local movement (Client Side Prediction)
    useEffect(() => {
        if (safeGameState.status === 'playing' && amIPlaying && myState?.isAlive) {
            moveIntervalRef.current = setInterval(() => {
                if (!myState) return;

                let dx = 0;
                let dy = 0;

                // Keyboard / Dpad Check
                if (keys.current['arrowup'] || keys.current['w']) dy -= 1;
                if (keys.current['arrowdown'] || keys.current['s']) dy += 1;
                if (keys.current['arrowleft'] || keys.current['a']) dx -= 1;
                if (keys.current['arrowright'] || keys.current['d']) dx += 1;

                if (dx !== 0 || dy !== 0) {
                    // Prevent diagonal movement in grid game for classic feel, or allow it but collision is strict
                    if (Math.abs(dx) > 0 && Math.abs(dy) > 0) {
                        dy = 0; // Bias horizontal if both pushed
                    }

                    const speed = 0.15 * (myState.speed || 1);
                    let newX = myState.x + dx * speed;
                    let newY = myState.y + dy * speed;

                    // Client side collision prediction (prevent walking into walls)
                    const checkX = dx > 0 ? Math.ceil(newX) : Math.floor(newX);
                    const checkY = dy > 0 ? Math.ceil(newY) : Math.floor(newY);

                    // Simple AABB bound checks against grid
                    let canMove = true;
                    if (checkX >= 0 && checkX < 15 && checkY >= 0 && checkY < 15) {
                        const cell = safeGameState.grid[checkY][checkX];
                        if (cell === 1 || cell === 2) {
                            // Wall collision. Snap to grid center of current cell on the blocked axis
                            if (Math.abs(dx) > 0) newX = myState.x; // Blocked horizontally
                            if (Math.abs(dy) > 0) newY = myState.y; // Blocked vertically
                        }

                        // Bomb Collision (can't walk through bombs unless you are already on it)
                        const bombOnTarget = safeGameState.bombs?.find(b => b.x === checkX && b.y === checkY);
                        const amIOnBomb = safeGameState.bombs?.find(b => b.x === Math.round(myState.x) && b.y === Math.round(myState.y));
                        if (bombOnTarget && !amIOnBomb) {
                            if (Math.abs(dx) > 0) newX = myState.x;
                            if (Math.abs(dy) > 0) newY = myState.y;
                        }
                    } else {
                        canMove = false; // Bounds
                    }

                    if (canMove) {
                        // Constrain
                        newX = Math.max(0, Math.min(14, newX));
                        newY = Math.max(0, Math.min(14, newY));

                        socket.emit('moveBomber', { roomCode, userId: user.id, x: newX, y: newY });
                    }
                }
            }, 50); // 20 times a sec emit
        }

        return () => {
            if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
        };
    }, [safeGameState.status, amIPlaying, myState?.isAlive, myState?.x, myState?.y, myState?.speed, roomCode, user?.id, socket, safeGameState.grid, safeGameState.bombs]);

    const startGame = () => {
        if (isHost && safeGameState.status === 'waiting') {
            socket.emit('startGame', { roomCode, userId: user?.id });
        }
    };

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    const restartGame = () => {
        socket.emit('restartGame', { roomCode, userId: user?.id });
    };

    // Calculate Leaderboard
    const sortedPlayers = [...safeGameState.players].sort((a, b) => {
        const scoreA = safeGameState.playersState?.[a.id]?.kills || 0;
        const scoreB = safeGameState.playersState?.[b.id]?.kills || 0;
        return scoreB - scoreA;
    });

    const getCellColor = (r, c) => {
        const val = safeGameState.grid[r] && safeGameState.grid[r][c];
        if (val === 1) return 'bg-slate-700 shadow-[inset_0_0_15px_rgba(0,0,0,0.8)] border border-slate-900'; // Solid Wall
        if (val === 2) return 'bg-amber-800/80 shadow-[inset_0_0_20px_rgba(0,0,0,0.6)] border-2 border-amber-900/50'; // Destructible Crate
        return 'bg-slate-800/30 border border-slate-700/20'; // Floor
    };

    return (
        <div className="fixed inset-0 bg-slate-950 text-white font-sans overflow-hidden touch-none select-none">
            {/* Background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>

            <EmojiOverlay />
            <VFXOverlay />
            <VoiceChat />

            {/* THE ARENA (15x15 GRID) */}
            <motion.div
                animate={shake ? { x: [-10, 10, -10, 10, 0], y: [-5, 5, -5, 5, 0] } : {}}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 z-0 flex items-center justify-center pt-20 pb-40 md:py-20 px-4 pointer-events-none"
            >
                <div className="relative w-full max-w-2xl aspect-square bg-slate-900 shadow-[0_0_50px_rgba(0,0,0,0.8)] border-4 border-slate-800 rounded-xl overflow-hidden pointer-events-auto">

                    {/* Grid rendering */}
                    <div className="absolute inset-0 grid grid-cols-15 grid-rows-15">
                        {safeGameState.grid.map((row, r) => (
                            row.map((cell, c) => (
                                <div key={`cell-${r}-${c}`} className={`w-full h-full relative ${getCellColor(r, c)}`}>
                                    {cell === 1 && (
                                        <div className="absolute inset-2 bg-slate-800/50 rounded-sm"></div>
                                    )}
                                    {cell === 2 && (
                                        <>
                                            <div className="absolute inset-0 border-t-2 border-l-2 border-amber-700/30"></div>
                                            <div className="absolute top-1 bottom-1 left-1/2 w-0.5 bg-amber-900/40 -translate-x-1/2"></div>
                                            <div className="absolute left-1 right-1 top-1/2 h-0.5 bg-amber-900/40 -translate-y-1/2"></div>
                                        </>
                                    )}
                                </div>
                            ))
                        ))}
                    </div>

                    {/* Powerups */}
                    {safeGameState.powerups?.map((pu) => (
                        <div key={`pu-${pu.id}`}
                            className="absolute w-[6.66%] h-[6.66%] flex items-center justify-center animate-bounce z-10"
                            style={{ left: `${pu.x * 6.66}%`, top: `${pu.y * 6.66}%` }}
                        >
                            <div className="bg-slate-800 p-1 rounded-full border-2 border-white shadow-[0_0_10px_white]">
                                {pu.type === 'bomb' && <div className="w-4 h-4 rounded-full bg-black border-2 border-slate-600"></div>}
                                {pu.type === 'fire' && <Flame size={16} className="text-red-500 fill-red-500" />}
                                {pu.type === 'speed' && <Zap size={16} className="text-yellow-400 fill-yellow-400" />}
                            </div>
                        </div>
                    ))}

                    {/* Bombs */}
                    {safeGameState.bombs?.map((b) => (
                        <div key={`bomb-${b.id}`}
                            className="absolute w-[6.66%] h-[6.66%] flex items-center justify-center z-10"
                            style={{ left: `${b.x * 6.66}%`, top: `${b.y * 6.66}%` }}
                        >
                            <div className="relative w-3/4 h-3/4 bg-slate-900 rounded-full shadow-[inset_-3px_-3px_10px_rgba(0,0,0,0.8),_0_0_10px_rgba(239,68,68,0.5)] border-2 border-slate-700 animate-[pulse_0.5s_ease-in-out_infinite]">
                                {/* Bomb details */}
                                <div className="absolute -top-1 left-1/2 w-1 h-2 bg-yellow-600 -translate-x-1/2"></div>
                                <div className="absolute -top-2 left-1/2 w-2 h-2 rounded-full bg-orange-500 animate-[ping_0.5s_ease-in-out_infinite] -translate-x-1/2"></div>
                            </div>
                        </div>
                    ))}

                    {/* Explosions */}
                    {safeGameState.explosions?.map((ex) => (
                        <div key={`exp-${ex.id}`}
                            className="absolute w-[6.66%] h-[6.66%] bg-gradient-to-r from-red-500 via-yellow-400 to-orange-500 opacity-90 z-20"
                            style={{
                                left: `${ex.x * 6.66}%`, top: `${ex.y * 6.66}%`,
                                boxShadow: '0 0 20px #EAB308, inset 0 0 10px #EF4444'
                            }}
                        />
                    ))}

                    {/* Players */}
                    <AnimatePresence>
                        {safeGameState.players.map(p => {
                            const pState = safeGameState.playersState?.[p.id];
                            if (!pState || !pState.isAlive) return null;

                            const pColor = safeGameState.colors?.[p.id] || '#fff';

                            return (
                                <motion.div
                                    key={`player-${p.id}`}
                                    layout
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                    className="absolute w-[6.66%] h-[6.66%] flex flex-col items-center justify-center z-30 pointer-events-none"
                                    style={{
                                        left: `${pState.x * 6.66}%`,
                                        top: `${pState.y * 6.66}%`,
                                    }}
                                >
                                    <div className="relative w-3/4 h-3/4 rounded-md border-2 border-white/50 backdrop-blur-sm shadow-xl flex items-center justify-center transform -translate-y-1"
                                        style={{
                                            backgroundColor: pColor,
                                            boxShadow: `0 5px 15px rgba(0,0,0,0.5), inset 0 0 10px rgba(255,255,255,0.3)`
                                        }}>
                                        {/* Little eyes for character */}
                                        <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 bg-white rounded-full"></div>
                                        <div className="absolute top-1/4 right-1/4 w-1.5 h-1.5 bg-white rounded-full"></div>
                                    </div>

                                    <span className="absolute -top-4 font-black text-[8px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] truncate max-w-[50px] bg-black/50 px-1 rounded">
                                        {p.name}
                                    </span>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* HUD / UI LAYER */}
            <div className="absolute inset-0 z-40 flex flex-col p-4 pointer-events-none">
                {/* Header */}
                <div className="flex items-start justify-between pointer-events-auto">
                    <button onClick={leaveRoom} className="p-3 bg-slate-900/80 text-white hover:bg-slate-800 rounded-xl transition-colors shadow-lg border border-slate-700 backdrop-blur-md">
                        <LogOut size={20} />
                    </button>

                    <div className="bg-slate-900/80 px-6 py-2 rounded-3xl border border-slate-700/50 shadow-2xl backdrop-blur-md flex flex-col items-center">
                        <div className="text-xs text-red-500 font-black tracking-widest uppercase mb-0.5 drop-shadow-md">BOMBER GRID</div>
                        <div className="text-3xl font-black text-white tracking-wider flex items-center justify-center gap-2">
                            <Clock size={24} className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-red-400"} />
                            <span className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : ""}>{Math.floor((safeGameState.timeLeft || 0) / 60)}:{(safeGameState.timeLeft % 60 || 0).toString().padStart(2, '0')}</span>
                        </div>
                    </div>

                    {/* Leaderboard */}
                    <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md w-32 sm:w-48 hidden sm:block">
                        <h3 className="font-black text-slate-400 mb-1 text-xs"><Trophy size={12} className="inline mr-1 text-yellow-500 -mt-0.5" /> LEADERBOARD</h3>
                        <div className="space-y-1">
                            {sortedPlayers.slice(0, 3).map((p, idx) => (
                                <div key={p.id} className="flex items-center justify-between text-xs">
                                    <span className="font-bold truncate max-w-[60px] sm:max-w-[100px]" style={{ color: safeGameState.colors?.[p.id] || '#fff' }}>{p.name}</span>
                                    <span className="font-black font-mono text-white">{safeGameState.playersState?.[p.id]?.kills || 0} K</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Local Player Stats HUD */}
                {amIPlaying && myState?.isAlive && (
                    <div className="absolute bottom-4 left-4 bg-slate-900/80 p-3 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-md flex gap-4 items-center pointer-events-auto sm:scale-100 scale-75 origin-bottom-left">
                        <div className="flex gap-4">
                            <div className={`p-2 border rounded-xl shadow-inner bg-slate-800 border-slate-700 text-slate-300 flex items-center gap-2`}>
                                <div className="w-4 h-4 rounded-full bg-black border border-slate-600"></div> x {myState.maxBombs}
                            </div>
                            <div className={`p-2 border rounded-xl shadow-inner bg-slate-800 border-slate-700 text-red-400 flex items-center gap-2`}>
                                <Flame size={16} fill="currentColor" /> +{myState.blastRadius}
                            </div>
                            <div className={`p-2 border rounded-xl shadow-inner bg-slate-800 border-slate-700 text-yellow-400 flex items-center gap-2`}>
                                <Zap size={16} fill="currentColor" /> {myState.speed.toFixed(1)}x
                            </div>
                        </div>
                    </div>
                )}

                {/* Joystick & Action Button for Desktop & Built-in Mobile Controls */}
                <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto">
                    {amIPlaying && safeGameState.status === 'playing' && (
                        <button
                            onClick={() => setShowJoystick(!showJoystick)}
                            className={`p-3 rounded-xl transition-colors shadow-lg border hidden md:flex items-center justify-center ${showJoystick ? 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                            title="Toggle On-Screen Joystick"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                    )}

                    {safeGameState.status === 'playing' && amIPlaying && myState?.isAlive && showJoystick && (
                        <div className={`flex items-end gap-4 origin-bottom-right scale-75 sm:scale-100 ${showJoystick ? 'flex' : 'md:hidden'}`}>
                            {/* BOMB BUTTON */}
                            <button
                                onPointerDown={(e) => { e.preventDefault(); handlePlaceBomb(); }}
                                className="w-20 h-20 rounded-full bg-red-600 border-4 border-red-800 text-white font-black text-xl shadow-[0_10px_0_#991B1B,0_15px_20px_rgba(0,0,0,0.5)] active:shadow-[0_0px_0_#991B1B,0_5px_10px_rgba(0,0,0,0.5)] active:translate-y-2 transition-all flex items-center justify-center"
                            >
                                BOMB
                            </button>

                            {/* D-PAD */}
                            <div className={`bg-slate-900/80 p-4 rounded-[2rem] border border-slate-800 shadow-2xl flex items-center justify-center flex-col`}>
                                <div className="grid grid-cols-3 gap-2 w-40 h-40">
                                    <div />
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowup'] = true; }} onPointerUp={() => keys.current['arrowup'] = false} onPointerLeave={() => keys.current['arrowup'] = false} className="bg-slate-800 active:bg-red-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pb-1 text-2xl text-white">▲</button>
                                    <div />
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowleft'] = true; }} onPointerUp={() => keys.current['arrowleft'] = false} onPointerLeave={() => keys.current['arrowleft'] = false} className="bg-slate-800 active:bg-red-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pr-1 text-2xl text-white">◀</button>
                                    <div className="bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center drop-shadow-inner"><div className="w-4 h-4 rounded-full bg-red-500/30"></div></div>
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowright'] = true; }} onPointerUp={() => keys.current['arrowright'] = false} onPointerLeave={() => keys.current['arrowright'] = false} className="bg-slate-800 active:bg-red-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pl-1 text-2xl text-white">▶</button>
                                    <div />
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowdown'] = true; }} onPointerUp={() => keys.current['arrowdown'] = false} onPointerLeave={() => keys.current['arrowdown'] = false} className="bg-slate-800 active:bg-red-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pt-1 text-2xl text-white">▼</button>
                                    <div />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Floating Toggle button for Mobile if hidden */}
                    {safeGameState.status === 'playing' && amIPlaying && !showJoystick && myState?.isAlive && (
                        <div className="md:hidden">
                            <button onClick={(e) => { e.preventDefault(); setShowJoystick(true); }} className="bg-slate-800/80 backdrop-blur-md border border-slate-700 text-slate-400 p-4 rounded-2xl shadow-2xl">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                        </div>
                    )}
                </div>

                {/* Status Overlay */}
                {safeGameState.status === 'waiting' && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-auto">
                        <div className="bg-slate-950/80 p-12 rounded-[3rem] backdrop-blur-xl border border-slate-800 flex flex-col items-center text-center max-w-lg shadow-[0_0_100px_rgba(239,68,68,0.15)]">
                            <div className="w-16 h-16 rounded-full bg-black border-4 border-slate-700 mb-6 animate-pulse relative">
                                <div className="absolute -top-3 left-1/2 w-1 h-3 bg-yellow-600 -translate-x-1/2"></div>
                                <div className="absolute -top-4 left-1/2 w-3 h-3 rounded-full bg-orange-500 animate-[ping_0.5s_ease-in-out_infinite] -translate-x-1/2"></div>
                            </div>
                            <h2 className="text-3xl font-black mb-3 text-white tracking-wider">BOMBER GRID</h2>
                            <p className="text-slate-400 mb-2">Move with <kbd className="bg-slate-800 px-2 rounded">W</kbd><kbd className="bg-slate-800 px-2 rounded">A</kbd><kbd className="bg-slate-800 px-2 rounded">S</kbd><kbd className="bg-slate-800 px-2 rounded">D</kbd> or Joystick.</p>
                            <p className="text-slate-400 mb-8 border-b border-slate-800 pb-4">Press <kbd className="bg-slate-800 px-4 rounded font-black tracking-widest text-red-400">SPACE</kbd> or use the BOMB map button to drop explosives. Break crates to find powerups.</p>
                            {isHost ? (
                                <button onClick={startGame} className="btn-neon bg-red-500/20 text-red-400 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.4)] px-10 py-4 rounded-2xl font-black text-xl hover:bg-red-500 hover:text-white transition-all">
                                    START MATCH
                                </button>
                            ) : (
                                <p className="text-red-400 font-bold animate-pulse text-xl">Waiting for host to start...</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Dead Screen */}
                {!myState?.isAlive && safeGameState.status === 'playing' && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center top-[25%] pointer-events-none">
                        <div className="bg-slate-900/90 p-8 rounded-[3rem] border-4 border-red-500/50 backdrop-blur-xl text-center shadow-[0_0_100px_rgba(239,68,68,0.3)]">
                            <h2 className="text-5xl font-black text-red-500 mb-2 drop-shadow-md tracking-widest">BLOWN UP!</h2>
                            <p className="text-white font-bold tracking-widest uppercase">Spectating Match</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Game Over Modal */}
            <AnimatePresence>
                {safeGameState.status === 'finished' && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 pointer-events-auto"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-slate-900 border border-slate-700 p-8 rounded-[2.5rem] max-w-md w-full text-center shadow-[0_0_100px_rgba(239,68,68,0.2)] relative overflow-hidden"
                        >
                            <Crown size={64} className="mx-auto text-yellow-500 mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
                            <h2 className="text-4xl font-black mb-2 text-white uppercase tracking-wider">MATCH OVER</h2>
                            <p className="text-slate-400 mb-8 text-lg">The dust has settled.</p>

                            <div className="bg-slate-950 rounded-3xl p-6 mb-8 border border-slate-800 shadow-inner">
                                <div className="text-sm text-slate-500 font-bold mb-2 tracking-widest">MASTER BOMBER</div>
                                <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-500 mb-4 truncate drop-shadow-md">
                                    {safeGameState.players.find(p => p.id === safeGameState.winner)?.name || 'IT WAS A TIE'}
                                </div>
                                <div className="flex justify-center gap-4">
                                    <div className="bg-slate-900 px-4 py-2 border border-slate-800 rounded-xl">
                                        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Kills</div>
                                        <div className="text-xl font-bold text-white">{safeGameState.playersState?.[safeGameState.winner]?.kills || 0}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                {isHost ? (
                                    <button onClick={restartGame} className="flex-1 bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 text-white font-black py-4 rounded-xl transition-all shadow-[0_0_30px_rgba(239,68,68,0.5)] uppercase tracking-widest border border-red-400">
                                        REMATCH
                                    </button>
                                ) : (
                                    <div className="flex-1 bg-slate-800 text-slate-400 font-bold py-4 rounded-xl text-center border border-slate-700 uppercase tracking-widest">
                                        Waiting for Host
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
