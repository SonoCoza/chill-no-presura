import { useState, useEffect, useRef, useCallback } from 'react';
import useSocket from '../../hooks/useSocket';
import { useAuth } from '../../context/AuthContext';
import api, { getUploadUrl } from '../../utils/api';
import { formatCurrency } from '../../utils/format';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import './Roulette.css';

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const SPIN_MS = 8000;

function getNumberColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.includes(n) ? 'red' : 'black';
}

function formatCompact(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function avatarSrc(displayName, avatarUrl) {
  if (avatarUrl) return getUploadUrl(avatarUrl);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || '?')}&background=1e1e24&color=b5ff4d`;
}

function RouletteWheel({ phase, winningNumber, spinDuration }) {
  const canvasRef = useRef(null);
  const rotRef = useRef(0);
  const animRef = useRef(null);
  const spinningRef = useRef(false);

  const draw = useCallback(
    (rot) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) / 2 - 12;
      const n = WHEEL_ORDER.length;
      const sliceAngle = (2 * Math.PI) / n;

      ctx.clearRect(0, 0, W, H);

      ctx.beginPath();
      ctx.arc(cx, cy, R + 10, 0, 2 * Math.PI);
      const goldGrad = ctx.createRadialGradient(cx, cy, R + 2, cx, cy, R + 10);
      goldGrad.addColorStop(0, '#b8860b');
      goldGrad.addColorStop(0.5, '#ffd700');
      goldGrad.addColorStop(1, '#b8860b');
      ctx.fillStyle = goldGrad;
      ctx.fill();

      WHEEL_ORDER.forEach((num, i) => {
        const start = rot + i * sliceAngle - Math.PI / 2;
        const end = start + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, start, end);
        ctx.closePath();

        if (num === 0) ctx.fillStyle = '#0d5c2e';
        else if (RED_NUMBERS.includes(num)) ctx.fillStyle = '#8b1c1c';
        else ctx.fillStyle = '#111111';
        ctx.fill();

        ctx.strokeStyle = 'rgba(212,175,55,0.35)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        const mid = start + sliceAngle / 2;
        const tr = R * 0.8;
        ctx.save();
        ctx.translate(cx + tr * Math.cos(mid), cy + tr * Math.sin(mid));
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(10, R * 0.055)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(num), 0, 0);
        ctx.restore();
      });

      const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.13);
      cGrad.addColorStop(0, '#ffd700');
      cGrad.addColorStop(1, '#7a5c00');
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.13, 0, 2 * Math.PI);
      ctx.fillStyle = cGrad;
      ctx.fill();

      WHEEL_ORDER.forEach((_, i) => {
        const angle = rot + i * sliceAngle - Math.PI / 2;
        const r1 = R * 0.93;
        const r2 = R + 2;
        ctx.beginPath();
        ctx.moveTo(cx + r1 * Math.cos(angle), cy + r1 * Math.sin(angle));
        ctx.lineTo(cx + r2 * Math.cos(angle), cy + r2 * Math.sin(angle));
        ctx.strokeStyle = 'rgba(212,175,55,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      if (phase === 'RESULT' && winningNumber !== null && winningNumber !== undefined) {
        const winIdx = WHEEL_ORDER.indexOf(winningNumber);
        if (winIdx >= 0) {
          const ballAngle = rot + winIdx * sliceAngle - Math.PI / 2 + sliceAngle / 2;
          const br = R * 0.87;
          const bx = cx + br * Math.cos(ballAngle);
          const by = cy + br * Math.sin(ballAngle);
          ctx.beginPath();
          ctx.arc(bx, by, R * 0.038, 0, 2 * Math.PI);
          const bGrad = ctx.createRadialGradient(bx - R * 0.01, by - R * 0.01, 0, bx, by, R * 0.038);
          bGrad.addColorStop(0, '#ffffff');
          bGrad.addColorStop(1, '#cccccc');
          ctx.fillStyle = bGrad;
          ctx.shadowColor = 'rgba(255,255,255,0.9)';
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      ctx.beginPath();
      ctx.moveTo(cx, cy - R - 8);
      ctx.lineTo(cx - 7, cy - R + 8);
      ctx.lineTo(cx + 7, cy - R + 8);
      ctx.closePath();
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = 'rgba(255,215,0,0.6)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    },
    [phase, winningNumber]
  );

  useEffect(() => {
    if (phase !== 'SPINNING') {
      cancelAnimationFrame(animRef.current);
      spinningRef.current = false;
      draw(rotRef.current);
      return;
    }

    spinningRef.current = true;
    const startTime = performance.now();
    const startRot = rotRef.current;

    let targetRot = null;
    if (winningNumber !== null && winningNumber !== undefined) {
      const winIdx = WHEEL_ORDER.indexOf(winningNumber);
      const sliceAngle = (2 * Math.PI) / WHEEL_ORDER.length;
      targetRot = startRot + 8 * 2 * Math.PI + (WHEEL_ORDER.length - winIdx) * sliceAngle;
    }

    const animate = (now) => {
      if (!spinningRef.current) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / (spinDuration || SPIN_MS), 1);

      let rot;
      if (targetRot !== null) {
        const eased = easeInOutQuart(progress);
        rot = startRot + (targetRot - startRot) * eased;
      } else {
        rot = startRot + progress * 25 * (1 - Math.pow(1 - progress, 3));
      }

      rotRef.current = rot;
      draw(rot);

      if (progress < 1) animRef.current = requestAnimationFrame(animate);
      else spinningRef.current = false;
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animRef.current);
      spinningRef.current = false;
    };
  }, [phase, spinDuration, draw, winningNumber]);

  useEffect(() => {
    draw(rotRef.current);
  }, [draw]);

  return (
    <div
      className={`wheel-wrapper ${phase === 'SPINNING' ? 'spinning-glow' : ''} ${phase === 'RESULT' ? 'result-glow' : ''}`}
    >
      <canvas ref={canvasRef} width={460} height={460} className="roulette-canvas" />
    </div>
  );
}

function easeInOutQuart(t) {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

export default function RoulettePage() {
  const { user: currentUser } = useAuth();
  const socket = useSocket();

  const [phase, setPhase] = useState('WAITING');
  const [roundId, setRoundId] = useState(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [winningNumber, setWinningNumber] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [bettingEndsAt, setBettingEndsAt] = useState(null);
  const [bets, setBets] = useState([]);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [myBets, setMyBets] = useState([]);

  const chatRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/roulette/state');
        if (data.active) {
          setSessionActive(true);
          setHistory(data.history || []);
          if (data.round) {
            setRoundId(data.round.id);
            setRoundNumber(data.round.roundNumber);
            setPhase(data.round.phase);
            setBets(data.round.bets || []);
            setComments(data.round.comments || []);
            if (currentUser?.id) {
              setMyBets((data.round.bets || []).filter((b) => b.userId === currentUser.id));
            }
            if (data.round.bettingEndsAt) {
              setBettingEndsAt(data.round.bettingEndsAt);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!['BETTING', 'LAST_CALL'].includes(phase) || !bettingEndsAt) {
      return undefined;
    }
    const tick = () => {
      const s = Math.max(0, Math.floor((new Date(bettingEndsAt) - new Date()) / 1000));
      setTimeLeft(s);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, roundId, bettingEndsAt]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [comments]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('roulette:join');

    const onSessionStarted = () => {
      setSessionActive(true);
    };
    const onSessionClosed = () => {
      setSessionActive(false);
      setPhase('WAITING');
      setRoundId(null);
      setBettingEndsAt(null);
      setBets([]);
      setMyBets([]);
    };
    const onRoundStarted = ({ roundId: rid, roundNumber: rn, bettingEndsAt: endAt }) => {
      setRoundId(rid);
      setRoundNumber(rn);
      setPhase('BETTING');
      setBets([]);
      setMyBets([]);
      setWinningNumber(null);
      if (endAt) setBettingEndsAt(endAt);
    };
    const onLastCall = ({ timeLeft: tl }) => {
      setPhase('LAST_CALL');
      if (tl != null) {
        const ends = new Date(Date.now() + tl * 1000);
        setBettingEndsAt(ends.toISOString());
      }
    };
    const onSpinning = () => {
      setPhase('SPINNING');
      setBettingEndsAt(null);
      setTimeLeft(0);
    };
    const onResult = ({ winningNumber: wn, results, roundNumber: resRoundNum }) => {
      setPhase('RESULT');
      setWinningNumber(wn);
      setHistory((prev) =>
        [{ id: Date.now(), winningNumber: wn, roundNumber: resRoundNum ?? 0 }, ...prev].slice(0, 20)
      );

      const myResult = results?.find((r) => r.userId === currentUser?.id);
      if (myResult?.won) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#b5ff4d', '#ffd700', '#ffffff'],
        });
        toast.success(`🎉 Hai vinto ${formatCurrency(myResult.payout)}!`, { duration: 4000 });
      } else if (myResult && !myResult.won) {
        toast.error('Prossima volta!', { duration: 2000 });
      }
    };
    const onBetPlaced = ({ bet }) => {
      setBets((prev) => {
        const existing = prev.findIndex(
          (b) => b.userId === bet.userId && b.betType === bet.betType && b.betValue === bet.betValue
        );
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], amount: updated[existing].amount + bet.amount };
          return updated;
        }
        return [...prev, bet];
      });
    };
    const onComment = ({ comment }) => {
      setComments((prev) => [...prev, comment]);
    };

    socket.on('roulette:session_started', onSessionStarted);
    socket.on('roulette:session_closed', onSessionClosed);
    socket.on('roulette:round_started', onRoundStarted);
    socket.on('roulette:last_call', onLastCall);
    socket.on('roulette:spinning', onSpinning);
    socket.on('roulette:result', onResult);
    socket.on('roulette:bet_placed', onBetPlaced);
    socket.on('roulette:comment', onComment);

    return () => {
      socket.emit('roulette:leave');
      socket.off('roulette:session_started', onSessionStarted);
      socket.off('roulette:session_closed', onSessionClosed);
      socket.off('roulette:round_started', onRoundStarted);
      socket.off('roulette:last_call', onLastCall);
      socket.off('roulette:spinning', onSpinning);
      socket.off('roulette:result', onResult);
      socket.off('roulette:bet_placed', onBetPlaced);
      socket.off('roulette:comment', onComment);
    };
  }, [socket, currentUser?.id]);

  const placeBet = async (betType, betValue) => {
    if (!['BETTING', 'LAST_CALL'].includes(phase)) {
      toast.error('Le puntate sono chiuse');
      return;
    }
    try {
      await api.post('/roulette/bet', { betType, betValue, amount: selectedAmount });
      setMyBets((prev) => [...prev, { betType, betValue, amount: selectedAmount }]);
      toast.success(`Puntata: ${betType} ${betValue} — ${formatCurrency(selectedAmount)}`, { duration: 1500 });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore');
    }
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    try {
      await api.post('/roulette/comment', { text: commentText });
      setCommentText('');
    } catch {
      toast.error('Errore commento');
    }
  };

  const players = Object.values(
    bets.reduce((acc, bet) => {
      if (!acc[bet.userId]) acc[bet.userId] = { ...bet.user, userId: bet.userId, total: 0 };
      acc[bet.userId].total += bet.amount;
      return acc;
    }, {})
  );

  const bettingOpen = ['BETTING', 'LAST_CALL'].includes(phase);

  const phaseLabel =
    {
      WAITING: '● In attesa',
      BETTING: '● Puntate aperte',
      LAST_CALL: '⚡ Last call!',
      SPINNING: '🎡 Rotazione...',
      RESULT: '✓ Risultato',
    }[phase] || '';

  return (
    <div className="roulette-page">
      <div className="roulette-header">
        <div className="roulette-title-row">
          <h1>Roulette Live</h1>
          {roundNumber > 0 && <span className="round-badge">Round #{roundNumber}</span>}
        </div>
        <div className="roulette-status-row">
          <span className={`phase-pill phase-${phase.toLowerCase()}`}>{phaseLabel}</span>
          {bettingOpen && timeLeft > 0 && (
            <span className={`countdown ${phase === 'LAST_CALL' ? 'urgent' : ''}`}>{timeLeft}s</span>
          )}
        </div>
      </div>

      {players.length > 0 && (
        <div className="players-strip">
          {players.map((p) => (
            <div key={p.userId} className="player-chip">
              <img src={avatarSrc(p.displayName, p.avatarUrl)} className="player-avatar" alt="" />
              <div className="player-info">
                <span className="player-name">{p.displayName}</span>
                <span className="player-total">{formatCurrency(p.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="history-strip">
        <span className="history-label">Ultimi risultati</span>
        <div className="history-numbers">
          {history.map((h, i) => (
            <span
              key={h.id || i}
              className={`hist-ball ${getNumberColor(h.winningNumber)}`}
              style={{ opacity: 1 - i * 0.04 }}
            >
              {h.winningNumber}
            </span>
          ))}
          {history.length === 0 && <span className="history-empty">—</span>}
        </div>
      </div>

      <div className="roulette-main">
        <div className="wheel-section">
          {sessionActive ? (
            <>
              <RouletteWheel
                phase={phase}
                winningNumber={phase === 'SPINNING' || phase === 'RESULT' ? winningNumber : null}
                spinDuration={SPIN_MS}
              />
              {phase === 'RESULT' && winningNumber !== null && (
                <div className={`winning-badge color-${getNumberColor(winningNumber)}`}>
                  <span className="winning-number">{winningNumber}</span>
                  <span className="winning-color">
                    {getNumberColor(winningNumber) === 'red'
                      ? 'Rosso'
                      : getNumberColor(winningNumber) === 'black'
                        ? 'Nero'
                        : 'Verde'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="wheel-offline">
              <div className="wheel-offline-icon">🎡</div>
              <p>Nessuna sessione attiva</p>
              <p className="muted">L&apos;admin deve avviare una sessione</p>
            </div>
          )}
        </div>

        <div className="table-section">
          <div className="amount-selector">
            <span className="amount-label">Importo</span>
            <div className="amount-chips">
              {[5, 10, 25, 50, 100].map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`amount-chip ${selectedAmount === a ? 'active' : ''}`}
                  onClick={() => setSelectedAmount(a)}
                  disabled={!bettingOpen}
                >
                  {a}€
                </button>
              ))}
              <button
                type="button"
                className={`amount-chip max-chip ${selectedAmount === (currentUser?.balance || 0) ? 'active' : ''}`}
                onClick={() => setSelectedAmount(currentUser?.balance || 0)}
                disabled={!bettingOpen}
              >
                MAX
              </button>
              <input
                type="number"
                className="amount-input-custom"
                value={selectedAmount}
                onChange={(e) => setSelectedAmount(Math.max(1, parseFloat(e.target.value) || 1))}
                disabled={!bettingOpen}
                min={1}
              />
            </div>
          </div>

          <div className="betting-table">
            <button
              type="button"
              className={`num-cell green ${myBets.some((b) => b.betType === 'STRAIGHT' && b.betValue === '0') ? 'my-bet' : ''}`}
              onClick={() => placeBet('STRAIGHT', '0')}
              disabled={!bettingOpen}
              data-tooltip="35x"
            >
              0
            </button>

            <div className="numbers-grid">
              {Array.from({ length: 12 }, (_, row) =>
                [3, 2, 1].map((col) => {
                  const n = (11 - row) * 3 + col;
                  const color = getNumberColor(n);
                  const hasBet = myBets.some((b) => b.betType === 'STRAIGHT' && b.betValue === String(n));
                  const totalOnNum = bets
                    .filter((b) => b.betType === 'STRAIGHT' && b.betValue === String(n))
                    .reduce((s, b) => s + b.amount, 0);
                  return (
                    <button
                      key={n}
                      type="button"
                      className={`num-cell ${color} ${hasBet ? 'my-bet' : ''}`}
                      onClick={() => placeBet('STRAIGHT', String(n))}
                      disabled={!bettingOpen}
                      data-tooltip="35x"
                    >
                      {n}
                      {totalOnNum > 0 && <span className="chip-indicator">{formatCompact(totalOnNum)}</span>}
                    </button>
                  );
                })
              ).flat()}
            </div>

            <div className="outside-bets-row">
              {[
                ['1-12', '1ª Dozzina', '3x'],
                ['13-24', '2ª Dozzina', '3x'],
                ['25-36', '3ª Dozzina', '3x'],
              ].map(([val, label, odds]) => (
                <button
                  key={val}
                  type="button"
                  className={`outside-bet ${myBets.some((b) => b.betType === 'DOZEN' && b.betValue === val) ? 'my-bet' : ''}`}
                  onClick={() => placeBet('DOZEN', val)}
                  disabled={!bettingOpen}
                  data-tooltip={odds}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="outside-bets-row">
              {[
                ['col1', 'Colonna 1', '3x'],
                ['col2', 'Colonna 2', '3x'],
                ['col3', 'Colonna 3', '3x'],
              ].map(([val, label, odds]) => (
                <button
                  key={val}
                  type="button"
                  className={`outside-bet ${myBets.some((b) => b.betType === 'COLUMN' && b.betValue === val) ? 'my-bet' : ''}`}
                  onClick={() => placeBet('COLUMN', val)}
                  disabled={!bettingOpen}
                  data-tooltip={odds}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="outside-bets-row outside-bets-6">
              <button
                type="button"
                className={`outside-bet ${myBets.some((b) => b.betValue === 'even') ? 'my-bet' : ''}`}
                onClick={() => placeBet('ODD_EVEN', 'even')}
                disabled={!bettingOpen}
                data-tooltip="2x"
              >
                Pari
              </button>
              <button
                type="button"
                className={`outside-bet color-red ${myBets.some((b) => b.betValue === 'red') ? 'my-bet' : ''}`}
                onClick={() => placeBet('RED_BLACK', 'red')}
                disabled={!bettingOpen}
                data-tooltip="2x"
              >
                Rosso
              </button>
              <button
                type="button"
                className={`outside-bet color-black ${myBets.some((b) => b.betValue === 'black') ? 'my-bet' : ''}`}
                onClick={() => placeBet('RED_BLACK', 'black')}
                disabled={!bettingOpen}
                data-tooltip="2x"
              >
                Nero
              </button>
              <button
                type="button"
                className={`outside-bet ${myBets.some((b) => b.betValue === 'odd') ? 'my-bet' : ''}`}
                onClick={() => placeBet('ODD_EVEN', 'odd')}
                disabled={!bettingOpen}
                data-tooltip="2x"
              >
                Dispari
              </button>
            </div>
          </div>

          {myBets.length > 0 && (
            <div className="my-bets-summary">
              <span className="my-bets-label">Le tue puntate</span>
              <div className="my-bets-list">
                {myBets.map((b, i) => (
                  <span key={i} className="my-bet-tag">
                    {b.betType === 'STRAIGHT' ? `#${b.betValue}` : b.betValue} — {formatCurrency(b.amount)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!bettingOpen && phase !== 'WAITING' && (
            <div className="table-overlay">
              <span>
                {phase === 'SPINNING'
                  ? '🎡 Ruota in giro...'
                  : phase === 'RESULT'
                    ? `✓ ${winningNumber}`
                    : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="roulette-chat">
        <h3 className="chat-title">Chat live</h3>
        <div className="chat-messages" ref={chatRef}>
          {comments.map((c) => (
            <div key={c.id} className="chat-msg">
              <img
                src={avatarSrc(c.user?.displayName, c.user?.avatarUrl)}
                className="chat-avatar"
                alt=""
              />
              <div className="chat-content">
                <span className="chat-user">{c.user?.displayName}</span>
                {c.text && <p className="chat-text">{c.text}</p>}
                {c.imageUrl && <img src={getUploadUrl(c.imageUrl)} className="chat-img" alt="" />}
              </div>
            </div>
          ))}
          {comments.length === 0 && <p className="chat-empty">Nessun messaggio ancora. Scrivi qualcosa!</p>}
        </div>
        {roundId && (
          <div className="chat-input-row">
            <input
              className="input-field"
              placeholder="Scrivi nella chat..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendComment()}
              maxLength={200}
            />
            <button type="button" className="btn-send" onClick={sendComment}>
              ➤
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
