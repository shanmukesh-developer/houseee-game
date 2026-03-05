import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Crown, Clock, Trophy, Coins } from 'lucide-react';
import VFXOverlay from '../components/VFXOverlay';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';

// Car visual designs mapping
const CAR_STYLES = {
    red: 'from-red-500 to-red-700',
    blue: 'from-blue-500 to-blue-700',
    green: 'from-green-500 to-green-700',
    yellow: 'from-yellow-400 to-yellow-600',
    purple: 'from-purple-500 to-purple-700',
    orange: 'from-orange-500 to-orange-700',
    pink: 'from-pink-500 to-pink-700',
    cyan: 'from-cyan-400 to-cyan-600',
    gray: 'from-slate-400 to-slate-600'
};

export default function CarArena() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    // UI states
    const [shake, setShake] = useState(false);
    const [popups, setPopups] = useState([]);
    const [showJoystick, setShowJoystick] = useState(false);

    // Input Refs
    const keys = useRef({});
    const lastInput = useRef({ accel: 0, steer: 0 });
    const inputLoopRef = useRef(null);

    const safeGameState = gameState || {
        players: [], status: 'waiting',
        playersState: {}, colors: {}, coins: [], history: []
    };

    const isHost = safeGameState.hostId === user?.id;
    const amIPlaying = safeGameState.players.some(p => p.id === user?.id);
    const myState = safeGameState.playersState?.[user?.id];

    // Listen to history for RAM VFX
    useEffect(() => {
        if (!safeGameState.history || safeGameState.history.length === 0) return;
        const lastAction = safeGameState.history[safeGameState.history.length - 1];

        if (lastAction.type === 'ram' && (lastAction.victim === user?.id || lastAction.rammer === user?.id)) {
            // Shake the screen if involved
            setShake(true);
            setTimeout(() => setShake(false), 300);

            // Add popup text
            const isMeVictim = lastAction.victim === user?.id;
            const newPopup = {
                id: Math.random(),
                text: isMeVictim ? `💥 -${lastAction.amount} COINS!` : `🚗 STOLE +${lastAction.amount}!`,
                color: isMeVictim ? 'text-red-500' : 'text-yellow-400',
                x: myState?.x || 50,
                y: myState?.y || 50
            };
            setPopups(prev => [...prev, newPopup]);
            setTimeout(() => {
                setPopups(prev => prev.filter(p => p.id !== newPopup.id));
            }, 1500);
        }
    }, [safeGameState.history, user?.id, myState?.x, myState?.y]);

    // Keyboard bindings
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

    // Physics Input Polling Loop (sends to server)
    useEffect(() => {
        if (safeGameState.status === 'playing' && amIPlaying && myState?.isAlive) {
            inputLoopRef.current = setInterval(() => {
                let accel = 0;
                let steer = 0;

                // Up/W = Accelerate
                if (keys.current['arrowup'] || keys.current['w']) accel = 1;
                // Down/S = Brake/Reverse
                if (keys.current['arrowdown'] || keys.current['s']) accel = -1;

                // Left/A = Steer Left
                if (keys.current['arrowleft'] || keys.current['a']) steer = -1;
                // Right/D = Steer Right
                if (keys.current['arrowright'] || keys.current['d']) steer = 1;

                // Only emit if changed (to save bandwidth) or continuously if pressing
                if (accel !== lastInput.current.accel || steer !== lastInput.current.steer || accel !== 0 || steer !== 0) {
                    lastInput.current = { accel, steer };
                    socket.emit('carInput', { roomCode, userId: user.id, accel, steer });
                }
            }, 50); // 20 times a second matches server tick
        }

        return () => {
            if (inputLoopRef.current) clearInterval(inputLoopRef.current);
        };
    }, [safeGameState.status, amIPlaying, myState?.isAlive, roomCode, user?.id, socket]);

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
        const scoreA = safeGameState.playersState?.[a.id]?.coins || 0;
        const scoreB = safeGameState.playersState?.[b.id]?.coins || 0;
        return scoreB - scoreA;
    });

    return (
        <div className="fixed inset-0 bg-slate-950 text-white font-sans overflow-hidden touch-none select-none">
            {/* Asphalt Background */}
            <div
                className="absolute inset-0 z-0 opacity-40 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC4wNSIgbnVtT2N0YXZlcz0iMiIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNuKSIgb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] mix-blend-overlay"
                style={{ backgroundRepeat: 'repeat', backgroundSize: '100px 100px' }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none"></div>

            <EmojiOverlay />
            <VFXOverlay />
            <VoiceChat />

            {/* THE ARENA */}
            <motion.div
                animate={shake ? { x: [-20, 20, -20, 20, 0], y: [-15, 15, -15, 15, 0] } : {}}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 z-0 flex items-center justify-center pt-20 pb-40 md:py-20 px-4 pointer-events-none"
            >
                <div
                    className="relative w-full max-w-4xl aspect-square bg-[#1a1c23] shadow-inner border-[10px] border-slate-800 rounded-3xl overflow-hidden pointer-events-auto shadow-[inset_0_0_50px_rgba(0,0,0,0.8),0_0_80px_rgba(0,0,0,0.5)]"
                >
                    {/* Grid lines marking */}
                    <div
                        className="absolute inset-0 pointer-events-none opacity-20"
                        style={{
                            backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.4) 1px, transparent 1px)`,
                            backgroundSize: '10% 10%'
                        }}
                    ></div>

                    {/* Coins */}
                    {safeGameState.coins?.map(c => (
                        <div key={`c-${c.id}`}
                            className="absolute w-[3%] h-[3%] z-20 flex items-center justify-center animate-[spin_3s_linear_infinite]"
                            style={{ left: `${c.x}%`, top: `${c.y}%`, transform: 'translate(-50%, -50%)' }}
                        >
                            <div className="w-full h-full bg-yellow-400 rounded-full shadow-[0_0_15px_rgba(250,204,21,0.8)] border border-yellow-200 flex items-center justify-center">
                                <div className="w-1/2 h-1/2 bg-yellow-200 rounded-full opacity-50"></div>
                            </div>
                        </div>
                    ))}

                    {/* Players As Cars */}
                    <AnimatePresence>
                        {safeGameState.players.map(p => {
                            const pState = safeGameState.playersState?.[p.id];
                            if (!pState || !pState.isAlive) return null;

                            const pColorName = safeGameState.colors?.[p.id] || 'gray';
                            const pColorClass = CAR_STYLES[pColorName] || CAR_STYLES.gray;

                            // 0 Rot = Facing Right (X-axis). Browser standard is 0 = Top, so we offset by 90deg to match Math.cos/sin
                            const rotationDeg = (pState.angle * 180) / Math.PI;

                            // Skid mark logic (opacity based on lateral drift / velocity, simplified here based on raw speed)
                            const isMoving = Math.abs(pState.velocity) > 0.5;

                            return (
                                <div
                                    key={`car-${p.id}`}
                                    className="absolute w-[4%] h-[6%] z-40 flex flex-col items-center justify-center pointer-events-none transition-all duration-[50ms] ease-linear"
                                    style={{
                                        left: `${pState.x}%`,
                                        top: `${pState.y}%`,
                                        transform: `translate(-50%, -50%) rotate(${rotationDeg + 90}deg)`
                                    }}
                                >
                                    {/* Car Body */}
                                    <div className={`relative w-full h-full rounded-md shadow-2xl border-2 border-white/20 bg-gradient-to-b ${pColorClass}`}>
                                        {/* Windshield */}
                                        <div className="absolute top-[20%] left-[15%] right-[15%] h-[20%] bg-black/80 rounded-sm"></div>
                                        {/* Rear Window */}
                                        <div className="absolute bottom-[10%] left-[20%] right-[20%] h-[15%] bg-black/60 rounded-sm"></div>
                                        {/* Roof */}
                                        <div className="absolute top-[40%] bottom-[25%] left-[20%] right-[20%] bg-white/10 rounded-sm"></div>

                                        {/* Headlights (if moving forward) */}
                                        <div className={`absolute -top-1 left-[10%] w-[15%] h-[15%] rounded-full bg-yellow-100 shadow-[0_-5px_15px_rgba(255,255,150,0.8)] transition-opacity ${pState.velocity > 0 ? 'opacity-100' : 'opacity-20'}`}></div>
                                        <div className={`absolute -top-1 right-[10%] w-[15%] h-[15%] rounded-full bg-yellow-100 shadow-[0_-5px_15px_rgba(255,255,150,0.8)] transition-opacity ${pState.velocity > 0 ? 'opacity-100' : 'opacity-20'}`}></div>

                                        {/* Taillights / Brakelights */}
                                        <div className={`absolute -bottom-1 left-[15%] w-[15%] h-[15%] rounded-full bg-red-500 shadow-[0_5px_15px_rgba(220,38,38,1)] transition-opacity ${pState.velocity < 0 ? 'opacity-100' : 'opacity-30'}`}></div>
                                        <div className={`absolute -bottom-1 right-[15%] w-[15%] h-[15%] rounded-full bg-red-500 shadow-[0_5px_15px_rgba(220,38,38,1)] transition-opacity ${pState.velocity < 0 ? 'opacity-100' : 'opacity-30'}`}></div>
                                    </div>

                                    {/* Name Tag (counter-rotated to stay upright) */}
                                    <div className="absolute" style={{ transform: `rotate(${-(rotationDeg + 90)}deg)` }}>
                                        <span className="absolute -top-10 left-1/2 -translate-x-1/2 font-black text-[10px] text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)] truncate max-w-[60px] bg-black/40 px-1.5 py-0.5 rounded-full border border-white/10">
                                            {p.name}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </AnimatePresence>

                    {/* Impact VFX Popups */}
                    <AnimatePresence>
                        {popups.map(p => (
                            <motion.div
                                key={p.id}
                                initial={{ opacity: 0, scale: 0.5, y: 0 }}
                                animate={{ opacity: 1, scale: 1.2, y: -20 }}
                                exit={{ opacity: 0 }}
                                className={`absolute z-50 font-black text-xs md:text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,1)] whitespace-nowrap ${p.color}`}
                                style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)' }}
                            >
                                {p.text}
                            </motion.div>
                        ))}
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
                        {/* Timer */}
                        <div className="bg-slate-900/80 px-8 py-2 rounded-full border border-slate-700/50 shadow-2xl backdrop-blur-md flex items-center justify-center gap-2">
                            <Clock size={20} className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-amber-400"} />
                            <span className={`text-3xl font-black md:text-4xl ${safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"}`}>{Math.floor((safeGameState.timeLeft || 0) / 60)}:{(safeGameState.timeLeft % 60 || 0).toString().padStart(2, '0')}</span>
                        </div>
                    </div>

                    {/* Leaderboard */}
                    <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md w-32 sm:w-48">
                        <h3 className="font-black text-slate-400 mb-1 text-xs"><Trophy size={12} className="inline mr-1 text-yellow-500 -mt-0.5" /> RACE RANKINGS</h3>
                        <div className="space-y-1">
                            {sortedPlayers.slice(0, 4).map((p, idx) => (
                                <div key={p.id} className="flex items-center justify-between text-xs">
                                    <span className={`font-bold truncate max-w-[60px] sm:max-w-[100px] ${idx === 0 ? 'text-yellow-400' : 'text-slate-300'}`}>{p.name}</span>
                                    <span className="font-black font-mono text-white flex items-center gap-1"><Coins size={10} className="text-yellow-500" />{safeGameState.playersState?.[p.id]?.coins || 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Local Player Controls */}
                {amIPlaying && myState?.isAlive && safeGameState.status === 'playing' && (
                    <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-auto">

                        {/* Desktop toggle & Joystick activation */}
                        <div>
                            <button
                                onClick={() => setShowJoystick(!showJoystick)}
                                className={`p-4 rounded-2xl transition-colors shadow-lg border flex items-center justify-center ${showJoystick ? 'bg-amber-600 text-white border-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.5)]' : 'bg-slate-800/80 backdrop-blur-md border-slate-700 text-slate-400 hover:text-white'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
                            </button>
                        </div>

                        {/* Joystick / Mobile Controls */}
                        {showJoystick && (
                            <div className={`absolute bottom-full mb-4 left-0 right-0 md:static md:mb-0 flex items-end justify-between px-4 md:px-0 w-full md:w-auto origin-bottom `}>
                                {/* Steering Base (Left) */}
                                <div className="bg-slate-900/80 p-2 rounded-[2rem] border border-slate-800 shadow-2xl flex gap-2 backdrop-blur-sm">
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowleft'] = true; }} onPointerUp={() => keys.current['arrowleft'] = false} onPointerLeave={() => keys.current['arrowleft'] = false} className="w-16 h-16 bg-slate-800/90 active:bg-amber-500 active:text-white rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center text-3xl text-slate-400 transition-colors">◀</button>
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowright'] = true; }} onPointerUp={() => keys.current['arrowright'] = false} onPointerLeave={() => keys.current['arrowright'] = false} className="w-16 h-16 bg-slate-800/90 active:bg-amber-500 active:text-white rounded-2xl border border-slate-700 shadow-xl flex items-center justify-center text-3xl text-slate-400 transition-colors">▶</button>
                                </div>

                                {/* Pedals (Right) */}
                                <div className="flex gap-2">
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowdown'] = true; }} onPointerUp={() => keys.current['arrowdown'] = false} onPointerLeave={() => keys.current['arrowdown'] = false} className="w-16 h-20 bg-slate-800/90 active:bg-red-500 active:text-white active:scale-95 rounded-2xl border-2 border-red-900/50 shadow-xl flex flex-col items-center justify-center text-slate-400 transition-all font-bold text-xs">
                                        <div className="w-6 h-1 bg-current mb-2 rounded-full opacity-50"></div>
                                        <div className="w-6 h-1 bg-current mb-2 rounded-full opacity-50"></div>
                                        BRAKE
                                    </button>
                                    <button onPointerDown={(e) => { e.preventDefault(); keys.current['arrowup'] = true; }} onPointerUp={() => keys.current['arrowup'] = false} onPointerLeave={() => keys.current['arrowup'] = false} className="w-16 h-24 bg-slate-800/90 active:bg-green-500 active:text-white active:scale-95 rounded-2xl border-2 border-green-900/50 shadow-xl flex flex-col items-center justify-center text-slate-400 transition-all font-bold text-xs">
                                        <div className="w-4 h-1 bg-current mb-2 rounded-full opacity-50"></div>
                                        <div className="w-4 h-1 bg-current mb-2 rounded-full opacity-50"></div>
                                        <div className="w-4 h-1 bg-current mb-2 rounded-full opacity-50"></div>
                                        GAS
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Status Overlay */}
                {safeGameState.status === 'waiting' && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-auto">
                        <div className="bg-slate-950/90 p-8 md:p-12 rounded-[3rem] backdrop-blur-xl border border-amber-500/30 flex flex-col items-center text-center max-w-lg shadow-[0_0_100px_rgba(245,158,11,0.2)]">
                            <h2 className="text-5xl font-black mb-1 bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-600 tracking-widest uppercase drop-shadow-lg">CAR ARENA</h2>
                            <p className="text-slate-400 mb-8 text-sm font-bold tracking-widest uppercase">Start your engines</p>

                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-left w-full mb-8 shadow-inner relative overflow-hidden">
                                <div className="absolute right-0 top-0 bottom-0 w-24 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBvbHlnb24gcG9pbnRzPSIwLDAgMTAsMCAxMCwxMCAwLDEwIiBmaWxsPSIjMjIyIi8+PHBvbHlnb24gcG9pbnRzPSIxMCwxMCAyMCwxMCAyMCwyMCAxMCwyMCIgZmlsbD0iIzIyMiIvPjwvc3ZnPg==')] opacity-20"></div>
                                <div className="space-y-4 text-sm text-slate-300 relative z-10 font-medium">
                                    <div className="flex gap-4 items-center"><span className="text-green-400 w-16 text-right">GAS</span> <kbd className="bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 shadow flex-1 text-center">W or ↑</kbd></div>
                                    <div className="flex gap-4 items-center"><span className="text-red-400 w-16 text-right">BRAKE</span> <kbd className="bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 shadow flex-1 text-center">S or ↓</kbd></div>
                                    <div className="flex gap-4 items-center"><span className="text-amber-400 w-16 text-right">STEER</span> <div className="flex gap-2 flex-1"><kbd className="bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 shadow flex-1 text-center">A or ←</kbd><kbd className="bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 shadow flex-1 text-center">D or →</kbd></div></div>
                                </div>
                            </div>

                            {isHost ? (
                                <button onClick={startGame} className="btn-neon bg-amber-500/20 text-amber-500 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.4)] px-10 py-5 rounded-2xl font-black text-2xl hover:bg-amber-500 hover:text-white transition-all w-full tracking-widest">
                                    START RACE
                                </button>
                            ) : (
                                <p className="text-amber-500 font-bold animate-pulse text-xl tracking-widest border border-amber-500/30 px-8 py-4 rounded-xl">AWAITING FLAG</p>
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
                            className="bg-slate-900 border border-slate-700 p-8 rounded-[2.5rem] max-w-md w-full text-center shadow-[0_0_100px_rgba(245,158,11,0.2)]"
                        >
                            <Crown size={72} className="mx-auto text-amber-500 mb-6 drop-shadow-[0_0_20px_rgba(245,158,11,0.6)]" />

                            <h2 className="text-4xl font-black mb-2 uppercase tracking-wider text-white">
                                RACE FINISHED
                            </h2>
                            <p className="text-slate-400 mb-8 text-lg">The dust settles...</p>

                            <div className="bg-slate-950 rounded-3xl p-6 mb-8 border border-slate-800 shadow-inner">
                                <div className="text-sm text-slate-500 font-bold mb-2 tracking-widest">CHAMPION</div>
                                <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-600 mb-2 truncate drop-shadow-md">
                                    {safeGameState.players.find(p => p.id === safeGameState.winner)?.name || 'NOBODY'}
                                </div>
                                <div className="text-xl font-bold text-yellow-500 flex items-center justify-center gap-2">
                                    <Coins size={20} /> {safeGameState.playersState?.[safeGameState.winner]?.coins || 0} COINS
                                </div>
                            </div>

                            <div className="flex gap-4">
                                {isHost ? (
                                    <button onClick={restartGame} className="flex-1 bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-black py-4 rounded-xl transition-all shadow-[0_0_30px_rgba(245,158,11,0.5)] uppercase tracking-widest border border-amber-400">
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
