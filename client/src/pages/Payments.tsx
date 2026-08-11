import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatDateInput, formatINR } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

const emptyForm = { date: formatDateInput(), party_id: '', amount: '', mode: 'bank', direction: 'receive', bank_name: '', remarks: '' };

export default function Payments() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.payments.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  const loadMeta = useCallback(async () => {
    try { setParties(await api.parties.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
  }, [addToast]);

  useEffect(() => { load(); loadMeta(); }, [load, loadMeta]);

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
          <p className="text-sm text-heading/50">Recording a payment logs an activity notification</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record Payment</button>
      </div>

      {loading ? <Skeleton.Table columns={6} /> : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="table-clean w-full text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur">
              <tr>
                <th>Date</th>
                <th>Party</th>
                <th>Direction</th>
                <th>Amount</th>
                <th>Mode</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">{formatDate(r.date)}</td>
                  <td className="px-4 py-2.5 font-medium text-heading">{r.party_name}</td>
                  <td className="px-4 py-2.5 capitalize">{r.direction === 'receive' ? 'Received' : 'Paid'}</td>
                  <td className="px-4 py-2.5">{formatINR(r.amount)}</td>
                  <td className="px-4 py-2.5 capitalize">{r.mode}{r.bank_name ? ` · ${r.bank_name}` : ''}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => remove(r.id)} className="text-heading/40 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-heading/40">No payments yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Record Payment">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Party</label>
            <select className="input-field" value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })}>
              <option value="">Select…</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Direction</label>
              <select className="input-field" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
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
