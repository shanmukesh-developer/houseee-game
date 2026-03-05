import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, LogOut, RotateCcw } from 'lucide-react';
import { playSound } from '../utils/audio';

const SHAPES = [
    { shape: [[1]], color: '#f87171' },
    { shape: [[1, 1]], color: '#fb923c' },
    { shape: [[1, 1, 1]], color: '#facc15' },
    { shape: [[1, 1, 1, 1]], color: '#4ade80' },
    { shape: [[1, 1, 1, 1, 1]], color: '#2dd4bf' },
    { shape: [[1], [1]], color: '#fb923c' },
    { shape: [[1], [1], [1]], color: '#facc15' },
    { shape: [[1], [1], [1], [1]], color: '#4ade80' },
    { shape: [[1], [1], [1], [1], [1]], color: '#2dd4bf' },
    { shape: [[1, 1], [1, 1]], color: '#60a5fa' },
    { shape: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], color: '#818cf8' },
    { shape: [[1, 0], [1, 1]], color: '#c084fc' },
    { shape: [[0, 1], [1, 1]], color: '#c084fc' },
    { shape: [[1, 1], [1, 0]], color: '#c084fc' },
    { shape: [[1, 1], [0, 1]], color: '#c084fc' },
    { shape: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], color: '#f472b6' },
    { shape: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], color: '#f472b6' },
    { shape: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], color: '#f472b6' },
    { shape: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], color: '#f472b6' },
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#38bdf8' },
    { shape: [[1, 1, 1], [0, 1, 0]], color: '#38bdf8' },
    { shape: [[1, 0], [1, 1], [1, 0]], color: '#38bdf8' },
    { shape: [[0, 1], [1, 1], [0, 1]], color: '#38bdf8' }
];

const BOARD_SIZE = 8;
const GAP = 3; // px gap between cells
const createEmptyBoard = () => Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

