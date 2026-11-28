'use client';
import { useRef, useState } from 'react';

const resizeToJpegBase64 = (file, maxSide = 1400) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({ base64, mimeType: 'image/jpeg', previewUrl: dataUrl });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

export default function ReceiptScanner({
  label = 'Scan Receipt',
  onParsed,
  buttonStyle,
}) {
  const fileInputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState('');
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const resetAndClose = () => {
    setErr('');
    setLoading(false);
    setOpen(false);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      const converted = await resizeToJpegBase64(file);
      setPreview(converted.previewUrl);
      setPayload(converted);
    } catch (ex) {
      setErr(ex.message || 'Failed to load image.');
    }
    e.target.value = '';
  };

  const runScan = async () => {
    if (!payload?.base64 || loading) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: payload.base64,
          mimeType: payload.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not scan receipt.');
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error('No line items detected on this bill.');
      }
      onParsed?.(data);
      setOpen(false);
      setPreview('');
      setPayload(null);
    } catch (ex) {
      setErr(ex.message || 'Scan failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErr('');
          setOpen(true);
        }}
        style={{
          margin: 0,
          padding: '9px 12px',
          background: '#faf8f5',
          color: '#1c1917',
          border: '1px solid #cfc6be',
          borderRadius: 10,
          font: 'inherit',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          ...buttonStyle,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {label}
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 15, 15, 0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && resetAndClose()}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 18,
              padding: 20,
              width: '100%',
              maxWidth: 420,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Scan POS Bill / Receipt</span>
              <button
                type="button"
                onClick={resetAndClose}
                style={{
                  margin: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#faf8f5',
                  border: '1px solid #cfc6be',
                  color: '#57534e',
                  cursor: 'pointer',
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                margin: 0,
                padding: '11px 14px',
                background: '#faf8f5',
                color: '#1c1917',
                border: '1px dashed #b8ada2',
                borderRadius: 12,
                font: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {preview ? 'Choose another receipt image' : 'Take photo or select screenshot'}
            </button>

            {preview && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid var(--line)',
                  background: '#faf8f5',
                  maxHeight: 280,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={preview}
                  alt="Receipt preview"
                  style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', display: 'block' }}
                />
              </div>
            )}

            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={resetAndClose}
                style={{
                  margin: 0,
                  padding: '9px 14px',
                  background: 'transparent',
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runScan}
                disabled={!payload || loading}
                style={{
                  margin: 0,
                  padding: '9px 14px',
                  background: 'var(--accent)',
                  color: 'var(--on)',
                  border: 'none',
                  borderRadius: 10,
                  font: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: !payload || loading ? 'not-allowed' : 'pointer',
                  opacity: !payload || loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Scanning…' : 'Extract Items'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
