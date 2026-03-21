const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToCloudinary } = require('../middleware/upload');

const router = express.Router();
const prisma = new PrismaClient();

router.get('/:marketId', authenticate, async (req, res) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { marketId: parseInt(req.params.marketId) },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    res.json(comments);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.post('/', authenticate, upload.single('image'), [
  body('marketId').isInt().withMessage('Market ID richiesto'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { marketId, text, gifUrl } = req.body;
    const imageUrl = req.file ? await uploadToCloudinary(req.file, 'chill-no-presura/comments') : null;

    if (!text && !imageUrl && !gifUrl) {
      return res.status(400).json({ error: 'Testo, immagine o GIF richiesti' });
    }

    const comment = await prisma.comment.create({
      data: {
        marketId: parseInt(marketId),
        userId: req.user.id,
        text: text || null,
        imageUrl,
        gifUrl: gifUrl || null,
      },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    // Socket emission
    const io = req.app.get('io');
    if (io) {
      io.to(`market:${parseInt(marketId)}`).emit('comment:new', { comment });
    }

    res.status(201).json(comment);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const comment = await prisma.comment.findUnique({
      where: { id: parseInt(req.params.id) },
      select: { id: true, marketId: true, imageUrl: true, userId: true },
    });

    if (!comment) return res.status(404).json({ error: 'Commento non trovato' });
    if (comment.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }

    // Cloudinary images are managed externally — no local file cleanup needed
    await prisma.comment.delete({ where: { id: comment.id } });

    // Notify via WebSocket
    const io = req.io || req.app.get('io');
    if (io) {
      io.to(`market:${comment.marketId}`).emit('comment:deleted', { commentId: comment.id });
    }

    res.json({ message: 'Commento eliminato' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
