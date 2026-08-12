import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, XCircle, PackageSearch, Layers, LogIn } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore, useAuthStore } from '../lib/store';
import { formatDate, formatDateInput, formatINR, formatNumber } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { PartySelect } from '../components/PartySelect';

const STATUS_STYLE: Record<string, string> = {
  punched: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  dispatched: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABEL: Record<string, string> = {
  punched: 'Order Punched',
  dispatched: 'Pending OTP',
  delivered: 'Delivered & Confirmed',
  cancelled: 'Cancelled',
};

const emptyForm = {
  date: formatDateInput(),
  kind: 'sale',
  party_id: '',
  product_id: '',
  quantity: '',
  rate: '',
  source_location_id: '',
  destination_type: 'customer_site',
  destination_location_id: '',
  destination_address: '',
  payment_type: 'cash',
  credit_days: '',
  expected_delivery_date: '',
  remarks: '',
  source_purchase_id: '',
};

export default function SalesDispatch() {
  const addToast = useToastStore((s) => s.addToast);
  const canRemove = useAuthStore((s) => s.user?.role !== 'gatekeeper');
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const [punchOpen, setPunchOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [stockRows, setStockRows] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<number | null>(null);

  // Arriving from Orders' "Proceed to Sale" — pre-fill the full Punch form
  // with what was requested and open it straight away, but still require the
  // reviewer to actually hit Punch here; nothing was created on the Orders
  // page itself.
  useEffect(() => {
    const prefill = (location.state as any)?.prefillOrder;
    if (!prefill) return;
    const { requestId, ...fields } = prefill;
    setForm((f) => ({ ...f, ...fields, kind: 'sale' }));
    setPendingRequestId(requestId ?? null);
    setPunchOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.dispatches.list(statusFilter ? { status: statusFilter } : undefined)); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast, statusFilter]);

  const loadMeta = useCallback(async () => {
    try {
      const [p, pr, l, st] = await Promise.all([api.parties.list(), api.products.list(), api.locations.list(), api.stock.list()]);
      setParties(p.filter((x: any) => x.type !== 'supplier'));
      setProducts(pr);
      setLocations(l);
      setStockRows(st);
    } catch (e: any) { addToast(e.message, 'error'); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  // Only offer products we actually have stock of — filtered further to the
  // chosen source location once one's picked. "Let godown decide" shows
  // anything in stock anywhere.
  const stockFor = useCallback((productId: number) => stockRows
    .filter((r) => r.product_id === productId && (!form.source_location_id || String(r.location_id) === form.source_location_id))
    .reduce((s, r) => s + Number(r.quantity), 0), [stockRows, form.source_location_id]);
  const productsInStock = products.filter((p) => stockFor(p.id) > 0);

  // Purchase-lot rate picker: the same product can land at different rates
  // from different suppliers/rail-rack over time (see server/routes/purchases.ts
  // GET /lots) — mirrors cementbook's landed-rate lot picker on SaleForm.
  useEffect(() => {
    if (form.kind !== 'sale' || !form.product_id || !form.source_location_id) { setLots([]); return; }
    setLoadingLots(true);
    api.purchases.lots(Number(form.product_id), Number(form.source_location_id))
      .then(setLots)
      .catch(() => setLots([]))
      .finally(() => setLoadingLots(false));
  }, [form.kind, form.product_id, form.source_location_id]);

  const pickLot = (lot: any) => {
    setForm((f) => ({ ...f, rate: String(lot.purchase_rate), source_purchase_id: String(lot.id) }));
  };

  const punch = async () => {
    if (!form.source_location_id || !form.product_id || !form.quantity || !form.destination_type) {
      return addToast('Source location, product, quantity and destination are required', 'error');
    }
    if ((form.destination_type === 'own_godown' || form.destination_type === 'rented_godown') && !form.destination_location_id) {
      return addToast('Select a destination location', 'error');
    }
    if (form.kind === 'sale' && (!form.party_id || !form.rate)) {
      return addToast('Party and rate are required for a sale', 'error');
    }
    const available = stockFor(Number(form.product_id));
    if (Number(form.quantity) > available) {
      return addToast(`Only ${formatNumber(available)} available at this location — reduce the quantity or pick a different location`, 'error');
    }
    setSaving(true);
    try {
      const dispatch = await api.dispatches.punch({
        ...form,
        party_id: form.party_id || undefined,
        source_location_id: form.source_location_id || undefined,
        destination_location_id: form.destination_location_id || undefined,
        credit_days: form.credit_days || undefined,
        expected_delivery_date: form.expected_delivery_date || undefined,
        source_purchase_id: form.source_purchase_id || undefined,
      });
      if (pendingRequestId != null) {
        try { await api.orderRequests.proceed(pendingRequestId, dispatch.id); }
        catch { /* dispatch is already punched; a stale/already-settled request link isn't worth blocking on */ }
        setPendingRequestId(null);
      }
      addToast('Order punched — godown has been notified');
      setPunchOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const cancel = async (id: number) => {
    if (!confirm('Cancel this dispatch?')) return;
    try { await api.dispatches.cancel(id); addToast('Cancelled'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Sales &amp; Dispatch</h1>
          <p className="text-sm text-heading/50">Stock transfers, custom lots &amp; rates, non-standard orders — everyday customer orders go through Orders</p>
        </div>
        <button className="btn-primary" onClick={() => setPunchOpen(true)}><Plus className="h-4 w-4" /> Custom Punch</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {['', 'punched', 'dispatched', 'delivered', 'cancelled'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === s ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' : 'border border-card-border bg-card text-heading/60 hover:bg-surface'
            }`}
          >
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>

      {loading ? <Skeleton.Table columns={6} /> : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
        <div className="divide-y divide-card-border overflow-auto" style={{ maxHeight: '65vh' }}>
          {rows.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-brand-500/[0.03]">
              <div className="min-w-[140px]">
                <p className="font-mono text-xs text-heading/40">{d.dispatch_number}</p>
                <p className="text-xs text-heading/40">{formatDate(d.date)}</p>
              </div>
              <div className="min-w-[180px] flex-1">
                <p className="font-semibold text-heading">{d.party_name || d.destination_address || 'Stock transfer'}</p>
                <p className="text-sm text-heading/60">
                  {formatNumber(d.quantity)} {d.product_unit} {d.product_name}
                  {d.total_amount > 0 && ` · ${formatINR(d.total_amount)}`}
                </p>
              </div>
              <div className="min-w-[120px] text-sm text-heading/60">{d.vehicle_number || '—'}</div>
              <span className={`pill ${STATUS_STYLE[d.status]}`}><span className="pill-dot" />{STATUS_LABEL[d.status]}</span>
              <div className="flex items-center gap-3">
                {d.status === 'punched' && (
                  <button
                    className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                    onClick={() => navigate('/gate', { state: { openDispatchId: d.id } })}
                  >
                    <LogIn className="h-3.5 w-3.5" /> Gate Entry
                  </button>
                )}
                {canRemove && (d.status === 'punched' || d.status === 'dispatched') && (
                  <button className="text-heading/30 transition-colors hover:text-red-600" onClick={() => cancel(d.id)} title="Cancel">
                    <XCircle className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-heading/40">
              <PackageSearch className="h-8 w-8" />
              <p>No dispatches found</p>
            </div>
          )}
        </div>
        </div>
      )}

      <Modal isOpen={punchOpen} onClose={() => { setPunchOpen(false); setPendingRequestId(null); }} title="Custom Punch" size="lg">
        <div className="space-y-3">
          {pendingRequestId != null && (
            <div className="rounded-lg border border-brand-300/50 bg-brand-500/[0.06] px-3 py-2 text-sm text-heading/70 dark:border-brand-500/30">
              Pre-filled from an order request — review the details below, then Punch to confirm.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Date</label>
              <input type="date" className="input-field" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Kind</label>
              <select
                className="input-field"
                value={form.kind}
                onChange={(e) => {
                  const kind = e.target.value;
                  // A sale always goes to a customer; a stock transfer always
                  // goes to one of our own locations — the two destination
                  // sets are mutually exclusive, so switch kind resets it.
                  setForm({ ...form, kind, destination_type: kind === 'stock_transfer' ? 'own_godown' : 'customer_site', destination_location_id: '', destination_address: '', party_id: kind === 'stock_transfer' ? '' : form.party_id });
                }}
              >
                <option value="sale">Sale (to customer)</option>
                <option value="stock_transfer">Stock transfer (between locations)</option>
              </select>
            </div>
          </div>

          {form.kind === 'sale' && (
            <PartySelect
              label="Party"
              required
              partyType="customer"
              value={form.party_id ? Number(form.party_id) : undefined}
              onChange={(party_id) => setForm({ ...form, party_id: String(party_id) })}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Source location<span className="text-outstanding"> *</span></label>
              <select
                className="input-field"
                value={form.source_location_id}
                onChange={(e) => setForm({ ...form, source_location_id: e.target.value, source_purchase_id: '' })}
              >
                <option value="">Select…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">
                Product<span className="text-outstanding"> *</span> {form.source_location_id ? '' : '(in stock anywhere)'}
              </label>
              <select
                className="input-field"
                value={form.product_id}
                onChange={(e) => setForm({ ...form, product_id: e.target.value, source_purchase_id: '' })}
              >
                <option value="">Select…</option>
                {productsInStock.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {formatNumber(stockFor(p.id))} {p.unit} available</option>
                ))}
              </select>
              {productsInStock.length === 0 && (
                <p className="mt-1 text-xs text-outstanding">No purchased stock {form.source_location_id ? 'at this location' : 'anywhere'} yet</p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Quantity</label>
            <input type="number" className="input-field" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>

          {form.kind === 'sale' && form.product_id && form.source_location_id && (
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-heading/70">
                <Layers className="h-3.5 w-3.5" /> Purchase lot / rate
              </label>
              {loadingLots ? (
                <p className="text-xs text-heading/40">Loading available lots…</p>
              ) : lots.length > 0 ? (
                <div className="space-y-1.5">
                  {lots.map((lot) => (
                    <button
                      key={lot.id}
                      type="button"
                      onClick={() => pickLot(lot)}
                      className={`flex w-full items-center justify-between rounded-lg border p-2.5 text-left text-sm transition-colors ${
                        String(form.source_purchase_id) === String(lot.id) ? 'border-brand-400 bg-brand-500/[0.06]' : 'border-card-border hover:bg-surface'
                      }`}
                    >
                      <span className="text-heading/70">
                        {formatDate(lot.date)} · {lot.supplier_name || lot.source.replace('_', ' ')}
                      </span>
                      <span className="font-semibold text-heading">{formatINR(lot.purchase_rate)}</span>
                      <span className="text-xs text-heading/40">{formatNumber(lot.available)} left</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-heading/40">No purchase lots found here — enter the rate manually.</p>
              )}
            </div>
          )}

          {form.kind === 'sale' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-heading/70">Rate</label>
                <input type="number" className="input-field" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value, source_purchase_id: '' })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-heading/70">Payment</label>
                <select className="input-field" value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })}>
                  <option value="cash">Cash</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Destination<span className="text-outstanding"> *</span></label>
            <select className="input-field" value={form.destination_type} onChange={(e) => setForm({ ...form, destination_type: e.target.value })}>
              {form.kind === 'sale' ? (
                <>
                  <option value="customer_site">Customer site</option>
                  <option value="self_pickup">Self pickup</option>
                </>
              ) : (
                <>
                  <option value="own_godown">Own godown</option>
                  <option value="rented_godown">Rented godown</option>
                </>
              )}
            </select>
          </div>

          {(form.destination_type === 'own_godown' || form.destination_type === 'rented_godown') ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Destination location<span className="text-outstanding"> *</span></label>
              <select className="input-field" value={form.destination_location_id} onChange={(e) => setForm({ ...form, destination_location_id: e.target.value })}>
                <option value="">Select…</option>
                {locations
                  .filter((l) => Number(l.is_active) !== 0 && l.type === form.destination_type && String(l.id) !== form.source_location_id)
                  .map((l) => <option key={l.id} value={l.id}>{l.name}{l.type === 'rented_godown' && l.rented_category ? ` (Cat ${l.rented_category})` : ''}</option>)}
              </select>
              {form.destination_type === 'rented_godown' && locations.filter((l) => l.type === 'rented_godown').length === 0 && (
                <p className="mt-1 text-sm text-outstanding">No rented godown set up yet — add one in Masters → Locations.</p>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Destination address</label>
              <input className="input-field" value={form.destination_address} onChange={(e) => setForm({ ...form, destination_address: e.target.value })} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {form.payment_type === 'credit' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-heading/70">Credit days</label>
                <input type="number" className="input-field" value={form.credit_days} onChange={(e) => setForm({ ...form, credit_days: e.target.value })} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Expected delivery</label>
              <input type="date" className="input-field" value={form.expected_delivery_date} onChange={(e) => setForm({ ...form, expected_delivery_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Remarks</label>
            <input className="input-field" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>

          <button className="btn-primary w-full justify-center" onClick={punch} disabled={saving}>
            {saving ? 'Punching…' : 'Punch'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
