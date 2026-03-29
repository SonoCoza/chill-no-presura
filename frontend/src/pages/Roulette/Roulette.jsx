import { useState, useEffect, useRef, useCallback } from 'react';
import useSocket from '../../hooks/useSocket';
import { useAuthStore } from '../../store/authStore';
import axios from 'axios';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import RouletteWheel from './RouletteWheel';
import BettingTable from './BettingTable';
import { getNumberColor, formatMoney } from './rouletteConstants';
import { getUploadUrl } from '../../utils/api';
import './Roulette.css';

const API = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

function avatarUrl(displayName, path) {
  if (path) return getUploadUrl(path);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'U')}&background=1e1e24&color=b5ff4d&size=32`;
}

export default function RoulettePage() {
  const { currentUser: user, token, sync } = useAuthStore();
  const { socket } = useSocket();

  const [phase, setPhase] = useState('IDLE');
  const [roundId, setRoundId] = useState(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [winningNumber, setWinningNumber] = useState(null);
  const [bettingEndsAt, setBettingEndsAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [bets, setBets] = useState([]);
  const [myBets, setMyBets] = useState([]);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [active, setActive] = useState(false);
  const [commentText, setCommentText] = useState('');

  const chatRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    if (!token) return;
    axios
      .get('/api/roulette/state', API(token))
      .then(({ data }) => {
        if (!data.active) return;
        setActive(true);
        setPhase(data.phase);
        setRoundId(data.roundId);
        setRoundNumber(data.roundNumber);
        setBets(data.bets || []);
        setComments(data.comments || []);
        setHistory(data.history || []);
        if (data.bettingEndsAt) setBettingEndsAt(new Date(data.bettingEndsAt));
        if (data.timeLeftSec > 0) setTimeLeft(data.timeLeftSec);
        const uid = useAuthStore.getState().currentUser?.id;
        if (uid) setMyBets((data.bets || []).filter((b) => b.userId === uid));
      })
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!['BETTING', 'LAST_CALL'].includes(phase) || !bettingEndsAt) return;

    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((bettingEndsAt.getTime() - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) clearInterval(timerRef.current);
    }, 200);

    return () => clearInterval(timerRef.current);
  }, [phase, bettingEndsAt]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [comments]);

  const placeBet = useCallback(
    async (betType, betValue, amount) => {
      if (!['BETTING', 'LAST_CALL'].includes(phase)) {
        toast.error('Le puntate sono chiuse');
        return;
      }
      const t = useAuthStore.getState().token;
      if (!t) return;
      try {
        await axios.post('/api/roulette/bet', { betType, betValue, amount }, API(t));
        setMyBets((prev) => [...prev, { betType, betValue, amount }]);
        toast.success(`✓ Puntata: ${betValue} — ${formatMoney(amount)}`, {
          duration: 1500,
          style: {
            background: '#0d1a06',
            border: '1px solid #b5ff4d',
            color: '#b5ff4d',
            fontSize: '13px',
          },
        });
      } catch (err) {
        toast.error(err.response?.data?.error || 'Errore puntata');
      }
    },
    [phase]
  );

  useEffect(() => {
    if (!socket) return;
    socket.emit('roulette:join');

    const onSessionStarted = () => setActive(true);

    const onSessionClosed = () => {
      setActive(false);
      setPhase('IDLE');
      setRoundId(null);
      setBets([]);
      setMyBets([]);
      setComments([]);
      setWinningNumber(null);
      setBettingEndsAt(null);
    };

    const onPhase = (data) => {
      setPhase(data.phase);

      if (data.phase === 'BETTING') {
        setRoundId(data.roundId);
        setRoundNumber(data.roundNumber);
        setBets([]);
        setMyBets([]);
        setWinningNumber(null);
        setComments([]);
        const endsAt = new Date(data.bettingEndsAt);
        setBettingEndsAt(endsAt);
        setTimeLeft(Math.ceil(data.totalMs / 1000));
      }

      if (data.phase === 'LAST_CALL') {
        setTimeLeft(Math.ceil(data.totalMs / 1000));
      }

      if (data.phase === 'SPINNING') {
        setTimeLeft(0);
        if (data.winningNumber !== undefined) setWinningNumber(data.winningNumber);
      }

      if (data.phase === 'RESULT') {
        setWinningNumber(data.winningNumber);
        setHistory((prev) =>
          [
            {
              id: data.roundId,
              winningNumber: data.winningNumber,
              roundNumber: data.roundNumber ?? 0,
            },
            ...prev,
          ].slice(0, 20)
        );

        const uid = useAuthStore.getState().currentUser?.id;
        const myResult = (data.results || []).find((r) => r.userId === uid);
        if (myResult?.won) {
          confetti({
            particleCount: 160,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#b5ff4d', '#ffd700', '#ffffff', '#ff9500'],
          });
          toast.success(`🎉 HAI VINTO ${formatMoney(myResult.winAmount)}!`, {
            duration: 5000,
            style: {
              background: '#1a2a0a',
              border: '1px solid #b5ff4d',
              color: '#b5ff4d',
              fontWeight: 700,
              fontSize: '16px',
            },
          });
        } else if (myResult && !myResult.won) {
          toast('😤 Prossima volta!', {
            duration: 2000,
            style: { background: '#1a0a0a', border: '1px solid #ff3b3b', color: '#ff6b6b' },
          });
        }
      }
    };

    const onBetPlaced = ({ bet }) => {
      setBets((prev) => {
        const idx = prev.findIndex(
          (b) => b.userId === bet.userId && b.betType === bet.betType && b.betValue === bet.betValue
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], amount: next[idx].amount + bet.amount };
          return next;
        }
        return [...prev, bet];
      });
    };

    const onComment = ({ comment }) => {
      setComments((prev) => [...prev, comment]);
    };

    socket.on('roulette:session_started', onSessionStarted);
    socket.on('roulette:session_closed', onSessionClosed);
    socket.on('roulette:phase', onPhase);
    socket.on('roulette:bet_placed', onBetPlaced);
    socket.on('roulette:comment', onComment);

    return () => {
      socket.emit('roulette:leave');
      socket.off('roulette:session_started', onSessionStarted);
      socket.off('roulette:session_closed', onSessionClosed);
      socket.off('roulette:phase', onPhase);
      socket.off('roulette:bet_placed', onBetPlaced);
      socket.off('roulette:comment', onComment);
    };
  }, [socket]);

  const sendComment = async () => {
    if (!commentText.trim() || !roundId) return;
    const t = useAuthStore.getState().token;
    if (!t) return;
    try {
      await axios.post('/api/roulette/comment', { text: commentText }, API(t));
      setCommentText('');
    } catch {
      toast.error('Errore commento');
    }
  };

  const bettingOpen = ['BETTING', 'LAST_CALL'].includes(phase);

  const players = Object.values(
    bets.reduce((acc, b) => {
      if (!acc[b.userId]) {
        acc[b.userId] = {
          userId: b.userId,
          user: b.user,
          total: 0,
          betCount: 0,
        };
      }
      acc[b.userId].total += b.amount;
      acc[b.userId].betCount += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.total - a.total);

  const phaseConfig = {
    IDLE: { label: '● In attesa', class: 'idle' },
    BETTING: { label: '● Puntate aperte', class: 'betting' },
    LAST_CALL: { label: '⚡ Last Call!', class: 'last-call' },
    SPINNING: { label: '🎡 In rotazione...', class: 'spinning' },
    RESULT: { label: '✓ Risultato', class: 'result' },
  };
  const pc = phaseConfig[phase] || phaseConfig.IDLE;

  return (
    <div className="roulette-page">
      <div className="rl-header">
        <div className="rl-title-group">
          <h1 className="rl-title">Roulette Live</h1>
          {roundNumber > 0 && <span className="rl-round-badge">Round #{roundNumber}</span>}
        </div>
        <div className="rl-status-group">
          <span className={`rl-phase-pill phase-${pc.class}`}>{pc.label}</span>
          {bettingOpen && timeLeft > 0 && (
            <span className={`rl-timer ${phase === 'LAST_CALL' ? 'timer-urgent' : ''}`}>{timeLeft}s</span>
          )}
        </div>
      </div>

      {players.length > 0 && (
        <div className="rl-players-strip">
          <span className="strip-label">In gioco</span>
          <div className="players-list">
            {players.map((p) => (
              <div key={p.userId} className="player-chip">
                <img src={avatarUrl(p.user?.displayName, p.user?.avatarUrl)} alt="" className="player-av" />
                <div className="player-info">
                  <span className="player-name">{p.user?.displayName || 'Anonimo'}</span>
                  <span className="player-total">{formatMoney(p.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rl-history">
        <span className="history-label">Ultimi numeri</span>
        <div className="history-balls">
          {history.map((h, i) => (
            <span
              key={h.id || i}
              className={`h-ball color-${getNumberColor(h.winningNumber)}`}
              style={{ opacity: Math.max(0.3, 1 - i * 0.04) }}
            >
              {h.winningNumber}
            </span>
          ))}
          {history.length === 0 && <span className="history-empty">Nessun risultato ancora</span>}
        </div>
      </div>

      <div className="rl-body">
        <div className="rl-wheel-col">
          <div className={`wheel-glow-wrap glow-${phase.toLowerCase()}`}>
            {active ? (
              <RouletteWheel phase={phase} winningNumber={winningNumber} spinDurationMs={7500} />
            ) : (
              <div className="wheel-placeholder">
                <div className="wheel-placeholder-icon">🎡</div>
                <p>Nessuna sessione</p>
                <p className="wp-sub">Controlla che il server sia avviato e il DB aggiornato (prisma db push)</p>
              </div>
            )}
          </div>

          {phase === 'RESULT' && winningNumber !== null && (
            <div className={`winning-display color-${getNumberColor(winningNumber)}`}>
              <span className="wd-number">{winningNumber}</span>
              <span className="wd-label">
                {getNumberColor(winningNumber) === 'green'
                  ? '● Verde'
                  : getNumberColor(winningNumber) === 'red'
                    ? '● Rosso'
                    : '● Nero'}
                {winningNumber !== 0 && (winningNumber % 2 === 0 ? ' · Pari' : ' · Dispari')}
              </span>
            </div>
          )}
        </div>

        <div className="rl-table-col">
          <BettingTable
            onBet={placeBet}
            disabled={!bettingOpen}
            bets={bets}
            myBets={myBets}
            balance={user?.isAdmin ? 1e9 : user?.balance || 0}
          />

          {myBets.length > 0 && (
            <div className="my-bets-box">
              <span className="my-bets-title">Le tue puntate ({myBets.length})</span>
              <div className="my-bets-tags">
                {myBets.map((b, i) => (
                  <span key={i} className="my-bet-tag">
                    {b.betType === 'STRAIGHT' ? `#${b.betValue}` : b.betValue} · {formatMoney(b.amount)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rl-chat">
        <div className="chat-header">
          <span className="chat-title">Chat Live</span>
          <span className="chat-count">{comments.length} messaggi</span>
        </div>
        <div className="chat-messages" ref={chatRef}>
          {comments.length === 0 && <p className="chat-empty">Nessun messaggio — scrivi qualcosa!</p>}
          {comments.map((c) => (
            <div key={c.id} className="chat-msg">
              <img
                src={avatarUrl(c.user?.displayName, c.user?.avatarUrl)}
                alt=""
                className="chat-av"
              />
              <div className="chat-body">
                <span className="chat-user">{c.user?.displayName}</span>
                {c.text && <p className="chat-text">{c.text}</p>}
                {c.imageUrl && <img src={getUploadUrl(c.imageUrl)} alt="" className="chat-img" />}
              </div>
            </div>
          ))}
        </div>
        {roundId && (
          <div className="chat-input-row">
            <input
              className="input-field"
              placeholder="Scrivi nella chat..."
              value={commentText}
              maxLength={200}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendComment()}
            />
            <button type="button" className="btn-chat-send" onClick={sendComment}>
              ➤
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
