import React, { useContext, useEffect, useState } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { User, ChevronLeft, Target, Trophy, Flame, Users, LogOut } from 'lucide-react';
export default function Profile() {
    const { user, setUser } = useContext(AppContext);
    const navigate = useNavigate();
    const [stats, setStats] = useState({ totalGames: 0, totalWins: 0, winRate: 0 });
    const [clanName, setClanName] = useState(user?.clan || '');
    const [isSavingClan, setIsSavingClan] = useState(false);

    useEffect(() => {
        // Since we migrated to LocalStorage, we compute stats directly on client
        // This is a placeholder for real local transactions array logic
        const txHistory = JSON.parse(localStorage.getItem('houseee_ledger') || '[]');

        // Count unique room codes from 'Bought Ticket for Room XYZ'
        const gamesSet = new Set();
        let wins = 0;

        txHistory.forEach(tx => {
            if (tx.description.includes('Bought Ticket for Room')) {
                const parts = tx.description.split(' ');
                gamesSet.add(parts[parts.length - 1]);
            }
            if (tx.description.includes('Won')) {
                wins++;
            }
        });

        const totalGames = gamesSet.size || 0; // fallback if history wiped

        setStats({
            totalGames,
            totalWins: wins,
            winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0
        });

    }, []);

    const handleSaveClan = () => {
        setIsSavingClan(true);
        setTimeout(() => {
            const updatedUser = { ...user, clan: clanName.toUpperCase() };
            setUser(updatedUser);
            // LocalStorage logic is magically handled by the useEffect in App.jsx when 'user' changes!
            setIsSavingClan(false);
        }, 800);
    };

    const handleLogout = () => {
        if (window.confirm('Are you sure you want to log out? This will reset your profile and wallet balance on this device.')) {
            localStorage.removeItem('houseee_user');
            setUser(null);
            navigate('/');
        }
    };

    // Generate deterministic avatar URL using Dicebear
    const avatarUrl = user ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}&backgroundColor=3b82f6,0f172a&radius=50` : '';

    if (!user) {
        return null;
    }

    return (
        <div className="min-h-screen py-10 px-4 md:px-8 max-w-4xl mx-auto flex flex-col gap-6 md:gap-8">
            <header className="flex items-center gap-4 glass-panel p-4 px-6 z-10">
                <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft size={28} />
                </button>
                <h1 className="text-2xl font-black uppercase tracking-widest text-slate-200 flex items-center gap-3">
                    <User className="text-action" /> Player Profile
                </h1>
            </header>

            <div className="glass-panel p-6 md:p-10 flex-1 flex flex-col md:flex-row gap-8 items-start">
                {/* Left Col - Avatar & Basic Info */}
                <div className="w-full md:w-1/3 flex flex-col items-center text-center gap-4 bg-slate-800/50 p-6 md:p-8 rounded-3xl border border-slate-700/50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-action/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
                    <img
                        src={avatarUrl}
                        alt="Player Avatar"
                        className="w-32 h-32 md:w-40 md:h-40 bg-slate-900 rounded-full border-4 border-action shadow-[0_0_20px_rgba(59,130,246,0.3)] z-10 relative"
                    />
                    <div className="z-10 relative mt-2">
                        <h2 className="text-2xl md:text-3xl font-black text-white px-4">{user.name}</h2>
                        <div className="text-slate-400 font-mono text-sm mt-1 uppercase tracking-widest">{user.id}</div>
                    </div>

                    <div className="w-full mt-4 bg-slate-900/50 border border-slate-700 p-4 rounded-xl z-10 flex flex-col gap-1">
                        <span className="text-slate-500 uppercase text-xs font-bold tracking-wider">Current Wallet</span>
                        <span className="text-3xl font-bold text-neonGreen font-mono">₹{user.walletBalance}</span>
                    </div>
                </div>

                {/* Right Col - Advanced Stats & Settings */}
                <div className="flex-1 w-full flex flex-col gap-6">
                    <h3 className="text-xl font-bold text-slate-300 border-b border-slate-700 pb-2">Career Stats</h3>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl flex flex-col items-center text-center gap-2">
                            <Target size={28} className="text-blue-400" />
                            <span className="text-slate-400 text-sm font-semibold uppercase">Total Games</span>
                            <span className="text-2xl font-black text-white">{stats.totalGames}</span>
                        </div>

                        <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl flex flex-col items-center text-center gap-2">
                            <Trophy size={28} className="text-yellow-500" />
                            <span className="text-slate-400 text-sm font-semibold uppercase">Total Wins</span>
                            <span className="text-2xl font-black text-white">{stats.totalWins}</span>
                        </div>

                        <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl flex flex-col items-center text-center gap-2 col-span-2 lg:col-span-1">
                            <Flame size={28} className="text-orange-500" />
                            <span className="text-slate-400 text-sm font-semibold uppercase">Win Rate</span>
                            <span className="text-2xl font-black text-white">{stats.winRate}%</span>
                        </div>
                    </div>

                    <div className="mt-8">
                        <h3 className="text-xl font-bold text-slate-300 border-b border-slate-700 pb-2 mb-4 flex items-center gap-2">
                            <Users size={20} /> Clan & Teams
                        </h3>
                        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="flex-1 w-full">
                                <label className="block text-sm text-slate-400 font-bold uppercase tracking-wider mb-2">Clan Tag</label>
                                <input
                                    type="text"
                                    maxLength={4}
                                    placeholder="e.g. PRO"
                                    value={clanName}
                                    onChange={(e) => setClanName(e.target.value.toUpperCase())}
                                    className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl text-white font-mono text-xl tracking-widest uppercase focus:border-action outline-none"
                                />
                            </div>
                            <button
                                onClick={handleSaveClan}
                                disabled={isSavingClan || clanName === (user.clan || '')}
                                className={`w-full md:w-auto px-8 py-3 rounded-xl font-bold uppercase tracking-wide transition-all ${isSavingClan ? 'bg-slate-700 text-slate-500' :
                                    clanName !== (user.clan || '') ? 'bg-action text-white hover:bg-neonGreen hover:text-black hover:-translate-y-1' :
                                        'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    }`}
                            >
                                {isSavingClan ? 'Saving...' : 'Save Clan'}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 px-2">
                            Members with the exact same Clan Tag will automatically share Full House winnings! Max 4 characters.
                        </p>
                    </div>

                    <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                        <h4 className="font-bold text-yellow-500 text-sm uppercase tracking-wider mb-2">Notice</h4>
                        <p className="text-slate-300 text-sm leading-relaxed mb-4">
                            Your profile data and wallet balance are stored securely on this device. If you clear your browser data or switch devices, your progress will be reset.
                        </p>

                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl font-bold uppercase tracking-wide transition-all mt-2"
                        >
                            <LogOut size={18} /> Log Out / Reset Device Profile
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
