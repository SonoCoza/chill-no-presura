import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';
import api, { getUploadUrl } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, formatDateShort, formatRelativeTime } from '../utils/format';
import OnlineBadge from '../components/ui/OnlineBadge';
import './ProfilePage.css';

function BalanceChart({ data }) {
  if (!data || data.length === 0) return <p className="text-secondary">Nessun dato disponibile</p>;

  const currentBalance = data[data.length - 1]?.balance || 0;
  const lineColor = currentBalance >= (data[0]?.balance || 0) ? '#b5ff4d' : '#ef4444';

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDateShort(v)}
          stroke="var(--text-tertiary)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="var(--text-tertiary)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}€`}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-primary)',
            fontSize: 13,
          }}
          formatter={(value) => [formatCurrency(value), 'Saldo']}
          labelFormatter={(v) => formatDateShort(v)}
        />
        <Area
          type="monotone"
          dataKey="balance"
          stroke={lineColor}
          strokeWidth={2}
          fill="url(#balanceGradient)"
          dot={false}
          activeDot={{ r: 4, fill: lineColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function AvatarUpload({ currentUrl, onUploaded }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const { data } = await api.post('/users/me/avatar', formData);
      onUploaded(data.avatarUrl);
      toast.success('Avatar aggiornato!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore caricamento avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="avatar-upload-wrap" onClick={() => fileRef.current?.click()}>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} hidden />
      <div className="avatar-upload-overlay">
        {uploading ? '...' : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
      </div>
    </div>
  );
}

function EditableDisplayName({ value, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    if (!name.trim() || name === value) {
      setEditing(false);
      setName(value);
      return;
    }
    setSaving(true);
    try {
      await api.put('/users/me', { displayName: name.trim() });
      onSaved(name.trim());
      toast.success('Nome aggiornato!');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore aggiornamento');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="editable-name-form">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') { setEditing(false); setName(value); }
          }}
          className="editable-name-input input-field"
          maxLength={30}
          disabled={saving}
        />
        <button className="editable-name-save" onClick={handleSave} disabled={saving}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <button className="editable-name-cancel" onClick={() => { setEditing(false); setName(value); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="editable-name-row">
      <h1 className="profile-name">{value}</h1>
      <button className="edit-name-btn" onClick={() => setEditing(true)} title="Modifica nome">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </div>
  );
}

function PasswordChangeForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error('Le password non corrispondono');
      return;
    }
    if (form.newPassword.length < 6) {
      toast.error('La nuova password deve avere almeno 6 caratteri');
      return;
    }
    setSaving(true);
    try {
      await api.put('/users/me/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success('Password aggiornata!');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowForm(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore aggiornamento password');
    } finally {
      setSaving(false);
    }
  };

  if (!showForm) {
    return (
      <button className="change-pwd-toggle" onClick={() => setShowForm(true)}>
        Cambia Password
      </button>
    );
  }

  return (
    <form className="change-pwd-form" onSubmit={handleSubmit}>
      <h4>Cambia Password</h4>
      <input
        className="input-field"
        type="password"
        placeholder="Password attuale"
        value={form.currentPassword}
        onChange={(e) => setForm(p => ({ ...p, currentPassword: e.target.value }))}
        required
      />
      <input
        className="input-field"
        type="password"
        placeholder="Nuova password"
        value={form.newPassword}
        onChange={(e) => setForm(p => ({ ...p, newPassword: e.target.value }))}
        required
        minLength={6}
      />
      <input
        className="input-field"
        type="password"
        placeholder="Conferma nuova password"
        value={form.confirmPassword}
        onChange={(e) => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
        required
      />
      <div className="change-pwd-actions">
        <button type="button" className="btn-cancel" onClick={() => setShowForm(false)}>Annulla</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Salvando...' : 'Salva'}
        </button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const { id } = useParams();
  const { user: currentUser, refreshUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = currentUser?.id === parseInt(id);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [profileRes, statsRes] = await Promise.all([
          api.get(`/users/${id}`),
          api.get(`/users/${id}/stats`),
        ]);
        setProfile(profileRes.data);
        setStats(statsRes.data);
      } catch (err) {
        console.error('Load profile error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleAvatarUploaded = (avatarUrl) => {
    setProfile(p => ({ ...p, avatarUrl }));
    if (refreshUser) refreshUser();
  };

  const handleNameSaved = (displayName) => {
    setProfile(p => ({ ...p, displayName }));
    if (refreshUser) refreshUser();
  };

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
        <div className="skeleton" style={{ width: 200, height: 24, borderRadius: 8, marginTop: 12 }} />
      </div>
    );
  }

  if (!profile) return <div className="empty-state">Utente non trovato</div>;

  return (
    <div className="profile-page">
      <motion.div
        className="profile-header-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="profile-avatar-section">
          <div className="profile-avatar-large">
            {profile.avatarUrl ? (
              <img src={getUploadUrl(profile.avatarUrl)} alt="" />
            ) : (
              <div className="avatar-placeholder large">{profile.displayName?.[0]?.toUpperCase()}</div>
            )}
            {isOwnProfile && <AvatarUpload currentUrl={profile.avatarUrl} onUploaded={handleAvatarUploaded} />}
          </div>
          <div className="profile-online-badge">
            <OnlineBadge userId={parseInt(id)} size="lg" showLabel={true} />
          </div>
        </div>
        <div className="profile-info">
          {isOwnProfile ? (
            <EditableDisplayName value={profile.displayName} onSaved={handleNameSaved} />
          ) : (
            <h1 className="profile-name">{profile.displayName}</h1>
          )}
          <p className="profile-username">@{profile.username}</p>
        </div>
        {isOwnProfile && (
          <div className="profile-balance-big">
            <span className="profile-balance-label">Il tuo saldo</span>
            <span className="profile-balance-value mono">{formatCurrency(profile.balance)}</span>
          </div>
        )}
      </motion.div>

      {isOwnProfile && (
        <div className="profile-settings-card">
          <PasswordChangeForm />
        </div>
      )}

      {stats && (
        <>
          <div className="stats-grid">
            {[
              { label: 'Scommesse Totali', value: stats.totalBets, color: 'var(--text-primary)' },
              { label: 'Vinte', value: stats.wonBets, color: 'var(--accent-green)' },
              { label: 'Perse', value: stats.lostBets, color: 'var(--accent-red)' },
              { label: 'Win Rate', value: `${stats.winRate}%`, color: 'var(--accent-violet)' },
              { label: 'Tot Scommesso', value: formatCurrency(stats.totalWagered), color: 'var(--accent-orange)' },
              { label: 'Profitto Netto', value: formatCurrency(stats.netProfit), color: stats.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                className="stat-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <span className="stat-card-label">{stat.label}</span>
                <span className="stat-card-value mono" style={{ color: stat.color }}>{stat.value}</span>
              </motion.div>
            ))}
          </div>

          <div className="profile-chart-card">
            <h3 className="section-title">Andamento Saldo</h3>
            <BalanceChart data={stats.balanceHistory} />
          </div>
        </>
      )}

      <div className="profile-bets-card">
        <h3 className="section-title">Scommesse Recenti</h3>
        {profile.bets?.length === 0 ? (
          <p className="text-secondary">Nessuna scommessa</p>
        ) : (
          <div className="bets-list">
            {profile.bets?.map((bet, i) => (
              <motion.div
                key={bet.id}
                className={`bet-row ${bet.status.toLowerCase()}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <div className="bet-row-info">
                  <Link to={`/market/${bet.market?.id}`} className="bet-market-title">
                    {bet.market?.title}
                  </Link>
                  <span className="bet-option-name">{bet.option?.label}</span>
                </div>
                <div className="bet-row-right">
                  <span className="bet-amount mono">{formatCurrency(bet.amount)}</span>
                  <span className="bet-odds mono">@{bet.oddsAtTime?.toFixed(2) || '?'}</span>
                  <span className={`bet-result-value ${bet.status.toLowerCase()}`}>
                    {bet.status === 'PENDING' && <span className="bht-potential">→ {formatCurrency(bet.potentialWin)}</span>}
                    {bet.status === 'WON' && <span className="bht-won">+{formatCurrency(bet.potentialWin)}</span>}
                    {bet.status === 'LOST' && <span className="bht-lost">-{formatCurrency(bet.amount)}</span>}
                  </span>
                  <span className={`bet-status-badge ${bet.status.toLowerCase()}`}>{
                    bet.status === 'WON' ? 'Vinta' : bet.status === 'LOST' ? 'Persa' : 'In corso'
                  }</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
