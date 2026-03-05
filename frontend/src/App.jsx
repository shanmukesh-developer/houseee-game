import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Intro from './components/Intro';
import Home from './pages/Home';
import GameRoom from './pages/GameRoom';
import AdminPanel from './pages/AdminPanel';
import Leaderboard from './pages/Leaderboard';
import Ledger from './pages/Ledger';
import Profile from './pages/Profile';
import TicTacToe from './pages/TicTacToe';
import SOSGame from './pages/SOSGame';
import SnakesLadders from './pages/SnakesLadders';
import Ludo from './pages/Ludo';
import BlockBlast from './pages/BlockBlast';
import TerritoryWar from './pages/TerritoryWar';
import AgarGame from './pages/AgarGame';
import BattleRoyale from './pages/BattleRoyale';
import BomberGrid from './pages/BomberGrid';
import CoreDefense from './pages/CoreDefense';
import CarArena from './pages/CarArena';
import { AppContext, socket } from './context/AppContext';
import { playSound } from './utils/audio';

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('houseee_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [gameState, setGameState] = useState({
    code: null,
    hostId: null,
    players: [],
    drawnNumbers: [],
    prizePool: 0,
    status: 'waiting',
    isPaused: true,
    winners: {}
  });

  const [myTickets, setMyTickets] = useState([]);
  const [roomCode, setRoomCode] = useState(null);
  const [gameType, setGameType] = useState(null);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (user) {
      console.log('User identified from localStorage:', user);
      localStorage.setItem('houseee_user', JSON.stringify(user));
      socket.emit('connectUser', user);
    } else {
      console.log('No user found in localStorage on App load.');
    }
  }, [user]);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('✅ Socket connected successfully!', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.log('❌ Socket connection error:', err.message);
    });

    socket.on('gameStateUpdate', (state) => {
      setGameState(state);
    });

    socket.on('ticketUpdate', (tickets) => {
      // The backend will now send an array of tickets
      setMyTickets(Array.isArray(tickets) ? tickets : [tickets]);
    });

    socket.on('walletUpdate', (newBalance) => {
      setUser(prev => prev ? { ...prev, walletBalance: newBalance } : prev);
    });

    socket.on('errorMsg', (msg) => {
      playSound('error');
      alert(msg);
    });

    socket.on('winnerDeclared', ({ winnerName, claimType, prize }) => {
      playSound('win');
      const labels = {
        jaldi5: 'Early 5', fourCorners: 'Four Corners', rowTop: 'Top Line', rowMid: 'Middle Line', rowBot: 'Bottom Line', fullHouse: 'Full House'
      };

      const prizeText = prize > 0 ? ` and received ₹${prize}` : '';
      const displayClaim = labels[claimType] || claimType; // Fallback to raw claimType
      const gamePrefix = labels[claimType] ? 'HOUSEEE' : 'WINNER';

      alert(`🎉 ${gamePrefix}! ${winnerName} won ${displayClaim}${prizeText}!`);
    });

    socket.on('roomCreated', ({ code, type }) => {
      setRoomCode(code);
      setGameType(type);
    });
    socket.on('joinedRoom', ({ code, type }) => {
      setRoomCode(code);
      setGameType(type);
    });
    socket.on('gameRestarted', () => setMyTickets([]));

    return () => {
      socket.off('gameStateUpdate');
      socket.off('ticketUpdate');
      socket.off('walletUpdate');
      socket.off('errorMsg');
      socket.off('winnerDeclared');
      socket.off('roomCreated');
      socket.off('joinedRoom');
      socket.off('gameRestarted');
    };
  }, []);

  return (
    <AppContext.Provider value={{ user, setUser, socket, gameState, setGameState, myTickets, setMyTickets, roomCode, setRoomCode, gameType, setGameType }}>
      {!introDone && <Intro onComplete={() => setIntroDone(true)} />}
      <Router>
        <div className="app-container relative min-h-screen">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-action/20 blur-[100px] rounded-full pointer-events-none -z-10"></div>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room" element={<GameRoom />} />
            <Route path="/tictactoe" element={<TicTacToe />} />
            <Route path="/sos" element={<SOSGame />} />
            <Route path="/snakesladders" element={<SnakesLadders />} />
            <Route path="/ludo" element={<Ludo />} />
            <Route path="/blockblast" element={<BlockBlast />} />
            <Route path="/territorywar" element={<TerritoryWar />} />
            <Route path="/agargame" element={<AgarGame />} />
            <Route path="/battleroyale" element={<BattleRoyale />} />
            <Route path="/bombergrid" element={<BomberGrid />} />
            <Route path="/coredefense" element={<CoreDefense />} />
            <Route path="/cararena" element={<CarArena />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </div>
      </Router>
    </AppContext.Provider>
  );
}

export default App;
