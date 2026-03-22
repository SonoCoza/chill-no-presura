import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/format';
import useSocket from '../hooks/useSocket';
import OnlineBadge from './ui/OnlineBadge';
import Logo from './Logo';
import { useState, useEffect, useRef } from 'react';
import './Layout.css';

function AnimatedBalance({ value, isAdmin }) {
  const [display, setDisplay] = useState(value);
  const [delta, setDelta] = useState(null);
  const prevValue = useRef(value);

  useEffect(() => {
    if (isAdmin) return; // Admin shows ∞, no animation needed
    if (prevValue.current !== value) {
      const diff = value - prevValue.current;
      setDelta(diff);
      const steps = 20;
      const increment = (value - prevValue.current) / steps;
      let current = prevValue.current;
      let step = 0;
      const interval = setInterval(() => {
        step++;
        current += increment;
        if (step >= steps) {
          current = value;
          clearInterval(interval);
          setTimeout(() => setDelta(null), 1000);
        }
        setDisplay(current);
      }, 30);
      prevValue.current = value;
      return () => clearInterval(interval);
    }
  }, [value, isAdmin]);

  return (
    <div className="balance-display">
      <div className="balance-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="var(--accent-green)" strokeWidth="1.5" />
          <text x="10" y="14" textAnchor="middle" fill="var(--accent-green)" fontSize="11" fontWeight="700">€</text>
        </svg>
      </div>
      {isAdmin ? (
        <span className="balance-amount mono infinite">∞</span>
      ) : (
        <>
          <span className="balance-amount mono">{formatCurrency(display)}</span>
          {delta !== null && (
            <motion.span
              className={`balance-delta ${delta >= 0 ? 'positive' : 'negative'}`}
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -20 }}
              transition={{ duration: 1 }}
            >
              {delta >= 0 ? '+' : ''}{formatCurrency(delta)}
            </motion.span>
          )}
        </>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout, updateBalance } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Socket.IO balance listener
  useEffect(() => {
    if (!socket) return;

    const handleBalanceUpdate = ({ newBalance }) => {
      if (updateBalance && newBalance !== undefined) updateBalance(newBalance);
    };

    socket.on('balance:updated', handleBalanceUpdate);
    return () => socket.off('balance:updated', handleBalanceUpdate);
  }, [socket, updateBalance]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const navItems = [
    { path: '/', label: 'Home', icon: '🏠' },
    { path: '/roulette', label: 'Roulette', icon: '🎡' },
    { path: '/leaderboard', label: 'Classifica', icon: '🏆' },
    { path: `/profile/${user?.id}`, label: 'Profilo', icon: '👤' },
  ];

  if (user?.isAdmin) {
    navItems.push({ path: '/admin', label: 'Admin', icon: '⚙️' });
  }

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="header-logo-link">
            <Logo size={32} />
            <span className="logo-text-group">
              <span className="logo-text">Chill</span>
              <span className="logo-accent">No Presura</span>
            </span>
          </Link>

          <nav className="nav desktop-nav">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="header-right">
            <AnimatedBalance value={user?.balance || 0} isAdmin={user?.isAdmin} />
            <div className="user-menu desktop-only">
              <button className="user-avatar-btn avatar-wrapper" onClick={() => navigate(`/profile/${user?.id}`)}>
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="avatar-img" />
                ) : (
                  <div className="avatar-placeholder">{user?.displayName?.[0]?.toUpperCase() || '?'}</div>
                )}
                <OnlineBadge userId={user?.id} size="sm" />
              </button>
              <button className="logout-btn" onClick={logout}>Esci</button>
            </div>

            {/* Hamburger - mobile only */}
            <button
              className={`hamburger ${menuOpen ? 'open' : ''}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.nav
              className="mobile-drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="drawer-user">
                <button className="user-avatar-btn" onClick={() => navigate(`/profile/${user?.id}`)}>
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="avatar-img" />
                  ) : (
                    <div className="avatar-placeholder">{user?.displayName?.[0]?.toUpperCase() || '?'}</div>
                  )}
                </button>
                <div>
                  <div className="drawer-username">{user?.displayName || user?.username}</div>
                  <div className="drawer-balance mono">{user?.isAdmin ? '∞' : formatCurrency(user?.balance || 0)}</div>
                </div>
              </div>

              <div className="drawer-links">
                {navItems.map(item => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`drawer-link ${location.pathname === item.path ? 'active' : ''}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="drawer-link-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>

              <button className="drawer-logout" onClick={() => { logout(); setMenuOpen(false); }}>
                Esci
              </button>
            </motion.nav>
          </>
        )}
      </AnimatePresence>

      <main className="main-content">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
