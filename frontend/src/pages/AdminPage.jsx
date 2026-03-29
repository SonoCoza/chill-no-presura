import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../utils/api';
import { getUploadUrl } from '../utils/api';
import { formatCurrency, formatDate, formatRelativeTime } from '../utils/format';
import DateTimePicker from '../components/ui/DateTimePicker';
import OnlineBadge from '../components/ui/OnlineBadge';
import { CustomCheckbox } from '../components/ui/CustomCheckbox';
import { CustomToggle } from '../components/ui/CustomToggle';
import { CustomFileUpload } from '../components/ui/CustomFileUpload';
import { GifPicker } from '../components/ui/GifPicker';
import usePresence from '../hooks/usePresence';
import useAdminBalanceSync from '../hooks/useAdminBalanceSync';
import './AdminPage.css';

// ---- USERS TAB ----
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [createForm, setCreateForm] = useState({ username: '', displayName: '', isAdmin: false, balance: 0 });
  const [tempPass, setTempPass] = useState(null);
  const [flashedUsers, setFlashedUsers] = useState({}); // { [userId]: { delta, timestamp } }

  const loadUsers = async () => {
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch (err) {
      toast.error('Errore caricamento utenti');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  // Live balance sync via WebSocket
  const handleBalanceUpdate = useCallback(({ userId, newBalance, delta, type }) => {
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, balance: newBalance } : u
    ));
    // Update selected user drawer too
    setSelectedUser(prev => prev && prev.id === userId ? { ...prev, balance: newBalance } : prev);
    // Flash animation
    setFlashedUsers(prev => ({ ...prev, [userId]: { delta, timestamp: Date.now() } }));
    setTimeout(() => {
      setFlashedUsers(prev => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    }, 2000);
  }, []);

  useAdminBalanceSync(handleBalanceUpdate);

  const handleCreateUser = async () => {
    try {
      const { data } = await api.post('/admin/users', createForm);
      setTempPass(data.tempPassword);
      toast.success(`Utente ${data.username} creato!`);
      setCreateForm({ username: '', displayName: '', isAdmin: false, balance: 0 });
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore creazione utente');
    }
  };

  const handleResetPassword = async (userId) => {
    try {
      const { data } = await api.put(`/admin/users/${userId}`, { resetPassword: true });
      setTempPass(data.tempPassword);
      toast.success('Password resettata');
      loadUsers();
    } catch (err) {
      toast.error('Errore reset password');
    }
  };

  const handleAdjustBalance = async (userId, amount, description) => {
    try {
      const { data } = await api.post(`/admin/users/${userId}/balance`, { amount: parseFloat(amount), description });
      // Immediate state update from server response — don't wait for loadUsers
      const newBal = data.newBalance ?? data.balance;
      if (newBal !== undefined) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, balance: newBal } : u));
        setSelectedUser(prev => prev && prev.id === userId ? { ...prev, balance: newBal } : prev);
      }
      toast.success('Saldo aggiornato');
      loadUsers(); // also reload full list in background
    } catch (err) {
      toast.error('Errore aggiornamento saldo');
    }
  };

  const handleToggleSuspend = async (userId, isSuspended) => {
    try {
      await api.put(`/admin/users/${userId}/suspend`, { isSuspended });
      toast.success(isSuspended ? 'Utente sospeso' : 'Utente riattivato');
      loadUsers();
    } catch (err) {
      toast.error('Errore aggiornamento stato');
    }
  };

  const handleToggleAdmin = async (userId, isAdmin) => {
    try {
      await api.put(`/admin/users/${userId}`, { isAdmin });
      toast.success(isAdmin ? 'Promosso ad admin' : 'Rimosso da admin');
      loadUsers();
    } catch (err) {
      toast.error('Errore aggiornamento ruolo');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await api.delete(`/admin/users/${userId}`);
      toast.success('Utente eliminato');
      setSelectedUser(null);
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore eliminazione utente');
    }
  };

  return (
    <div className="admin-tab">
      <div className="tab-header">
        <h2>Utenti ({users.length})</h2>
        <button className="btn-primary" onClick={() => { setShowCreate(!showCreate); setTempPass(null); }}>
          {showCreate ? 'Chiudi' : '+ Crea Utente'}
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div className="create-form-card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Username</label>
                <input className="input-field" value={createForm.username} onChange={e => setCreateForm(p => ({ ...p, username: e.target.value }))} placeholder="username" />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input className="input-field" value={createForm.displayName} onChange={e => setCreateForm(p => ({ ...p, displayName: e.target.value }))} placeholder="Nome Cognome" />
              </div>
              <div className="form-group">
                <label>Saldo Iniziale</label>
                <input className="input-field" type="number" value={createForm.balance} onChange={e => setCreateForm(p => ({ ...p, balance: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="form-row">
              <CustomCheckbox
                checked={createForm.isAdmin}
                onChange={e => setCreateForm(p => ({ ...p, isAdmin: e.target.checked }))}
                label="Admin"
              />
              <button className="btn-primary" onClick={handleCreateUser}>Crea</button>
            </div>

            {tempPass && (
              <div className="temp-password-box">
                <span>Password temporanea:</span>
                <code className="mono" onClick={() => { navigator.clipboard.writeText(tempPass); toast.success('Copiata!'); }}>
                  {tempPass}
                </code>
                <span className="copy-hint">Click per copiare</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 50, marginBottom: 6, borderRadius: 8 }} />)}</div>
      ) : (
        <div className="admin-table">
          <div className="table-header">
            <span>Utente</span>
            <span>Saldo</span>
            <span>Bet</span>
            <span>Stato</span>
            <span>Azioni</span>
          </div>
          {users.map(u => (
            <div key={u.id} className="table-row" onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}>
              <span className="table-cell" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <OnlineBadge userId={u.id} size="sm" />
                <div>
                  <strong>{u.displayName}</strong>
                  {u.username === 'admin' && <span className="tag tag-super-admin" style={{ marginLeft: 6, fontSize: 9 }}>SUPER ADMIN</span>}
                  {u.isAdmin && u.username !== 'admin' && <span className="tag tag-admin-green" style={{ marginLeft: 6, fontSize: 9 }}>ADMIN</span>}
                  <small className="text-secondary" style={{ display: 'block' }}>@{u.username}</small>
                </div>
              </span>
              <span className={`table-cell mono ${flashedUsers[u.id] ? 'balance-flash' : ''}`}>
                {formatCurrency(u.balance)}
                {flashedUsers[u.id] && (
                  <span className={`balance-delta-badge ${flashedUsers[u.id].delta >= 0 ? 'positive' : 'negative'}`}>
                    {flashedUsers[u.id].delta >= 0 ? '+' : ''}{formatCurrency(flashedUsers[u.id].delta)}
                  </span>
                )}
              </span>
              <span className="table-cell mono">{u._count?.bets || 0}</span>
              <span className="table-cell">
                {u.isAdmin && <span className="tag tag-admin">Admin</span>}
                {u.mustChangePass && <span className="tag tag-warn">Temp Pass</span>}
                {u.isSuspended && <span className="tag tag-suspended">Sospeso</span>}
              </span>
              <span className="table-cell actions" onClick={e => e.stopPropagation()}>
                <button className="btn-small" onClick={() => handleResetPassword(u.id)}>Reset PW</button>
                <button className="btn-small" onClick={() => handleToggleSuspend(u.id, !u.isSuspended)}>
                  {u.isSuspended ? 'Riattiva' : 'Sospendi'}
                </button>
                <button className="btn-small" onClick={() => handleToggleAdmin(u.id, !u.isAdmin)}>
                  {u.isAdmin ? 'Rimuovi Admin' : 'Admin'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* User detail drawer */}
      <AnimatePresence>
        {selectedUser && (
          <UserDrawer
            user={selectedUser}
            onClose={() => setSelectedUser(null)}
            onAdjustBalance={handleAdjustBalance}
            onResetPassword={handleResetPassword}
            onToggleSuspend={handleToggleSuspend}
            onToggleAdmin={handleToggleAdmin}
            onDeleteUser={handleDeleteUser}
            onRefresh={loadUsers}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function UserDrawer({ user, onClose, onAdjustBalance, onResetPassword, onToggleSuspend, onToggleAdmin, onDeleteUser, onRefresh }) {
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [logs, setLogs] = useState([]);
  const [bets, setBets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [activeSection, setActiveSection] = useState('info');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detail, setDetail] = useState(user);

  useEffect(() => {
    api.get(`/admin/users/${user.id}`).then(({ data }) => setDetail(data)).catch(() => {});
    api.get(`/admin/users/${user.id}/logs`).then(({ data }) => setLogs(data)).catch(() => {});
    api.get(`/admin/users/${user.id}/bets`).then(({ data }) => setBets(data)).catch(() => {});
    api.get(`/admin/users/${user.id}/transactions`).then(({ data }) => setTransactions(data)).catch(() => {});
  }, [user.id]);

  // Sync balance from parent (updated via WebSocket or API reload)
  useEffect(() => {
    if (user.balance !== undefined) {
      setDetail(prev => prev ? { ...prev, balance: user.balance } : prev);
    }
  }, [user.balance]);

  const u = detail || user;

  return (
    <motion.div className="drawer-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="drawer user-drawer" initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <button className="drawer-close" onClick={onClose}>&times;</button>
        </div>
        <div className="drawer-body">
          {/* Header: Avatar + Name + Badges */}
          <div className="ud-header">
            <div className="ud-avatar">
              {u.avatarUrl ? (
                <img src={getUploadUrl(u.avatarUrl)} alt="" />
              ) : (
                <div className="ud-avatar-placeholder">{u.displayName?.[0]?.toUpperCase()}</div>
              )}
            </div>
            <h3 className="ud-name">{u.displayName}</h3>
            <span className="ud-username text-secondary">@{u.username}</span>
            <div className="ud-badges">
              {u.isAdmin && <span className="tag tag-admin">Admin</span>}
              {u.isSuspended && <span className="tag tag-suspended">Sospeso</span>}
              {u.mustChangePass && <span className="tag tag-warn">Temp Pass</span>}
            </div>
          </div>

          {/* Section Tabs */}
          <div className="ud-tabs">
            {[
              { key: 'info', label: 'Info' },
              { key: 'bets', label: `Bet (${bets.length})` },
              { key: 'activity', label: 'Attivita' },
              { key: 'danger', label: 'Danger' },
            ].map(t => (
              <button key={t.key} className={`ud-tab ${activeSection === t.key ? 'active' : ''}`} onClick={() => setActiveSection(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Info Section */}
          {activeSection === 'info' && (
            <div className="ud-section">
              {/* Credentials */}
              <div className="ud-card">
                <h4>Credenziali</h4>
                <div className="ud-info-row">
                  <span className="ud-info-label">Creato il</span>
                  <span>{formatDate(u.createdAt)}</span>
                </div>
                {u.lastSetPassword && (
                  <div className="ud-info-row">
                    <span className="ud-info-label">Ultima password</span>
                    <div className="ud-password-field">
                      <code className="mono">{showPassword ? u.lastSetPassword : '••••••••'}</code>
                      <button className="ud-eye-btn" onClick={() => setShowPassword(p => !p)}>
                        {showPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                )}
                {u.tempPassword && (
                  <div className="ud-info-row">
                    <span className="ud-info-label">Password temp</span>
                    <code className="mono text-orange" onClick={() => { navigator.clipboard.writeText(u.tempPassword); toast.success('Copiata!'); }} style={{ cursor: 'pointer' }}>
                      {u.tempPassword}
                    </code>
                  </div>
                )}
                <button className="btn-small ud-reset-btn" onClick={() => onResetPassword(u.id)}>
                  Reset Password
                </button>
              </div>

              {/* Balance */}
              <div className="ud-card">
                <h4>Saldo</h4>
                <div className="ud-balance-display">
                  <span className="ud-balance-amount mono text-green">{formatCurrency(u.balance)}</span>
                </div>
                <div className="ud-balance-form">
                  <input type="number" placeholder="Importo (+/-)" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" />
                  <input placeholder="Descrizione" value={desc} onChange={e => setDesc(e.target.value)} className="input-field" />
                  <button className="btn-primary" onClick={() => { onAdjustBalance(u.id, amount, desc); setAmount(''); setDesc(''); }}>
                    Applica
                  </button>
                </div>
                {transactions.length > 0 && (
                  <div className="ud-transactions">
                    <h5>Ultime Transazioni</h5>
                    {transactions.slice(0, 10).map(t => (
                      <div key={t.id} className="ud-tx-row">
                        <span className="ud-tx-type">{t.type}</span>
                        <span className={`ud-tx-amount mono ${t.amount >= 0 ? 'text-green' : 'text-red'}`}>
                          {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                        </span>
                        <span className="ud-tx-time text-secondary">{formatRelativeTime(t.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bets Section */}
          {activeSection === 'bets' && (
            <div className="ud-section">
              {bets.length === 0 ? (
                <p className="text-secondary" style={{ padding: 16 }}>Nessuna scommessa</p>
              ) : (
                <div className="ud-bets-list">
                  {bets.map(bet => (
                    <div key={bet.id} className={`ud-bet-item ${bet.status === 'WON' ? 'won' : bet.status === 'LOST' ? 'lost' : ''}`}>
                      <div className="ud-bet-header">
                        <span className="ud-bet-market">{bet.market?.title}</span>
                        <span className={`tag tag-${bet.status?.toLowerCase()}`}>{bet.status}</span>
                      </div>
                      <div className="ud-bet-details">
                        <span>Opzione: <strong>{bet.option?.label}</strong></span>
                        <span className="mono">{formatCurrency(bet.amount)} @ {bet.oddsAtTime}</span>
                        <span className="mono text-green">Pot. {formatCurrency(bet.potentialWin)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity Section */}
          {activeSection === 'activity' && (
            <div className="ud-section">
              <div className="log-list">
                {logs.slice(0, 30).map(log => (
                  <div key={log.id} className="log-item">
                    <span className="log-action">{log.action}</span>
                    <span className="log-time">{formatRelativeTime(log.createdAt)}</span>
                  </div>
                ))}
                {logs.length === 0 && <p className="text-secondary" style={{ padding: 16 }}>Nessun log</p>}
              </div>
            </div>
          )}

          {/* Danger Zone */}
          {activeSection === 'danger' && (
            <div className="ud-section ud-danger-zone">
              <div className="ud-danger-card">
                <h4>Zona Pericolosa</h4>
                <div className="ud-danger-item">
                  <div>
                    <strong>{u.isSuspended ? 'Riattiva Utente' : 'Sospendi Utente'}</strong>
                    <p className="text-secondary">{u.isSuspended ? 'Riattiva l\'accesso dell\'utente alla piattaforma' : 'L\'utente non potra piu accedere o piazzare scommesse'}</p>
                  </div>
                  <button className={`btn-small ${u.isSuspended ? 'btn-primary' : 'btn-warn'}`} onClick={() => { onToggleSuspend(u.id, !u.isSuspended); onClose(); }}>
                    {u.isSuspended ? 'Riattiva' : 'Sospendi'}
                  </button>
                </div>
                <div className="ud-danger-item">
                  <div>
                    <strong>{u.isAdmin ? 'Rimuovi Admin' : 'Promuovi ad Admin'}</strong>
                    <p className="text-secondary">{u.isAdmin ? 'L\'utente perdera i privilegi di amministratore' : 'L\'utente avra accesso completo al pannello admin'}</p>
                  </div>
                  <button className={`btn-small ${u.isAdmin ? 'btn-warn' : 'btn-primary'}`} onClick={() => { onToggleAdmin(u.id, !u.isAdmin); onClose(); }}>
                    {u.isAdmin ? 'Rimuovi Admin' : 'Promuovi'}
                  </button>
                </div>
                <div className="ud-danger-item ud-danger-delete">
                  <div>
                    <strong>Elimina Utente</strong>
                    <p className="text-secondary">Azione irreversibile. L'utente e tutti i suoi dati verranno eliminati permanentemente.</p>
                  </div>
                  {!confirmDelete ? (
                    <button className="btn-small btn-danger" onClick={() => setConfirmDelete(true)}>
                      Elimina
                    </button>
                  ) : (
                    <div className="ud-confirm-delete">
                      <span className="text-red">Confermi?</span>
                      <button className="btn-small btn-danger" onClick={() => { onDeleteUser(u.id); onClose(); }}>
                        Si, elimina
                      </button>
                      <button className="btn-small" onClick={() => setConfirmDelete(false)}>
                        No
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---- MARKETS TAB ----
function MarketsTab() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', closeAt: '', options: [{ label: '' }, { label: '' }] });
  const [imageFile, setImageFile] = useState(null);
  const [resolveModal, setResolveModal] = useState(null);
  const [oddsOverride, setOddsOverride] = useState(null);

  const loadMarkets = async () => {
    try {
      const { data } = await api.get('/markets');
      setMarkets(data);
    } catch (err) {
      toast.error('Errore caricamento market');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMarkets(); }, []);

  const handleCreate = async () => {
    try {
      const formData = new FormData();
      formData.append('title', form.title);
      if (form.description) formData.append('description', form.description);
      if (form.closeAt) formData.append('closeAt', form.closeAt);
      formData.append('options', JSON.stringify(form.options.filter(o => o.label.trim())));
      if (imageFile) formData.append('image', imageFile);

      await api.post('/markets', formData);
      toast.success('Market creato!');
      setShowCreate(false);
      setForm({ title: '', description: '', closeAt: '', options: [{ label: '' }, { label: '' }] });
      setImageFile(null);
      loadMarkets();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore creazione market');
    }
  };

  const handleResolve = async (marketId, winningOptionId) => {
    try {
      await api.post(`/markets/${marketId}/resolve`, { winningOptionId });
      toast.success('Market risolto!');
      setResolveModal(null);
      loadMarkets();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore risoluzione');
    }
  };

  const handleDeleteMarket = async (marketId) => {
    if (!window.confirm('Eliminare questo market? Le scommesse pendenti verranno rimborsate.')) return;
    try {
      await api.delete(`/markets/${marketId}`);
      toast.success('Market eliminato e rimborsi effettuati');
      loadMarkets();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore eliminazione');
    }
  };

  const handleOddsOverride = async (marketId, odds) => {
    try {
      await api.put(`/admin/markets/${marketId}/odds`, { odds });
      toast.success('Quote aggiornate');
      setOddsOverride(null);
      loadMarkets();
    } catch (err) {
      toast.error('Errore aggiornamento quote');
    }
  };

  const addOption = () => {
    setForm(p => ({ ...p, options: [...p.options, { label: '' }] }));
  };

  const updateOption = (i, val) => {
    setForm(p => {
      const opts = [...p.options];
      opts[i] = { ...opts[i], label: val };
      return { ...p, options: opts };
    });
  };

  const statusLabel = { OPEN: 'Aperto', CLOSED: 'Chiuso', RESOLVED: 'Risolto' };

  return (
    <div className="admin-tab">
      <div className="tab-header">
        <h2>Mercati ({markets.length})</h2>
        <button className="btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Chiudi' : '+ Crea Market'}
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div className="create-form-card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="form-group">
              <label>Titolo</label>
              <input className="input-field" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Es: Chi vince la partita?" />
            </div>
            <div className="form-group">
              <label>Descrizione</label>
              <textarea className="input-field" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descrizione opzionale..." rows={3} />
            </div>
            <div className="form-group">
              <label>Data Chiusura</label>
              <DateTimePicker
                value={form.closeAt}
                onChange={(val) => setForm(p => ({ ...p, closeAt: val }))}
                placeholder="Seleziona data e ora di chiusura"
              />
            </div>
            <div className="form-group">
              <label>Immagine</label>
              <CustomFileUpload
                onFile={(file) => setImageFile(file)}
                accept="image/*"
                preview={imageFile ? URL.createObjectURL(imageFile) : null}
              />
            </div>
            <div className="form-group">
              <label>Opzioni</label>
              {form.options.map((o, i) => (
                <input key={i} className="input-field" value={o.label} onChange={e => updateOption(i, e.target.value)} placeholder={`Opzione ${i + 1}`} style={{ marginBottom: 6 }} />
              ))}
              <button className="btn-small" onClick={addOption}>+ Aggiungi Opzione</button>
            </div>
            <button className="btn-primary" onClick={handleCreate}>Crea Market</button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div>{[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 6, borderRadius: 8 }} />)}</div>
      ) : (
        <div className="admin-table">
          <div className="table-header">
            <span>Titolo</span>
            <span>Stato</span>
            <span>Pool</span>
            <span>Azioni</span>
          </div>
          {markets.map(m => (
            <div key={m.id} className="table-row">
              <span className="table-cell"><strong>{m.title}</strong></span>
              <span className="table-cell">
                <span className={`tag tag-${m.status.toLowerCase()}`}>{statusLabel[m.status]}</span>
              </span>
              <span className="table-cell mono">{formatCurrency(m.totalPool || 0)}</span>
              <span className="table-cell actions">
                {m.status === 'OPEN' && (
                  <button className="btn-small" onClick={() => setOddsOverride(m)}>Quote</button>
                )}
                {(m.status === 'OPEN' || m.status === 'CLOSED') && (
                  <button className="btn-small btn-resolve" onClick={() => setResolveModal(m)}>Risolvi</button>
                )}
                <button className="btn-small btn-danger" onClick={() => handleDeleteMarket(m.id)}>Elimina</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Resolve Modal */}
      <AnimatePresence>
        {resolveModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setResolveModal(null)}>
            <motion.div className="modal" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}>
              <h3>Risolvi: {resolveModal.title}</h3>
              <p className="text-secondary">Seleziona l'opzione vincente:</p>
              <div className="resolve-options">
                {resolveModal.options?.map(o => (
                  <button key={o.id} className="resolve-option-btn" onClick={() => handleResolve(resolveModal.id, o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
              <button className="btn-cancel" onClick={() => setResolveModal(null)}>Annulla</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Odds Override Modal */}
      <AnimatePresence>
        {oddsOverride && (
          <OddsOverrideModal market={oddsOverride} onClose={() => setOddsOverride(null)} onSave={handleOddsOverride} />
        )}
      </AnimatePresence>
    </div>
  );
}

function OddsOverrideModal({ market, onClose, onSave }) {
  const [odds, setOdds] = useState(market.options?.map(o => ({ optionId: o.id, odds: o.odds, label: o.label })) || []);

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal" initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} onClick={e => e.stopPropagation()}>
        <h3>Override Quote: {market.title}</h3>
        {odds.map((o, i) => (
          <div key={o.optionId} className="form-row" style={{ marginBottom: 8 }}>
            <span style={{ flex: 1 }}>{o.label}</span>
            <input
              type="number"
              step="0.01"
              min="1.05"
              value={o.odds}
              onChange={e => {
                const updated = [...odds];
                updated[i] = { ...updated[i], odds: parseFloat(e.target.value) || 0 };
                setOdds(updated);
              }}
              className="mono"
              style={{ width: 100 }}
            />
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>Annulla</button>
          <button className="btn-primary" onClick={() => onSave(market.id, odds)}>Salva Quote</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---- TRANSACTIONS TAB ----
function TransactionsTab() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterType, setFilterType] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 30 };
      if (filterType) params.type = filterType;
      const { data } = await api.get('/admin/transactions', { params });
      setTransactions(data.transactions);
      setTotalPages(data.totalPages);
    } catch (err) {
      toast.error('Errore caricamento transazioni');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, filterType]);

  const typeColors = {
    DEPOSIT: 'var(--accent-green)',
    WITHDRAWAL: 'var(--accent-red)',
    BET: 'var(--accent-orange)',
    WIN: 'var(--accent-green)',
    REFUND: 'var(--accent-violet)',
    ADMIN_ADJUST: 'var(--text-secondary)',
  };

  return (
    <div className="admin-tab">
      <div className="tab-header">
        <h2>Transazioni</h2>
        <div className="filters">
          {['', 'DEPOSIT', 'BET', 'WIN', 'ADMIN_ADJUST'].map(t => (
            <button key={t} className={`filter-btn ${filterType === t ? 'active' : ''}`} onClick={() => { setFilterType(t); setPage(1); }}>
              {t || 'Tutte'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div>{[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 44, marginBottom: 4, borderRadius: 8 }} />)}</div>
      ) : (
        <>
          <div className="admin-table">
            <div className="table-header">
              <span>Utente</span>
              <span>Tipo</span>
              <span>Importo</span>
              <span>Descrizione</span>
              <span>Data</span>
            </div>
            {transactions.map(t => (
              <div key={t.id} className="table-row">
                <span className="table-cell">{t.user?.displayName}</span>
                <span className="table-cell"><span className="tag" style={{ borderColor: typeColors[t.type], color: typeColors[t.type] }}>{t.type}</span></span>
                <span className={`table-cell mono ${t.amount >= 0 ? 'text-green' : 'text-red'}`}>
                  {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                </span>
                <span className="table-cell text-secondary">{t.description || '-'}</span>
                <span className="table-cell text-secondary">{formatRelativeTime(t.createdAt)}</span>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prec</button>
              <span className="mono">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Succ</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- LOGS TAB ----
function LogsTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/admin/logs', { params: { page, limit: 30 } });
        setLogs(data.logs);
        setTotalPages(data.totalPages);
      } catch (err) {
        toast.error('Errore caricamento log');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page]);

  return (
    <div className="admin-tab">
      <h2>Log Attivita</h2>
      {loading ? (
        <div>{[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 4, borderRadius: 8 }} />)}</div>
      ) : (
        <>
          <div className="log-feed">
            {logs.map((log, i) => (
              <motion.div key={log.id} className="log-feed-item" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}>
                <div className="log-feed-dot" />
                <div className="log-feed-content">
                  <span className="log-feed-user">{log.user?.displayName}</span>
                  <span className="log-feed-action">{log.action}</span>
                  <span className="log-feed-time">{formatRelativeTime(log.createdAt)}</span>
                </div>
              </motion.div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prec</button>
              <span className="mono">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Succ</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- ONLINE USERS PANEL ----
function OnlineUsersPanel() {
  const { onlineUserIds } = usePresence();
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (onlineUserIds.size === 0) { setUsers([]); return; }
    api.post('/admin/users/batch', { ids: [...onlineUserIds] })
      .then(r => setUsers(r.data))
      .catch(() => {});
  }, [onlineUserIds]);

  return (
    <div className="dashboard-activity-card">
      <h3>Online adesso <span className="online-count-badge">{onlineUserIds.size}</span></h3>
      <div className="online-users-grid">
        {users.map(user => (
          <Link key={user.id} to={`/profile/${user.id}`} className="online-user-chip">
            <div className="avatar-wrapper">
              {user.avatarUrl ? (
                <img src={getUploadUrl(user.avatarUrl)} alt="" className="online-user-avatar" />
              ) : (
                <div className="avatar-placeholder" style={{ width: 32, height: 32, fontSize: 13 }}>
                  {user.displayName?.[0]?.toUpperCase()}
                </div>
              )}
              <OnlineBadge userId={user.id} size="sm" />
            </div>
            <span className="online-user-name">{user.displayName}</span>
          </Link>
        ))}
        {users.length === 0 && (
          <p className="text-secondary" style={{ padding: 8 }}>Nessun utente online</p>
        )}
      </div>
    </div>
  );
}

// ---- DASHBOARD TAB ----
function DashboardTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { onlineUserIds } = usePresence();

  useEffect(() => {
    api.get('/admin/dashboard').then(({ data }) => {
      setData(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="admin-tab">
        <h2>Dashboard</h2>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12, borderRadius: 12 }} />)}
      </div>
    );
  }

  if (!data) return <div className="admin-tab"><h2>Dashboard</h2><p>Errore caricamento</p></div>;

  const s = data.stats;
  const liveOnline = onlineUserIds.size;

  const actionIcons = {
    BET_PLACED: '🎲', MARKET_RESOLVED: '🏆', BALANCE_ADJUSTED: '💸',
    MARKET_CREATED: '🎯', USER_CREATED: '👤', BET_WON: '🏆', BET_LOST: '❌',
    USER_SUSPENDED: '🚫', USER_UNSUSPENDED: '✅', PASSWORD_CHANGED: '🔑',
    ODDS_OVERRIDE: '📊', USER_UPDATED: '✏️', USER_DELETED: '🗑️',
  };

  const row1 = [
    { label: 'Utenti', value: s.totalUsers, icon: '👥', color: 'var(--accent-green)', sub: 'totali' },
    { label: 'Online', value: liveOnline, icon: '🟢', color: '#22c55e', sub: 'adesso' },
    { label: 'Mercati', value: `${s.openMarkets} aperti`, icon: '🎯', color: 'var(--accent-violet)', sub: `${s.closedMarkets} chiusi` },
    { label: 'Volume', value: formatCurrency(s.totalVolume), icon: '💸', color: 'var(--accent-green)', sub: 'totale pool' },
  ];

  const row2 = [
    { label: 'Bet oggi', value: s.betsToday, icon: '🎲', color: 'var(--accent-orange)', sub: 'piazzate' },
    { label: 'Vinto oggi', value: formatCurrency(s.totalWonToday), icon: '💰', color: 'var(--accent-green)', sub: 'dagli utenti' },
    { label: 'Mercato + attivo', value: data.topMarket?.title?.substring(0, 20) || '-', icon: '🔥', color: 'var(--accent-orange)', sub: data.topMarket ? `${data.topMarket._count?.entries || 0} bet` : '' },
    { label: 'Utente + attivo', value: data.topUser?.displayName || '-', icon: '📈', color: 'var(--accent-violet)', sub: data.topUser ? `${data.topUser._count?.bets || 0} bet` : '' },
  ];

  return (
    <div className="admin-tab">
      <h2>Dashboard</h2>

      {/* Stat cards row 1 */}
      <div className="dashboard-stats">
        {row1.map((card, i) => (
          <motion.div key={card.label} className="dashboard-stat-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className="dashboard-stat-icon">{card.icon}</span>
            <span className="dashboard-stat-value mono" style={{ color: card.color }}>{card.value}</span>
            <span className="dashboard-stat-label">{card.label}</span>
            {card.sub && <span className="dashboard-stat-sub">{card.sub}</span>}
          </motion.div>
        ))}
      </div>

      {/* Stat cards row 2 */}
      <div className="dashboard-stats">
        {row2.map((card, i) => (
          <motion.div key={card.label} className="dashboard-stat-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
            <span className="dashboard-stat-icon">{card.icon}</span>
            <span className="dashboard-stat-value mono" style={{ color: card.color, fontSize: card.value?.length > 15 ? 14 : undefined }}>{card.value}</span>
            <span className="dashboard-stat-label">{card.label}</span>
            {card.sub && <span className="dashboard-stat-sub">{card.sub}</span>}
          </motion.div>
        ))}
      </div>

      {/* Charts side by side */}
      <div className="dashboard-charts-row">
        {data.volumeChart && data.volumeChart.length > 0 && (
          <div className="dashboard-chart-card">
            <h3>Volume giornaliero (30gg)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.volumeChart}>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => v.slice(5)} />
                <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `${v}€`} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}
                  formatter={(value) => [formatCurrency(value), 'Volume']}
                />
                <Line type="monotone" dataKey="volume" stroke="var(--accent-green)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {data.betsChart && data.betsChart.length > 0 && (
          <div className="dashboard-chart-card">
            <h3>Bet per giorno (14gg)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.betsChart}>
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => v.slice(5)} />
                <YAxis stroke="var(--text-tertiary)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13 }}
                  formatter={(value) => [value, 'Bet']}
                />
                <Bar dataKey="count" fill="var(--accent-violet)" radius={[4, 4, 0, 0]} opacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Online users panel */}
      <OnlineUsersPanel />

      {/* Activity feed */}
      {data.recentLogs && data.recentLogs.length > 0 && (
        <div className="dashboard-activity-card">
          <h3>Attività Recente</h3>
          <div className="activity-feed">
            {data.recentLogs.map((item, i) => (
              <div key={item.id || i} className="activity-item">
                <span className="activity-icon">{actionIcons[item.action] || '📌'}</span>
                <Link to={`/profile/${item.user?.id}`} className="activity-user">{item.user?.displayName}</Link>
                <span className="activity-action">{item.action?.replace(/_/g, ' ')}</span>
                <span className="activity-time">{formatRelativeTime(item.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- SETTINGS TAB ----
function SettingsTab() {
  const [config, setConfig] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [siteName, setSiteName] = useState('');
  const [marketMargin, setMarketMargin] = useState('');
  const [initialBalance, setInitialBalance] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/admin/config');
        setConfig(data);
        setSiteName(data.site_name || 'Chill No Presura');
        setMarketMargin(data.market_margin || '0.05');
        setInitialBalance(data.initial_balance || '1000');
      } catch (err) {
        setError('Impossibile caricare le impostazioni: ' + (err.response?.data?.error || err.message));
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/admin/config', {
        site_name: siteName,
        market_margin: marketMargin,
        initial_balance: initialBalance,
      });
      toast.success('Impostazioni salvate!');
    } catch (err) {
      toast.error('Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  // Stato loading
  if (config === null && !error) {
    return (
      <div className="admin-tab">
        <h2>Impostazioni</h2>
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 50, marginBottom: 8, borderRadius: 8 }} />)}
        <p className="text-secondary" style={{ textAlign: 'center', marginTop: 12 }}>Caricamento impostazioni...</p>
      </div>
    );
  }

  // Stato errore
  if (error) {
    return (
      <div className="admin-tab">
        <h2>Impostazioni</h2>
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--accent-orange)', marginBottom: 12 }}>{error}</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Riprova</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-tab">
      <div className="tab-header">
        <h2>Impostazioni Globali</h2>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio...' : 'Salva Impostazioni'}
        </button>
      </div>

      <div className="settings-list">
        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">Nome del sito</label>
            <span className="setting-desc">Nome visualizzato nel sito</span>
          </div>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            className="setting-input"
          />
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">House margin (es. 0.05 = 5%)</label>
            <span className="setting-desc">Percentuale trattenuta dal pool su ogni mercato</span>
          </div>
          <input
            type="number"
            step="0.01"
            min="0"
            max="0.2"
            value={marketMargin}
            onChange={(e) => setMarketMargin(e.target.value)}
            className="setting-input mono"
          />
        </div>
        <div className="setting-item">
          <div className="setting-info">
            <label className="setting-label">Saldo iniziale nuovi utenti</label>
            <span className="setting-desc">Saldo assegnato automaticamente ai nuovi utenti</span>
          </div>
          <input
            type="number"
            min="0"
            value={initialBalance}
            onChange={(e) => setInitialBalance(e.target.value)}
            className="setting-input mono"
          />
        </div>
      </div>
    </div>
  );
}

// ---- NOTIFICATIONS TAB ----
function NotificationsTab() {
  const [type, setType] = useState('BANNER');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [autoClose, setAutoClose] = useState(true);
  const [autoCloseSec, setAutoCloseSec] = useState(5);
  const [targetAll, setTargetAll] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [sending, setSending] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!message.trim()) { toast.error('Inserisci un messaggio'); return; }
    if (!targetAll && selectedUsers.length === 0) {
      toast.error('Seleziona almeno un destinatario');
      return;
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('type', type);
      if (title.trim()) formData.append('title', title.trim());
      formData.append('message', message.trim());
      formData.append('autoClose', String(autoClose));
      if (autoClose) formData.append('autoCloseSec', String(autoCloseSec));
      formData.append('targetAll', String(targetAll));
      if (!targetAll) {
        selectedUsers.forEach(id => formData.append('targetUserIds[]', String(id)));
      }
      if (imageFile) formData.append('image', imageFile);
      else if (imageUrl.trim()) formData.append('imageUrl', imageUrl.trim());

      const { data } = await api.post('/admin/notifications', formData);
      toast.success(`Notifica inviata a ${data.recipientCount} utenti`);
      setTitle(''); setMessage(''); setImageUrl('');
      setImageFile(null); setSelectedUsers([]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore invio');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-tab">
      <div className="tab-header">
        <h2>Invia Notifica</h2>
      </div>

      {/* Tipo */}
      <div className="notif-type-toggle">
        <button
          className={`type-btn ${type === 'BANNER' ? 'active' : ''}`}
          onClick={() => setType('BANNER')}
        >
          <span className="type-btn-icon">🔔</span>
          <span className="type-btn-label">Banner</span>
          <span className="type-btn-desc">In alto a destra, non invasivo</span>
        </button>
        <button
          className={`type-btn ${type === 'MODAL' ? 'active' : ''}`}
          onClick={() => setType('MODAL')}
        >
          <span className="type-btn-icon">📣</span>
          <span className="type-btn-label">Modal urgente</span>
          <span className="type-btn-desc">Blocca lo schermo, richiede conferma</span>
        </button>
      </div>

      {/* Titolo */}
      <div className="form-group">
        <label>Titolo <span className="text-secondary" style={{ fontWeight: 400, fontSize: 12 }}>(opzionale)</span></label>
        <input className="input-field" placeholder="Es: Nuovo pronostico!" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      {/* Messaggio */}
      <div className="form-group">
        <label>Messaggio *</label>
        <textarea className="input-field" rows={3} placeholder="Scrivi il messaggio..." value={message} onChange={e => setMessage(e.target.value)} />
      </div>

      {/* Immagine */}
      <div className="form-group">
        <label>Immagine <span className="text-secondary" style={{ fontWeight: 400, fontSize: 12 }}>(opzionale)</span></label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input type="text" className="input-field" placeholder="URL immagine o GIF" value={imageUrl} onChange={e => { setImageUrl(e.target.value); setImageFile(null); }} style={{ flex: 1 }} />
          <button type="button" className="btn-gif" onClick={() => setShowGifPicker(true)}>GIF</button>
        </div>
        <CustomFileUpload
          onFile={(file) => { setImageFile(file); setImageUrl(''); }}
          accept="image/*"
          preview={imageFile ? URL.createObjectURL(imageFile) : (imageUrl || null)}
        />
      </div>

      {showGifPicker && (
        <GifPicker
          onSelect={(url) => { setImageUrl(url); setImageFile(null); setShowGifPicker(false); }}
          onClose={() => setShowGifPicker(false)}
        />
      )}

      {/* Chiusura automatica */}
      <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <CustomToggle
          checked={autoClose}
          onChange={e => setAutoClose(e.target.checked)}
          label="Chiusura automatica"
        />
        {autoClose && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              className="input-field mono"
              style={{ width: 70, padding: '6px 10px' }}
              value={autoCloseSec}
              min={3} max={60}
              onChange={e => setAutoCloseSec(parseInt(e.target.value) || 5)}
            />
            <span className="text-secondary" style={{ fontSize: 13 }}>secondi</span>
          </div>
        )}
      </div>

      {/* Destinatari */}
      <div className="form-group">
        <label>Destinatari</label>
        <div className="notif-target-toggle">
          <button className={`target-btn ${targetAll ? 'active' : ''}`} onClick={() => setTargetAll(true)}>
            Tutti gli utenti
          </button>
          <button className={`target-btn ${!targetAll ? 'active' : ''}`} onClick={() => setTargetAll(false)}>
            Seleziona utenti
          </button>
        </div>
        {!targetAll && (
          <div className="notif-user-select-list">
            {users.map(u => (
              <div key={u.id} className="notif-user-checkbox" onClick={() => {
                if (selectedUsers.includes(u.id)) setSelectedUsers(prev => prev.filter(id => id !== u.id));
                else setSelectedUsers(prev => [...prev, u.id]);
              }}>
                <CustomCheckbox
                  checked={selectedUsers.includes(u.id)}
                  onChange={() => {
                    if (selectedUsers.includes(u.id)) setSelectedUsers(prev => prev.filter(id => id !== u.id));
                    else setSelectedUsers(prev => [...prev, u.id]);
                  }}
                />
                <span className="notif-user-avatar">
                  {u.avatarUrl ? (
                    <img src={getUploadUrl(u.avatarUrl)} alt="" />
                  ) : (
                    <span className="avatar-placeholder" style={{ width: 28, height: 28, fontSize: 11 }}>
                      {u.displayName?.[0]?.toUpperCase()}
                    </span>
                  )}
                </span>
                <span>{u.displayName}</span>
                <span className="text-secondary" style={{ fontSize: 12 }}>@{u.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Anteprima */}
      {message && (
        <div className="notif-preview-box">
          <span className="text-secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Anteprima</span>
          <div className={`notif-preview-card ${type.toLowerCase()}`}>
            {title && <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 4px', color: 'var(--text-primary)' }}>{title}</p>}
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{message}</p>
          </div>
        </div>
      )}

      <button
        className="btn-primary"
        style={{ width: '100%', marginTop: 16, padding: '14px' }}
        onClick={handleSend}
        disabled={sending}
      >
        {sending ? 'Invio in corso...' : `Invia a ${targetAll ? 'tutti' : selectedUsers.length + ' utenti'}`}
      </button>
    </div>
  );
}

const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

function AdminRouletteTab() {
  const [active, setActive] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [intervalSec, setIntervalSec] = useState(20);
  const [overrideNum, setOverrideNum] = useState(null);

  useEffect(() => {
    api
      .get('/roulette/state')
      .then(({ data }) => {
        if (data.active && data.session) {
          setActive(true);
          setSessionId(data.session.id);
          setIntervalSec(data.session.intervalSec ?? 20);
        } else {
          setActive(false);
          setSessionId(null);
        }
      })
      .catch(() => {});
  }, []);

  const start = async () => {
    try {
      const { data } = await api.post('/roulette/admin/start', { intervalSec });
      setSessionId(data.sessionId);
      setActive(true);
      setOverrideNum(null);
      toast.success('Sessione avviata');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore avvio sessione');
    }
  };

  const stop = async () => {
    try {
      await api.post('/roulette/admin/stop', {});
      setActive(false);
      setSessionId(null);
      setOverrideNum(null);
      toast.success('Sessione chiusa');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore chiusura');
    }
  };

  const setOverride = async (n) => {
    try {
      await api.put('/roulette/admin/override', { number: n });
      setOverrideNum(n);
      toast.success(`Numero forzato: ${n} (invisibile agli utenti)`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore override');
    }
  };

  const clearOverride = async () => {
    try {
      await api.put('/roulette/admin/override', { number: -1 });
      setOverrideNum(null);
      toast.success('Override rimosso — prossimo risultato casuale');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore');
    }
  };

  return (
    <div className="admin-tab">
      <div className="admin-roulette-panel">
        <h2>🎡 Controllo Roulette</h2>

        {!active ? (
          <div className="admin-roulette-start">
            <div className="form-group">
              <label>Durata fase puntate (secondi)</label>
              <input
                className="input-field"
                type="number"
                value={intervalSec}
                onChange={(e) => setIntervalSec(parseInt(e.target.value, 10) || 20)}
                min={10}
                max={120}
              />
              <p className="input-hint">
                Il ciclo sarà: {intervalSec}s puntate + 5s last call + 8s rotazione + 4s risultato ={' '}
                {intervalSec + 17}s per giro
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={start}>
              ▶ Avvia Sessione
            </button>
          </div>
        ) : (
          <div className="admin-roulette-active">
            <div className="admin-session-status">
              <span className="status-dot active" />
              <span>
                Sessione attiva {sessionId ? `#${sessionId}` : ''} — ciclo {intervalSec + 17}s
              </span>
            </div>

            <div className="admin-override-section">
              <h3>Forza numero vincente</h3>
              <p className="override-hint">
                {overrideNum !== null
                  ? `✓ Forzato: ${overrideNum} — verrà usato nel prossimo risultato`
                  : '● Casuale — nessun override impostato'}
              </p>
              <div className="admin-number-grid">
                {Array.from({ length: 37 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`admin-num ${i === 0 ? 'green' : ROULETTE_RED_NUMBERS.includes(i) ? 'red' : 'black'} ${overrideNum === i ? 'selected' : ''}`}
                    onClick={() => (overrideNum === i ? clearOverride() : setOverride(i))}
                  >
                    {i}
                  </button>
                ))}
              </div>
              {overrideNum !== null && (
                <button type="button" className="btn-small" onClick={clearOverride} style={{ marginTop: 12 }}>
                  ✕ Rimuovi override (torna casuale)
                </button>
              )}

              <button type="button" className="btn-danger" onClick={stop} style={{ marginTop: 24 }}>
                ⏹ Chiudi Sessione
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- MAIN ADMIN PAGE ----
const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'users', label: 'Utenti', icon: '👥' },
  { key: 'markets', label: 'Mercati', icon: '🎲' },
  { key: 'roulette', label: 'Roulette', icon: '🎡' },
  { key: 'notifications', label: 'Notifiche', icon: '🔔' },
  { key: 'transactions', label: 'Transazioni', icon: '💰' },
  { key: 'logs', label: 'Log', icon: '📋' },
  { key: 'settings', label: 'Impostazioni', icon: '⚙️' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="admin-page">
      <div className="admin-sidebar">
        <h2 className="admin-sidebar-title">Admin Panel</h2>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`admin-sidebar-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="sidebar-icon">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-main">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'markets' && <MarketsTab />}
        {activeTab === 'roulette' && <AdminRouletteTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'transactions' && <TransactionsTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
