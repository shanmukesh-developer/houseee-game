import React, { useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, LogOut, RotateCcw, Star } from 'lucide-react';

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
const GAP = 3; // gap between cells in px
const HS_KEY = 'blockblast_highscore';
const createEmptyBoard = () => Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));

// How good is placing this shape on this board for clearing lines?
function shapeLineScore(shape, board) {
    let best = 0;
    for (let sr = 0; sr <= BOARD_SIZE - shape.length; sr++) {
        for (let sc = 0; sc <= BOARD_SIZE - shape[0].length; sc++) {
            let ok = true;
            for (let r = 0; r < shape.length && ok; r++)
                for (let c = 0; c < shape[r].length && ok; c++)
                    if (shape[r][c] === 1 && board[sr + r][sc + c] !== null) ok = false;
            if (!ok) continue;
            let score = 0;
            // Simulate placement
            for (let r = 0; r < BOARD_SIZE; r++) {
                let rowCount = board[r].filter(v => v !== null).length;
                for (let c = 0; c < shape[0].length; c++)
                    if (sr === r && sc <= c && c < sc + shape[0].length && shape[r - sr]?.[c - sc] === 1) rowCount++;
                if (rowCount === BOARD_SIZE) score += 120;
                else if (rowCount >= 6) score += rowCount * 4;
            }
            for (let c = 0; c < BOARD_SIZE; c++) {
                let colCount = board.filter(row => row[c] !== null).length;
                for (let r = 0; r < shape.length; r++)
                    if (sc === c && sr <= r && r < sr + shape.length && shape[r - sr]?.[c - sc] === 1) colCount++;
                if (colCount === BOARD_SIZE) score += 120;
                else if (colCount >= 6) score += colCount * 4;
            }
            if (score > best) best = score;
        }
    }
    return best;
}

