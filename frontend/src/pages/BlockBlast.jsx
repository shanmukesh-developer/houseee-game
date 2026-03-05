import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, LogOut, RotateCcw, Star } from 'lucide-react';
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
const GAP = 3;
const HS_KEY = 'blockblast_highscore';

const createEmptyBoard = () => Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

// ── Scoring helper: how valuable is placing this shape somewhere on this board? ──
// Returns a score based on how many partially-filled lines the shape would contribute to.
function shapeLineScore(shape, boardState) {
    let best = 0;
    for (let sr = 0; sr <= BOARD_SIZE - shape.length; sr++) {
        for (let sc = 0; sc <= BOARD_SIZE - shape[0].length; sc++) {
            // check placement validity
            let valid = true;
            for (let r = 0; r < shape.length && valid; r++)
                for (let c = 0; c < shape[r].length && valid; c++)
                    if (shape[r][c] === 1 && boardState[sr + r][sc + c] !== null) valid = false;

            if (!valid) continue;

            // simulate
            const sim = boardState.map(row => [...row]);
            for (let r = 0; r < shape.length; r++)
                for (let c = 0; c < shape[r].length; c++)
                    if (shape[r][c] === 1) sim[sr + r][sc + c] = 1;

            // count near-complete rows and cols
            let score = 0;
            for (let r = 0; r < BOARD_SIZE; r++) {
                const filled = sim[r].filter(v => v !== null).length;
                if (filled === BOARD_SIZE) score += 100; // complete!
                else if (filled >= 6) score += filled * 3;
            }
            for (let c = 0; c < BOARD_SIZE; c++) {
                const filled = sim.filter(row => row[c] !== null).length;
                if (filled === BOARD_SIZE) score += 100;
                else if (filled >= 6) score += filled * 3;
            }
            if (score > best) best = score;
        }
    }
    return best;
}

