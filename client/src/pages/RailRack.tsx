import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, Train, Truck, Warehouse, ArrowRightLeft, Repeat, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatDateInput, formatNumber } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';

const OUTCOME_META: Record<string, { label: string; hint: string; icon: typeof Truck; className: string; dot: string; ring: string }> = {
  direct_wagon: { label: 'Direct from wagon', hint: 'Sold straight off the wagon', icon: Truck, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', dot: 'bg-blue-500', ring: 'border-blue-400 bg-blue-500/[0.06]' },
  platform_dump: { label: 'Platform dump', hint: 'Held on the rack platform', icon: Warehouse, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', dot: 'bg-amber-500', ring: 'border-amber-400 bg-amber-500/[0.06]' },
  godown_transfer: { label: 'Godown transfer', hint: 'Shifted to godown stock', icon: ArrowRightLeft, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500', ring: 'border-emerald-400 bg-emerald-500/[0.06]' },
  exchange: { label: 'Exchange', hint: 'Loaded onto outgoing vehicle', icon: Repeat, className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', dot: 'bg-purple-500', ring: 'border-purple-400 bg-purple-500/[0.06]' },
};

const emptyWagon = { wagon_number: '', product_id: '', quantity: '', rate: '', location_id: '', arrival_date: formatDateInput(), remarks: '' };
const emptyAllocations = { direct_wagon: { quantity: '', party_id: '' }, platform_dump: { quantity: '' }, godown_transfer: { quantity: '', destination_location_id: '' }, exchange: { quantity: '', party_id: '' } };

export default function RailRack() {
  const addToast = useToastStore((s) => s.addToast);
  const [wagons, setWagons] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [wagon, setWagon] = useState(emptyWagon);
  const [alloc, setAlloc] = useState<any>(emptyAllocations);

  const load = useCallback(async () => {
    setLoading(true);
    try { setWagons(await api.railRack.listWagons()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  const loadMeta = useCallback(async () => {
    try {
      const [p, l, parties_] = await Promise.all([api.products.list(), api.locations.list(), api.parties.list()]);
      setProducts(p);
      setLocations(l);
      setParties(parties_.filter((x: any) => x.type !== 'supplier'));
      const rail = l.find((x: any) => x.type === 'rail_platform');
      if (rail) setWagon((w) => ({ ...w, location_id: String(rail.id) }));
    } catch (e: any) { addToast(e.message, 'error'); }
  }, [addToast]);

  useEffect(() => { load(); loadMeta(); }, [load, loadMeta]);

  const totalQty = Number(wagon.quantity) || 0;
  const allocatedQty = Object.values(alloc).reduce((s: number, a: any) => s + (Number(a.quantity) || 0), 0);
  const remainingQty = totalQty - allocatedQty;

  // One click drops whatever's left unallocated straight into that row —
  // no need to do the subtraction by hand.
  const fillRest = (key: keyof typeof emptyAllocations) => {
    const current = Number(alloc[key].quantity) || 0;
    setAlloc({ ...alloc, [key]: { ...alloc[key], quantity: String(current + remainingQty) } });
  };

  const openNew = () => {
    setWagon((w) => ({ ...emptyWagon, location_id: w.location_id }));
    setAlloc(emptyAllocations);
    setOpen(true);
  };

  const save = async () => {
    if (!wagon.wagon_number.trim() || !wagon.product_id || !totalQty || !wagon.location_id) {
      return addToast('Wagon number, product, quantity and location are required', 'error');
    }
    if (allocatedQty > totalQty) return addToast('Allocated quantity exceeds wagon total', 'error');
    setSaving(true);
    try {
      const allocations = [
        { outcome: 'direct_wagon', quantity: Number(alloc.direct_wagon.quantity) || 0, party_id: alloc.direct_wagon.party_id || undefined },
        { outcome: 'platform_dump', quantity: Number(alloc.platform_dump.quantity) || 0 },
        { outcome: 'godown_transfer', quantity: Number(alloc.godown_transfer.quantity) || 0, destination_location_id: alloc.godown_transfer.destination_location_id || undefined },
        { outcome: 'exchange', quantity: Number(alloc.exchange.quantity) || 0, party_id: alloc.exchange.party_id || undefined },
      ].filter((a) => a.quantity > 0);
      await api.railRack.createWagon({ ...wagon, allocations });
      addToast('Wagon entry saved — allocations queued for gate/godown');
      setOpen(false);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Rail Rack Management</h1>
          <p className="text-sm text-heading/50">Allocate each wagon's quantity across how it left the rack</p>
        </div>
        <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> New Wagon Entry</button>
      </div>

      {loading ? <Skeleton.Table columns={4} /> : (
        <div className="space-y-4">
          {wagons.map((w) => (
            <div key={w.id} className="card">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600"><Train className="h-5 w-5" /></span>
                  <div>
                    <p className="font-semibold text-heading">Wagon {w.wagon_number}</p>
                    <p className="text-xs text-heading/40">{formatDate(w.arrival_date)} · {w.location_name}</p>
                  </div>
                </div>
                <p className="text-right">
                  <span className="text-lg font-bold tabular-nums text-heading">{formatNumber(w.quantity)}</span>
                  <span className="ml-1 text-sm text-heading/50">{w.unit} {w.product_name}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {w.allocations.map((a: any) => {
                  const meta = OUTCOME_META[a.outcome];
                  const Icon = meta.icon;
                  return (
                    <span key={a.id} className={`pill ${meta.className}`}>
                      <Icon className="h-3 w-3" />
                      {meta.label}: {formatNumber(a.quantity)}
                      {a.party_name ? ` → ${a.party_name}` : ''}
                      {a.destination_location_name ? ` → ${a.destination_location_name}` : ''}
                      {a.dispatch_status ? ` (${a.dispatch_status})` : ''}
                    </span>
                  );
                })}
                {w.allocations.length === 0 && <span className="text-xs text-heading/40">No allocation recorded</span>}
              </div>
            </div>
          ))}
          {wagons.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-card-border py-14 text-heading/40">
              <Train className="h-8 w-8" />
              <p>No wagon entries yet</p>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Rail Rack — Wagon Entry" size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Wagon number</label>
              <input className="input-field" value={wagon.wagon_number} onChange={(e) => setWagon({ ...wagon, wagon_number: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Item</label>
              <select className="input-field" value={wagon.product_id} onChange={(e) => setWagon({ ...wagon, product_id: e.target.value })}>
                <option value="">Select…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Total quantity received</label>
              <input type="number" className="input-field" value={wagon.quantity} onChange={(e) => setWagon({ ...wagon, quantity: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Rate</label>
              <input type="number" className="input-field" value={wagon.rate} onChange={(e) => setWagon({ ...wagon, rate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Arrival date</label>
              <input type="date" className="input-field" value={wagon.arrival_date} onChange={(e) => setWagon({ ...wagon, arrival_date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Rack / Platform location</label>
              <select className="input-field" value={wagon.location_id} onChange={(e) => setWagon({ ...wagon, location_id: e.target.value })}>
                <option value="">Select…</option>
                {locations.filter((l) => l.type === 'rail_platform' && Number(l.is_active) !== 0).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {locations.filter((l) => l.type === 'rail_platform' && Number(l.is_active) !== 0).length === 0 && (
                <p className="mt-1 text-sm text-outstanding">No rail platform set up yet — add one in Masters → Locations.</p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-heading">
                Allocate outcomes {totalQty > 0 && <span className="font-normal text-heading/40">of {formatNumber(totalQty)}</span>}
              </h4>
              <span className={`pill transition-colors duration-200 ${
                remainingQty < 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                : remainingQty === 0 && totalQty > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-card-border/60 text-heading/60'
              }`}>
                {remainingQty === 0 && totalQty > 0 ? <CheckCircle2 className="h-3 w-3" /> : <span className="pill-dot" />}
                {remainingQty < 0 ? `Over by ${formatNumber(-remainingQty)}` : remainingQty === 0 && totalQty > 0 ? 'Fully allocated' : `${formatNumber(remainingQty)} unallocated`}
              </span>
            </div>
            {totalQty > 0 && (
              <div className="mb-1 flex h-2.5 overflow-hidden rounded-full bg-card-border">
                {(['direct_wagon', 'platform_dump', 'godown_transfer', 'exchange'] as const).map((k) => {
                  const pct = Math.max(0, (Number(alloc[k].quantity) || 0) / totalQty * 100);
                  return pct > 0 ? <div key={k} className={`${OUTCOME_META[k].dot} transition-all duration-300 ease-out`} style={{ width: `${pct}%` }} /> : null;
                })}
              </div>
            )}
            {totalQty > 0 && (
              <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1">
                {(['direct_wagon', 'platform_dump', 'godown_transfer', 'exchange'] as const).map((k) => {
                  const qty = Number(alloc[k].quantity) || 0;
                  if (qty <= 0) return null;
                  return (
                    <span key={k} className="flex items-center gap-1 text-[11px] text-heading/50">
                      <span className={`h-1.5 w-1.5 rounded-full ${OUTCOME_META[k].dot}`} />
                      {OUTCOME_META[k].label} {Math.round((qty / totalQty) * 100)}%
                    </span>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <div className={`grid grid-cols-[1fr,auto,auto,auto] items-center gap-2 rounded-lg border p-2.5 transition-colors duration-200 ${Number(alloc.direct_wagon.quantity) > 0 ? OUTCOME_META.direct_wagon.ring : 'border-card-border bg-surface/50'}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-heading"><Truck className="h-4 w-4 text-blue-600" /> Direct from wagon</div>
                <select className="input-field w-40" value={alloc.direct_wagon.party_id} onChange={(e) => setAlloc({ ...alloc, direct_wagon: { ...alloc.direct_wagon, party_id: e.target.value } })}>
                  <option value="">Party…</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" className="input-field w-24 text-right tabular-nums" placeholder="Qty" value={alloc.direct_wagon.quantity} onChange={(e) => setAlloc({ ...alloc, direct_wagon: { ...alloc.direct_wagon, quantity: e.target.value } })} />
                <button type="button" title="Fill remaining" disabled={remainingQty <= 0} onClick={() => fillRest('direct_wagon')} className="rounded-md p-1.5 text-heading/30 transition-colors hover:bg-brand-500/10 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-20"><Zap className="h-4 w-4" /></button>
              </div>
              <div className={`grid grid-cols-[1fr,auto,auto] items-center gap-2 rounded-lg border p-2.5 transition-colors duration-200 ${Number(alloc.platform_dump.quantity) > 0 ? OUTCOME_META.platform_dump.ring : 'border-card-border bg-surface/50'}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-heading"><Warehouse className="h-4 w-4 text-amber-600" /> Platform dump</div>
                <input type="number" className="input-field w-24 text-right tabular-nums" placeholder="Qty" value={alloc.platform_dump.quantity} onChange={(e) => setAlloc({ ...alloc, platform_dump: { quantity: e.target.value } })} />
                <button type="button" title="Fill remaining" disabled={remainingQty <= 0} onClick={() => fillRest('platform_dump')} className="rounded-md p-1.5 text-heading/30 transition-colors hover:bg-brand-500/10 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-20"><Zap className="h-4 w-4" /></button>
              </div>
              <div className={`grid grid-cols-[1fr,auto,auto,auto] items-center gap-2 rounded-lg border p-2.5 transition-colors duration-200 ${Number(alloc.godown_transfer.quantity) > 0 ? OUTCOME_META.godown_transfer.ring : 'border-card-border bg-surface/50'}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-heading"><ArrowRightLeft className="h-4 w-4 text-emerald-600" /> Godown transfer</div>
                <select className="input-field w-40" value={alloc.godown_transfer.destination_location_id} onChange={(e) => setAlloc({ ...alloc, godown_transfer: { ...alloc.godown_transfer, destination_location_id: e.target.value } })}>
                  <option value="">Godown…</option>
                  {locations.filter((l) => Number(l.is_active) !== 0 && (l.type === 'own_godown' || l.type === 'rented_godown')).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input type="number" className="input-field w-24 text-right tabular-nums" placeholder="Qty" value={alloc.godown_transfer.quantity} onChange={(e) => setAlloc({ ...alloc, godown_transfer: { ...alloc.godown_transfer, quantity: e.target.value } })} />
                <button type="button" title="Fill remaining" disabled={remainingQty <= 0} onClick={() => fillRest('godown_transfer')} className="rounded-md p-1.5 text-heading/30 transition-colors hover:bg-brand-500/10 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-20"><Zap className="h-4 w-4" /></button>
              </div>
              <div className={`grid grid-cols-[1fr,auto,auto,auto] items-center gap-2 rounded-lg border p-2.5 transition-colors duration-200 ${Number(alloc.exchange.quantity) > 0 ? OUTCOME_META.exchange.ring : 'border-card-border bg-surface/50'}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-heading"><Repeat className="h-4 w-4 text-purple-600" /> Exchange</div>
                <select className="input-field w-40" value={alloc.exchange.party_id} onChange={(e) => setAlloc({ ...alloc, exchange: { ...alloc.exchange, party_id: e.target.value } })}>
                  <option value="">Party…</option>
                  {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input type="number" className="input-field w-24 text-right tabular-nums" placeholder="Qty" value={alloc.exchange.quantity} onChange={(e) => setAlloc({ ...alloc, exchange: { ...alloc.exchange, quantity: e.target.value } })} />
                <button type="button" title="Fill remaining" disabled={remainingQty <= 0} onClick={() => fillRest('exchange')} className="rounded-md p-1.5 text-heading/30 transition-colors hover:bg-brand-500/10 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-20"><Zap className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Remarks</label>
            <input className="input-field" value={wagon.remarks} onChange={(e) => setWagon({ ...wagon, remarks: e.target.value })} />
          </div>

          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Wagon Entry'}</button>
        </div>
      </Modal>
    </div>
  );
}
