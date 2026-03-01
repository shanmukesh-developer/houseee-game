import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../App';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, Users, PlusCircle, MinusCircle, Play } from 'lucide-react';

export default function AdminPanel() {
    const { user, gameState, socket } = useContext(AppContext);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user || user.role !== 'admin') {
            navigate('/');
        }
    }, [user, navigate]);

    if (!user || user.role !== 'admin') return null;

    const handleWalletChange = async (userId, amount, action) => {
        try {
            // Connect to the HTTP route for manual adjustments
            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/admin/wallet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount, action })
            });
            // The socket broadcast will automatically update local state
        } catch (err) {
            console.error("Wallet update failed", err);
        }
    };

    const drawNumber = () => {
        socket.emit('drawNumber');
    };

    const resetGame = () => {
        if (confirm("Are you sure you want to reset the entire game board and clear all tickets?")) {
            socket.emit('resetGame');
        }
    };

    return (
        <div className="min-h-screen py-10 px-4 md:px-8 max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-8 border-b border-slate-800 pb-6">
                <ShieldAlert size={36} className="text-action" />
                <div>
                    <h1 className="text-3xl font-black text-white">Admin Control Center</h1>
                    <p className="text-slate-500">Manage players, wallets, and game flows.</p>
                </div>

                <button className="ml-auto btn-neon flex items-center gap-2" onClick={() => navigate('/room')}>
                    <Play size={18} /> Join Room
                </button>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">

                {/* Game Stats & Actions */}
                <div className="glass-panel p-6 lg:col-span-1 border-t-4 border-t-action">
                    <h2 className="text-xl font-bold mb-6 text-slate-300">Live Game Control</h2>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl">
                            <span className="text-slate-400">Status</span>
                            <span className={`font-bold tracking-widest uppercase ${gameState.status === 'active' ? 'text-green-400' : gameState.status === 'finished' ? 'text-red-400' : 'text-yellow-400'}`}>
                                {gameState.status}
                            </span>
                        </div>

                        <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl">
                            <span className="text-slate-400">Total Pool</span>
                            <span className="text-2xl font-black text-neonGreen">₹{gameState.prizePool}</span>
                        </div>

                        <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl">
                            <span className="text-slate-400">Drawn Numbers</span>
                            <span className="font-bold">{gameState.drawnNumbers.length} / 90</span>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-800 space-y-4">
                        <button
                            onClick={drawNumber}
                            disabled={gameState.status === 'finished'}
                            className="btn-neon w-full !text-white text-xl py-6 rounded-xl flex items-center justify-center disabled:opacity-50"
                        >
                            Draw Number
                        </button>

                        <button
                            onClick={resetGame}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-xl transition-colors mt-4"
                        >
                            Reset Game Board
                        </button>
                    </div>
                </div>

                {/* Players & Wallet Management */}
                <div className="glass-panel p-6 lg:col-span-2">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-slate-300 flex items-center gap-2">
                            <Users size={20} /> Player Wallets
                        </h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-700 text-slate-400 text-sm">
                                    <th className="pb-3 pl-2">Player</th>
                                    <th className="pb-3 text-center">In Game</th>
                                    <th className="pb-3">Balance</th>
                                    <th className="pb-3 text-right pr-2">Add/Remove ₹10</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gameState.players.map(p => (
                                    <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                        <td className="py-4 pl-2 font-medium">
                                            {p.name} {p.id === user.id && <span className="text-xs text-action ml-2">(You)</span>}
                                        </td>
                                        <td className="py-4 text-center">
                                            <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                                        </td>
                                        <td className="py-4">
                                            <span className={`font-mono text-lg ${p.walletBalance >= 2 ? 'text-neonGreen' : 'text-red-400'}`}>
                                                ₹{p.walletBalance}
                                            </span>
                                        </td>
                                        <td className="py-4 text-right pr-2">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleWalletChange(p.id, 10, 'deduct')}
                                                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-red-400 transition-colors"
                                                    title="Deduct ₹10"
                                                >
                                                    <MinusCircle size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleWalletChange(p.id, 10, 'add')}
                                                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-green-400 transition-colors"
                                                    title="Add ₹10"
                                                >
                                                    <PlusCircle size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {gameState.players.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="text-center text-slate-500 py-8 italic font-light">
                                            No active users connected currently.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-slate-500 mt-6 italic bg-slate-800/50 p-3 rounded border border-slate-700">
                        * Use this panel as a simulator for a physical wallet. When friends UPI you exactly ₹20 for example, add it here by clicking Add (+) twice. When they buy tickets, ₹2 is automatically deducted.
                    </p>
                </div>

            </div>
        </div>
    );
}
