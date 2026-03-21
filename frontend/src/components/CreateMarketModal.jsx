import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { getCountdown } from '../utils/format';
import DateTimePicker from './ui/DateTimePicker';
import './CreateMarketModal.css';

export default function CreateMarketModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    closeAt: '',
    options: [{ label: '' }, { label: '' }],
  });
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageTab, setImageTab] = useState('upload');
  const [bannerPreviewError, setBannerPreviewError] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // Reset preview error when URL changes
  useEffect(() => setBannerPreviewError(false), [imageUrl]);

  const resetForm = () => {
    setForm({ title: '', description: '', closeAt: '', options: [{ label: '' }, { label: '' }] });
    setImageFile(null);
    setImageUrl('');
    setImagePreview(null);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (file) => {
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setImageUrl('');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileChange(file);
  };

  const isGifUrl = (url) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.gif') || lower.includes('tenor.com') || lower.includes('giphy.com') || lower.includes('media.tenor') || lower.includes('media.giphy');
  };

  const handleUrlPreview = (url) => {
    setImageUrl(url);
    setImageFile(null);
    if (url) setImagePreview(url);
    else setImagePreview(null);
  };

  const addOption = () => {
    if (form.options.length >= 8) return;
    setForm(p => ({ ...p, options: [...p.options, { label: '' }] }));
  };

  const removeOption = (i) => {
    if (form.options.length <= 2) return;
    setForm(p => ({ ...p, options: p.options.filter((_, idx) => idx !== i) }));
  };

  const updateOption = (i, val) => {
    setForm(p => {
      const opts = [...p.options];
      opts[i] = { ...opts[i], label: val };
      return { ...p, options: opts };
    });
  };

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Titolo richiesto';
    if (form.title.length > 120) errs.title = 'Max 120 caratteri';
    if (form.description.length > 500) errs.description = 'Max 500 caratteri';
    if (!form.closeAt) errs.closeAt = 'Data chiusura richiesta';
    else if (new Date(form.closeAt) <= new Date()) errs.closeAt = 'Deve essere nel futuro';

    const validOptions = form.options.filter(o => o.label.trim());
    if (validOptions.length < 2) errs.options = 'Servono almeno 2 opzioni';

    form.options.forEach((o, i) => {
      if (o.label.length > 40) errs[`option_${i}`] = 'Max 40 caratteri';
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    // Guard: prevent double-submit
    if (submitting) return;
    if (!validate()) return;
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', form.title.trim());
      if (form.description.trim()) formData.append('description', form.description.trim());
      if (form.closeAt) formData.append('closeAt', form.closeAt);

      const options = form.options.filter(o => o.label.trim()).map(o => ({ label: o.label.trim() }));
      formData.append('options', JSON.stringify(options));

      if (imageFile) {
        formData.append('image', imageFile);
      } else if (imageUrl) {
        formData.append('imageUrl', imageUrl);
      }

      await api.post('/markets', formData);

      toast.success('Pronostico creato! 🎯');
      handleClose();
      // NON chiamare onCreated — ci pensa il WebSocket market:created
    } catch (err) {
      toast.error(err.response?.data?.error || 'Errore nella creazione');
      setSubmitting(false); // Only unlock on error so user can retry
    }
  };

  const closeAtCountdown = form.closeAt ? getCountdown(form.closeAt) : null;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay create-market-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className="create-market-modal"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cmm-header">
            <h2 className="display-font">Crea Pronostico</h2>
            <button className="cmm-close" onClick={handleClose}>&times;</button>
          </div>

          <div className="cmm-body">
            {/* Title */}
            <div className="form-group">
              <label>
                Titolo <span className="char-count mono">{form.title.length}/120</span>
              </label>
              <input
                className="input-field"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Es: Chi vince la partita?"
                maxLength={120}
              />
              {errors.title && <span className="field-error">{errors.title}</span>}
            </div>

            {/* Description */}
            <div className="form-group">
              <label>
                Descrizione <span className="char-count mono">{form.description.length}/500</span>
              </label>
              <textarea
                className="input-field"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Descrizione opzionale..."
                rows={3}
                maxLength={500}
              />
              {errors.description && <span className="field-error">{errors.description}</span>}
            </div>

            {/* Banner */}
            <div className="form-group">
              <label>Banner</label>
              <div className="image-tabs">
                <button className={`image-tab ${imageTab === 'upload' ? 'active' : ''}`} onClick={() => setImageTab('upload')}>Carica file</button>
                <button className={`image-tab ${imageTab === 'url' ? 'active' : ''}`} onClick={() => setImageTab('url')}>URL</button>
              </div>
              {imageTab === 'upload' ? (
                <div
                  className="drop-zone"
                  ref={dropRef}
                  onDragOver={e => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imagePreview && imageTab === 'upload' ? (
                    <img src={imagePreview} alt="" className="drop-preview" />
                  ) : (
                    <div className="drop-placeholder">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span>Trascina o clicca per caricare</span>
                      <span className="drop-hint">JPG, PNG, GIF, WebP — max 10MB</span>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={e => handleFileChange(e.target.files[0])} hidden />
                </div>
              ) : (
                <div className="banner-url-section">
                  <input
                    className="input-field"
                    value={imageUrl}
                    onChange={e => handleUrlPreview(e.target.value)}
                    placeholder="Incolla URL immagine o GIF (es. https://media.giphy.com/...)"
                  />
                  {imageUrl.length > 0 && (
                    <div className="banner-preview-box">
                      {!bannerPreviewError && (
                        <img
                          key={imageUrl}
                          src={imageUrl}
                          alt="Preview banner"
                          className="banner-preview-img"
                          onLoad={() => setBannerPreviewError(false)}
                          onError={() => setBannerPreviewError(true)}
                        />
                      )}
                      {bannerPreviewError && (
                        <div className="banner-preview-error">
                          Impossibile caricare l'anteprima. Assicurati che l'URL punti direttamente a un'immagine.
                        </div>
                      )}
                      {!bannerPreviewError && isGifUrl(imageUrl) && <span className="gif-badge">GIF</span>}
                    </div>
                  )}
                  <p className="input-hint">
                    Supporta JPG, PNG, WebP, GIF animate.<br/>
                    Per GIF da Giphy: <code>https://media.giphy.com/media/ID/giphy.gif</code><br/>
                    Per Tenor: click destro sulla GIF e "Copia indirizzo immagine"
                  </p>
                </div>
              )}
            </div>

            {/* Close date */}
            <div className="form-group">
              <label>Data chiusura</label>
              <DateTimePicker
                value={form.closeAt}
                onChange={(val) => setForm(p => ({ ...p, closeAt: val }))}
                placeholder="Seleziona data e ora di chiusura"
              />
              {closeAtCountdown && !closeAtCountdown.expired && (
                <span className="close-preview mono">Chiuderà tra {closeAtCountdown.text}</span>
              )}
              {errors.closeAt && <span className="field-error">{errors.closeAt}</span>}
            </div>

            {/* Options */}
            <div className="form-group">
              <label>Opzioni ({form.options.length}/8)</label>
              {errors.options && <span className="field-error">{errors.options}</span>}
              <div className="options-list">
                {form.options.map((o, i) => (
                  <div key={i} className="option-input-row">
                    <span className="option-num mono">{i + 1}</span>
                    <input
                      className="input-field"
                      value={o.label}
                      onChange={e => updateOption(i, e.target.value)}
                      placeholder={`Opzione ${i + 1}`}
                      maxLength={40}
                    />
                    <span className="char-count-mini mono">{o.label.length}/40</span>
                    {form.options.length > 2 && (
                      <button className="option-remove" onClick={() => removeOption(i)}>&times;</button>
                    )}
                    {errors[`option_${i}`] && <span className="field-error">{errors[`option_${i}`]}</span>}
                  </div>
                ))}
              </div>
              {form.options.length < 8 && (
                <button className="add-option-btn" onClick={addOption}>+ Aggiungi opzione</button>
              )}
            </div>
          </div>

          <div className="cmm-footer">
            <button className="btn-cancel" onClick={handleClose}>Annulla</button>
            <button type="button" className={`btn-primary cmm-submit ${submitting ? 'btn-loading' : ''}`} onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <span className="btn-spinner">
                  <svg className="spin" width="16" height="16" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="28" strokeDashoffset="10"/>
                  </svg>
                  Creazione...
                </span>
              ) : (
                'Crea Pronostico'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
