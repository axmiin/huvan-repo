//Entry Page

'use client';
import { useEffect, useMemo, useState } from 'react';
import { sb } from '../lib/supabase';
import { f, dmy, today } from '../lib/util';

const compareLatest = (a, b) => {
  const dateCmp = String(b.entry_date || '').localeCompare(String(a.entry_date || ''));
  if (dateCmp !== 0) return dateCmp;
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
};

const fmtShortDate = (v) => {
  const full = dmy(v);
  if (!full) return '';
  const parts = String(full).split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[0]}/${parts[1]}/${parts[2].slice(-2)}`;
  }
  return full;
};

const modalInputStyle = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  border: '1px solid #cfc6be',
  borderRadius: 10,
  background: '#faf8f5',
  color: '#1c1917',
  font: 'inherit',
  fontSize: 13,
  marginBottom: 10,
};

const Modal = ({ title, onClose, children }) => (
  <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'center' }} onClick={(e)=>e.target===e.currentTarget&&onClose()}>
    <div style={{ background:'#f0ece8',borderRadius:'16px 16px 0 0',padding:20,width:'100%',maxWidth:440,paddingBottom:'calc(20px + env(safe-area-inset-bottom))',maxHeight:'90vh',overflowY:'auto' }}>
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
        <span style={{ fontSize:16,fontWeight:600 }}>{title}</span>
        <button type="button" onClick={onClose} style={{ margin:0,padding:6,background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:20,lineHeight:1 }}>✕</button>
      </div>{children}
    </div>
  </div>
);

export default function EntryPage({ table, title, noun, cats: base, open, onClose, renderActions, showBankBalance = false }) {
  const [rows, setRows] = useState([]);
  const [accts, setAccts] = useState([]);
  const [salesRows, setSalesRows] = useState([]);
  const [expRows, setExpRows] = useState([]);
  const [m, setM] = useState(today().slice(0, 7));
  const [err, setErr] = useState('');
  const [localOpen, setLocalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acctFilter, setAcctFilter] = useState('all');
  const [form, setForm] = useState({ entry_date: today(), details: '', category: '', amount: '', account_id: '' });

  const isOpen = open !== undefined ? open : localOpen;
  const close = () => { setErr(''); onClose ? onClose() : setLocalOpen(false); };

  const load = async () => {
    const queries = [
      sb.from('accounts').select('*').order('created_at'),
      sb.from(table).select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
    ];
    if (showBankBalance) {
      queries.push(sb.from('sales').select('amount,account_id'));
      queries.push(sb.from('expenses').select('amount,account_id'));
    }

    const [a, r, s, ex] = await Promise.all(queries);
    if (a.error || r.error) return setErr((a.error || r.error).message);

    setAccts(a.data || []);
    setRows([...(r.data || [])].sort(compareLatest));
    if (showBankBalance) {
      if (s && !s.error) setSalesRows(s.data || []);
      if (ex && !ex.error) setExpRows(ex.data || []);
    }
    setForm((p) => ({ ...p, account_id: p.account_id || (a.data?.[0] ? a.data[0].id : '') }));
  };

  useEffect(() => { load(); }, [table, showBankBalance]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const an = (id) => (accts.find((x) => x.id === id) || {}).name || '';

  const add = async (e) => {
    if (e) e.preventDefault();
    if (saving) return;
    const a = parseFloat(form.amount);
    if (!form.details.trim() || !(a > 0) || !form.account_id) return setErr('Enter details, an amount above 0 and an account.');
    setSaving(true);
    const r = await sb.from(table).insert({ entry_date: form.entry_date, details: form.details.trim(), category: form.category.trim() || null, amount: a, account_id: form.account_id });
    setSaving(false);
    if (r.error) return setErr(r.error.message);
    setErr(''); setForm((p) => ({ ...p, details: '', amount: '' })); close(); load();
  };

  const del = async (id) => {
    if (confirm('Delete this ' + noun + '?')) {
      await sb.from(table).delete().eq('id', id);
      load();
    }
  };

  const cats = useMemo(() => [...new Set([...base, ...rows.map((x) => x.category).filter(Boolean)])], [rows, base]);

  const filteredAcctIds = useMemo(() => {
    if (acctFilter === 'all') return null;
    return new Set(accts.filter(a => (a.type || '').toLowerCase() === acctFilter).map(a => a.id));
  }, [accts, acctFilter]);

  const bankBalance = useMemo(() => {
    if (!showBankBalance) return 0;

    const salesByAcct = {};
    salesRows.forEach((s) => {
      if (s.account_id) salesByAcct[s.account_id] = (salesByAcct[s.account_id] || 0) + (Number(s.amount) || 0);
    });
    const expByAcct = {};
    expRows.forEach((x) => {
      if (x.account_id) expByAcct[x.account_id] = (expByAcct[x.account_id] || 0) + (Number(x.amount) || 0);
    });

    const targetAccts = filteredAcctIds
      ? accts.filter((acct) => filteredAcctIds.has(acct.id))
      : accts;

    return targetAccts.reduce((sum, acct) => {
      if (acct.balance !== undefined && acct.balance !== null && !Number.isNaN(Number(acct.balance))) {
        return sum + Number(acct.balance);
      }
      const opening = Number(acct.opening_balance) || 0;
      return sum + opening + (salesByAcct[acct.id] || 0) - (expByAcct[acct.id] || 0);
    }, 0);
  }, [showBankBalance, filteredAcctIds, accts, salesRows, expRows]);

  const { list, total, top } = useMemo(() => {
    let list = rows
      .filter((x) => !m || x.entry_date.slice(0, 7) === m)
      .map((x) => ({ ...x, a: +x.amount }))
      .sort(compareLatest);
    if (filteredAcctIds) list = list.filter(x => filteredAcctIds.has(x.account_id));
    const by = {}; let total = 0;
    list.forEach((x) => { total += x.a; const c = x.category || 'Uncategorised'; by[c] = (by[c] || 0) + x.a; });
    const best = Object.entries(by).sort((p, q) => q[1] - p[1])[0];
    return { list, total, top: best ? best[0] : '-' };
  }, [rows, m, filteredAcctIds]);

  const csv = () => {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const t = [['Date', 'Details', 'Amount', 'Category', 'Account'], ...list.map((x) => [dmy(x.entry_date), x.details, x.a.toFixed(2), x.category || '', an(x.account_id)])].map((r) => r.map(q).join(',')).join('\n');
    const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' }));
    l.download = 'huvan-' + table + '.csv'; l.click();
  };

  const filterBtnStyle = (val) => ({
    margin:0, padding:'6px 14px', borderRadius:20, border:'1px solid',
    cursor:'pointer', font:'inherit', fontSize:12, fontWeight:600,
    background: acctFilter === val ? 'var(--accent)' : 'transparent',
    color: acctFilter === val ? 'var(--on)' : 'var(--muted)',
    borderColor: acctFilter === val ? 'var(--accent)' : 'var(--line)',
  });

  const isExpenses = table === 'expenses';
  const badgeStyle = isExpenses
    ? { background: 'rgba(192, 57, 43, 0.12)', color: '#c0392b' }
    : { background: 'rgba(39, 174, 96, 0.14)', color: '#27ae60' };

  return (<>
    <style>{`
      .entry-reg-wrap {
        width: 100%;
        overflow-x: auto;
      }

      .entry-reg-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .entry-reg-table th {
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--muted);
        padding: 8px 10px;
        border-bottom: 1px solid var(--line);
        white-space: nowrap;
      }

      .entry-reg-table td {
        padding: 10px 10px;
        border-bottom: 1px solid var(--line);
        vertical-align: middle;
      }

      .entry-reg-row:hover {
        background: var(--bg);
      }

      .entry-reg-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
      }

      .entry-reg-del {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        color: var(--muted);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        text-decoration: none;
      }

      .entry-reg-del:hover {
        color: var(--ink);
        background: var(--panel);
      }

      @media (max-width: 640px) {
        .entry-reg-table th,
        .entry-reg-table td {
          padding: 9px 7px;
          font-size: 12px;
        }
      }
    `}</style>

    <h1>{title}</h1>
    <div className="card" style={{ marginBottom:16 }}>
      <h2>{title} overview</h2>
      <label>Month (clear to show all)</label>
      <input type="month" value={m} onChange={(e) => setM(e.target.value)} style={{ ...modalInputStyle, marginBottom:12 }} />
      <div className="sum">
        <div>Total<b>{f(total)}</b></div>
        <div>Entries<b>{list.length}</b></div>
        {showBankBalance
          ? <div>Bank balance<b>{f(bankBalance)}</b></div>
          : <div>Biggest category<b>{top}</b></div>}
      </div>
      <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12 }}>
        <span style={{ fontSize:12,fontWeight:500,color:'var(--muted)' }}>Account:</span>
        <button type="button" style={filterBtnStyle('all')} onClick={()=>setAcctFilter('all')}>All</button>
        <button type="button" style={filterBtnStyle('bank')} onClick={()=>setAcctFilter('bank')}>Bank</button>
        <button type="button" style={filterBtnStyle('cash')} onClick={()=>setAcctFilter('cash')}>Cash</button>
      </div>
      <div style={{ display:'flex',gap:10,flexWrap:'wrap' }}>
        {renderActions && renderActions({ openModal: () => { setErr(''); setLocalOpen(true); } })}
        <button type="button" className="alt" onClick={csv}>Export CSV</button>
      </div>
      {!isOpen && err && <p className="err">{err}</p>}
    </div>
    <div className="card">
      <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap' }}>
        <h2 style={{ margin:0 }}>{title} list</h2>
        <span style={{ fontSize:11,color:'var(--muted)' }}>{list.length} {list.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <div className="xt entry-reg-wrap" style={isExpenses ? { maxWidth: 380, width: '100%' } : undefined}>
        <table className="entry-reg-table" style={isExpenses ? { maxWidth: 380 } : undefined}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Details</th>
              <th>Category</th>
              <th>Account</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {list.length ? list.map((x) => {
              const acctName = an(x.account_id);
              return (
                <tr key={x.id} className="entry-reg-row">
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontWeight: 500 }}>{fmtShortDate(x.entry_date)}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{x.details}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {x.category && (
                      <span className="entry-reg-badge" style={badgeStyle}>{x.category}</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>{acctName}</td>
                  <td className="n" style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>MVR {f(x.a)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <a className="entry-reg-del" title={'Delete ' + noun} onClick={() => del(x.id)}>×</a>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--muted)', padding: '20px 10px' }}>No entries</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    {isOpen && <Modal title={'Add ' + noun} onClose={close}><form onSubmit={add}>
      <label style={{ display:'block',fontSize:11,fontWeight:600,color:'var(--muted)',marginBottom:4 }}>Date</label>
      <input type="date" value={form.entry_date} onChange={set('entry_date')} style={modalInputStyle} />
      <label style={{ display:'block',fontSize:11,fontWeight:600,color:'var(--muted)',marginBottom:4 }}>Details</label>
      <input value={form.details} onChange={set('details')} style={modalInputStyle} />
      <label style={{ display:'block',fontSize:11,fontWeight:600,color:'var(--muted)',marginBottom:4 }}>Category</label>
      <input list={table + '-cats'} value={form.category} onChange={set('category')} style={modalInputStyle} />
      <datalist id={table + '-cats'}>{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <label style={{ display:'block',fontSize:11,fontWeight:600,color:'var(--muted)',marginBottom:4 }}>Account</label>
      <select value={form.account_id} onChange={set('account_id')} style={modalInputStyle}>{accts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <label style={{ display:'block',fontSize:11,fontWeight:600,color:'var(--muted)',marginBottom:4 }}>Amount</label>
      <input type="number" step="0.01" min="0" value={form.amount} onChange={set('amount')} style={modalInputStyle} />
      <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button><p className="err">{err}</p>
    </form></Modal>}
  </>);
}
