import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { RED_NUMBERS } from './rouletteConstants';
import './AdminRoulette.css';

export default function AdminRoulette() {
  const { token, sync } = useAuthStore();

  const [ready, setReady] = useState(false);
  const [intervalSec, setIntervalSec] = useState(20);
  const [overrideNum, setOverrideNum] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    sync();
  }, [sync]);

  const loadState = () => {
    if (!token) return;
    axios
      .get('/api/roulette/state', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        setReady(!!data.active);
        if (data.intervalSec) setIntervalSec(data.intervalSec);
      })
      .catch(() => setReady(false));
  };

  useEffect(() => {
    loadState();
  }, [token, sync]);

  const saveInterval = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await axios.put(
        '/api/roulette/admin/interval',
        { intervalSec },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Durata puntate: ${intervalSec}s (vale dal prossimo giro)`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore salvataggio');
    } finally {
      setLoading(false);
    }
  };

  const setOverride = async (n) => {
    const num = overrideNum === n ? -1 : n;
    if (!token) return;
    try {
      await axios.put(
        '/api/roulette/admin/override',
        { number: num },
        { headers: { Authorization: `Bearer ${token}` } }
      );
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

      {!ready ? (
        <div className="ar-start-panel">
          <p className="ar-desc ar-warn">
            La roulette non risulta attiva. Avvia il backend e assicurati che il database sia aggiornato
            (<code>npx prisma db push</code> nella cartella <code>backend</code>). Serve almeno un utente nel
            DB.
          </p>
          <button type="button" className="btn-primary" onClick={loadState} disabled={!token}>
            Ricarica stato
          </button>
        </div>
      ) : (
        <div className="ar-active-panel">
          <div className="ar-status-bar">
            <span className="ar-dot" />
            <span>Roulette sempre attiva — ciclo automatico continuo</span>
          </div>

          <p className="ar-desc">
            La sessione parte automaticamente all&apos;avvio del server. Qui imposti solo la durata delle puntate e,
            se vuoi, il numero forzato.
          </p>

          <div className="form-group">
            <label>Durata fase puntate (secondi)</label>
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
              <button type="button" className="btn-primary" onClick={saveInterval} disabled={loading}>
                Salva
              </button>
            </div>
            <p className="input-hint">
              Ciclo: {intervalSec}s puntate + 5s last call + 8s ruota + 4s risultato = <strong>{intervalSec + 17}s</strong>{' '}
              per giro (dopo &quot;Salva&quot;, dal round successivo).
            </p>
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
        </div>
      )}
    </div>
  );
}
