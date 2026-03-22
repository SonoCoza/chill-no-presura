const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate, requireAdmin);

function generateTempPassword() {
  return crypto.randomBytes(4).toString('hex');
}

// --- Dashboard ---
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      openMarkets,
      closedMarkets,
      totalBets,
      betsToday,
      allBets,
      topMarket,
      topUser,
      totalWonToday,
    ] = await Promise.all([
      prisma.user.count({ where: { isAdmin: false } }),
      prisma.market.count({ where: { status: 'OPEN' } }),
      prisma.market.count({ where: { status: 'CLOSED' } }),
      prisma.betEntry.count(),
      prisma.betEntry.count({ where: { placedAt: { gte: todayStart } } }),
      prisma.betEntry.findMany({ select: { amount: true, placedAt: true } }),
      prisma.market.findFirst({
        orderBy: { entries: { _count: 'desc' } },
        select: { id: true, title: true, _count: { select: { entries: true } } },
      }),
      prisma.user.findFirst({
        where: { isAdmin: false },
        orderBy: { bets: { _count: 'desc' } },
        select: { id: true, username: true, displayName: true, _count: { select: { bets: true } } },
      }),
      prisma.transaction.aggregate({
        where: { type: 'WIN', createdAt: { gte: todayStart } },
        _sum: { amount: true },
      }),
    ]);

    const totalVolume = allBets.reduce((sum, b) => sum + b.amount, 0);

    // Daily volume last 30 days
    const dailyVolume = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      dailyVolume[key] = 0;
    }
    for (const bet of allBets) {
      const key = new Date(bet.placedAt).toISOString().split('T')[0];
      if (dailyVolume[key] !== undefined) dailyVolume[key] += bet.amount;
    }
    const volumeChart = Object.entries(dailyVolume)
      .map(([date, volume]) => ({ date, volume: Math.round(volume * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Bets per day last 14 days
    const dailyBets = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dailyBets[d.toISOString().split('T')[0]] = 0;
    }
    for (const bet of allBets) {
      const key = new Date(bet.placedAt).toISOString().split('T')[0];
      if (dailyBets[key] !== undefined) dailyBets[key]++;
    }
    const betsChart = Object.entries(dailyBets)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Online count
    const onlineCount = req.onlineUsers ? req.onlineUsers.size : 0;

    // Recent activity
    const recentLogs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });

    res.json({
      stats: {
        totalUsers,
        onlineCount,
        openMarkets,
        closedMarkets,
        totalBets,
        betsToday,
        totalVolume,
        totalWonToday: totalWonToday._sum.amount || 0,
      },
      topMarket,
      topUser,
      volumeChart,
      betsChart,
      recentLogs,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- Config ---
router.get('/config', async (req, res) => {
  try {
    const configs = await prisma.config.findMany();
    const result = {};
    configs.forEach(c => { result[c.key] = c.value; });
    res.json(result);
  } catch (err) {
    console.error('Get config error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    for (const [key, value] of Object.entries(updates)) {
      await prisma.config.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    const configs = await prisma.config.findMany();
    const result = {};
    configs.forEach(c => { result[c.key] = c.value; });
    res.json(result);
  } catch (err) {
    console.error('Update config error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- Users (ALL users including admins) ---
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: {},
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, username: true, displayName: true, avatarUrl: true,
        isAdmin: true, isSuspended: true, balance: true, mustChangePass: true,
        lastSetPassword: true, tempPassword: true, createdAt: true,
        _count: { select: { bets: true } },
      },
    });
    res.json(users);
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Get single user detail (admin only)
router.get('/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        id: true, username: true, displayName: true, avatarUrl: true,
        balance: true, isAdmin: true, isSuspended: true, mustChangePass: true,
        tempPassword: true, lastSetPassword: true, createdAt: true,
        _count: { select: { bets: true, comments: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    res.json(user);
  } catch (err) {
    console.error('Admin get user detail error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Get user bets (admin)
router.get('/users/:id/bets', async (req, res) => {
  try {
    const bets = await prisma.betEntry.findMany({
      where: { userId: parseInt(req.params.id) },
      orderBy: { placedAt: 'desc' },
      take: 50,
      include: {
        market: { select: { id: true, title: true, status: true } },
        option: { select: { id: true, label: true } },
      },
    });
    res.json(bets);
  } catch (err) {
    console.error('Admin get user bets error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Get user transactions (admin)
router.get('/users/:id/transactions', async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: parseInt(req.params.id) },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(transactions);
  } catch (err) {
    console.error('Admin get user transactions error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Delete user (admin)
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return res.status(404).json({ error: 'Utente non trovato' });

    // Proteggi l'account admin principale
    if (targetUser.username === 'admin' && req.user.username !== 'admin') {
      return res.status(403).json({ error: "Solo l'account admin principale può eliminare questo utente" });
    }

    // 1. Trova tutti i market creati dall'utente
    const userMarkets = await prisma.market.findMany({
      where: { createdBy: userId },
      select: { id: true },
    });
    const marketIds = userMarkets.map(m => m.id);

    // 2. Per ogni market: rimborsa bet pending di altri utenti, poi elimina tutto
    if (marketIds.length > 0) {
      const pendingBets = await prisma.betEntry.findMany({
        where: { marketId: { in: marketIds }, status: 'PENDING' },
      });
      for (const bet of pendingBets) {
        if (bet.userId !== userId) {
          const betUser = await prisma.user.findUnique({
            where: { id: bet.userId },
            select: { isAdmin: true },
          });
          if (!betUser?.isAdmin) {
            await prisma.user.update({
              where: { id: bet.userId },
              data: { balance: { increment: bet.amount } },
            });
            await prisma.transaction.create({
              data: {
                userId: bet.userId,
                type: 'REFUND',
                amount: bet.amount,
                description: 'Rimborso: account eliminato',
              },
            });
          }
        }
      }

      // Elimina tutto collegato ai market dell'utente
      await prisma.betEntry.deleteMany({ where: { marketId: { in: marketIds } } });
      await prisma.comment.deleteMany({ where: { marketId: { in: marketIds } } });
      await prisma.marketOption.deleteMany({ where: { marketId: { in: marketIds } } });
      await prisma.market.deleteMany({ where: { id: { in: marketIds } } });
    }

    // 3. Elimina tutto collegato all'utente
    await prisma.notificationRecipient.deleteMany({ where: { userId } });
    await prisma.activityLog.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.betEntry.deleteMany({ where: { userId } });
    await prisma.comment.deleteMany({ where: { userId } });

    // Roulette data if tables exist
    try {
      await prisma.rouletteBet.deleteMany({ where: { userId } });
      await prisma.rouletteComment.deleteMany({ where: { userId } });
    } catch { /* tables may not exist yet */ }

    // 4. Finalmente elimina l'utente
    await prisma.user.delete({ where: { id: userId } });

    // 5. Log
    try {
      await prisma.activityLog.create({
        data: {
          userId: req.user.id,
          action: 'USER_DELETED',
          metadata: JSON.stringify({ deletedUserId: userId, username: targetUser.username }),
        },
      });
    } catch { /* non bloccare se il log fallisce */ }

    res.json({ success: true, message: 'Utente eliminato' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Errore interno del server', detail: err.message });
  }
});

router.post('/users', [
  body('username').trim().isLength({ min: 3 }).withMessage('Username minimo 3 caratteri'),
  body('displayName').trim().notEmpty().withMessage('Display name richiesto'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, displayName, isAdmin, balance } = req.body;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) return res.status(400).json({ error: 'Username già in uso' });

    // Get initial balance from config
    let initialBalance = balance;
    if (initialBalance === undefined || initialBalance === null) {
      const configBalance = await prisma.config.findUnique({ where: { key: 'initial_balance' } });
      initialBalance = configBalance ? parseFloat(configBalance.value) : 0;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        username, displayName, passwordHash, tempPassword,
        lastSetPassword: tempPassword,
        mustChangePass: true, isAdmin: isAdmin || false,
        balance: initialBalance,
      },
      select: {
        id: true, username: true, displayName: true, isAdmin: true,
        balance: true, mustChangePass: true, createdAt: true,
      },
    });

    if (initialBalance > 0) {
      await prisma.transaction.create({
        data: { userId: user.id, type: 'DEPOSIT', amount: initialBalance, description: 'Saldo iniziale' },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: req.user.id, action: 'USER_CREATED',
        metadata: JSON.stringify({ createdUserId: user.id, username: user.username }),
      },
    });

    res.status(201).json({ ...user, tempPassword });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { displayName, isAdmin, balance, resetPassword } = req.body;

    // Proteggi l'account admin principale
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (targetUser && targetUser.username === 'admin' && req.user.username !== 'admin') {
      return res.status(403).json({
        error: 'Solo l\'account admin principale può modificare questo utente'
      });
    }

    const data = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (isAdmin !== undefined) data.isAdmin = isAdmin;
    if (balance !== undefined) data.balance = balance;

    let tempPassword = null;
    if (resetPassword) {
      tempPassword = generateTempPassword();
      data.passwordHash = await bcrypt.hash(tempPassword, 12);
      data.tempPassword = tempPassword;
      data.lastSetPassword = tempPassword;
      data.mustChangePass = true;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, username: true, displayName: true, isAdmin: true,
        balance: true, mustChangePass: true, createdAt: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user.id, action: 'USER_UPDATED',
        metadata: JSON.stringify({ targetUserId: userId, changes: Object.keys(data) }),
      },
    });

    res.json({ ...user, tempPassword });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Suspend/unsuspend user
router.put('/users/:id/suspend', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Proteggi l'account admin principale
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (targetUser && targetUser.username === 'admin' && req.user.username !== 'admin') {
      return res.status(403).json({
        error: 'Solo l\'account admin principale può modificare questo utente'
      });
    }

    const { isSuspended } = req.body;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isSuspended },
      select: { id: true, username: true, isSuspended: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: isSuspended ? 'USER_SUSPENDED' : 'USER_UNSUSPENDED',
        metadata: JSON.stringify({ targetUserId: userId }),
      },
    });

    res.json(user);
  } catch (err) {
    console.error('Suspend user error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.get('/users/:id/logs', async (req, res) => {
  try {
    const logs = await prisma.activityLog.findMany({
      where: { userId: parseInt(req.params.id) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (err) {
    console.error('Admin get user logs error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.post('/users/:id/balance', [
  body('amount').isFloat().withMessage('Importo richiesto'),
  body('description').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const userId = parseInt(req.params.id);
    const { amount, description } = req.body;
    const delta = parseFloat(amount);
    if (isNaN(delta)) return res.status(400).json({ error: 'Importo non valido' });

    // Use $transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: delta } },
        select: { id: true, balance: true, username: true },
      });

      await tx.transaction.create({
        data: {
          userId, type: 'ADMIN_ADJUST', amount: delta,
          description: description || `Aggiustamento admin: ${delta >= 0 ? '+' : ''}${delta}`,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: req.user.id, action: 'BALANCE_ADJUSTED',
          metadata: JSON.stringify({ targetUserId: userId, delta, newBalance: updatedUser.balance, by: req.user.id }),
        },
      });

      return updatedUser;
    });

    // Emit AFTER transaction is committed — result.balance is the real DB value
    const io = req.io || req.app.get('io');
    if (io) {
      io.to(`user:${result.id}`).emit('balance:updated', {
        newBalance: result.balance, delta, type: 'ADMIN_ADJUST',
        description: description || 'Aggiustamento admin',
      });
      // Notify admin panel of balance change
      io.to('admin-room').emit('admin:balance_updated', {
        userId, newBalance: result.balance, delta, type: 'ADMIN_ADJUST',
        username: result.username,
      });
    }

    res.json({ balance: result.balance, newBalance: result.balance });
  } catch (err) {
    console.error('Admin adjust balance error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- Odds Override ---
router.put('/markets/:id/odds', async (req, res) => {
  try {
    const marketId = parseInt(req.params.id);
    const { odds } = req.body;

    if (!Array.isArray(odds)) return res.status(400).json({ error: 'Array di quote richiesto' });

    for (const item of odds) {
      const oddsFloat = parseFloat(item.odds);
      if (isNaN(oddsFloat) || oddsFloat < 1.01) {
        return res.status(400).json({ error: `Quota non valida per opzione ${item.optionId} (minimo 1.01)` });
      }
      await prisma.marketOption.update({ where: { id: parseInt(item.optionId) }, data: { odds: oddsFloat } });
    }

    await prisma.activityLog.create({
      data: {
        userId: req.user.id, action: 'ODDS_OVERRIDE',
        metadata: JSON.stringify({ marketId, odds }),
      },
    });

    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: { options: true },
    });

    // Socket emission
    const io = req.app.get('io');
    if (io) {
      io.to('global').emit('market:odds_updated', {
        marketId,
        options: market.options.map(o => ({ id: o.id, odds: o.odds, totalStaked: o.totalStaked })),
      });
    }

    res.json(market);
  } catch (err) {
    console.error('Admin override odds error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- Transactions ---
router.get('/transactions', async (req, res) => {
  try {
    const { userId, type, page = 1, limit = 50 } = req.query;
    const where = {};
    if (userId) where.userId = parseInt(userId);
    if (type) where.type = type;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where, orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit), take: parseInt(limit),
        include: { user: { select: { id: true, username: true, displayName: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Admin get transactions error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- Activity Logs ---
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit), take: parseInt(limit),
        include: { user: { select: { id: true, username: true, displayName: true } } },
      }),
      prisma.activityLog.count(),
    ]);

    res.json({ logs, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Admin get logs error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- Batch fetch users by IDs ---
router.post('/users/batch', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array richiesto' });
    const users = await prisma.user.findMany({
      where: { id: { in: ids.map(Number) } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
    res.json(users);
  } catch (err) {
    console.error('Batch users error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// --- Notifications ---
router.post('/notifications', upload.single('image'), async (req, res) => {
  try {
    const {
      type,
      title,
      message,
      autoClose,
      autoCloseSec,
      targetAll,
    } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({ error: 'Il messaggio è obbligatorio' });
    }

    // Image handling
    let imageUrl = null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file, 'chill-no-presura/notifications');
    } else if (req.body.imageUrl?.trim()) {
      imageUrl = req.body.imageUrl.trim();
    }

    // Determine recipients
    let recipientIds = [];
    const isTargetAll = targetAll === true || targetAll === 'true';

    if (isTargetAll) {
      const users = await prisma.user.findMany({
        where: { isAdmin: false },
        select: { id: true },
      });
      recipientIds = users.map(u => u.id);
    } else {
      // Parse targetUserIds from form data
      const rawIds = req.body['targetUserIds[]'] || req.body.targetUserIds || [];
      recipientIds = (Array.isArray(rawIds) ? rawIds : [rawIds]).map(Number).filter(n => !isNaN(n));
    }

    if (recipientIds.length === 0) {
      return res.status(400).json({ error: 'Nessun destinatario selezionato' });
    }

    const isAutoClose = autoClose === true || autoClose === 'true';

    // Create notification + recipients in transaction
    const notification = await prisma.$transaction(async (tx) => {
      const notif = await tx.notification.create({
        data: {
          type: type || 'BANNER',
          title: title?.trim() || null,
          message: message.trim(),
          imageUrl,
          autoClose: isAutoClose,
          autoCloseSec: isAutoClose ? (parseInt(autoCloseSec) || 5) : null,
          sentBy: req.user.id,
          targetAll: isTargetAll,
          recipients: {
            create: recipientIds.map(userId => ({ userId })),
          },
        },
        include: { recipients: true },
      });
      return notif;
    });

    // Emit via WebSocket to each recipient
    const io = req.io || req.app.get('io');
    if (io) {
      const payload = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        imageUrl: notification.imageUrl,
        autoClose: notification.autoClose,
        autoCloseSec: notification.autoCloseSec,
      };

      recipientIds.forEach(userId => {
        io.to(`user:${userId}`).emit('notification:new', payload);
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'NOTIFICATION_SENT',
        metadata: JSON.stringify({
          notificationId: notification.id,
          type: notification.type,
          recipientCount: recipientIds.length,
          targetAll: isTargetAll,
        }),
      },
    });

    res.json({ success: true, notification, recipientCount: recipientIds.length });
  } catch (err) {
    console.error('Send notification error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
