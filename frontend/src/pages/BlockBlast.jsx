import React, { useState, useEffect, useContext, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, LogOut, RotateCcw } from 'lucide-react';
import { playSound } from '../utils/audio';

// Block Blast Clone
// 20 Standard Tetromino/Pentomino Style Block Shapes
const SHAPES = [
    { shape: [[1]], color: '#f87171' }, // Red
    { shape: [[1, 1]], color: '#fb923c' }, // Orange
    { shape: [[1, 1, 1]], color: '#facc15' }, // Yellow
    { shape: [[1, 1, 1, 1]], color: '#4ade80' }, // Green
    { shape: [[1, 1, 1, 1, 1]], color: '#2dd4bf' }, // Teal
    { shape: [[1], [1]], color: '#fb923c' }, // Orange
    { shape: [[1], [1], [1]], color: '#facc15' }, // Yellow
    { shape: [[1], [1], [1], [1]], color: '#4ade80' }, // Green
    { shape: [[1], [1], [1], [1], [1]], color: '#2dd4bf' }, // Teal
    { shape: [[1, 1], [1, 1]], color: '#60a5fa' }, // Blue
    { shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], color: '#818cf8' }, // Indigo
    { shape: [[1, 0], [1, 1]], color: '#c084fc' }, // Purple
    { shape: [[0, 1], [1, 1]], color: '#c084fc' }, // Purple
    { shape: [[1, 1], [1, 0]], color: '#c084fc' }, // Purple
    { shape: [[1, 1], [0, 1]], color: '#c084fc' }, // Purple
    { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], color: '#f472b6' }, // Pink
    { shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], color: '#f472b6' }, // Pink
    { shape: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], color: '#f472b6' }, // Pink
    { shape: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], color: '#f472b6' }, // Pink
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#38bdf8' }, // Light Blue
    { shape: [[1, 1, 1], [0, 1, 0]], color: '#38bdf8' }, // Light Blue
    { shape: [[1, 0], [1, 1], [1, 0]], color: '#38bdf8' }, // Light Blue
    { shape: [[0, 1], [1, 1], [0, 1]], color: '#38bdf8' } // Light Blue
];

const BOARD_SIZE = 8;
const EMPTY_CELL = null;

const createEmptyBoard = () => Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY_CELL));

