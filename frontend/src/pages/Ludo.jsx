import React, { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Dice5, Trophy, LogOut } from 'lucide-react';
import VoiceChat from '../components/VoiceChat';
import EmojiOverlay from '../components/EmojiOverlay';
import VFXOverlay from '../components/VFXOverlay';

// Ludo 52-step peripheral track coordinates (x=col, y=row)
// Mapped globally per typical Ludo layout.
const TRACK = [
    { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 },
    { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 }, { x: 6, y: 1 }, { x: 6, y: 0 },
    { x: 7, y: 0 }, { x: 8, y: 0 },
    { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 },
    { x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 12, y: 6 }, { x: 13, y: 6 }, { x: 14, y: 6 },
    { x: 14, y: 7 }, { x: 14, y: 8 },
    { x: 13, y: 8 }, { x: 12, y: 8 }, { x: 11, y: 8 }, { x: 10, y: 8 }, { x: 9, y: 8 },
    { x: 8, y: 9 }, { x: 8, y: 10 }, { x: 8, y: 11 }, { x: 8, y: 12 }, { x: 8, y: 13 }, { x: 8, y: 14 },
    { x: 7, y: 14 }, { x: 6, y: 14 },
    { x: 6, y: 13 }, { x: 6, y: 12 }, { x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 },
    { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 }, { x: 0, y: 8 },
    { x: 0, y: 7 }, { x: 0, y: 6 }
];

const getGlobalPos = (color, relPos) => {
    if (relPos < 0 || relPos > 50) return null;
    const offsets = { red: 0, green: 13, yellow: 26, blue: 39 };
    return (offsets[color] + relPos) % 52;
};

const getPosCoordinates = (color, tokenIdx, relPos) => {
    if (relPos === -1) {
        // Precise clusters within the 4 round sandpits.
        // Pits are at x=1,y=1 (4x4), x=10,y=1, x=1,y=10, x=10,y=10
        // Centers are 2.5 and 11.5. Token radius offsets by ~0.7 cells.
        const bases = {
            blue: [{ x: 1.5, y: 1.5 }, { x: 3.5, y: 1.5 }, { x: 1.5, y: 3.5 }, { x: 3.5, y: 3.5 }],
            red: [{ x: 10.5, y: 1.5 }, { x: 12.5, y: 1.5 }, { x: 10.5, y: 3.5 }, { x: 12.5, y: 3.5 }],
            yellow: [{ x: 1.5, y: 10.5 }, { x: 3.5, y: 10.5 }, { x: 1.5, y: 12.5 }, { x: 3.5, y: 12.5 }],
            green: [{ x: 10.5, y: 10.5 }, { x: 12.5, y: 10.5 }, { x: 10.5, y: 12.5 }, { x: 12.5, y: 12.5 }]
        };
        return bases[color][tokenIdx];
    }

    if (relPos >= 0 && relPos <= 50) {
        return TRACK[getGlobalPos(color, relPos)];
    }

    // Home Stretch (51 - 55)
    // Yellow home row is y=7, filling x=1 to 5
    // Blue home col is x=7, filling y=1 to 5
    // Red home row is y=7, filling x=13 to 9
    // Green home col is x=7, filling y=13 to 9
    const steps = relPos - 50;
    if (color === 'yellow') return { x: steps, y: 7 };
    if (color === 'blue') return { x: 7, y: steps };
    if (color === 'red') return { x: 14 - steps, y: 7 };
    if (color === 'green') return { x: 7, y: 14 - steps };

    // 56 (Finished in center)
    return { x: 7, y: 7 };
};

const COLOR_MAP = {
    red: '#EF4444',
    green: '#22C55E',
    yellow: '#EAB308',
    blue: '#3B82F6'
};

