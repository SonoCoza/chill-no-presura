import { useState, useEffect, useRef } from 'react';
import './CustomSelect.css';

function ChevronIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function CustomSelect({ options, value, onChange, placeholder = 'Seleziona...' }) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef(null);

  // Click outside
  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reset focus index when opening
  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value);
      setFocusedIndex(idx >= 0 ? idx : 0);
    }
  }, [open]);

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(i => (i + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(i => (i - 1 + options.length) % options.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < options.length) {
          onChange(options[focusedIndex].value);
          setOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const selectedLabel = value ? options.find(o => o.value === value)?.label : null;

  return (
    <div ref={ref} className="custom-select" data-open={open} onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="custom-select__trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedLabel ? '' : 'custom-select__placeholder'}>
          {selectedLabel || placeholder}
        </span>
        <ChevronIcon className={`chevron ${open ? 'rotated' : ''}`} />
      </button>
      {open && (
        <ul className="custom-select__dropdown" role="listbox">
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={value === opt.value}
              className={`custom-select__option ${value === opt.value ? 'selected' : ''} ${focusedIndex === i ? 'focused' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              onMouseEnter={() => setFocusedIndex(i)}
            >
              {opt.icon && <span className="option-icon">{opt.icon}</span>}
              {opt.label}
              {value === opt.value && <CheckIcon className="check-icon" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
