import React, { useState, useEffect } from 'react';

const text = "SHANMUKH'S VERSE";

export default function Intro({ onComplete }) {
    const [show, setShow] = useState(true);
    const [showButton, setShowButton] = useState(false);

    useEffect(() => {
        // Total animation time: text.length * sequence delay + wait time
        const totalTime = text.length * 100 + 800; // time it takes for letters to animate in
        const timer = setTimeout(() => {
            setShowButton(true);
        }, totalTime);

        return () => clearTimeout(timer);
    }, []);

    const handleEnter = () => {
        if (!showButton) return;
        setShow(false);
        setTimeout(onComplete, 800); // Wait for fade out
    };

    const container = {
        hidden: { opacity: 1 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
            },
        },
    };

    const letterAnim = {
        hidden: { opacity: 0, y: 40 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.6, ease: [0.2, 0.65, 0.3, 0.9] },
        },
    };

    return (
        <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: show ? 1 : 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0d0d0d] overflow-hidden"
        >
            <motion.h1
                variants={container}
                initial="hidden"
                animate="visible"
                className="text-[5vw] sm:text-3xl md:text-5xl lg:text-6xl xl:text-7xl tracking-widest sm:tracking-[0.25em] text-[#f5f5f5] text-center px-2 md:px-8 font-bold relative z-10 whitespace-nowrap mb-12 sm:mb-16"
                style={{ fontFamily: "'Cinzel', serif" }}
            >
                {text.split('').map((char, index) => (
                    <motion.span
                        key={index}
                        variants={letterAnim}
                        className="inline-block drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                    >
                        {char === ' ' ? '\u00A0' : char}
                    </motion.span>
                ))}
            </motion.h1>

            {/* Enter Button */}
            <motion.button
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{
                    opacity: showButton ? 1 : 0,
                    scale: showButton ? 1 : 0.9,
                    y: showButton ? 0 : 20
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                onClick={handleEnter}
                disabled={!showButton}
                className={`relative z-10 px-10 py-3 sm:px-12 sm:py-4 bg-transparent border border-[#f5f5f5]/30 text-[#f5f5f5] text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.3em] uppercase transition-all duration-500 rounded-md shadow-[0_0_20px_rgba(255,255,255,0.05)] ${showButton ? 'hover:bg-[#f5f5f5] hover:text-[#0d0d0d] hover:shadow-[0_0_40px_rgba(255,255,255,0.8)] cursor-pointer' : 'pointer-events-none'}`}
                style={{ fontFamily: "'Inter', sans-serif" }}
            >
                Enter
            </motion.button>

            {/* Premium background effects */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[1000px] h-[300px] bg-white/5 blur-[100px] rounded-full pointer-events-none"></div>
        </motion.div>
    );
}
