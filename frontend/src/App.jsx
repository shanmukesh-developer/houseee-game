import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Intro from './components/Intro';
import Home from './pages/Home';
import GameRoom from './pages/GameRoom';
import AdminPanel from './pages/AdminPanel';
import Leaderboard from './pages/Leaderboard';
import Ledger from './pages/Ledger';
import Profile from './pages/Profile';
import { io } from 'socket.io-client';
import { playSound } from './utils/audio';

// Intelligently determine the backend URL
const getBackendUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && envUrl.trim() !== '') return envUrl;

  const hostname = window.location.hostname;

  // If we are on production render but the env var is missing, it's a configuration error
  if (hostname.includes('render.com')) {
    console.error("VITE_BACKEND_URL is missing in Render environment variables!");
    return 'https://houseee-game-2.onrender.com'; // Hard-fallback to the URL you showed me earlier just in case
  }

  // If accessing from a local network IP on mobile (e.g., 192.168.1.5), use that exact IP for the backend port
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:5000`;
  }

  return 'http://localhost:5000';
};

const backendUrl = getBackendUrl();
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
      alert(`🎉 HOUSEEE! ${winnerName} won ${labels[claimType]}${prizeText}!`);
    });

    socket.on('roomCreated', (code) => setRoomCode(code));
    socket.on('joinedRoom', (code) => setRoomCode(code));
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
    <AppContext.Provider value={{ user, setUser, socket, gameState, setGameState, myTickets, setMyTickets, roomCode, setRoomCode }}>
      {!introDone && <Intro onComplete={() => setIntroDone(true)} />}
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
