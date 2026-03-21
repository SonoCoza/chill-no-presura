const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const { recalculateOdds } = require('../utils/odds');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/', authenticate, [
  body('marketId').isInt().withMessage('Market ID richiesto'),
  body('optionId').isInt().withMessage('Option ID richiesto'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Importo minimo 0.01'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { marketId, optionId, amount } = req.body;
    const userId = req.user.id;

    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: { options: true },
    });

    if (!market) return res.status(404).json({ error: 'Market non trovato' });
    if (market.status !== 'OPEN') return res.status(400).json({ error: 'Il market non è aperto' });
    if (market.closeAt && new Date(market.closeAt) < new Date()) {
      return res.status(400).json({ error: 'Il market è scaduto' });
    }

    const option = market.options.find(o => o.id === optionId);
    if (!option) return res.status(400).json({ error: 'Opzione non valida per questo market' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user.isSuspended) return res.status(403).json({ error: 'Account sospeso' });
    // Admin has infinite balance — skip check
    if (!user.isAdmin && user.balance < amount) return res.status(400).json({ error: 'Saldo insufficiente' });

    const oddsAtTime = option.odds;
    const potentialWin = Math.round(amount * oddsAtTime * 100) / 100;

    // Use interactive transaction for atomicity and to get real balance
    const result = await prisma.$transaction(async (tx) => {
      const bet = await tx.betEntry.create({
        data: { userId, marketId, optionId, amount, oddsAtTime, potentialWin },
      });

      // Admin: don't decrement balance (infinite funds)
      let updatedUser;
      if (user.isAdmin) {
        updatedUser = { id: userId, balance: user.balance };
      } else {
        updatedUser = await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: amount } },
          select: { id: true, balance: true },
        });
      }

      await tx.marketOption.update({
        where: { id: optionId },
        data: { totalStaked: { increment: amount } },
      });

      await tx.transaction.create({
        data: {
          userId, type: 'BET', amount: -amount,
          description: `Scommessa su "${market.title}" - ${option.label}`,
        },
      });

      await tx.activityLog.create({
        data: {
          userId, action: 'BET_PLACED',
          metadata: JSON.stringify({ marketId, optionId, amount, odds: oddsAtTime }),
        },
      });

      return { bet, updatedUser };
    });

    // Recalculate odds AFTER transaction
    await recalculateOdds(marketId);

    // Emit AFTER transaction committed — result.updatedUser.balance is real DB value
    const io = req.io || req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('balance:updated', {
        newBalance: result.updatedUser.balance, delta: -amount, type: 'BET',
        description: `Scommessa: ${option.label}`,
      });

      const allOptions = await prisma.marketOption.findMany({ where: { marketId } });
      io.to('global').emit('market:odds_updated', {
        marketId,
        options: allOptions.map(o => ({ id: o.id, odds: o.odds, totalStaked: o.totalStaked })),
      });

      io.to(`market:${marketId}`).emit('bet:placed', {
        username: user.displayName, optionLabel: option.label, amount,
      });

      // Notify admin panel of balance change
      io.to('admin-room').emit('admin:balance_updated', {
        userId, newBalance: result.updatedUser.balance, delta: -amount, type: 'BET',
        username: user.displayName,
      });
    }

    res.status(201).json({ bet: result.bet, newBalance: result.updatedUser.balance });
  } catch (err) {
    console.error('Place bet error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.get('/my', authenticate, async (req, res) => {
  try {
    const bets = await prisma.betEntry.findMany({
      where: { userId: req.user.id },
      orderBy: { placedAt: 'desc' },
      include: {
        market: { select: { id: true, title: true, status: true, resolvedOption: true } },
        option: { select: { id: true, label: true } },
      },
    });
    res.json(bets);
  } catch (err) {
    console.error('Get my bets error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