export default function BlockBlast() {
    const { user, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    const [board, setBoard] = useState(createEmptyBoard());
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem(HS_KEY) || '0', 10));
    const [blocks, setBlocks] = useState([]);
    const [nudgeMessage, setNudgeMessage] = useState(null);
    const [shake, setShake] = useState(false);
    const [comboMessage, setComboMessage] = useState(null);
    const [clearingCells, setClearingCells] = useState([]);
    const [hoverPos, setHoverPos] = useState(null);
    const [isDragging, setIsDragging] = useState(false);   // Just a flag to show/hide ghost

    // Board measurement
    const boardRef = useRef(null);
    const boardRectRef = useRef(null);
    const [cellSize, setCellSize] = useState(48);

    // ── Drag tracking via REFS only (no re-renders on pointermove) ──
    const dragRef = useRef({ blockIndex: null, pointerX: 0, pointerY: 0 });
    const rafRef = useRef(null);

    // Separate ref for ghost position (DOM-manipulated directly for perf)
    const ghostRef = useRef(null);

    // State refs for use inside event listeners (avoids stale closures)
    const boardStateRef = useRef(board);
    const blocksRef = useRef(blocks);
    const cellSizeRef = useRef(cellSize);
    useEffect(() => { boardStateRef.current = board; }, [board]);
    useEffect(() => { blocksRef.current = blocks; }, [blocks]);
    useEffect(() => { cellSizeRef.current = cellSize; }, [cellSize]);

    // ── Measure board ──────────────────────────────────────────
    useEffect(() => {
        const measure = () => {
            if (boardRef.current) {
                boardRectRef.current = boardRef.current.getBoundingClientRect();
                const cs = (boardRef.current.offsetWidth - GAP * (BOARD_SIZE - 1)) / BOARD_SIZE;
                setCellSize(Math.floor(cs));
            }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // ── Placement helpers ──────────────────────────────────────
    const isValidPlacement = useCallback((shape, sr, sc, bState) => {
        const b = bState || boardStateRef.current;
        for (let r = 0; r < shape.length; r++)
            for (let c = 0; c < shape[r].length; c++)
                if (shape[r][c] === 1) {
                    const br = sr + r, bc = sc + c;
                    if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE || b[br][bc] !== null) return false;
                }
        return true;
    }, []);

    const canPlaceBlockAnywhere = useCallback((shape, bState) => {
        const b = bState || boardStateRef.current;
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (isValidPlacement(shape, r, c, b)) return true;
        return false;
    }, [isValidPlacement]);

    // ── Smart line-biased generation ──────────────────────────
    const generateBlocks = useCallback((bState) => {
        const b = bState || boardStateRef.current;
        const newBlocks = [];

        // Shuffle once, then pick best-scoring shape that fits
        const shuffled = [...SHAPES].sort(() => Math.random() - 0.5);

        for (let slot = 0; slot < 3; slot++) {
            // Filter shapes that can fit on the board
            const fittable = shuffled.filter(s => canPlaceBlockAnywhere(s.shape, b));
            let picked;

            if (fittable.length > 0) {
                // Sort by line-clearing potential and pick from top-3 randomly for variety
                const scored = fittable
                    .map(s => ({ s, score: shapeLineScore(s.shape, b) }))
                    .sort((a, b) => b.score - a.score);
                const top = scored.slice(0, Math.min(3, scored.length));
                picked = top[Math.floor(Math.random() * top.length)].s;
            } else {
                // Board is truly full — pick a 1-cell shape as emergency
                picked = SHAPES[0];
            }
            newBlocks.push({ ...picked, id: Math.random().toString(36).slice(2), isUsed: false });
        }
        setBlocks(newBlocks);
    }, [canPlaceBlockAnywhere]);

    useEffect(() => {
        if (blocks.length === 0) generateBlocks();
    }, [blocks, generateBlocks]);

    // ── Stuck detection ────────────────────────────────────────
    useEffect(() => {
        if (!blocks.length) return;
        const available = blocks.filter(b => !b.isUsed);
        if (!available.length) { generateBlocks(); return; }
        const stuck = !available.some(b => canPlaceBlockAnywhere(b.shape));
        if (stuck) {
            setNudgeMessage('💡 Board is full! Clear some lines!');
            setTimeout(() => setNudgeMessage(null), 2500);
            // Give tiny fall-back pieces guaranteed to fit
            const tiny = SHAPES.filter(s => s.shape.flat().filter(v => v === 1).length <= 2);
            const fallback = tiny.sort(() => Math.random() - 0.5).slice(0, 3);
            setBlocks(fallback.map(s => ({ ...s, id: Math.random().toString(36).slice(2), isUsed: false })));
        }
    }, [board, blocks, canPlaceBlockAnywhere, generateBlocks]);

    // ── Place block ────────────────────────────────────────────
    const placeBlock = useCallback((block, sr, sc, blockIndex) => {
        const shape = block.shape;
        const newBoard = boardStateRef.current.map(row => [...row]);
        for (let r = 0; r < shape.length; r++)
            for (let c = 0; c < shape[r].length; c++)
                if (shape[r][c] === 1) newBoard[sr + r][sc + c] = block.color;

        const newBlocksState = blocksRef.current.map((b, i) => i === blockIndex ? { ...b, isUsed: true } : b);
        setBlocks(newBlocksState);

        let rowsToClear = [];
        let colsToClear = [];
        for (let r = 0; r < BOARD_SIZE; r++)
            if (newBoard[r].every(c => c !== null)) rowsToClear.push(r);
        for (let c = 0; c < BOARD_SIZE; c++)
            if (newBoard.every(row => row[c] !== null)) colsToClear.push(c);

        const linesCleared = rowsToClear.length + colsToClear.length;
        const cells = shape.flat().filter(v => v === 1).length;
        let pts = 10 + cells * 5;
        if (linesCleared > 0) {
            pts += linesCleared * 100 + (linesCleared > 1 ? 50 * linesCleared : 0);
            const msg = linesCleared >= 4 ? '🔥 UNBELIEVABLE!' : linesCleared === 3 ? '✨ AWESOME!' : linesCleared === 2 ? '⚡ COMBO x2!' : '🎯 GREAT!';
            setComboMessage(msg);
            setShake(true);
            setTimeout(() => setShake(false), 350);
            setTimeout(() => setComboMessage(null), 1600);

            const cellsToAnimate = new Set();
            rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) cellsToAnimate.add(`${r}-${c}`); });
            colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) cellsToAnimate.add(`${r}-${c}`); });
            setClearingCells([...cellsToAnimate]);
            setBoard([...newBoard]);
            try { playSound('error'); } catch (_) { }

            setTimeout(() => {
                rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) newBoard[r][c] = null; });
                colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) newBoard[r][c] = null; });
                const currentHS = parseInt(localStorage.getItem(HS_KEY) || '0', 10);
                setScore(prev => {
                    const next = prev + pts;
                    if (next > currentHS) {
                        localStorage.setItem(HS_KEY, String(next));
                        setHighScore(next);
                    }
                    return next;
                });
                setBoard([...newBoard]);
                setClearingCells([]);
            }, 320);
            return;
        }
        setScore(prev => {
            const next = prev + pts;
            if (next > parseInt(localStorage.getItem(HS_KEY) || '0', 10)) {
                localStorage.setItem(HS_KEY, String(next));
                setHighScore(next);
            }
            return next;
        });
        setBoard(newBoard);
    }, []);

    // ── Snap calculation (pure function, no state reads) ──────
    const getSnappedPos = useCallback((px, py, shape) => {
        const rect = boardRectRef.current;
        if (!rect) return null;
        const cs = cellSizeRef.current;
        const blockPxW = shape[0].length * cs + (shape[0].length - 1) * GAP;
        const blockPxH = shape.length * cs + (shape.length - 1) * GAP;
        const relX = (px - blockPxW / 2) - rect.left;
        const relY = (py - blockPxH - 28) - rect.top;
        return { row: Math.round(relY / (cs + GAP)), col: Math.round(relX / (cs + GAP)) };
    }, []);

    // ── Drag handlers (pointer move mutates ref + updates ghost DOM directly) ──
    const handlePointerDown = useCallback((e, index) => {
        if (blocksRef.current[index]?.isUsed) return;
        e.preventDefault();
        document.body.style.overflow = 'hidden';
        dragRef.current = { blockIndex: index, pointerX: e.clientX, pointerY: e.clientY };
        setIsDragging(true);
        setHoverPos(null);
    }, []);

    const handlePointerMove = useCallback((e) => {
        // Guard: only process when actively dragging and a block is selected
        if (!isDragging || dragRef.current.blockIndex === null) return;
        dragRef.current.pointerX = e.clientX;
        dragRef.current.pointerY = e.clientY;

        // Move ghost via DOM ref (bypass React render entirely)
        const shape = blocksRef.current[dragRef.current.blockIndex]?.shape;
        if (!shape) return;

        const cs = cellSizeRef.current;
        const blockPxW = shape[0].length * cs + (shape[0].length - 1) * GAP;
        const blockPxH = shape.length * cs + (shape.length - 1) * GAP;

        const pos = getSnappedPos(e.clientX, e.clientY, shape);
        const valid = pos && isValidPlacement(shape, pos.row, pos.col);

        // Update hover pos for grid highlight (this triggers a targeted re-render)
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            setHoverPos(valid ? pos : null);
        });

        // Direct DOM move for ghost (NO React state update = NO re-render)
        if (ghostRef.current) {
            let gLeft, gTop;
            if (valid && boardRectRef.current) {
                gLeft = boardRectRef.current.left + pos.col * (cs + GAP);
                gTop = boardRectRef.current.top + pos.row * (cs + GAP);
                ghostRef.current.style.transition = 'left 0.07s ease-out, top 0.07s ease-out, transform 0.08s';
                ghostRef.current.style.transform = 'scale(1)';
                ghostRef.current.style.opacity = '0.85';
            } else {
                gLeft = e.clientX - blockPxW / 2;
                gTop = e.clientY - blockPxH - 28;
                ghostRef.current.style.transition = 'transform 0.08s';
                ghostRef.current.style.transform = 'scale(1.08)';
                ghostRef.current.style.opacity = '0.95';
            }
            ghostRef.current.style.left = gLeft + 'px';
            ghostRef.current.style.top = gTop + 'px';
        }
    }, [getSnappedPos, isValidPlacement]);

    const handlePointerUp = useCallback(() => {
        if (hoverPos !== null && dragRef.current.blockIndex !== null) {
            const bi = dragRef.current.blockIndex;
            const block = blocksRef.current[bi];
            placeBlock(block, hoverPos.row, hoverPos.col, bi);
            try { playSound('win'); } catch (_) { }
        }
        dragRef.current = { blockIndex: null, pointerX: 0, pointerY: 0 };
        setIsDragging(false);
        setHoverPos(null);
        document.body.style.overflow = '';
    }, [hoverPos, placeBlock]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('pointermove', handlePointerMove, { passive: true });
            window.addEventListener('pointerup', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isDragging, handlePointerMove, handlePointerUp]);

    // ── Preview clear ──────────────────────────────────────────
    const previewClearingCells = React.useMemo(() => {
        const set = new Set();
        if (!hoverPos || !isDragging || dragRef.current.blockIndex === null) return set;
        const shape = blocks[dragRef.current.blockIndex]?.shape;
        if (!shape) return set;
        const sim = board.map(row => [...row]);
        for (let r = 0; r < shape.length; r++)
            for (let c = 0; c < shape[r].length; c++)
                if (shape[r][c] === 1) {
                    const sr = hoverPos.row + r, sc = hoverPos.col + c;
                    if (sr >= 0 && sr < BOARD_SIZE && sc >= 0 && sc < BOARD_SIZE) sim[sr][sc] = 1;
                }
        for (let r = 0; r < BOARD_SIZE; r++)
            if (sim[r].every(v => v !== null)) for (let c = 0; c < BOARD_SIZE; c++) set.add(`${r}-${c}`);
        for (let c = 0; c < BOARD_SIZE; c++)
            if (sim.every(row => row[c] !== null)) for (let r = 0; r < BOARD_SIZE; r++) set.add(`${r}-${c}`);
        return set;
    }, [hoverPos, isDragging, blocks, board]);

    const restartGame = () => {
        setBoard(createEmptyBoard());
        setScore(0);
        setBlocks([]);
        setNudgeMessage(null);
        setIsDragging(false);
    };
    const leaveRoom = () => { setRoomCode(null); setGameType(null); navigate('/'); };
    if (!user) return null;

    const trayCellSize = Math.max(18, Math.floor(cellSize * 0.58));
    const activeBlock = isDragging && dragRef.current.blockIndex !== null ? blocks[dragRef.current.blockIndex] : null;
    const isNewHighscore = score > 0 && score >= highScore;

    return (
        <div
            className="fixed inset-0 flex flex-col items-center bg-slate-950 text-white font-sans overflow-hidden touch-none select-none"
        >
            {/* Ambient glow */}
            <div className="absolute top-0 left-1/4 w-[60vw] h-[60vw] bg-violet-700/10 blur-[150px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-[50vw] h-[50vw] bg-cyan-500/8 blur-[120px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="w-full flex items-center justify-between px-4 py-3 relative z-10 flex-shrink-0 gap-2">
                <button onClick={leaveRoom} className="p-3 bg-red-700/80 hover:bg-red-600 text-white rounded-xl transition-colors border border-red-900 flex-shrink-0">
                    <LogOut size={20} />
                </button>

                {/* Score + Highscore */}
                <div className="text-center flex-1">
                    <div className="text-[10px] text-cyan-400 font-black tracking-[0.3em] uppercase mb-0.5">BLOCK BLAST</div>
                    <div className="flex items-center justify-center gap-3">
                        <div className={`text-3xl font-black tracking-wider ${isNewHighscore ? 'text-yellow-300 drop-shadow-[0_0_15px_rgba(250,204,21,0.8)]' : 'text-white'}`}>
                            {score.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500 border border-slate-700 px-2 py-1 rounded-lg flex items-center gap-1">
                            <Star size={10} className="text-yellow-500 fill-yellow-500" />
                            <span className="font-bold text-yellow-400">{highScore.toLocaleString()}</span>
                        </div>
                    </div>
                </div>

                <button onClick={restartGame} className="p-3 bg-slate-800/80 hover:bg-slate-700 text-white rounded-xl transition-colors border border-slate-700 flex-shrink-0">
                    <RotateCcw size={20} />
                </button>
            </div>

            {/* Game Board */}
            <motion.div
                className="flex-1 w-full flex items-center justify-center px-4 relative z-10"
                animate={shake ? { x: [-10, 10, -10, 10, 0], y: [-6, 6, -6, 6, 0] } : {}}
                transition={shake ? { duration: 0.35 } : {}}
            >
                <div
                    className="relative bg-slate-900/80 rounded-2xl border border-slate-800/80 shadow-[0_0_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm"
                    style={{ padding: GAP * 2 }}
                >
                    {/* Nudge toast */}
                    <AnimatePresence>
                        {nudgeMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-black font-black text-sm px-4 py-2 rounded-xl shadow-2xl backdrop-blur-sm whitespace-nowrap pointer-events-none border border-amber-300"
                            >
                                {nudgeMessage}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Combo */}
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
                                    className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-yellow-300 via-orange-500 to-red-500 tracking-wider drop-shadow-[0_0_30px_rgba(255,140,0,0.9)]"
                                    style={{ WebkitTextStroke: '2px rgba(255,255,255,0.55)' }}
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
                        {board.map((row, rIdx) =>
                            row.map((cellColor, cIdx) => {
                                let isHovered = false;
                                let hoverColor = null;
                                if (hoverPos && isDragging && dragRef.current.blockIndex !== null) {
                                    const shape = blocks[dragRef.current.blockIndex]?.shape;
                                    if (shape) {
                                        const ro = rIdx - hoverPos.row, co = cIdx - hoverPos.col;
                                        if (ro >= 0 && ro < shape.length && co >= 0 && co < shape[ro].length && shape[ro][co] === 1 && !cellColor) {
                                            isHovered = true;
                                            hoverColor = blocks[dragRef.current.blockIndex].color;
                                        }
                                    }
                                }
                                const isClearing = clearingCells.includes(`${rIdx}-${cIdx}`);
                                const isPreview = previewClearingCells.has(`${rIdx}-${cIdx}`);

                                return (
                                    <div key={`${rIdx}-${cIdx}`} style={{
                                        width: cellSize, height: cellSize,
                                        borderRadius: Math.max(4, cellSize * 0.1),
                                        backgroundColor: isClearing ? '#fff' : isHovered ? hoverColor : isPreview ? '#fef08a' : cellColor || 'rgba(28,32,46,0.9)',
                                        boxShadow: isClearing
                                            ? '0 0 30px 12px rgba(255,255,255,0.9)'
                                            : isPreview
                                                ? 'inset 0 0 12px rgba(255,255,255,0.7), 0 0 18px rgba(253,224,71,0.5)'
                                                : cellColor
                                                    ? `inset 0 0 ${cellSize * 0.2}px rgba(255,255,255,0.22), 0 2px 8px ${cellColor}88`
                                                    : isHovered
                                                        ? `inset 0 0 8px rgba(255,255,255,0.4)`
                                                        : 'inset 0 0 4px rgba(0,0,0,0.6)',
                                        opacity: isHovered ? 0.75 : 1,
                                        transform: isClearing ? 'scale(0.05)' : isPreview ? 'scale(1.07)' : 'scale(1)',
                                        transition: isClearing
                                            ? 'all 0.32s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                                            : 'background-color 0.08s, box-shadow 0.08s, transform 0.08s',
                                    }} />
                                );
                            })
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Block Tray */}
            <div className="w-full flex-shrink-0 flex justify-center items-center gap-4 sm:gap-6 px-6 py-4 relative z-20">
                {blocks.map((block, index) => {
                    const isCurrentlyDragging = isDragging && dragRef.current.blockIndex === index;
                    if (block.isUsed) {
                        return <div key={block.id} className="w-[88px] h-[88px] flex-shrink-0 opacity-0" />;
                    }
                    return (
                        <motion.div
                            key={block.id}
                            layout
                            initial={{ scale: 0, y: 40, opacity: 0 }}
                            animate={{ scale: isCurrentlyDragging ? 0 : 1, y: 0, opacity: isCurrentlyDragging ? 0 : 1 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                            onPointerDown={(e) => handlePointerDown(e, index)}
                            className="flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-slate-700/60 rounded-2xl shadow-xl cursor-pointer hover:border-slate-500 hover:scale-105 active:scale-95 transition-colors flex-shrink-0"
                            style={{ width: 88, height: 88, touchAction: 'none' }}
                        >
                            <div className="grid" style={{
                                gridTemplateColumns: `repeat(${block.shape[0].length}, ${trayCellSize}px)`,
                                gridTemplateRows: `repeat(${block.shape.length}, ${trayCellSize}px)`,
                                gap: '3px',
                            }}>
                                {block.shape.map((row, r) =>
                                    row.map((cell, c) => (
                                        <div key={`${r}-${c}`} style={{
                                            width: trayCellSize, height: trayCellSize,
                                            borderRadius: 4,
                                            backgroundColor: cell === 1 ? block.color : 'transparent',
                                            boxShadow: cell === 1 ? `inset 0 0 6px rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.4)` : 'none',
                                        }} />
                                    ))
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Ghost — mutated directly via ghostRef, NOT React state */}
            {isDragging && activeBlock && (
                <div
                    ref={ghostRef}
                    className="fixed z-[200] pointer-events-none"
                    style={{
                        left: dragRef.current.pointerX,
                        top: dragRef.current.pointerY,
                        filter: `drop-shadow(0 20px 40px rgba(0,0,0,0.7))`,
                        transformOrigin: 'top left',
                    }}
                >
                    <div
                        className="grid"
                        style={{
                            gridTemplateColumns: `repeat(${activeBlock.shape[0].length}, ${cellSize}px)`,
                            gridTemplateRows: `repeat(${activeBlock.shape.length}, ${cellSize}px)`,
                            gap: `${GAP}px`,
                        }}
                    >
                        {activeBlock.shape.map((row, r) =>
                            row.map((cell, c) => (
                                <div key={`${r}-${c}`} style={{
                                    width: cellSize, height: cellSize,
                                    borderRadius: Math.max(4, cellSize * 0.1),
                                    backgroundColor: cell === 1 ? activeBlock.color : 'transparent',
                                    boxShadow: cell === 1
                                        ? `inset 0 0 ${cellSize * 0.2}px rgba(255,255,255,0.5), 0 4px 12px rgba(0,0,0,0.5)`
                                        : 'none',
                                }} />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