export default function BlockBlast() {
    const { user, roomCode, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    const [board, setBoard] = useState(createEmptyBoard());
    const [score, setScore] = useState(0);
    const [blocks, setBlocks] = useState([]);
    const [gameOver, setGameOver] = useState(false);

    const boardRef = useRef(null);
    const [hoverPos, setHoverPos] = useState(null);

    // Juicy FX State
    const [shake, setShake] = useState(false);
    const [comboMessage, setComboMessage] = useState(null);
    const [clearingCells, setClearingCells] = useState([]);

    // Custom pointer drag state
    const [dragState, setDragState] = useState({
        isDragging: false,
        blockIndex: null,
        x: 0,
        y: 0,
        offsetX: 0,
        offsetY: 0,
        width: 0,
        height: 0,
        cellSize: 0
    });

    // Helper: Anti-frustration block generation
    const generateBlocks = () => {
        const newBlocks = [];
        for (let i = 0; i < 3; i++) {
            const randomShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            newBlocks.push({ ...randomShape, id: Math.random().toString(36).substring(7), isUsed: false });
        }
        setBlocks(newBlocks);
    };

    useEffect(() => {
        if (blocks.length === 0 && !gameOver) {
            generateBlocks();
        }
    }, [blocks, gameOver]);

    // Game Over Detection
    useEffect(() => {
        if (blocks.length > 0 && !gameOver) {
            const availableBlocks = blocks.filter(b => !b.isUsed);
            if (availableBlocks.length > 0) {
                let canPlaceAny = false;
                for (let block of availableBlocks) {
                    if (canPlaceBlockAnywhere(block.shape)) {
                        canPlaceAny = true;
                        break;
                    }
                }
                if (!canPlaceAny) {
                    setGameOver(true);
                }
            } else {
                generateBlocks(); // All 3 used, regenerate immediately
            }
        }
    }, [board, blocks, gameOver]);

    const canPlaceBlockAnywhere = (shape) => {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (isValidPlacement(shape, r, c)) return true;
            }
        }
        return false;
    };

    const isValidPlacement = (shape, startRow, startCol) => {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] === 1) {
                    const boardR = startRow + r;
                    const boardC = startCol + c;
                    if (boardR < 0 || boardR >= BOARD_SIZE || boardC < 0 || boardC >= BOARD_SIZE) return false;
                    if (board[boardR][boardC] !== EMPTY_CELL) return false;
                }
            }
        }
        return true;
    };

    // --- CUSTOM DRAG LOGIC ---
    const handlePointerDown = (e, index) => {
        if (blocks[index].isUsed || gameOver) return;

        const boardRect = boardRef.current ? boardRef.current.getBoundingClientRect() : null;
        // Board size gives pixel width. 4px gap means logical cell is (width + 4) / 8.
        const actCellSize = boardRect ? (boardRect.width + 4) / BOARD_SIZE : 40;

        // Let's position the floating block centered horizontally on the cursor
        const shape = blocks[index].shape;
        const widthPx = shape[0].length * actCellSize;
        const heightPx = shape.length * actCellSize;

        setDragState({
            isDragging: true,
            blockIndex: index,
            x: e.clientX,
            y: e.clientY,
            offsetX: widthPx / 2, // center horizontally on pointer
            offsetY: heightPx + 20, // place above pointer by 20px
            width: widthPx,
            height: heightPx,
            cellSize: actCellSize
        });

        // Disable scroll while dragging on touch devices
        document.body.style.overflow = 'hidden';
    };

    const handlePointerMove = (e) => {
        if (!dragState.isDragging || dragState.blockIndex === null || !boardRef.current) return;

        // Position the floating block
        const floatingX = e.clientX - dragState.offsetX;
        const floatingY = e.clientY - dragState.offsetY;

        setDragState(prev => ({ ...prev, x: floatingX, y: floatingY }));

        const boardRect = boardRef.current.getBoundingClientRect();

        const boardRelativeX = floatingX - boardRect.left;
        const boardRelativeY = floatingY - boardRect.top;

        // Snapping Math: round to closest logical cell start
        const col = Math.round(boardRelativeX / dragState.cellSize);
        const row = Math.round(boardRelativeY / dragState.cellSize);

        const activeShape = blocks[dragState.blockIndex].shape;

        if (isValidPlacement(activeShape, row, col)) {
            setHoverPos({ row, col });
        } else {
            setHoverPos(null);
        }
    };

    const handlePointerUp = (e) => {
        if (!dragState.isDragging) return;

        if (hoverPos !== null && dragState.blockIndex !== null) {
            placeBlock(blocks[dragState.blockIndex], hoverPos.row, hoverPos.col, dragState.blockIndex);

            // Try to play sound if defined
            try { playSound('win'); } catch (e) { }
        }

        setDragState({
            isDragging: false,
            blockIndex: null,
            x: 0, y: 0, offsetX: 0, offsetY: 0, width: 0, height: 0, cellSize: 0
        });
        setHoverPos(null);
        document.body.style.overflow = 'auto'; // Re-enable scroll
    };

    // Global pointer events to track dragging anywhere on the screen
    useEffect(() => {
        if (dragState.isDragging) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [dragState.isDragging, hoverPos]);

    const placeBlock = (block, startRow, startCol, blockIndex) => {
        const shape = block.shape;
        const color = block.color;

        const newBoard = board.map(row => [...row]);
        let pointsEarned = 10;

        // Apply block to board
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] === 1) {
                    newBoard[startRow + r][startCol + c] = color;
                }
            }
        }

        const newBlocksState = [...blocks];
        newBlocksState[blockIndex].isUsed = true;
        setBlocks(newBlocksState);

        let rowsToClear = [];
        let colsToClear = [];

        // Check rows
        for (let r = 0; r < BOARD_SIZE; r++) {
            let rowFull = true;
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (newBoard[r][c] === EMPTY_CELL) {
                    rowFull = false;
                    break;
                }
            }
            if (rowFull) rowsToClear.push(r);
        }

        // Check columns
        for (let c = 0; c < BOARD_SIZE; c++) {
            let colFull = true;
            for (let r = 0; r < BOARD_SIZE; r++) {
                if (newBoard[r][c] === EMPTY_CELL) {
                    colFull = false;
                    break;
                }
            }
            if (colFull) colsToClear.push(c);
        }

        const linesCleared = rowsToClear.length + colsToClear.length;

        if (linesCleared > 0) {
            pointsEarned += (linesCleared * 100);
            let message = "GREAT!";

            if (linesCleared > 1) {
                pointsEarned += 50 * linesCleared; // Combo Bonus
                message = `COMBO x${linesCleared}!`;
                if (linesCleared >= 4) message = "UNBELIEVABLE!";
                else if (linesCleared === 3) message = "AWESOME!";
            }

            // Trigger Juicy Effects
            setComboMessage(message);
            setShake(true);
            setTimeout(() => setShake(false), 300);
            setTimeout(() => setComboMessage(null), 1500);

            const cellsToAnimate = [];
            rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) cellsToAnimate.push(`${r}-${c}`) });
            colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) cellsToAnimate.push(`${r}-${c}`) });
            setClearingCells(cellsToAnimate);

            try { playSound('error'); } catch (e) { } // Audio feedback

            // Set board with blocks placed but BEFORE lines clear (so they flash)
            setBoard([...newBoard]);

            // Delay actual logic clearing for animation duration
            setTimeout(() => {
                rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) newBoard[r][c] = EMPTY_CELL; });
                colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) newBoard[r][c] = EMPTY_CELL; });
                setScore(prev => prev + pointsEarned);
                setBoard([...newBoard]);
                setClearingCells([]);
            }, 300); // 300ms explosion duration

            return;
        }

        setScore(prev => prev + pointsEarned);
        setBoard(newBoard);
    };

    const restartGame = () => {
        setBoard(createEmptyBoard());
        setScore(0);
        setGameOver(false);
        setBlocks([]);
    };

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    if (!user) return null;

    // Helper function to render a single block accurately (used both in inventory and dragging tooltip)
    const renderBlockStructure = (blockShape, color, scale = 1, isDragging = false, exactCellSize = null) => (
        <div
            className="grid"
            style={{
                gridTemplateColumns: `repeat(${blockShape[0].length}, 1fr)`,
                gap: '4px',
                transform: `scale(${scale})`,
                transformOrigin: isDragging ? 'top left' : 'center',
            }}
        >
            {blockShape.map((row, r) => (
                row.map((cell, c) => {
                    const cellStyle = exactCellSize ? {
                        width: `${exactCellSize - 4}px`,
                        height: `${exactCellSize - 4}px`,
                        backgroundColor: cell === 1 ? color : 'transparent',
                        boxShadow: cell === 1 ? `inset 0 0 8px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.5)` : 'none'
                    } : {
                        backgroundColor: cell === 1 ? color : 'transparent',
                        boxShadow: cell === 1 ? `inset 0 0 8px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.5)` : 'none'
                    };

                    return (
                        <div
                            key={`${r}-${c}`}
                            className={exactCellSize ? "rounded-[3px]" : "w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 rounded-[3px]"}
                            style={cellStyle}
                        />
                    );
                })
            ))}
        </div>
    );

    // --- PREVIEW CLEAR LOGIC ---
    let previewClearingCells = [];
    if (hoverPos && dragState.isDragging && dragState.blockIndex !== null) {
        const activeShape = blocks[dragState.blockIndex].shape;
        const simBoard = board.map(row => [...row]);
        for (let r = 0; r < activeShape.length; r++) {
            for (let c = 0; c < activeShape[r].length; c++) {
                if (activeShape[r][c] === 1) {
                    const simR = hoverPos.row + r;
                    const simC = hoverPos.col + c;
                    if (simR >= 0 && simR < BOARD_SIZE && simC >= 0 && simC < BOARD_SIZE) {
                        simBoard[simR][simC] = 1;
                    }
                }
            }
        }

        let pRows = [];
        let pCols = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (simBoard[r].every(cell => cell !== null)) pRows.push(r);
        }
        for (let c = 0; c < BOARD_SIZE; c++) {
            let colFull = true;
            for (let r = 0; r < BOARD_SIZE; r++) {
                if (simBoard[r][c] === null) { colFull = false; break; }
            }
            if (colFull) pCols.push(c);
        }

        pRows.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) previewClearingCells.push(`${r}-${c}`) });
        pCols.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) previewClearingCells.push(`${r}-${c}`) });
    }

    return (
        <div className="min-h-screen flex flex-col items-center p-4 bg-slate-950 text-white font-sans overflow-hidden touch-none relative select-none">
            {/* Ambient Lighting */}
            <div className="absolute top-0 left-1/4 w-[50vw] h-[50vw] bg-violet-600/10 blur-[150px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-[40vw] h-[40vw] bg-action/10 blur-[120px] rounded-full pointer-events-none"></div>

            {/* Header */}
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-lg flex items-center justify-between mb-8 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md relative z-10">
                <button onClick={leaveRoom} className="p-3 bg-red-600/90 text-white hover:bg-red-500 rounded-xl transition-colors shadow-lg border border-red-900">
                    <LogOut size={20} />
                </button>
                <div className="text-center">
                    <div className="text-xs text-info font-black tracking-widest uppercase mb-1 drop-shadow-md">BLOCK BLAST</div>
                    <div className="text-3xl font-black text-white tracking-wider flex items-center justify-center gap-2">
                        <Trophy size={28} className="text-yellow-400" /> {score}
                    </div>
                </div>
                <button onClick={restartGame} className="p-3 bg-slate-800 text-white hover:bg-slate-700 rounded-xl transition-colors border border-slate-700">
                    <RotateCcw size={20} />
                </button>
            </motion.div>

            {/* Interactive Board Container */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={shake ? { scale: 1, opacity: 1, x: [-5, 5, -5, 5, 0], y: [-2, 2, -2, 2, 0] } : { scale: 1, opacity: 1, x: 0, y: 0 }}
                transition={shake ? { duration: 0.3 } : { duration: 0.2 }}
                className="w-full max-w-[340px] sm:max-w-md aspect-square mx-auto bg-slate-900/80 rounded-2xl p-2 sm:p-3 border border-slate-800 shadow-[0_0_40px_rgba(0,0,0,0.5)] relative z-10 backdrop-blur-sm"
            >
                <AnimatePresence>
                    {comboMessage && (
                        <motion.div
                            initial={{ scale: 0.2, opacity: 0, y: 20 }}
                            animate={{ scale: 1.2, opacity: 1, y: 0 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 300, damping: 15 }}
                            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                        >
                            <span
                                className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-yellow-300 via-orange-500 to-red-500 drop-shadow-[0_0_30px_rgba(255,165,0,0.8)] px-4 text-center leading-tight tracking-wider"
                                style={{ WebkitTextStroke: '2px rgba(255,255,255,0.7)' }}
                            >
                                {comboMessage}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div ref={boardRef} className="w-full h-full grid" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`, gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`, gap: '4px' }}>
                    {board.map((row, rIndex) => (
                        row.map((cellObj, cIndex) => {
                            // Highlighting Logic
                            let isHovered = false;
                            let hoverColor = null;

                            if (hoverPos && dragState.isDragging && dragState.blockIndex !== null) {
                                const activeShape = blocks[dragState.blockIndex].shape;
                                const rOffset = rIndex - hoverPos.row;
                                const cOffset = cIndex - hoverPos.col;

                                if (rOffset >= 0 && rOffset < activeShape.length && cOffset >= 0 && cOffset < activeShape[0].length) {
                                    if (activeShape[rOffset][cOffset] === 1) {
                                        isHovered = true;
                                        hoverColor = blocks[dragState.blockIndex].color;
                                    }
                                }
                            }

                            const isClearing = clearingCells.includes(`${rIndex}-${cIndex}`);
                            const isPreviewClear = previewClearingCells.includes(`${rIndex}-${cIndex}`);

                            // Let the native hover color take precedence for the specific cells the piece occupies over the glow
                            const isNativeHover = isHovered && cellObj === null;

                            return (
                                <div
                                    key={`${rIndex}-${cIndex}`}
                                    className={`w-full h-full rounded sm:rounded-md z-10 ${(!cellObj && !isClearing && !isPreviewClear) ? 'bg-slate-800/40' : ''}`}
                                    style={{
                                        backgroundColor: isClearing ? '#ffffff' : (isNativeHover ? hoverColor : (isPreviewClear ? '#fef08a' : (cellObj || undefined))),
                                        opacity: cellObj || isClearing ? 1 : (isPreviewClear ? 0.9 : (isNativeHover ? 0.7 : 1)),
                                        boxShadow: isClearing
                                            ? '0 0 30px 10px rgba(255,255,255,0.9)'
                                            : isPreviewClear
                                                ? 'inset 0 0 15px rgba(255,255,255,0.8), 0 0 20px rgba(253,224,71,0.6)'
                                                : (cellObj ? `inset 0 0 12px rgba(255,255,255,0.3), 0 0 10px ${cellObj}90` : (isNativeHover ? `inset 0 0 10px rgba(255,255,255,0.4)` : 'inset 0 0 5px rgba(0,0,0,0.5)')),
                                        transform: isClearing ? 'scale(0.1)' : (isPreviewClear ? 'scale(1.08)' : (isNativeHover ? 'scale(0.95)' : 'scale(1)')),
                                        transition: isClearing ? 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'all 0.1s ease-out',
                                        zIndex: isClearing || isPreviewClear ? 50 : 10
                                    }}
                                />
                            );
                        })
                    ))}
                </div>

                {gameOver && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-6 border border-slate-700">
                        <div className="text-5xl font-black text-red-500 mb-2 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] tracking-widest text-center leading-tight">OUT OF<br />MOVES</div>
                        <div className="text-2xl text-white mb-8 bg-black/50 px-6 py-2 rounded-xl backdrop-blur-sm border border-white/10">Score: <strong className="text-yellow-400">{score}</strong></div>
                        <button onClick={restartGame} className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl font-bold uppercase tracking-widest shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all transform hover:scale-105 active:scale-95 border-2 border-white/20">
                            Play Again
                        </button>
                    </motion.div>
                )}
            </motion.div>

            {/* Premium Block Inventory Deck */}
            <div className="w-full max-w-md mx-auto flex justify-between gap-3 sm:gap-4 mt-8 px-4 relative z-20">
                <AnimatePresence>
                    {blocks.map((block, index) => {
                        const isCurrentlyDragging = dragState.isDragging && dragState.blockIndex === index;

                        return (
                            <motion.div
                                key={block.id}
                                layout
                                initial={{ scale: 0, y: 50, opacity: 0 }}
                                animate={{ scale: block.isUsed || isCurrentlyDragging ? 0 : 1, y: 0, opacity: block.isUsed || isCurrentlyDragging ? 0 : 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                onPointerDown={(e) => handlePointerDown(e, index)}
                                className={`flex flex-col items-center justify-center w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-slate-700/50 rounded-2xl shadow-xl relative backdrop-blur-sm ${!block.isUsed && !gameOver ? 'cursor-pointer hover:border-slate-500 transition-colors' : 'pointer-events-none'}`}
                            >
                                {!block.isUsed && renderBlockStructure(block.shape, block.color, 0.6, false, null)}
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <div className="hidden sm:block mt-8 text-center text-slate-500 text-sm max-w-sm mx-auto tracking-wide">
                <p>Drag geometric shapes precisely over the grid to snap.</p>
                <p className="mt-1 text-slate-400">Assemble full rows or columns to trigger blasts!</p>
            </div>

            {/* PORTAL: The Active Dragging Floating Block */}
            {dragState.isDragging && dragState.blockIndex !== null && (
                <div
                    className="fixed z-[100] pointer-events-none drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
                    style={{
                        left: dragState.x,
                        top: dragState.y,
                        // Added back a slight tactile translation & scaling effect so the user block floats "high"
                        transform: 'scale(1.1) translate(-5px, -15px)',
                        transition: 'transform 0.1s ease-out'
                    }}
                >
                    {renderBlockStructure(blocks[dragState.blockIndex].shape, blocks[dragState.blockIndex].color, 1, true, dragState.cellSize)}
                </div>
            )}
        </div>
    );
}
