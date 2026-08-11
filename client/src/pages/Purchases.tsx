import { useCallback, useEffect, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { IndianRupee, ListOrdered, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatDateInput, formatINR, formatNumber } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { KPICard } from '../components/ui/KPICard';
import { DataTable } from '../components/ui/DataTable';

const emptyForm = {
  date: formatDateInput(),
  product_id: '',
  quantity: '',
  purchase_rate: '',
  source: 'factory',
  location_id: '',
  supplier_id: '',
  vehicle_number: '',
  remarks: '',
};

const SOURCE_LABEL: Record<string, string> = {
  factory: 'Factory',
  rail_rack: 'Rail rack',
  godown_transfer: 'Godown transfer',
};

const SOURCE_STYLE: Record<string, string> = {
  factory: 'bg-purchase/10 text-purchase',
  rail_rack: 'bg-brand-500/10 text-brand-600',
  godown_transfer: 'bg-profit/10 text-profit',
};

interface PurchaseRow {
  id: number;
  date: string;
  product_name: string;
  unit: string;
  quantity: number;
  purchase_rate: number;
  purchase_amount: number;
  source: string;
  location_name: string;
  supplier_name: string | null;
  vehicle_number: string | null;
  remarks: string | null;
}

const col = createColumnHelper<PurchaseRow>();

export default function Purchases() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.purchases.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  const loadMeta = useCallback(async () => {
    try {
      const [p, l, parties] = await Promise.all([api.products.list(), api.locations.list(), api.parties.list()]);
      setProducts(p);
      setLocations(l);
      setSuppliers(parties.filter((x: any) => x.type === 'supplier'));
    } catch (e: any) { addToast(e.message, 'error'); }
  }, [addToast]);

  useEffect(() => { load(); loadMeta(); }, [load, loadMeta]);

  const save = async () => {
    if (!form.product_id || !form.quantity || !form.purchase_rate || !form.location_id) {
      return addToast('Product, quantity, rate and location are required', 'error');
    }
    setSaving(true);
    try {
      await api.purchases.create({ ...form, supplier_id: form.supplier_id || undefined });
      addToast('Purchase recorded');
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this purchase?')) return;
    try { await api.purchases.delete(id); addToast('Deleted'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  const filtersActive = !!(search || productFilter || sourceFilter || locationFilter || dateFrom || dateTo);
  const clearFilters = () => {
    setSearch(''); setProductFilter(''); setSourceFilter(''); setLocationFilter(''); setDateFrom(''); setDateTo('');
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (productFilter && r.product_name !== productFilter) return false;
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (locationFilter && r.location_name !== locationFilter) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (q) {
        const hay = `${r.product_name} ${r.location_name} ${r.supplier_name || ''} ${r.vehicle_number || ''} ${r.remarks || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, productFilter, sourceFilter, locationFilter, dateFrom, dateTo]);

  const totalValue = filteredRows.reduce((s, r) => s + Number(r.purchase_amount), 0);
  const supplierCount = new Set(filteredRows.map((r) => r.supplier_name).filter(Boolean)).size;

  const columns = useMemo(() => [
    col.accessor('date', { header: 'Date', cell: (c) => formatDate(c.getValue()) }),
    col.accessor('product_name', { header: 'Product', cell: (c) => <span className="font-medium text-heading">{c.getValue()}</span> }),
    col.accessor('quantity', {
      header: 'Qty', meta: { align: 'right' },
      cell: (c) => `${formatNumber(c.getValue())} ${c.row.original.unit}`,
      sortingFn: 'basic',
    }),
    col.accessor('purchase_rate', { header: 'Rate', meta: { align: 'right' }, cell: (c) => formatINR(c.getValue()) }),
    col.accessor('purchase_amount', {
      header: 'Amount', meta: { align: 'right' },
      cell: (c) => <span className="font-semibold text-heading">{formatINR(c.getValue())}</span>,
    }),
    col.accessor('source', {
      header: 'Source',
      cell: (c) => <span className={`pill ${SOURCE_STYLE[c.getValue()] || ''}`}>{SOURCE_LABEL[c.getValue()] || c.getValue()}</span>,
    }),
    col.accessor('location_name', { header: 'Location' }),
    col.accessor('supplier_name', { header: 'Supplier', cell: (c) => c.getValue() || <span className="text-heading/30">—</span> }),
    col.display({
      id: 'actions', header: '',
      cell: (c) => (
        <div className="text-right">
          <button onClick={() => remove(c.row.original.id)} className="text-heading/40 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Purchases</h1>
          <p className="text-sm text-heading/50">Every purchase lot, with rate &amp; source traceability</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record Purchase</button>
      </div>

      {loading ? <Skeleton.Table columns={7} /> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KPICard title="Total Spend" value={formatINR(totalValue)} subtitle={`${filteredRows.length} purchase${filteredRows.length === 1 ? '' : 's'}`} icon={IndianRupee} color="purchase" />
            <KPICard title="Purchase Entries" value={String(filteredRows.length)} subtitle={filtersActive ? 'matching filters' : 'all time'} icon={ListOrdered} color="brand" />
            <KPICard title="Suppliers Used" value={String(supplierCount)} subtitle="in current view" icon={Users} color="profit" />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-card-border bg-card p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-heading/30" />
              <input
                className="input-field !pl-9"
                placeholder="Search product, location, supplier, vehicle…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="input-field w-auto" value={productFilter} onChange={(e) => setProductFilter(e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <select className="input-field w-auto" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <select className="input-field w-auto" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
            <input type="date" className="input-field w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
            <input type="date" className="input-field w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
            {filtersActive && (
              <button className="btn-secondary !px-3" onClick={clearFilters} title="Clear filters"><X className="h-4 w-4" /> Clear</button>
            )}
          </div>

          <DataTable
            data={filteredRows}
            columns={columns}
            emptyMessage={filtersActive ? 'No purchases match these filters' : 'No purchases yet'}
            initialSorting={[{ id: 'date', desc: true }]}
          />
        </>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Record Purchase" size="lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Date</label>
              <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Source</label>
              <select className="input-field" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value, location_id: '' })}>
                <option value="factory">Factory</option>
                <option value="rail_rack">Railway Rack</option>
                <option value="godown_transfer">Godown Transfer</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Product</label>
              <select className="input-field" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
                <option value="">Select…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Landed at (location)</label>
              <select className="input-field" value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                <option value="">Select…</option>
                {locations
                  .filter((l) => Number(l.is_active) !== 0)
                  .filter((l) => form.source === 'rail_rack' ? l.type === 'rail_platform' : l.type === 'own_godown' || l.type === 'rented_godown')
                  .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {form.source === 'rail_rack' && locations.filter((l) => l.type === 'rail_platform' && Number(l.is_active) !== 0).length === 0 && (
                <p className="mt-1 text-sm text-outstanding">No rail platform set up yet — add one in Masters → Locations.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Quantity</label>
              <input type="number" className="input-field" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Rate</label>
              <input type="number" className="input-field" value={form.purchase_rate} onChange={(e) => setForm({ ...form, purchase_rate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Supplier (optional)</label>
              <select className="input-field" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Vehicle / Wagon No.</label>
              <input className="input-field" value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} />
            </div>
          </div>
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
