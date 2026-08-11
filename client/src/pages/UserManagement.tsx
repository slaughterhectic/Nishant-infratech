import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Notebook, Plus, ShieldCheck, UserCog } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'godown_manager', label: 'Godown Manager' },
  { value: 'gatekeeper', label: 'Gatekeeper' },
  { value: 'collection_staff', label: 'Collection Staff' },
  { value: 'driver', label: 'Driver' },
];

const PERMISSIONS: { key: string; label: string; hint: string }[] = [
  { key: 'purchases', label: 'Purchases', hint: 'Record stock coming in' },
  { key: 'orders', label: 'Orders', hint: 'Take customer orders, punch against live stock' },
  { key: 'dispatch', label: 'Sales & Dispatch', hint: 'Punch orders, view dispatch history' },
  { key: 'sales_analytics', label: 'Sales Analytics', hint: 'Margins, brand performance, delivery tracking' },
  { key: 'gate', label: 'Gate Entry', hint: 'Load trucks against punched orders' },
  { key: 'otp', label: 'OTP Confirmations', hint: 'Generate & verify delivery OTPs' },
  { key: 'rail_rack', label: 'Rail Rack', hint: 'Wagon entries & allocation' },
  { key: 'stock', label: 'Godown Stock', hint: 'View stock across locations' },
  { key: 'vehicle_ledger', label: 'Vehicle Ledger', hint: 'Trip & expense vouchers' },
  { key: 'payments', label: 'Payments', hint: 'Record collections' },
  { key: 'customers', label: 'Customers', hint: 'Party ledgers & outstanding' },
  { key: 'masters', label: 'Masters', hint: 'Products, locations, vehicles, drivers' },
  { key: 'reports', label: 'Reports', hint: 'P&L, sales, outstanding' },
];

const emptyForm = { username: '', password: '', display_name: '', role: 'accountant', driver_id: '' };

export default function UserManagement() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [permTarget, setPermTarget] = useState<any | null>(null);
  const [permSelection, setPermSelection] = useState<Set<string>>(new Set());
  const [savingPerms, setSavingPerms] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.auth.listUsers()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); api.drivers.list().then(setDrivers).catch(() => {}); }, [load]);

  const save = async () => {
    if (!form.username.trim() || !form.password || !form.display_name.trim()) {
      return addToast('Username, password and display name are required', 'error');
    }
    setSaving(true);
    try {
      await api.auth.createUser({ ...form, driver_id: form.driver_id ? Number(form.driver_id) : undefined });
      addToast('User created');
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u: any) => {
    try { await api.auth.updateUser(u.id, { is_active: u.is_active ? 0 : 1 }); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  const openPermissions = (u: any) => {
    setPermTarget(u);
    setPermSelection(new Set(u.permissions || []));
  };

  const togglePerm = (key: string) => {
    setPermSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const savePermissions = async () => {
    if (!permTarget) return;
    setSavingPerms(true);
    try {
      await api.auth.updatePermissions(permTarget.id, Array.from(permSelection));
      addToast('Permissions updated');
      setPermTarget(null);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSavingPerms(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">User Management</h1>
          <p className="text-sm text-heading/50">The owner adds staff and controls exactly which pages each one can open</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add User</button>
      </div>

      {loading ? <Skeleton.Table columns={5} /> : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="table-clean w-full text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur"><tr>
              <th>Name</th><th>Username</th><th>Role</th><th>Access</th><th>Status</th><th></th>
            </tr></thead>
            <tbody className="divide-y divide-card-border">
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium text-heading">{u.display_name}</td>
                  <td className="text-heading/60">{u.username}</td>
                  <td>
                    <span className="pill bg-brand-500/10 text-brand-600"><span className="pill-dot" />{ROLES.find((r) => r.value === u.role)?.label || u.role}</span>
                  </td>
                  <td className="text-heading/60">
                    {u.role === 'owner' ? (
                      <span className="inline-flex items-center gap-1 text-heading/50"><ShieldCheck className="h-3.5 w-3.5" /> Full access</span>
                    ) : u.role === 'driver' ? (
                      <span className="inline-flex items-center gap-1 text-heading/50"><Notebook className="h-3.5 w-3.5" /> {u.driver_name ? `Own ledger — ${u.driver_name}` : 'Not linked to a driver'}</span>
                    ) : (
                      `${(u.permissions || []).length} of ${PERMISSIONS.length} pages`
                    )}
                  </td>
                  <td>
                    <span className={`pill ${u.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                      <span className="pill-dot" />{u.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      {u.role !== 'owner' && u.role !== 'driver' && (
                        <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => openPermissions(u)}>
                          <UserCog className="h-3.5 w-3.5" /> Permissions
                        </button>
                      )}
                      <button className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add User">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Display name</label>
            <input className="input-field" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Username</label>
              <input className="input-field" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Password</label>
              <input type="password" className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Role</label>
            <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.filter((r) => r.value !== 'owner').map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {form.role === 'driver' ? (
              <p className="mt-1 text-xs text-heading/40">Drivers get their own minimal login — just their trip ledger, nothing else.</p>
            ) : (
              <p className="mt-1 text-xs text-heading/40">Sets a starting set of permissions — you can fine-tune them afterwards.</p>
            )}
          </div>
          {form.role === 'driver' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Link to driver record</label>
              <select className="input-field" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
                <option value="">+ Create a new driver record named "{form.display_name || '…'}"</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` — ${d.phone}` : ''}</option>)}
              </select>
              <p className="mt-1 text-xs text-heading/40">Their trip entries in Vehicle Ledger / Masters will be tied to this driver.</p>
            </div>
          )}
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>

      <Modal isOpen={!!permTarget} onClose={() => setPermTarget(null)} title={`Permissions — ${permTarget?.display_name || ''}`} size="lg">
        <div className="space-y-1">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-heading/60">Tick the pages {permTarget?.display_name} can open</p>
            <div className="flex gap-2 text-xs">
              <button className="text-brand-600 hover:underline" onClick={() => setPermSelection(new Set(PERMISSIONS.map((p) => p.key)))}>Select all</button>
              <button className="text-heading/40 hover:underline" onClick={() => setPermSelection(new Set())}>Clear</button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PERMISSIONS.map((p) => (
              <label
                key={p.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  permSelection.has(p.key) ? 'border-brand-400 bg-brand-500/[0.06]' : 'border-card-border hover:bg-surface'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded accent-brand-500"
                  checked={permSelection.has(p.key)}
                  onChange={() => togglePerm(p.key)}
                />
                <div>
                  <p className="text-sm font-medium text-heading">{p.label}</p>
                  <p className="text-xs text-heading/45">{p.hint}</p>
                </div>
              </label>
            ))}
          </div>
          <button className="btn-primary mt-4 w-full justify-center" onClick={savePermissions} disabled={savingPerms}>
            <KeyRound className="h-4 w-4" /> {savingPerms ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
