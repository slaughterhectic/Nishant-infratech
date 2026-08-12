import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatDateInput, formatINR } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { PartySelect } from '../components/PartySelect';

const emptyForm = { date: formatDateInput(), party_id: '', amount: '', mode: 'bank', direction: 'receive', bank_name: '', remarks: '' };

// Every money-affecting event, not just explicit payment records — a purchase
// increases what we owe a supplier, a sale increases what a customer owes us,
// exactly like the running balance on a party's own Ledger. Mirrors the
// mobile app's combined feed.
type TxnKind = 'purchase' | 'sale' | 'payment_receive' | 'payment_pay';

interface Txn {
  key: string;
  kind: TxnKind;
  date: string;
  partyName: string;
  amount: number;
  detail?: string;
  paymentId?: number;
}

const KIND_LABEL: Record<TxnKind, string> = {
  purchase: 'Purchase',
  sale: 'Sale',
  payment_receive: 'Received',
  payment_pay: 'Paid',
};

const KIND_STYLE: Record<TxnKind, string> = {
  purchase: 'bg-purchase/10 text-purchase',
  sale: 'bg-sale/10 text-sale',
  payment_receive: 'bg-profit/10 text-profit',
  payment_pay: 'bg-outstanding/10 text-outstanding',
};

const KIND_AMOUNT_CLASS: Record<TxnKind, string> = {
  purchase: 'text-heading',
  sale: 'text-heading',
  payment_receive: 'text-profit',
  payment_pay: 'text-outstanding',
};

const FILTERS: { key: 'all' | TxnKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sale', label: 'Sales' },
  { key: 'purchase', label: 'Purchases' },
  { key: 'payment_receive', label: 'Received' },
  { key: 'payment_pay', label: 'Paid' },
];

export default function Payments() {
  const addToast = useToastStore((s) => s.addToast);
  const [payments, setPayments] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | TxnKind>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pm, pu, ds] = await Promise.all([
        api.payments.list(),
        api.purchases.list(),
        api.dispatches.list({ kind: 'sale' }),
      ]);
      setPayments(pm);
      setPurchases(pu);
      setDispatches(ds);
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const transactions = useMemo<Txn[]>(() => {
    const rows: Txn[] = [];
    for (const p of purchases) {
      rows.push({
        key: `purchase-${p.id}`,
        kind: 'purchase',
        date: p.date,
        partyName: p.supplier_name || 'No supplier set',
        amount: Number(p.purchase_amount),
        detail: `${p.product_name ?? ''}${p.location_name ? ` · ${p.location_name}` : ''}`,
      });
    }
    for (const d of dispatches) {
      if (d.status === 'cancelled' || !d.party_id) continue;
      rows.push({
        key: `dispatch-${d.id}`,
        kind: 'sale',
        date: d.date,
        partyName: d.party_name || 'Unknown party',
        amount: Number(d.total_amount),
        detail: d.product_name ?? '',
      });
    }
    for (const pm of payments) {
      rows.push({
        key: `payment-${pm.id}`,
        kind: pm.direction === 'receive' ? 'payment_receive' : 'payment_pay',
        date: pm.date,
        partyName: pm.party_name,
        amount: Number(pm.amount),
        detail: pm.mode === 'bank' && pm.bank_name ? pm.bank_name : pm.mode,
        paymentId: pm.id,
      });
    }
    rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.key.localeCompare(a.key)));
    return rows;
  }, [purchases, dispatches, payments]);

  const filteredTransactions = filter === 'all' ? transactions : transactions.filter((t) => t.kind === filter);

  const save = async () => {
    if (!form.party_id || !form.amount) return addToast('Party and amount are required', 'error');
    setSaving(true);
    try {
      await api.payments.create(form);
      addToast('Payment recorded');
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this payment?')) return;
    try { await api.payments.delete(id); addToast('Deleted'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Payments &amp; Collections</h1>
          <p className="text-sm text-heading/50">Every purchase, sale and payment, in one combined feed</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record Payment</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.key ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' : 'border border-card-border bg-card text-heading/60 hover:bg-surface'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <Skeleton.Table columns={6} /> : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="table-clean w-full text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur">
              <tr>
                <th>Date</th>
                <th>Party</th>
                <th>Type</th>
                <th>Detail</th>
                <th className="text-right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {filteredTransactions.map((t) => (
                <tr key={t.key}>
                  <td className="px-4 py-2.5">{formatDate(t.date)}</td>
                  <td className="px-4 py-2.5 font-medium text-heading">{t.partyName}</td>
                  <td className="px-4 py-2.5"><span className={`pill ${KIND_STYLE[t.kind]}`}>{KIND_LABEL[t.kind]}</span></td>
                  <td className="px-4 py-2.5 text-heading/60">{t.detail || '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${KIND_AMOUNT_CLASS[t.kind]}`}>{formatINR(t.amount)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {t.paymentId ? (
                      <button onClick={() => remove(t.paymentId!)} className="text-heading/40 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-heading/40">Nothing here yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Record Payment">
        <div className="space-y-3">
          <PartySelect
            label="Party"
            required
            partyType={form.direction === 'receive' ? 'customer' : 'supplier'}
            value={form.party_id ? Number(form.party_id) : undefined}
            onChange={(party_id) => setForm({ ...form, party_id: String(party_id) })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Direction</label>
              <select className="input-field" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value, party_id: '' })}>
                <option value="receive">Receive</option>
                <option value="pay">Pay</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Amount</label>
              <input type="number" className="input-field" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Date</label>
              <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Mode</label>
              <select className="input-field" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
          {form.mode === 'bank' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Bank name</label>
              <input className="input-field" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Remarks</label>
            <input className="input-field" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}
