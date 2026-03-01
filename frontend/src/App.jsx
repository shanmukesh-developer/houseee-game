import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import GameRoom from './pages/GameRoom';
import AdminPanel from './pages/AdminPanel';
import Leaderboard from './pages/Leaderboard';
import Ledger from './pages/Ledger';
import Profile from './pages/Profile';
import { io } from 'socket.io-client';
import { playSound } from './utils/audio';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
export const socket = io(backendUrl);
export const AppContext = React.createContext();

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

  useEffect(() => {
    if (user) {
      localStorage.setItem('houseee_user', JSON.stringify(user));
      socket.emit('connectUser', user);
    }
  }, [user]);

  useEffect(() => {
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
      alert(`🎉 HOUSEEE! ${winnerName} won ${labels[claimType]}!`);
    });

    socket.on('roomCreated', (code) => setRoomCode(code));
    socket.on('joinedRoom', (code) => setRoomCode(code));

    return () => {
      socket.off('gameStateUpdate');
      socket.off('ticketUpdate');
      socket.off('walletUpdate');
      socket.off('errorMsg');
      socket.off('winnerDeclared');
      socket.off('roomCreated');
      socket.off('joinedRoom');
    };
  }, []);

  return (
    <AppContext.Provider value={{ user, setUser, socket, gameState, setGameState, myTickets, setMyTickets, roomCode, setRoomCode }}>
      <Router>
        <div className="app-container relative min-h-screen">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-96 bg-action/20 blur-[100px] rounded-full pointer-events-none -z-10"></div>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/room" element={<GameRoom />} />
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
