import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VFXOverlay({ trigger, type, onComplete, color = '#EF4444', message = '' }) {
    // trigger is a boolean or counter that changes when VFX should play
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (trigger) {
            setActive(true);
            const timer = setTimeout(() => {
                setActive(false);
                if (onComplete) onComplete();
            }, 2500); // 2.5s duration
            return () => clearTimeout(timer);
        }
    }, [trigger]);

    if (!active) return null;

    if (type === 'kill') {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, scale: 1 }}
                    animate={{ opacity: 1, scale: 1.05 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, yoyo: 5 }}
                    className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden"
                >
                    {/* Massive Red Flash & Vignette */}
                    <div className="absolute inset-0 bg-red-900/60 mix-blend-multiply" />
                    <motion.div
                        initial={{ scale: 3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3, type: "spring", bounce: 0.6 }}
                        className="text-[10rem] md:text-[20rem] font-black text-red-500 drop-shadow-[0_0_100px_rgba(239,68,68,1)] transform -rotate-12 opacity-80"
                    >
                        KILL
                    </motion.div>

                    {/* Splatter particles */}
                    {[...Array(20)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{
                                x: 0, y: 0,
                                scale: Math.random() * 2 + 1,
                                opacity: 1
                            }}
                            animate={{
                                x: (Math.random() - 0.5) * window.innerWidth,
                                y: (Math.random() - 0.5) * window.innerHeight,
                                scale: 0,
                                opacity: 0
                            }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className="absolute w-8 h-8 rounded-full bg-red-600 blur-sm mix-blend-screen shadow-[0_0_20px_red]"
                        />
                    ))}
                </motion.div>
            </AnimatePresence>
        );
    }

    if (type === 'victory') {
        return (
            <AnimatePresence>
                <div className="fixed inset-0 z-[100] pointer-events-none flex flex-col items-center justify-center overflow-hidden">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-yellow-900/40 mix-blend-color-dodge"
                    />

                    <motion.div
                        initial={{ scale: 0.5, y: 100, opacity: 0, rotateX: 90 }}
                        animate={{ scale: 1, y: 0, opacity: 1, rotateX: 0 }}
                        transition={{ duration: 0.8, type: "spring", bounce: 0.5 }}
                        className="text-7xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-yellow-500 to-orange-600 drop-shadow-[0_0_80px_rgba(234,179,8,1)] z-10 text-center uppercase leading-none tracking-tighter"
                    >
                        {message || 'VICTORY'}
                    </motion.div>

                    {/* Confetti Explosion */}
                    {[...Array(60)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{
                                x: 0, y: 100,
                                scale: Math.random() * 1.5 + 0.5,
                                rotate: 0
                            }}
                            animate={{
                                x: (Math.random() - 0.5) * window.innerWidth * 1.5,
                                y: (Math.random() - 1) * window.innerHeight,
                                rotate: Math.random() * 720
                            }}
                            transition={{ duration: 2, ease: "easeOut" }}
                            className="absolute w-6 h-6 rounded-sm shadow-[0_0_15px_currentColor]"
                            style={{
                                backgroundColor: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#EC4899'][Math.floor(Math.random() * 6)],
                            }}
                        />
                    ))}
                </div>
            </AnimatePresence>
        );
    }

    if (type === 'snake') {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden"
                >
                    <div className="absolute inset-0 bg-green-950/80 mix-blend-multiply" />
                    <motion.div
                        initial={{ scale: 4, y: -500, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
                        className="text-[12rem] filter drop-shadow-[0_0_50px_rgba(34,197,94,1)]"
                    >
                        🐍
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        );
    }

    if (type === 'ladder') {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden"
                >
                    <div className="absolute inset-0 bg-blue-900/60 mix-blend-screen" />
                    <motion.div
                        initial={{ y: 500, opacity: 0 }}
                        animate={{ y: -500, opacity: 1 }}
                        transition={{ duration: 1.5, ease: "easeInOut" }}
                        className="text-[15rem] filter drop-shadow-[0_0_50px_rgba(59,130,246,1)]"
                    >
                        🪜
                    </motion.div>
                </motion.div>
            </AnimatePresence>
        );
    }

    return null;
}
