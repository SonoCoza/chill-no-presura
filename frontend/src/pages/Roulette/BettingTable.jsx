import { useState, useMemo } from 'react';
import { getNumberColor, formatMoney } from './rouletteConstants';
import './BettingTable.css';

export default function BettingTable({ onBet, disabled, bets = [], myBets = [], balance = 0 }) {
  const [amount, setAmount] = useState(10);
  const QUICK = [5, 10, 25, 50, 100];

  const totalOnNumber = useMemo(() => {
    const map = {};
    bets.forEach((b) => {
      if (b.betType === 'STRAIGHT') {
        map[b.betValue] = (map[b.betValue] || 0) + b.amount;
      }
    });
    return map;
  }, [bets]);

  const myBetKeys = useMemo(() => {
    const s = new Set();
    myBets.forEach((b) => s.add(`${b.betType}:${b.betValue}`));
    return s;
  }, [myBets]);

  const isMine = (type, value) => myBetKeys.has(`${type}:${value}`);

  const bet = (type, value) => {
    if (disabled) return;
    onBet(type, value, amount);
  };

  const formatCompact = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(Math.round(n));
  };

  return (
    <div className="betting-table-wrapper">
      <div className="amount-row">
        <div className="quick-amounts">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              className={`qa-btn ${amount === q ? 'active' : ''}`}
              onClick={() => setAmount(q)}
              disabled={disabled}
            >
              {q}€
            </button>
          ))}
          <button
            type="button"
            className={`qa-btn max ${amount === balance ? 'active' : ''}`}
            onClick={() => setAmount(Math.max(1, Math.floor(balance)))}
            disabled={disabled || balance <= 0}
          >
            MAX
          </button>
        </div>
        <input
          type="number"
          className="amount-custom-input"
          value={amount}
          min={1}
          onChange={(e) => setAmount(Math.max(1, parseFloat(e.target.value) || 1))}
          disabled={disabled}
        />
      </div>

      <div className={`casino-table ${disabled ? 'table-disabled' : ''}`}>
        <div className="table-zero">
          <button
            type="button"
            className={`num-btn green ${isMine('STRAIGHT', '0') ? 'mine' : ''}`}
            onClick={() => bet('STRAIGHT', '0')}
            disabled={disabled}
            title="35x"
          >
            <span className="num-text">0</span>
            {totalOnNumber['0'] > 0 && <span className="num-chips">{formatCompact(totalOnNumber['0'])}</span>}
          </button>
        </div>

        <div className="table-numbers">
          {Array.from({ length: 12 }, (_, row) =>
            [3, 2, 1].map((col) => {
              const n = (11 - row) * 3 + col;
              const color = getNumberColor(n);
              const mine = isMine('STRAIGHT', String(n));
              const total = totalOnNumber[String(n)] || 0;
              return (
                <button
                  key={n}
                  type="button"
                  className={`num-btn ${color} ${mine ? 'mine' : ''}`}
                  onClick={() => bet('STRAIGHT', String(n))}
                  disabled={disabled}
                  title={`${n} — 35x`}
                >
                  <span className="num-text">{n}</span>
                  {total > 0 && <span className="num-chips">{formatCompact(total)}</span>}
                </button>
              );
            })
          ).flat()}
        </div>

        <div className="outside-row dozens-row">
          {[
            ['1-12', '1ª Dozzina'],
            ['13-24', '2ª Dozzina'],
            ['25-36', '3ª Dozzina'],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={`outside-btn ${isMine('DOZEN', v) ? 'mine' : ''}`}
              onClick={() => bet('DOZEN', v)}
              disabled={disabled}
              title="3x"
            >
              {l}
              <span className="odds-label">3x</span>
            </button>
          ))}
        </div>

        <div className="outside-row col-row">
          {[
            ['col1', 'Col 1'],
            ['col2', 'Col 2'],
            ['col3', 'Col 3'],
          ].map(([v, l]) => (
            <button
              key={v}
              type="button"
              className={`outside-btn ${isMine('COLUMN', v) ? 'mine' : ''}`}
              onClick={() => bet('COLUMN', v)}
              disabled={disabled}
              title="3x"
            >
              {l}
              <span className="odds-label">3x</span>
            </button>
          ))}
        </div>

        <div className="outside-row bottom-row">
          <button
            type="button"
            className={`outside-btn ${isMine('ODD_EVEN', 'even') ? 'mine' : ''}`}
            onClick={() => bet('ODD_EVEN', 'even')}
            disabled={disabled}
            title="2x"
          >
            Pari <span className="odds-label">2x</span>
          </button>
          <button
            type="button"
            className={`outside-btn color-red ${isMine('RED_BLACK', 'red') ? 'mine' : ''}`}
            onClick={() => bet('RED_BLACK', 'red')}
            disabled={disabled}
            title="2x"
          >
            <span className="color-dot red-dot" /> Rosso <span className="odds-label">2x</span>
          </button>
          <button
            type="button"
            className={`outside-btn color-black ${isMine('RED_BLACK', 'black') ? 'mine' : ''}`}
            onClick={() => bet('RED_BLACK', 'black')}
            disabled={disabled}
            title="2x"
          >
            <span className="color-dot black-dot" /> Nero <span className="odds-label">2x</span>
          </button>
          <button
            type="button"
            className={`outside-btn ${isMine('ODD_EVEN', 'odd') ? 'mine' : ''}`}
            onClick={() => bet('ODD_EVEN', 'odd')}
            disabled={disabled}
            title="2x"
          >
            Dispari <span className="odds-label">2x</span>
          </button>
        </div>
      </div>

      {disabled && <div className="table-overlay" />}
    </div>
  );
}
