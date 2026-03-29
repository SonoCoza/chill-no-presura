const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const BETTING_DURATION = 20000;
const LAST_CALL_DURATION = 5000;
const SPINNING_DURATION = 8000;
const RESULT_DURATION = 4000;

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const COLUMN_1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
const COLUMN_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const COLUMN_3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

const TOTAL_PAYOUTS = {
  STRAIGHT: 36,
  SPLIT: 18,
  DOZEN: 3,
  COLUMN: 3,
  RED_BLACK: 2,
  ODD_EVEN: 2,
};

function isWinner(betType, betValue, winningNumber) {
  const n = winningNumber;
  switch (betType) {
    case 'STRAIGHT':
      return parseInt(betValue, 10) === n;
    case 'SPLIT':
      return betValue.split('-').map(Number).includes(n);
    case 'DOZEN':
      if (betValue === '1-12') return n >= 1 && n <= 12;
      if (betValue === '13-24') return n >= 13 && n <= 24;
      if (betValue === '25-36') return n >= 25 && n <= 36;
      return false;
    case 'COLUMN':
      if (betValue === 'col1') return COLUMN_1.includes(n);
      if (betValue === 'col2') return COLUMN_2.includes(n);
      if (betValue === 'col3') return COLUMN_3.includes(n);
      return false;
    case 'RED_BLACK':
      if (betValue === 'red') return RED_NUMBERS.includes(n);
      if (betValue === 'black') return !RED_NUMBERS.includes(n) && n !== 0;
      return false;
    case 'ODD_EVEN':
      if (n === 0) return false;
      if (betValue === 'odd') return n % 2 !== 0;
      if (betValue === 'even') return n % 2 === 0;
      return false;
    default:
      return false;
  }
}

let activeSessionId = null;
let activeRoundId = null;
let roundTimeout = null;

