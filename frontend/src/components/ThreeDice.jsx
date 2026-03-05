import React from 'react';
import { motion } from 'framer-motion';

const faces = [
    { id: 1, rotateX: 0, rotateY: 0 },
    { id: 6, rotateX: 0, rotateY: 180 },
    { id: 2, rotateX: 0, rotateY: -90 },
    { id: 5, rotateX: 0, rotateY: 90 },
    { id: 3, rotateX: 90, rotateY: 0 },
    { id: 4, rotateX: -90, rotateY: 0 },
];

const DiceFace = ({ number, rotateX, rotateY }) => {
    const dotPositions = {
        1: [4],
        2: [0, 8],
        3: [0, 4, 8],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 3, 6, 2, 5, 8]
    };

    return (
        <div
            className="absolute inset-0 bg-white rounded-xl border-4 border-slate-200 shadow-inner flex items-center justify-center"
            style={{
                transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(30px)`,
                backfaceVisibility: 'hidden',
                backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")'
            }}
        >
            <div className="grid grid-cols-3 grid-rows-3 w-[70%] h-[70%] gap-1">
                {[...Array(9)].map((_, i) => (
                    <div key={i} className="flex items-center justify-center">
                        {dotPositions[number].includes(i) && (
                            <div className="w-full h-full max-w-[12px] max-h-[12px] bg-slate-800 rounded-full shadow-inner" />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function ThreeDice({ value, isRolling }) {
    const targetFace = faces.find(f => f.id === value) || faces[0];

    return (
        <div className="w-24 h-24 flex items-center justify-center" style={{ perspective: '1000px' }}>
            <motion.div
                animate={isRolling ? {
                    rotateX: [0, 360, 720, 1080],
                    rotateY: [0, 720, 1440, 2160],
                    rotateZ: [0, 180, 540, 720],
                    y: [0, -40, 0, -40, 0],
                    scale: [1, 1.2, 1, 1.2, 1]
                } : {
                    rotateX: -targetFace.rotateX,
                    rotateY: -targetFace.rotateY,
                    rotateZ: 0,
                    y: 0,
                    scale: 1
                }}
                transition={{
                    duration: isRolling ? 1.5 : 0.6,
                    repeat: isRolling ? Infinity : 0,
                    ease: isRolling ? "linear" : "backOut"
                }}
                className="w-[60px] h-[60px] relative transform-gpu"
                style={{ transformStyle: 'preserve-3d' }}
            >
                {faces.map(face => (
                    <DiceFace key={face.id} number={face.id} rotateX={face.rotateX} rotateY={face.rotateY} />
                ))}
            </motion.div>
        </div>
    );
}
