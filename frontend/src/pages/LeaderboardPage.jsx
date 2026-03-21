import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api, { getUploadUrl } from '../utils/api';
import { formatCurrency } from '../utils/format';
import OnlineBadge from '../components/ui/OnlineBadge';
import './LeaderboardPage.css';

export default function LeaderboardPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('balance');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/admin/users');
        setUsers(data);
      } catch (err) {
        // If not admin, try loading individual stats
        console.error('Leaderboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Exclude admin from leaderboard — infinite balance
  const sorted = [...users].filter(u => !u.isAdmin).sort((a, b) => {
    if (sortBy === 'balance') return b.balance - a.balance;
    if (sortBy === 'bets') return (b._count?.bets || 0) - (a._count?.bets || 0);
    return 0;
  });

  const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const podiumEmojis = ['🥇', '🥈', '🥉'];

  if (loading) {
    return (
      <div className="leaderboard-page">
        <h1 className="page-title">Classifica</h1>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="leaderboard-page">
      <div className="leaderboard-header">
        <h1 className="page-title">Classifica</h1>
        <div className="filters">
          <button className={`filter-btn ${sortBy === 'balance' ? 'active' : ''}`} onClick={() => setSortBy('balance')}>
            Per Saldo
          </button>
          <button className={`filter-btn ${sortBy === 'bets' ? 'active' : ''}`} onClick={() => setSortBy('bets')}>
            Per Scommesse
          </button>
        </div>
      </div>

      {/* Podium */}
      {sorted.length >= 3 && (
        <div className="podium">
          {[1, 0, 2].map((rank) => {
            const u = sorted[rank];
            if (!u) return null;
            return (
              <motion.div
                key={u.id}
                className={`podium-item rank-${rank}`}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: rank * 0.15, duration: 0.4 }}
              >
                <div className="podium-medal" style={{ color: podiumColors[rank] }}>
                  {podiumEmojis[rank]}
                </div>
                <Link to={`/profile/${u.id}`} className="podium-avatar">
                  {u.avatarUrl ? (
                    <img src={getUploadUrl(u.avatarUrl)} alt="" />
                  ) : (
                    <div className="avatar-placeholder" style={{ width: rank === 0 ? 64 : 48, height: rank === 0 ? 64 : 48, fontSize: rank === 0 ? 24 : 18 }}>
                      {u.displayName?.[0]?.toUpperCase()}
                    </div>
                  )}
                </Link>
                <span className="podium-name">{u.displayName}</span>
                <span className="podium-balance mono">{formatCurrency(u.balance)}</span>
                <div className="podium-bar" style={{
                  height: rank === 0 ? 120 : rank === 1 ? 80 : 60,
                  background: `linear-gradient(180deg, ${podiumColors[rank]}33, transparent)`,
                  borderTop: `2px solid ${podiumColors[rank]}`,
                }} />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Full list */}
      <div className="leaderboard-list">
        {sorted.map((u, i) => (
          <motion.div
            key={u.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <Link to={`/profile/${u.id}`} className="leaderboard-row">
              <span className="lb-rank mono">{i + 1}</span>
              <div className="avatar-wrapper lb-avatar">
                {u.avatarUrl ? (
                  <img src={getUploadUrl(u.avatarUrl)} alt="" />
                ) : (
                  <div className="avatar-placeholder" style={{ width: 36, height: 36, fontSize: 14 }}>
                    {u.displayName?.[0]?.toUpperCase()}
                  </div>
                )}
                <OnlineBadge userId={u.id} size="sm" />
              </div>
              <div className="lb-info">
                <span className="lb-name">{u.displayName}</span>
                <span className="lb-username">@{u.username}</span>
              </div>
              <span className="lb-bets mono">{u._count?.bets || 0} bet</span>
              <span className="lb-balance mono">{formatCurrency(u.balance)}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
