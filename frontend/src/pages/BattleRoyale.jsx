import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Crown, Clock, Trophy, Heart, Shield, Zap, Crosshair } from 'lucide-react';
import VFXOverlay from '../components/VFXOverlay';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';

// Loot Icon Mapping
const LootIcon = ({ type }) => {
    switch (type) {
        case 'health': return <Heart size={16} fill="#EF4444" className="text-red-500 animate-pulse drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]" />;
        case 'shield': return <Shield size={16} fill="#3B82F6" className="text-blue-500 drop-shadow-[0_0_5px_rgba(59,130,246,0.8)]" />;
        case 'speed': return <Zap size={16} fill="#EAB308" className="text-yellow-500 drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]" />;
        case 'gun': return <Crosshair size={16} className="text-orange-500 animate-spin drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]" style={{ animationDuration: '3s' }} />;
        default: return null;
    }
};

export default function BattleRoyale() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();
    const [shake, setShake] = useState(false);
    const [showJoystick, setShowJoystick] = useState(false);

    // Smooth camera tracking
    const arenaRef = useRef(null);
    const moveIntervalRef = useRef(null);
    const keys = useRef({});

    const safeGameState = gameState || {
        players: [], status: 'waiting', loot: [], bullets: [],
        playersState: {}, colors: {}, history: [], zone: { cx: 50, cy: 50, radius: 100 }
    };

    const isHost = safeGameState.hostId === user?.id;
    const amIPlaying = safeGameState.players.some(p => p.id === user?.id);
    const myState = safeGameState.playersState?.[user?.id];
    const myColor = safeGameState.colors?.[user?.id];

    // VFX Triggers based on history
    useEffect(() => {
        if (!safeGameState.history || safeGameState.history.length === 0) return;
        const lastAction = safeGameState.history[safeGameState.history.length - 1];

        // If I took damage or died, shake screen
        if (lastAction.type === 'kill' && lastAction.victim === user?.id) {
            setShake(true); setTimeout(() => setShake(false), 500);
        }
        if (lastAction.type === 'zone_death' && lastAction.victim === user?.id) {
            setShake(true); setTimeout(() => setShake(false), 800);
        }
    }, [safeGameState.history, user?.id]);

    // Keyboard Movement
    useEffect(() => {
        const handleKeyDown = (e) => { keys.current[e.key.toLowerCase()] = true; };
        const handleKeyUp = (e) => { keys.current[e.key.toLowerCase()] = false; };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Pointer Shooting
    const handlePointerDown = useCallback((e) => {
        if (!amIPlaying || safeGameState.status !== 'playing' || !myState?.isAlive || myState?.weapon !== 'gun') return;

        // Prevent default to stop scrolling if not tapping a button
        if (e.target.tagName !== 'BUTTON') {
            e.preventDefault();
        }

        const screenX = window.innerWidth / 2;
        const screenY = window.innerHeight / 2;

        const dx = e.clientX - screenX;
        const dy = e.clientY - screenY;
        const angle = Math.atan2(dy, dx);

        socket.emit('shootBR', { roomCode, userId: user.id, angle });
    }, [amIPlaying, safeGameState.status, myState, roomCode, socket, user?.id]);

    useEffect(() => {
        // Attach to window to catch anywhere
        window.addEventListener('pointerdown', handlePointerDown, { passive: false });
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [handlePointerDown]);

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
                    // Normalize diagonal
                    const length = Math.sqrt(dx * dx + dy * dy);
                    dx /= length;
                    dy /= length;

                    const speed = 0.5 * (myState.speed || 1); // percent per tick
                    let newX = myState.x + dx * speed;
                    let newY = myState.y + dy * speed;

                    // Constrain
                    newX = Math.max(0, Math.min(100, newX));
                    newY = Math.max(0, Math.min(100, newY));

                    socket.emit('moveBR', { roomCode, userId: user.id, x: newX, y: newY });
                }
            }, 50); // 20 times a sec emit
        }

        return () => {
            if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
        };
    }, [safeGameState.status, amIPlaying, myState?.isAlive, myState?.x, myState?.y, myState?.speed, roomCode, user?.id, socket]);

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

    // Camera Translation (Center on player)
    const cameraX = myState ? myState.x : 50;
    const cameraY = myState ? myState.y : 50;
    // We visually represent the 0-100 arena as a 200vw x 200vh box, so scale = 2
    const transformStyle = {
        transform: `translate(calc(50vw - ${cameraX} * 2vw), calc(50vh - ${cameraY} * 2vh))`
    };

    return (
        <div className="fixed inset-0 bg-slate-950 text-white font-sans overflow-hidden touch-none select-none">
            {/* Grid Pattern Background */}
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '100px 100px' }}></div>

            <EmojiOverlay />
            <VFXOverlay />
            <VoiceChat />

            {/* THE ARENA */}
            <motion.div
                animate={shake ? { x: [-15, 15, -15, 15, 0], y: [-15, 15, -15, 15, 0] } : {}}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 z-0 pointer-events-none"
            >
                <div
                    ref={arenaRef}
                    className="absolute top-0 left-0 w-[200vw] h-[200vh] border-8 border-slate-700/50 rounded-lg bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-slate-950 transition-transform duration-[50ms] ease-linear"
                    style={{ ...transformStyle }}
                >
                    {/* The Zone (Storm) */}
                    <div
                        className="absolute rounded-full pointer-events-none transition-all duration-[50ms] ease-linear z-10"
                        style={{
                            left: `${safeGameState.zone.cx}%`,
                            top: `${safeGameState.zone.cy}%`,
                            width: `${Math.max(0, safeGameState.zone.radius * 2)}%`,
                            height: `${Math.max(0, safeGameState.zone.radius * 2)}%`,
                            transform: 'translate(-50%, -50%)',
                            boxShadow: '0 0 0 9999px rgba(239,68,68,0.25), inset 0 0 30px rgba(239,68,68,0.8), 0 0 30px rgba(239,68,68,0.8)',
                            border: '3px solid rgba(239,68,68,0.9)'
                        }}
                    />

                    {/* Render Loot */}
                    {safeGameState.loot?.map((l) => (
                        <div
                            key={`loot-${l.id}`}
                            className="absolute rounded-full bg-slate-800 border-2 border-slate-600 shadow-lg flex items-center justify-center z-10"
                            style={{
                                left: `${l.x}%`,
                                top: `${l.y}%`,
                                width: '2vw',
                                height: '2vw',
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <LootIcon type={l.type} />
                        </div>
                    ))}

                    {/* Render Bullets */}
                    {safeGameState.bullets?.map((b) => (
                        <div
                            key={`bullet-${b.id}`}
                            className="absolute bg-orange-500 rounded-full shadow-[0_0_15px_#F97316] z-20"
                            style={{
                                left: `${b.x}%`,
                                top: `${b.y}%`,
                                width: '0.5vw',
                                height: '0.5vw',
                                transform: 'translate(-50%, -50%)',
                            }}
                        />
                    ))}

                    {/* Render Players */}
                    <AnimatePresence>
                        {safeGameState.players.map(p => {
                            const pState = safeGameState.playersState?.[p.id];
                            if (!pState || !pState.isAlive) return null;

                            const pColor = safeGameState.colors?.[p.id] || '#fff';
                            const isMe = p.id === user?.id;

                            return (
                                <motion.div
                                    key={`player-${p.id}`}
                                    layout
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                                    className="absolute flex flex-col items-center justify-center z-30"
                                    style={{
                                        left: `${pState.x}%`,
                                        top: `${pState.y}%`,
                                        transform: 'translate(-50%, -50%)',
                                    }}
                                >
                                    {/* HP BAR */}
                                    <div className="absolute -top-6 w-12 h-1.5 bg-slate-800 rounded-full border border-slate-700 overflow-hidden">
                                        <div className="h-full bg-green-500 transition-all duration-200" style={{ width: `${Math.max(0, pState.hp)}%` }}></div>
                                    </div>

                                    {/* AVATAR */}
                                    <div className="relative w-8 h-8 rounded-full border-2 border-white/50 backdrop-blur-sm shadow-xl flex items-center justify-center"
                                        style={{
                                            backgroundColor: `${pColor}80`,
                                            boxShadow: `0 0 15px ${pColor}, inset 0 0 10px ${pColor}`
                                        }}>

                                        {/* Status Indicators */}
                                        {pState.shield && (
                                            <div className="absolute -inset-1.5 rounded-full border border-blue-400 animate-[spin_3s_linear_infinite] opacity-70"></div>
                                        )}
                                        {pState.speed > 1 && (
                                            <div className="absolute -bottom-1 -right-1 text-yellow-500 z-10"><Zap size={12} fill="currentColor" /></div>
                                        )}
                                        {pState.weapon === 'gun' && (
                                            <div className="absolute -bottom-1 -left-1 text-orange-500 z-10"><Crosshair size={12} /></div>
                                        )}
                                    </div>

                                    <span className="mt-1 font-bold text-xs text-white/80 drop-shadow-md truncate max-w-[80px]">
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
                        <div className="text-xs text-orange-400 font-black tracking-widest uppercase mb-0.5 drop-shadow-md">BATTLE ROYALE</div>
                        <div className="text-3xl font-black text-white tracking-wider flex items-center justify-center gap-2">
                            <Clock size={24} className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-orange-400"} />
                            <span className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : ""}>{Math.floor((safeGameState.timeLeft || 0) / 60)}:{(safeGameState.timeLeft % 60 || 0).toString().padStart(2, '0')}</span>
                        </div>
                    </div>

                    <div className="flex bg-slate-900/80 p-2 rounded-xl text-sm font-bold items-center gap-2 border border-slate-700 backdrop-blur-md">
                        <code className="text-orange-400 tracking-widest text-lg">{roomCode}</code>
                    </div>
                </div>

                {/* Local Player Stats HUD */}
                {amIPlaying && myState?.isAlive && (
                    <div className="absolute bottom-4 left-4 bg-slate-900/80 p-4 rounded-3xl border border-slate-800 shadow-2xl backdrop-blur-md flex gap-4 items-center pointer-events-auto">
                        <div className="flex flex-col items-center">
                            <div className="text-2xl font-black text-white">{myState.hp}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">HP</div>
                        </div>
                        <div className="h-8 w-px bg-slate-700"></div>
                        <div className="flex gap-2">
                            <div className={`p-2 border rounded-xl shadow-inner ${myState.shield ? 'bg-blue-900/40 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 opacity-30 blur-[1px]'}`}><Shield size={20} /></div>
                            <div className={`p-2 border rounded-xl shadow-inner ${myState.speed > 1 ? 'bg-yellow-900/40 border-yellow-500 text-yellow-400' : 'bg-slate-800 border-slate-700 opacity-30 blur-[1px]'}`}><Zap size={20} /></div>
                            <div className={`p-2 border rounded-xl shadow-inner ${myState.weapon === 'gun' ? 'bg-orange-900/40 border-orange-500 text-orange-400 shadow-[0_0_10px_#F97316]' : 'bg-slate-800 border-slate-700 opacity-30 blur-[1px]'}`}><Crosshair size={20} /></div>
                        </div>
                    </div>
                )}

                {/* Kill Feed / Kills Tracker */}
                {amIPlaying && myState?.isAlive && (
                    <div className="absolute top-24 right-4 bg-slate-900/80 px-4 py-2 rounded-xl border border-orange-500/30 text-right pointer-events-none">
                        <div className="text-sm font-black text-orange-400 tracking-wider">KILLS: <span className="text-white text-xl ml-1">{myState.kills}</span></div>
                    </div>
                )}

                {/* Joystick Toggle for Desktop & Built-in Mobile Controls */}
                <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto">
                    {amIPlaying && safeGameState.status === 'playing' && (
                        <button
                            onClick={() => setShowJoystick(!showJoystick)}
                            className={`p-3 rounded-xl transition-colors shadow-lg border hidden md:flex items-center justify-center ${showJoystick ? 'bg-orange-600 text-white border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
                            title="Toggle On-Screen Joystick"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                    )}

                    {safeGameState.status === 'playing' && amIPlaying && myState?.isAlive && showJoystick && (
                        <div className={`bg-slate-900/80 p-6 rounded-[2rem] border border-slate-800 shadow-2xl flex items-center justify-center flex-col origin-bottom-right scale-75 sm:scale-100 ${showJoystick ? 'flex' : 'md:hidden'}`}>
                            <div className="grid grid-cols-3 gap-2 w-48 h-48">
                                <div />
                                <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowup'] = true; }} onPointerUp={() => keys.current['arrowup'] = false} onPointerLeave={() => keys.current['arrowup'] = false} className="bg-slate-800 active:bg-orange-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pb-1 text-2xl text-white">▲</button>
                                <div />
                                <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowleft'] = true; }} onPointerUp={() => keys.current['arrowleft'] = false} onPointerLeave={() => keys.current['arrowleft'] = false} className="bg-slate-800 active:bg-orange-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pr-1 text-2xl text-white">◀</button>
                                <div className="bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-center drop-shadow-inner"><div className="w-5 h-5 rounded-full bg-orange-500/30"></div></div>
                                <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowright'] = true; }} onPointerUp={() => keys.current['arrowright'] = false} onPointerLeave={() => keys.current['arrowright'] = false} className="bg-slate-800 active:bg-orange-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pl-1 text-2xl text-white">▶</button>
                                <div />
                                <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowdown'] = true; }} onPointerUp={() => keys.current['arrowdown'] = false} onPointerLeave={() => keys.current['arrowdown'] = false} className="bg-slate-800 active:bg-orange-500/50 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center pt-1 text-2xl text-white">▼</button>
                                <div />
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
                        <div className="bg-slate-950/80 p-12 rounded-[3rem] backdrop-blur-xl border border-slate-800 flex flex-col items-center text-center max-w-lg shadow-[0_0_100px_rgba(249,115,22,0.15)]">
                            <Crosshair size={64} className="text-orange-500 mb-6 animate-pulse" />
                            <h2 className="text-3xl font-black mb-3 text-white tracking-wider">DROP IN.</h2>
                            <p className="text-slate-400 mb-2">Move with <kbd className="bg-slate-800 px-2 rounded">W</kbd><kbd className="bg-slate-800 px-2 rounded">A</kbd><kbd className="bg-slate-800 px-2 rounded">S</kbd><kbd className="bg-slate-800 px-2 rounded">D</kbd> or Joystick.</p>
                            <p className="text-slate-400 mb-8 border-b border-slate-800 pb-4">Tap anywhere to shoot. The red zone is deadly.</p>
                            {isHost ? (
                                <button onClick={startGame} className="btn-neon bg-orange-500/20 text-orange-400 border-orange-400 shadow-[0_0_30px_rgba(249,115,22,0.4)] px-10 py-4 rounded-2xl font-black text-xl hover:bg-orange-500 hover:text-white transition-all">
                                    START DROP
                                </button>
                            ) : (
                                <p className="text-orange-400 font-bold animate-pulse text-xl">Waiting for host to drop in...</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Dead Screen */}
                {!myState?.isAlive && safeGameState.status === 'playing' && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center top-[25%] pointer-events-none">
                        <div className="bg-red-950/90 p-8 rounded-[3rem] border-4 border-red-500/50 backdrop-blur-xl text-center shadow-[0_0_100px_rgba(239,68,68,0.3)]">
                            <h2 className="text-5xl font-black text-white mb-2 drop-shadow-md tracking-widest">ELIMINATED</h2>
                            <p className="text-red-400 font-bold tracking-widest uppercase">Spectating Match</p>
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
                            className="bg-slate-900 border border-slate-700 p-8 rounded-[2.5rem] max-w-md w-full text-center shadow-[0_0_100px_rgba(249,115,22,0.2)] relative overflow-hidden"
                        >
                            <Crown size={64} className="mx-auto text-yellow-500 mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
                            <h2 className="text-4xl font-black mb-2 text-white uppercase tracking-wider">VICTORY ROYALE</h2>
                            <p className="text-slate-400 mb-8 text-lg">The dust has settled.</p>

                            <div className="bg-slate-950 rounded-3xl p-6 mb-8 border border-slate-800 shadow-inner">
                                <div className="text-sm text-slate-500 font-bold mb-2 tracking-widest">CHAMPION</div>
                                <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-500 mb-4 truncate drop-shadow-md">
                                    {safeGameState.players.find(p => p.id === safeGameState.winner)?.name || 'NO SURVIVORS'}
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
                                    <button onClick={restartGame} className="flex-1 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-black py-4 rounded-xl transition-all shadow-[0_0_30px_rgba(249,115,22,0.5)] uppercase tracking-widest border border-orange-400">
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
