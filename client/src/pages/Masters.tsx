import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

type Tab = 'products' | 'locations' | 'vehicles' | 'drivers';

const TABS: { key: Tab; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'locations', label: 'Locations' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'drivers', label: 'Drivers' },
];

export default function Masters() {
  const [tab, setTab] = useState<Tab>('products');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-heading">Masters</h1>
      <div className="flex gap-1 border-b border-card-border">
        {TABS.map((t) => (
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
      {tab === 'products' && <ProductsTab />}
      {tab === 'locations' && <LocationsTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'drivers' && <DriversTab />}
    </div>
  );
}

function ProductsTab() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'cement', unit: 'bag', product_type: '', manufacturer: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.products.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) return addToast('Name is required', 'error');
    setSaving(true);
    try {
      await api.products.create(form);
      addToast('Product added');
      setOpen(false);
      setForm({ name: '', category: 'cement', unit: 'bag', product_type: '', manufacturer: '' });
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this product?')) return;
    try { await api.products.delete(id); addToast('Deleted'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  if (loading) return <Skeleton.Table columns={5} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Product</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
        <table className="table-clean w-full text-sm">
          <thead className="sticky top-0 z-10 backdrop-blur">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Unit</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-medium text-heading">{r.name}</td>
                <td className="px-4 py-2.5 capitalize">{r.category}</td>
                <td className="px-4 py-2.5">{r.unit}</td>
                <td className="px-4 py-2.5">{r.product_type || '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(r.id)} className="text-heading/40 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-heading/40">No products yet</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Product">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Name</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Category</label>
              <select
                className="input-field"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value, unit: e.target.value === 'sariya' ? 'ton' : 'bag' })}
              >
                <option value="cement">Cement</option>
                <option value="sariya">Sariya</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Unit</label>
              <select className="input-field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="bag">Bag</option>
                <option value="ton">Ton</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Type (OPC / 8mm etc.)</label>
              <input className="input-field" value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Manufacturer</label>
              <input className="input-field" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
            </div>
          </div>
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}

function LocationsTab() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'own_godown', rented_category: '', address: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.locations.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) return addToast('Name is required', 'error');
    setSaving(true);
    try {
      await api.locations.create(form);
      addToast('Location added');
      setOpen(false);
      setForm({ name: '', type: 'own_godown', rented_category: '', address: '' });
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this location?')) return;
    try { await api.locations.delete(id); addToast('Deleted'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  if (loading) return <Skeleton.Table columns={4} />;

  const typeLabel = (t: string, cat?: string) => t === 'own_godown' ? 'Own godown' : t === 'rented_godown' ? `Rented (${cat || '—'})` : 'Rail platform';

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Location</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
        <table className="table-clean w-full text-sm">
          <thead className="sticky top-0 z-10 backdrop-blur">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Address</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-medium text-heading">{r.name}</td>
                <td className="px-4 py-2.5">{typeLabel(r.type, r.rented_category)}</td>
                <td className="px-4 py-2.5">{r.address || '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(r.id)} className="text-heading/40 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Location">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Name</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Type</label>
            <select className="input-field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="own_godown">Own godown</option>
              <option value="rented_godown">Rented godown</option>
              <option value="rail_platform">Rail platform</option>
            </select>
          </div>
          {form.type === 'rented_godown' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Category</label>
              <select className="input-field" value={form.rented_category} onChange={(e) => setForm({ ...form, rented_category: e.target.value })}>
                <option value="">—</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Address</label>
            <input className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}

function VehiclesTab() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicle_number: '', kind: 'truck', ownership: 'owned' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.vehicles.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.vehicle_number.trim()) return addToast('Vehicle number is required', 'error');
    setSaving(true);
    try {
      await api.vehicles.create(form);
      addToast('Vehicle added');
      setOpen(false);
      setForm({ vehicle_number: '', kind: 'truck', ownership: 'owned' });
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this vehicle?')) return;
    try { await api.vehicles.delete(id); addToast('Deleted'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  if (loading) return <Skeleton.Table columns={4} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Vehicle</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
        <table className="table-clean w-full text-sm">
          <thead className="sticky top-0 z-10 backdrop-blur">
            <tr>
              <th className="px-4 py-2.5">Vehicle Number</th>
              <th className="px-4 py-2.5">Kind</th>
              <th className="px-4 py-2.5">Ownership</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-medium text-heading">{r.vehicle_number}</td>
                <td className="px-4 py-2.5 capitalize">{r.kind}</td>
                <td className="px-4 py-2.5 capitalize">{r.ownership}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(r.id)} className="text-heading/40 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Vehicle">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Vehicle Number</label>
            <input className="input-field" value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Kind</label>
              <select className="input-field" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="truck">Truck</option>
                <option value="trolley">Trolley</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Ownership</label>
              <select className="input-field" value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })}>
                <option value="owned">Owned</option>
                <option value="rented">Rented</option>
              </select>
            </div>
          </div>
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}

function DriversTab() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.drivers.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) return addToast('Name is required', 'error');
    setSaving(true);
    try {
      await api.drivers.create(form);
      addToast('Driver added');
      setOpen(false);
      setForm({ name: '', phone: '' });
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this driver?')) return;
    try { await api.drivers.delete(id); addToast('Deleted'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  if (loading) return <Skeleton.Table columns={3} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Driver</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
        <table className="table-clean w-full text-sm">
          <thead className="sticky top-0 z-10 backdrop-blur">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-medium text-heading">{r.name}</td>
                <td className="px-4 py-2.5">{r.phone || '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => remove(r.id)} className="text-heading/40 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Driver">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Name</label>
            <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Phone</label>
            <input className="input-field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>
    </div>
  );
}
