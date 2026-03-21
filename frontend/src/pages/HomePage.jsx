import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../utils/api';
import useSocket from '../hooks/useSocket';
import MarketCard from '../components/MarketCard';
import CreateMarketModal from '../components/CreateMarketModal';
import './HomePage.css';

const FILTERS = [
  { key: '', label: 'Tutti' },
  { key: 'OPEN', label: 'Aperti' },
  { key: 'CLOSED', label: 'Chiusi' },
  { key: 'RESOLVED', label: 'Risolti' },
];

export default function HomePage() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { socket } = useSocket();

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter) params.status = filter;
      const { data } = await api.get('/markets', { params });
      setMarkets(data);
    } catch (err) {
      console.error('Load markets error:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  // Socket.IO listeners
  useEffect(() => {
    if (!socket) return;

    const handleNewMarket = (market) => {
      // Deduplica per ID — safety net
      setMarkets(prev => {
        if (prev.some(m => m.id === market.id)) return prev;
        return [market, ...prev];
      });
    };

    const handleOddsUpdated = ({ marketId, options }) => {
      setMarkets(prev => prev.map(m =>
        m.id === marketId ? { ...m, options: m.options.map(o => {
          const updated = options.find(u => u.id === o.id);
          return updated ? { ...o, ...updated } : o;
        })} : m
      ));
    };

    const handleMarketResolved = ({ marketId }) => {
      setMarkets(prev => prev.map(m =>
        m.id === marketId ? { ...m, status: 'RESOLVED' } : m
      ));
    };

    const handleMarketClosed = ({ marketId }) => {
      setMarkets(prev => prev.map(m =>
        m.id === marketId ? { ...m, status: 'CLOSED' } : m
      ));
    };

    const handleMarketUpdated = ({ market, marketId }) => {
      setMarkets(prev => prev.map(m =>
        m.id === (market?.id || marketId) ? { ...m, ...market } : m
      ));
    };

    const handleMarketDeleted = ({ marketId }) => {
      setMarkets(prev => prev.filter(m => m.id !== marketId));
    };

    socket.on('market:created', handleNewMarket);
    socket.on('market:odds_updated', handleOddsUpdated);
    socket.on('market:resolved', handleMarketResolved);
    socket.on('market:closed', handleMarketClosed);
    socket.on('market:updated', handleMarketUpdated);
    socket.on('market:deleted', handleMarketDeleted);

    return () => {
      socket.off('market:created', handleNewMarket);
      socket.off('market:odds_updated', handleOddsUpdated);
      socket.off('market:resolved', handleMarketResolved);
      socket.off('market:closed', handleMarketClosed);
      socket.off('market:updated', handleMarketUpdated);
      socket.off('market:deleted', handleMarketDeleted);
    };
  }, [socket]);

  const filteredMarkets = markets;

  return (
    <div className="home-page">
      <div className="home-header">
        <h1 className="page-title display-font">Mercati</h1>
        <div className="home-header-actions">
          <button className="create-market-btn" onClick={() => setShowCreateModal(true)}>
            + Crea Pronostico
          </button>
          <div className="filters">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="markets-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton market-skeleton" />
          ))}
        </div>
      ) : filteredMarkets.length === 0 ? (
        <motion.div className="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p>Nessun mercato trovato</p>
        </motion.div>
      ) : (
        <div className="markets-grid">
          {filteredMarkets.map((market, i) => (
            <MarketCard key={market.id} market={market} index={i} />
          ))}
        </div>
      )}

      {/* Mobile FAB */}
      <button className="fab-create" onClick={() => setShowCreateModal(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <CreateMarketModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}
