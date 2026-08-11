import { useCallback, useEffect, useState } from 'react';
import { Warehouse } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatNumber } from '../lib/format';
import { Skeleton } from '../components/ui/Skeleton';

export default function GodownStock() {
  const addToast = useToastStore((s) => s.addToast);
  const [summary, setSummary] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<'cement' | 'sariya'>('cement');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([api.stock.summary(), api.stock.list(true)]);
      setSummary(s);
      setStock(st);
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Skeleton.Card />;

  const locationTypeLabel = (t: string, cat?: string) =>
    t === 'own_godown' ? 'Own godown' : t === 'rented_godown' ? `Rented godown (${cat || '—'})` : 'Rail platform';

  const filteredStock = stock.filter((r) => r.category === category);
  const locationsForCategory = Array.from(new Set(filteredStock.map((r) => r.location_id)))
    .map((id) => filteredStock.find((r) => r.location_id === id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Godown Stock</h1>
        <p className="text-sm text-heading/50">Real-time balance across all locations</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summary.map((l) => (
          <div key={l.location_id} className="card">
            <div className="mb-3 flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-brand-500" />
              <p className="font-semibold text-heading">{l.location_name}</p>
            </div>
            <p className="text-xs uppercase tracking-wide text-heading/40">{locationTypeLabel(l.location_type, l.rented_category)}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-heading/60">Cement</span>
                <span className="font-semibold text-heading">{formatNumber(l.cement_bags)} bags</span>
              </div>
              <div className="border-t border-card-border" />
              <div className="flex items-center justify-between">
                <span className="text-heading/60">Sariya</span>
                <span className="font-semibold text-heading">{formatNumber(l.sariya_tons)} ton</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-card-border">
        {(['cement', 'sariya'] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              category === c ? 'border-brand-500 text-brand-600' : 'border-transparent text-heading/60 hover:text-heading'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
        <table className="table-clean w-full text-sm">
          <thead className="sticky top-0 z-10 backdrop-blur">
            <tr>
              <th>Brand / Type</th>
              {locationsForCategory.map((l) => <th key={l.location_id}>{l.location_name}</th>)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {Array.from(new Set(filteredStock.map((r) => r.product_id))).map((pid) => {
              const productRows = filteredStock.filter((r) => r.product_id === pid);
              const name = productRows[0]?.product_name;
              const unit = productRows[0]?.unit;
              const total = productRows.reduce((s, r) => s + Number(r.quantity), 0);
              return (
                <tr key={pid}>
                  <td className="font-medium text-heading">{name}</td>
                  {locationsForCategory.map((l) => {
                    const cell = productRows.find((r) => r.location_id === l.location_id);
                    return <td key={l.location_id} className="tabular-nums">{formatNumber(cell?.quantity || 0)}</td>;
                  })}
                  <td className="font-semibold tabular-nums text-brand-600">{formatNumber(total)} {unit}</td>
                </tr>
              );
            })}
            {filteredStock.length === 0 && (
              <tr><td colSpan={locationsForCategory.length + 2} className="px-4 py-8 text-center text-heading/40">No stock recorded yet</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
