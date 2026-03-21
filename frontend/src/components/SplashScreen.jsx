import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from './Logo';

export default function SplashScreen({ onComplete }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 400);
    }, 1200);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="splash-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: '#0d0d0f',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <Logo size={64} />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            style={{ display: 'flex', gap: 6 }}
          >
            <span style={{ color: '#e8e8f0', fontWeight: 700, fontSize: 24, fontFamily: "'Cabinet Grotesk', sans-serif" }}>Chill</span>
            <span style={{ color: '#b5ff4d', fontWeight: 700, fontSize: 24, fontFamily: "'Cabinet Grotesk', sans-serif" }}>No Presura</span>
          </motion.div>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 120 }}
            transition={{ delay: 0.4, duration: 0.8, ease: 'easeInOut' }}
            style={{
              height: 2,
              background: 'linear-gradient(90deg, transparent, #b5ff4d, transparent)',
              borderRadius: 1,
              marginTop: 12,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
