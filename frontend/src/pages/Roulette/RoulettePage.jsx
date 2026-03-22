import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import api, { getUploadUrl } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import useSocket from '../../hooks/useSocket';
import { formatCurrency, formatRelativeTime } from '../../utils/format';
import RouletteWheel from './RouletteWheel';
import './Roulette.css';

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

function BettingTable({ onBet, disabled, userBalance }) {
  const [amount, setAmount] = useState(10);
  const QUICK_AMOUNTS = [5, 10, 25, 50, 100];

  const getColor = (n) => {
    if (n === 0) return 'green';
    return RED_NUMBERS.includes(n) ? 'red' : 'black';
  };

  // Build number grid rows: each row has 3 numbers (col3, col2, col1 from top)
  const rows = Array.from({ length: 12 }, (_, row) => {
    return [3, 2, 1].map(col => (11 - row) * 3 + col);
  });

  return (
    <div className="betting-table">
      <div className="bet-amount-row">
        {QUICK_AMOUNTS.map(a => (
          <button
            key={a}
            className={`amount-chip ${amount === a ? 'active' : ''}`}
            onClick={() => setAmount(a)}
            disabled={disabled}
          >
            {a}€
          </button>
        ))}
        <button
          className={`amount-chip ${amount === userBalance ? 'active' : ''}`}
          onClick={() => setAmount(userBalance || 0)}
          disabled={disabled}
        >
          MAX
        </button>
        <input
          type="number"
          className="amount-input"
          value={amount}
          onChange={e => setAmount(parseFloat(e.target.value) || 0)}
          disabled={disabled}
          min={1}
        />
      </div>

      <div className="number-grid">
        <button
          className="number-cell green zero-cell"
          onClick={() => !disabled && onBet('STRAIGHT', '0', amount)}
          disabled={disabled}
        >
          0
        </button>
        {rows.map((row) =>
          row.map(n => (
            <button
              key={n}
              className={`number-cell ${getColor(n)}`}
              onClick={() => !disabled && onBet('STRAIGHT', String(n), amount)}
              disabled={disabled}
            >
              {n}
            </button>
          ))
        )}
      </div>

      <div className="special-bets-row">
        {[['1-12', '1ª Dozzina'], ['13-24', '2ª Dozzina'], ['25-36', '3ª Dozzina']].map(([val, label]) => (
          <button key={val} className="special-bet"
            onClick={() => !disabled && onBet('DOZEN', val, amount)}
            disabled={disabled}>
            {label}
          </button>
        ))}
      </div>

      <div className="special-bets-row">
        {[['col1', 'Col 1'], ['col2', 'Col 2'], ['col3', 'Col 3']].map(([val, label]) => (
          <button key={val} className="special-bet"
            onClick={() => !disabled && onBet('COLUMN', val, amount)}
            disabled={disabled}>
            {label}
          </button>
        ))}
      </div>

      <div className="special-bets-row four-col">
        <button className="special-bet" onClick={() => !disabled && onBet('ODD_EVEN', 'even', amount)} disabled={disabled}>Pari</button>
        <button className="special-bet red-bet" onClick={() => !disabled && onBet('RED_BLACK', 'red', amount)} disabled={disabled}>Rosso</button>
        <button className="special-bet black-bet" onClick={() => !disabled && onBet('RED_BLACK', 'black', amount)} disabled={disabled}>Nero</button>
        <button className="special-bet" onClick={() => !disabled && onBet('ODD_EVEN', 'odd', amount)} disabled={disabled}>Dispari</button>
      </div>
    </div>
  );
}