export default function BlockBlast() {
    const { user, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();

    // ── Core game state ──────────────────────────────────────
    const [board, setBoard] = useState(createEmptyBoard());
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(() => parseInt(localStorage.getItem(HS_KEY) || '0', 10));
    const [blocks, setBlocks] = useState([]);
    const [clearingCells, setClearingCells] = useState([]);
    const [shake, setShake] = useState(false);
    const [comboMsg, setComboMsg] = useState(null);
    const [nudge, setNudge] = useState(null);

    // ── Drag state — index is React state (triggers render once), XY is ref ──
    const [draggingIndex, setDraggingIndex] = useState(null); // triggers render on pick up/drop
    const [hoverPos, setHoverPos] = useState(null);           // triggers render when snap cell changes
    const ptrRef = useRef({ x: 0, y: 0 });                   // pointer XY — NO re-renders
    const ghostRef = useRef(null);                             // ghost DOM node — moved directly
    const boardRef = useRef(null);                             // board DOM node
    const cellSzRef = useRef(48);                              // cached cell size
    const prevHoverRef = useRef(null);                         // previous hover pos to avoid redundant setHoverPos

    // ── Measure grid ─────────────────────────────────────────
    useEffect(() => {
        const measure = () => {
            if (!boardRef.current) return;
            const w = boardRef.current.offsetWidth;
            cellSzRef.current = Math.floor((w - GAP * (BOARD_SIZE - 1)) / BOARD_SIZE);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // ── Placement helpers ─────────────────────────────────────
    const isValid = useCallback((shape, sr, sc, b) => {
        for (let r = 0; r < shape.length; r++)
            for (let c = 0; c < shape[r].length; c++)
                if (shape[r][c] === 1) {
                    const br = sr + r, bc = sc + c;
                    if (br < 0 || br >= BOARD_SIZE || bc < 0 || bc >= BOARD_SIZE) return false;
                    if (b[br][bc] !== null) return false;
                }
        return true;
    }, []);

    const fitsAnywhere = useCallback((shape, b) => {
        for (let r = 0; r < BOARD_SIZE; r++)
            for (let c = 0; c < BOARD_SIZE; c++)
                if (isValid(shape, r, c, b)) return true;
        return false;
    }, [isValid]);

    // ── Block generation ──────────────────────────────────────
    const generateBlocks = useCallback((b) => {
        const shuffled = [...SHAPES].sort(() => Math.random() - 0.5);
        const result = [];
        for (let i = 0; i < 3; i++) {
            const fittable = shuffled.filter(s => fitsAnywhere(s.shape, b));
            let picked;
            if (fittable.length > 0) {
                const scored = fittable
                    .map(s => ({ s, v: shapeLineScore(s.shape, b) }))
                    .sort((a, z) => z.v - a.v);
                const topN = scored.slice(0, Math.min(4, scored.length));
                picked = topN[Math.floor(Math.random() * topN.length)].s;
            } else {
                picked = SHAPES[0]; // single cell fallback
            }
            result.push({ ...picked, id: `${Date.now()}-${i}-${Math.random()}`, isUsed: false });
        }
        setBlocks(result);
    }, [fitsAnywhere]);

    useEffect(() => {
        if (blocks.length === 0) generateBlocks(board);
    }, [blocks, board, generateBlocks]);

    // ── Stuck detection ───────────────────────────────────────
    useEffect(() => {
        if (!blocks.length) return;
        const available = blocks.filter(b => !b.isUsed);
        if (!available.length) { generateBlocks(board); return; }
        const stuck = !available.some(b => fitsAnywhere(b.shape, board));
        if (stuck) {
            setNudge('💡 Board is full! Clear some lines!');
            setTimeout(() => setNudge(null), 2500);
            const tiny = SHAPES.filter(s => s.shape.flat().filter(v => v).length <= 2);
            const picks = tiny.sort(() => Math.random() - 0.5).slice(0, 3);
            setBlocks(picks.map((s, i) => ({ ...s, id: `fallback-${Date.now()}-${i}`, isUsed: false })));
        }
    }, [board, blocks, fitsAnywhere, generateBlocks]);

    // ── Place block on board ──────────────────────────────────
    const placeBlock = useCallback((block, blockIdx, sr, sc) => {
        setBoard(prevBoard => {
            const nb = prevBoard.map(r => [...r]);
            block.shape.forEach((row, r) =>
                row.forEach((c, cc) => { if (c === 1) nb[sr + r][sc + cc] = block.color; })
            );

            // Mark block as used
            setBlocks(prev => prev.map((b, i) => i === blockIdx ? { ...b, isUsed: true } : b));

            const rowsToClear = [];
            const colsToClear = [];
            for (let r = 0; r < BOARD_SIZE; r++)
                if (nb[r].every(v => v !== null)) rowsToClear.push(r);
            for (let c = 0; c < BOARD_SIZE; c++)
                if (nb.every(row => row[c] !== null)) colsToClear.push(c);

            const lines = rowsToClear.length + colsToClear.length;
            const cellCount = block.shape.flat().filter(v => v).length;
            let pts = 10 + cellCount * 5;

            if (lines > 0) {
                pts += lines * 100 + (lines > 1 ? 50 * lines : 0);
                const msg = lines >= 4 ? '🔥 UNBELIEVABLE!' : lines === 3 ? '✨ AWESOME!' : lines === 2 ? '⚡ COMBO x2!' : '🎯 GREAT!';
                setComboMsg(msg);
                setShake(true);
                setTimeout(() => { setShake(false); setComboMsg(null); }, 1500);

                const animSet = new Set();
                rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) animSet.add(`${r}-${c}`); });
                colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) animSet.add(`${r}-${c}`); });
                setClearingCells([...animSet]);

                // Update score & HS
                setScore(prev => {
                    const next = prev + pts;
                    const hs = parseInt(localStorage.getItem(HS_KEY) || '0', 10);
                    if (next > hs) { localStorage.setItem(HS_KEY, String(next)); setHighScore(next); }
                    return next;
                });

                // Delay board clear for animation
                setTimeout(() => {
                    setBoard(b2 => {
                        const cleared = b2.map(r => [...r]);
                        rowsToClear.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) cleared[r][c] = null; });
                        colsToClear.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) cleared[r][c] = null; });
                        return cleared;
                    });
                    setClearingCells([]);
                }, 300);

                return nb; // show placed block before clearing
            }

            // No lines cleared
            setScore(prev => {
                const next = prev + pts;
                const hs = parseInt(localStorage.getItem(HS_KEY) || '0', 10);
                if (next > hs) { localStorage.setItem(HS_KEY, String(next)); setHighScore(next); }
                return next;
            });
            return nb;
        });
    }, []);

    // ── Ghost positioning helper (pure, reads refs) ───────────
    const computeGhostPos = (px, py, shape) => {
        const cs = cellSzRef.current;
        const bw = shape[0].length * cs + (shape[0].length - 1) * GAP;
        const bh = shape.length * cs + (shape.length - 1) * GAP;
        return { left: px - bw / 2, top: py - bh - 30 };
    };

    const computeSnapPos = (px, py, shape) => {
        if (!boardRef.current) return null;
        const rect = boardRef.current.getBoundingClientRect();
        const cs = cellSzRef.current;
        const bw = shape[0].length * cs + (shape[0].length - 1) * GAP;
        const bh = shape.length * cs + (shape.length - 1) * GAP;
        const relX = (px - bw / 2) - rect.left;
        const relY = (py - bh - 30) - rect.top;
        return { row: Math.round(relY / (cs + GAP)), col: Math.round(relX / (cs + GAP)) };
    };

    // ── Pointer down — start drag ─────────────────────────────
    const handlePointerDown = (e, idx) => {
        if (blocks[idx]?.isUsed) return;
        e.preventDefault();
        document.body.style.overflow = 'hidden';
        ptrRef.current = { x: e.clientX, y: e.clientY };
        prevHoverRef.current = null;
        setDraggingIndex(idx);
        setHoverPos(null);
    };

    // ── Global pointer handlers mounted when dragging ─────────
    useEffect(() => {
        if (draggingIndex === null) return;

        const block = blocks[draggingIndex];
        if (!block) return;
        const shape = block.shape;

        const onMove = (e) => {
            const px = e.clientX, py = e.clientY;
            ptrRef.current = { x: px, y: py };

            // Move ghost directly (no React state — zero re-render cost)
            if (ghostRef.current) {
                const snapPos = computeSnapPos(px, py, shape);
                const snapValid = snapPos && isValid(shape, snapPos.row, snapPos.col, board);
                const cs = cellSzRef.current;

                let gLeft, gTop, snapped;
                if (snapValid && boardRef.current) {
                    const rect = boardRef.current.getBoundingClientRect();
                    gLeft = rect.left + snapPos.col * (cs + GAP);
                    gTop = rect.top + snapPos.row * (cs + GAP);
                    snapped = true;
                } else {
                    const g = computeGhostPos(px, py, shape);
                    gLeft = g.left; gTop = g.top;
                    snapped = false;
                }

                ghostRef.current.style.left = `${gLeft}px`;
                ghostRef.current.style.top = `${gTop}px`;
                ghostRef.current.style.transform = snapped ? 'scale(1)' : 'scale(1.08)';
                ghostRef.current.style.opacity = snapped ? '0.85' : '0.95';
                ghostRef.current.style.filter = snapped
                    ? `drop-shadow(0 0 14px ${block.color}AA)`
                    : 'drop-shadow(0 16px 32px rgba(0,0,0,0.7))';

                // Only trigger React state update if snap cell changed (avoids re-render flood)
                const prev = prevHoverRef.current;
                const newSnap = snapValid ? snapPos : null;
                const changed = (!prev && newSnap) || (prev && !newSnap)
                    || (prev && newSnap && (prev.row !== newSnap.row || prev.col !== newSnap.col));
                if (changed) {
                    prevHoverRef.current = newSnap;
                    setHoverPos(newSnap);
                }
            }
        };

        const onUp = (e) => {
            // prevHoverRef always has the latest snap position (updated in onMove via ref, not state)
            const snap = prevHoverRef.current;
            if (snap) {
                placeBlock(block, draggingIndex, snap.row, snap.col);
            }
            setDraggingIndex(null);
            setHoverPos(null);
            prevHoverRef.current = null;
            document.body.style.overflow = '';
        };

        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerup', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        // Note: hoverPos intentionally omitted — onUp reads prevHoverRef.current instead
    }, [draggingIndex, blocks, board, isValid, placeBlock]);

    // ── Preview clear cells ───────────────────────────────────
    const previewCells = useMemo(() => {
        const set = new Set();
        if (!hoverPos || draggingIndex === null) return set;
        const block = blocks[draggingIndex];
        if (!block) return set;
        const sim = board.map(r => [...r]);
        block.shape.forEach((row, r) =>
            row.forEach((c, cc) => {
                if (c === 1) {
                    const sr = hoverPos.row + r, sc = hoverPos.col + cc;
                    if (sr >= 0 && sr < BOARD_SIZE && sc >= 0 && sc < BOARD_SIZE) sim[sr][sc] = 1;
                }
            })
        );
        for (let r = 0; r < BOARD_SIZE; r++)
            if (sim[r].every(v => v !== null)) for (let c = 0; c < BOARD_SIZE; c++) set.add(`${r}-${c}`);
        for (let c = 0; c < BOARD_SIZE; c++)
            if (sim.every(r => r[c] !== null)) for (let r = 0; r < BOARD_SIZE; r++) set.add(`${r}-${c}`);
        return set;
    }, [hoverPos, draggingIndex, blocks, board]);

    const restartGame = () => {
        setBoard(createEmptyBoard());
        setScore(0);
        setBlocks([]);
        setDraggingIndex(null);
        setHoverPos(null);
        setClearingCells([]);
    };
    const leaveRoom = () => { setRoomCode(null); setGameType(null); navigate('/'); };
    if (!user) return null;

    const cs = cellSzRef.current;
    const trayCellSize = Math.max(16, Math.floor(cs * 0.58));
    const draggingBlock = draggingIndex !== null ? blocks[draggingIndex] : null;
    const initGhostPos = draggingBlock
        ? computeGhostPos(ptrRef.current.x, ptrRef.current.y, draggingBlock.shape)
        : { left: -999, top: -999 };

    return (
        <div className="fixed inset-0 flex flex-col bg-slate-950 text-white select-none overflow-hidden touch-none">
            {/* Glow BG */}
            <div className="absolute top-0 left-1/4 w-[60vw] h-[60vw] bg-violet-700/10 blur-[160px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-[50vw] h-[50vw] bg-cyan-500/8 blur-[130px] rounded-full pointer-events-none" />

            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 relative z-10 gap-2">
                <button onClick={leaveRoom} className="p-3 bg-red-700/80 hover:bg-red-600 rounded-xl transition-colors border border-red-900">
                    <LogOut size={20} />
                </button>
                <div className="text-center flex-1">
                    <div className="text-[9px] text-cyan-400 font-black tracking-[0.35em] uppercase mb-0.5">BLOCK BLAST</div>
                    <div className="flex items-center justify-center gap-3">
                        <span className="text-3xl font-black tracking-wider drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]">
                            {score.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 px-2 py-1 rounded-lg text-xs">
                            <Star size={10} className="text-yellow-400 fill-yellow-400" />
                            <span className="text-yellow-400 font-bold">{highScore.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <button onClick={restartGame} className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700">
                    <RotateCcw size={20} />
                </button>
            </div>

            {/* Board */}
            <motion.div
                className="flex-1 flex items-center justify-center px-4 relative z-10"
                animate={shake ? { x: [-10, 10, -8, 8, 0], y: [-5, 5, -4, 4, 0] } : {}}
                transition={{ duration: 0.32 }}
            >
                <div
                    className="relative bg-slate-900/80 rounded-2xl border border-slate-800/80 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-sm"
                    style={{ padding: GAP * 2 }}
                >
                    {/* Nudge */}
                    <AnimatePresence>
                        {nudge && (
                            <motion.div
                                initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                                className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-amber-500/90 text-black font-black text-sm px-4 py-2 rounded-xl shadow-2xl backdrop-blur-sm whitespace-nowrap border border-amber-300 pointer-events-none"
                            >{nudge}</motion.div>
                        )}
                    </AnimatePresence>

                    {/* Combo */}
                    <AnimatePresence>
                        {comboMsg && (
                            <motion.div
                                initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1.1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: 'spring', stiffness: 360, damping: 18 }}
                                className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                            >
                                <span
                                    className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-tr from-yellow-300 via-orange-400 to-red-500 tracking-wider drop-shadow-[0_0_30px_rgba(255,140,0,0.85)]"
                                    style={{ WebkitTextStroke: '2px rgba(255,255,255,0.5)' }}
                                >{comboMsg}</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Grid cells */}
                    <div
                        ref={boardRef}
                        className="grid"
                        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cs}px)`, gridTemplateRows: `repeat(${BOARD_SIZE}, ${cs}px)`, gap: `${GAP}px` }}
                    >
                        {board.map((row, ri) =>
                            row.map((cellColor, ci) => {
                                let hovCol = null;
                                if (hoverPos && draggingIndex !== null) {
                                    const sh = blocks[draggingIndex]?.shape;
                                    const ro = ri - hoverPos.row, co = ci - hoverPos.col;
                                    if (sh && ro >= 0 && ro < sh.length && co >= 0 && co < sh[ro].length && sh[ro][co] === 1 && !cellColor)
                                        hovCol = blocks[draggingIndex].color;
                                }
                                const isClearing = clearingCells.includes(`${ri}-${ci}`);
                                const isPrev = previewCells.has(`${ri}-${ci}`);

                                return (
                                    <div key={`${ri}-${ci}`} style={{
                                        width: cs, height: cs,
                                        borderRadius: Math.max(4, cs * 0.1),
                                        backgroundColor: isClearing ? '#fff' : hovCol ? hovCol : isPrev ? '#fef08a' : cellColor || 'rgba(25,30,44,0.9)',
                                        opacity: hovCol ? 0.72 : 1,
                                        boxShadow: isClearing
                                            ? '0 0 28px 10px rgba(255,255,255,0.85)'
                                            : isPrev
                                                ? 'inset 0 0 12px rgba(255,255,255,0.7), 0 0 16px rgba(253,224,71,0.5)'
                                                : cellColor
                                                    ? `inset 0 0 ${cs * 0.2}px rgba(255,255,255,0.22), 0 2px 6px ${cellColor}77`
                                                    : hovCol
                                                        ? 'inset 0 0 8px rgba(255,255,255,0.35)'
                                                        : 'inset 0 0 4px rgba(0,0,0,0.6)',
                                        transform: isClearing ? 'scale(0.05)' : isPrev ? 'scale(1.07)' : 'scale(1)',
                                        transition: isClearing
                                            ? 'all 0.3s cubic-bezier(0.175,0.885,0.32,1.275)'
                                            : 'background-color 0.07s, transform 0.07s, box-shadow 0.07s',
                                    }} />
                                );
                            })
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Tray */}
            <div className="flex-shrink-0 flex justify-center items-center gap-5 px-6 py-4 relative z-20">
                {blocks.map((block, idx) => {
                    const isDraggingThis = draggingIndex === idx;
                    if (block.isUsed) return <div key={block.id} style={{ width: 88, height: 88 }} className="opacity-0 flex-shrink-0" />;
                    return (
                        <motion.div
                            key={block.id}
                            initial={{ scale: 0, y: 30, opacity: 0 }}
                            animate={{ scale: isDraggingThis ? 0.0 : 1, opacity: isDraggingThis ? 0 : 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                            onPointerDown={(e) => handlePointerDown(e, idx)}
                            className="flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-slate-700/60 rounded-2xl shadow-xl cursor-pointer hover:border-slate-500 active:scale-95 transition-colors flex-shrink-0"
                            style={{ width: 88, height: 88, touchAction: 'none' }}
                        >
                            <div className="grid" style={{ gridTemplateColumns: `repeat(${block.shape[0].length}, ${trayCellSize}px)`, gridTemplateRows: `repeat(${block.shape.length}, ${trayCellSize}px)`, gap: '2px' }}>
                                {block.shape.map((row, r) => row.map((cell, c) => (
                                    <div key={`${r}-${c}`} style={{
                                        width: trayCellSize, height: trayCellSize,
                                        borderRadius: 4,
                                        backgroundColor: cell === 1 ? block.color : 'transparent',
                                        boxShadow: cell === 1 ? `inset 0 0 5px rgba(255,255,255,0.35), 0 2px 4px rgba(0,0,0,0.4)` : 'none',
                                    }} />
                                )))}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Ghost — always in DOM when dragging, positioned via ref (never re-renders on move) */}
            {draggingBlock && (
                <div
                    ref={ghostRef}
                    className="fixed pointer-events-none z-[500]"
                    style={{
                        left: initGhostPos.left,
                        top: initGhostPos.top,
                        transform: 'scale(1.08)',
                        transformOrigin: 'top left',
                        opacity: 0.9,
                        filter: 'drop-shadow(0 16px 32px rgba(0,0,0,0.7))',
                        willChange: 'transform, left, top',
                    }}
                >
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${draggingBlock.shape[0].length}, ${cs}px)`, gridTemplateRows: `repeat(${draggingBlock.shape.length}, ${cs}px)`, gap: `${GAP}px` }}>
                        {draggingBlock.shape.map((row, r) => row.map((cell, c) => (
                            <div key={`${r}-${c}`} style={{
                                width: cs, height: cs,
                                borderRadius: Math.max(4, cs * 0.1),
                                backgroundColor: cell === 1 ? draggingBlock.color : 'transparent',
                                boxShadow: cell === 1 ? `inset 0 0 ${cs * 0.22}px rgba(255,255,255,0.5), 0 4px 10px rgba(0,0,0,0.5)` : 'none',
                            }} />
                        )))}
                    </div>
                </div>
            )}
        </div>
    );
}
