import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatINR, formatNumber } from '../lib/format';
import { MonthPicker } from '../components/MonthPicker';
import { Skeleton } from '../components/ui/Skeleton';

type Tab = 'sales' | 'purchases' | 'outstanding' | 'pnl';

export default function Reports() {
  const [tab, setTab] = useState<Tab>('pnl');
  const [month, setMonth] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-heading">Reports</h1>
        {tab !== 'outstanding' && <MonthPicker value={month} onChange={setMonth} />}
      </div>
      <div className="flex gap-1 border-b border-card-border">
        {([
          { key: 'pnl', label: 'Profit & Loss' },
          { key: 'sales', label: 'Sales' },
          { key: 'purchases', label: 'Purchases' },
          { key: 'outstanding', label: 'Outstanding' },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-brand-500 text-brand-600' : 'border-transparent text-heading/60 hover:text-heading'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'pnl' && <PnlTab month={month} />}
      {tab === 'sales' && <SalesTab month={month} />}
      {tab === 'purchases' && <PurchasesTab month={month} />}
      {tab === 'outstanding' && <OutstandingTab />}
    </div>
  );
}

function PnlTab({ month }: { month: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.reports.pnl(month || undefined)); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [month, addToast]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <Skeleton.Card />;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="card"><p className="text-sm text-heading/50">Sales</p><p className="text-xl font-bold text-sale">{formatINR(data.sales)}</p></div>
      <div className="card"><p className="text-sm text-heading/50">Purchases</p><p className="text-xl font-bold text-purchase">{formatINR(data.purchases)}</p></div>
      <div className="card"><p className="text-sm text-heading/50">Expenses</p><p className="text-xl font-bold text-outstanding">{formatINR(data.expenses)}</p></div>
      <div className="card"><p className="text-sm text-heading/50">Gross Profit</p><p className="text-xl font-bold text-heading">{formatINR(data.gross)}</p></div>
      <div className="card sm:col-span-2"><p className="text-sm text-heading/50">Net Profit</p><p className="text-2xl font-black text-profit">{formatINR(data.net)}</p></div>
    </div>
  );
}

function SalesTab({ month }: { month: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.reports.sales(month || undefined)); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [month, addToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton.Table columns={5} />;

  return (
    <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-surface/70 text-left text-xs uppercase text-heading/50">
          <tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Dispatch</th><th className="px-4 py-2.5">Party</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-right">Amount</th></tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5">{formatDate(r.date)}</td>
              <td className="px-4 py-2.5 font-mono text-xs">{r.dispatch_number}</td>
              <td className="px-4 py-2.5 font-medium text-heading">{r.party_name || '—'}</td>
              <td className="px-4 py-2.5">{formatNumber(r.quantity)} {r.unit} {r.product_name}</td>
              <td className="px-4 py-2.5 text-right">{formatINR(r.total_amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-heading/40">No sales in this period</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function PurchasesTab({ month }: { month: string }) {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.reports.purchases(month || undefined)); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [month, addToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton.Table columns={5} />;

  return (
    <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-surface/70 text-left text-xs uppercase text-heading/50">
          <tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Location</th><th className="px-4 py-2.5">Source</th><th className="px-4 py-2.5 text-right">Amount</th></tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5">{formatDate(r.date)}</td>
              <td className="px-4 py-2.5 font-medium text-heading">{formatNumber(r.quantity)} {r.unit} {r.product_name}</td>
              <td className="px-4 py-2.5">{r.location_name}</td>
              <td className="px-4 py-2.5 capitalize">{r.source.replace('_', ' ')}</td>
              <td className="px-4 py-2.5 text-right">{formatINR(r.purchase_amount)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-heading/40">No purchases in this period</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function OutstandingTab() {
  const addToast = useToastStore((s) => s.addToast);
  const [data, setData] = useState<{ receivable: any[]; payable: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.reports.outstanding()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <Skeleton.Card />;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-2 font-semibold text-heading">Receivable (customers owe us)</h3>
        <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card">
          {data.receivable.map((r) => (
            <div key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-heading">{r.name}</span>
              <span className="font-medium text-outstanding">{formatINR(r.outstanding)}</span>
            </div>
          ))}
          {data.receivable.length === 0 && <p className="px-4 py-6 text-center text-sm text-heading/40">Nothing outstanding</p>}
        </div>
      </div>
      <div>
        <h3 className="mb-2 font-semibold text-heading">Payable (we owe suppliers)</h3>
        <div className="divide-y divide-card-border rounded-xl border border-card-border bg-card">
          {data.payable.map((r) => (
            <div key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-heading">{r.name}</span>
              <span className="font-medium text-purchase">{formatINR(r.outstanding)}</span>
            </div>
          ))}
          {data.payable.length === 0 && <p className="px-4 py-6 text-center text-sm text-heading/40">Nothing outstanding</p>}
        </div>
      </div>
    </div>
  );
}