export default function RoulettePage() {
  const { user, updateBalance } = useAuth();
  const { socket } = useSocket();

  const [session, setSession] = useState(null);
  const [round, setRound] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [bets, setBets] = useState([]);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [commentText, setCommentText] = useState('');

  // Carica stato attivo
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/roulette/active');
        setSession(data.session);
        setRound(data.round);
        if (data.round?.bets) setBets(data.round.bets);
        if (data.round?.comments) setComments(data.round.comments);
      } catch (err) {
        console.error('Load roulette error:', err);
      }
    };
    load();
    api.get('/roulette/history').then(r => setHistory(r.data)).catch(() => {});
  }, []);

  // Countdown timer per la fase BETTING
  useEffect(() => {
    if (!round || round.status !== 'BETTING' || !round.bettingEndsAt) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(round.bettingEndsAt) - new Date()) / 1000));
      setTimeLeft(left);
      if (left <= 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [round?.bettingEndsAt, round?.status]);

  // WebSocket listeners
  useEffect(() => {
    if (!socket) return;
    socket.emit('roulette:join');

    socket.on('roulette:session_started', ({ session }) => setSession(session));
    socket.on('roulette:session_closed', () => { setSession(null); setRound(null); });
    socket.on('roulette:round_started', ({ roundId, status, bettingEndsAt, timeLeft }) => {
      setRound({ id: roundId, status, bettingEndsAt });
      setBets([]);
      setTimeLeft(Math.floor(timeLeft / 1000));
    });
    socket.on('roulette:spinning', () => {
      setRound(prev => prev ? { ...prev, status: 'SPINNING' } : prev);
    });
    socket.on('roulette:result', ({ roundId, winningNumber, results }) => {
      setRound(prev => prev ? { ...prev, status: 'RESULT', winningNumber } : prev);
      setHistory(prev => [{ id: roundId, winningNumber, resolvedAt: new Date().toISOString() }, ...prev].slice(0, 20));
      const myResult = results?.find(r => r.userId === user?.id && r.won);
      if (myResult) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    });
    socket.on('roulette:waiting', () => {
      setRound(null);
    });
    socket.on('roulette:bet_placed', ({ bet }) => {
      setBets(prev => [...prev, bet]);
    });
    socket.on('roulette:comment', ({ comment }) => {
      setComments(prev => [...prev, comment]);
    });

    return () => {
      socket.emit('roulette:leave');
      ['roulette:session_started', 'roulette:session_closed', 'roulette:round_started',
        'roulette:spinning', 'roulette:result', 'roulette:waiting', 'roulette:bet_placed', 'roulette:comment']
        .forEach(e => socket.off(e));
    };
  }, [socket, user?.id]);

  const placeBet = async (betType, betValue, amount) => {
    if (!round || round.status !== 'BETTING') return;
    try {
      await api.post('/roulette/bet', {
        roundId: round.id, betType, betValue, amount,
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore puntata');
    }
  };

  const sendComment = async () => {
    if (!commentText.trim() || !round) return;
    try {
      await api.post('/roulette/comment', {
        roundId: round.id, text: commentText,
      });
      setCommentText('');
    } catch {
      toast.error('Errore commento');
    }
  };

  const bettingOpen = round?.status === 'BETTING' && timeLeft > 0;

  return (
    <div className="roulette-page">
      {/* Header */}
      <div className="roulette-header">
        <h1 className="display-font">Roulette Live</h1>
        <div className="roulette-meta">
          <span className={`session-status ${session?.status?.toLowerCase() || 'offline'}`}>
            {session
              ? `● ${session.status === 'BETTING' ? 'Puntate aperte' : session.status === 'SPINNING' ? 'Ruota in giro...' : session.status === 'RESULT' ? 'Risultato' : 'In attesa'}`
              : '○ Nessuna sessione'}
          </span>
          {bettingOpen && (
            <span className="betting-timer mono">{timeLeft}s</span>
          )}
        </div>
      </div>

      {/* Storico numeri */}
      <div className="roulette-history-strip">
        {history.map(r => (
          <span key={r.id} className={`history-num ${r.winningNumber === 0 ? 'green' : RED_NUMBERS.includes(r.winningNumber) ? 'red' : 'black'}`}>
            {r.winningNumber}
          </span>
        ))}
      </div>

      {/* Main layout */}
      <div className="roulette-main">
        {/* Ruota */}
        <div className="roulette-wheel-container">
          {session ? (
            <RouletteWheel
              spinning={round?.status === 'SPINNING'}
              winningNumber={round?.winningNumber}
            />
          ) : (
            <div className="roulette-offline">
              <p>Nessuna sessione attiva</p>
              <p className="text-secondary">Attendi che l'admin avvii una sessione</p>
            </div>
          )}

          {/* Risultato overlay */}
          {round?.status === 'RESULT' && round?.winningNumber !== undefined && (
            <motion.div
              className="result-overlay"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 12 }}
            >
              <span className={`result-number ${round.winningNumber === 0 ? 'green' : RED_NUMBERS.includes(round.winningNumber) ? 'red' : 'black'}`}>
                {round.winningNumber}
              </span>
            </motion.div>
          )}
        </div>

        {/* Tavolo puntate */}
        <div className="roulette-table-container">
          <BettingTable
            onBet={placeBet}
            disabled={!bettingOpen}
            userBalance={user?.balance}
          />

          {/* Ultime puntate del round */}
          <div className="round-bets">
            <h4>Puntate ({bets.length})</h4>
            <div className="bets-scroll">
              {bets.slice(-10).map(bet => (
                <div key={bet.id} className="bet-chip-row">
                  <span className="bet-chip-user">{bet.user?.displayName}</span>
                  <span className="bet-chip-type">{bet.betType} {bet.betValue}</span>
                  <span className="bet-chip-amount mono">{formatCurrency(bet.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Commenti live */}
      <div className="roulette-comments">
        <h3 className="section-title">Chat live</h3>
        <div className="comments-feed">
          {comments.map(c => (
            <div key={c.id} className="roulette-comment">
              <div className="roulette-comment-avatar">
                {c.user?.avatarUrl ? (
                  <img src={getUploadUrl(c.user.avatarUrl)} alt="" />
                ) : (
                  <div className="avatar-placeholder small">{c.user?.displayName?.[0]?.toUpperCase()}</div>
                )}
              </div>
              <div className="roulette-comment-body">
                <span className="roulette-comment-user">{c.user?.displayName}</span>
                <span className="roulette-comment-time">{formatRelativeTime(c.createdAt)}</span>
                <p>{c.text}</p>
              </div>
            </div>
          ))}
        </div>
        {round && (
          <div className="comment-input-row">
            <input
              className="input-field comment-text-input"
              placeholder="Scrivi nella chat..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendComment()}
            />
            <button className="comment-send-btn" onClick={sendComment}>Invia</button>
          </div>
        )}
      </div>
    </div>
  );
}
