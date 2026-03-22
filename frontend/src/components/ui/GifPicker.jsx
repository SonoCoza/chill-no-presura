import { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';

const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPzR7Asnm41V_9mc';

export const GifPicker = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nextPos, setNextPos] = useState('');
  const searchRef = useRef(null);

  const fetchGifs = useCallback(async (searchQuery, pos = '') => {
    setLoading(true);
    try {
      const API_KEY = import.meta.env.VITE_TENOR_API_KEY || TENOR_KEY;
      const baseUrl = 'https://tenor.googleapis.com/v2';
      const params = new URLSearchParams({
        key: API_KEY,
        limit: '20',
        media_filter: 'gif',
        contentfilter: 'medium',
        ...(pos && { pos }),
      });

      const url = searchQuery
        ? `${baseUrl}/search?q=${encodeURIComponent(searchQuery)}&${params}`
        : `${baseUrl}/featured?${params}`;

      const res = await fetch(url);

      if (!res.ok) {
        console.error('Tenor API error:', res.status, await res.text());
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!data.results || data.results.length === 0) {
        if (!pos) setGifs([]);
        setLoading(false);
        return;
      }

      const newGifs = data.results.map(r => {
        const formats = r.media_formats || {};
        const gifUrl =
          formats.gif?.url ||
          formats.mediumgif?.url ||
          formats.tinygif?.url ||
          formats.nanogif?.url ||
          null;
        const preview =
          formats.tinygif?.url ||
          formats.nanogif?.url ||
          formats.gif?.url ||
          null;
        return { id: r.id, url: gifUrl, preview: preview || gifUrl, title: r.title || '' };
      }).filter(g => g.url && g.preview);

      setGifs(prev => pos ? [...prev, ...newGifs] : newGifs);
      setNextPos(data.next || '');
    } catch (err) {
      console.error('Tenor fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carica trending all'apertura
  useEffect(() => {
    fetchGifs('');
    searchRef.current?.focus();
  }, []);

  // Debounce ricerca
  useEffect(() => {
    const timer = setTimeout(() => {
      setGifs([]);
      fetchGifs(query);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, fetchGifs]);

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <div className="gif-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="gif-picker" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="gif-picker-header">
          <div className="gif-picker-search">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#6b6b80" strokeWidth="1.5"/>
              <path d="M11 11L14 14" stroke="#6b6b80" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Cerca GIF..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="gif-search-input"
            />
            {query && (
              <button onClick={() => setQuery('')} className="gif-clear-btn">&times;</button>
            )}
          </div>
          <button className="gif-close-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Label Tenor */}
        <div className="gif-powered">
          <span>Powered by</span>
          <strong>TENOR</strong>
        </div>

        {/* Grid GIF */}
        <div className="gif-grid">
          {loading && gifs.length === 0 ? (
            <div className="gif-loading">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="gif-skeleton" />
              ))}
            </div>
          ) : gifs.length === 0 ? (
            <div className="gif-empty">Nessun risultato per &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              {gifs.map(gif => (
                <button
                  key={gif.id}
                  className="gif-item"
                  onClick={() => { onSelect(gif.url); onClose(); }}
                  title={gif.title}
                >
                  <img
                    src={gif.preview}
                    alt={gif.title}
                    loading="lazy"
                  />
                </button>
              ))}
              {nextPos && (
                <button
                  className="gif-load-more"
                  onClick={() => fetchGifs(query, nextPos)}
                  disabled={loading}
                >
                  {loading ? 'Caricamento...' : 'Carica altri'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GifPicker;
