import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Crown, Clock, Trophy, Target, Coins, ShieldAlert, Crosshair } from 'lucide-react';
import VFXOverlay from '../components/VFXOverlay';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';

export default function CoreDefense() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();
    const [shake, setShake] = useState(false);
    const [showJoystick, setShowJoystick] = useState(false);
    const [isBuilding, setIsBuilding] = useState(false);

    const keys = useRef({});
    const moveIntervalRef = useRef(null);
    const shootIntervalRef = useRef(null);
    const isShootingAuto = useRef(false);

    const safeGameState = gameState || {
        players: [], status: 'waiting', coreHp: 1000,
        enemies: [], bullets: [], towers: [], lasers: [],
        playersState: {}, colors: {}, history: []
    };

    const isHost = safeGameState.hostId === user?.id;
    const amIPlaying = safeGameState.players.some(p => p.id === user?.id);
    const myState = safeGameState.playersState?.[user?.id];
    const myColor = safeGameState.colors?.[user?.id];

    // VFX Triggers
    useEffect(() => {
        if (!safeGameState.history || safeGameState.history.length === 0) return;
        const lastAction = safeGameState.history[safeGameState.history.length - 1];
        if (lastAction.type === 'core_damage') {
            setShake(true); setTimeout(() => setShake(false), 200);
        }
    }, [safeGameState.history]);

    // Keyboard Input
    useEffect(() => {
        const handleKeyDown = (e) => {
            keys.current[e.key.toLowerCase()] = true;
            if (e.code === 'Space') {
                e.preventDefault();
                isShootingAuto.current = true;
            }
            if (e.code === 'KeyB') {
                handleBuildTower();
            }
        };
        const handleKeyUp = (e) => {
            keys.current[e.key.toLowerCase()] = false;
            if (e.code === 'Space') {
                isShootingAuto.current = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const handleBuildTower = useCallback(() => {
        if (!amIPlaying || safeGameState.status !== 'playing' || !myState?.isAlive) return;
        setIsBuilding(true);
        setTimeout(() => setIsBuilding(false), 200);
        socket.emit('buildTower', { roomCode, userId: user.id });
    }, [amIPlaying, safeGameState.status, myState, roomCode, socket, user?.id]);

    // Local Movement & Auto-Shoot Loop
    useEffect(() => {
        if (safeGameState.status === 'playing' && amIPlaying && myState?.isAlive) {
            moveIntervalRef.current = setInterval(() => {
                if (!myState) return;
                let dx = 0;
                let dy = 0;

                if (keys.current['arrowup'] || keys.current['w']) dy -= 1;
                if (keys.current['arrowdown'] || keys.current['s']) dy += 1;
                if (keys.current['arrowleft'] || keys.current['a']) dx -= 1;
                if (keys.current['arrowright'] || keys.current['d']) dx += 1;

                if (dx !== 0 || dy !== 0) {
                    const len = Math.sqrt(dx * dx + dy * dy);
                    dx /= len; dy /= len;

                    const speed = 1.0;
                    let newX = Math.max(0, Math.min(100, myState.x + dx * speed));
                    let newY = Math.max(0, Math.min(100, myState.y + dy * speed));

                    socket.emit('moveTD', { roomCode, userId: user.id, x: newX, y: newY });
                }
            }, 50);

            shootIntervalRef.current = setInterval(() => {
                if (isShootingAuto.current && myState) {
                    // Find closest enemy to shoot
                    let closest = null;
                    let minDist = Infinity;
                    for (const e of safeGameState.enemies) {
                        const dx = e.x - myState.x;
                        const dy = e.y - myState.y;
                        const dist = dx * dx + dy * dy;
                        if (dist < minDist) { minDist = dist; closest = e; }
                    }

                    let angle;
                    if (closest) {
                        angle = Math.atan2(closest.y - myState.y, closest.x - myState.x);
                    } else {
                        // Just shoot right if no enemies
                        angle = 0;
                    }

                    socket.emit('shootTD', { roomCode, userId: user.id, angle });
                }
            }, 200); // Shoot every 200ms
        }

        return () => {
            if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
            if (shootIntervalRef.current) clearInterval(shootIntervalRef.current);
        };
    }, [safeGameState.status, amIPlaying, myState?.isAlive, myState?.x, myState?.y, roomCode, user?.id, socket, safeGameState.enemies]);

    // Arena Click to Shoot
    const handleArenaClick = (e) => {
        if (!amIPlaying || safeGameState.status !== 'playing' || !myState?.isAlive) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * 100;
        const clickY = ((e.clientY - rect.top) / rect.height) * 100;

        const angle = Math.atan2(clickY - myState.y, clickX - myState.x);
        socket.emit('shootTD', { roomCode, userId: user.id, angle });
    };

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

    const sortedPlayers = [...safeGameState.players].sort((a, b) => {
        const scoreA = safeGameState.playersState?.[a.id]?.kills || 0;
        const scoreB = safeGameState.playersState?.[b.id]?.kills || 0;
        return scoreB - scoreA;
    });

    const getCoreColor = () => {
        const hpPercent = safeGameState.coreHp / 1000;
        if (hpPercent > 0.6) return 'rgba(16, 185, 129, 0.8)'; // Green
        if (hpPercent > 0.3) return 'rgba(245, 158, 11, 0.8)'; // Amber
        return 'rgba(239, 68, 68, 0.9)'; // Red
    };

    return (
        <div className="fixed inset-0 bg-slate-950 text-white font-sans overflow-hidden touch-none select-none">
            {/* Dark Sci-Fi Background */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-black"></div>

            <EmojiOverlay />
            <VFXOverlay />
            <VoiceChat />

            {/* THE ARENA */}
            <motion.div
                animate={shake ? { x: [-15, 15, -15, 15, 0], y: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-0 flex items-center justify-center pt-20 pb-40 md:py-20 px-4 pointer-events-none"
            >
                <div
                    className="relative w-full max-w-3xl aspect-square bg-slate-900 shadow-[0_0_80px_rgba(79,70,229,0.15)] border border-indigo-500/30 rounded-full overflow-hidden pointer-events-auto cursor-crosshair"
                    onPointerDown={handleArenaClick}
                    style={{
                        backgroundImage: `linear-gradient(rgba(79, 70, 229, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(79, 70, 229, 0.1) 1px, transparent 1px)`,
                        backgroundSize: '10% 10%'
                    }}
                >

                    {/* The Core */}
                    <div
                        className="absolute w-[20%] h-[20%] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full z-10 transition-colors duration-300 flex items-center justify-center shadow-2xl"
                        style={{ backgroundColor: getCoreColor(), boxShadow: `0 0 50px ${getCoreColor()}, inset 0 0 20px rgba(255,255,255,0.5)` }}
                    >
                        <div className="w-[80%] h-[80%] rounded-full border-4 border-white/30 flex justify-center items-center">
                            <div className="w-[50%] h-[50%] bg-white rounded-full animate-pulse shadow-[0_0_20px_white]"></div>
                        </div>
                    </div>

                    {/* Turrets */}
                    {safeGameState.towers?.map(t => (
                        <div key={`t-${t.id}`}
                            className="absolute w-[4%] h-[4%] bg-indigo-500 rounded-sm z-20 shadow-[0_0_15px_rgba(99,102,241,0.8)] border border-white"
                            style={{ left: `${t.x}%`, top: `${t.y}%`, transform: 'translate(-50%, -50%)' }}
                        >
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white rounded-full"></div>
                        </div>
                    ))}

                    {/* Enemies */}
                    {safeGameState.enemies?.map(e => (
                        <div key={`e-${e.id}`}
                            className="absolute w-[3%] h-[3%] z-30 flex items-center justify-center transition-all duration-[60ms] ease-linear"
                            style={{ left: `${e.x}%`, top: `${e.y}%`, transform: 'translate(-50%, -50%)' }}
                        >
                            <div className="w-full h-full bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.8)] border border-red-400"></div>
                            {/* HP Bar */}
                            <div className="absolute -top-2 w-6 h-1 bg-slate-800 rounded overflow-hidden">
                                <div className="h-full bg-red-500" style={{ width: `${(e.hp / e.maxHp) * 100}%` }}></div>
                            </div>
                        </div>
                    ))}

                    {/* Bullets */}
                    {safeGameState.bullets?.map(b => (
                        <div key={`b-${b.id}`}
                            className="absolute w-[1.5%] h-[1.5%] bg-cyan-300 rounded-full z-40 shadow-[0_0_8px_rgba(103,232,249,1)]"
                            style={{ left: `${b.x}%`, top: `${b.y}%`, transform: 'translate(-50%, -50%)' }}
                        />
                    ))}

                    {/* Instant Lasers (ephemeral) */}
                    <svg className="absolute inset-0 w-full h-full z-25 pointer-events-none">
                        {safeGameState.lasers?.map(l => (
                            <line key={`l-${l.id}`}
                                x1={`${l.startX}%`} y1={`${l.startY}%`}
                                x2={`${l.endX}%`} y2={`${l.endY}%`}
                                stroke="#818CF8" strokeWidth="3" strokeLinecap="round"
                                opacity="0.8" className="animate-[pulse_0.1s_ease-out]"
                            />
                        ))}
                    </svg>

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
                                    transition={{ duration: 0.05, ease: "linear" }}
                                    className="absolute w-[5%] h-[5%] z-40 flex flex-col items-center justify-center pointer-events-none"
                                    style={{
                                        left: `${pState.x}%`,
                                        top: `${pState.y}%`,
                                        transform: 'translate(-50%, -50%)' // Move layout translation to style
                                    }}
                                >
                                    <div className="relative w-full h-full rounded shadow-[0_0_15px_rgba(255,255,255,0.4)] border-2 border-white/80"
                                        style={{ backgroundColor: pColor }}>
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] bg-black/30 rounded-full"></div>
                                    </div>

                                    <span className="absolute -top-5 font-black text-[10px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] truncate max-w-[60px] bg-black/50 px-1 rounded">
                                        {p.name}
                                    </span>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* HUD / UI LAYER */}
            <div className="absolute inset-0 z-50 flex flex-col p-4 pointer-events-none">

                {/* Top Info Bar */}
                <div className="flex items-start justify-between pointer-events-auto">
                    <button onClick={leaveRoom} className="p-3 bg-slate-900/80 text-white hover:bg-slate-800 rounded-xl transition-colors shadow-lg border border-slate-700 backdrop-blur-md">
                        <LogOut size={20} />
                    </button>

                    <div className="flex flex-col items-center gap-2">
                        {/* Core Health Bar */}
                        <div className="bg-slate-900/80 px-4 py-3 rounded-2xl border border-slate-700/50 shadow-2xl backdrop-blur-md w-64 md:w-96">
                            <div className="flex justify-between items-center mb-1 drop-shadow-md">
                                <span className="text-xs font-black tracking-widest text-indigo-400">CORE INTEGRITY</span>
                                <span className="text-xs font-black text-white">{Math.max(0, safeGameState.coreHp)} / 1000</span>
                            </div>
                            <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 shadow-inner">
                                <div className="h-full transition-all duration-300" style={{ width: `${Math.max(0, (safeGameState.coreHp / 1000) * 100)}%`, backgroundColor: getCoreColor() }}></div>
                            </div>
                        </div>

                        {/* Timer */}
                        <div className="bg-slate-900/80 px-6 py-1 rounded-full border border-slate-700/50 shadow-lg backdrop-blur-md flex items-center justify-center gap-2">
                            <Clock size={16} className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-amber-400"} />
                            <span className={`text-xl font-black ${safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"}`}>{Math.floor((safeGameState.timeLeft || 0) / 60)}:{(safeGameState.timeLeft % 60 || 0).toString().padStart(2, '0')}</span>
                        </div>
                    </div>

                    {/* Leaderboard */}
                    <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md w-32 sm:w-48 hidden sm:block">
                        <h3 className="font-black text-slate-400 mb-1 text-xs"><Trophy size={12} className="inline mr-1 text-yellow-500 -mt-0.5" /> TEAM STATS</h3>
                        <div className="space-y-1">
                            {sortedPlayers.slice(0, 4).map((p) => (
                                <div key={p.id} className="flex items-center justify-between text-xs">
                                    <span className="font-bold truncate max-w-[60px] sm:max-w-[100px]" style={{ color: safeGameState.colors?.[p.id] || '#fff' }}>{p.name}</span>
                                    <span className="font-black font-mono text-white">{safeGameState.playersState?.[p.id]?.kills || 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Local Player Stats & Controls */}
                {amIPlaying && myState?.isAlive && (
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-auto">

                        {/* Gold & Quick Stats */}
                        <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-700 shadow-2xl backdrop-blur-md flex items-center gap-4">
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Gold</span>
                                <span className="text-2xl font-black text-yellow-400 flex items-center gap-1"><Coins size={18} /> {myState.gold}</span>
                            </div>
                            <div className="h-10 w-px bg-slate-700"></div>
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Kills</span>
                                <span className="text-xl font-black text-white flex items-center gap-1"><Target size={16} className="text-red-400" /> {myState.kills}</span>
                            </div>
                        </div>

                        {/* Controls (Desktop toggle & Mobile layout) */}
                        <div className="flex gap-2">
                            {/* Build Tower Button */}
                            {safeGameState.status === 'playing' && (
                                <button
                                    onClick={handleBuildTower}
                                    disabled={myState.gold < 50}
                                    className={`relative px-6 py-4 rounded-2xl font-black text-lg transition-all border-b-4 flex items-center gap-2 ${myState.gold >= 50 ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-800 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] active:border-b-0 active:translate-y-1' : 'bg-slate-800 border-slate-900 text-slate-500 opacity-80 cursor-not-allowed'}`}
                                >
                                    <ShieldAlert size={24} className={isBuilding ? "animate-spin" : ""} />
                                    <span>BUILD <span className="text-xs text-indigo-300 ml-1 ml-1">$50</span></span>
                                </button>
                            )}

                            {/* Joystick Toggle */}
                            {safeGameState.status === 'playing' && (
                                <button
                                    onClick={() => setShowJoystick(!showJoystick)}
                                    className={`p-4 rounded-2xl transition-colors shadow-lg border hidden md:flex items-center justify-center ${showJoystick ? 'bg-cyan-600 text-white border-cyan-500 shadow-[0_0_15px_rgba(8,145,178,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                                </button>
                            )}
                        </div>

                        {/* Joystick / Mobile Controls */}
                        {safeGameState.status === 'playing' && showJoystick && (
                            <div className={`absolute bottom-[110%] right-0 md:static flex items-end gap-4 origin-bottom-right scale-75 sm:scale-100`}>
                                {/* Auto-Fire Button */}
                                <button
                                    onPointerDown={(e) => { e.preventDefault(); isShootingAuto.current = true; }}
                                    onPointerUp={(e) => { e.preventDefault(); isShootingAuto.current = false; }}
                                    onPointerLeave={(e) => { e.preventDefault(); isShootingAuto.current = false; }}
                                    className="w-20 h-20 rounded-full bg-cyan-600 border-4 border-cyan-800 text-white font-black shadow-[0_10px_0_#155e75,0_15px_20px_rgba(0,0,0,0.5)] active:shadow-[0_0px_0_#155e75,0_5px_10px_rgba(0,0,0,0.5)] active:translate-y-2 transition-all flex items-center justify-center"
                                >
                                    <Crosshair size={32} />
                                </button>

                                {/* D-PAD */}
                                <div className={`bg-slate-900/80 p-4 rounded-[2rem] border border-slate-800 shadow-2xl flex items-center justify-center flex-col`}>
                                    <div className="grid grid-cols-3 gap-2 w-40 h-40">
                                        <div />
                                        <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowup'] = true; }} onPointerUp={() => keys.current['arrowup'] = false} onPointerLeave={() => keys.current['arrowup'] = false} className="bg-slate-800 active:bg-cyan-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pb-1 text-2xl text-white">▲</button>
                                        <div />
                                        <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowleft'] = true; }} onPointerUp={() => keys.current['arrowleft'] = false} onPointerLeave={() => keys.current['arrowleft'] = false} className="bg-slate-800 active:bg-cyan-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pr-1 text-2xl text-white">◀</button>
                                        <div className="bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center drop-shadow-inner"><div className="w-4 h-4 rounded-full bg-cyan-500/30"></div></div>
                                        <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowright'] = true; }} onPointerUp={() => keys.current['arrowright'] = false} onPointerLeave={() => keys.current['arrowright'] = false} className="bg-slate-800 active:bg-cyan-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pl-1 text-2xl text-white">▶</button>
                                        <div />
                                        <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowdown'] = true; }} onPointerUp={() => keys.current['arrowdown'] = false} onPointerLeave={() => keys.current['arrowdown'] = false} className="bg-slate-800 active:bg-cyan-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pt-1 text-2xl text-white">▼</button>
                                        <div />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Mobile Toggle Button */}
                        {safeGameState.status === 'playing' && !showJoystick && (
                            <div className="md:hidden absolute bottom-16 right-0">
                                <button onClick={(e) => { e.preventDefault(); setShowJoystick(true); }} className="bg-slate-800/80 backdrop-blur-md border border-slate-700 text-slate-400 p-4 rounded-2xl shadow-2xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Status Overlay */}
                {safeGameState.status === 'waiting' && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-auto">
                        <div className="bg-slate-950/90 p-12 rounded-[3rem] backdrop-blur-xl border border-indigo-500/30 flex flex-col items-center text-center max-w-lg shadow-[0_0_100px_rgba(79,70,229,0.2)]">
                            <ShieldAlert size={64} className="text-indigo-400 mb-6 drop-shadow-[0_0_15px_rgba(99,102,241,0.6)]" />
                            <h2 className="text-4xl font-black mb-3 text-white tracking-widest uppercase">CORE DEFENSE</h2>
                            <p className="text-slate-400 mb-6 text-sm">Rally your team. Protect the Core.</p>

                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-left w-full mb-8">
                                <div className="space-y-3 text-sm text-slate-300">
                                    <div className="flex gap-3"><span className="text-cyan-400 font-bold w-16">MOVE</span> <kbd className="bg-slate-800 px-2 rounded">W</kbd><kbd className="bg-slate-800 px-2 rounded">A</kbd><kbd className="bg-slate-800 px-2 rounded">S</kbd><kbd className="bg-slate-800 px-2 rounded">D</kbd></div>
                                    <div className="flex gap-3"><span className="text-cyan-400 font-bold w-16">SHOOT</span> <span>Click in Arena or hold <kbd className="bg-slate-800 px-2 rounded text-xs">SPACE</kbd></span></div>
                                    <div className="flex gap-3 items-center"><span className="text-indigo-400 font-bold w-16">BUILD</span> <span>Press <kbd className="bg-slate-800 px-2 rounded text-xs">B</kbd> or UI Button ($50)</span></div>
                                </div>
                            </div>

                            {isHost ? (
                                <button onClick={startGame} className="btn-neon bg-indigo-500/20 text-indigo-400 border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.4)] px-10 py-4 rounded-2xl font-black text-xl hover:bg-indigo-500 hover:text-white transition-all w-full">
                                    START PROTOCOL
                                </button>
                            ) : (
                                <p className="text-indigo-400 font-bold animate-pulse text-lg tracking-widest">AWAITING HOST</p>
                            )}
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
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 pointer-events-auto"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-slate-900 border border-slate-700 p-8 rounded-[2.5rem] max-w-md w-full text-center shadow-[0_0_100px_rgba(99,102,241,0.2)]"
                        >
                            {safeGameState.winner === 'Enemies' ? (
                                <div className="text-red-500 mb-6 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                </div>
                            ) : (
                                <Crown size={64} className="mx-auto text-yellow-500 mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
                            )}

                            <h2 className={`text-4xl font-black mb-2 uppercase tracking-wider ${safeGameState.winner === 'Enemies' ? 'text-red-500' : 'text-white'}`}>
                                {safeGameState.winner === 'Enemies' ? 'CORE COMPROMISED' : 'SURVIVAL SECURED'}
                            </h2>
                            <p className="text-slate-400 mb-8 text-lg">{safeGameState.winner === 'Enemies' ? 'The hordes breached the perimeter.' : 'You held the line until backup arrived.'}</p>

                            <div className="bg-slate-950 rounded-3xl p-6 mb-8 border border-slate-800 shadow-inner">
                                <div className="text-sm text-slate-500 font-bold mb-2 tracking-widest">MVP OF THE ROUND</div>
                                <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-4 truncate drop-shadow-md">
                                    {safeGameState.players.find(p => p.id === safeGameState.winner)?.name || 'THE HORDE'}
                                </div>
                            </div>

                            <div className="flex gap-4">
                                {isHost ? (
                                    <button onClick={restartGame} className="flex-1 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-400 hover:to-indigo-600 text-white font-black py-4 rounded-xl transition-all shadow-[0_0_30px_rgba(99,102,241,0.5)] uppercase tracking-widest border border-indigo-400">
                                        RETRY
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
