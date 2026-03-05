import React, { useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Crown, Clock, Trophy } from 'lucide-react';
import VFXOverlay from '../components/VFXOverlay';
import EmojiOverlay from '../components/EmojiOverlay';
import VoiceChat from '../components/VoiceChat';

export default function AgarGame() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();
    const [shake, setShake] = useState(false);

    // Smooth camera tracking
    const arenaRef = useRef(null);
    const cursorRef = useRef({ x: 50, y: 50 }); // Target percentage
    const moveIntervalRef = useRef(null);

    const safeGameState = gameState || {
        players: [], status: 'waiting', food: [],
        playersState: {}, colors: {}, history: []
    };

    const isHost = safeGameState.hostId === user?.id;
    const amIPlaying = safeGameState.players.some(p => p.id === user?.id);
    const myState = safeGameState.playersState?.[user?.id];
    const myColor = safeGameState.colors?.[user?.id];

    // VFX Triggers based on history (eat player)
    useEffect(() => {
        if (!safeGameState.history || safeGameState.history.length === 0) return;
        const lastAction = safeGameState.history[safeGameState.history.length - 1];

        // If someone ate ME, screen shake wildly!
        if (lastAction.type === 'eat_player' && lastAction.prey === user?.id) {
            setShake(true);
            setTimeout(() => setShake(false), 500);
        }
    }, [safeGameState.history, user?.id]);

    // Handle mouse/touch movement
    const handlePointerMove = useCallback((e) => {
        if (!amIPlaying || safeGameState.status !== 'playing' || !myState?.isAlive) return;

        // Find cursor position relative to screen center
        const screenX = window.innerWidth / 2;
        const screenY = window.innerHeight / 2;

        // Direction vector from center
        const dx = e.clientX - screenX;
        const dy = e.clientY - screenY;

        // Normalize and convert to speed based on distance (or just move steadily towards pointer)
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = Math.min(screenX, screenY);
        const speedMultiplier = Math.min(dist / maxDist, 1.0); // 0 to 1

        if (speedMultiplier > 0.1) {
            // Calculate a new theoretical target based on vector
            const angle = Math.atan2(dy, dx);
            const speed = 1.0 * speedMultiplier; // % per tick

            let newX = myState.x + Math.cos(angle) * speed;
            let newY = myState.y + Math.sin(angle) * speed;

            // Constrain to arena 0-100
            newX = Math.max(0, Math.min(100, newX));
            newY = Math.max(0, Math.min(100, newY));

            cursorRef.current = { x: newX, y: newY };
        }
    }, [amIPlaying, safeGameState.status, myState]);

    useEffect(() => {
        window.addEventListener('pointermove', handlePointerMove);
        return () => window.removeEventListener('pointermove', handlePointerMove);
    }, [handlePointerMove]);

    // High frequency emit loop for smooth movement
    useEffect(() => {
        if (safeGameState.status === 'playing' && amIPlaying && myState?.isAlive) {
            moveIntervalRef.current = setInterval(() => {
                // Move current pos slightly towards cursor smoothly
                if (!myState) return;

                const dx = cursorRef.current.x - myState.x;
                const dy = cursorRef.current.y - myState.y;
                // Move 20% of the distance per tick for smoothness
                const sendX = myState.x + dx * 0.2;
                const sendY = myState.y + dy * 0.2;

                socket.emit('moveAgar', { roomCode, userId: user.id, x: sendX, y: sendY });
            }, 50); // 20 times a sec emit
        }

        return () => {
            if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
        };
    }, [safeGameState.status, amIPlaying, myState?.isAlive, myState?.x, myState?.y, roomCode, user?.id, socket]);

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
        const scoreA = safeGameState.playersState?.[a.id]?.score || 0;
        const scoreB = safeGameState.playersState?.[b.id]?.score || 0;
        return scoreB - scoreA;
    });

    // Camera Translation (Center on player)
    const cameraX = myState ? myState.x : 50;
    const cameraY = myState ? myState.y : 50;
    // We visually represent the 0-100 arena as a 200vw x 200vh box, so scale = 2
    // If player is at 50,50, offset should be -100vw, -100vh + center of screen.
    const transformStyle = {
        transform: `translate(calc(50vw - ${cameraX} * 2vw), calc(50vh - ${cameraY} * 2vh))`
    };

    return (
        <div className="fixed inset-0 bg-slate-950 text-white font-sans overflow-hidden touch-none select-none">
            {/* Grid Pattern Background */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10px 10px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>

            <EmojiOverlay />
            <VFXOverlay />
            <VoiceChat />

            {/* THE ARENA */}
            <motion.div
                animate={shake ? { x: [-20, 20, -20, 20, 0], y: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 z-0 pointer-events-none"
            >
                <div
                    ref={arenaRef}
                    className="absolute top-0 left-0 w-[200vw] h-[200vh] border-4 border-slate-700/50 rounded-3xl bg-slate-900/40 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)] transition-transform duration-100 ease-linear"
                    style={{ ...transformStyle }}
                >
                    {/* Render Food */}
                    {safeGameState.food?.map((f) => (
                        <div
                            key={`food-${f.id}`}
                            className="absolute rounded-full shadow-[0_0_10px_currentColor] animate-pulse"
                            style={{
                                left: `${f.x}%`,
                                top: `${f.y}%`,
                                width: '1vw',
                                height: '1vh',
                                transform: 'translate(-50%, -50%)',
                                backgroundColor: f.color,
                                color: f.color // for shadow projection
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

                            // Visual radius scaling. Base 2 means 2% of the 200vw = 4vw diameter.
                            // So diameter in % of container = pState.radius
                            const diam = pState.radius;

                            return (
                                <motion.div
                                    key={`player-${p.id}`}
                                    layout
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                                    className="absolute rounded-full flex flex-col items-center justify-center border-2 border-white/50 backdrop-blur-sm"
                                    style={{
                                        left: `${pState.x}%`,
                                        top: `${pState.y}%`,
                                        width: `${diam * 2}%`,
                                        height: `${diam * 2}%`,
                                        transform: 'translate(-50%, -50%)',
                                        backgroundColor: `${pColor}80`, // 50% opacity center
                                        boxShadow: `0 0 30px ${pColor}, inset 0 0 20px ${pColor}`,
                                    }}
                                >
                                    <span className="font-extrabold text-white drop-shadow-md truncate max-w-full px-1" style={{ fontSize: `${Math.max(0.5, diam / 2)}vw` }}>
                                        {p.name}
                                    </span>
                                    <span className="text-white/80 font-mono tracking-tighter" style={{ fontSize: `${Math.max(0.3, diam / 4)}vw` }}>
                                        {pState.score}
                                    </span>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </motion.div>

            {/* HUD / UI LAYER */}
            <div className="absolute inset-0 z-10 flex flex-col p-4 pointer-events-none">
                {/* Header */}
                <div className="flex items-start justify-between pointer-events-auto">
                    <button onClick={leaveRoom} className="p-3 bg-slate-900/80 text-white hover:bg-slate-800 rounded-xl transition-colors shadow-lg border border-slate-700 backdrop-blur-md">
                        <LogOut size={20} />
                    </button>

                    <div className="bg-slate-900/80 p-4 rounded-3xl border border-slate-700/50 shadow-2xl backdrop-blur-md flex flex-col items-center">
                        <div className="text-xs text-pink-400 font-black tracking-widest uppercase mb-1 drop-shadow-md">AGAR GROWTH WAR</div>
                        <div className="text-4xl font-black text-white tracking-wider flex items-center justify-center gap-2">
                            <Clock size={32} className={safeGameState.timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-pink-400"} />
                            <span className={safeGameState.timeLeft <= 10 ? "text-red-500" : ""}>{Math.floor((safeGameState.timeLeft || 0) / 60)}:{(safeGameState.timeLeft % 60 || 0).toString().padStart(2, '0')}</span>
                        </div>
                    </div>

                    <div className="flex bg-slate-900/80 p-3 rounded-2xl text-sm font-bold items-center gap-2 border border-slate-700 backdrop-blur-md">
                        <code className="text-pink-400 tracking-widest text-xl">{roomCode}</code>
                    </div>
                </div>

                {/* Status Overlay */}
                {safeGameState.status === 'waiting' && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-auto">
                        <div className="bg-slate-950/80 p-12 rounded-[3rem] backdrop-blur-xl border border-slate-800 flex flex-col items-center text-center max-w-lg shadow-[0_0_100px_rgba(236,72,153,0.15)]">
                            <Crown size={64} className="text-pink-400 mb-6 animate-pulse" />
                            <h2 className="text-3xl font-black mb-3 text-white">READY TO GROW?</h2>
                            <p className="text-slate-400 mb-8 text-lg">Swipe or point your mouse to move. Eat the glowing pellets. Eat smaller players. Run from the giant ones.</p>
                            {isHost ? (
                                <button onClick={startGame} className="btn-neon bg-pink-500/20 text-pink-400 border-pink-400 shadow-[0_0_30px_rgba(236,72,153,0.4)] px-10 py-4 rounded-2xl font-black text-xl hover:bg-pink-500 hover:text-white transition-all">
                                    START MATCH
                                </button>
                            ) : (
                                <p className="text-pink-400 font-bold animate-pulse text-xl">Waiting for host to start...</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Dead Screen */}
                {!myState?.isAlive && safeGameState.status === 'playing' && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                        <div className="bg-red-950/80 p-8 rounded-3xl border border-red-500/50 backdrop-blur-md text-center max-w-sm">
                            <h2 className="text-4xl font-black text-white mb-2 truncate">YOU GOT EATEN!</h2>
                            <p className="text-red-400 animate-pulse text-lg">Respawning in 3 seconds...</p>
                        </div>
                    </div>
                )}

                {/* Leaderboard */}
                <div className="mt-auto self-end pointer-events-auto">
                    <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md w-48 sm:w-64">
                        <h3 className="font-black text-slate-400 mb-2 max-w-[200px] truncate"><Trophy size={16} className="inline mr-1 text-yellow-500 -mt-1" /> LEADERBOARD</h3>
                        <div className="space-y-1">
                            {sortedPlayers.slice(0, 5).map((p, idx) => (
                                <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg text-sm ${p.id === user?.id ? 'bg-slate-800 border bg-pink-900/30 border-pink-500/50' : ''}`}>
                                    <div className="flex items-center gap-2 truncate">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: safeGameState.colors?.[p.id] || '#fff' }}></div>
                                        <span className="font-bold truncate max-w-[80px] sm:max-w-[120px]">{idx + 1}. {p.name}</span>
                                    </div>
                                    <span className="font-black font-mono text-pink-400">{safeGameState.playersState?.[p.id]?.score || 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
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
                            className="bg-slate-900 border border-slate-700 p-8 rounded-[2.5rem] max-w-md w-full text-center shadow-[0_0_100px_rgba(236,72,153,0.2)] relative overflow-hidden"
                        >
                            <Trophy size={64} className="mx-auto text-yellow-500 mb-6" />
                            <h2 className="text-4xl font-black mb-2 text-white">MATCH OVER</h2>
                            <p className="text-slate-400 mb-8 text-lg">Survival of the fittest.</p>

                            <div className="bg-slate-950 rounded-3xl p-6 mb-8 border border-slate-800 shadow-inner">
                                <div className="text-sm text-slate-500 font-bold mb-2">THE APEX PREDATOR</div>
                                <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-500 mb-2 truncate">
                                    {safeGameState.players.find(p => p.id === safeGameState.winner)?.name || 'Tie Game'}
                                </div>
                                <div className="text-xl font-bold text-white">
                                    Mass Score: <span className="text-pink-400">{safeGameState.playersState?.[safeGameState.winner]?.score || 0}</span>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                {isHost ? (
                                    <button onClick={restartGame} className="flex-1 bg-pink-600 hover:bg-pink-500 text-white font-bold py-4 rounded-xl transition-colors shadow-[0_0_20px_rgba(236,72,153,0.4)]">
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
