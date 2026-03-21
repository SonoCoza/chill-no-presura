require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const marketRoutes = require('./routes/markets');
const betRoutes = require('./routes/bets');
const commentRoutes = require('./routes/comments');
const adminRoutes = require('./routes/admin');
const notificationRoutes = require('./routes/notifications');

const prisma = new PrismaClient();
const app = express();
const httpServer = http.createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
    ].filter(Boolean),
    credentials: true,
  },
});

// Socket.IO auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.userId = decoded.id;
    socket.data.username = decoded.username;
    socket.data.isAdmin = decoded.isAdmin;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

// Online presence tracking — Map<userId, Set<socketId>>
const onlineUsers = new Map();

io.on('connection', (socket) => {
  const userId = socket.data.userId;
  socket.join(`user:${userId}`);
  socket.join('global');

  // Admin room for live admin updates
  if (socket.data.isAdmin) {
    socket.join('admin-room');
  }

  // Track online presence
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);

  // Notify everyone this user is online
  io.to('global').emit('presence:online', { userId });

  // Send current online list to the newly connected socket
  socket.emit('presence:list', { onlineUserIds: [...onlineUsers.keys()] });

  socket.on('join:market', (marketId) => {
    socket.join(`market:${marketId}`);
  });

  socket.on('leave:market', (marketId) => {
    socket.leave(`market:${marketId}`);
  });

  socket.on('disconnect', () => {
    const userSockets = onlineUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
        io.to('global').emit('presence:offline', { userId });
      }
    }
  });
});

// Make io accessible from routes
app.set('io', io);

// CORS — allow multiple origins for localhost dev + production
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow Postman/curl
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

app.use(express.json());

// Attach io and onlineUsers to every request
app.use((req, res, next) => {
  req.io = io;
  req.onlineUsers = onlineUsers;
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/bets', betRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Public stats (no auth)
app.get('/api/stats', async (req, res) => {
  try {
    const [resolvedMarkets, activeUsers, totalBets] = await Promise.all([
      prisma.market.count({ where: { status: 'RESOLVED' } }),
      prisma.user.count({ where: { isSuspended: false } }),
      prisma.betEntry.count(),
    ]);
    const poolResult = await prisma.marketOption.aggregate({ _sum: { totalStaked: true } });
    const totalPool = poolResult._sum.totalStaked || 0;
    res.json({ resolvedMarkets, activeUsers, totalPool, totalBets });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

// Cron job: close expired markets every minute
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const expiredMarkets = await prisma.market.findMany({
      where: { status: 'OPEN', closeAt: { lt: now } },
      select: { id: true },
    });
    if (expiredMarkets.length > 0) {
      await prisma.market.updateMany({
        where: { status: 'OPEN', closeAt: { lt: now } },
        data: { status: 'CLOSED' },
      });
      for (const m of expiredMarkets) {
        io.to('global').emit('market:closed', { marketId: m.id });
      }
      console.log(`[CRON] Auto-closed ${expiredMarkets.length} market(s)`);
    }
  } catch (err) {
    console.error('[CRON] Error closing markets:', err);
  }
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
