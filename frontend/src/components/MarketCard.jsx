import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatCurrency, formatOdds, getCountdown, getImpliedProbability } from '../utils/format';
import { getUploadUrl } from '../utils/api';
import { useState, useEffect } from 'react';
import './MarketCard.css';

function CountdownTimer({ closeAt }) {
  const [countdown, setCountdown] = useState(getCountdown(closeAt));

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getCountdown(closeAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [closeAt]);

  if (!countdown) return null;
  if (countdown.expired) return <span className="countdown expired">Scaduto</span>;
  return <span className="countdown mono">{countdown.text}</span>;
}

function StatusBadge({ status }) {
  const config = {
    OPEN: { label: 'Aperto', className: 'badge-open' },
    CLOSED: { label: 'Chiuso', className: 'badge-closed' },
    RESOLVED: { label: 'Risolto', className: 'badge-resolved' },
  };
  const { label, className } = config[status] || config.OPEN;
  return <span className={`status-badge ${className}`}>{label}</span>;
}

export { StatusBadge, CountdownTimer };

export default function MarketCard({ market, index = 0 }) {
  const totalPool = market.totalPool || market.options?.reduce((s, o) => s + o.totalStaked, 0) || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Link to={`/market/${market.id}`} className="market-card">
        {market.imageUrl && (
          <div className="market-card-image">
            <img src={getUploadUrl(market.imageUrl)} alt="" />
          </div>
        )}
        <div className="market-card-content">
          <div className="market-card-header">
            <StatusBadge status={market.status} />
          </div>

          <h3 className="market-card-title">{market.title}</h3>

          <div className="market-card-options">
            {market.options?.map((option) => {
              const odds = option.odds || 0;
              let oddsClass = 'odds-favorite';
              if (odds >= 2 && odds < 3.5) oddsClass = 'odds-medium';
              else if (odds >= 3.5 && odds < 8) oddsClass = 'odds-high';
              else if (odds >= 8) oddsClass = 'odds-longshot';
              return (
                <div key={option.id} className="option-pill">
                  <span className="option-label">{option.label}</span>
                  <span className={`option-odds mono ${oddsClass}`}>
                    {formatOdds(option.odds)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="market-card-footer">
            <span className="market-pool mono">{formatCurrency(totalPool)} pool</span>
            {market.closeAt && market.status === 'OPEN' && (
              <CountdownTimer closeAt={market.closeAt} />
            )}
            <span className="market-bets">{market.totalBets || market.entries?.length || 0} bet</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
