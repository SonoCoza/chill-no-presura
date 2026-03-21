import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import api, { getUploadUrl } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import useSocket from '../hooks/useSocket';
import { formatCurrency, formatOdds, formatRelativeTime, getCountdown, getImpliedProbability } from '../utils/format';
import { StatusBadge, CountdownTimer } from '../components/MarketCard';
import DateTimePicker from '../components/ui/DateTimePicker';
import { GifPicker } from '../components/ui/GifPicker';
import './MarketDetailPage.css';

function OddsBar({ option, totalPool, isWinner, isResolved, flashing }) {
  const pct = totalPool > 0 ? (option.totalStaked / totalPool * 100) : 0;
  const impliedProb = getImpliedProbability(option.odds);

  const odds = option.odds || 0;
  let oddsClass = 'odds-favorite';
  if (odds >= 2 && odds < 3.5) oddsClass = 'odds-medium';
  else if (odds >= 3.5 && odds < 8) oddsClass = 'odds-high';
  else if (odds >= 8) oddsClass = 'odds-longshot';

  return (
    <div className={`odds-bar-container ${isWinner ? 'winner' : ''} ${isResolved && !isWinner ? 'loser' : ''} ${flashing ? 'flash' : ''}`}>
      <div className="odds-bar-header">
        <span className="odds-bar-label">{option.label}</span>
        {isWinner && <span className="winner-badge">VINCITORE</span>}
        <span className={`odds-bar-odds mono ${oddsClass}`}>{formatOdds(option.odds)}</span>
      </div>
      <div className="odds-bar-track">
        <motion.div
          className="odds-bar-fill"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(pct, 2)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="odds-bar-footer">
        <span className="odds-bar-pct mono">{impliedProb}%</span>
        <span className="odds-bar-staked mono">{formatCurrency(option.totalStaked)}</span>
      </div>
    </div>
  );
}

