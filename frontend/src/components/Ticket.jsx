import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { playSound } from '../utils/audio';

export default function Ticket({ ticketData, drawnNumbers, onClaim, winners }) {
    const [isAutoMark, setIsAutoMark] = useState(false);
    const [manualMarks, setManualMarks] = useState([]);

    useEffect(() => {
        if (isAutoMark) {
            setManualMarks([...drawnNumbers]);
        }
    }, [drawnNumbers, isAutoMark]);

    if (!ticketData || !ticketData.numbers) return null;

    const handleCellClick = (cellValue) => {
        if (cellValue === 0 || isAutoMark) return;
        setManualMarks(prev => {
            const isMarking = !prev.includes(cellValue);
            if (isMarking) playSound('mark');
            return isMarking ? [...prev, cellValue] : prev.filter(n => n !== cellValue);
        });
    };

    // Helper checks locally for UI feedback (backend handles actual validation)
    const ticketNums = ticketData.numbers.flat().filter(n => n !== 0);
    const markedNums = ticketNums.filter(n => manualMarks.includes(n));
    const markedCount = markedNums.length;

    const rowCounts = [0, 1, 2].map(r => {
        const rowNums = ticketData.numbers[r].filter(n => n !== 0);
        const marks = rowNums.filter(n => manualMarks.includes(n));
        return { total: rowNums.length, marked: marks.length };
    });

    const isJaldi5Ready = markedCount >= 5;
    const isRowReady = (r) => rowCounts[r].marked === rowCounts[r].total && rowCounts[r].total > 0;
    const isFullHouseReady = markedCount === 15;
    const isFourCornersReady = (() => {
        const topRow = ticketData.numbers[0];
        const bottomRow = ticketData.numbers[2];
        const firstTop = topRow.find(n => n !== 0);
        const lastTop = [...topRow].reverse().find(n => n !== 0);
        const firstBot = bottomRow.find(n => n !== 0);
        const lastBot = [...bottomRow].reverse().find(n => n !== 0);
        const corners = [firstTop, lastTop, firstBot, lastBot];
        return corners.every(c => c && manualMarks.includes(c));
    })();

    const claimButtons = [
        { id: 'jaldi5', label: 'Early 5', isReady: isJaldi5Ready },
        { id: 'fourCorners', label: '4 Corners', isReady: isFourCornersReady },
        { id: 'rowTop', label: 'Top Line', isReady: isRowReady(0) },
        { id: 'rowMid', label: 'Middle Line', isReady: isRowReady(1) },
        { id: 'rowBot', label: 'Bottom Line', isReady: isRowReady(2) },
        { id: 'fullHouse', label: 'Full House', isReady: isFullHouseReady },
        { id: 'pyramid', label: 'Pyramid', isReady: markedCount >= 6 }
    ];

    return (
        <div className="flex flex-col gap-3 md:gap-4 w-full">
            {/* Ticket Grid */}
            <div className="bg-white/5 backdrop-blur-md border border-slate-700 p-2 md:p-6 rounded-2xl shadow-2xl w-full">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-slate-400 text-sm font-bold tracking-widest uppercase">Your Ticket</span>
                    <label className="flex items-center gap-2 cursor-pointer group" onClick={(e) => { e.preventDefault(); setIsAutoMark(!isAutoMark); }}>
                        <span className={`text-xs font-bold uppercase tracking-widest transition-colors ${isAutoMark ? 'text-highlight' : 'text-slate-500'}`}>
                            Auto Mark {isAutoMark ? 'ON' : 'OFF'}
                        </span>
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isAutoMark ? 'bg-highlight' : 'bg-slate-700'}`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-black shadow transition-transform ${isAutoMark ? 'translate-x-6' : 'translate-x-1'}`} />
                        </div>
                    </label>
                </div>
                <div className="grid grid-rows-3 gap-1 md:gap-2 w-full max-w-full">
                    {ticketData.numbers.map((row, rowIndex) => (
                        <div key={rowIndex} className="grid grid-cols-9 gap-0.5 sm:gap-1 md:gap-2">
                            {row.map((cellValue, colIndex) => {
                                const isNumber = cellValue !== 0;
                                const isMarked = isNumber && manualMarks.includes(cellValue);

                                return (
                                    <motion.div
                                        key={`${rowIndex}-${colIndex}`}
                                        onClick={() => handleCellClick(cellValue)}
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: (rowIndex * 9 + colIndex) * 0.02 }}
                                        className={`flex items-center justify-center border aspect-square w-full rounded text-sm sm:text-lg md:text-2xl font-black ${!isAutoMark && isNumber ? 'cursor-pointer' : ''}
                        ${!isNumber ? 'bg-transparent border-slate-800' :
                                                isMarked
                                                    ? 'bg-highlight border-highlight text-black shadow-[0_0_15px_rgba(34,197,94,0.6)] scale-105'
                                                    : 'bg-slate-800 border-slate-600 text-white hover:bg-slate-700'
                                            }
                      `}
                                    >
                                        {isNumber ? cellValue : ''}

                                        {isMarked && (
                                            <motion.div
                                                initial={{ scale: 0, rotate: -45 }}
                                                animate={{ scale: 1, rotate: 0 }}
                                                className="absolute w-full h-full flex items-center justify-center text-black/20 pointer-events-none"
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" className="w-8 h-8">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            </motion.div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    ))}
                </div>

                <div className="mt-4 flex justify-between items-center text-slate-400 text-xs md:text-sm font-medium uppercase tracking-widest border-t border-slate-800 pt-3 md:pt-4 px-2">
                    <span>ID: {ticketData.ticketId || Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
                    <span className="text-highlight font-bold">
                        {markedCount}/15
                    </span>
                </div>
            </div>

            {/* Claim Buttons */}
            {onClaim && winners && (
                <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mt-1">
                    {claimButtons.map(btn => {
                        const hasWinner = winners[btn.id];
                        const disabled = hasWinner || !btn.isReady;

                        return (
                            <button
                                key={btn.id}
                                disabled={disabled}
                                onClick={() => onClaim(btn.id)}
                                className={`py-2 px-1 md:py-3 md:px-2 rounded-xl border text-[10px] sm:text-xs md:text-base font-bold transition-all shadow-md flex flex-col items-center justify-center text-center
                                    ${hasWinner
                                        ? 'bg-slate-800 border-slate-700 text-slate-500 opacity-70 cursor-not-allowed'
                                        : btn.isReady
                                            ? 'bg-action text-white hover:bg-neonGreen hover:text-black border-action/50 hover:shadow-[0_0_20px_rgba(57,255,20,0.5)] transform hover:-translate-y-1'
                                            : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                                    }
                                `}
                            >
                                <span className="uppercase tracking-wider leading-tight">{btn.label}</span>
                                {hasWinner && <span className="text-[9px] md:text-xs text-yellow-500 mt-0.5 md:mt-1 line-clamp-1">{hasWinner.name} Won!</span>}
                                {!hasWinner && btn.isReady && <span className="text-[9px] md:text-xs mt-0.5 md:mt-1 animate-pulse">CLAIM!</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
