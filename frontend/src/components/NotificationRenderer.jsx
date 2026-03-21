import { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api, { getUploadUrl } from '../utils/api';
import useSocket from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import './NotificationRenderer.css';

function NotificationBanner({ notification, onDismiss }) {
  useEffect(() => {
    if (!notification.autoClose) return;
    const timer = setTimeout(onDismiss, (notification.autoCloseSec || 5) * 1000);
    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  const imgSrc = notification.imageUrl
    ? (notification.imageUrl.startsWith('/uploads/') ? getUploadUrl(notification.imageUrl) : notification.imageUrl)
    : null;

  return (
    <motion.div
      className="notif-banner"
      role="alert"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
    >
      {imgSrc && (
        <img src={imgSrc} className="notif-banner-img" alt="" />
      )}
      <div className="notif-banner-content">
        {notification.title && (
          <p className="notif-banner-title">{notification.title}</p>
        )}
        <p className="notif-banner-message">{notification.message}</p>
      </div>
      <button className="notif-banner-close" onClick={onDismiss}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
      {notification.autoClose && (
        <div
          className="notif-banner-progress"
          style={{ animationDuration: `${notification.autoCloseSec || 5}s` }}
        />
      )}
    </motion.div>
  );
}

function NotificationModal({ notification, onDismiss }) {
  const [countdown, setCountdown] = useState(notification.autoCloseSec || 10);

  useEffect(() => {
    if (!notification.autoClose) return;
    const timer = setTimeout(onDismiss, (notification.autoCloseSec || 10) * 1000);
    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  useEffect(() => {
    if (!notification.autoClose) return;
    const interval = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [notification]);

  const imgSrc = notification.imageUrl
    ? (notification.imageUrl.startsWith('/uploads/') ? getUploadUrl(notification.imageUrl) : notification.imageUrl)
    : null;

  return (
    <motion.div
      className="notif-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="notif-modal"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        {imgSrc && (
          <div className="notif-modal-image-wrapper">
            <img src={imgSrc} className="notif-modal-image" alt="" />
          </div>
        )}
        <div className="notif-modal-body">
          <span className="notif-modal-badge">📣 Messaggio dall'Admin</span>
          {notification.title && (
            <h2 className="notif-modal-title">{notification.title}</h2>
          )}
          <p className="notif-modal-message">{notification.message}</p>
        </div>
        <div className="notif-modal-footer">
          {notification.autoClose && countdown > 0 && (
            <span className="notif-modal-timer">
              Si chiude in {countdown}s
            </span>
          )}
          <button className="btn-primary notif-modal-close-btn" onClick={onDismiss}>
            Ho capito
          </button>
        </div>
        {notification.autoClose && (
          <div
            className="notif-modal-progress"
            style={{ animationDuration: `${notification.autoCloseSec || 10}s` }}
          />
        )}
      </motion.div>
    </motion.div>
  );
}

export default function NotificationRenderer() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState([]);

  // Load pending notifications on mount
  useEffect(() => {
    if (!user) return;
    api.get('/notifications/my')
      .then(({ data }) => {
        if (data && data.length > 0) setNotifications(data);
      })
      .catch(() => {}); // silently fail
  }, [user]);

  // Listen for new notifications via WebSocket
  useEffect(() => {
    if (!socket) return;

    const handleNew = (notification) => {
      setNotifications(prev => {
        // Deduplicate
        if (prev.some(n => n.id === notification.id)) return prev;
        return [...prev, notification];
      });
    };

    socket.on('notification:new', handleNew);
    return () => socket.off('notification:new', handleNew);
  }, [socket]);

  const dismiss = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    api.put(`/notifications/${id}/dismiss`).catch(() => {});
  }, []);

  if (!user) return null;

  const banners = notifications.filter(n => n.type === 'BANNER');
  const modals = notifications.filter(n => n.type === 'MODAL');
  const currentModal = modals[0] || null;

  return ReactDOM.createPortal(
    <>
      {/* Banner stack — top right */}
      <div className="notification-banner-stack">
        <AnimatePresence>
          {banners.map(notif => (
            <NotificationBanner
              key={notif.id}
              notification={notif}
              onDismiss={() => dismiss(notif.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Modal — one at a time */}
      <AnimatePresence>
        {currentModal && (
          <NotificationModal
            key={currentModal.id}
            notification={currentModal}
            onDismiss={() => dismiss(currentModal.id)}
          />
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}
