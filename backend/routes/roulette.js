const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { calculateWin, getTotalPayout } = require('../utils/roulette');

const router = express.Router();
const prisma = new PrismaClient();

// Durate fasi (ms)
const BETTING_DURATION  = 20000; // 20 secondi di puntate
const SPINNING_DURATION = 8000;  // 8 secondi la ruota gira
const RESULT_DURATION   = 5000;  // 5 secondi mostra risultato

// GET /api/roulette/active — sessione e round attivi
router.get('/active', authenticate, async (req, res) => {
  try {
    const session = await prisma.rouletteSession.findFirst({
      where: { status: { in: ['WAITING', 'BETTING', 'SPINNING', 'RESULT'] } },
      include: {
        rounds: {
          where: { status: { not: 'RESULT' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            bets: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isAdmin: true } },
              },
            },
            comments: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
              orderBy: { createdAt: 'asc' },
              take: 50,
            },
          },
        },
      },
    });

    if (!session) return res.json({ session: null, round: null });

    const currentRound = session.rounds[0] || null;

    // Rimuovi adminOverride e filtra bet admin dalla response pubblica
    let sanitizedRound = null;
    if (currentRound) {
      sanitizedRound = {
        ...currentRound,
        adminOverride: undefined,
        bets: currentRound.bets
          .filter(b => !b.user?.isAdmin || b.userId === req.user?.id)
          .map(b => ({ ...b, user: { id: b.user.id, username: b.user.username, displayName: b.user.displayName, avatarUrl: b.user.avatarUrl } })),
      };
    }

    res.json({ session: { ...session, rounds: undefined }, round: sanitizedRound });
  } catch (err) {
    console.error('Roulette active error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roulette/history — ultimi round risolti
router.get('/history', authenticate, async (req, res) => {
  try {
    const rounds = await prisma.rouletteRound.findMany({
      where: { status: 'RESULT', winningNumber: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        winningNumber: true,
        resolvedAt: true,
        bets: { select: { id: true } },
      },
    });
    res.json(rounds.map(r => ({
      id: r.id,
      winningNumber: r.winningNumber,
      resolvedAt: r.resolvedAt,
      totalBets: r.bets.length,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roulette/bet — piazza una bet sul round corrente
router.post('/bet', authenticate, async (req, res) => {
  try {
    const { roundId, betType, betValue, amount } = req.body;
    const userId = req.user.id;
    const betAmount = parseFloat(amount);

    if (isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ error: 'Importo non valido' });
    }

    const round = await prisma.rouletteRound.findUnique({
      where: { id: parseInt(roundId) },
    });

    if (!round || round.status !== 'BETTING') {
      return res.status(400).json({ error: 'Le puntate sono chiuse' });
    }

    if (round.bettingEndsAt && new Date() > round.bettingEndsAt) {
      return res.status(400).json({ error: 'Tempo per le puntate scaduto' });
    }

    // Controlla saldo (admin ha saldo infinito)
    if (!req.user.isAdmin) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user.balance < betAmount) {
        return res.status(400).json({ error: 'Saldo insufficiente' });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: betAmount } },
      });
    }

    const totalPayout = getTotalPayout(betType);
    const potentialWin = betAmount * totalPayout;

    const bet = await prisma.rouletteBet.create({
      data: {
        roundId: parseInt(roundId),
        userId,
        betType,
        betValue,
        amount: betAmount,
        payout: totalPayout,
        potentialWin,
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isAdmin: true } },
      },
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'BET',
        amount: -betAmount,
        description: `Roulette bet: ${betType} ${betValue}`,
      },
    });

    const io = req.io || req.app.get('io');

    // Emetti la bet a tutti — MA nascondi che è dell'admin
    if (io) {
      if (!req.user.isAdmin) {
        const publicBet = {
          ...bet,
          user: { id: bet.user.id, username: bet.user.username, displayName: bet.user.displayName, avatarUrl: bet.user.avatarUrl },
        };
        io.to('roulette-room').emit('roulette:bet_placed', { bet: publicBet, roundId: parseInt(roundId) });
      }

      // Aggiorna saldo utente via WebSocket
      if (!req.user.isAdmin) {
        const updatedUser = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
        io.to(`user:${userId}`).emit('balance:updated', {
          newBalance: updatedUser.balance,
          delta: -betAmount,
          type: 'BET',
          description: 'Roulette bet',
        });
      }
    }

    res.status(201).json({ success: true, bet });
  } catch (err) {
    console.error('Roulette bet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roulette/comment — commento su un round
router.post('/comment', authenticate, async (req, res) => {
  try {
    const { roundId, text, imageUrl } = req.body;

    if (!text?.trim() && !imageUrl) {
      return res.status(400).json({ error: 'Testo o immagine richiesti' });
    }

    const comment = await prisma.rouletteComment.create({
      data: {
        roundId: parseInt(roundId),
        userId: req.user.id,
        text: text?.trim() || null,
        imageUrl: imageUrl || null,
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    const io = req.io || req.app.get('io');
    if (io) {
      io.to('roulette-room').emit('roulette:comment', { comment, roundId: parseInt(roundId) });
    }

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN ROUTES
// ============================================================

// POST /api/roulette/admin/session — crea nuova sessione
router.post('/admin/session', authenticate, requireAdmin, async (req, res) => {
  try {
    const { mode, autoIntervalSec } = req.body;

    // Chiudi sessioni attive esistenti
    await prisma.rouletteSession.updateMany({
      where: { status: { in: ['WAITING', 'BETTING', 'SPINNING', 'RESULT'] } },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    const session = await prisma.rouletteSession.create({
      data: {
        mode: mode || 'MANUAL',
        autoIntervalSec: autoIntervalSec || null,
        createdBy: req.user.id,
        status: 'WAITING',
      },
    });

    const io = req.io || req.app.get('io');
    if (io) {
      io.to('roulette-room').emit('roulette:session_started', {
        session: { id: session.id, status: session.status, mode: session.mode },
      });
    }

    // Se modalità AUTO, avvia immediatamente il primo round
    if (mode === 'AUTO') {
      startNewRound(session.id, io, autoIntervalSec);
    }

    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roulette/admin/round/start — avvia nuovo round (solo MANUAL)
router.post('/admin/round/start', authenticate, requireAdmin, async (req, res) => {
  try {
    const { sessionId, adminOverride } = req.body;

    const session = await prisma.rouletteSession.findUnique({
      where: { id: parseInt(sessionId) },
    });

    if (!session || session.status === 'CLOSED') {
      return res.status(400).json({ error: 'Sessione non attiva' });
    }

    const bettingEndsAt = new Date(Date.now() + BETTING_DURATION);

    const round = await prisma.rouletteRound.create({
      data: {
        sessionId: parseInt(sessionId),
        status: 'BETTING',
        bettingEndsAt,
        adminOverride: adminOverride !== undefined ? parseInt(adminOverride) : null,
      },
    });

    await prisma.rouletteSession.update({
      where: { id: parseInt(sessionId) },
      data: { status: 'BETTING' },
    });

    const io = req.io || req.app.get('io');
    if (io) {
      io.to('roulette-room').emit('roulette:round_started', {
        roundId: round.id,
        status: 'BETTING',
        bettingEndsAt: bettingEndsAt.toISOString(),
        timeLeft: BETTING_DURATION,
      });
    }

    // Dopo BETTING_DURATION, avvia la rotazione automaticamente
    setTimeout(() => startSpin(round.id, io), BETTING_DURATION);

    res.status(201).json({ round: { id: round.id, status: round.status, bettingEndsAt } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/roulette/admin/round/:id/override — cambia il risultato durante la rotazione
router.put('/admin/round/:id/override', authenticate, requireAdmin, async (req, res) => {
  try {
    const roundId = parseInt(req.params.id);
    const { number } = req.body;

    if (number === undefined || number < 0 || number > 36) {
      return res.status(400).json({ error: 'Numero non valido (0-36)' });
    }

    const round = await prisma.rouletteRound.findUnique({ where: { id: roundId } });

    if (!round || round.status !== 'SPINNING') {
      return res.status(400).json({ error: 'La ruota non sta girando' });
    }

    await prisma.rouletteRound.update({
      where: { id: roundId },
      data: { adminOverride: parseInt(number) },
    });

    res.json({ success: true, message: 'Override impostato silenziosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/roulette/admin/session/:id/close — chiudi sessione
router.post('/admin/session/:id/close', authenticate, requireAdmin, async (req, res) => {
  try {
    await prisma.rouletteSession.update({
      where: { id: parseInt(req.params.id) },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    const io = req.io || req.app.get('io');
    if (io) {
      io.to('roulette-room').emit('roulette:session_closed', { sessionId: parseInt(req.params.id) });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// FUNZIONI INTERNE (non route)
// ============================================================

async function startSpin(roundId, io) {
  try {
    const round = await prisma.rouletteRound.findUnique({ where: { id: roundId } });
    if (!round || round.status !== 'BETTING') return;

    await prisma.rouletteRound.update({
      where: { id: roundId },
      data: { status: 'SPINNING', spinStartedAt: new Date() },
    });

    await prisma.rouletteSession.updateMany({
      where: { id: round.sessionId },
      data: { status: 'SPINNING' },
    });

    if (io) {
      io.to('roulette-room').emit('roulette:spinning', {
        roundId,
        duration: SPINNING_DURATION,
      });
    }

    setTimeout(() => resolveRound(roundId, io), SPINNING_DURATION);
  } catch (err) {
    console.error('startSpin error:', err);
  }
}

async function resolveRound(roundId, io) {
  try {
    const round = await prisma.rouletteRound.findUnique({
      where: { id: roundId },
      include: {
        bets: { include: { user: { select: { id: true, isAdmin: true } } } },
        session: true,
      },
    });

    if (!round || round.status !== 'SPINNING') return;

    // Numero vincente: usa adminOverride se impostato, altrimenti random
    const winningNumber = round.adminOverride !== null && round.adminOverride !== undefined
      ? round.adminOverride
      : Math.floor(Math.random() * 37);

    await prisma.rouletteRound.update({
      where: { id: roundId },
      data: {
        status: 'RESULT',
        winningNumber,
        resolvedAt: new Date(),
      },
    });

    await prisma.rouletteSession.updateMany({
      where: { id: round.sessionId },
      data: { status: 'RESULT' },
    });

    // Paga le vincite
    for (const bet of round.bets) {
      const won = calculateWin(bet, winningNumber);
      await prisma.rouletteBet.update({
        where: { id: bet.id },
        data: { won, resolvedAt: new Date() },
      });

      if (won && !bet.user.isAdmin) {
        const winAmount = bet.amount * bet.payout;
        const updatedUser = await prisma.user.update({
          where: { id: bet.userId },
          data: { balance: { increment: winAmount } },
          select: { balance: true },
        });
        await prisma.transaction.create({
          data: {
            userId: bet.userId,
            type: 'WIN',
            amount: winAmount,
            description: `Roulette vincita: ${bet.betType} ${bet.betValue} → ${winningNumber}`,
          },
        });
        if (io) {
          io.to(`user:${bet.userId}`).emit('balance:updated', {
            newBalance: updatedUser.balance,
            delta: winAmount,
            type: 'WIN',
            description: `Roulette: hai vinto su ${bet.betType}!`,
          });
        }
      }
    }

    if (io) {
      io.to('roulette-room').emit('roulette:result', {
        roundId,
        winningNumber,
        results: round.bets.filter(b => !b.user?.isAdmin).map(b => ({
          userId: b.userId,
          betType: b.betType,
          betValue: b.betValue,
          amount: b.amount,
          won: calculateWin(b, winningNumber),
          payout: calculateWin(b, winningNumber) ? b.amount * b.payout : 0,
        })),
      });
    }

    // Dopo RESULT_DURATION, torna a WAITING (o avvia prossimo round se AUTO)
    setTimeout(async () => {
      const session = await prisma.rouletteSession.findUnique({ where: { id: round.sessionId } });
      if (!session || session.status === 'CLOSED') return;

      if (session.mode === 'AUTO') {
        startNewRound(session.id, io, session.autoIntervalSec);
      } else {
        await prisma.rouletteSession.update({
          where: { id: session.id },
          data: { status: 'WAITING' },
        });
        if (io) {
          io.to('roulette-room').emit('roulette:waiting', { sessionId: session.id });
        }
      }
    }, RESULT_DURATION);

  } catch (err) {
    console.error('resolveRound error:', err);
  }
}

async function startNewRound(sessionId, io, delaySec) {
  const delay = (delaySec || 30) * 1000;
  setTimeout(async () => {
    const session = await prisma.rouletteSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status === 'CLOSED') return;

    const bettingEndsAt = new Date(Date.now() + BETTING_DURATION);
    const round = await prisma.rouletteRound.create({
      data: {
        sessionId,
        status: 'BETTING',
        bettingEndsAt,
      },
    });

    await prisma.rouletteSession.update({
      where: { id: sessionId },
      data: { status: 'BETTING' },
    });

    if (io) {
      io.to('roulette-room').emit('roulette:round_started', {
        roundId: round.id,
        status: 'BETTING',
        bettingEndsAt: bettingEndsAt.toISOString(),
        timeLeft: BETTING_DURATION,
      });
    }

    setTimeout(() => startSpin(round.id, io), BETTING_DURATION);
  }, delay);
}

module.exports = router;
module.exports.startNewRound = startNewRound;
