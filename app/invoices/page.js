'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { sb } from '../../lib/supabase';
import { f, today } from '../../lib/util';

const LOGO = '/logo.png';
const STAMP = '/stamp.png';

// ── helpers ──────────────────────────────────────────────
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtDate = (v) => { if (!v) return ''; const [y, m, d] = v.split('-'); return `${d}/${m}/${y}`; };
const fmtDateShort = (v) => { if (!v) return ''; const [y, m, d] = v.split('-'); return `${d}/${m}/${y.slice(-2)}`; };
const todayStr = () => today();

const nextNo = (saved, type) => {
  const prefix = type === 'quotation' ? 'QT' : 'HV';
  const y = new Date().getFullYear();
  const max = saved
    .filter((s) => (s.type || 'invoice') === type)
    .reduce((mx, s) => {
      const m = new RegExp('^' + prefix + '(\\d{4})\\/(\\d+)$').exec(s.no || '');
      return m && +m[1] === y ? Math.max(mx, +m[2]) : mx;
    }, 0);
  return prefix + y + '/' + String(max + 1).padStart(3, '0');
};

const docTotal = (s) => ((s?.data || s)?.items || []).reduce((t, it) => t + num(it.q) * num(it.r), 0);
const docStatus = (s) => ((s?.data || s)?.status === 'paid' ? 'paid' : 'open');

const inputFieldStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #cfc6be',
  borderRadius: 10,
  background: '#faf8f5',
  color: '#1c1917',
  font: 'inherit',
  fontSize: 13,
  boxSizing: 'border-box',
};

// ── small UI pieces ───────────────────────────────────────
const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const Inp = ({ style: s, ...p }) => (
  <input
    style={{
      ...inputFieldStyle,
      ...s,
    }}
    {...p}
  />
);

const Btn = ({ alt, danger, style: s, ...p }) => (
  <button
    type="button"
    style={{
      margin: 0,
      padding: '9px 15px',
      background: danger ? '#c0392b' : alt ? 'transparent' : 'var(--accent)',
      color: danger ? '#fff' : alt ? 'var(--ink)' : 'var(--on)',
      border: alt ? '1px solid var(--line)' : 'none',
      borderRadius: 10,
      font: 'inherit',
      fontWeight: 600,
      fontSize: 13,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      ...s,
    }}
    {...p}
  />
);

const Field = ({ label, children, style: s }) => (
  <div style={{ marginBottom: 11, ...s }}>
    <label
      style={{
        display: 'block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.02em',
        color: 'var(--muted)',
        marginBottom: 4,
      }}
    >
      {label}
    </label>
    {children}
  </div>
);

// ── modal ─────────────────────────────────────────────────
const Modal = ({ title, subtitle, onClose, children, wide }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 15, 15, 0.55)',
      backdropFilter: 'blur(3px)',
      zIndex: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}
    onClick={(e) => e.target === e.currentTarget && onClose()}
  >
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 18,
        padding: 20,
        width: '100%',
        maxWidth: wide ? 860 : 460,
        maxHeight: '92vh',
        overflowY: 'auto',
        boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            margin: 0,
            width: 30,
            height: 30,
            borderRadius: 8,
            background: '#faf8f5',
            border: '1px solid #cfc6be',
            color: '#57534e',
            cursor: 'pointer',
            fontSize: 15,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
);

