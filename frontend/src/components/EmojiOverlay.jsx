import React, { useEffect, useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { AnimatePresence } from 'framer-motion';

export default function EmojiOverlay() {
    const { socket } = useContext(AppContext);
    const [emojis, setEmojis] = useState([]);

    useEffect(() => {
        if (!socket) return;

        const handleReceiveEmoji = ({ emoji, id }) => {
            const newEmoji = {
                id,
                emoji,
                x: Math.random() * 80 + 10, // 10% to 90% wide
                clientX: Math.random() * 20 - 10 // Store local variation offset for predictable rendering
            };
            setEmojis(prev => [...prev, newEmoji]);

            // Remove after animation
            setTimeout(() => {
                setEmojis(prev => prev.filter(e => e.id !== id));
            }, 3000);
        };

        socket.on('receiveEmoji', handleReceiveEmoji);
        return () => socket.off('receiveEmoji', handleReceiveEmoji);
    }, [socket]);

    return (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
            <AnimatePresence>
                {emojis.map(e => (
                    <motion.div
                        key={e.id}
                        initial={{ opacity: 0, y: 100, scale: 0.5, x: `${e.x}vw` }}
                        animate={{ opacity: 1, y: -800, scale: 3, x: `${e.clientX}vw` }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2.5, ease: "easeOut" }}
                        className="absolute bottom-0 text-6xl drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]"
                    >
                        {e.emoji}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
