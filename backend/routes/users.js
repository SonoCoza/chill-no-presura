const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

// Self-edit: upload avatar
router.post('/me/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
    const avatarUrl = await uploadToCloudinary(req.file, 'chill-no-presura/avatars');
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarUrl },
      select: { id: true, username: true, displayName: true, avatarUrl: true, balance: true, isAdmin: true },
    });
    res.json(user);
  } catch (err) {
    console.error('Upload avatar error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Self-edit: update displayName
router.put('/me', authenticate, [
  body('displayName').optional().trim().isLength({ min: 1, max: 50 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const data = {};
    if (req.body.displayName) data.displayName = req.body.displayName;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, username: true, displayName: true, avatarUrl: true, balance: true, isAdmin: true },
    });
    res.json(user);
  } catch (err) {
    console.error('Update me error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Self-edit: change password
router.put('/me/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Password attuale richiesta'),
  body('newPassword').isLength({ min: 8 }).withMessage('Minimo 8 caratteri')
    .matches(/\d/).withMessage('Deve contenere almeno un numero')
    .matches(/[a-zA-Z]/).withMessage('Deve contenere almeno una lettera'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.newPassword) throw new Error('Le password non corrispondono');
    return true;
  }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(req.body.currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Password attuale non corretta' });

    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, lastSetPassword: req.body.newPassword },
    });

    res.json({ message: 'Password aggiornata con successo' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, displayName: true, avatarUrl: true,
        balance: true, isAdmin: true, createdAt: true,
        bets: {
          orderBy: { placedAt: 'desc' },
          take: 50,
          include: {
            market: { select: { id: true, title: true, status: true } },
            option: { select: { id: true, label: true } },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    res.json(user);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const bets = await prisma.betEntry.findMany({ where: { userId } });
    const totalBets = bets.length;
    const wonBets = bets.filter(b => b.status === 'WON').length;
    const lostBets = bets.filter(b => b.status === 'LOST').length;
    const pendingBets = bets.filter(b => b.status === 'PENDING').length;
    const winRate = totalBets > 0 ? ((wonBets / (wonBets + lostBets)) * 100) || 0 : 0;

    const totalWagered = bets.reduce((sum, b) => sum + b.amount, 0);
    const totalWon = bets.filter(b => b.status === 'WON').reduce((sum, b) => sum + b.potentialWin, 0);
    const netProfit = totalWon - totalWagered;

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    let runningBalance = 0;
    const balanceHistory = transactions.map(t => {
      runningBalance += t.amount;
      return { date: t.createdAt, balance: runningBalance, type: t.type };
    });

    res.json({
      totalBets, wonBets, lostBets, pendingBets,
      winRate: Math.round(winRate * 100) / 100,
      totalWagered, totalWon, netProfit, balanceHistory,
    });
  } catch (err) {
    console.error('Get user stats error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