export default function BlockBlast() {
    const { user, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    const [board, setBoard] = useState(createEmptyBoard());
    const [score, setScore] = useState(0);
    const [blocks, setBlocks] = useState([]);
    const [gameOver, setGameOver] = useState(false);
    const [shake, setShake] = useState(false);
    const [comboMessage, setComboMessage] = useState(null);
    const [clearingCells, setClearingCells] = useState([]);
    const [hoverPos, setHoverPos] = useState(null);

    // Real measured cell size in pixels
    const boardRef = useRef(null);
    const [cellSize, setCellSize] = useState(48);

    // Drag state
    const [dragState, setDragState] = useState({
        isDragging: false,
        blockIndex: null,
        pointerX: 0,
        pointerY: 0,
    });

    // ── Measure board to get accurate cell size ──────────────
    useEffect(() => {
        const measure = () => {
            if (boardRef.current) {
                const boardWidth = boardRef.current.offsetWidth;
                // total gap between cells: (BOARD_SIZE - 1) * GAP. Plus outer padding handled by CSS.
                const cs = (boardWidth - GAP * (BOARD_SIZE - 1)) / BOARD_SIZE;
                setCellSize(Math.floor(cs));
            }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // ── Block generation ─────────────────────────────────────
    const generateBlocks = useCallback(() => {
        const newBlocks = [];
        for (let i = 0; i < 3; i++) {
            const s = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            newBlocks.push({ ...s, id: Math.random().toString(36).slice(2), isUsed: false });
        }
        setBlocks(newBlocks);
    }, []);

    useEffect(() => {
        if (blocks.length === 0 && !gameOver) generateBlocks();
    }, [blocks, gameOver, generateBlocks]);

    // ── Placement helpers ─────────────────────────────────────
    const isValidPlacement = useCallback((shape, startRow, startCol, boardState = board) => {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] !== 1) continue;
                const br = startRow + r;
                const bc = startCol + c;
                if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) return false;
                if (boardState[br][bc] !== null) return false;
            }
        }
        return true;
    }, [board]);

    const canPlaceBlockAnywhere = useCallback((shape, boardState = board) => {
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (isValidPlacement(shape, r, c, boardState)) return true;
        return false;
    }, [isValidPlacement, board]);

    // ── Game over detection ───────────────────────────────────
    useEffect(() => {
        if (!blocks.length || gameOver) return;
        const available = blocks.filter(b => !b.isUsed);
        if (!available.length) {
            generateBlocks();
            return;
        }
        const canPlace = available.some(b => canPlaceBlockAnywhere(b.shape));
        if (!canPlace) setGameOver(true);
    }, [board, blocks, gameOver, canPlaceBlockAnywhere, generateBlocks]);

    // ── Place block on board ──────────────────────────────────
    const placeBlock = useCallback((block, startRow, startCol, blockIndex) => {
        const shape = block.shape;
        const color = block.color;
        const newBoard = board.map(row => [...row]);

        for (let r = 0; r < shape.length; r++)
            for (let c = 0; c < shape[r].length; c++)
                if (shape[r][c] === 1) newBoard[startRow + r][startCol + c] = color;

        const newBlocksState = [...blocks];
        newBlocksState[blockIndex] = { ...newBlocksState[blockIndex], isUsed: true };
        setBlocks(newBlocksState);

        let rowsToClear = [];
        let colsToClear = [];
        for (let r = 0; r < BOARD_SIZE; r++)
            if (newBoard[r].every(c => c !== null)) rowsToClear.push(r);
        for (let c = 0; c < BOARD_SIZE; c++)
            if (newBoard.every(row => row[c] !== null)) colsToClear.push(c);

        const linesCleared = rowsToClear.length + colsToClear.length;
        let pointsEarned = 10 + shape.flat().filter(v => v === 1).length * 5;

        if (linesCleared > 0) {
            pointsEarned += linesCleared * 100 + (linesCleared > 1 ? 50 * linesCleared : 0);
            let msg = linesCleared >= 4 ? 'UNBELIEVABLE!' : linesCleared === 3 ? 'AWESOME!' : linesCleared === 2 ? `COMBO x2!` : 'GREAT!';
            setComboMessage(msg);
            setShake(true);
            setTimeout(() => setShake(false), 350);
            setTimeout(() => setComboMessage(null), 1600);

            const cellsToAnimate = new Set();
            rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) cellsToAnimate.add(`${r}-${c}`); });
            colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) cellsToAnimate.add(`${r}-${c}`); });
            setClearingCells([...cellsToAnimate]);

            setBoard([...newBoard]);

            setTimeout(() => {
                rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) newBoard[r][c] = null; });
                colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) newBoard[r][c] = null; });
                setScore(prev => prev + pointsEarned);
                setBoard([...newBoard]);
                setClearingCells([]);
            }, 320);
            return;
        }

        setScore(prev => prev + pointsEarned);
        setBoard(newBoard);
    }, [board, blocks]);

    // ── Drag handlers ─────────────────────────────────────────
    const getSnappedPos = useCallback((pointerX, pointerY, shape) => {
        if (!boardRef.current) return null;
        const rect = boardRef.current.getBoundingClientRect();
        // how many cells wide/tall is this shape
        const shapeW = shape[0].length;
        const shapeH = shape.length;
        // Pointer offset: we show shape above pointer, centered
        const blockPxW = shapeW * cellSize + (shapeW - 1) * GAP;
        const blockPxH = shapeH * cellSize + (shapeH - 1) * GAP;
        const floatLeft = pointerX - blockPxW / 2;
        const floatTop = pointerY - blockPxH - 28; // 28px above pointer

        // Convert floating block top-left to board-relative coords
        const relX = floatLeft - rect.left;
        const relY = floatTop - rect.top;
        const col = Math.round(relX / (cellSize + GAP));
        const row = Math.round(relY / (cellSize + GAP));
        return { row, col };
    }, [cellSize]);

    const handlePointerDown = useCallback((e, index) => {
        if (blocks[index]?.isUsed || gameOver) return;
        e.preventDefault();
        document.body.style.overflow = 'hidden';
        setDragState({ isDragging: true, blockIndex: index, pointerX: e.clientX, pointerY: e.clientY });
    }, [blocks, gameOver]);

    const handlePointerMove = useCallback((e) => {
        if (!dragState.isDragging || dragState.blockIndex === null) return;
        setDragState(prev => ({ ...prev, pointerX: e.clientX, pointerY: e.clientY }));

        const shape = blocks[dragState.blockIndex]?.shape;
        if (!shape) return;
        const pos = getSnappedPos(e.clientX, e.clientY, shape);
        if (pos && isValidPlacement(shape, pos.row, pos.col)) {
            setHoverPos(pos);
        } else {
            setHoverPos(null);
        }
    }, [dragState, blocks, getSnappedPos, isValidPlacement]);

    const handlePointerUp = useCallback(() => {
        if (!dragState.isDragging) return;
        if (hoverPos !== null && dragState.blockIndex !== null) {
            placeBlock(blocks[dragState.blockIndex], hoverPos.row, hoverPos.col, dragState.blockIndex);
            try { playSound('win'); } catch (_) { }
        }
        setDragState({ isDragging: false, blockIndex: null, pointerX: 0, pointerY: 0 });
        setHoverPos(null);
        document.body.style.overflow = '';
    }, [dragState, hoverPos, blocks, placeBlock]);

    useEffect(() => {
        if (dragState.isDragging) {
            window.addEventListener('pointermove', handlePointerMove, { passive: false });
            window.addEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [dragState.isDragging, handlePointerMove, handlePointerUp]);

    // ── Preview clearing cells ────────────────────────────────
    let previewClearingCells = new Set();
    if (hoverPos && dragState.isDragging && dragState.blockIndex !== null) {
        const activeShape = blocks[dragState.blockIndex]?.shape;
        if (activeShape) {
            const simBoard = board.map(row => [...row]);
            for (let r = 0; r < activeShape.length; r++)
                for (let c = 0; c < activeShape[r].length; c++)
                    if (activeShape[r][c] === 1) {
                        const sr = hoverPos.row + r, sc = hoverPos.col + c;
                        if (sr >= 0 && sr < BOARD_SIZE && sc >= 0 && sc < BOARD_SIZE) simBoard[sr][sc] = 1;
                    }
            for (let r = 0; r < BOARD_SIZE; r++)
                if (simBoard[r].every(c => c !== null)) for (let c = 0; c < BOARD_SIZE; c++) previewClearingCells.add(`${r}-${c}`);
            for (let c = 0; c < BOARD_SIZE; c++)
                if (simBoard.every(row => row[c] !== null)) for (let r = 0; r < BOARD_SIZE; r++) previewClearingCells.add(`${r}-${c}`);
        }
    }

    const restartGame = () => { setBoard(createEmptyBoard()); setScore(0); setGameOver(false); setBlocks([]); };
    const leaveRoom = () => { setRoomCode(null); setGameType(null); navigate('/'); };

    // ── Floating ghost block position ─────────────────────────
    const activeShape = dragState.isDragging && dragState.blockIndex !== null ? blocks[dragState.blockIndex]?.shape : null;
    const ghostLeft = activeShape ? dragState.pointerX - (activeShape[0].length * cellSize + (activeShape[0].length - 1) * GAP) / 2 : 0;
    const ghostTop = activeShape ? dragState.pointerY - (activeShape.length * cellSize + (activeShape.length - 1) * GAP) - 28 : 0;

    if (!user) return null;

    // Tray block cell size: smaller than grid, proportional
    const trayCellSize = Math.max(20, Math.floor(cellSize * 0.6));
    const trayGap = 3;

    return (
        <div
            className="fixed inset-0 flex flex-col items-center bg-slate-950 text-white font-sans overflow-hidden touch-none select-none"
            style={{ userSelect: 'none' }}
        >
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/4 w-[60vw] h-[60vw] bg-violet-700/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-[50vw] h-[50vw] bg-cyan-500/8 blur-[120px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="w-full flex items-center justify-between px-4 py-3 relative z-10 flex-shrink-0">
                <button onClick={leaveRoom} className="p-3 bg-red-700/80 hover:bg-red-600 text-white rounded-xl transition-colors shadow-lg border border-red-900 backdrop-blur-sm flex-shrink-0">
                    <LogOut size={20} />
                </button>
                <div className="text-center">
                    <div className="text-[10px] text-cyan-400 font-black tracking-[0.3em] uppercase mb-0.5">BLOCK BLAST</div>
                    <div className="text-3xl font-black text-white tracking-wider flex items-center justify-center gap-2">
                        <Trophy size={26} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                        <span className="drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">{score.toLocaleString()}</span>
                    </div>
                </div>
                <button onClick={restartGame} className="p-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-xl transition-colors border border-slate-700 flex-shrink-0">
                    <RotateCcw size={20} />
                </button>
            </div>

            {/* GAME BOARD — fills remaining vertical space */}
            <motion.div
                className="flex-1 w-full flex items-center justify-center px-4 relative z-10"
                animate={shake ? { x: [-10, 10, -10, 10, 0], y: [-6, 6, -6, 6, 0] } : {}}
                transition={shake ? { duration: 0.35 } : {}}
            >
                <div
                    className="relative bg-slate-900/80 rounded-2xl border border-slate-800/80 shadow-[0_0_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm"
                    style={{ padding: GAP * 2 }}
                >
                    {/* Combo message */}
                    <AnimatePresence>
                        {comboMessage && (
                            <motion.div
                                initial={{ scale: 0.3, opacity: 0 }}
                                animate={{ scale: 1.1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 18 }}
                                className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                            >
                                <span
                                    className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-yellow-300 via-orange-500 to-red-500 drop-shadow-[0_0_30px_rgba(255,140,0,0.9)] tracking-wider"
                                    style={{ WebkitTextStroke: '2px rgba(255,255,255,0.6)' }}
                                >
                                    {comboMessage}
                                </span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Grid */}
                    <div
                        ref={boardRef}
                        className="grid"
                        style={{
                            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
                            gridTemplateRows: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
                            gap: `${GAP}px`,
                        }}
                    >
                        {board.map((row, rIndex) =>
                            row.map((cellColor, cIndex) => {
                                // Highlight overlay
                                let isHovered = false;
                                let hoverColor = null;
                                if (hoverPos && dragState.isDragging && dragState.blockIndex !== null) {
                                    const shape = blocks[dragState.blockIndex]?.shape;
                                    if (shape) {
                                        const ro = rIndex - hoverPos.row;
                                        const co = cIndex - hoverPos.col;
                                        if (ro >= 0 && ro < shape.length && co >= 0 && co < shape[ro].length && shape[ro][co] === 1 && !cellColor) {
                                            isHovered = true;
                                            hoverColor = blocks[dragState.blockIndex].color;
                                        }
                                    }
                                }
                                const isClearing = clearingCells.includes(`${rIndex}-${cIndex}`);
                                const isPreview = previewClearingCells.has(`${rIndex}-${cIndex}`);

                                return (
                                    <div
                                        key={`${rIndex}-${cIndex}`}
                                        style={{
                                            width: cellSize,
                                            height: cellSize,
                                            borderRadius: Math.max(4, cellSize * 0.1),
                                            backgroundColor: isClearing
                                                ? '#fff'
                                                : isHovered ? hoverColor
                                                    : isPreview ? '#fef08a'
                                                        : cellColor || 'rgba(30,35,50,0.7)',
                                            boxShadow: isClearing
                                                ? '0 0 30px 12px rgba(255,255,255,0.9)'
                                                : isPreview
                                                    ? 'inset 0 0 12px rgba(255,255,255,0.7), 0 0 18px rgba(253,224,71,0.5)'
                                                    : cellColor
                                                        ? `inset 0 0 ${cellSize * 0.2}px rgba(255,255,255,0.25), 0 2px 8px ${cellColor}88`
                                                        : isHovered
                                                            ? `inset 0 0 8px rgba(255,255,255,0.4)`
                                                            : 'inset 0 0 4px rgba(0,0,0,0.5)',
                                            opacity: isHovered ? 0.75 : 1,
                                            transform: isClearing
                                                ? 'scale(0.05)'
                                                : isPreview ? 'scale(1.07)'
                                                    : 'scale(1)',
                                            transition: isClearing
                                                ? 'all 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                                : 'all 0.08s ease-out',
                                        }}
                                    />
                                );
                            })
                        )}
                    </div>

                    {/* Game Over overlay */}
                    {gameOver && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-md rounded-2xl flex flex-col items-center justify-center p-6 border border-slate-700"
                        >
                            <div className="text-5xl font-black text-red-500 mb-3 drop-shadow-[0_0_20px_rgba(239,68,68,0.8)] tracking-widest text-center leading-tight">
                                OUT OF<br />MOVES
                            </div>
                            <div className="text-2xl text-white mb-8 bg-black/50 px-6 py-2 rounded-xl border border-white/10">
                                Score: <strong className="text-yellow-400">{score.toLocaleString()}</strong>
                            </div>
                            <button
                                onClick={restartGame}
                                className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl font-bold uppercase tracking-widest shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all transform hover:scale-105 active:scale-95 border-2 border-white/20"
                            >
                                Play Again
                            </button>
                        </motion.div>
                    )}
                </div>
            </motion.div>

            {/* Block Tray */}
            <div className="w-full flex-shrink-0 flex justify-center items-end gap-4 px-6 py-4 relative z-20">
                <div className="flex justify-center items-center gap-4 sm:gap-6">
                    {blocks.map((block, index) => {
                        const isCurrentlyDragging = dragState.isDragging && dragState.blockIndex === index;
                        if (block.isUsed) {
                            // Placeholder to preserve layout
                            return <div key={block.id} className="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0" />;
                        }
                        return (
                            <motion.div
                                key={block.id}
                                layout
                                initial={{ scale: 0, y: 40, opacity: 0 }}
                                animate={{ scale: isCurrentlyDragging ? 0 : 1, y: 0, opacity: isCurrentlyDragging ? 0 : 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                onPointerDown={(e) => handlePointerDown(e, index)}
                                className="flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-slate-700/50 rounded-2xl shadow-xl cursor-pointer hover:border-slate-500 active:scale-95 transition-colors flex-shrink-0"
                                style={{ width: '88px', height: '88px', touchAction: 'none' }}
                            >
                                {/* Render block preview in tray at scale */}
                                <div
                                    className="grid"
                                    style={{
                                        gridTemplateColumns: `repeat(${block.shape[0].length}, ${trayCellSize}px)`,
                                        gridTemplateRows: `repeat(${block.shape.length}, ${trayCellSize}px)`,
                                        gap: `${trayGap}px`,
                                    }}
                                >
                                    {block.shape.map((row, r) =>
                                        row.map((cell, c) => (
                                            <div
                                                key={`${r}-${c}`}
                                                style={{
                                                    width: trayCellSize,
                                                    height: trayCellSize,
                                                    borderRadius: 4,
                                                    backgroundColor: cell === 1 ? block.color : 'transparent',
                                                    boxShadow: cell === 1 ? `inset 0 0 6px rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.4)` : 'none',
                                                }}
                                            />
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            {/* Dragging Ghost — pixel-perfect, above pointer */}
            {dragState.isDragging && activeShape && (
                <div
                    className="fixed z-[200] pointer-events-none"
                    style={{
                        left: ghostLeft,
                        top: ghostTop,
                        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.7))',
                    }}
                >
                    <div
                        className="grid"
                        style={{
                            gridTemplateColumns: `repeat(${activeShape[0].length}, ${cellSize}px)`,
                            gridTemplateRows: `repeat(${activeShape.length}, ${cellSize}px)`,
                            gap: `${GAP}px`,
                            transform: 'scale(1.08)',
                            transformOrigin: 'top left',
                        }}
                    >
                        {activeShape.map((row, r) =>
                            row.map((cell, c) => (
                                <div
                                    key={`${r}-${c}`}
                                    style={{
                                        width: cellSize,
                                        height: cellSize,
                                        borderRadius: Math.max(4, cellSize * 0.1),
                                        backgroundColor: cell === 1 ? blocks[dragState.blockIndex].color : 'transparent',
                                        boxShadow: cell === 1
                                            ? `inset 0 0 ${cellSize * 0.2}px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.5)`
                                            : 'none',
                                    }}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
