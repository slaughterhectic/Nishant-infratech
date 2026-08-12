import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatINR } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE, isValidMobileNumber, toE164 } from '../lib/phone';

const emptyForm = { name: '', phone: '', address: '', type: 'dealer', opening_balance: '', opening_balance_type: 'dr' };

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function nextAvailableName(baseName: string, existing: any[]): string {
  const trimmed = baseName.trim();
  let n = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = `${trimmed} (${n})`;
    if (!existing.some((p) => namesMatch(p.name, candidate))) return candidate;
    n += 1;
  }
}

export default function Customers() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pendingDuplicateName, setPendingDuplicateName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.parties.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const closeForm = () => {
    setOpen(false);
    setForm(emptyForm);
    setCountryCode(DEFAULT_COUNTRY_CODE);
    setPhoneError(null);
    setPendingDuplicateName(null);
  };

  const save = async () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) return addToast('Name is required', 'error');
    if (form.phone && !isValidMobileNumber(countryCode, form.phone)) {
      setPhoneError('Enter a valid mobile number');
      return;
    }
    setPhoneError(null);

    let finalName = trimmedName;
    if (pendingDuplicateName) {
      finalName = pendingDuplicateName;
    } else {
      const duplicate = rows.find((p) => namesMatch(p.name, trimmedName));
      if (duplicate) {
        setPendingDuplicateName(nextAvailableName(trimmedName, rows));
        return;
      }
    }

    setSaving(true);
    try {
      await api.parties.create({ ...form, name: finalName, phone: form.phone ? toE164(countryCode, form.phone) : '' });
      addToast('Party added');
      closeForm();
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

      <Modal isOpen={open} onClose={closeForm} title="Add Party">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Name</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setPendingDuplicateName(null); }}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Phone</label>
            <div className="flex gap-2">
              <select className="input-field w-36" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                {COUNTRY_CODES.map((c) => <option key={c.dialCode} value={c.dialCode}>{c.name} {c.dialCode}</option>)}
              </select>
              <input
                className="input-field w-full"
                value={form.phone}
                onChange={(e) => { setForm({ ...form, phone: e.target.value }); setPhoneError(null); }}
                placeholder="Mobile number"
              />
            </div>
            {phoneError && <p className="mt-1 text-xs text-outstanding">{phoneError}</p>}
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
          {pendingDuplicateName && (
            <div className="rounded-lg bg-stock-warn/10 p-3">
              <p className="text-xs font-medium text-stock-warn">
                A party named "{form.name.trim()}" already exists. Saving will add this one as "{pendingDuplicateName}" instead.
              </p>
            </div>
          )}
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : pendingDuplicateName ? 'Save anyway' : 'Save'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
