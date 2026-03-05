const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { generateTicket, checkJaldi5, checkRow, checkFullHouse, checkFourCorners } = require('./utils/tambola');
const { processLudoMove, canMoveAnyToken } = require('./utils/ludoEngine');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory Database
const DB = {
  users: {}, // id: { id, name, walletBalance, role }
  rooms: {}, // code: { code, hostId, players: [], drawnNumbers: [], tickets: {}, prizePool: 0, status: 'waiting', isPaused: true, intervalId: null, drawSpeed: 4000, winners: { jaldi5: null, rowTop: null, rowMid: null, rowBot: null, fullHouse: null, fourCorners: null } }
};

const Transactions = []; // Array to store transaction ledger: { id, userId, userName, type, amount, date, description }

const addTransaction = (userId, type, amount, description) => {
  const user = DB.users[userId];
  if (user) {
    Transactions.push({
      id: Date.now() + Math.random(),
      userId,
      userName: user.name,
      type, // 'credit' or 'debit'
      amount,
      date: new Date().toISOString(),
      description
    });
  }
};

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

app.get('/', (req, res) => {
  res.send({ status: 'HOUSEEE Backend Running', db: DB });
});

app.post('/api/admin/wallet', (req, res) => {
  const { userId, amount, action } = req.body;
  if (!DB.users[userId]) return res.status(404).json({ error: 'User not found' });

  if (action === 'add') {
    DB.users[userId].walletBalance += amount;
    addTransaction(userId, 'credit', amount, 'Admin Recharge');
  }
  if (action === 'deduct') {
    DB.users[userId].walletBalance -= amount;
    addTransaction(userId, 'debit', amount, 'Admin Deduction');
  }

  // Sync wallet balance to all rooms this user is in
  Object.values(DB.rooms).forEach(room => {
    const pIndex = room.players.findIndex(p => p.id === userId);
    if (pIndex > -1) {
      room.players[pIndex].walletBalance = DB.users[userId].walletBalance;
      broadcastRoomState(room.code);
    }
  });

  res.json({ success: true, user: DB.users[userId] });
});

// APIs for Leaderboard and Ledger
app.get('/api/leaderboard', (req, res) => {
  const sortedUsers = Object.values(DB.users)
    .filter(u => u.role !== 'admin')
    .sort((a, b) => b.walletBalance - a.walletBalance)
    .slice(0, 10);
  res.json(sortedUsers);
});

app.get('/api/ledger/:userId', (req, res) => {
  const userTx = Transactions.filter(tx => tx.userId === req.params.userId).reverse();
  res.json(userTx);
});

const broadcastRoomState = (code) => {
  const room = DB.rooms[code];
  if (!room) return;
  const safeState = {
    ...room,
    intervalId: undefined, // don't send interval to frontend
    players: room.players.map(p => ({
      id: p.id, name: p.name, walletBalance: p.walletBalance
    })),
    tickets: undefined
  };
  io.to(code).emit('gameStateUpdate', safeState);
};

