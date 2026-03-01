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
  socket.on('createRoom', ({ userId, userFallback }) => {
    let user = DB.users[userId];
    if (!user && userFallback) {
      user = userFallback;
      DB.users[userId] = { ...userFallback, socketId: socket.id };
    }
    if (!user) return;

    const code = generateRoomCode();
    DB.rooms[code] = {
      code,
      hostId: userId,
      players: [user],
      drawnNumbers: [],
      tickets: {},
      prizePool: 0,
      status: 'waiting',
      isPaused: true,
      intervalId: null,
      drawSpeed: 4000,
      winners: { jaldi5: null, rowTop: null, rowMid: null, rowBot: null, fullHouse: null, fourCorners: null, pyramid: null }
    };

    socket.join(code);
    socket.emit('roomCreated', code);
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
    socket.emit('joinedRoom', roomCode);
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

  socket.on('buyTicket', ({ userId, roomCode }) => {
    let user = DB.users[userId];
    let room = DB.rooms[roomCode];
    if (!user || !room) return;

    if (user.walletBalance >= 2 && !room.tickets[userId]) {
      user.walletBalance -= 2;
      room.prizePool += 2;

      const pIndex = room.players.findIndex(p => p.id === userId);
      if (pIndex > -1) room.players[pIndex].walletBalance = user.walletBalance;

      // Support multiple tickets logic
      if (!room.tickets[userId]) {
        room.tickets[userId] = [];
      }

      if (room.tickets[userId].length >= 3) {
        return socket.emit('errorMsg', 'Maximum 3 tickets allowed per game.');
      }

      const newTicket = generateTicket();
      room.tickets[userId].push(newTicket);

      addTransaction(userId, 'debit', 2, `Bought Ticket for Room ${roomCode}`);

      socket.emit('walletUpdate', user.walletBalance);
      socket.emit('ticketUpdate', room.tickets[userId]); // send array of tickets back

      broadcastRoomState(roomCode);
    } else if (room.tickets[userId] && room.tickets[userId].length >= 3) {
      socket.emit('errorMsg', 'You have reached the maximum of 3 tickets!');
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
      const award = claimType === 'fullHouse' ? room.prizePool : 0;

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
              addTransaction(member.id, 'credit', sharedAward, `Clan Share (${user.clan}): Full House in Room ${roomCode}`);
              const pIndex = room.players.findIndex(p => p.id === member.id);
              if (pIndex > -1) room.players[pIndex].walletBalance = mUser.walletBalance;
              // Update specific sockets in real-time
              if (mUser.socketId) io.to(mUser.socketId).emit('walletUpdate', mUser.walletBalance);
            }
          });
        } else {
          user.walletBalance += award;
          if (award > 0) addTransaction(userId, 'credit', award, `Won Full House in Room ${roomCode}`);
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
