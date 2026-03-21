import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export default function ChangePasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { changePassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('La password deve avere almeno 8 caratteri');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError('La password deve contenere almeno un numero');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le password non corrispondono');
      return;
    }

    setLoading(true);
    try {
      await changePassword(newPassword, confirmPassword);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.errors?.[0]?.msg || err.response?.data?.error || 'Errore');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="login-logo">
          <span className="login-logo-accent">Cambio Password</span>
        </div>
        <p className="login-subtitle">Imposta una nuova password per il tuo account</p>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <motion.div className="login-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {error}
            </motion.div>
          )}

          <div className="form-group">
            <label htmlFor="newPassword">Nuova Password</label>
            <input
              id="newPassword"
              className="input-field"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimo 8 caratteri, almeno un numero"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Conferma Password</label>
            <input
              id="confirmPassword"
              className="input-field"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ripeti la password"
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Salvataggio...' : 'Cambia Password'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
