const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../middleware/upload');
const { recalculateOdds } = require('../utils/odds');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;

    const markets = await prisma.market.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        options: true,
        entries: { select: { id: true } },
        comments: { select: { id: true } },
        creatorUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    const marketsWithStats = markets.map(m => ({
      ...m,
      totalPool: m.options.reduce((sum, o) => sum + o.totalStaked, 0),
      totalBets: m.entries.length,
      totalComments: m.comments.length,
    }));

    res.json(marketsWithStats);
  } catch (err) {
    console.error('Get markets error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const market = await prisma.market.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        options: {
          include: {
            entries: { select: { id: true, amount: true } },
          },
        },
        entries: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isAdmin: true } },
            option: { select: { id: true, label: true } },
          },
          orderBy: { placedAt: 'desc' },
        },
        comments: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        creatorUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    if (!market) return res.status(404).json({ error: 'Market non trovato' });

    const totalPool = market.options.reduce((sum, o) => sum + o.totalStaked, 0);

    // canEdit: admin always, creator within 10 minutes
    const minutesSinceCreation = (Date.now() - new Date(market.createdAt).getTime()) / 60000;
    const canEdit = req.user
      ? (req.user.isAdmin || (market.createdBy === req.user.id && minutesSinceCreation <= 10))
      : false;
    const timeLeftToEdit = (market.createdBy === req.user?.id && !req.user?.isAdmin)
      ? Math.max(0, 10 - minutesSinceCreation)
      : null;

    // User's own bets on this market
    const myBets = req.user
      ? market.entries.filter(e => e.user?.id === req.user.id)
      : [];

    res.json({ ...market, totalPool, canEdit, timeLeftToEdit, myBets });
  } catch (err) {
    console.error('Get market error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Can-edit check endpoint
router.get('/:id/can-edit', authenticate, async (req, res) => {
  try {
    const market = await prisma.market.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { createdBy: true, createdAt: true },
    });

    if (!market) return res.status(404).json({ error: 'Non trovato' });

    const isAdmin = req.user.isAdmin;
    const isCreator = market.createdBy === req.user.id;
    const msElapsed = Date.now() - new Date(market.createdAt).getTime();
    const msRemaining = Math.max(0, 10 * 60 * 1000 - msElapsed);
    const secondsRemaining = Math.floor(msRemaining / 1000);

    res.json({
      canEdit: isAdmin || (isCreator && secondsRemaining > 0),
      isAdmin,
      isCreator,
      secondsRemaining,
      reason: isAdmin
        ? 'admin'
        : isCreator && secondsRemaining > 0
          ? 'creator_within_window'
          : isCreator
            ? 'creator_expired'
            : 'not_authorized',
    });
  } catch (err) {
    console.error('Can-edit check error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Any authenticated user can create a market — multer BEFORE validation
router.post('/', authenticate, upload.single('image'), async (req, res) => {
  try {
    // Parse options: arrive as JSON string in multipart
    let options = [];
    if (req.body.options) {
      try {
        options = typeof req.body.options === 'string'
          ? JSON.parse(req.body.options)
          : req.body.options;
      } catch {
        return res.status(400).json({ error: 'Formato opzioni non valido' });
      }
    }

    if (!req.body.title || !req.body.title.trim()) {
      return res.status(400).json({ error: 'Titolo richiesto' });
    }

    if (!Array.isArray(options) || options.filter(o => o.label?.trim()).length < 2) {
      return res.status(400).json({ error: 'Servono almeno 2 opzioni' });
    }
    if (options.length > 8) {
      return res.status(400).json({ error: 'Massimo 8 opzioni' });
    }

    // Idempotency: prevent duplicate markets within 5 seconds
    const recentDuplicate = await prisma.market.findFirst({
      where: {
        createdBy: req.user.id,
        title: req.body.title.trim(),
        createdAt: { gte: new Date(Date.now() - 5000) },
      },
    });
    if (recentDuplicate) {
      return res.status(409).json({
        error: 'Pronostico già creato. Attendi qualche secondo.',
        marketId: recentDuplicate.id,
      });
    }

    // Banner: file uploaded has priority over URL
    let imageUrl = req.body.imageUrl || null;
    if (req.file) {
      imageUrl = await uploadToCloudinary(req.file, 'chill-no-presura/markets');
    }

    // closeAt: flexible validation
    let closeAt = null;
    if (req.body.closeAt) {
      closeAt = new Date(req.body.closeAt);
      if (isNaN(closeAt.getTime())) {
        return res.status(400).json({ error: 'Data chiusura non valida' });
      }
      if (closeAt <= new Date()) {
        return res.status(400).json({ error: 'La data di chiusura deve essere nel futuro' });
      }
    }

    const market = await prisma.market.create({
      data: {
        title: req.body.title.trim(),
        description: req.body.description?.trim() || null,
        imageUrl,
        closeAt,
        createdBy: req.user.id,
        options: {
          create: options
            .filter(o => o.label?.trim())
            .map(o => ({
              label: o.label.trim(),
              imageUrl: o.imageUrl || null,
              odds: 2.0,
              totalStaked: 0,
            })),
        },
      },
      include: {
        options: true,
        creatorUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: 'MARKET_CREATED',
        metadata: JSON.stringify({ marketId: market.id, title: market.title }),
      },
    });

    // Emit socket event
    const io = req.io || req.app.get('io');
    if (io) {
      io.to('global').emit('market:created', { ...market, totalPool: 0, totalBets: 0, totalComments: 0 });
    }

    res.status(201).json(market);
  } catch (err) {
    console.error('Create market error:', err);
    res.status(500).json({ error: 'Errore interno del server', detail: err.message });
  }
});

router.put('/:id', authenticate, upload.single('image'), async (req, res) => {
  try {
    const marketId = parseInt(req.params.id);
    const userId = req.user.id;
    const isAdmin = req.user.isAdmin;

    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: { options: true },
    });

    if (!market) return res.status(404).json({ error: 'Market non trovato' });

    // Permission check
    if (!isAdmin) {
      if (market.createdBy !== userId) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }
      const minutesSinceCreation = (Date.now() - new Date(market.createdAt).getTime()) / 60000;
      if (minutesSinceCreation > 10) {
        return res.status(403).json({
          error: 'Tempo scaduto. I pronostici possono essere modificati solo nei primi 10 minuti.',
        });
      }
    }

    // Build update data
    const data = {};
    if (req.body.title !== undefined) data.title = req.body.title.trim() || market.title;
    if (req.body.description !== undefined) data.description = req.body.description.trim() || null;
    if (req.body.closeAt !== undefined) {
      const parsed = new Date(req.body.closeAt);
      data.closeAt = !isNaN(parsed.getTime()) ? parsed : market.closeAt;
    }
    // Only admin can change status directly
    if (isAdmin && req.body.status !== undefined) data.status = req.body.status;

    // Banner: file > URL > keep existing
    if (req.file) {
      data.imageUrl = await uploadToCloudinary(req.file, 'chill-no-presura/markets');
    } else if (req.body.imageUrl !== undefined) {
      data.imageUrl = req.body.imageUrl.trim() || null;
    }

    const updated = await prisma.market.update({
      where: { id: marketId },
      data,
      include: { options: true, creatorUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });

    // Update option labels if provided
    if (req.body.options) {
      let newOptions;
      try {
        newOptions = typeof req.body.options === 'string' ? JSON.parse(req.body.options) : req.body.options;
      } catch { /* ignore */ }

      if (newOptions && Array.isArray(newOptions)) {
        for (const opt of newOptions) {
          if (opt.id) {
            await prisma.marketOption.update({
              where: { id: opt.id },
              data: { label: opt.label?.trim() },
            });
          } else if (isAdmin && opt.label?.trim()) {
            await prisma.marketOption.create({
              data: { marketId, label: opt.label.trim(), odds: 2.0, totalStaked: 0 },
            });
          }
        }
      }
    }

    // Re-fetch with updated options
    const final = await prisma.market.findUnique({
      where: { id: marketId },
      include: { options: true, creatorUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });

    const io = req.io || req.app.get('io');
    if (io) {
      io.to('global').emit('market:updated', { marketId, market: final });
    }

    res.json(final);
  } catch (err) {
    console.error('Update market error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.post('/:id/resolve', authenticate, requireAdmin, async (req, res) => {
  try {
    const marketId = parseInt(req.params.id);
    const { winningOptionId } = req.body;

    if (!winningOptionId) {
      return res.status(400).json({ error: 'ID opzione vincente richiesto' });
    }

    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: { options: true, entries: { include: { user: true } } },
    });

    if (!market) return res.status(404).json({ error: 'Market non trovato' });
    if (market.status === 'RESOLVED') {
      return res.status(400).json({ error: 'Market già risolto' });
    }

    const winningOption = market.options.find(o => o.id === parseInt(winningOptionId));
    if (!winningOption) {
      return res.status(400).json({ error: 'Opzione non valida' });
    }

    await prisma.market.update({
      where: { id: marketId },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedOption: parseInt(winningOptionId) },
    });

    const io = req.io || req.app.get('io');

    for (const entry of market.entries) {
      if (entry.optionId === parseInt(winningOptionId)) {
        await prisma.betEntry.update({ where: { id: entry.id }, data: { status: 'WON' } });
        await prisma.user.update({ where: { id: entry.userId }, data: { balance: { increment: entry.potentialWin } } });
        await prisma.transaction.create({
          data: {
            userId: entry.userId, type: 'WIN', amount: entry.potentialWin,
            description: `Vincita su "${market.title}" - ${winningOption.label}`,
          },
        });
        await prisma.activityLog.create({
          data: { userId: entry.userId, action: 'BET_WON', metadata: JSON.stringify({ marketId, betId: entry.id, amount: entry.potentialWin }) },
        });
        if (io) {
          const updatedUser = await prisma.user.findUnique({ where: { id: entry.userId }, select: { balance: true } });
          io.to(`user:${entry.userId}`).emit('balance:updated', {
            newBalance: updatedUser.balance, delta: entry.potentialWin, type: 'WIN',
            description: `Vincita: ${winningOption.label}`,
          });
          // Notify admin panel
          io.to('admin-room').emit('admin:balance_updated', {
            userId: entry.userId, newBalance: updatedUser.balance, delta: entry.potentialWin, type: 'WIN',
            username: entry.user?.displayName || entry.user?.username,
          });
        }
      } else {
        await prisma.betEntry.update({ where: { id: entry.id }, data: { status: 'LOST' } });
        await prisma.activityLog.create({
          data: { userId: entry.userId, action: 'BET_LOST', metadata: JSON.stringify({ marketId, betId: entry.id, amount: entry.amount }) },
        });
      }
    }

    await prisma.activityLog.create({
      data: { userId: req.user.id, action: 'MARKET_RESOLVED', metadata: JSON.stringify({ marketId, winningOptionId: parseInt(winningOptionId), winningLabel: winningOption.label }) },
    });

    if (io) {
      io.to('global').emit('market:resolved', { marketId, resolvedOption: parseInt(winningOptionId) });
    }

    res.json({ message: 'Market risolto con successo', winningOption: winningOption.label });
  } catch (err) {
    console.error('Resolve market error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Delete market (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const marketId = parseInt(req.params.id);
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: { entries: true },
    });
    if (!market) return res.status(404).json({ error: 'Market non trovato' });

    const io = req.io || req.app.get('io');

    // Refund pending bets
    for (const entry of market.entries) {
      if (entry.status === 'PENDING') {
        await prisma.user.update({ where: { id: entry.userId }, data: { balance: { increment: entry.amount } } });
        await prisma.transaction.create({
          data: { userId: entry.userId, type: 'REFUND', amount: entry.amount, description: `Rimborso: "${market.title}" eliminato` },
        });
        if (io) {
          const u = await prisma.user.findUnique({ where: { id: entry.userId }, select: { balance: true } });
          io.to(`user:${entry.userId}`).emit('balance:updated', { newBalance: u.balance, delta: entry.amount, type: 'REFUND', description: 'Rimborso market eliminato' });
          // Notify admin panel
          io.to('admin-room').emit('admin:balance_updated', {
            userId: entry.userId, newBalance: u.balance, delta: entry.amount, type: 'REFUND',
          });
        }
      }
    }

    await prisma.market.delete({ where: { id: marketId } });
    res.json({ message: 'Market eliminato' });
  } catch (err) {
    console.error('Delete market error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
