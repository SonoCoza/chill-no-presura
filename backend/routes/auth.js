const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Troppi tentativi di login. Riprova tra 15 minuti.' },
});

function generateTokens(user) {
  const payload = {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    requiresPasswordChange: user.mustChangePass,
  };
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

router.post('/login', loginLimiter, [
  body('username').trim().notEmpty().withMessage('Username richiesto'),
  body('password').notEmpty().withMessage('Password richiesta'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'Account sospeso. Contatta l\'admin.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      // Check temp password
      if (user.tempPassword && password === user.tempPassword) {
        const tokens = generateTokens(user);
        return res.json({
          ...tokens,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isAdmin: user.isAdmin,
            balance: user.balance,
            requiresPasswordChange: user.mustChangePass,
          },
        });
      }
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const tokens = generateTokens(user);
    res.json({
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        balance: user.balance,
        requiresPasswordChange: user.mustChangePass,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.post('/change-password', authenticate, [
  body('newPassword').isLength({ min: 8 }).withMessage('Minimo 8 caratteri')
    .matches(/\d/).withMessage('Deve contenere almeno un numero'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.newPassword) throw new Error('Le password non corrispondono');
    return true;
  }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, mustChangePass: false, tempPassword: null, lastSetPassword: req.body.newPassword },
    });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const tokens = generateTokens(user);

    await prisma.activityLog.create({
      data: { userId: req.user.id, action: 'PASSWORD_CHANGED' },
    });

    res.json({
      message: 'Password aggiornata con successo',
      ...tokens,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isAdmin: user.isAdmin,
        balance: user.balance,
        requiresPasswordChange: false,
      },
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logout effettuato' });
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, username: true, displayName: true, avatarUrl: true,
        isAdmin: true, balance: true, mustChangePass: true, createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    res.json({ ...user, requiresPasswordChange: user.mustChangePass });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
