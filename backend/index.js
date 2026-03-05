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
      defaultRoomData.timeLeft = 60;
      defaultRoomData.status = 'playing';
      defaultRoomData.winner = null;
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