// ── invoice / quotation sheet (A4 proportions, always white) ──
function Sheet({ doc, scale = 1 }) {
  const { no, date, cust, items, type } = doc;
  const isQuote = type === 'quotation';
  const rows = useMemo(() => items.filter((it) => it.d || num(it.r)), [items]);
  const total = rows.reduce((s, it) => s + num(it.q) * num(it.r), 0);
  const blanks = Math.max(1, 5 - rows.length);

  return (
    <div
      id="doc-sheet"
      style={{
        position: 'relative',
        width: 794,
        height: 1123,
        background: '#fff',
        color: '#000',
        fontFamily: "'Poppins',system-ui,sans-serif",
        fontSize: 13,
        overflow: 'hidden',
        flexShrink: 0,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: 2, height: 835, background: '#d8d0cb' }} />
      <div style={{ position: 'absolute', right: 35, bottom: 43, width: 2, height: 396, background: '#d8d0cb' }} />
      <div style={{ position: 'absolute', left: 0, top: 140, width: 470, borderTop: '1.5px solid #d8d0cb' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 43, background: '#634029' }} />

      <img src={LOGO} alt="Huvan Café" style={{ position: 'absolute', left: 90, top: 20, width: 104, height: 104, objectFit: 'cover' }} />

      <div style={{ position: 'absolute', right: 70, top: 40, color: '#7b6558', fontWeight: 500, fontSize: 13, lineHeight: '20px', textAlign: 'right' }}>
        +960 9977314 / +960 7718858<br />
        huvancafe@gmail.com<br />
        Sh. Funadhoo, Riyal<br />
        Republic of Maldives
      </div>

      <div style={{ position: 'absolute', right: 70, top: 162, textAlign: 'right', lineHeight: '27px', fontSize: 14 }}>
        Date: {fmtDate(date)}<br />
        {isQuote ? 'Quotation No' : 'Invoice No'}: {no}
      </div>

      <div style={{ position: 'absolute', left: 0, right: 0, top: 206, textAlign: 'center', fontFamily: "Calibri,Carlito,'Trebuchet MS',sans-serif", fontWeight: 700, fontSize: 18, letterSpacing: '.04em' }}>
        {isQuote ? 'QUOTATION' : 'INVOICE'}
      </div>

      <div style={{ position: 'absolute', left: 96, right: 70, top: 246 }}>
        <div style={{ fontSize: 14, marginBottom: 5 }}>
          <b>Customer</b>: {cust}
        </div>

        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontFamily: "Calibri,Carlito,'Trebuchet MS',sans-serif", fontSize: 15 }}>
          <thead>
            <tr>
              {['#', 'Description', 'Qty', 'Rate', 'Total'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    border: '0',
                    borderRight: '1px solid #bbb',
                    borderBottom: '1px solid #bbb',
                    borderTop: '1px solid #bbb',
                    padding: '0 8px',
                    height: 23,
                    fontWeight: 700,
                    textAlign: i === 0 || i > 1 ? 'center' : 'left',
                    ...(i === 0 ? { borderLeft: '1px solid #bbb', width: 44 } : i === 2 ? { width: 88 } : i === 3 ? { width: 78 } : i === 4 ? { width: 89, borderRight: '1px solid #bbb' } : {}),
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((it, idx) => {
              const t = num(it.q) * num(it.r);
              const bg = idx % 2 === 0 ? '#fff' : '#ececec';
              return (
                <tr key={idx}>
                  {[idx + 1, it.d, f(num(it.q)), f(num(it.r)), f(t)].map((v, ci) => (
                    <td
                      key={ci}
                      style={{
                        border: 0,
                        borderRight: '1px solid #bbb',
                        borderBottom: '1px solid #bbb',
                        padding: '0 8px',
                        height: 23,
                        background: bg,
                        textAlign: ci === 0 || ci > 1 ? 'right' : 'left',
                        ...(ci === 0 ? { borderLeft: '1px solid #bbb', textAlign: 'center' } : {}),
                      }}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              );
            })}

            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={'b' + i}>
                {[0, 1, 2, 3, 4].map((ci) => (
                  <td
                    key={ci}
                    style={{
                      border: 0,
                      borderRight: '1px solid #bbb',
                      borderBottom: '1px solid #bbb',
                      height: 23,
                      background: i % 2 === 0 && rows.length % 2 === 0 ? '#fff' : i % 2 === 0 ? '#ececec' : '#fff',
                      ...(ci === 0 ? { borderLeft: '1px solid #bbb' } : {}),
                    }}
                  />
                ))}
              </tr>
            ))}

            <tr>
              <td style={{ border: 0, background: '#fff' }} />
              <td style={{ border: 0, background: '#fff' }} />
              <td style={{ border: 0, borderRight: '1px solid #bbb', background: '#fff' }} />
              <td style={{ border: 0, borderRight: '1px solid #bbb', borderBottom: '1px solid #bbb', textAlign: 'center', fontWeight: 700, padding: '0 8px', height: 23 }}>
                Total
              </td>
              <td style={{ border: 0, borderRight: '1px solid #bbb', borderBottom: '1px solid #bbb', textAlign: 'right', fontWeight: 700, padding: '0 8px', height: 23 }}>
                {f(total)}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 14, lineHeight: '27px', marginTop: 4 }}>Stamp:</div>
        <div style={{ height: 41, position: 'relative', marginBottom: 4 }}>
          <img src={STAMP} alt="Stamp" style={{ position: 'absolute', left: 73, top: -24, width: 81, height: 81, objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: 14, lineHeight: '27px' }}>Account Details:</div>
        <div style={{ fontSize: 14, lineHeight: '27px' }}>Account Name: Huvan Café</div>
        <div style={{ fontSize: 14, lineHeight: '27px' }}>Account Number: 7770000157347</div>
        {isQuote && <div style={{ fontSize: 12, color: '#888', marginTop: 12, fontStyle: 'italic' }}>This quotation is valid for 30 days from the date above.</div>}
      </div>
    </div>
  );
}

