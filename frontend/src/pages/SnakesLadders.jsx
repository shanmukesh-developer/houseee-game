import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Dice5, Trophy } from 'lucide-react';
import VoiceChat from '../components/VoiceChat';
import EmojiOverlay from '../components/EmojiOverlay';
import VFXOverlay from '../components/VFXOverlay';

export default function SnakesLadders() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    const [isRolling, setIsRolling] = useState(false);
    const [currentFace, setCurrentFace] = useState(1);
    const [vfxType, setVfxType] = useState(null);
    const [vfxTrigger, setVfxTrigger] = useState(0);

    const safeGameState = gameState || { players: [], winner: null, turn: null, positions: {}, history: [] };
    const isMyTurn = safeGameState.turn === user?.id;

    // Keep dice dots in sync, and flicker randomly while rolling
    useEffect(() => {
        let interval;
        if (isRolling) {
            interval = setInterval(() => {
                setCurrentFace(Math.floor(Math.random() * 6) + 1);
            }, 80); // Fast 80ms flicker
        } else if (safeGameState.dice) {
            setCurrentFace(safeGameState.dice);
        }
        return () => clearInterval(interval);
    }, [isRolling, safeGameState.dice]);

    // Detect Snake, Ladder, or Kill from history
    const prevHistoryLength = React.useRef(safeGameState.history?.length || 0);
    useEffect(() => {
        if (safeGameState.history?.length > prevHistoryLength.current) {
            const latest = safeGameState.history[safeGameState.history.length - 1];
            if (latest.victim) {
                setVfxType('kill');
                setVfxTrigger(v => v + 1);
            } else if (latest.type === 'snake') {
                setVfxType('snake');
                setVfxTrigger(v => v + 1);
            } else if (latest.type === 'ladder') {
                setVfxType('ladder');
                setVfxTrigger(v => v + 1);
            }
        }
        prevHistoryLength.current = safeGameState.history?.length || 0;
    }, [safeGameState.history]);

    // Detect Victory
    const prevWinner = React.useRef(safeGameState.winner);
    useEffect(() => {
        if (!prevWinner.current && safeGameState.winner) {
            setVfxType('victory');
            setVfxTrigger(v => v + 1);
        }
        prevWinner.current = safeGameState.winner;
    }, [safeGameState.winner]);

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

    const snakesDict = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 30 };
    const laddersDict = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };

    const getPosCoordinates = (pos, playerId) => {
        if (pos === 0 || pos > 100) {
            // Off-board (Start)
            // Stagger them near the bottom-left edge slightly outside
            const pIdx = safeGameState.players?.findIndex(p => p.id === playerId) || 0;
            return { x: -3 + (pIdx * 2), y: 102 };
        }
        const zeroBased = pos - 1;
        let rowFromBottom = Math.floor(zeroBased / 10);
        let col = zeroBased % 10;

        if (rowFromBottom % 2 !== 0) {
            col = 9 - col;
        }

        const rowFromTop = 9 - rowFromBottom;

        // Add circular offset per player so they don't exactly stack
        const pIdx = safeGameState.players?.findIndex(p => p.id === playerId) || 0;
        const angle = (pIdx / 10) * Math.PI * 2;
        const radius = 2.0; // percent offset

        return {
            x: (col * 10) + 5 + Math.cos(angle) * radius,
            y: (rowFromTop * 10) + 5 + Math.sin(angle) * radius
        };
    };

    const handleRoll = () => {
        if (!isMyTurn || safeGameState.winner) return;
        setIsRolling(true);
        socket.emit('rollDiceSL', { roomCode, userId: user.id });
        setTimeout(() => {
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

    if (!user || !roomCode) return null;

    return (
        <div className="min-h-screen flex flex-col items-center p-2 md:p-4">
            <EmojiOverlay />
            <VFXOverlay type={vfxType} trigger={vfxTrigger} message={safeGameState.winner === user.id ? 'VICTORY' : 'DEFEAT'} />

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
                <div className="w-[95vmin] h-[95vmin] lg:w-[80vmin] lg:h-[80vmin] max-w-[800px] max-h-[800px] mx-auto rounded-xl md:rounded-3xl border-4 md:border-8 border-green-500/80 p-0 relative z-10 shadow-[0_0_40px_rgba(0,0,0,0.8)] bg-slate-900" style={{ backgroundImage: 'url("/board.jpg")', backgroundSize: '100% 100%', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>

                    {/* Absolute Tokens Overlay */}
                    <div className="absolute inset-0 pointer-events-none z-20">
                        <AnimatePresence>
                            {safeGameState.players?.map(p => {
                                const pos = safeGameState.positions[p.id] || 0;
                                const coords = getPosCoordinates(pos, p.id);
                                return (
                                    <motion.div
                                        key={p.id}
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{
                                            scale: 1,
                                            opacity: 1,
                                            left: `${coords.x}%`,
                                            top: `${coords.y}%`
                                        }}
                                        transition={{
                                            type: "spring", stiffness: 45, damping: 12, mass: 1.2
                                        }}
                                        exit={{ scale: 0, opacity: 0 }}
                                        className="absolute w-[8%] h-[8%] -ml-[4%] -mt-[4%] min-w-[15px] min-h-[15px] md:min-w-[30px] md:min-h-[30px] rounded-full shadow-[0_5px_15px_rgba(0,0,0,0.9),inset_0_-5px_15px_rgba(0,0,0,0.6)] border-[2px] md:border-[3px] border-white/90 flex items-center justify-center font-black text-white text-[8px] md:text-xs drop-shadow-md z-50 transform-gpu"
                                        style={{ backgroundColor: getPlayerColor(p.id) }}
                                        title={p.name}
                                    >
                                        {p.name.charAt(0).toUpperCase()}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>

                    {/* SVG Snakes and Ladders Vectors */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 drop-shadow-[0_10px_15px_rgba(0,0,0,0.9)]" viewBox="0 0 100 100" preserveAspectRatio="none">

                        {/* SVG Definitions for hyper-realistic textures */}
                        <defs>
                            <linearGradient id="ladder-wood" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#451a03" />
                                <stop offset="50%" stopColor="#b45309" />
                                <stop offset="100%" stopColor="#280f01" />
                            </linearGradient>

                            <linearGradient id="snake-body-1" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#ef4444" />
                                <stop offset="50%" stopColor="#991b1b" />
                                <stop offset="100%" stopColor="#450a0a" />
                            </linearGradient>

                            <linearGradient id="snake-body-2" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#a855f7" />
                                <stop offset="50%" stopColor="#6b21a8" />
                                <stop offset="100%" stopColor="#3b0764" />
                            </linearGradient>
                        </defs>

                        {/* Draw Rich 3D Wooden Ladders */}
                        {Object.entries(laddersDict).map(([start, end]) => {
                            const p1 = getPosCoordinates(parseInt(start), null);
                            const p2 = getPosCoordinates(parseInt(end), null);

                            // Calculate angle for ladder rungs
                            const dx = p2.x - p1.x;
                            const dy = p2.y - p1.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            const steps = Math.floor(distance / 5); // A rung every 5% 

                            const rungs = [];
                            for (let i = 1; i < steps; i++) {
                                const fraction = i / steps;
                                const rx = p1.x + (dx * fraction);
                                const ry = p1.y + (dy * fraction);
                                rungs.push({ x: rx, y: ry });
                            }

                            return (
                                <g key={`ladder-${start}`} style={{ filter: 'drop-shadow(3px 5px 4px rgba(0,0,0,0.8))' }}>
                                    {/* Left Rail (Thick 3D) */}
                                    <line x1={p1.x - 2.5} y1={p1.y} x2={p2.x - 2.5} y2={p2.y} stroke="#280f01" strokeWidth="2.5" strokeLinecap="round" />
                                    <line x1={p1.x - 2.5} y1={p1.y} x2={p2.x - 2.5} y2={p2.y} stroke="url(#ladder-wood)" strokeWidth="1.5" strokeLinecap="round" />
                                    {/* Right Rail (Thick 3D) */}
                                    <line x1={p1.x + 2.5} y1={p1.y} x2={p2.x + 2.5} y2={p2.y} stroke="#280f01" strokeWidth="2.5" strokeLinecap="round" />
                                    <line x1={p1.x + 2.5} y1={p1.y} x2={p2.x + 2.5} y2={p2.y} stroke="url(#ladder-wood)" strokeWidth="1.5" strokeLinecap="round" />
                                    {/* Rungs (3D offset) */}
                                    {rungs.map((rung, i) => (
                                        <g key={i}>
                                            <line x1={rung.x - 2.5} y1={rung.y + 0.3} x2={rung.x + 2.5} y2={rung.y + 0.3} stroke="#280f01" strokeWidth="1.8" strokeLinecap="square" />
                                            <line x1={rung.x - 2.5} y1={rung.y} x2={rung.x + 2.5} y2={rung.y} stroke="url(#ladder-wood)" strokeWidth="1.2" strokeLinecap="square" />
                                        </g>
                                    ))}
                                </g>
                            );
                        })}
                        {/* Draw Anatomically Realistic Winding Snakes */}
                        {Object.entries(snakesDict).map(([start, end], index) => {
                            const p1 = getPosCoordinates(parseInt(start), null); // Head
                            const p2 = getPosCoordinates(parseInt(end), null);   // Tail

                            // Calculate biological slither curve
                            const dx = p2.x - p1.x;
                            const dy = p2.y - p1.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);

                            // Organic offset
                            const curveOffset = index % 2 === 0 ? dist * 0.3 : -dist * 0.3;

                            // Earthy Biological Tones: Pythons, Rattlesnakes, Cobras
                            const isViper = index % 3 === 0;
                            const isPython = index % 3 === 1;

                            // Base Colors
                            const bodyColor = isViper ? "#654321" : isPython ? "#2E472D" : "#5C4033";
                            const bellyColor = isViper ? "#D2B48C" : isPython ? "#8F9779" : "#C19A6B";
                            const patternColor = isViper ? "#3B2F2F" : isPython ? "#1A2421" : "#2A1B14";

                            return (
                                <g key={`snake-${start}`} style={{ filter: 'drop-shadow(2px 4px 4px rgba(0,0,0,0.6))' }}>

                                    {/* Core Path Definition for anatomical tapering */}
                                    <path
                                        id={`snake-path-${start}`}
                                        d={`M ${p1.x} ${p1.y} C ${p1.x - curveOffset} ${p1.y + (dy * 0.3)}, ${p2.x + curveOffset} ${p2.y - (dy * 0.3)}, ${p2.x} ${p2.y}`}
                                        fill="none"
                                        stroke="none"
                                    />

                                    {/* 1. Base Shadow & Thick Body */}
                                    <path
                                        d={`M ${p1.x} ${p1.y} C ${p1.x - curveOffset} ${p1.y + (dy * 0.3)}, ${p2.x + curveOffset} ${p2.y - (dy * 0.3)}, ${p2.x} ${p2.y}`}
                                        stroke="#111" strokeWidth="5.5" fill="none"
                                        strokeLinecap="round"
                                    />

                                    {/* 2. Main Body (Darker top scales) */}
                                    <path
                                        d={`M ${p1.x} ${p1.y} C ${p1.x - curveOffset} ${p1.y + (dy * 0.3)}, ${p2.x + curveOffset} ${p2.y - (dy * 0.3)}, ${p2.x} ${p2.y}`}
                                        stroke={bodyColor} strokeWidth="4.5" fill="none"
                                        strokeLinecap="round"
                                    />

                                    {/* 3. Biological Pattern (Diamond/Bands) */}
                                    <path
                                        d={`M ${p1.x} ${p1.y} C ${p1.x - curveOffset} ${p1.y + (dy * 0.3)}, ${p2.x + curveOffset} ${p2.y - (dy * 0.3)}, ${p2.x} ${p2.y}`}
                                        stroke={patternColor} strokeWidth="2.5" fill="none"
                                        strokeDasharray={isPython ? "4 2" : "3 4"} strokeLinecap="round" opacity="0.85"
                                    />

                                    {/* 4. Belly / Highlights (Underbelly shine) */}
                                    <path
                                        d={`M ${p1.x} ${p1.y} C ${p1.x - curveOffset} ${p1.y + (dy * 0.3)}, ${p2.x + curveOffset} ${p2.y - (dy * 0.3)}, ${p2.x} ${p2.y}`}
                                        stroke={bellyColor} strokeWidth="1" fill="none"
                                        strokeDasharray="1 6" strokeLinecap="round" opacity="0.6"
                                    />

                                    {/* Realistic Head Anatomy (Diamond shape for Vipers, Oval for Pythons) */}
                                    <g transform={`translate(${p1.x}, ${p1.y}) rotate(${Math.atan2(dy, dx) * (180 / Math.PI) - 90})`}>
                                        {/* Head Shape */}
                                        <path d={isViper ? "M 0 -3 L 2.5 0 L 1.5 3 L -1.5 3 L -2.5 0 Z" : "M 0 -3 C 2 0, 2 2, 1.5 3 C 0 3, 0 3, -1.5 3 C -2 2, -2 0, 0 -3 Z"} fill={bodyColor} stroke="#111" strokeWidth="0.5" />

                                        {/* Head Pattern */}
                                        <path d="M 0 -1 L 1 1 L -1 1 Z" fill={patternColor} opacity="0.8" />

                                        {/* Organic Eyes (Small, dark, realistic bead eyes) */}
                                        <circle cx="-1.2" cy="0" r="0.6" fill="#000" />
                                        <circle cx="1.2" cy="0" r="0.6" fill="#000" />
                                        {/* Extremely subtle slit highlight, not glowing */}
                                        <line x1="-1.2" y1="-0.3" x2="-1.2" y2="0.3" stroke="#8B6508" strokeWidth="0.2" />
                                        <line x1="1.2" y1="-0.3" x2="1.2" y2="0.3" stroke="#8B6508" strokeWidth="0.2" />

                                        {/* Forked Tongue (Thin, organic red) */}
                                        <path d="M 0 -3 L 0 -4.5 L -0.5 -5 M 0 -4.5 L 0.5 -5" stroke="#8B0000" strokeWidth="0.3" fill="none" strokeLinecap="round" />
                                    </g>
                                </g>
                            );
                        })}
                    </svg>

                    <div className="absolute inset-0 w-full h-full pointer-events-none rounded-2xl md:rounded-3xl overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] border border-slate-900/50" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gridTemplateRows: 'repeat(10, 1fr)' }}>
                        {boardCells.map((cellNum) => {

                            const zeroBased = cellNum - 1;
                            const row = Math.floor(zeroBased / 10);
                            const col = zeroBased % 10;
                            const isEven = (row + col) % 2 === 0;

                            // Advanced Base Checkerboard Texturing
                            let bgColor = isEven ? 'bg-slate-800' : 'bg-slate-900';
                            let borderStyle = "border-slate-700/60";
                            let innerBevel = isEven
                                ? "shadow-[inset_2px_2px_4px_rgba(255,255,255,0.05),inset_-2px_-2px_4px_rgba(0,0,0,0.4)]"
                                : "shadow-[inset_2px_2px_4px_rgba(255,255,255,0.02),inset_-2px_-2px_4px_rgba(0,0,0,0.6)]";

                            // Special Highlights 
                            const isStart = cellNum === 1;
                            const isEnd = cellNum === 100;
                            const isSnakePit = Object.values(snakesDict).includes(cellNum); // Where a snake drops you
                            const isLadderBase = Object.keys(laddersDict).includes(String(cellNum));

                            if (isStart) {
                                bgColor = "bg-green-900/40";
                                borderStyle = "border-green-500/50";
                                innerBevel += ", inset 0 0 20px rgba(34,197,94,0.3)";
                            } else if (isEnd) {
                                bgColor = "bg-yellow-900/40";
                                borderStyle = "border-yellow-500/50";
                                innerBevel += ", inset 0 0 30px rgba(234,179,8,0.4)";
                            } else if (isSnakePit) {
                                bgColor = "bg-red-950/40";
                                innerBevel += ", inset 0 0 15px rgba(239,68,68,0.1)";
                            } else if (isLadderBase) {
                                bgColor = "bg-blue-900/30";
                                innerBevel += ", inset 0 0 15px rgba(59,130,246,0.1)";
                            }

                            return (
                                <div key={cellNum} className={`relative flex items-center justify-center p-0.5 md:p-1 border-[1px] ${borderStyle} ${bgColor} transition-colors`} style={{ boxShadow: innerBevel }}>

                                    {/* Number Styling */}
                                    <span className={`absolute top-1 left-2 font-black tracking-tighter text-[10px] sm:text-sm md:text-xl lg:text-2xl pointer-events-none select-none z-30 ${isStart ? 'text-green-300 drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]' : isEnd ? 'text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]' : 'text-slate-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] opacity-90'}`}>
                                        {cellNum}
                                    </span>

                                    {/* Subtle Ambient Glow for End Cell */}
                                    {isEnd && <div className="absolute inset-0 bg-yellow-400/10 animate-pulse pointer-events-none mix-blend-screen" />}
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

                        {/* GIANT SNAKE 3D DICE */}
                        <div className="relative perspective-[1000px]">
                            <motion.button
                                onClick={handleRoll}
                                disabled={!isMyTurn || isRolling || safeGameState.winner}
                                animate={isRolling ? {
                                    rotateX: [0, 360, 720, 1080],
                                    rotateY: [0, 180, 540, 720],
                                    scale: [1, 1.3, 0.7, 1.2, 0.9],
                                    z: [0, 100, -50, 0]
                                } : { rotateX: 0, rotateY: 0, scale: 1, z: 0 }}
                                transition={{ duration: 0.6, ease: "easeInOut" }}
                                className={`w-28 h-28 md:w-32 md:h-32 rounded-[25%] flex items-center justify-center border-4 shadow-2xl transition-all transform-style-3d overflow-hidden ${!isMyTurn || safeGameState.winner ? 'bg-slate-800 border-slate-700 text-slate-600 opacity-50 cursor-not-allowed'
                                    : 'bg-gradient-to-br from-green-400 to-emerald-700 border-green-300 text-green-950 hover:scale-110 hover:rotate-6 shadow-[0_0_40px_rgba(34,197,94,0.6)] ring-4 ring-green-500/50'
                                    }`}
                            >
                                <div className="w-full h-full flex items-center justify-center relative drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                                    {/* Dynamic Dice Dots based on value 1 to 6 */}
                                    {currentFace === 1 && (
                                        <div className="w-4 h-4 md:w-6 md:h-6 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                    )}
                                    {currentFace === 2 && (
                                        <div className="w-full h-full flex justify-between p-5 md:p-6 pb-6 md:pb-8">
                                            <div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full self-start shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                            <div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full self-end shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                        </div>
                                    )}
                                    {currentFace === 3 && (
                                        <div className="w-full h-full flex flex-col justify-between items-center p-5 md:p-6 pb-6 md:pb-8">
                                            <div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full self-start shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                            <div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full self-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                            <div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full self-end shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                        </div>
                                    )}
                                    {currentFace === 4 && (
                                        <div className="w-full h-full flex flex-col justify-between p-5 md:p-6 pb-6 md:pb-8">
                                            <div className="flex justify-between w-full"><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div></div>
                                            <div className="flex justify-between w-full"><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div></div>
                                        </div>
                                    )}
                                    {currentFace === 5 && (
                                        <div className="w-full h-full flex flex-col justify-between p-5 md:p-6 pb-6 md:pb-8">
                                            <div className="flex justify-between w-full"><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div></div>
                                            <div className="flex justify-center w-full"><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div></div>
                                            <div className="flex justify-between w-full"><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div></div>
                                        </div>
                                    )}
                                    {currentFace === 6 && (
                                        <div className="w-full h-full flex flex-col justify-between p-5 md:p-6 pb-6 md:pb-8">
                                            <div className="flex justify-between w-full"><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div></div>
                                            <div className="flex justify-between w-full"><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div><div className="w-4 h-4 md:w-5 md:h-5 bg-white rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div></div>
                                        </div>
                                    )}
                                </div>
                            </motion.button>
                            {isMyTurn && !isRolling && !safeGameState.winner && (
                                <div className="absolute -top-4 -right-4 bg-yellow-400 text-yellow-950 text-xs font-black uppercase px-3 py-1.5 rounded-full shadow-lg animate-bounce border-2 border-white">
                                    Roll!
                                </div>
                            )}
                        </div>

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
