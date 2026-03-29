import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { RED_NUMBERS } from './rouletteConstants';
import './AdminRoulette.css';

export default function AdminRoulette() {
  const { token, sync } = useAuthStore();

  const [active, setActive] = useState(false);
  const [intervalSec, setIntervalSec] = useState(20);
  const [overrideNum, setOverrideNum] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/roulette/state', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        setActive(!!data.active);
      })
      .catch(console.error);
  }, [token, sync]);

  const startSession = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await axios.post('/api/roulette/admin/start', { intervalSec }, { headers: { Authorization: `Bearer ${token}` } });
      setActive(true);
      setOverrideNum(null);
      toast.success('Sessione roulette avviata!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore');
    } finally {
      setLoading(false);
    }
  };

  const stopSession = async () => {
    if (!confirm('Chiudere la sessione roulette?')) return;
    if (!token) return;
    setLoading(true);
    try {
      await axios.post('/api/roulette/admin/stop', {}, { headers: { Authorization: `Bearer ${token}` } });
      setActive(false);
      setOverrideNum(null);
      toast.success('Sessione chiusa');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore');
    } finally {
      setLoading(false);
    }
  };

  const setOverride = async (n) => {
    const num = overrideNum === n ? -1 : n;
    if (!token) return;
    try {
      await axios.put('/api/roulette/admin/override', { number: num }, { headers: { Authorization: `Bearer ${token}` } });
      setOverrideNum(num >= 0 ? num : null);
      toast.success(num >= 0 ? `Override: ${num}` : 'Override rimosso', { duration: 1500 });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore override');
    }
  };

  const getNumColor = (n) => {
    if (n === 0) return 'green';
    return RED_NUMBERS.includes(n) ? 'red' : 'black';
  };

  return (
    <div className="admin-roulette">
      <h2>🎡 Controllo Roulette</h2>

      {!active ? (
        <div className="ar-start-panel">
          <p className="ar-desc">
            Avvia una sessione di roulette live. Tutti gli utenti potranno partecipare in tempo reale.
          </p>

          <div className="form-group">
            <label>Durata fase puntate</label>
            <div className="interval-row">
              {[15, 20, 30, 45, 60].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`interval-btn ${intervalSec === s ? 'active' : ''}`}
                  onClick={() => setIntervalSec(s)}
                >
                  {s}s
                </button>
              ))}
              <input
                type="number"
                className="input-field"
                style={{ width: 80 }}
                value={intervalSec}
                min={10}
                max={120}
                onChange={(e) => setIntervalSec(parseInt(e.target.value, 10) || 20)}
              />
            </div>
            <p className="input-hint">
              Ciclo totale: {intervalSec}s puntate + 5s last call + 8s ruota + 4s risultato ={' '}
              <strong>{intervalSec + 17}s</strong> per giro
            </p>
          </div>

          <button type="button" className="btn-primary btn-large" onClick={startSession} disabled={loading}>
            {loading ? 'Avvio...' : '▶ Avvia Sessione'}
          </button>
        </div>
      ) : (
        <div className="ar-active-panel">
          <div className="ar-status-bar">
            <span className="ar-dot" />
            <span>Sessione attiva — ciclo {intervalSec + 17}s</span>
          </div>

          <div className="ar-override-section">
            <h3>Forza numero vincente</h3>
            <p className="ar-override-hint">
              {overrideNum !== null
                ? `✓ Forzato: ${overrideNum} — clicca di nuovo per rimuovere`
                : '● Nessun override — risultato casuale'}
            </p>

            <div className="ar-number-grid">
              {Array.from({ length: 37 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`ar-num-btn color-${getNumColor(i)} ${overrideNum === i ? 'ar-selected' : ''}`}
                  onClick={() => setOverride(i)}
                  title={`Forza il ${i}`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <button type="button" className="btn-danger btn-large" onClick={stopSession} disabled={loading}>
            {loading ? 'Chiusura...' : '⏹ Chiudi Sessione'}
          </button>
        </div>
      )}
    </div>
  );
}
