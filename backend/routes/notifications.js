const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get my notifications (unread/undismissed)
router.get('/my', authenticate, async (req, res) => {
  try {
    const recipients = await prisma.notificationRecipient.findMany({
      where: {
        userId: req.user.id,
        dismissedAt: null,
      },
      orderBy: { notification: { createdAt: 'desc' } },
      take: 20,
      include: {
        notification: true,
      },
    });

    const notifications = recipients.map(r => ({
      id: r.notification.id,
      recipientId: r.id,
      type: r.notification.type,
      title: r.notification.title,
      message: r.notification.message,
      imageUrl: r.notification.imageUrl,
      autoClose: r.notification.autoClose,
      autoCloseSec: r.notification.autoCloseSec,
      createdAt: r.notification.createdAt,
    }));

    res.json(notifications);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Dismiss a notification
router.put('/:id/dismiss', authenticate, async (req, res) => {
  try {
    const notifId = parseInt(req.params.id);

    // Find the recipient record for this user and notification
    const recipient = await prisma.notificationRecipient.findFirst({
      where: {
        notificationId: notifId,
        userId: req.user.id,
      },
    });

    if (!recipient) return res.status(404).json({ error: 'Notifica non trovata' });

    await prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: { dismissedAt: new Date(), readAt: new Date() },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Dismiss notification error:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

module.exports = router;
