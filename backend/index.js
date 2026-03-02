const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const { generateTicket, checkJaldi5, checkRow, checkFullHouse, checkFourCorners } = require('./utils/tambola');

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
    room.drawnNumbers = [];
    room.tickets = {};
    room.prizePool = 0;
    room.totalCollected = 0;
    room.winners = { jaldi5: null, rowTop: null, rowMid: null, rowBot: null, fullHouse: null, fourCorners: null, pyramid: null };
    if (room.intervalId) clearInterval(room.intervalId);
    room.intervalId = null;

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
      if (['jaldi5', 'rowTop', 'rowMid', 'rowBot'].includes(claimType)) {
        awardPercentage = 0.10;
      } else if (claimType === 'fullHouse') {
        awardPercentage = 0.50;
      }
      const award = (room.totalCollected || room.prizePool) * awardPercentage;
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

  // --- WEBRTC & EMOJI SIGNALING ---

  socket.on('webrtcOffer', ({ roomCode, offer, targetId, callerId }) => {
    const targetUser = DB.users[targetId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit('webrtcOffer', { offer, callerId });
    }
  });

  socket.on('webrtcAnswer', ({ roomCode, answer, targetId }) => {
    const targetUser = DB.users[targetId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit('webrtcAnswer', { answer });
    }
  });

  socket.on('webrtcIceCandidate', ({ roomCode, candidate, targetId }) => {
    const targetUser = DB.users[targetId];
    if (targetUser && targetUser.socketId) {
      io.to(targetUser.socketId).emit('webrtcIceCandidate', { candidate });
    }
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
