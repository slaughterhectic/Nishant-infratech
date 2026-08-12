import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, PackageSearch, Trash2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore, useAuthStore } from '../lib/store';
import { formatDate, formatDateInput, formatINR, formatNumber } from '../lib/format';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { PartySelect } from '../components/PartySelect';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const REQUEST_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  proceeded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  discarded: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending Review',
  proceeded: 'Proceeded',
  discarded: 'Discarded',
};

const emptyForm = {
  date: formatDateInput(),
  party_id: '',
  product_id: '',
  quantity: '',
  rate: '',
  payment_type: 'cash',
  credit_days: '',
  expected_delivery_date: '',
  destination_address: '',
  remarks: '',
};

export default function Orders() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const canRemove = useAuthStore((s) => s.user?.role !== 'gatekeeper');
  const [rows, setRows] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stockRows, setStockRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setRows(await api.orderRequests.list(statusFilter || undefined)); }
    catch (e: any) { if (!silent) addToast(e.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [addToast, statusFilter]);

  const loadMeta = useCallback(async () => {
    try {
      const [p, pr, st] = await Promise.all([api.parties.list(), api.products.list(), api.stock.list()]);
      setParties(p.filter((x: any) => x.type !== 'supplier'));
      setProducts(pr);
      setStockRows(st);
    } catch (e: any) { addToast(e.message, 'error'); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);
  useAutoRefresh(() => load(true), 8000);

  const availabilityFor = useCallback((productId: number | string) => stockRows
    .filter((r) => String(r.product_id) === String(productId) && Number(r.quantity) > 0)
    .sort((a, b) => Number(b.quantity) - Number(a.quantity)), [stockRows]);

  const availability = useMemo(() => form.product_id ? availabilityFor(form.product_id) : [], [availabilityFor, form.product_id]);
  const requestedQty = Number(form.quantity) || 0;
  const bestAvailable = availability.length ? Number(availability[0].quantity) : 0;
  const canFulfillNow = requestedQty > 0 && bestAvailable >= requestedQty;
  const selectedProduct = products.find((p) => String(p.id) === form.product_id);

  const submitRequest = async () => {
    if (!form.party_id) return addToast('Select the customer', 'error');
    if (!form.product_id) return addToast('Select a product', 'error');
    if (!form.quantity || Number(form.quantity) <= 0) return addToast('Enter a valid quantity', 'error');
    if (!form.rate || Number(form.rate) <= 0) return addToast('Enter the rate', 'error');
    setSaving(true);
    try {
      await api.orderRequests.create({
        ...form,
        credit_days: form.payment_type === 'credit' ? form.credit_days || undefined : undefined,
        expected_delivery_date: form.expected_delivery_date || undefined,
        destination_address: form.destination_address || undefined,
        rate: form.rate || undefined,
        remarks: form.remarks || undefined,
      });
      addToast('Order request saved — awaiting review');
      setForm(emptyForm);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const discard = async (id: number) => {
    if (!confirm('Discard this order request?')) return;
    try { await api.orderRequests.discard(id); addToast('Discarded'); setSelected(null); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  const proceedToSale = (row: any) => {
    navigate('/dispatch', {
      state: {
        prefillOrder: {
          requestId: row.id,
          date: row.date ? row.date.split('T')[0] : formatDateInput(),
          party_id: String(row.party_id),
          product_id: String(row.product_id),
          quantity: String(row.quantity),
          rate: row.rate ? String(row.rate) : '',
          payment_type: row.payment_type || 'cash',
          credit_days: row.credit_days ? String(row.credit_days) : '',
          expected_delivery_date: row.expected_delivery_date ? row.expected_delivery_date.split('T')[0] : '',
          destination_address: row.destination_address || '',
          remarks: row.remarks || '',
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Orders</h1>
        <p className="text-sm text-heading/50">Log what the customer wants — every order still goes through review before it's actually punched</p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-heading">New Order Request</h2>
        <div className="grid grid-cols-2 gap-3">
          <PartySelect
            label="Customer"
            required
            partyType="customer"
            value={form.party_id ? Number(form.party_id) : undefined}
            onChange={(party_id) => {
              const party = parties.find((p) => p.id === party_id);
              setForm({ ...form, party_id: String(party_id), destination_address: party?.address || form.destination_address });
            }}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Product</label>
            <select className="input-field" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
              <option value="">Select…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Quantity {selectedProduct ? `(${selectedProduct.unit})` : ''}</label>
            <input type="number" className="input-field" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Rate</label>
            <input type="number" className="input-field" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </div>
        </div>

        {form.product_id && (
          <div className={`rounded-lg border p-3 ${
            requestedQty === 0 ? 'border-card-border bg-surface/50'
            : canFulfillNow ? 'border-emerald-300 bg-emerald-500/10 dark:border-emerald-700'
            : availability.length ? 'border-amber-300 bg-amber-500/10 dark:border-amber-700'
            : 'border-red-300 bg-red-500/10 dark:border-red-800'
          }`}>
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              {requestedQty === 0 ? (
                <span className="flex items-center gap-1.5 text-heading/60"><PackageSearch className="h-4 w-4" /> {availability.length ? 'Available at:' : 'Not currently in stock anywhere'}</span>
              ) : canFulfillNow ? (
                <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> In stock — can be reviewed &amp; punched right away</span>
              ) : availability.length ? (
                <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><PackageSearch className="h-4 w-4" /> Only partial stock available right now</span>
              ) : (
                <span className="flex items-center gap-1.5 text-outstanding"><XCircle className="h-4 w-4" /> Not in stock anywhere right now</span>
              )}
            </div>
            {availability.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availability.map((r) => (
                  <span key={r.location_id} className="pill bg-card text-heading/70">
                    {r.location_name}: {formatNumber(r.quantity)} {r.unit}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Payment</label>
            <select className="input-field" value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          {form.payment_type === 'credit' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Credit days</label>
              <input type="number" className="input-field" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: e.target.value })} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Expected delivery date</label>
            <input type="date" className="input-field" value={form.expected_delivery_date} onChange={(e) => setForm({ ...form, expected_delivery_date: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-heading/70">Customer Location</label>
          <input className="input-field" value={form.destination_address} onChange={(e) => setForm({ ...form, destination_address: e.target.value })} placeholder="Auto-filled from the customer's address — edit if delivering elsewhere" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-heading/70">Remarks</label>
          <input className="input-field" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>

        <button className="btn-primary w-full justify-center" onClick={submitRequest} disabled={saving}>
          {saving ? 'Saving…' : 'Save Order Request'}
        </button>
        <p className="text-center text-xs text-heading/40">This only logs the request — nothing is punched until it's reviewed and proceeded below.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {[{ v: 'pending', l: 'Pending Review' }, { v: '', l: 'All' }, { v: 'proceeded', l: 'Proceeded' }, { v: 'discarded', l: 'Discarded' }].map((s) => (
          <button
            key={s.v || 'all'}
            onClick={() => setStatusFilter(s.v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s.v ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' : 'border border-card-border bg-card text-heading/60 hover:bg-surface'
            }`}
          >
            {s.l}
          </button>
        ))}
      </div>

      {loading ? <Skeleton.Table columns={6} /> : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="divide-y divide-card-border overflow-auto" style={{ maxHeight: '65vh' }}>
          {rows.map((r) => {
            const avail = availabilityFor(r.product_id);
            const inStock = avail.length ? Number(avail[0].quantity) : 0;
            const enough = inStock >= Number(r.quantity);
            return (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-brand-500/[0.03]"
              >
                <div className="min-w-[110px]">
                  <p className="text-xs text-heading/40">{formatDate(r.date)}</p>
                </div>
                <div className="min-w-[180px] flex-1">
                  <p className="font-semibold text-heading">{r.party_name}</p>
                  <p className="text-sm text-heading/60">{formatNumber(r.quantity)} {r.product_unit} {r.product_name}</p>
                </div>
                {r.status === 'pending' && (
                  <span className={`pill ${enough ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : avail.length ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-outstanding/10 text-outstanding'}`}>
                    {enough ? 'In stock' : avail.length ? 'Partial stock' : 'No stock'}
                  </span>
                )}
                <span className={`pill ${REQUEST_STATUS_STYLE[r.status]}`}><span className="pill-dot" />{REQUEST_STATUS_LABEL[r.status]}{r.status === 'proceeded' && r.dispatch_id ? ` — ${r.dispatch_number}` : ''}</span>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-heading/40">
              <PackageSearch className="h-8 w-8" />
              <p>No order requests found</p>
            </div>
          )}
        </div>
        </div>
      )}

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Order Request">
        {selected && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-heading">{selected.party_name}</h3>
              <p className="text-sm text-heading/60">{selected.party_phone || 'No phone on file'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs uppercase text-heading/40">Date</p><p className="font-medium text-heading">{formatDate(selected.date)}</p></div>
              <div><p className="text-xs uppercase text-heading/40">Product</p><p className="font-medium text-heading">{formatNumber(selected.quantity)} {selected.product_unit} {selected.product_name}</p></div>
              <div><p className="text-xs uppercase text-heading/40">Rate</p><p className="font-medium text-heading">{selected.rate ? formatINR(selected.rate) : 'Not set'}</p></div>
              <div><p className="text-xs uppercase text-heading/40">Payment</p><p className="font-medium capitalize text-heading">{selected.payment_type}{selected.credit_days ? ` — ${selected.credit_days}d` : ''}</p></div>
              <div><p className="text-xs uppercase text-heading/40">Expected delivery</p><p className="font-medium text-heading">{selected.expected_delivery_date ? formatDate(selected.expected_delivery_date) : '—'}</p></div>
              <div><p className="text-xs uppercase text-heading/40">Requested by</p><p className="font-medium text-heading">{selected.requested_by_name || '—'}</p></div>
              {selected.destination_address && <div className="col-span-2"><p className="text-xs uppercase text-heading/40">Customer Location</p><p className="font-medium text-heading">{selected.destination_address}</p></div>}
              {selected.remarks && <div className="col-span-2"><p className="text-xs uppercase text-heading/40">Remarks</p><p className="font-medium text-heading">{selected.remarks}</p></div>}
            </div>

            {(() => {
              const avail = availabilityFor(selected.product_id);
              const inStock = avail.length ? Number(avail[0].quantity) : 0;
              const enough = inStock >= Number(selected.quantity);
              return (
                <div className={`rounded-lg border p-3 ${enough ? 'border-emerald-300 bg-emerald-500/10 dark:border-emerald-700' : avail.length ? 'border-amber-300 bg-amber-500/10 dark:border-amber-700' : 'border-red-300 bg-red-500/10 dark:border-red-800'}`}>
                  <p className="mb-1.5 text-sm font-medium">
                    {enough ? 'In stock — ready to review & punch' : avail.length ? 'Only partial stock available' : 'Not in stock anywhere right now'}
                  </p>
                  {avail.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {avail.map((r: any) => <span key={r.location_id} className="pill bg-card text-heading/70">{r.location_name}: {formatNumber(r.quantity)} {r.unit}</span>)}
                    </div>
                  )}
                </div>
              );
            })()}

            <span className={`pill ${REQUEST_STATUS_STYLE[selected.status]}`}><span className="pill-dot" />{REQUEST_STATUS_LABEL[selected.status]}{selected.status === 'proceeded' && selected.dispatch_id ? ` — ${selected.dispatch_number}` : ''}</span>

            {selected.status === 'pending' && (
              <div className="flex gap-3">
                {canRemove && (
                  <button className="btn-secondary flex-1 justify-center !border-red-300 !text-red-600 dark:!text-red-400" onClick={() => discard(selected.id)}>
                    <Trash2 className="h-4 w-4" /> Discard
                  </button>
                )}
                <button className="btn-primary flex-1 justify-center" onClick={() => proceedToSale(selected)}>
                  Proceed to Sale →
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
