import React, { useContext, useEffect, useState, useRef } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Ticket from '../components/Ticket';
import { Users, Trophy, ChevronLeft, Ticket as TicketIcon, Zap, PlayCircle, PauseCircle, KeySquare, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { playSound } from '../utils/audio';

export default function GameRoom() {
    const { user, gameState, socket, myTickets, roomCode, setRoomCode, setGameType } = useContext(AppContext);
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const chatEndRef = useRef(null);

    const leaveRoom = () => {
        setRoomCode(null);
        setGameType(null);
        navigate('/');
    };

    useEffect(() => {
        if (!socket) return;
        socket.on('chatMessage', (msg) => {
            setMessages(prev => [...prev.slice(-49), msg]); // Keep last 50 messages
        });
        return () => {
            socket.off('chatMessage');
        }
    }, [socket]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (gameState?.drawnNumbers?.length > 0) {
            playSound('draw');
        }
    }, [gameState?.drawnNumbers?.length]);

    useEffect(() => {
        if (!user || !roomCode) {
            navigate('/');
        }
    }, [user, roomCode, navigate]);

    const buyTicket = () => {
        socket.emit('buyTicket', { userId: user.id, roomCode });
    };

    const handleClaimWin = (claimType) => {
        socket.emit('claimWin', { userId: user.id, roomCode, claimType });
    };

    const toggleDraw = () => {
        if (gameState.isPaused) {
            socket.emit('resumeDraw', { userId: user.id, roomCode });
        } else {
            socket.emit('pauseDraw', { userId: user.id, roomCode });
        }
    };

    const sendChat = (e) => {
    
        e.preventDefault();
        if (!chatInput.trim()) return;
        socket.emit('sendChatMessage', { roomCode, userId: user.id, message: chatInput });
        setChatInput('');
    };


    // Safely fallback gameState to prevent React crash while loading from Socket
    const safeGameState = gameState || { isPaused: true, drawnNumbers: [], players: [], prizePool: 0, winners: {} };
    const isHost = safeGameState.hostId === user?.id;

    if (!user || !roomCode) return null;

    return (
        <div className="min-h-screen py-6 px-4 md:px-8 max-w-7xl mx-auto flex flex-col gap-8">

            {/* Top Bar */}
            <header className="flex flex-col md:flex-row justify-between items-center glass-panel p-3 md:p-4 px-4 md:px-6 relative z-10 gap-3 md:gap-4">
                <div className="flex items-center justify-between w-full md:w-auto gap-4">
                    <button onClick={leaveRoom} className="text-slate-400 hover:text-white transition-colors bg-slate-800/50 p-2 rounded-lg md:bg-transparent md:p-0">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="flex flex-1 md:flex-none justify-center items-center gap-2 bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg font-mono tracking-widest text-lg md:text-xl font-bold">
                        <KeySquare className="text-slate-500 hidden sm:block" size={20} />
                        {roomCode}
                    </div>
                </div>

                <div className="flex items-center justify-between w-full md:w-auto gap-2 md:gap-6 text-sm md:text-base">
                    <div className="flex-1 md:flex-none flex justify-center items-center gap-1 md:gap-2 text-action font-semibold bg-action/10 px-3 md:px-4 py-2 rounded-lg border border-action/20">
                        <Trophy size={16} className="md:w-[18px] md:h-[18px]" />
                        <span>Pool: ₹{gameState.prizePool}</span>
                    </div>
                    <div className="flex items-center gap-1 md:gap-2 text-slate-300 bg-slate-800/50 px-3 py-2 rounded-lg md:bg-transparent md:px-0 md:py-0">
                        <Users size={16} className="md:w-[18px] md:h-[18px]" />
                        <span>{gameState.players?.length || 0}</span>
                    </div>
                    <div className="hidden lg:block ml-4">
                        <span className="text-slate-500 mr-2">Player:</span>
                        <span className="font-bold">{user.name}</span>
                        <span className="text-neonGreen ml-4 font-mono">₹{user.walletBalance}</span>
                    </div>
                </div>
            </header>

            {/* Main Game Area */}
            <main className="flex-1 flex flex-col xl:flex-row gap-8 relative">

                {/* Left Col - Game Board & Drawn Numbers */}
                <div className="flex-1 flex flex-col gap-8">

                    {/* Recent Numbers Display */}
                    <div className="glass-panel p-6 flex flex-col items-center justify-center relative overflow-hidden min-h-[200px]">
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                            <Zap size={150} />
                        </div>

                        <div className="flex justify-between w-full mb-4 px-4 items-center">
                            <h2 className="text-slate-400 text-sm font-bold tracking-widest uppercase mb-4">Latest Draw</h2>

                            {/* Host Controls */}
                            {isHost && (
                                <div className="flex gap-2">
                                    <select
                                        value={safeGameState.drawSpeed || 4000}
                                        onChange={(e) => socket.emit('changeSpeed', { roomCode, userId: user.id, speed: parseInt(e.target.value) })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 text-sm text-slate-300 outline-none cursor-pointer"
                                        disabled={!safeGameState.isPaused}
                                    >
                                        <option value={6000}>Slow (6s)</option>
                                        <option value={4000}>Normal (4s)</option>
                                        <option value={2000}>Turbo (2s)</option>
                                    </select>
                                    <button
                                        onClick={toggleDraw}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${safeGameState.isPaused ? 'bg-highlight text-black hover:bg-neonGreen' : 'bg-red-500 text-white hover:bg-red-400'}`}
                                    >
                                        {safeGameState.isPaused ? <><PlayCircle size={18} /> Auto Draw</> : <><PauseCircle size={18} /> Pause Draw</>}
                                    </button>
                                </div>
                            )}
                        </div>

                        <AnimatePresence mode="popLayout">
                            {safeGameState.drawnNumbers.length > 0 ? (
                                <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-center">
                                    <motion.div
                                        key={safeGameState.drawnNumbers[0]}
                                        initial={{ scale: 0, rotate: -180 }}
                                        animate={{ scale: 1, rotate: 0 }}
                                        className="w-20 h-20 md:w-32 md:h-32 rounded-full bg-drawn text-black flex items-center justify-center text-4xl md:text-6xl font-black shadow-[0_0_30px_rgba(234,179,8,0.5)] border-4 border-white/20 z-10"
                                    >
                                        {safeGameState.drawnNumbers[0]}
                                    </motion.div>

                                    {safeGameState.drawnNumbers.slice(1, 6).map((num) => (
                                        <motion.div
                                            key={num}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="w-10 h-10 md:w-16 md:h-16 rounded-full bg-slate-800 text-white flex items-center justify-center text-lg md:text-2xl font-bold border border-slate-700 opacity-70"
                                        >
                                            {num}
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-slate-500 text-lg md:text-xl font-light italic">
                                    {isHost ? 'Click Auto Draw to begin!' : 'Waiting for host to start draw...'}
                                </div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Player's Tickets Section */}
                    <div className="flex-1 flex flex-col items-center justify-start rounded-2xl relative w-full">
                        {myTickets && myTickets.length > 0 ? (
                            <div className="w-full flex flex-col gap-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-slate-400 font-bold tracking-widest uppercase">My Tickets ({myTickets.length}/3)</h3>
                                    {myTickets.length < 3 && safeGameState.status !== 'finished' && (
                                        <button
                                            onClick={buyTicket}
                                            disabled={user.walletBalance < 2}
                                            className="bg-action/20 text-action hover:bg-action hover:text-white transition-colors border border-action/30 px-3 py-1 rounded text-sm font-bold flex items-center gap-2"
                                        >
                                            <TicketIcon size={16} /> + Buy More (₹2)
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-col xl:flex-row gap-4 w-full overflow-x-auto pb-4 custom-scrollbar">
                                    {myTickets.map((ticket, index) => (
                                        <div key={ticket.ticketId || index} className="min-w-full xl:min-w-[400px] flex-1">
                                            <Ticket
                                                ticketData={ticket}
                                                drawnNumbers={safeGameState.drawnNumbers}
                                                onClaim={handleClaimWin}
                                                winners={safeGameState.winners}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {safeGameState.status === 'finished' && (
                                    <div className="w-full max-w-sm mx-auto text-center py-4 rounded-xl bg-slate-800 border-2 border-slate-600 text-slate-300 font-bold text-xl uppercase tracking-widest mt-4 flex flex-col items-center gap-4">
                                        <div>Game Finished</div>
                                        {isHost ? (
                                            <button
                                                onClick={() => socket.emit('restartGame', { roomCode, userId: user.id })}
                                                className="bg-highlight text-black hover:bg-neonGreen transition-colors px-6 py-2 rounded-lg text-sm flex items-center gap-2 normal-case tracking-normal"
                                            >
                                                <PlayCircle size={18} /> Play Next Game
                                            </button>
                                        ) : (
                                            <div className="text-sm text-slate-400 normal-case tracking-normal font-normal">Waiting for host to start next game...</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="glass-panel p-12 text-center w-full max-w-lg border-dashed border-2 border-slate-700">
                                <TicketIcon size={64} className="mx-auto text-slate-500 mb-6" />
                                <h3 className="text-2xl font-bold mb-2">Ready to Play?</h3>
                                <p className="text-slate-400 mb-8">Buy a ticket to enter the current game round.</p>
                                <button
                                    onClick={buyTicket}
                                    disabled={user.walletBalance < 2 || safeGameState.status === 'finished'}
                                    className={`btn-neon text-xl py-4 px-12 inline-flex items-center gap-2 ${(user.walletBalance < 2 || safeGameState.status === 'finished') ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <TicketIcon /> {user.walletBalance < 2 ? 'Insufficient Balance' : 'Buy Ticket (₹2)'}
                                </button>
                                {safeGameState.status === 'finished' && (
                                    <div className="mt-8 text-slate-400 flex justify-center">
                                        {isHost ? (
                                            <button
                                                onClick={() => socket.emit('restartGame', { roomCode, userId: user.id })}
                                                className="bg-highlight text-black hover:bg-neonGreen transition-colors px-6 py-2 rounded-lg text-sm flex items-center gap-2 font-bold"
                                            >
                                                <PlayCircle size={18} /> Play Next Game
                                            </button>
                                        ) : (
                                            "Waiting for host to start next game..."
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>

                {/* Right Col - Game Activity & Chat (Responsive Stack) */}
                <aside className="w-full xl:w-96 flex flex-col md:flex-row xl:flex-col gap-4 h-auto xl:h-[800px] xl:max-h-[calc(100vh-120px)] xl:sticky xl:top-[120px]">
                    {/* Players List */}
                    <div className="glass-panel p-4 md:p-6 flex flex-col flex-1 h-[250px] md:h-[400px] xl:h-1/2">
                        <h3 className="font-bold text-base md:text-lg mb-4 text-slate-300 border-b border-slate-800 pb-2 flex justify-between shrink-0">
                            Players <span>{safeGameState.players?.length}</span>
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-2 md:space-y-3 pr-2 custom-scrollbar">
                            {safeGameState.players?.map(p => (
                                <div key={p.id} className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                    <span className={`${p.id === user.id ? 'text-action font-semibold' : 'text-slate-300'} flex items-center gap-2`}>
                                        {p.id === safeGameState.hostId && <Crown size={14} className="text-yellow-500" />}
                                        {p.name} {p.id === user.id && '(You)'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Chat Panel */}
                    <div className="glass-panel p-4 flex flex-col h-[300px] md:h-[400px] xl:h-1/2 flex-1">
                        <h3 className="font-bold text-sm mb-2 text-slate-400 border-b border-slate-800 pb-2">Room Chat</h3>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar mb-2 flex flex-col">
                            {messages.map(m => (
                                <div key={m.id} className={`text-sm p-2 rounded-lg max-w-[85%] break-words ${m.senderId === user.id ? 'bg-highlight/20 text-right self-end' : 'bg-slate-800/50 self-start'}`}>
                                    <div className="text-xs text-slate-500 font-bold mb-1">{m.senderName}</div>
                                    <div className="text-slate-200">{m.message}</div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={sendChat} className="flex gap-2 shrink-0">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                placeholder="Type a message..."
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-highlight"
                                maxLength={100}
                            />
                            <button type="submit" className="bg-highlight text-black px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50" disabled={!chatInput.trim()}>Send</button>
                        </form>
                    </div>
                </aside>

            </main>
        </div>
    );
}
