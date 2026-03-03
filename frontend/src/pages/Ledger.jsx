import React, { useEffect, useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Receipt, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

export default function Ledger() {
    const [transactions, setTransactions] = useState([]);
    const { user } = useContext(AppContext);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user?.id) return;
        fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'}/api/ledger/${user.id}`)
            .then(res => res.json())
            .then(data => setTransactions(data))
            .catch(console.error);
    }, [user?.id]);

    if (!user) {
        navigate('/');
        return null;
    }

    return (
        <div className="min-h-screen py-10 px-4 md:px-8 max-w-4xl mx-auto flex flex-col gap-8">
            <header className="flex items-center gap-4 glass-panel p-4 px-6 z-10">
                <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft size={28} />
                </button>
                <h1 className="text-2xl font-black uppercase tracking-widest text-slate-200 flex items-center gap-3">
                    <Receipt className="text-action" /> Transaction History
                </h1>
            </header>

            <main className="glass-panel p-6 md:p-10 flex-1">
                <div className="flex flex-col gap-3">
                    {transactions.length === 0 ? (
                        <div className="text-center text-slate-500 italic py-10">No transactions recorded yet...</div>
                    ) : (
                        transactions.map((tx, index) => {
                            const isCredit = tx.type === 'credit';
                            return (
                                <motion.div
                                    key={tx.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="flex items-center justify-between p-4 rounded-xl border bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-full ${isCredit ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                            {isCredit ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-200">{tx.description}</div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {new Date(tx.date).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`text-lg font-mono font-bold ${isCredit ? 'text-neonGreen' : 'text-red-400'}`}>
                                        {isCredit ? '+' : '-'}₹{tx.amount}
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>
            </main>
        </div>
    );
}
