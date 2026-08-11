import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatINR } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

const emptyForm = { name: '', phone: '', address: '', type: 'dealer', opening_balance: '', opening_balance_type: 'dr' };

export default function Customers() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.parties.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) return addToast('Name is required', 'error');
    setSaving(true);
    try {
      await api.parties.create(form);
      addToast('Party added');
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-heading">Customers &amp; Dealers</h1>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Party</button>
      </div>

      {loading ? <Skeleton.Table columns={4} /> : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="table-clean w-full text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur">
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Type</th>
                <th className="!text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/customers/${r.id}`)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-xs font-bold text-brand-600">
                        {r.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-medium text-heading">{r.name}</span>
                    </div>
                  </td>
                  <td className="text-heading/60">{r.phone || '—'}</td>
                  <td className="capitalize text-heading/60">{r.type}</td>
                  <td className={`text-right font-semibold tabular-nums ${Number(r.outstanding) > 0 ? 'text-outstanding' : 'text-profit'}`}>
                    {Number(r.outstanding) === 0 ? 'Cleared' : formatINR(Math.abs(r.outstanding))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-heading/40">No parties yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Party">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Name</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Phone</label>
              <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Type</label>
              <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="dealer">Dealer</option>
                <option value="contractor">Contractor</option>
                <option value="builder">Builder</option>
                <option value="institution">Institution</option>
                <option value="supplier">Supplier</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Address</label>
            <input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Opening balance</label>
              <input type="number" className="input-field" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Balance type</label>
              <select className="input-field" value={form.opening_balance_type} onChange={(e) => setForm({ ...form, opening_balance_type: e.target.value })}>
                <option value="dr">They owe us (Dr)</option>
                <option value="cr">We owe them (Cr)</option>
              </select>
            </div>
          </div>
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}
