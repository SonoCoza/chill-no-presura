import { useRef, useState } from 'react';

export const CustomFileUpload = ({ onFile, accept, label, preview, loading }) => {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`custom-file-upload ${dragOver ? 'drag-over' : ''} ${preview ? 'has-preview' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept || 'image/*'}
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      {preview ? (
        <div className="file-upload-preview">
          <img src={preview} alt="Preview" />
          <div className="file-upload-overlay">
            <span>Cambia</span>
          </div>
        </div>
      ) : (
        <div className="file-upload-placeholder">
          {loading ? (
            <span className="file-upload-spinner" />
          ) : (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M12 3V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span>{label || 'Carica immagine'}</span>
              <span className="file-upload-hint">JPG, PNG, GIF, WebP — max 10MB</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomFileUpload;