router.get('/state', authenticate, async (req, res) => {
  try {
    if (!activeSessionId) return res.json({ active: false });

    const round = activeRoundId
      ? await prisma.rouletteRound.findUnique({
          where: { id: activeRoundId },
          include: {
            bets: {
              where: { user: { isAdmin: false } },
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
              orderBy: { placedAt: 'desc' },
            },
            comments: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
              orderBy: { createdAt: 'asc' },
              take: 100,
            },
          },
        })
      : null;

    const session = await prisma.rouletteSession.findUnique({
      where: { id: activeSessionId },
      select: { id: true, status: true, intervalSec: true },
    });

    const safeRound = round ? { ...round, adminOverride: undefined } : null;

    const history = await prisma.rouletteRound.findMany({
      where: { sessionId: activeSessionId, winningNumber: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 20,
      select: { id: true, winningNumber: true, roundNumber: true },
    });

    res.json({
      active: true,
      session,
      round: safeRound,
      history,
      timeLeft: round?.bettingEndsAt
        ? Math.max(0, Math.floor((new Date(round.bettingEndsAt) - new Date()) / 1000))
        : 0,
    });
  } catch (err) {
    console.error('Roulette state error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const rounds = await prisma.rouletteRound.findMany({
      where: { winningNumber: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 50,
      select: { id: true, winningNumber: true, roundNumber: true, resolvedAt: true },
    });
    res.json(rounds);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bet', authenticate, async (req, res) => {
  try {
    const { betType, betValue, amount } = req.body;
    const userId = req.user.id;
    const betAmount = parseFloat(amount);

    if (!activeRoundId) return res.status(400).json({ error: 'Nessun round attivo' });
    if (Number.isNaN(betAmount) || betAmount <= 0) return res.status(400).json({ error: 'Importo non valido' });

    const round = await prisma.rouletteRound.findUnique({ where: { id: activeRoundId } });
    if (!round || !['BETTING', 'LAST_CALL'].includes(round.phase)) {
      return res.status(400).json({ error: 'Puntate chiuse' });
    }
    if (round.bettingEndsAt && new Date() > round.bettingEndsAt) {
      return res.status(400).json({ error: 'Tempo scaduto' });
    }

    if (!req.user.isAdmin) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user.balance < betAmount) return res.status(400).json({ error: 'Saldo insufficiente' });
      await prisma.user.update({ where: { id: userId }, data: { balance: { decrement: betAmount } } });
    }

    const totalPayout = TOTAL_PAYOUTS[betType] || 2;
    const potentialWin = betAmount * totalPayout;

    const bet = await prisma.rouletteBet.create({
      data: {
        roundId: activeRoundId,
        userId,
        betType,
        betValue,
        amount: betAmount,
        totalPayout,
        potentialWin,
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isAdmin: true } },
      },
    });

    if (!req.user.isAdmin) {
      await prisma.transaction.create({
        data: {
          userId,
          type: 'BET',
          amount: -betAmount,
          description: `Roulette: ${betType} ${betValue}`,
        },
      });
    }

    const io = req.io || req.app.get('io');

    if (!req.user.isAdmin && io) {
      const { isAdmin: _a, ...safeUser } = bet.user;
      io.to('roulette-room').emit('roulette:bet_placed', {
        bet: { ...bet, user: safeUser },
        roundId: activeRoundId,
      });
    }

    if (!req.user.isAdmin && io) {
      const updated = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
      io.to(`user:${userId}`).emit('balance:updated', {
        newBalance: updated.balance,
        delta: -betAmount,
        type: 'BET',
        description: 'Roulette',
      });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Roulette bet error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/comment', authenticate, async (req, res) => {
  try {
    const { text, imageUrl } = req.body;
    if (!activeRoundId) return res.status(400).json({ error: 'Nessun round attivo' });
    if (!text?.trim() && !imageUrl) return res.status(400).json({ error: 'Testo o immagine richiesti' });

    const comment = await prisma.rouletteComment.create({
      data: {
        roundId: activeRoundId,
        userId: req.user.id,
        text: text?.trim() || null,
        imageUrl: imageUrl || null,
      },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });

    const io = req.io || req.app.get('io');
    if (io) io.to('roulette-room').emit('roulette:comment', { comment });

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/start', authenticate, requireAdmin, async (req, res) => {
  try {
    const { intervalSec = 20 } = req.body;

    if (activeSessionId) {
      await prisma.rouletteSession.update({
        where: { id: activeSessionId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      if (roundTimeout) clearTimeout(roundTimeout);
    }

    const session = await prisma.rouletteSession.create({
      data: { intervalSec, createdBy: req.user.id, status: 'ACTIVE' },
    });

    activeSessionId = session.id;
    activeRoundId = null;

    const io = req.io || req.app.get('io');
    if (io) io.to('roulette-room').emit('roulette:session_started', { sessionId: session.id, intervalSec });

    await startNewRound(io);

    res.json({ success: true, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/stop', authenticate, requireAdmin, async (req, res) => {
  try {
    if (roundTimeout) {
      clearTimeout(roundTimeout);
      roundTimeout = null;
    }
    if (activeSessionId) {
      await prisma.rouletteSession.update({
        where: { id: activeSessionId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    }
    activeSessionId = null;
    activeRoundId = null;

    const io = req.io || req.app.get('io');
    if (io) io.to('roulette-room').emit('roulette:session_closed');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/override', authenticate, requireAdmin, async (req, res) => {
  try {
    const { number } = req.body;
    if (number === undefined || number === null) {
      return res.status(400).json({ error: 'Numero richiesto' });
    }
    const n = parseInt(number, 10);
    if (Number.isNaN(n)) return res.status(400).json({ error: 'Numero non valido' });
    if (!activeRoundId) return res.status(400).json({ error: 'Nessun round attivo' });

    if (n === -1) {
      await prisma.rouletteRound.update({
        where: { id: activeRoundId },
        data: { adminOverride: null },
      });
      return res.json({ success: true, message: 'Override rimosso' });
    }

    if (n < 0 || n > 36) {
      return res.status(400).json({ error: 'Numero non valido (0-36)' });
    }

    await prisma.rouletteRound.update({
      where: { id: activeRoundId },
      data: { adminOverride: n },
    });

    res.json({ success: true, message: `Override impostato: ${n}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startNewRound(io) {
  if (!activeSessionId) return;

  const session = await prisma.rouletteSession.findUnique({ where: { id: activeSessionId } });
  if (!session || session.status !== 'ACTIVE') return;

  const roundCount = await prisma.rouletteRound.count({ where: { sessionId: activeSessionId } });

  const intervalSec = session.intervalSec || 20;
  const bettingDuration = intervalSec * 1000;
  const bettingEndsAt = new Date(Date.now() + bettingDuration + LAST_CALL_DURATION);

  const round = await prisma.rouletteRound.create({
    data: {
      sessionId: activeSessionId,
      roundNumber: roundCount + 1,
      status: 'BETTING',
      phase: 'BETTING',
      bettingEndsAt,
    },
  });

  activeRoundId = round.id;

  if (io) {
    io.to('roulette-room').emit('roulette:round_started', {
      roundId: round.id,
      roundNumber: round.roundNumber,
      phase: 'BETTING',
      bettingEndsAt: bettingEndsAt.toISOString(),
      bettingDurationMs: bettingDuration + LAST_CALL_DURATION,
    });
  }

  roundTimeout = setTimeout(async () => {
    if (!activeSessionId || activeRoundId !== round.id) return;
    await prisma.rouletteRound.update({ where: { id: round.id }, data: { phase: 'LAST_CALL' } });
    if (io) {
      io.to('roulette-room').emit('roulette:last_call', {
        roundId: round.id,
        timeLeft: LAST_CALL_DURATION / 1000,
      });
    }

    roundTimeout = setTimeout(() => startSpin(round.id, io), LAST_CALL_DURATION);
  }, bettingDuration);
}

async function startSpin(roundId, io) {
  if (!activeSessionId || activeRoundId !== roundId) return;

  const round = await prisma.rouletteRound.findUnique({ where: { id: roundId } });
  if (!round) return;

  await prisma.rouletteRound.update({
    where: { id: roundId },
    data: { status: 'SPINNING', phase: 'SPINNING' },
  });

  if (io) {
    io.to('roulette-room').emit('roulette:spinning', {
      roundId,
      duration: SPINNING_DURATION,
    });
  }

  roundTimeout = setTimeout(() => resolveRound(roundId, io), SPINNING_DURATION);
}

async function resolveRound(roundId, io) {
  if (!activeSessionId || activeRoundId !== roundId) return;

  const round = await prisma.rouletteRound.findUnique({
    where: { id: roundId },
    include: {
      bets: { include: { user: { select: { id: true, isAdmin: true } } } },
    },
  });
  if (!round) return;

  const winningNumber =
    round.adminOverride !== null && round.adminOverride !== undefined && round.adminOverride >= 0
      ? round.adminOverride
      : Math.floor(Math.random() * 37);

  await prisma.rouletteRound.update({
    where: { id: roundId },
    data: { status: 'RESULT', phase: 'RESULT', winningNumber, resolvedAt: new Date() },
  });

  const results = [];
  for (const bet of round.bets) {
    const won = isWinner(bet.betType, bet.betValue, winningNumber);
    await prisma.rouletteBet.update({
      where: { id: bet.id },
      data: { won, resolvedAt: new Date() },
    });

    if (won && !bet.user.isAdmin) {
      const winAmount = bet.amount * bet.totalPayout;
      const updated = await prisma.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: winAmount } },
        select: { balance: true },
      });
      await prisma.transaction.create({
        data: {
          userId: bet.userId,
          type: 'WIN',
          amount: winAmount,
          description: `Roulette vincita: ${winningNumber}`,
        },
      });
      if (io) {
        io.to(`user:${bet.userId}`).emit('balance:updated', {
          newBalance: updated.balance,
          delta: winAmount,
          type: 'WIN',
          description: `Roulette: ${winningNumber}!`,
        });
        io.to('admin-room').emit('admin:balance_updated', {
          userId: bet.userId,
          newBalance: updated.balance,
          delta: winAmount,
          type: 'WIN',
        });
      }
      results.push({ userId: bet.userId, won: true, amount: bet.amount, payout: winAmount });
    } else if (!bet.user.isAdmin) {
      results.push({ userId: bet.userId, won: false, amount: bet.amount, payout: 0 });
    }
  }

  if (io) {
    io.to('roulette-room').emit('roulette:result', {
      roundId,
      roundNumber: round.roundNumber,
      winningNumber,
      results,
    });
  }

  roundTimeout = setTimeout(() => {
    if (activeSessionId) startNewRound(io);
  }, RESULT_DURATION);
}

module.exports = router;

