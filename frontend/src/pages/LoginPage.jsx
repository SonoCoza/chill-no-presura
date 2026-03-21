import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import LoginBackground from '../components/LoginBackground';
import api from '../utils/api';
import { formatCurrency } from '../utils/format';
import './LoginPage.css';

function LoginStat({ icon, label, value }) {
  return (
    <div className="login-stat">
      <span className="login-stat-icon">{icon}</span>
      <div className="login-stat-text">
        <span className="login-stat-label">{label}</span>
        <span className="login-stat-value mono">{value}</span>
      </div>
    </div>
  );
}

function StatsBar() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/stats').then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  if (!stats) return null;

  return (
    <motion.div
      className="login-stats"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <LoginStat icon="🏆" label="Mercati risolti" value={stats.resolvedMarkets} />
      <LoginStat icon="💸" label="In gioco" value={formatCurrency(stats.totalPool)} />
      <LoginStat icon="👥" label="Profeti attivi" value={stats.activeUsers} />
    </motion.div>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(username, password);
      if (data.user.requiresPasswordChange) {
        navigate('/change-password');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Errore di connessione');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Left panel — animated canvas */}
      <div className="login-left">
        <LoginBackground />
        <div className="login-left-content">
          <motion.div
            className="login-logo"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <circle cx="36" cy="36" r="34" stroke="#b5ff4d" strokeWidth="2.5"/>
              <circle cx="36" cy="36" r="28" fill="rgba(181,255,77,0.08)"/>
              <text x="36" y="44" textAnchor="middle" fontSize="28" fontWeight="800"
                fontFamily="'Cabinet Grotesk', sans-serif" fill="#b5ff4d">C</text>
            </svg>
          </motion.div>

          <motion.h1
            className="login-brand"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <span style={{ color: '#e8e8f0' }}>Chill </span>
            <span style={{ color: '#b5ff4d' }}>No Presura</span>
          </motion.h1>

          <motion.p
            className="login-tagline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            I pronostici del gruppo.<br/>Niente scuse.
          </motion.p>

          <StatsBar />
        </div>
      </div>

      {/* Right panel — form */}
      <div className="login-right">
        <motion.div
          className={`login-form-container ${shaking ? 'shake' : ''}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Mobile logo */}
          <div className="login-mobile-logo">
            <svg width="48" height="48" viewBox="0 0 72 72" fill="none">
              <circle cx="36" cy="36" r="34" stroke="#b5ff4d" strokeWidth="2.5"/>
              <text x="36" y="44" textAnchor="middle" fontSize="28" fontWeight="800"
                fontFamily="'Cabinet Grotesk', sans-serif" fill="#b5ff4d">C</text>
            </svg>
            <span className="login-mobile-brand">
              <span style={{ color: '#e8e8f0' }}>Chill </span>
              <span style={{ color: '#b5ff4d' }}>No Presura</span>
            </span>
          </div>

          <h2 className="login-form-title display-font">Bentornato</h2>
          <p className="login-form-subtitle">Accedi al tuo account</p>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <motion.div
                className="login-error"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                {error}
              </motion.div>
            )}

            <div className="login-input-group">
              <label htmlFor="username">Username</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <input
                  id="username"
                  className="login-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Il tuo username"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="login-input-group">
              <label htmlFor="password">Password</label>
              <div className="login-input-wrap">
                <svg className="login-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="password"
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="La tua password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <span className="btn-loading">Accesso in corso...</span>
              ) : (
                'Accedi'
              )}
            </button>
          </form>

          <p className="login-footer">Solo su invito dell'admin</p>
        </motion.div>
      </div>
    </div>
  );
}
