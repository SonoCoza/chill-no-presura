const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { TOTAL_PAYOUTS, isWinner } = require('../utils/rouletteEngine');

const router = express.Router();
const prisma = new PrismaClient();

const T_BETTING = 20000;
const T_LAST_CALL = 5000;
const T_SPINNING = 8000;
const T_RESULT = 4000;

let state = {
  sessionId: null,
  sessionActive: false,
  roundId: null,
  roundNumber: 0,
  phase: 'IDLE',
  bettingEndsAt: null,
  intervalSec: 20,
  timer: null,
};

function getIo(req) {
  return req.io || req.app.get('io');
}

function emit(io, event, data) {
  if (io) io.to('roulette-room').emit(event, data);
}

router.get('/state', authenticate, async (req, res) => {
  try {
    if (!state.sessionActive || !state.roundId) {
      return res.json({ active: false, phase: 'IDLE' });
    }

    const round = await prisma.rouletteRound.findUnique({
      where: { id: state.roundId },
      include: {
        bets: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true, isAdmin: true },
            },
          },
          orderBy: { placedAt: 'asc' },
        },
        comments: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    });

    const publicBets = (round?.bets || []).filter((b) => !b.user?.isAdmin);

    const history = await prisma.rouletteRound.findMany({
      where: { sessionId: state.sessionId, winningNumber: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 20,
      select: { id: true, winningNumber: true, roundNumber: true },
    });

    const timeLeftMs = state.bettingEndsAt ? Math.max(0, state.bettingEndsAt - Date.now()) : 0;

    res.json({
      active: true,
      phase: state.phase,
      roundId: state.roundId,
      roundNumber: state.roundNumber,
      bettingEndsAt: state.bettingEndsAt ? new Date(state.bettingEndsAt).toISOString() : null,
      timeLeftSec: Math.ceil(timeLeftMs / 1000),
      bets: publicBets.map((b) => ({
        id: b.id,
        userId: b.userId,
        betType: b.betType,
        betValue: b.betValue,
        amount: b.amount,
        potentialWin: b.potentialWin,
        user: {
          id: b.user.id,
          username: b.user.username,
          displayName: b.user.displayName,
          avatarUrl: b.user.avatarUrl,
        },
      })),
      comments: round?.comments || [],
      history,
    });
  } catch (err) {
    console.error('roulette/state error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/history', authenticate, async (req, res) => {
  try {
    const history = await prisma.rouletteRound.findMany({
      where: { winningNumber: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 50,
      select: { id: true, winningNumber: true, roundNumber: true, resolvedAt: true },
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/bet', authenticate, async (req, res) => {
  try {
    const { betType, betValue, amount } = req.body;
    const userId = req.user.id;
    const betAmount = parseFloat(amount);

    if (!state.sessionActive || !state.roundId) {
      return res.status(400).json({ error: 'Nessuna sessione attiva' });
    }
    if (!['BETTING', 'LAST_CALL'].includes(state.phase)) {
      return res.status(400).json({ error: 'Le puntate sono chiuse' });
    }
    if (state.bettingEndsAt && Date.now() > state.bettingEndsAt) {
      return res.status(400).json({ error: 'Tempo scaduto' });
    }
    if (Number.isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!TOTAL_PAYOUTS[betType]) {
      return res.status(400).json({ error: 'Tipo puntata non valido' });
    }

    if (!req.user.isAdmin) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.balance < betAmount) {
        return res.status(400).json({ error: 'Saldo insufficiente' });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: betAmount } },
      });
    }

    const totalPayout = TOTAL_PAYOUTS[betType];
    const potentialWin = betAmount * totalPayout;

    const bet = await prisma.rouletteBet.create({
      data: {
        roundId: state.roundId,
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

    const io = getIo(req);

    if (!req.user.isAdmin && io) {
      emit(io, 'roulette:bet_placed', {
        bet: {
          id: bet.id,
          userId: bet.userId,
          betType: bet.betType,
          betValue: bet.betValue,
          amount: bet.amount,
          potentialWin: bet.potentialWin,
          user: {
            id: bet.user.id,
            username: bet.user.username,
            displayName: bet.user.displayName,
            avatarUrl: bet.user.avatarUrl,
          },
        },
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

    res.status(201).json({ success: true, bet: { id: bet.id } });
  } catch (err) {
    console.error('roulette/bet error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/comment', authenticate, async (req, res) => {
  try {
    const { text, imageUrl } = req.body;
    if (!state.roundId) return res.status(400).json({ error: 'Nessun round attivo' });
    if (!text?.trim() && !imageUrl) return res.status(400).json({ error: 'Testo richiesto' });

    const comment = await prisma.rouletteComment.create({
      data: {
        roundId: state.roundId,
        userId: req.user.id,
        text: text?.trim() || null,
        imageUrl: imageUrl || null,
      },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    });

    const io = getIo(req);
    emit(io, 'roulette:comment', { comment });
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/start', authenticate, requireAdmin, async (req, res) => {
  try {
    const { intervalSec = 20 } = req.body;

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.sessionId) {
      await prisma.rouletteSession.update({
        where: { id: state.sessionId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    }

    const session = await prisma.rouletteSession.create({
      data: { intervalSec, createdBy: req.user.id, status: 'ACTIVE' },
    });

    state.sessionId = session.id;
    state.sessionActive = true;
    state.intervalSec = intervalSec;
    state.roundId = null;
    state.roundNumber = 0;
    state.phase = 'IDLE';

    const io = getIo(req);
    emit(io, 'roulette:session_started', { sessionId: session.id, intervalSec });

    state.timer = setTimeout(() => startBetting(prisma, io), 2000);

    res.json({ success: true, sessionId: session.id });
  } catch (err) {
    console.error('admin/start error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/stop', authenticate, requireAdmin, async (req, res) => {
  try {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.sessionId) {
      await prisma.rouletteSession.update({
        where: { id: state.sessionId },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    }

    state = {
      sessionId: null,
      sessionActive: false,
      roundId: null,
      roundNumber: 0,
      phase: 'IDLE',
      bettingEndsAt: null,
      intervalSec: 20,
      timer: null,
    };

    const io = getIo(req);
    emit(io, 'roulette:session_closed', {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/override', authenticate, requireAdmin, async (req, res) => {
  try {
    const { number } = req.body;
    const n = parseInt(number, 10);

    if (!state.roundId) return res.status(400).json({ error: 'Nessun round attivo' });

    const override = n >= 0 && n <= 36 ? n : null;

    await prisma.rouletteRound.update({
      where: { id: state.roundId },
      data: { adminOverride: override },
    });

    res.json({ success: true, override });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startBetting(prismaClient, io) {
  if (!state.sessionActive) return;

  state.roundNumber += 1;
  const bettingMs = state.intervalSec * 1000;
  const endsAt = Date.now() + bettingMs + T_LAST_CALL;

  const round = await prismaClient.rouletteRound.create({
    data: {
      sessionId: state.sessionId,
      roundNumber: state.roundNumber,
      phase: 'BETTING',
      bettingEndsAt: new Date(endsAt),
    },
  });

  state.roundId = round.id;
  state.phase = 'BETTING';
  state.bettingEndsAt = endsAt;

  emit(io, 'roulette:phase', {
    phase: 'BETTING',
    roundId: round.id,
    roundNumber: round.roundNumber,
    bettingEndsAt: new Date(endsAt).toISOString(),
    totalMs: bettingMs + T_LAST_CALL,
  });

  state.timer = setTimeout(() => startLastCall(prismaClient, io, round.id), bettingMs);
}

async function startLastCall(prismaClient, io, roundId) {
  if (!state.sessionActive || state.roundId !== roundId) return;

  state.phase = 'LAST_CALL';
  await prismaClient.rouletteRound.update({ where: { id: roundId }, data: { phase: 'LAST_CALL' } });

  emit(io, 'roulette:phase', {
    phase: 'LAST_CALL',
    roundId,
    totalMs: T_LAST_CALL,
  });

  state.timer = setTimeout(() => startSpinning(prismaClient, io, roundId), T_LAST_CALL);
}

async function startSpinning(prismaClient, io, roundId) {
  if (!state.sessionActive || state.roundId !== roundId) return;

  state.phase = 'SPINNING';
  state.bettingEndsAt = null;

  await prismaClient.rouletteRound.update({ where: { id: roundId }, data: { phase: 'SPINNING' } });

  const roundRow = await prismaClient.rouletteRound.findUnique({
    where: { id: roundId },
    select: { adminOverride: true },
  });

  const winningNumber =
    roundRow?.adminOverride !== null &&
    roundRow?.adminOverride !== undefined &&
    roundRow.adminOverride >= 0
      ? roundRow.adminOverride
      : Math.floor(Math.random() * 37);

  await prismaClient.rouletteRound.update({
    where: { id: roundId },
    data: { winningNumber },
  });

  emit(io, 'roulette:phase', {
    phase: 'SPINNING',
    roundId,
    totalMs: T_SPINNING,
    winningNumber,
  });

  state.timer = setTimeout(() => showResult(prismaClient, io, roundId, winningNumber), T_SPINNING);
}

async function showResult(prismaClient, io, roundId, winningNumber) {
  if (!state.sessionActive || state.roundId !== roundId) return;

  state.phase = 'RESULT';
  await prismaClient.rouletteRound.update({
    where: { id: roundId },
    data: { phase: 'RESULT', resolvedAt: new Date() },
  });

  const round = await prismaClient.rouletteRound.findUnique({
    where: { id: roundId },
    include: { bets: { include: { user: { select: { id: true, isAdmin: true } } } } },
  });

  const results = [];

  for (const bet of round.bets) {
    const won = isWinner(bet.betType, bet.betValue, winningNumber);
    await prismaClient.rouletteBet.update({
      where: { id: bet.id },
      data: { won, resolvedAt: new Date() },
    });

    if (won && !bet.user.isAdmin) {
      const winAmount = bet.amount * bet.totalPayout;
      const updated = await prismaClient.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: winAmount } },
        select: { balance: true },
      });
      await prismaClient.transaction.create({
        data: {
          userId: bet.userId,
          type: 'WIN',
          amount: winAmount,
          description: `Roulette vincita #${winningNumber}`,
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
      results.push({ userId: bet.userId, won: true, winAmount });
    } else if (!bet.user.isAdmin) {
      results.push({ userId: bet.userId, won: false, winAmount: 0 });
    }
  }

  emit(io, 'roulette:phase', {
    phase: 'RESULT',
    roundId,
    roundNumber: round.roundNumber,
    winningNumber,
    results,
    totalMs: T_RESULT,
  });

  state.timer = setTimeout(() => startBetting(prismaClient, io), T_RESULT);
}

module.exports = router;