export default function Ludo() {
    const { user, socket, roomCode, gameState, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    const [isRolling, setIsRolling] = useState(false);
    const [currentFace, setCurrentFace] = useState(1);

    const safeGameState = gameState || { players: [], winner: null, turn: null, tokens: {}, colors: {}, history: [] };
    const isMyTurn = safeGameState.turn === user.id;

    // Keep dice dots in sync, and flicker randomly while rolling
    useEffect(() => {
        let interval;
        if (isRolling) {
            interval = setInterval(() => {
                setCurrentFace(Math.floor(Math.random() * 6) + 1);
            }, 80); // Fast 80ms flicker
        } else if (safeGameState.lastDice) {
            setCurrentFace(safeGameState.lastDice);
        }
        return () => clearInterval(interval);
    }, [isRolling, safeGameState.lastDice]);

    const [vfxType, setVfxType] = useState(null);
    const [vfxTrigger, setVfxTrigger] = useState(0);

    const prevHistoryLength = React.useRef(safeGameState.history?.length || 0);
    useEffect(() => {
        if (safeGameState.history?.length > prevHistoryLength.current) {
            const latest = safeGameState.history[safeGameState.history.length - 1];
            if (latest.type === 'capture') {
                setVfxType('kill');
                setVfxTrigger(v => v + 1);
            }
        }
        prevHistoryLength.current = safeGameState.history?.length || 0;
    }, [safeGameState.history]);

    const prevWinner = React.useRef(safeGameState.winner);
    useEffect(() => {
        if (!prevWinner.current && safeGameState.winner) {
            setVfxType('victory');
            setVfxTrigger(v => v + 1);
        }
        prevWinner.current = safeGameState.winner;
    }, [safeGameState.winner]);

    const handleRoll = () => {
        if (!isMyTurn || safeGameState.winner || safeGameState.diceRolled) return;
        setIsRolling(true);
        socket.emit('rollDiceLudo', { roomCode, userId: user.id });
        setTimeout(() => {
            setIsRolling(false);
        }, 600);
    };

    const handleTokenClick = (tokenIndex, ownerId) => {
        if (!isMyTurn || ownerId !== user.id || !safeGameState.diceRolled) return;

        const dice = safeGameState.lastDice;
        const pos = safeGameState.tokens[user.id][tokenIndex];

        // Validation check for UI feedback
        let valid = false;
        if (pos === -1 && dice === 6) valid = true;
        if (pos >= 0 && pos + dice <= 56) valid = true;

        if (valid) {
            socket.emit('moveTokenLudo', { roomCode, userId: user.id, tokenIndex });
        }
    };

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    const renderBoardBackground = () => {
        const cells = [];

        // 1. Render giant sand-pits
        const sandPits = [
            { x: 1, y: 1, color: 'blue' },
            { x: 10, y: 1, color: 'red' },
            { x: 1, y: 10, color: 'yellow' },
            { x: 10, y: 10, color: 'green' }
        ];

        sandPits.forEach(pit => {
            cells.push(
                <div key={`pit-${pit.color}`} className="absolute bg-[#e8dcb8] rounded-full shadow-[0_10px_20px_rgba(0,0,0,0.6),inset_0_0_30px_rgba(0,0,0,0.2)] border-[3px] md:border-4 border-[#c7b58c] z-0"
                    style={{
                        left: `${(pit.x / 15) * 100}%`,
                        top: `${(pit.y / 15) * 100}%`,
                        width: `${(4 / 15) * 100}%`,
                        height: `${(4 / 15) * 100}%`,
                        backgroundImage: `url("https://www.transparenttextures.com/patterns/sandpaper.png")`
                    }}
                >
                    {/* Token indentations */}
                    {[{ tx: 0.5, ty: 0.5 }, { tx: 2.5, ty: 0.5 }, { tx: 0.5, ty: 2.5 }, { tx: 2.5, ty: 2.5 }].map((pos, i) => (
                        <div key={`ind-${i}`} className="absolute bg-[#d6c79e] rounded-full shadow-[inset_0_5px_10px_rgba(0,0,0,0.5)] border border-[#a89874]" style={{
                            left: `${(pos.tx / 4) * 100}%`,
                            top: `${(pos.ty / 4) * 100}%`,
                            width: `${1 / 4 * 100}%`,
                            height: `${1 / 4 * 100}%`,
                        }} />
                    ))}
                </div>
            );
        });

        // 2. Render Path tiles
        for (let r = 0; r < 15; r++) {
            for (let c = 0; c < 15; c++) {
                const isPath = TRACK.some(pos => pos.x === c && pos.y === r);
                const isHomeStretch =
                    (r === 7 && c >= 1 && c <= 5) || // Yellow
                    (c === 7 && r >= 1 && r <= 5) || // Blue
                    (r === 7 && c >= 9 && c <= 13) || // Red
                    (c === 7 && r >= 9 && r <= 13);   // Green

                if (isPath || isHomeStretch) {
                    let bg = 'bg-[#f0c386]'; // default light wood
                    let isSafe = false;

                    // Starts (match exact screenshot colors)
                    if (r === 6 && c === 1) bg = 'bg-[#FDE047]'; // Yellow
                    else if (r === 1 && c === 8) bg = 'bg-[#93C5FD]'; // Blue
                    else if (r === 8 && c === 13) bg = 'bg-[#FCA5A5]'; // Red
                    else if (r === 13 && c === 6) bg = 'bg-[#86EFAC]'; // Green

                    // Other Safes
                    else if (r === 2 && c === 6) { bg = 'bg-[#93C5FD]'; isSafe = true; } // Blue arm safe
                    else if (r === 6 && c === 12) { bg = 'bg-[#FCA5A5]'; isSafe = true; } // Red arm safe
                    else if (r === 12 && c === 8) { bg = 'bg-[#86EFAC]'; isSafe = true; } // Green arm safe
                    else if (r === 8 && c === 2) { bg = 'bg-[#FDE047]'; isSafe = true; } // Yellow arm safe

                    // Home stretches
                    else if (r === 7 && c >= 1 && c <= 5) bg = 'bg-[#FDE047]';
                    else if (c === 7 && r >= 1 && r <= 5) bg = 'bg-[#93C5FD]';
                    else if (r === 7 && c >= 9 && c <= 13) bg = 'bg-[#FCA5A5]';
                    else if (c === 7 && r >= 9 && r <= 13) bg = 'bg-[#86EFAC]';

                    cells.push(
                        <div key={`${r}-${c}`}
                            className={`absolute border-[1px] md:border-[2px] border-[#825424] shadow-[inset_0_0_5px_rgba(0,0,0,0.3)] ${bg} flex items-center justify-center z-10 rounded-[1px]`}
                            style={{
                                left: `${(c / 15) * 100}%`,
                                top: `${(r / 15) * 100}%`,
                                width: `${100 / 15}%`,
                                height: `${100 / 15}%`,
                                backgroundImage: `url("https://www.transparenttextures.com/patterns/wood-pattern.png")`
                            }}
                        >
                            {isSafe && <span className="text-white/60 text-xs md:text-xl drop-shadow-md pb-1 pointer-events-none opacity-50 block">🍷</span>}
                        </div>
                    );
                }
            }
        }

        // 3. Center Cross Triangles
        cells.push(
            <div key="center-home" className="absolute z-10" style={{
                left: `${(6 / 15) * 100}%`, top: `${(6 / 15) * 100}%`, width: `${(3 / 15) * 100}%`, height: `${(3 / 15) * 100}%`
            }}>
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(0,0,0,0.6)]">
                    <polygon points="0,0 50,50 0,100" fill="#FACC15" stroke="#78350F" strokeWidth="2" />
                    <polygon points="0,0 100,0 50,50" fill="#60A5FA" stroke="#78350F" strokeWidth="2" />
                    <polygon points="100,0 100,100 50,50" fill="#F87171" stroke="#78350F" strokeWidth="2" />
                    <polygon points="0,100 100,100 50,50" fill="#4ADE80" stroke="#78350F" strokeWidth="2" />
                </svg>
            </div>
        );

        return cells;
    };

    const renderPlayerTags = () => {
        return safeGameState.players?.map(p => {
            const pColorName = safeGameState.colors?.[p.id];
            if (!pColorName) return null;

            // Positioning exactly over the 4 quadrants corresponding to the reference image
            let posProps = {};
            if (pColorName === 'blue') posProps = { left: '8%', top: '2%' };
            if (pColorName === 'red') posProps = { right: '8%', top: '2%' };
            if (pColorName === 'yellow') posProps = { left: '8%', bottom: '2%' };
            if (pColorName === 'green') posProps = { right: '25%', bottom: '2%' }; // Kept away from Dice!

            const isTurn = safeGameState.turn === p.id;

            return (
                <div key={p.id} className={`absolute flex flex-col items-center gap-1 z-30 pointer-events-none transition-all duration-300 ${isTurn ? 'scale-110 drop-shadow-[0_0_20px_#FDE047]' : 'opacity-90'}`} style={posProps}>
                    <div className="w-10 h-10 md:w-16 md:h-16 rounded-xl border-4 flex items-center justify-center font-black text-white text-xl md:text-3xl shadow-[0_5px_15px_rgba(0,0,0,0.8)]" style={{
                        backgroundColor: COLOR_MAP[pColorName],
                        borderColor: '#5c3a21',
                        backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")'
                    }}>
                        👤
                    </div>
                    <div className={`
                        bg-[#825424] border-2 border-[#4a2e15] rounded text-white text-[8px] md:text-xs font-bold shadow-lg px-2 md:px-4 py-0.5 md:py-1 truncate max-w-[80px] md:max-w-[120px] text-center
                    `} style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")' }}>
                        {p.name}
                        {p.id === user.id && <span className="text-yellow-300 text-[6px] md:text-[8px] block">(YOU)</span>}
                    </div>
                </div>
            )
        });
    };

    if (!user || !roomCode) return null;

    return (
        <div className="min-h-screen flex flex-col items-center p-2 md:p-4 text-emerald-900" style={{ backgroundColor: '#2d3a1f' }}>
            <EmojiOverlay />
            <VFXOverlay type={vfxType} trigger={vfxTrigger} message={safeGameState.winner === user.id ? 'VICTORY' : 'DEFEAT'} />

            {/* Custom Wooden Header Bar */}
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-6xl flex flex-wrap items-center justify-between mb-4 bg-[#633a1e] p-3 md:p-4 rounded-2xl border-[3px] md:border-[4px] border-[#3d2210] shadow-[0_15px_30px_rgba(0,0,0,0.6)] gap-3" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")' }}>
                <div className="flex items-center gap-3 md:gap-4">
                    <button onClick={leaveRoom} className="p-3 bg-red-600/90 text-white hover:bg-red-500 rounded-xl transition-colors shadow-lg border-2 border-red-900">
                        <LogOut size={20} />
                    </button>
                    <div>
                        <div className="text-[10px] md:text-xs text-amber-300 font-black tracking-widest uppercase drop-shadow-md">Classic Board</div>
                        <div className="text-lg md:text-xl font-black text-white tracking-[0.2em]">{roomCode}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-[#4a2e15] p-2 rounded-xl border border-[#2b190a] shadow-inner">
                    <VoiceChat />
                </div>
            </motion.div>

            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-6xl flex justify-center pb-20 relative">

                {/* FULL SCREEN HERO BOARD */}
                <div className="w-full aspect-square max-w-[95vw] md:max-w-[85vh] xl:max-w-[900px] xl:h-[900px] mx-auto rounded-md md:rounded-[1rem] border-[10px] md:border-[16px] border-[#5c3a21] p-[1%] relative z-10 shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden" style={{ backgroundColor: '#5c8a32', backgroundImage: 'url("https://www.transparenttextures.com/patterns/dark-matter.png")' }}>

                    <div className="w-full h-full relative" style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)' }}>
                        {renderBoardBackground()}
                        {renderPlayerTags()}

                        {/* Token Overlay Rendering */}
                        <AnimatePresence>
                            {safeGameState.players?.map(p => {
                                const pColorName = safeGameState.colors?.[p.id];
                                const tokensArray = safeGameState.tokens?.[p.id];
                                if (!pColorName || !tokensArray) return null;

                                return tokensArray.map((relPos, tIdx) => {
                                    const coords = getPosCoordinates(pColorName, tIdx, relPos);
                                    if (!coords) return null;

                                    const canMove = isMyTurn && p.id === user.id && safeGameState.diceRolled &&
                                        ((relPos === -1 && safeGameState.lastDice === 6) || (relPos >= 0 && relPos + safeGameState.lastDice <= 56));

                                    return (
                                        <motion.div
                                            layout
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0, opacity: 0 }}
                                            key={`${p.id}-t${tIdx}`}
                                            className="absolute flex items-center justify-center pointer-events-none z-30"
                                            style={{
                                                left: `${(coords.x / 15) * 100}%`,
                                                top: `${(coords.y / 15) * 100}%`,
                                                width: `${100 / 15}%`,
                                                height: `${100 / 15}%`,
                                            }}
                                        >
                                            <motion.div
                                                className={`w-[85%] h-[85%] rounded-full shadow-[0_8px_10px_rgba(0,0,0,0.6),inset_0_-5px_15px_rgba(0,0,0,0.5)] flex flex-col items-center pt-[15%] transition-transform
                                                   ${canMove ? 'pointer-events-auto cursor-pointer border-white ring-4 ring-white/50 animate-bounce z-50 shadow-[0_0_20px_#ffffff]' : 'border-black/50 pointer-events-none'}
                                                `}
                                                style={{
                                                    background: `radial-gradient(circle at 35% 35%, ${COLOR_MAP[pColorName]} 5%, #000 120%)`,
                                                    borderWidth: '2px'
                                                }}
                                                whileTap={canMove ? { scale: 0.8 } : {}}
                                                onClick={() => handleTokenClick(tIdx, p.id)}
                                            >
                                                {/* Mini cute eyes for characters! */}
                                                <div className="flex gap-[15%] w-[45%] h-[30%]">
                                                    <div className="w-[45%] h-full bg-white rounded-full relative shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                                                        <div className="absolute w-[40%] h-[40%] bg-black rounded-full top-[30%] left-[30%]"></div>
                                                    </div>
                                                    <div className="w-[45%] h-full bg-white rounded-full relative shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                                                        <div className="absolute w-[40%] h-[40%] bg-black rounded-full top-[30%] left-[30%]"></div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </motion.div>
                                    );
                                });
                            })}
                        </AnimatePresence>

                        {/* GIANT ABSOLUTE OVERLAY DICE BUTTON */}
                        <div className="absolute bottom-[2%] right-[2%] z-[100] flex flex-col items-center pointer-events-auto perspective-[1500px]">
                            <motion.button
                                onClick={handleRoll}
                                disabled={!isMyTurn || safeGameState.diceRolled || isRolling || safeGameState.winner}
                                animate={isRolling ? {
                                    rotateX: [0, 400, -200, 720, 1080],
                                    rotateY: [0, 360, 900, -180, 720],
                                    rotateZ: [0, 180, -90, 360, 0],
                                    scale: [1, 1.4, 0.6, 1.1, 1],
                                    z: [0, 150, -80, 50, 0],
                                    y: [0, -40, 20, -10, 0]
                                } : { rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1, z: 0, y: 0 }}
                                transition={{ duration: 0.8, times: [0, 0.25, 0.5, 0.75, 1], ease: "anticipate" }}
                                className={`w-16 h-16 md:w-28 md:h-28 rounded-[20%] flex flex-col items-center justify-center border-[3px] md:border-4 shadow-[0_10px_20px_rgba(0,0,0,0.8),inset_0_5px_15px_rgba(255,255,255,0.4)] transition-colors transform-style-3d overflow-hidden ${!isMyTurn || safeGameState.winner ? 'bg-gradient-to-b from-slate-300 to-slate-500 border-slate-600 opacity-90 cursor-not-allowed'
                                    : safeGameState.diceRolled ? 'bg-gradient-to-b from-yellow-300 to-yellow-600 border-yellow-700 text-yellow-950 cursor-default shadow-[0_0_30px_rgba(234,179,8,0.8)]'
                                        : 'bg-gradient-to-b from-[#ffedb5] to-[#f5b82e] border-[#b07b1e] text-[#5e410b] hover:scale-105 shadow-[0_0_50px_rgba(234,179,8,1)] ring-4 ring-yellow-400'
                                    }`}
                                style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")' }}
                            >
                                <div className="w-full h-full flex items-center justify-center relative drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                                    {/* Dynamic Dice Dots based on value 1 to 6 */}
                                    {currentFace === 1 && (
                                        <div className="w-4 h-4 md:w-6 md:h-6 bg-[#4a2e15] rounded-full shadow-inner"></div>
                                    )}
                                    {currentFace === 2 && (
                                        <div className="w-full h-full flex justify-between p-3 md:p-6 pb-4 md:pb-8">
                                            <div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full self-start shadow-inner"></div>
                                            <div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full self-end shadow-inner"></div>
                                        </div>
                                    )}
                                    {currentFace === 3 && (
                                        <div className="w-full h-full flex flex-col justify-between items-center p-3 md:p-6 pb-4 md:pb-8">
                                            <div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full self-start shadow-inner"></div>
                                            <div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full self-center shadow-inner"></div>
                                            <div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full self-end shadow-inner"></div>
                                        </div>
                                    )}
                                    {currentFace === 4 && (
                                        <div className="w-full h-full flex flex-col justify-between p-3 md:p-6 pb-4 md:pb-8">
                                            <div className="flex justify-between w-full"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div></div>
                                            <div className="flex justify-between w-full"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div></div>
                                        </div>
                                    )}
                                    {currentFace === 5 && (
                                        <div className="w-full h-full flex flex-col justify-between p-3 md:p-6 pb-4 md:pb-8">
                                            <div className="flex justify-between w-full"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div></div>
                                            <div className="flex justify-center w-full"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div></div>
                                            <div className="flex justify-between w-full"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div></div>
                                        </div>
                                    )}
                                    {currentFace === 6 && (
                                        <div className="w-full h-full flex flex-col justify-between p-3 md:p-6 pb-4 md:pb-8">
                                            <div className="flex justify-between w-full"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div></div>
                                            <div className="flex justify-between w-full"><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div><div className="w-3 h-3 md:w-5 md:h-5 bg-[#4a2e15] rounded-full shadow-inner"></div></div>
                                        </div>
                                    )}
                                </div>
                            </motion.button>
                            {safeGameState.diceRolled && isMyTurn && (
                                <div className="absolute -top-3 -right-3 md:-top-5 md:-right-5 bg-green-500 text-white text-[8px] md:text-sm font-black uppercase px-2 md:px-4 py-1 rounded-full shadow-lg animate-bounce border-2 border-white whitespace-nowrap">
                                    Move!
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </motion.div>

            {/* ACTION STATUS / HISTORY */}
            {safeGameState.winner && (
                <div className="w-full max-w-xl mx-auto mt-4 px-4 z-20">
                    <button onClick={() => socket.emit('restartGame', { roomCode, userId: user.id })} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-yellow-950 rounded-xl font-black uppercase tracking-widest border-[4px] border-[#825424] shadow-[0_10px_20px_rgba(0,0,0,0.8)] text-xl" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")' }}>
                        Play Rematch!
                    </button>
                </div>
            )}

            <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-4 mt-8">
                {/* Recent History Feed */}
                <div className="flex-1 bg-[#4a2e15]/80 rounded-3xl p-4 md:p-6 border-[4px] border-[#3d2210] shadow-xl flex flex-col relative z-20" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")' }}>
                    <h3 className="text-amber-200 font-bold uppercase tracking-widest text-xs mb-4">Live History Log</h3>
                    <div className="w-full flex flex-col gap-2 overflow-y-auto max-h-48 custom-scrollbar">
                        {safeGameState.history?.slice().reverse().map((h, i) => {
                            const p = safeGameState.players?.find(p => p.id === h.userId);
                            return (
                                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} key={i} className={`flex justify-between items-center text-xs p-3 rounded-xl border-2 ${h.type === 'capture' ? 'bg-red-950/90 border-red-900 shadow-inner' : 'bg-black/30 border-[#3d2210]'}`}>
                                    <span className="text-white font-bold truncate">{p?.name}</span>
                                    {h.type === 'roll' ? (
                                        <div className="flex gap-2 items-center">
                                            <span className="text-amber-500">Rolled a </span>
                                            <span className="font-black text-white text-lg bg-black/50 px-3 py-1 rounded shadow-inner text-[#FDE047]">{h.value}</span>
                                        </div>
                                    ) : h.type === 'capture' ? (
                                        <span className="text-red-500 font-black uppercase tracking-widest animate-pulse">Eliminated Opponent 💀</span>
                                    ) : null}
                                </motion.div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