const drawNumberAutomatically = (code) => {
  const room = DB.rooms[code];
  if (!room || room.status !== 'active' || room.isPaused) return;

  const allPool = Array.from({ length: 90 }, (_, i) => i + 1);
  const availablePool = allPool.filter(n => !room.drawnNumbers.includes(n));

  if (availablePool.length > 0) {
    const num = availablePool[Math.floor(Math.random() * availablePool.length)];
    room.drawnNumbers.unshift(num);
    broadcastRoomState(code);
  } else {
    // All numbers drawn
    clearInterval(room.intervalId);
    room.status = 'finished';
    broadcastRoomState(code);
  }
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // General auth connect
  socket.on('connectUser', (userData) => {
    DB.users[userData.id] = { ...userData, socketId: socket.id };
    socket.emit('walletUpdate', userData.walletBalance);
  });

  // Create Room
  socket.on('createRoom', ({ userId, userFallback, gameType }) => {
    let user = DB.users[userId];
    if (!user && userFallback) {
      user = userFallback;
      DB.users[userId] = { ...userFallback, socketId: socket.id };
    }
    if (!user) return;

    const code = generateRoomCode();

    // Default Houseee Logic Data
    let defaultRoomData = {
      code,
      hostId: userId,
      gameType: gameType || 'houseee', // store the game type
      players: [user],
      drawnNumbers: [],
      tickets: {},
      prizePool: 0,
      totalCollected: 0,
      status: 'waiting',
      isPaused: true,
      intervalId: null,
      drawSpeed: 4000,
      winners: { jaldi5: null, rowTop: null, rowMid: null, rowBot: null, fullHouse: null, fourCorners: null, pyramid: null }
    };

    // Helper: Generates 15x15 Bomber Grid
    const generateBomberGrid = () => {
      const grid = Array(15).fill(null).map(() => Array(15).fill(0));
      for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
          if (r % 2 === 1 && c % 2 === 1) {
            grid[r][c] = 1; // Indestructible Wall
          } else {
            // Safe spawn corners
            const isSafe = (r < 2 && c < 2) || (r < 2 && c > 12) || (r > 12 && c < 2) || (r > 12 && c > 12);
            if (!isSafe && Math.random() < 0.6) {
              grid[r][c] = 2; // Destructible Wall
            }
          }
        }
      }
      return grid;
    };

    // Initialize specific game payloads
    if (gameType === 'tictactoe') {
      defaultRoomData.board = Array(9).fill(null);
      defaultRoomData.turn = userId; // host goes first by default
      defaultRoomData.winner = null;
    } else if (gameType === 'sos') {
      defaultRoomData.board = Array(256).fill(null);
      defaultRoomData.turn = userId;
      defaultRoomData.winner = null;
      defaultRoomData.scores = { [userId]: 0 };
    } else if (gameType === 'snakesladders') {
      defaultRoomData.positions = { [userId]: 0 };
      defaultRoomData.turn = userId;
      defaultRoomData.winner = null;
      defaultRoomData.snakes = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 30 };
      defaultRoomData.ladders = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
      defaultRoomData.history = []; // To store last rolls
    } else if (gameType === 'ludo') {
      defaultRoomData.turn = userId;
      defaultRoomData.tokens = { [userId]: [-1, -1, -1, -1] };
      defaultRoomData.winner = null;
      defaultRoomData.colors = { [userId]: 'red' };
      defaultRoomData.sixStreak = { [userId]: 0 };
      defaultRoomData.history = [];
    } else if (gameType === 'blockblast') {
      defaultRoomData.score = 0;
      defaultRoomData.status = 'playing';
      defaultRoomData.winner = null;
    } else if (gameType === 'territorywar') {
      defaultRoomData.grid = Array(15).fill(null).map(() => Array(15).fill(null));
      defaultRoomData.positions = { [userId]: { r: 0, c: 0 } }; // Host spawns Top-Left
      defaultRoomData.colors = { [userId]: 'red' };
      defaultRoomData.scores = { [userId]: 0 };
      defaultRoomData.winner = null;
      defaultRoomData.history = [];
    } else if (gameType === 'agargame') {
      defaultRoomData.playersState = {
        [userId]: { x: 50, y: 50, radius: 2, score: 0, isAlive: true }
      };
      defaultRoomData.colors = { [userId]: 'red' };
      defaultRoomData.food = Array.from({ length: 50 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316'][Math.floor(Math.random() * 6)]
      }));
      defaultRoomData.timeLeft = 90;
      defaultRoomData.status = 'playing';
      defaultRoomData.history = [];
    } else if (gameType === 'battleroyale') {
      defaultRoomData.playersState = {
        [userId]: { x: 50, y: 50, hp: 100, shield: false, speed: 1, weapon: null, isAlive: true, angle: 0, kills: 0 }
      };
      defaultRoomData.colors = { [userId]: 'red' };
      defaultRoomData.loot = Array.from({ length: 30 }).map((_, i) => ({
        id: i, x: Math.random() * 90 + 5, y: Math.random() * 90 + 5,
        type: ['health', 'shield', 'speed', 'gun', 'health', 'gun'][Math.floor(Math.random() * 6)]
      }));
      defaultRoomData.bullets = [];
      defaultRoomData.zone = { cx: 50, cy: 50, radius: 100, shrinkRate: 0.05 };
      defaultRoomData.timeLeft = 90;
      defaultRoomData.status = 'playing';
      defaultRoomData.history = [];
    } else if (gameType === 'bombergrid') {
      defaultRoomData.grid = generateBomberGrid();
      defaultRoomData.playersState = {
        [userId]: { x: 0, y: 0, isAlive: true, maxBombs: 1, currentBombs: 0, blastRadius: 1, speed: 1, kills: 0 }
      };
      defaultRoomData.colors = { [userId]: 'red' };
      defaultRoomData.bombs = [];
      defaultRoomData.explosions = [];
      defaultRoomData.powerups = [];
      defaultRoomData.timeLeft = 120;
      defaultRoomData.status = 'playing';
      defaultRoomData.history = [];
    } else if (gameType === 'coredefense') {
      defaultRoomData.coreHp = 1000;
      defaultRoomData.playersState = {
        [userId]: { x: 50, y: 50, isAlive: true, gold: 0, kills: 0 }
      };
      defaultRoomData.colors = { [userId]: 'cyan' };
      defaultRoomData.enemies = [];
      defaultRoomData.towers = [];
      defaultRoomData.bullets = [];
      defaultRoomData.lasers = [];
      defaultRoomData.timeLeft = 180; // 3 minutes
      defaultRoomData.status = 'playing';
      defaultRoomData.history = [];
    } else if (gameType === 'cararena') {
      defaultRoomData.playersState = {
        [userId]: { x: 50, y: 50, angle: 0, velocity: 0, steer: 0, isAlive: true, coins: 0 }
      };
      defaultRoomData.colors = { [userId]: 'yellow' };
      defaultRoomData.coins = Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        x: Math.random() * 90 + 5,
        y: Math.random() * 90 + 5
      }));
      defaultRoomData.timeLeft = 90;
      defaultRoomData.status = 'playing';
      defaultRoomData.history = [];
    }

    DB.rooms[code] = defaultRoomData;

    socket.join(code);
    socket.emit('roomCreated', { code, type: gameType || 'houseee' });
    broadcastRoomState(code);
  });

  // Join Room
  socket.on('joinRoom', ({ userId, roomCode, userFallback }) => {
    let user = DB.users[userId];
    if (!user && userFallback) {
      user = userFallback;
      DB.users[userId] = { ...userFallback, socketId: socket.id };
    }
    const room = DB.rooms[roomCode];

    if (!user || !room) {
      socket.emit('errorMsg', 'Invalid Room Code or User');
      return;
    }

    if (!room.players.find(p => p.id === userId)) {
      room.players.push(user);

      // Initialize states for new players joining specific games
      if (room.gameType === 'snakesladders') {
        room.positions[userId] = 0;
      } else if (room.gameType === 'ludo') {
        room.tokens[userId] = [-1, -1, -1, -1];
        room.sixStreak[userId] = 0; // Initialize streak
        const colors = ['red', 'blue', 'green', 'yellow'];
        const used = Object.values(room.colors || {});
        room.colors[userId] = colors.find(c => !used.includes(c)) || 'red';
      } else if (room.gameType === 'territorywar') {
        const availableColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
        const usedColors = Object.values(room.colors || {});
        const myColor = availableColors.find(c => !usedColors.includes(c)) || 'gray';
        room.colors[userId] = myColor;

        // Distribute spawns to different corners/edges
        const spawns = [
          { r: 0, c: 0 }, { r: 14, c: 14 }, { r: 0, c: 14 }, { r: 14, c: 0 },
          { r: 7, c: 7 }, { r: 0, c: 7 }, { r: 14, c: 7 }, { r: 7, c: 0 }
        ];
        room.positions[userId] = spawns[room.players.length - 1] || { r: 7, c: 7 };
        room.scores[userId] = 0;
      } else if (room.gameType === 'agargame') {
        const availableColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];
        const usedColors = Object.values(room.colors || {});
        room.colors[userId] = availableColors.find(c => !usedColors.includes(c)) || 'gray';

        // Spawn randomly
        room.playersState[userId] = {
          x: Math.random() * 90 + 5,
          y: Math.random() * 90 + 5,
          radius: 2,
          score: 0,
          isAlive: true
        };
      } else if (room.gameType === 'battleroyale') {
        const availableColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];
        const usedColors = Object.values(room.colors || {});
        room.colors[userId] = availableColors.find(c => !usedColors.includes(c)) || 'gray';
        room.playersState[userId] = {
          x: Math.random() * 90 + 5, y: Math.random() * 90 + 5, hp: 100, shield: false, speed: 1, weapon: null, isAlive: true, angle: 0, kills: 0
        };
      } else if (room.gameType === 'bombergrid') {
        const availableColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
        const usedColors = Object.values(room.colors || {});
        room.colors[userId] = availableColors.find(c => !usedColors.includes(c)) || 'gray';

        const spawns = [{ x: 0, y: 0 }, { x: 14, y: 14 }, { x: 14, y: 0 }, { x: 0, y: 14 }];
        const pos = spawns[room.players.length - 1] || { x: 7, y: 7 };
        room.playersState[userId] = { ...pos, isAlive: true, maxBombs: 1, currentBombs: 0, blastRadius: 1, speed: 1, kills: 0 };
      } else if (room.gameType === 'coredefense') {
        const availableColors = ['cyan', 'red', 'yellow', 'purple', 'green', 'orange', 'pink', 'blue'];
        const usedColors = Object.values(room.colors || {});
        room.colors[userId] = availableColors.find(c => !usedColors.includes(c)) || 'gray';

        // Form a tight circle around the core
        const angle = (room.players.length * Math.PI) / 2;
        room.playersState[userId] = {
          x: 50 + Math.cos(angle) * 5,
          y: 50 + Math.sin(angle) * 5,
          isAlive: true, gold: 0, kills: 0
        };
      } else if (room.gameType === 'cararena') {
        const availableColors = ['yellow', 'red', 'blue', 'green', 'purple', 'orange', 'pink', 'cyan'];
        const usedColors = Object.values(room.colors || {});
        room.colors[userId] = availableColors.find(c => !usedColors.includes(c)) || 'gray';

        const spawns = [{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 90, y: 10 }, { x: 10, y: 90 }];
        const pos = spawns[room.players.length - 1] || { x: 50, y: 50 };
        room.playersState[userId] = { ...pos, angle: 0, velocity: 0, steer: 0, isAlive: true, coins: 0 };
      }
    }

    socket.join(roomCode);
    socket.emit('joinedRoom', { code: roomCode, type: room.gameType || 'houseee' });
    broadcastRoomState(roomCode);

    // Send ticket if already bought
    if (room.tickets[userId]) {
      socket.emit('ticketUpdate', room.tickets[userId]);
    }
  });

  // Host Controls: Start/Resume Auto-Draw
  socket.on('resumeDraw', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.hostId !== userId) return;

    room.status = 'active';
    room.isPaused = false;

    if (room.intervalId) clearInterval(room.intervalId);
    room.intervalId = setInterval(() => drawNumberAutomatically(roomCode), room.drawSpeed);

    broadcastRoomState(roomCode);
  });

  // Host Controls: Change Speed
  socket.on('changeSpeed', ({ roomCode, userId, speed }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.hostId !== userId) return;

    room.drawSpeed = speed;

    if (!room.isPaused) {
      if (room.intervalId) clearInterval(room.intervalId);
      room.intervalId = setInterval(() => drawNumberAutomatically(roomCode), room.drawSpeed);
    }
    broadcastRoomState(roomCode);
  });

  // Host Controls: Pause Auto-Draw
  socket.on('pauseDraw', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.hostId !== userId) return;

    room.isPaused = true;
    if (room.intervalId) clearInterval(room.intervalId);

    broadcastRoomState(roomCode);
  });

  // Host Controls: Restart Game
  socket.on('restartGame', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.hostId !== userId) return;

    room.status = 'waiting';
    room.isPaused = true;
    room.winner = null;

    if (room.gameType === 'snakesladders') {
      for (let pid in room.positions) room.positions[pid] = 0;
      room.history = [];
      room.turn = room.hostId;
    } else if (room.gameType === 'ludo') {
      for (let pid in room.tokens) room.tokens[pid] = [-1, -1, -1, -1];
      room.history = [];
      room.turn = room.hostId;
      room.diceRolled = false;
      room.lastDice = null;
    } else if (room.gameType === 'sos') {
      room.board = Array(256).fill(null);
      room.scores = {};
      room.players.forEach(p => { room.scores[p.id] = 0; });
      room.turn = room.hostId;
    } else if (room.gameType === 'tictactoe') {
      room.board = Array(9).fill(null);
      room.turn = room.hostId;
    } else if (room.gameType === 'blockblast') {
      room.score = 0;
      room.status = 'playing';
    } else if (room.gameType === 'territorywar') {
      room.grid = Array(15).fill(null).map(() => Array(15).fill(null));
      room.scores = {};
      room.timeLeft = 60;
      room.status = 'playing';
      room.winner = null;
      room.history = [];
      room.players.forEach((p, idx) => {
        room.scores[p.id] = 0;
        const spawns = [
          { r: 0, c: 0 }, { r: 14, c: 14 }, { r: 0, c: 14 }, { r: 14, c: 0 },
          { r: 7, c: 7 }, { r: 0, c: 7 }, { r: 14, c: 7 }, { r: 7, c: 0 }
        ];
        room.positions[p.id] = spawns[idx] || { r: 7, c: 7 };
      });
    } else if (room.gameType === 'agargame') {
      room.timeLeft = 90;
      room.status = 'playing';
      room.history = [];
      room.winner = null;
      room.food = Array.from({ length: 50 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316'][Math.floor(Math.random() * 6)]
      }));
      room.players.forEach(p => {
        room.playersState[p.id] = {
          x: Math.random() * 90 + 5,
          y: Math.random() * 90 + 5,
          radius: 2,
          score: 0,
          isAlive: true
        };
      });
    } else if (room.gameType === 'battleroyale') {
      room.timeLeft = 90;
      room.status = 'playing';
      room.history = [];
      room.winner = null;
      room.bullets = [];
      room.zone = { cx: 50, cy: 50, radius: 100, shrinkRate: 0.05 };
      room.loot = Array.from({ length: 30 }).map((_, i) => ({
        id: i, x: Math.random() * 90 + 5, y: Math.random() * 90 + 5,
        type: ['health', 'shield', 'speed', 'gun', 'health', 'gun'][Math.floor(Math.random() * 6)]
      }));
      room.players.forEach(p => {
        room.playersState[p.id] = {
          x: Math.random() * 90 + 5, y: Math.random() * 90 + 5, hp: 100, shield: false, speed: 1, weapon: null, isAlive: true, angle: 0, kills: 0
        };
      });
    } else if (room.gameType === 'bombergrid') {
      const generateGrid = () => {
        const grid = Array(15).fill(null).map(() => Array(15).fill(0));
        for (let r = 0; r < 15; r++) {
          for (let c = 0; c < 15; c++) {
            if (r % 2 === 1 && c % 2 === 1) grid[r][c] = 1;
            else {
              const isSafe = (r < 2 && c < 2) || (r < 2 && c > 12) || (r > 12 && c < 2) || (r > 12 && c > 12);
              if (!isSafe && Math.random() < 0.6) grid[r][c] = 2;
            }
          }
        }
        return grid;
      };
      room.grid = generateGrid();
      room.bombs = [];
      room.explosions = [];
      room.powerups = [];
      room.timeLeft = 120;
      room.status = 'playing';
      room.history = [];
      room.winner = null;
      room.players.forEach((p, idx) => {
        const spawns = [{ x: 0, y: 0 }, { x: 14, y: 14 }, { x: 14, y: 0 }, { x: 0, y: 14 }];
        const pos = spawns[idx] || { x: 7, y: 7 };
        room.playersState[p.id] = { ...pos, isAlive: true, maxBombs: 1, currentBombs: 0, blastRadius: 1, speed: 1, kills: 0 };
      });
    } else if (room.gameType === 'coredefense') {
      room.coreHp = 1000;
      room.enemies = [];
      room.towers = [];
      room.bullets = [];
      room.lasers = [];
      room.timeLeft = 180;
      room.status = 'playing';
      room.history = [];
      room.winner = null;
      room.players.forEach((p, idx) => {
        const angle = (idx * Math.PI) / 2;
        room.playersState[p.id] = {
          x: 50 + Math.cos(angle) * 5,
          y: 50 + Math.sin(angle) * 5,
          isAlive: true, gold: 0, kills: 0
        };
      });
    } else if (room.gameType === 'cararena') {
      room.timeLeft = 90;
      room.status = 'playing';
      room.history = [];
      room.winner = null;
      room.coins = Array.from({ length: 20 }).map((_, i) => ({
        id: i,
        x: Math.random() * 90 + 5,
        y: Math.random() * 90 + 5
      }));
      room.players.forEach((p, idx) => {
        const spawns = [{ x: 10, y: 10 }, { x: 90, y: 90 }, { x: 90, y: 10 }, { x: 10, y: 90 }];
        const pos = spawns[idx] || { x: 50, y: 50 };
        room.playersState[p.id] = { ...pos, angle: 0, velocity: 0, steer: 0, isAlive: true, coins: 0 };
      });
    } else {
      room.drawnNumbers = [];
      room.tickets = {};
      room.prizePool = 0;
      room.totalCollected = 0;
      room.winners = { jaldi5: null, rowTop: null, rowMid: null, rowBot: null, fullHouse: null, fourCorners: null, pyramid: null };
      if (room.intervalId) clearInterval(room.intervalId);
      room.intervalId = null;
    }

    io.to(roomCode).emit('gameRestarted');
    broadcastRoomState(roomCode);
  });

  socket.on('buyTicket', ({ userId, roomCode }) => {
    let user = DB.users[userId];
    let room = DB.rooms[roomCode];
    if (!user || !room) return;

    if (!room.tickets[userId]) {
      room.tickets[userId] = [];
    }

    if (room.tickets[userId].length >= 3) {
      return socket.emit('errorMsg', 'You have reached the maximum of 3 tickets!');
    }

    if (user.walletBalance >= 2) {
      user.walletBalance -= 2;
      room.prizePool += 2;
      room.totalCollected = (room.totalCollected || 0) + 2;

      const pIndex = room.players.findIndex(p => p.id === userId);
      if (pIndex > -1) room.players[pIndex].walletBalance = user.walletBalance;

      const newTicket = generateTicket();
      room.tickets[userId].push(newTicket);

      addTransaction(userId, 'debit', 2, `Bought Ticket for Room ${roomCode}`);

      socket.emit('walletUpdate', user.walletBalance);
      socket.emit('ticketUpdate', room.tickets[userId]);

      broadcastRoomState(roomCode);
    } else {
      socket.emit('errorMsg', 'Insufficient Balance!');
    }
  });

  // Win Claim Validation
  socket.on('claimWin', ({ userId, roomCode, claimType }) => {
    const room = DB.rooms[roomCode];
    const user = DB.users[userId];
    if (!room || !user || !room.tickets[userId]) return;

    const userTickets = room.tickets[userId];
    let isValid = false;

    // Ensure that claim category is not already won
    if (room.winners[claimType]) {
      socket.emit('errorMsg', 'This category has already been claimed by someone else!');
      return;
    }

    // Check if ANY of the user's tickets have the winning claim
    for (const ticket of userTickets) {
      if (claimType === 'jaldi5' && checkJaldi5(ticket, room.drawnNumbers)) isValid = true;
      if (claimType === 'rowTop' && checkRow(ticket, room.drawnNumbers, 0)) isValid = true;
      if (claimType === 'rowMid' && checkRow(ticket, room.drawnNumbers, 1)) isValid = true;
      if (claimType === 'rowBot' && checkRow(ticket, room.drawnNumbers, 2)) isValid = true;
      if (claimType === 'fullHouse' && checkFullHouse(ticket, room.drawnNumbers)) isValid = true;
      if (claimType === 'fourCorners' && checkFourCorners(ticket, room.drawnNumbers)) isValid = true;
      if (isValid) break;
    }

    if (isValid) {
      room.winners[claimType] = { userId, name: user.name, clan: user.clan };

      // Determine award
      let awardPercentage = 0;
      if (['jaldi5', 'fourCorners', 'rowTop', 'rowMid', 'rowBot'].includes(claimType)) {
        awardPercentage = 0.10;
      } else if (claimType === 'fullHouse') {
        awardPercentage = 0.50;
      }

      // ALWAYS calculate the award from the INITIAL total collected, not the shrinking prizePool
      const award = (room.totalCollected) * awardPercentage;
      room.prizePool = Math.max(0, room.prizePool - award);

      // Clan Shared Winnings Strategy (only applies to Full House)
      if (claimType === 'fullHouse' && user.clan) {
        // Find all users in this room with the same clan tag
        const clanMembers = room.players.filter(p => p.clan && p.clan.toUpperCase() === user.clan.toUpperCase());
        if (clanMembers.length > 0) {
          const sharedAward = award / clanMembers.length;
          clanMembers.forEach(member => {
            const mUser = DB.users[member.id];
            if (mUser) {
              mUser.walletBalance += sharedAward;
              addTransaction(member.id, 'credit', sharedAward, `Clan Share (${user.clan}): ${claimType} in Room ${roomCode}`);
              const pIndex = room.players.findIndex(p => p.id === member.id);
              if (pIndex > -1) room.players[pIndex].walletBalance = mUser.walletBalance;
              // Update specific sockets in real-time
              if (mUser.socketId) io.to(mUser.socketId).emit('walletUpdate', mUser.walletBalance);
            }
          });
        } else {
          user.walletBalance += award;
          if (award > 0) addTransaction(userId, 'credit', award, `Won ${claimType} in Room ${roomCode}`);
          const pIndex = room.players.findIndex(p => p.id === userId);
          if (pIndex > -1) room.players[pIndex].walletBalance = user.walletBalance;
        }
      } else {
        // Normal Non-Clan Winner
        user.walletBalance += award;
        if (award > 0) addTransaction(userId, 'credit', award, `Won ${claimType} in Room ${roomCode}`);
        const pIndex = room.players.findIndex(p => p.id === userId);
        if (pIndex > -1) room.players[pIndex].walletBalance = user.walletBalance;
      }

      if (claimType === 'fullHouse') {
        room.status = 'finished';
        room.isPaused = true;
        if (room.intervalId) clearInterval(room.intervalId);

        // Host gets 10% commission on finish
        const hostAward = (room.totalCollected || room.prizePool) * 0.10;
        room.prizePool = Math.max(0, room.prizePool - hostAward);
        const hostUser = DB.users[room.hostId];
        if (hostUser) {
          hostUser.walletBalance += hostAward;
          addTransaction(room.hostId, 'credit', hostAward, `Host Commission for Room ${roomCode}`);
          const hostPIndex = room.players.findIndex(p => p.id === room.hostId);
          if (hostPIndex > -1) room.players[hostPIndex].walletBalance = hostUser.walletBalance;
          if (hostUser.socketId) io.to(hostUser.socketId).emit('walletUpdate', hostUser.walletBalance);
        }
      }

      const pIndex = room.players.findIndex(p => p.id === userId);
      if (pIndex > -1) room.players[pIndex].walletBalance = user.walletBalance;

      socket.emit('walletUpdate', user.walletBalance);
      io.to(roomCode).emit('winnerDeclared', {
        winnerName: user.name,
        claimType,
        prize: award
      });
      broadcastRoomState(roomCode);
    } else {
      if (user.walletBalance >= 0.5) {
        user.walletBalance -= 0.5;
        room.prizePool += 0.5;
        room.totalCollected = (room.totalCollected || 0) + 0.5;

        const pIndex = room.players.findIndex(p => p.id === userId);
        if (pIndex > -1) room.players[pIndex].walletBalance = user.walletBalance;

        addTransaction(userId, 'debit', 0.5, `Bogus Claim Penalty in Room ${roomCode}`);

        socket.emit('walletUpdate', user.walletBalance);
        broadcastRoomState(roomCode);
        socket.emit('errorMsg', 'Bogus Claim! ₹0.5 penalty deducted.');
      } else {
        socket.emit('errorMsg', 'Bogus Claim! Be careful.');
      }
    }
  });

  // --- GAME SPECIFIC LOGICS ---

  // Generic Game Start (Timer Loop)
  socket.on('startGame', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.hostId !== userId || room.status !== 'waiting') return;

    room.status = 'playing';

    if (room.gameType === 'territorywar') {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timeLeft = 60;
      room.timerInterval = setInterval(() => {
        if (!DB.rooms[roomCode] || DB.rooms[roomCode].status !== 'playing') {
          clearInterval(room.timerInterval);
          return; // Room closed or stopped
        }
        DB.rooms[roomCode].timeLeft -= 1;

        if (DB.rooms[roomCode].timeLeft <= 0) {
          // Game Over
          DB.rooms[roomCode].status = 'finished';
          clearInterval(room.timerInterval);

          // Determine Winner
          let maxScore = -1;
          let winner = null;
          for (const [pId, score] of Object.entries(DB.rooms[roomCode].scores)) {
            if (score > maxScore) {
              maxScore = score;
              winner = pId;
            }
          }
          DB.rooms[roomCode].winner = winner;
          if (winner && DB.users[winner]) {
            io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[winner].name, claimType: 'Territory War Win', prize: 0 });
          }
        }
        broadcastRoomState(roomCode);
      }, 1000);
    } else if (room.gameType === 'agargame') {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timeLeft = 90;

      // High frequency game loop (10fps for server reconciliation/state sync)
      room.timerInterval = setInterval(() => {
        if (!DB.rooms[roomCode] || DB.rooms[roomCode].status !== 'playing') {
          clearInterval(room.timerInterval);
          return;
        }

        // Decrement time every 10 ticks (1 second)
        room.tickInfo = (room.tickInfo || 0) + 1;
        if (room.tickInfo % 10 === 0) room.timeLeft -= 1;

        if (room.timeLeft <= 0) {
          // Game Over
          room.status = 'finished';
          clearInterval(room.timerInterval);

          // Determine Winner
          let maxScore = -1;
          let winner = null;
          for (const [pId, pState] of Object.entries(room.playersState)) {
            if (pState.score > maxScore) {
              maxScore = pState.score;
              winner = pId;
            }
          }
          room.winner = winner;
          if (winner && DB.users[winner]) {
            io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[winner].name, claimType: 'Agar Growth Win', prize: 0 });
          }
        }

        // Broadcast full state (in a real production app we'd send deltas, but for 10 players this is fine)
        broadcastRoomState(roomCode);

      }, 100); // 100ms = 10 updates a second
    } else if (room.gameType === 'battleroyale') {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timeLeft = 90;

      room.timerInterval = setInterval(() => {
        if (!DB.rooms[roomCode] || DB.rooms[roomCode].status !== 'playing') {
          clearInterval(room.timerInterval);
          return;
        }

        room.tickInfo = (room.tickInfo || 0) + 1;
        if (room.tickInfo % 20 === 0) room.timeLeft -= 1; // 50ms tick

        // Shrink Zone
        room.zone.radius = Math.max(0, room.zone.radius - room.zone.shrinkRate);

        // Update Bullets
        for (let i = room.bullets.length - 1; i >= 0; i--) {
          const b = room.bullets[i];
          b.x += b.vx;
          b.y += b.vy;

          if (b.x < 0 || b.x > 100 || b.y < 0 || b.y > 100) {
            room.bullets.splice(i, 1);
            continue;
          }

          let hit = false;
          for (const [pId, pState] of Object.entries(room.playersState)) {
            if (pId !== b.ownerId && pState.isAlive) {
              const dx = pState.x - b.x;
              const dy = pState.y - b.y;
              if (dx * dx + dy * dy < 4) { // hit radius squared
                hit = true;
                if (pState.shield) {
                  pState.shield = false;
                } else {
                  pState.hp -= 25;
                }
                if (pState.hp <= 0) {
                  pState.hp = 0;
                  pState.isAlive = false;
                  room.history.push({ type: 'kill', killer: b.ownerId, victim: pId, id: Date.now() + Math.random() });
                  if (room.playersState[b.ownerId]) room.playersState[b.ownerId].kills++;
                }
                break;
              }
            }
          }
          if (hit) room.bullets.splice(i, 1);
        }

        let aliveCount = 0;
        let lastAlive = null;

        for (const [pId, pState] of Object.entries(room.playersState)) {
          if (pState.isAlive) {
            aliveCount++;
            lastAlive = pId;

            // Zone damage
            if (room.tickInfo % 20 === 0) { // every sec
              const dx = pState.x - room.zone.cx;
              const dy = pState.y - room.zone.cy;
              if (Math.sqrt(dx * dx + dy * dy) > room.zone.radius) {
                pState.hp -= 10;
                if (pState.hp <= 0) {
                  pState.hp = 0;
                  pState.isAlive = false;
                  room.history.push({ type: 'zone_death', victim: pId, id: Date.now() + Math.random() });
                }
              }
            }
          }
        }

        if ((aliveCount <= 1 && DB.rooms[roomCode].players.length > 1) || room.timeLeft <= 0) {
          room.status = 'finished';
          clearInterval(room.timerInterval);
          room.winner = lastAlive;
          if (lastAlive && DB.users[lastAlive]) {
            io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[lastAlive].name, claimType: 'Battle Royale Victory', prize: 0 });
          }
        }

        broadcastRoomState(roomCode);
      }, 50); // 50ms tick
    } else if (room.gameType === 'bombergrid') {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timeLeft = 120;

      room.timerInterval = setInterval(() => {
        if (!DB.rooms[roomCode] || DB.rooms[roomCode].status !== 'playing') {
          clearInterval(room.timerInterval);
          return;
        }

        room.tickInfo = (room.tickInfo || 0) + 1;
        if (room.tickInfo % 10 === 0) room.timeLeft -= 1; // 100ms ticks = 10/s

        const now = Date.now();

        // Clear old explosions
        room.explosions = room.explosions.filter(ex => now < ex.expires);

        // Explode Bombs
        for (let i = room.bombs.length - 1; i >= 0; i--) {
          const b = room.bombs[i];
          if (now >= b.explodeTime) {
            room.bombs.splice(i, 1);
            if (room.playersState[b.ownerId]) {
              room.playersState[b.ownerId].currentBombs = Math.max(0, room.playersState[b.ownerId].currentBombs - 1);
            }

            // Calculate Blast Raycasts
            const blastArea = [{ x: b.x, y: b.y }];
            const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

            for (const [dx, dy] of dirs) {
              for (let step = 1; step <= b.radius; step++) {
                const tx = b.x + dx * step;
                const ty = b.y + dy * step;

                if (tx < 0 || tx > 14 || ty < 0 || ty > 14) break;

                const cell = room.grid[ty][tx];
                if (cell === 1) break; // Indestructible

                blastArea.push({ x: tx, y: ty });

                if (cell === 2) { // Destructible
                  room.grid[ty][tx] = 0;
                  // 40% chance to drop powerup
                  if (Math.random() < 0.4) {
                    room.powerups.push({
                      id: Date.now() + Math.random(),
                      x: tx, y: ty,
                      type: ['bomb', 'fire', 'speed'][Math.floor(Math.random() * 3)]
                    });
                  }
                  break; // Stops blast
                }
              }
            }

            // Add explosion visuals
            for (const pt of blastArea) {
              room.explosions.push({ x: pt.x, y: pt.y, expires: now + 500, id: Math.random() });

              // Destroy any powerups caught in blast
              room.powerups = room.powerups.filter(pu => pu.x !== pt.x || pu.y !== pt.y);

              // Chain react other bombs
              for (let j = 0; j < room.bombs.length; j++) {
                if (room.bombs[j].x === pt.x && room.bombs[j].y === pt.y) {
                  room.bombs[j].explodeTime = now; // trigger immediately next loop
                }
              }

              // Kill Players
              for (const [pId, pState] of Object.entries(room.playersState)) {
                if (pState.isAlive && Math.round(pState.x) === pt.x && Math.round(pState.y) === pt.y) {
                  pState.isAlive = false;
                  room.history.push({ type: 'explosion_death', victim: pId, killer: b.ownerId, id: Date.now() + Math.random() });
                  if (pId !== b.ownerId && room.playersState[b.ownerId]) room.playersState[b.ownerId].kills++;
                }
              }
            }
          }
        }

        // End game check
        let aliveCount = 0;
        let lastAlive = null;
        for (const [pId, pState] of Object.entries(room.playersState)) {
          if (pState.isAlive) { aliveCount++; lastAlive = pId; }
        }

        if ((aliveCount <= 1 && DB.rooms[roomCode].players.length > 1) || room.timeLeft <= 0) {
          room.status = 'finished';
          clearInterval(room.timerInterval);
          room.winner = lastAlive;
          if (lastAlive && DB.users[lastAlive]) {
            io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[lastAlive].name, claimType: 'Bomber Grid Win', prize: 0 });
          }
        }

        broadcastRoomState(roomCode);
      }, 100);
    } else if (room.gameType === 'coredefense') {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timeLeft = 180; // 3 minutes

      room.timerInterval = setInterval(() => {
        if (!DB.rooms[roomCode] || DB.rooms[roomCode].status !== 'playing') {
          clearInterval(room.timerInterval);
          return;
        }

        room.tickInfo = (room.tickInfo || 0) + 1;
        if (room.tickInfo % 20 === 0) room.timeLeft -= 1; // 50ms ticks = 20/s

        const now = Date.now();
        room.lasers = []; // Reset visual lasers every tick

        // Spawn Enemies
        // Spawn rate increases as time goes down. Starts at 1 enemy per 2 secs, ends at 1 per 0.5 secs
        const spawnFrames = Math.max(10, Math.floor(40 * (room.timeLeft / 180)));
        if (room.tickInfo % spawnFrames === 0) {
          const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }];
          const spawn = corners[Math.floor(Math.random() * corners.length)];
          const hpScale = 50 + ((180 - room.timeLeft) * 2); // Enemies get tankier

          room.enemies.push({
            x: spawn.x + (Math.random() * 10 - 5),
            y: spawn.y + (Math.random() * 10 - 5),
            hp: hpScale,
            maxHp: hpScale,
            speed: 0.3 + (Math.random() * 0.2), // 0.3 to 0.5 per tick
            id: Date.now() + Math.random()
          });
        }

        // Move Enemies toward Core (50, 50)
        for (let i = room.enemies.length - 1; i >= 0; i--) {
          const e = room.enemies[i];
          const dx = 50 - e.x;
          const dy = 50 - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 4) { // Reached Core
            room.coreHp = Math.max(0, room.coreHp - e.maxHp);
            room.history.push({ type: 'core_damage', amount: e.maxHp, id: Date.now() + Math.random() });
            room.enemies.splice(i, 1);

            // Shake UI for everybody
            if (room.history.length > 20) room.history.shift();
          } else {
            e.x += (dx / dist) * e.speed;
            e.y += (dy / dist) * e.speed;
          }
        }

        // Update Bullets
        for (let i = room.bullets.length - 1; i >= 0; i--) {
          const b = room.bullets[i];
          b.x += b.vx;
          b.y += b.vy;

          if (b.x < 0 || b.x > 100 || b.y < 0 || b.y > 100) {
            room.bullets.splice(i, 1);
            continue;
          }

          // Bullet -> Enemy Collision
          let hit = false;
          for (let j = room.enemies.length - 1; j >= 0; j--) {
            const e = room.enemies[j];
            const dx = e.x - b.x;
            const dy = e.y - b.y;
            if (dx * dx + dy * dy < 16) { // hit radius 4
              hit = true;
              e.hp -= 25; // Bullet dmg
              if (e.hp <= 0) {
                room.enemies.splice(j, 1);
                if (room.playersState[b.ownerId]) {
                  room.playersState[b.ownerId].gold += 10;
                  room.playersState[b.ownerId].kills++;
                }
              }
              break;
            }
          }
          if (hit) room.bullets.splice(i, 1);
        }

        // Update Turrets (Auto-fire lasers)
        for (const t of room.towers) {
          if (now > t.lastFire + 1000) { // Fire every 1 sec
            // Find closest enemy within 30 range
            let closest = null;
            let minDist = 30; // Range constraint

            for (const e of room.enemies) {
              const dx = e.x - t.x;
              const dy = e.y - t.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < minDist) {
                minDist = dist;
                closest = e;
              }
            }

            if (closest) {
              closest.hp -= 100; // Laser dmg
              t.lastFire = now;
              room.lasers.push({ startX: t.x, startY: t.y, endX: closest.x, endY: closest.y, id: Date.now() + Math.random() });

              if (closest.hp <= 0) {
                room.enemies = room.enemies.filter(en => en.id !== closest.id);
                if (room.playersState[t.ownerId]) {
                  room.playersState[t.ownerId].gold += 10;
                  room.playersState[t.ownerId].kills++;
                }
              }
            }
          }
        }

        // Check lose condition
        if (room.coreHp <= 0) {
          room.status = 'finished';
          room.winner = 'Enemies'; // AI wins
          clearInterval(room.timerInterval);
          io.to(roomCode).emit('winnerDeclared', { winnerName: 'THE HORDE', claimType: 'Core Destroyed', prize: 0 });
        }
        // Check win condition
        else if (room.timeLeft <= 0) {
          room.status = 'finished';
          clearInterval(room.timerInterval);

          // Find MVP
          let maxKills = -1;
          let mvp = null;
          for (const [pId, pState] of Object.entries(room.playersState)) {
            if (pState.kills > maxKills) { maxKills = pState.kills; mvp = pId; }
          }
          room.winner = mvp;
          if (mvp && DB.users[mvp]) {
            io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[mvp].name, claimType: 'Core Defense MVP', prize: 0 });
          } else {
            io.to(roomCode).emit('winnerDeclared', { winnerName: 'THE TEAM', claimType: 'Core Defense Victory', prize: 0 });
          }
        }

        broadcastRoomState(roomCode);
      }, 50); // 50ms tick
    } else if (room.gameType === 'cararena') {
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timeLeft = 90;

      room.timerInterval = setInterval(() => {
        if (!DB.rooms[roomCode] || DB.rooms[roomCode].status !== 'playing') {
          clearInterval(room.timerInterval);
          return;
        }

        room.tickInfo = (room.tickInfo || 0) + 1;
        if (room.tickInfo % 20 === 0) room.timeLeft -= 1;

        // Physics Updates
        const MAX_SPEED = 2.0;
        const ACCEL = 0.15;
        const FRICTION = 0.95; // 5% speed loss per tick
        const ROTATION_SPEED = 0.15; // Radians per tick

        // Process each player
        for (const [pId, pState] of Object.entries(room.playersState)) {
          if (!pState.isAlive) continue;

          // Turn
          if (pState.steer !== 0) {
            // Steering only works if moving (forward or backward)
            const moveSign = pState.velocity >= 0 ? 1 : -1;
            // Reduce turning radius if moving slowly, max turning if moving fast
            const turnEfficacy = Math.min(1, Math.abs(pState.velocity) / (MAX_SPEED * 0.5));
            pState.angle += pState.steer * ROTATION_SPEED * moveSign * turnEfficacy;
          }

          // Apply acceleration from input (positive is forward, negative is brake/reverse)
          // pState.accel comes from client
          if (pState.accel) {
            pState.velocity += pState.accel * ACCEL;
          }

          // Apply friction
          pState.velocity *= FRICTION;

          // Clamp velocity
          pState.velocity = Math.max(-MAX_SPEED * 0.5, Math.min(MAX_SPEED, pState.velocity));

          // Calculate movement vector based on angle (drift effect: velocity is fully applied in facing direction for arcade feel, 
          // but we could split it for real drift. We'll stick to arcade grip here for simplicity and fun)
          const dx = Math.cos(pState.angle) * pState.velocity;
          const dy = Math.sin(pState.angle) * pState.velocity;

          pState.x += dx;
          pState.y += dy;

          // Bounds checking (Bounce off walls)
          if (pState.x < 2 || pState.x > 98) {
            pState.velocity *= -0.5; // lose speed on wall crash
            pState.x = Math.max(2, Math.min(98, pState.x));
          }
          if (pState.y < 2 || pState.y > 98) {
            pState.velocity *= -0.5;
            pState.y = Math.max(2, Math.min(98, pState.y));
          }

          // Coin collision
          for (let i = room.coins.length - 1; i >= 0; i--) {
            const c = room.coins[i];
            const cdx = pState.x - c.x;
            const cdy = pState.y - c.y;
            if (cdx * cdx + cdy * cdy < 9) { // 3 radius
              // Collect coin
              pState.coins += 1;
              room.coins.splice(i, 1);
              // Spawn new coin
              room.coins.push({
                id: Date.now() + Math.random(),
                x: Math.random() * 90 + 5,
                y: Math.random() * 90 + 5
              });
            }
          }
        }

        // Car-to-Car Collisions
        const playerIds = Object.keys(room.playersState);
        for (let i = 0; i < playerIds.length; i++) {
          for (let j = i + 1; j < playerIds.length; j++) {
            const p1Id = playerIds[i];
            const p2Id = playerIds[j];
            const p1 = room.playersState[p1Id];
            const p2 = room.playersState[p2Id];

            if (!p1.isAlive || !p2.isAlive) continue;

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < 16) { // collision radius 4 (squared = 16)
              // Collision resolution - Elastic push
              const dist = Math.sqrt(distSq) || 1;
              const nx = dx / dist; // Normal vector
              const ny = dy / dist;

              // Separate cars to prevent sticking
              const overlap = 4 - dist;
              p1.x -= nx * overlap * 0.5;
              p1.y -= ny * overlap * 0.5;
              p2.x += nx * overlap * 0.5;
              p2.y += ny * overlap * 0.5;

              // Relative velocity magnitude check (who hit who?)
              // For arcade simplicity, compare absolute velocities
              const v1 = Math.abs(p1.velocity);
              const v2 = Math.abs(p2.velocity);

              // High-speed ram logic
              if (v1 > v2 + 0.5 && v1 > 1.0) {
                // P1 rammed P2
                const stolen = Math.floor(p2.coins * 0.2) + 1; // Steal 20% + 1
                if (p2.coins >= stolen) {
                  p2.coins -= stolen;
                  p1.coins += stolen;
                  room.history.push({ type: 'ram', rammer: p1Id, victim: p2Id, amount: stolen, id: Date.now() + Math.random() });
                  if (room.history.length > 10) room.history.shift();
                }
                p2.velocity = v1 * 1.5; // knockback speed
                p1.velocity *= 0.5; // Rammer loses speed
                p2.angle = Math.atan2(ny, nx); // push p2 away from p1
              } else if (v2 > v1 + 0.5 && v2 > 1.0) {
                // P2 rammed P1
                const stolen = Math.floor(p1.coins * 0.2) + 1;
                if (p1.coins >= stolen) {
                  p1.coins -= stolen;
                  p2.coins += stolen;
                  room.history.push({ type: 'ram', rammer: p2Id, victim: p1Id, amount: stolen, id: Date.now() + Math.random() });
                  if (room.history.length > 10) room.history.shift();
                }
                p1.velocity = v2 * 1.5;
                p2.velocity *= 0.5;
                p1.angle = Math.atan2(-ny, -nx);
              } else {
                // Equal crash, bounce both
                p1.velocity *= -0.8;
                p2.velocity *= -0.8;
              }
            }
          }
        }

        if (room.timeLeft <= 0) {
          room.status = 'finished';
          clearInterval(room.timerInterval);

          let maxCoins = -1;
          let mvp = null;
          for (const [pId, pState] of Object.entries(room.playersState)) {
            if (pState.coins > maxCoins) { maxCoins = pState.coins; mvp = pId; }
          }
          room.winner = mvp;
          if (mvp && DB.users[mvp]) {
            io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[mvp].name, claimType: 'Car Arena Winner', prize: 0 });
          }
        }

        broadcastRoomState(roomCode);
      }, 50); // 50ms tick
    }
    broadcastRoomState(roomCode);
  });

  // Tic Tac Toe Move
  socket.on('tictactoeMove', ({ roomCode, userId, index }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'tictactoe' || room.status === 'finished') return;
    if (room.turn !== userId) return; // not their turn
    if (room.board[index] !== null) return; // spot taken

    // Determine player symbol based on host status. Host is usually X.
    const symbol = room.hostId === userId ? 'X' : 'O';
    room.board[index] = symbol;

    // Check Win
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6]           // diagonals
    ];

    let isWin = false;
    for (const [a, b, c] of lines) {
      if (room.board[a] && room.board[a] === room.board[b] && room.board[a] === room.board[c]) {
        isWin = true;
        break;
      }
    }

    if (isWin) {
      room.status = 'finished';
      room.winner = userId;
      const user = DB.users[userId];

      // Simple transaction if they win simply for records (no wager yet)
      addTransaction(userId, 'credit', 0, `Won Tic Tac Toe in Room ${roomCode}`);

      io.to(roomCode).emit('winnerDeclared', { winnerName: user ? user.name : 'Player', claimType: 'TicTacToe Win', prize: 0 });
    } else if (!room.board.includes(null)) {
      room.status = 'finished';
      room.winner = 'draw';
      io.to(roomCode).emit('winnerDeclared', { winnerName: 'Nobody', claimType: 'Draw', prize: 0 });
    } else {
      // switch turn
      const opponent = room.players.find(p => p.id !== userId);
      if (opponent) room.turn = opponent.id;
    }

    broadcastRoomState(roomCode);
  });

  // SOS Move
  socket.on('sosMove', ({ roomCode, userId, index, letter }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'sos' || room.status === 'finished') return;
    if (room.turn !== userId) return;
    if (room.board[index] !== null) return;
    if (letter !== 'S' && letter !== 'O') return;

    room.board[index] = letter;

    // Check for SOS formed by this specific move (index)
    // Board is 16x16
    const row = Math.floor(index / 16);
    const col = index % 16;

    // Helper to get letter at r,c
    const getL = (r, c) => {
      if (r < 0 || r >= 16 || c < 0 || c >= 16) return null;
      return room.board[r * 16 + c];
    };

    let sosCount = 0;

    // Directions: [dRow, dCol] for 8 directions (half-directions since S-O-S symmetric)
    // Actually simpler to check patterns around the placed letter
    if (letter === 'S') {
      // Look for S [O] [S] in 8 directions (4 axes)
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (const [dr, dc] of dirs) {
        // Forward checking (+O, +S)
        if (getL(row + dr, col + dc) === 'O' && getL(row + dr * 2, col + dc * 2) === 'S') sosCount++;
        // Backward checking (-O, -S)
        if (getL(row - dr, col - dc) === 'O' && getL(row - dr * 2, col - dc * 2) === 'S') sosCount++;
      }
    } else if (letter === 'O') {
      // Look for [S] O [S] across the 4 axes
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      for (const [dr, dc] of dirs) {
        if (getL(row + dr, col + dc) === 'S' && getL(row - dr, col - dc) === 'S') sosCount++;
      }
    }

    if (sosCount > 0) {
      // Add points
      room.scores[userId] = (room.scores[userId] || 0) + sosCount;
      // Turn stays with current player
    } else {
      // switch turn
      const opponent = room.players.find(p => p.id !== userId);
      if (opponent) room.turn = opponent.id;
    }

    // Check if board full
    if (!room.board.includes(null)) {
      room.status = 'finished';
      const p1 = room.players[0]?.id;
      const p2 = room.players[1]?.id;
      const s1 = room.scores[p1] || 0;
      const s2 = room.scores[p2] || 0;

      if (s1 > s2) {
        room.winner = p1;
        io.to(roomCode).emit('winnerDeclared', { winnerName: room.players[0].name, claimType: 'SOS Win', prize: 0 });
      } else if (s2 > s1) {
        room.winner = p2;
        io.to(roomCode).emit('winnerDeclared', { winnerName: room.players[1].name, claimType: 'SOS Win', prize: 0 });
      } else {
        room.winner = 'draw';
        io.to(roomCode).emit('winnerDeclared', { winnerName: 'Nobody', claimType: 'Draw', prize: 0 });
      }
    }

    broadcastRoomState(roomCode);
  });

  // Snake & Ladders Move
  socket.on('rollDiceSL', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'snakesladders' || room.status === 'finished') return;
    if (room.turn !== userId) return;

    const dice = Math.floor(Math.random() * 6) + 1;
    room.dice = dice; // EXPLICITLY BROADCAST DICE STATE
    let pos = (room.positions[userId] || 0);
    let moveType = 'roll';

    if (pos + dice <= 100) {
      pos += dice;
      // check snakes/ladders
      if (room.snakes[pos]) {
        pos = room.snakes[pos];
        moveType = 'snake';
      } else if (room.ladders[pos]) {
        pos = room.ladders[pos];
        moveType = 'ladder';
      }
    }
    let killVictim = null;
    if (pos > 0 && pos < 100) {
      for (const [pId, pPos] of Object.entries(room.positions)) {
        if (pId !== userId && pPos === pos) {
          room.positions[pId] = 0; // Send back to start
          killVictim = pId;
          break; // Kill one opponent
        }
      }
    }

    room.positions[userId] = pos;

    room.history.push({ userId, dice, newPos: pos, type: moveType, victim: killVictim });
    if (room.history.length > 5) room.history.shift();

    if (pos === 100) {
      room.status = 'finished';
      room.winner = userId;
      io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[userId].name, claimType: 'Snake & Ladders Win', prize: 0 });
    } else {
      if (dice !== 6) {
        // cycle turn
        const idx = room.players.findIndex(p => p.id === userId);
        const nextIdx = (idx + 1) % room.players.length;
        room.turn = room.players[nextIdx].id;
      }
    }
    broadcastRoomState(roomCode);
  });

  // Ludo Move & Roll
  socket.on('rollDiceLudo', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'ludo' || room.status === 'finished') return;
    if (room.turn !== userId || room.diceRolled) return;

    const dice = Math.floor(Math.random() * 6) + 1;
    room.lastDice = dice;
    room.diceRolled = true;

    if (dice === 6) {
      room.sixStreak[userId] = (room.sixStreak[userId] || 0) + 1;
    } else {
      room.sixStreak[userId] = 0;
    }

    // 3 Sixes in a row = Lose turn
    if (room.sixStreak[userId] === 3) {
      room.sixStreak[userId] = 0;
      room.diceRolled = false;
      const idx = room.players.findIndex(p => p.id === userId);
      const nextIdx = (idx + 1) % room.players.length;
      room.turn = room.players[nextIdx].id;
      broadcastRoomState(roomCode);
      return;
    }

    room.history.push({ userId, type: 'roll', value: dice });
    if (room.history.length > 10) room.history.shift();

    // Check if player can move ANY token
    const tokens = room.tokens[userId];
    const userColor = room.colors[userId];
    const canMove = canMoveAnyToken(userId, userColor, dice, tokens);

    if (!canMove) {
      // pass turn
      room.diceRolled = false;
      const idx = room.players.findIndex(p => p.id === userId);
      const nextIdx = (idx + 1) % room.players.length;
      room.turn = room.players[nextIdx].id;
    }

    broadcastRoomState(roomCode);
  });

  socket.on('moveTokenLudo', ({ roomCode, userId, tokenIndex }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'ludo' || room.status === 'finished') return;
    if (room.turn !== userId || !room.diceRolled) return;

    const dice = room.lastDice;
    const userColor = room.colors[userId];

    const result = processLudoMove(userId, userColor, tokenIndex, dice, room);

    if (!result.success) return; // Invalid move

    room.diceRolled = false;

    if (result.capturedUser) {
      room.history.push({ userId, type: 'capture', victim: result.capturedUser });
    }

    // Check Win Condition (all 4 tokens are 999)
    if (result.hasWon) {
      room.status = 'finished';
      room.winner = userId;
      io.to(roomCode).emit('winnerDeclared', { winnerName: DB.users[userId].name, claimType: 'Ludo Win', prize: 0 });
    } else {
      // Pass turn if no extra turn
      if (!result.extraTurn) {
        const idx = room.players.findIndex(p => p.id === userId);
        const nextIdx = (idx + 1) % room.players.length;
        room.turn = room.players[nextIdx].id;
      }
    }

    room.diceRolled = false;
    broadcastRoomState(roomCode);
  });

  // Territory War Move
  socket.on('moveTerritory', ({ roomCode, userId, r, c }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'territorywar' || room.status !== 'playing') return;

    const myPos = room.positions[userId];
    if (!myPos) return;

    // Validate move (must be exactly 1 step orthogonally or diagonally, or just trust client for now within a 2 tile distance to prevent warping)
    const dR = Math.abs(r - myPos.r);
    const dC = Math.abs(c - myPos.c);

    if (r < 0 || r > 14 || c < 0 || c > 14) return;
    if (dR > 1 || dC > 1) return; // Too far

    const myColor = room.colors[userId];

    // Update position
    room.positions[userId] = { r, c };

    // Claim territory
    const prevOwner = room.grid[r][c];

    if (prevOwner !== userId) {
      room.grid[r][c] = userId;
      room.scores[userId] = (room.scores[userId] || 0) + 1;

      if (prevOwner && room.scores[prevOwner] > 0) {
        room.scores[prevOwner] -= 1;
        // Add a "steal" event to history for VFX triggers on frontend
        room.history.push({ type: 'steal', victim: prevOwner, thief: userId, r, c, id: Date.now() + Math.random() });
        if (room.history.length > 5) room.history.shift();
      }
    }

    broadcastRoomState(roomCode);
  });

  // Agar Game Move & Physics Update (Clients tell server where they want to go/are)
  socket.on('moveAgar', ({ roomCode, userId, x, y }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'agargame' || room.status !== 'playing') return;

    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    // Update position (naive trust, add speed limits in production)
    pState.x = x;
    pState.y = y;

    // 1. Check collisions with Food
    for (let i = room.food.length - 1; i >= 0; i--) {
      const f = room.food[i];
      // Simple circular distance check. Adjust scaling to match frontend view projection
      // Let's assume coords are 0-100 percentages.
      const dx = Math.abs(pState.x - f.x);
      const dy = Math.abs(pState.y - f.y);
      // Rough spherical collision. A radius of 2 is ~2% of screen.
      if (dx * dx + dy * dy < (pState.radius) * (pState.radius)) {
        // Eaten
        room.food.splice(i, 1);
        pState.radius += 0.2; // Grow slightly
        pState.score += 10;
        room.history.push({ type: 'eat_food', id: Date.now() + Math.random(), eventR: pState.radius });

        // Spawn replacement food
        room.food.push({
          id: Date.now() + Math.random(),
          x: Math.random() * 100,
          y: Math.random() * 100,
          color: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7', '#F97316'][Math.floor(Math.random() * 6)]
        });
      }
    }

    // 2. Check collisions with other Players
    for (const [otherId, otherState] of Object.entries(room.playersState)) {
      if (otherId === userId || !otherState.isAlive) continue;

      const dx = pState.x - otherState.x;
      const dy = pState.y - otherState.y;
      const distSq = dx * dx + dy * dy;

      // If overlapping
      if (distSq < (pState.radius) * (pState.radius)) {
        // The larger one eats the smaller one (must be at least 15% larger)
        if (pState.radius > otherState.radius * 1.15) {
          // I ate them
          otherState.isAlive = false;
          pState.radius += otherState.radius * 0.5; // Absorb 50% mass
          pState.score += Math.floor(otherState.score / 2) + 50;
          room.history.push({ type: 'eat_player', predator: userId, prey: otherId, id: Date.now() + Math.random() });

          // Setup respawn
          setTimeout(() => {
            if (DB.rooms[roomCode] && DB.rooms[roomCode].status === 'playing') {
              DB.rooms[roomCode].playersState[otherId] = {
                x: Math.random() * 90 + 5,
                y: Math.random() * 90 + 5,
                radius: 2,
                score: Math.max(0, otherState.score - 50),
                isAlive: true
              };
              broadcastRoomState(roomCode);
            }
          }, 3000);
        }
      }
    }

    // Keep history short
    if (room.history.length > 10) room.history.shift();
  });

  socket.on('moveBR', ({ roomCode, userId, x, y, angle }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'battleroyale' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    pState.x = x;
    pState.y = y;
    if (angle !== undefined) pState.angle = angle;

    for (let i = room.loot.length - 1; i >= 0; i--) {
      const l = room.loot[i];
      const dx = pState.x - l.x;
      const dy = pState.y - l.y;
      if (dx * dx + dy * dy < 4) { // pickup radius
        if (l.type === 'health') pState.hp = Math.min(100, pState.hp + 25);
        if (l.type === 'shield') pState.shield = true;
        if (l.type === 'speed') pState.speed = 1.6;
        if (l.type === 'gun') pState.weapon = 'gun';
        room.history.push({ type: 'pickup', item: l.type, player: userId, id: Date.now() + Math.random() });
        room.loot.splice(i, 1);
      }
    }
    if (room.history.length > 10) room.history.shift();
  });

  socket.on('shootBR', ({ roomCode, userId, angle }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'battleroyale' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive || pState.weapon !== 'gun') return;

    const speed = 2.0;
    room.bullets.push({
      x: pState.x, y: pState.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      ownerId: userId, id: Date.now() + Math.random()
    });
  });

  // Bomber Grid Moves
  socket.on('moveBomber', ({ roomCode, userId, x, y }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'bombergrid' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    // Basic bounds
    pState.x = Math.max(0, Math.min(14, x));
    pState.y = Math.max(0, Math.min(14, y));

    // Pickup powerups
    const cx = Math.round(pState.x);
    const cy = Math.round(pState.y);
    for (let i = room.powerups.length - 1; i >= 0; i--) {
      const pu = room.powerups[i];
      if (pu.x === cx && pu.y === cy) {
        if (pu.type === 'bomb') pState.maxBombs++;
        if (pu.type === 'fire') pState.blastRadius++;
        if (pu.type === 'speed') pState.speed = Math.min(1.5, pState.speed + 0.1);
        room.powerups.splice(i, 1);
        room.history.push({ type: 'pickup', item: pu.type, player: userId, id: Date.now() + Math.random() });
      }
    }

    // Keep history short
    if (room.history.length > 20) room.history.shift();
  });

  socket.on('placeBomb', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'bombergrid' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    if (pState.currentBombs < pState.maxBombs) {
      const cx = Math.round(pState.x);
      const cy = Math.round(pState.y);

      // Check if bomb already there
      if (!room.bombs.find(b => b.x === cx && b.y === cy)) {
        pState.currentBombs++;
        room.bombs.push({
          x: cx, y: cy,
          ownerId: userId,
          radius: pState.blastRadius,
          explodeTime: Date.now() + 2500, // 2.5s fuse
          id: Date.now() + Math.random()
        });
        room.history.push({ type: 'place_bomb', player: userId, x: cx, y: cy, id: Date.now() + Math.random() });
      }
    }
    if (room.history.length > 20) room.history.shift();
  });

  // Core Defense Actions
  socket.on('moveTD', ({ roomCode, userId, x, y }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'coredefense' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    pState.x = Math.max(0, Math.min(100, x));
    pState.y = Math.max(0, Math.min(100, y));
  });

  socket.on('shootTD', ({ roomCode, userId, angle }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'coredefense' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    const speed = 3.0;
    room.bullets.push({
      x: pState.x, y: pState.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      ownerId: userId, id: Date.now() + Math.random()
    });
  });

  socket.on('buildTower', ({ roomCode, userId }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'coredefense' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    if (pState.gold >= 50) {
      pState.gold -= 50;
      room.towers.push({
        x: pState.x, y: pState.y,
        ownerId: userId,
        lastFire: 0,
        id: Date.now() + Math.random()
      });
      room.history.push({ type: 'build_tower', player: userId, id: Date.now() + Math.random() });
      if (room.history.length > 20) room.history.shift();
    }
  });

  // Car Arena Inputs
  socket.on('carInput', ({ roomCode, userId, accel, steer }) => {
    const room = DB.rooms[roomCode];
    if (!room || room.gameType !== 'cararena' || room.status !== 'playing') return;
    const pState = room.playersState[userId];
    if (!pState || !pState.isAlive) return;

    if (accel !== undefined) pState.accel = accel;
    if (steer !== undefined) pState.steer = steer;
  });

  // --- WEBRTC & EMOJI SIGNALING ---

  socket.on('webrtcOffer', ({ offer, targetId, callerId }) => {
    const targetUser = DB.users[targetId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit('webrtcOffer', { offer, callerId });
    }
  });

  socket.on('webrtcAnswer', ({ answer, targetId }) => {
    const targetUser = DB.users[targetId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit('webrtcAnswer', { answer });
    }
  });

  socket.on('webrtcIceCandidate', ({ candidate, targetId }) => {
    const targetUser = DB.users[targetId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit('webrtcIceCandidate', { candidate });
    }
  });

  socket.on('webrtcInit', ({ roomCode, userId }) => {
    // When a user initializes their mic, notify the room they are ready for offers
    io.to(roomCode).emit('webrtcReady', { userId });
  });

  socket.on('sendEmoji', ({ roomCode, userId, emoji }) => {
    io.to(roomCode).emit('receiveEmoji', { userId, emoji, id: Date.now() + Math.random() });
  });

  // Chat Message
  socket.on('sendChatMessage', ({ roomCode, userId, message }) => {
    const user = DB.users[userId];
    if (!user) return;
    io.to(roomCode).emit('chatMessage', {
      id: Date.now() + Math.random(),
      senderId: userId,
      senderName: user.name,
      message,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`HOUSEEE Server running on port ${PORT}`);
});