function BetWidget({ market, options, onBetPlaced }) {
  const { user, updateBalance } = useAuth();
  const [selectedOption, setSelectedOption] = useState(null);
  const [amount, setAmount] = useState('');
  const [placing, setPlacing] = useState(false);

  const selectedOdds = options.find(o => o.id === selectedOption)?.odds || 0;
  const potentialWin = amount && selectedOdds ? (parseFloat(amount) * selectedOdds) : 0;

  const handlePlace = async () => {
    if (!selectedOption || !amount || parseFloat(amount) <= 0) {
      toast.error('Seleziona un\'opzione e inserisci un importo');
      return;
    }
    if (parseFloat(amount) > user.balance) {
      toast.error('Saldo insufficiente');
      return;
    }

    setPlacing(true);
    try {
      const { data } = await api.post('/bets', {
        marketId: market.id,
        optionId: selectedOption,
        amount: parseFloat(amount),
      });
      updateBalance(data.newBalance);
      toast.custom((t) => (
        <div className={`bet-placed-toast ${t.visible ? 'visible' : ''}`}>
          <span className="bpt-icon">🎲</span>
          <div className="bpt-content">
            <span className="bpt-title">Scommessa piazzata!</span>
            <span className="bpt-detail">
              Se vinci: <strong>+{formatCurrency(data.bet.potentialWin)}</strong>
            </span>
          </div>
        </div>
      ), { duration: 4000 });
      setAmount('');
      setSelectedOption(null);
      onBetPlaced();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore nel piazzare la scommessa');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="bet-widget">
      <h3 className="bet-widget-title">Piazza una Scommessa</h3>

      <div className="bet-options">
        {options.map(option => (
          <button
            key={option.id}
            className={`bet-option-btn ${selectedOption === option.id ? 'selected' : ''}`}
            onClick={() => setSelectedOption(option.id)}
          >
            <span>{option.label}</span>
            <span className="mono">{formatOdds(option.odds)}</span>
          </button>
        ))}
      </div>

      <div className="bet-amount-section">
        <label>Importo</label>
        <div className="bet-amount-input-wrap">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0.01"
            step="0.01"
            className="bet-amount-input input-field mono"
          />
          <span className="bet-currency">€</span>
        </div>
        <input
          type="range"
          min="0"
          max={user?.balance || 0}
          step="0.5"
          value={amount || 0}
          onChange={(e) => setAmount(e.target.value)}
          className="bet-slider"
        />
        <div className="bet-quick-amounts">
          {[5, 10, 25, 50, 100].map(v => (
            <button key={v} className="quick-amount-btn" onClick={() => setAmount(String(v))}>
              {v}€
            </button>
          ))}
          <button className="quick-amount-btn" onClick={() => setAmount(String(user?.balance || 0))}>
            MAX
          </button>
        </div>
      </div>

      {selectedOption && amount && parseFloat(amount) > 0 && (
        <motion.div
          className="bet-preview"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
        >
          <div className="bet-preview-row">
            <span>Quota</span>
            <span className="mono">{formatOdds(selectedOdds)}</span>
          </div>
          <div className="bet-preview-row win">
            <span>Se vinci</span>
            <motion.span
              className="mono potential-win"
              key={potentialWin}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
            >
              +{formatCurrency(potentialWin)}
            </motion.span>
          </div>
        </motion.div>
      )}

      <button
        className="place-bet-btn"
        onClick={handlePlace}
        disabled={!selectedOption || !amount || parseFloat(amount) <= 0 || placing}
      >
        {placing ? 'Piazzando...' : 'Piazza Scommessa'}
      </button>
    </div>
  );
}

function CommentSection({ marketId, comments: initialComments }) {
  const { user } = useAuth();
  const [comments, setComments] = useState(initialComments || []);
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [gifUrl, setGifUrl] = useState(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);
  const listEndRef = useRef(null);

  useEffect(() => {
    setComments(initialComments || []);
  }, [initialComments]);

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Eliminare questo commento?')) return;
    setDeletingId(commentId);
    try {
      await api.delete(`/comments/${commentId}`);
      // WebSocket will remove it for everyone, but remove locally as fallback
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {
      toast.error('Errore eliminazione commento');
    } finally {
      setDeletingId(null);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSend = async () => {
    if (!text.trim() && !imageFile && !gifUrl) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('marketId', marketId);
      if (text.trim()) formData.append('text', text.trim());
      if (imageFile) formData.append('image', imageFile);
      if (gifUrl) formData.append('gifUrl', gifUrl);

      const { data } = await api.post('/comments', formData);
      setComments(prev => [...prev, data]);
      setText('');
      setImageFile(null);
      setImagePreview(null);
      setGifUrl(null);
      setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      toast.error('Errore nell\'invio del commento');
    } finally {
      setSending(false);
    }
  };

  const REACTIONS = ['🔥', '💀', '😂', '💸'];

  return (
    <div className="comment-section">
      <h3 className="section-title">Commenti ({comments.length})</h3>

      <div className="comment-list">
        {comments.map((comment, i) => (
          <motion.div
            key={comment.id}
            className="comment"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <div className="comment-avatar">
              {comment.user?.avatarUrl ? (
                <img src={getUploadUrl(comment.user.avatarUrl)} alt="" />
              ) : (
                <div className="avatar-placeholder small">{comment.user?.displayName?.[0]?.toUpperCase()}</div>
              )}
            </div>
            <div className="comment-body">
              <div className="comment-header">
                <span className="comment-author">{comment.user?.displayName}</span>
                <span className="comment-time">{formatRelativeTime(comment.createdAt)}</span>
                {user?.isAdmin && (
                  <button
                    className={`comment-delete-btn ${deletingId === comment.id ? 'deleting' : ''}`}
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={deletingId === comment.id}
                    title="Elimina commento"
                  >
                    {deletingId === comment.id ? (
                      <svg className="spin" width="14" height="14" viewBox="0 0 16 16">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="28" strokeDashoffset="10"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              {comment.text && <p className="comment-text">{comment.text}</p>}
              {comment.imageUrl && (
                <img src={getUploadUrl(comment.imageUrl)} alt="" className="comment-image" />
              )}
              {comment.gifUrl && (
                <img src={comment.gifUrl} alt="" className="comment-image" />
              )}
            </div>
          </motion.div>
        ))}
        <div ref={listEndRef} />
      </div>

      <div className="comment-input-area">
        {imagePreview && (
          <div className="comment-image-preview">
            <img src={imagePreview} alt="" />
            <button onClick={() => { setImageFile(null); setImagePreview(null); }}>&times;</button>
          </div>
        )}
        {gifUrl && (
          <div className="comment-image-preview">
            <img src={gifUrl} alt="GIF" />
            <button onClick={() => setGifUrl(null)}>&times;</button>
          </div>
        )}
        <div className="comment-input-row">
          <button className="comment-upload-btn" onClick={() => fileInputRef.current?.click()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} hidden />
          <button type="button" className="btn-gif" onClick={() => setShowGifPicker(true)}>GIF</button>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Scrivi un commento..."
            className="comment-text-input input-field"
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="comment-send-btn" onClick={handleSend} disabled={sending || (!text.trim() && !imageFile && !gifUrl)}>
            Invia
          </button>
        </div>
        {showGifPicker && (
          <GifPicker
            onSelect={(url) => { setGifUrl(url); setShowGifPicker(false); }}
            onClose={() => setShowGifPicker(false)}
          />
        )}
      </div>
    </div>
  );
}

function EditMarketModal({ market, onClose, onUpdated }) {
  const [title, setTitle] = useState(market.title);
  const [description, setDescription] = useState(market.description || '');
  const [imageUrl, setImageUrl] = useState(
    market.imageUrl && !market.imageUrl.startsWith('/uploads/') ? market.imageUrl : ''
  );
  const [closeAt, setCloseAt] = useState(market.closeAt || '');
  const [options, setOptions] = useState(market.options?.map(o => ({ id: o.id, label: o.label })) || []);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!title.trim()) { toast.error('Titolo richiesto'); return; }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      if (closeAt) formData.append('closeAt', closeAt);
      if (imageUrl.trim()) formData.append('imageUrl', imageUrl.trim());
      formData.append('options', JSON.stringify(options.map(o => ({ id: o.id, label: o.label }))));

      const { data } = await api.put(`/markets/${market.id}`, formData);
      toast.success('Pronostico aggiornato!');
      onUpdated(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore aggiornamento');
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="modal-overlay create-market-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="create-market-modal"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cmm-header">
          <h2>Modifica Pronostico</h2>
          <button className="cmm-close" onClick={onClose}>&times;</button>
        </div>
        <div className="cmm-body">
          <div className="form-group">
            <label>Titolo</label>
            <input className="input-field" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div className="form-group">
            <label>Descrizione</label>
            <textarea className="input-field" value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={500} />
          </div>
          <div className="form-group">
            <label>Banner URL</label>
            <input className="input-field" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="URL immagine o GIF" />
          </div>
          <div className="form-group">
            <label>Data chiusura</label>
            <DateTimePicker value={closeAt} onChange={setCloseAt} placeholder="Seleziona data e ora" />
          </div>
          <div className="form-group">
            <label>Opzioni</label>
            {options.map((o, i) => (
              <input key={o.id || i} className="input-field" value={o.label} onChange={e => {
                const updated = [...options];
                updated[i] = { ...updated[i], label: e.target.value };
                setOptions(updated);
              }} placeholder={`Opzione ${i + 1}`} style={{ marginBottom: 6 }} />
            ))}
          </div>
        </div>
        <div className="cmm-footer">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button type="button" className="btn-primary cmm-submit" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salva Modifiche'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MyBetsSection({ bets }) {
  if (!bets || bets.length === 0) return null;

  return (
    <div className="my-bets-section">
      <h3>Le mie scommesse</h3>
      {bets.map(bet => (
        <div key={bet.id} className={`my-bet-row status-${bet.status?.toLowerCase()}`}>
          <span className="mbt-option">{bet.option?.label}</span>
          <span className="mbt-amount mono">{formatCurrency(bet.amount)}</span>
          <span className="mbt-arrow">→</span>
          <span className="mbt-potential">
            potenziale <strong className="mono">{formatCurrency(bet.potentialWin)}</strong>
          </span>
          <span className="mbt-status">
            {bet.status === 'PENDING' && '⏳ In corso'}
            {bet.status === 'WON' && '🏆 Vinto!'}
            {bet.status === 'LOST' && '💀 Perso'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MarketDetailPage() {
  const { id } = useParams();
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flashingOptions, setFlashingOptions] = useState({});
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [editSecondsRemaining, setEditSecondsRemaining] = useState(0);
  const { socket } = useSocket();
  const { user } = useAuth();

  // Local canEdit calculation — no extra API call needed
  useEffect(() => {
    if (!market || !user) return;

    const isAdmin = user.isAdmin;
    const isCreator = market.createdBy === user.id;
    const msElapsed = Date.now() - new Date(market.createdAt).getTime();
    const msRemaining = Math.max(0, 10 * 60 * 1000 - msElapsed);
    const seconds = Math.floor(msRemaining / 1000);

    setIsAdminUser(isAdmin);
    setCanEdit(isAdmin || (isCreator && seconds > 0));
    setEditSecondsRemaining(isAdmin ? Infinity : seconds);
  }, [market, user]);

  // Countdown timer for non-admin creators
  useEffect(() => {
    if (!canEdit || isAdminUser) return;
    if (editSecondsRemaining <= 0) { setCanEdit(false); return; }

    const timer = setInterval(() => {
      setEditSecondsRemaining(prev => {
        if (prev <= 1) {
          setCanEdit(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [canEdit, isAdminUser, editSecondsRemaining]);

  // Socket.IO: join market room and listen for updates
  useEffect(() => {
    if (!socket || !id) return;

    socket.emit('join:market', id);

    const handleOddsUpdated = ({ marketId, options }) => {
      if (marketId !== parseInt(id)) return;
      setMarket(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          options: prev.options.map(o => {
            const updated = options.find(u => u.id === o.id);
            return updated ? { ...o, ...updated } : o;
          }),
        };
      });
      // Flash animation
      const flashing = {};
      options.forEach(o => { flashing[o.id] = true; });
      setFlashingOptions(flashing);
      setTimeout(() => setFlashingOptions({}), 600);
    };

    const handleNewComment = (data) => {
      // Backend emits { comment } — unwrap it
      const comment = data?.comment || data;
      setMarket(prev => {
        if (!prev) return prev;
        // Deduplicate by ID
        const exists = (prev.comments || []).some(c => c.id === comment.id);
        if (exists) return prev;
        return { ...prev, comments: [...(prev.comments || []), comment] };
      });
    };

    const handleMarketResolved = ({ marketId }) => {
      if (marketId !== parseInt(id)) return;
      loadMarket();
    };

    const handleMarketUpdated = ({ market, marketId: mId }) => {
      const updatedId = market?.id || mId;
      if (updatedId !== parseInt(id)) return;
      setMarket(prev => prev ? { ...prev, ...market } : prev);
    };

    const handleCommentDeleted = ({ commentId }) => {
      setMarket(prev => {
        if (!prev) return prev;
        return { ...prev, comments: (prev.comments || []).filter(c => c.id !== commentId) };
      });
    };

    socket.on('market:odds_updated', handleOddsUpdated);
    socket.on('comment:new', handleNewComment);
    socket.on('market:resolved', handleMarketResolved);
    socket.on('market:updated', handleMarketUpdated);
    socket.on('comment:deleted', handleCommentDeleted);

    return () => {
      socket.emit('leave:market', id);
      socket.off('market:odds_updated', handleOddsUpdated);
      socket.off('comment:new', handleNewComment);
      socket.off('market:resolved', handleMarketResolved);
      socket.off('market:updated', handleMarketUpdated);
      socket.off('comment:deleted', handleCommentDeleted);
    };
  }, [socket, id]);

  const loadMarket = async () => {
    try {
      const { data } = await api.get(`/markets/${id}`);
      setMarket(data);

      // Fire confetti if resolved and user had a winning bet
      if (data.status === 'RESOLVED') {
        const myWin = data.entries?.find(e => e.status === 'WON');
        if (myWin) {
          setTimeout(() => {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          }, 500);
        }
      }
    } catch (err) {
      console.error('Load market error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarket();
  }, [id]);

  if (loading) {
    return (
      <div className="market-detail-loading">
        <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 16 }} />
        <div className="skeleton" style={{ width: '60%', height: 32, borderRadius: 8, marginTop: 16 }} />
        <div className="skeleton" style={{ width: '40%', height: 20, borderRadius: 8, marginTop: 8 }} />
      </div>
    );
  }

  if (!market) {
    return <div className="empty-state">Market non trovato</div>;
  }

  const totalPool = market.totalPool || 0;

  return (
    <div className="market-detail">
      {market.imageUrl && (
        <div className="market-detail-hero">
          <img src={getUploadUrl(market.imageUrl)} alt="" />
          <div className="hero-overlay" />
        </div>
      )}

      <div className="market-detail-header">
        <div className="market-detail-badges">
          <StatusBadge status={market.status} />
          {market.closeAt && market.status === 'OPEN' && (
            <CountdownTimer closeAt={market.closeAt} />
          )}
          {canEdit && (
            <div className="market-actions">
              <button className="btn-edit-market" onClick={() => setEditModalOpen(true)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9.5 1.5L12.5 4.5L4.5 12.5H1.5V9.5L9.5 1.5Z"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Modifica
                {!isAdminUser && editSecondsRemaining > 0 && editSecondsRemaining !== Infinity && (
                  <span className={`edit-countdown ${editSecondsRemaining < 120 ? 'urgent' : ''}`}>
                    {Math.floor(editSecondsRemaining / 60)}:{String(editSecondsRemaining % 60).padStart(2, '0')}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
        <h1 className="market-detail-title">{market.title}</h1>
        {market.description && <p className="market-detail-desc">{market.description}</p>}
        <div className="market-detail-stats">
          <div className="stat">
            <span className="stat-label">Pool Totale</span>
            <span className="stat-value mono">{formatCurrency(totalPool)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Scommesse</span>
            <span className="stat-value mono">{market.entries?.length || 0}</span>
          </div>
        </div>
      </div>

      <div className="market-detail-body">
        <div className="market-detail-main">
          <div className="odds-section">
            <h3 className="section-title">Quote</h3>
            {market.options?.map(option => (
              <OddsBar
                key={option.id}
                option={option}
                totalPool={totalPool}
                isWinner={market.resolvedOption === option.id}
                isResolved={market.status === 'RESOLVED'}
                flashing={flashingOptions[option.id]}
              />
            ))}
          </div>

          <MyBetsSection bets={market.myBets} />
          <CommentSection marketId={market.id} comments={market.comments} />
        </div>

        <div className="market-detail-sidebar">
          {market.status === 'OPEN' ? (
            <BetWidget market={market} options={market.options} onBetPlaced={loadMarket} />
          ) : market.status === 'CLOSED' ? (
            <div className="sidebar-notice">
              <div className="notice-icon">⏳</div>
              <h4>In attesa di risoluzione</h4>
              <p>Il market è chiuso. L'admin dichiarerà il vincitore a breve.</p>
            </div>
          ) : (
            <div className="sidebar-notice resolved">
              <div className="notice-icon">🏆</div>
              <h4>Market Risolto</h4>
              <p>
                Vincitore: <strong>{market.options?.find(o => o.id === market.resolvedOption)?.label}</strong>
              </p>
            </div>
          )}

          {/* Recent bets — exclude admin bets */}
          <div className="recent-bets">
            <h4>Ultime Scommesse</h4>
            {market.entries?.filter(e => !e.user?.isAdmin).slice(0, 10).map(entry => (
              <div key={entry.id} className={`recent-bet ${entry.status === 'WON' ? 'won' : entry.status === 'LOST' ? 'lost' : ''}`}>
                <span className="rb-user">{entry.user?.displayName}</span>
                <span className="rb-option">{entry.option?.label}</span>
                <span className="rb-amount mono">{formatCurrency(entry.amount)}</span>
              </div>
            ))}
            {(!market.entries || market.entries.filter(e => !e.user?.isAdmin).length === 0) && (
              <p className="text-secondary" style={{ fontSize: 13 }}>Nessuna scommessa ancora</p>
            )}
          </div>
        </div>
      </div>

      {/* Edit Market Modal */}
      <AnimatePresence>
        {editModalOpen && (
          <EditMarketModal
            market={market}
            onClose={() => setEditModalOpen(false)}
            onUpdated={(updated) => { setMarket(prev => ({ ...prev, ...updated })); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