// ── item row ──────────────────────────────────────────────
function ItemRow({ item, idx, onChange, onDelete }) {
  const lineTotal = num(item.q) * num(item.r);
  return (
    <div style={{ paddingBottom: 8, marginBottom: 8, borderBottom: '1px dashed var(--line)' }}>
      <div className="invoice-items-row" style={{ display: 'grid', gridTemplateColumns: '1fr 64px 82px 30px', gap: 6, alignItems: 'center' }}>
        <Inp
          value={item.d}
          maxLength={50}
          onChange={(e) => onChange(idx, 'd', e.target.value)}
          placeholder={`Item ${idx + 1} description`}
        />
        <Inp
          type="number"
          step="any"
          min="0"
          value={item.q}
          onChange={(e) => onChange(idx, 'q', e.target.value)}
          style={{ textAlign: 'right', padding: '9px 6px' }}
        />
        <Inp
          type="number"
          step="any"
          min="0"
          value={item.r}
          onChange={(e) => onChange(idx, 'r', e.target.value)}
          style={{ textAlign: 'right', padding: '9px 6px' }}
        />
        <button
          type="button"
          onClick={() => onDelete(idx)}
          title="Remove item"
          style={{
            margin: 0,
            padding: 0,
            height: 36,
            background: '#faf8f5',
            border: '1px solid #cfc6be',
            borderRadius: 9,
            cursor: 'pointer',
            color: '#57534e',
            fontSize: 15,
          }}
        >
          ×
        </button>
      </div>
      {lineTotal > 0 && (
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted)', marginTop: 3, paddingRight: 36 }}>
          Subtotal: <b style={{ color: 'var(--ink)' }}>MVR {f(lineTotal)}</b>
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────
export default function Invoices() {
  const blankDoc = (type, saved) => ({
    id: null,
    type,
    status: 'open',
    no: nextNo(saved, type),
    date: todayStr(),
    cust: '',
    items: [{ d: '', q: 1, r: 0 }],
  });

  const [saved, setSaved] = useState([]);
  const [doc, setDoc] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const previewRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(1);

  const load = async () => {
    const r = await sb.from('invoices').select('*').order('created_at', { ascending: false });
    if (r.data) setSaved(r.data);
  };

  useEffect(() => {
    load().then(() => {
      setSaved((prev) => {
        setDoc(blankDoc('invoice', prev));
        return prev;
      });
    });
  }, []);

  const setItems = (items) => {
    setDirty(true);
    setDoc((d) => ({ ...d, items }));
  };

  const setField = (k) => (e) => {
    setDirty(true);
    setDoc((d) => ({ ...d, [k]: e.target.value }));
  };

  const changeItem = (idx, key, val) => {
    const items = doc.items.map((it, i) => (i === idx ? { ...it, [key]: val } : it));
    setItems(items);
  };

  const addItem = () => setItems([...doc.items, { d: '', q: 1, r: 0 }]);

  const delItem = (idx) => {
    const items = doc.items.filter((_, i) => i !== idx);
    setItems(items.length ? items : [{ d: '', q: 1, r: 0 }]);
  };

  const saveDoc = async () => {
    if (!doc.cust.trim()) return setErr('Enter a customer name.');
    setSaving(true);

    const status = doc.status || 'open';
    const data = {
      no: doc.no,
      type: doc.type || 'invoice',
      status,
      date: doc.date,
      cust: doc.cust,
      items: doc.items.map((it) => ({ d: it.d, q: num(it.q), r: num(it.r) })),
      ts: Date.now(),
    };

    const id = doc.id || 'doc' + Date.now();

    const r = doc.id
      ? await sb.from('invoices').update({ data, no: doc.no, type: doc.type || 'invoice' }).eq('id', id)
      : await sb.from('invoices').insert({ id, no: doc.no, type: doc.type || 'invoice', data });

    setSaving(false);
    if (r.error) return setErr(r.error.message);

    setErr('');
    setDirty(false);
    setDoc((d) => ({ ...d, id, status }));
    load();
  };

  const openDoc = (s, openPreview = false) => {
    const d = s.data || s;
    setDoc({
      id: s.id,
      type: s.type || 'invoice',
      status: docStatus(s),
      no: d.no || s.no,
      date: d.date,
      cust: d.cust,
      items: d.items || [{ d: '', q: 1, r: 0 }],
    });
    setErr('');
    setDirty(false);
    if (openPreview) {
      setModal('preview');
    } else {
      setEditorOpen(true);
    }
  };

  const deleteDoc = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this document?')) return;
    await sb.from('invoices').delete().eq('id', id);
    if (doc?.id === id) {
      setDoc(blankDoc(doc.type || 'invoice', saved.filter((x) => x.id !== id)));
      setDirty(false);
    }
    load();
  };

  const newDoc = (type = 'invoice') => {
    setDoc(blankDoc(type, saved));
    setErr('');
    setDirty(false);
    setEditorOpen(true);
  };

  const switchDocType = (type) => {
    if ((doc.type || 'invoice') === type) return;
    setDirty(true);
    setDoc((d) => ({ ...d, type, no: d.id ? d.no : nextNo(saved, type) }));
  };

  useEffect(() => {
    if (modal !== 'preview' || !previewRef.current) return;
    const el = previewRef.current;
    const update = () => setPreviewScale(Math.min(1, el.clientWidth / 794));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [modal]);

  const downloadPDF = async () => {
    const el = document.getElementById('doc-sheet');
    if (!el || !window.html2canvas || !window.jspdf) {
      alert('PDF tools are still loading. Please try again.');
      return;
    }

    const btn = document.getElementById('pdf-btn');
    const old = btn?.textContent;
    if (btn) {
      btn.textContent = 'Preparing…';
      btn.disabled = true;
    }

    const oldTransform = el.style.transform;

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      el.style.transform = 'none';

      const c = await window.html2canvas(el, {
        scale: 2,
        backgroundColor: '#fff',
        width: 794,
        height: 1123,
        scrollX: 0,
        scrollY: 0,
      });

      const pdf = new window.jspdf.jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      });

      pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      pdf.save((doc.no || 'document').replace(/[^\w-]+/g, '-') + '.pdf');
    } catch (e) {
      alert('PDF failed: ' + e.message);
    } finally {
      el.style.transform = oldTransform;
      if (btn) {
        btn.textContent = old;
        btn.disabled = false;
      }
    }
  };

  const currentTotal = useMemo(
    () => (doc ? doc.items.reduce((s, it) => s + num(it.q) * num(it.r), 0) : 0),
    [doc]
  );

  const stats = useMemo(() => {
    let outstanding = 0;
    let collected = 0;
    let openCount = 0;
    saved.forEach((s) => {
      const t = docTotal(s);
      if (docStatus(s) === 'paid') {
        collected += t;
      } else {
        outstanding += t;
        openCount += 1;
      }
    });
    return { outstanding, collected, openCount };
  }, [saved]);

  const filtered = useMemo(
    () =>
      saved.filter((s) => {
        const matchType = filter === 'all' || (s.type || 'invoice') === filter;
        const d = s.data || {};
        const matchSearch =
          !search ||
          (d.cust || '').toLowerCase().includes(search.toLowerCase()) ||
          (s.no || '').toLowerCase().includes(search.toLowerCase());
        return matchType && matchSearch;
      }),
    [saved, filter, search]
  );

  const typeLabel = (t) => (t === 'quotation' ? 'Quotation' : 'Invoice');

  const typeBadge = (t) => ({
    background: t === 'quotation' ? 'rgba(26, 95, 168, 0.12)' : 'rgba(59, 109, 17, 0.12)',
    color: t === 'quotation' ? '#1a5fa8' : '#3b6d11',
  });

  if (!doc) return <p className="muted">Loading…</p>;

  return (
    <>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js" async />
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js" async />

      <style>{`
        .inv-header {
          margin-bottom: 12px;
        }

        .inv-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .inv-stat-pill {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 11px 13px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .inv-stat-val {
          font-size: 16px;
          font-weight: 700;
          margin-top: 2px;
          white-space: nowrap;
        }

        .invoice-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }

        .invoice-layout.is-expanded {
          grid-template-columns: 380px minmax(0, 1fr);
        }

        .inv-seg {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          padding: 4px;
          background: #faf8f5;
          border: 1px solid #cfc6be;
          border-radius: 11px;
          margin-bottom: 14px;
        }

        .inv-seg button {
          margin: 0;
          padding: 7px 10px;
          border: none;
          border-radius: 8px;
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .inv-items-box {
          background: #fdfcfa;
          border: 1px solid #ded7cf;
          border-radius: 12px;
          padding: 10px;
          margin-top: 12px;
        }

        .invoice-date-input {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          display: block;
          min-height: 38px;
          -webkit-appearance: none;
          appearance: none;
        }

        .invoice-sheet-frame {
          width: 100%;
          position: relative;
          overflow: hidden;
          background: #fff;
          border-radius: 10px;
          border: 1px solid var(--line);
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
        }

        .inv-row:hover {
          background: var(--bg);
        }

        .inv-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 6px;
          color: var(--muted);
          cursor: pointer;
          text-decoration: none;
        }

        .inv-icon-btn:hover {
          color: var(--ink);
          background: var(--panel);
        }

        @media (max-width: 840px) {
          .invoice-layout,
          .invoice-layout.is-expanded {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .inv-stats {
            gap: 8px;
          }

          .inv-stat-pill {
            padding: 10px 11px;
          }

          .inv-stat-val {
            font-size: 14px;
          }

          .invoice-form-card,
          .invoice-saved-card {
            min-width: 0;
            width: 100%;
          }

          .invoice-items-row {
            grid-template-columns: minmax(0, 1fr) 56px 72px 28px !important;
            gap: 5px !important;
          }

          .invoice-preview-actions {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* ── clean page title ── */}
      <div className="inv-header">
        <h1 style={{ margin: 0 }}>Invoices &amp; Quotations</h1>
      </div>

      {/* ── level 2-col summary strip: Outstanding & Collected ── */}
      <div className="inv-stats">
        <div className="inv-stat-pill">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
              Outstanding ({stats.openCount})
            </div>
            <div className="inv-stat-val">MVR {f(stats.outstanding)}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(192, 57, 43, 0.12)', color: '#c0392b', flexShrink: 0 }}>
            Open
          </span>
        </div>

        <div className="inv-stat-pill">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>
              Collected
            </div>
            <div className="inv-stat-val">MVR {f(stats.collected)}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'rgba(39, 174, 96, 0.14)', color: '#27ae60', flexShrink: 0 }}>
            Paid
          </span>
        </div>
      </div>

      <div className={`invoice-layout ${editorOpen ? 'is-expanded' : ''}`}>
        {/* ── expandable editor card ── */}
        {editorOpen && (
          <div className="card invoice-form-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>
                  {doc.id ? 'Edit ' + typeLabel(doc.type) : 'New ' + typeLabel(doc.type)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: doc.id && !dirty ? 'rgba(39, 174, 96, 0.14)' : '#faf8f5',
                    color: doc.id && !dirty ? '#27ae60' : '#57534e',
                    border: '1px solid #cfc6be',
                  }}
                >
                  {doc.id ? (dirty ? 'Unsaved' : 'Saved') : 'Draft'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                style={{
                  margin: 0,
                  padding: '4px 9px',
                  borderRadius: 8,
                  border: '1px solid #cfc6be',
                  background: '#faf8f5',
                  color: '#57534e',
                  font: 'inherit',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Hide
              </button>
            </div>

            {/* segmented doc type switcher */}
            <div className="inv-seg">
              {['invoice', 'quotation'].map((t) => {
                const active = (doc.type || 'invoice') === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => switchDocType(t)}
                    style={{
                      background: active ? 'var(--accent)' : 'transparent',
                      color: active ? 'var(--on)' : '#57534e',
                    }}
                  >
                    {typeLabel(t)}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Document No." style={{ marginBottom: 0 }}>
                <Inp value={doc.no} onChange={setField('no')} />
              </Field>
              <Field label="Issue Date" style={{ marginBottom: 0 }}>
                <Inp className="invoice-date-input" type="date" value={doc.date} onChange={setField('date')} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10, marginTop: 11 }}>
              <Field label="Customer" style={{ marginBottom: 0 }}>
                <Inp value={doc.cust} onChange={setField('cust')} placeholder="Customer name" />
              </Field>
              <Field label="Status" style={{ marginBottom: 0 }}>
                <select
                  value={doc.status || 'open'}
                  onChange={setField('status')}
                  style={inputFieldStyle}
                >
                  <option value="open">Open</option>
                  <option value="paid">Paid</option>
                </select>
              </Field>
            </div>

            {/* line items */}
            <div className="inv-items-box">
              <div
                className="invoice-items-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 64px 82px 30px',
                  gap: 6,
                  marginBottom: 6,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  color: 'var(--muted)',
                }}
              >
                <span>Description</span>
                <span style={{ textAlign: 'right' }}>Qty</span>
                <span style={{ textAlign: 'right' }}>Rate</span>
                <span />
              </div>

              {doc.items.map((it, i) => (
                <ItemRow key={i} item={it} idx={i} onChange={changeItem} onDelete={delItem} />
              ))}

              <Btn alt onClick={addItem} style={{ width: '100%', fontSize: 12, padding: '7px 12px', background: '#faf8f5', borderColor: '#cfc6be', color: '#1c1917' }}>
                + Add line item
              </Btn>
            </div>

            {/* total bar */}
            <div
              style={{
                background: '#faf8f5',
                border: '1px solid #cfc6be',
                borderRadius: 11,
                padding: '11px 13px',
                marginTop: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: '#57534e' }}>Total Amount</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1c1917' }}>MVR {f(currentTotal)}</span>
            </div>

            {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <Btn onClick={saveDoc} disabled={saving} style={{ width: '100%' }}>
                {saving ? 'Saving…' : doc.id ? 'Update' : 'Save'}
              </Btn>
              <Btn alt onClick={() => setModal('preview')} style={{ width: '100%' }}>
                Preview A4
              </Btn>
            </div>
          </div>
        )}

        {/* ── saved documents register ── */}
        <div className="card invoice-saved-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Saved documents</h2>
              <Btn onClick={() => newDoc('invoice')} style={{ padding: '6px 12px', fontSize: 12 }}>
                + New Document
              </Btn>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {['all', 'invoice', 'quotation'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilter(t)}
                  style={{
                    margin: 0,
                    padding: '5px 11px',
                    borderRadius: 20,
                    border: '1px solid',
                    borderColor: filter === t ? 'var(--accent)' : 'var(--line)',
                    background: filter === t ? 'var(--accent)' : 'transparent',
                    color: filter === t ? 'var(--on)' : 'var(--muted)',
                    font: 'inherit',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t === 'all' ? 'All' : typeLabel(t) + 's'}
                </button>
              ))}
            </div>
          </div>

          <Inp
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer or document number…"
            style={{ marginBottom: 12 }}
          />

          {filtered.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No matching documents found.
            </div>
          ) : (
            <div className="xt">
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((s) => {
                    const isActive = editorOpen && doc?.id === s.id;
                    const st = docStatus(s);
                    return (
                      <tr
                        key={s.id}
                        className="inv-row"
                        style={{
                          cursor: 'pointer',
                          background: isActive ? 'var(--bg)' : undefined,
                        }}
                        onClick={() => openDoc(s, false)}
                      >
                        <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{s.no}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, ...typeBadge(s.type || 'invoice') }}>
                            {typeLabel(s.type || 'invoice')}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDateShort((s.data || {}).date || '')}</td>
                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(s.data || {}).cust || ''}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              background: st === 'paid' ? 'rgba(39, 174, 96, 0.14)' : 'rgba(192, 57, 43, 0.12)',
                              color: st === 'paid' ? '#27ae60' : '#c0392b',
                            }}
                          >
                            {st === 'paid' ? 'Paid' : 'Open'}
                          </span>
                        </td>
                        <td className="n" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                          MVR {f(docTotal(s))}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <a
                              className="inv-icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDoc(s, true);
                              }}
                              title="Preview A4"
                            >
                              <EyeIcon />
                            </a>
                            <a
                              className="inv-icon-btn"
                              onClick={(e) => deleteDoc(s.id, e)}
                              title="Delete"
                              style={{ fontSize: 15, lineHeight: 1 }}
                            >
                              ×
                            </a>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── preview modal ── */}
      {modal === 'preview' && (
        <Modal
          title={`${typeLabel(doc.type)} Preview — ${doc.no}`}
          subtitle={doc.cust ? `Customer: ${doc.cust}` : 'A4 print-ready layout'}
          onClose={() => setModal(null)}
          wide
        >
          <div
            ref={previewRef}
            className="invoice-sheet-frame"
            style={{ height: 1123 * previewScale, marginBottom: 16 }}
          >
            <Sheet doc={doc} scale={previewScale} />
          </div>

          <div className="invoice-preview-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <Btn alt onClick={() => setModal(null)} style={{ width: '100%' }}>
              Close
            </Btn>
            <Btn id="pdf-btn" onClick={downloadPDF} style={{ width: '100%' }}>
              Download PDF
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
