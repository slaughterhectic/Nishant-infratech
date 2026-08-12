import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notebook, Plus, Trash2, Truck, Wallet2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatDateInput, formatINR, formatNumber } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { VehicleSelect } from '../components/VehicleSelect';
import { DriverSelect } from '../components/DriverSelect';

interface ExpenseRow { description: string; amount: string }
interface UnloadingRow { location_name: string; quantity: string; dispatch_id?: string; product_id?: number }

const emptyTrip = {
  date: formatDateInput(),
  vehicle_id: '',
  driver_id: '',
  advance_amount: '',
  remarks: '',
};

function SectionHeading({ n, label }: { n: number; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{n}</span>
      <h4 className="text-sm font-semibold text-heading">{label}</h4>
    </div>
  );
}

export default function VehicleLedger() {
  const addToast = useToastStore((s) => s.addToast);
  const [rows, setRows] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [trip, setTrip] = useState(emptyTrip);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([{ description: '', amount: '' }]);
  const [unloadingPoints, setUnloadingPoints] = useState<UnloadingRow[]>([{ location_name: '', quantity: '' }]);
  const [unloadingCustom, setUnloadingCustom] = useState<boolean[]>([false]);
  const [driverDeliveries, setDriverDeliveries] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await api.vehicleTrips.list()); }
    catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  const loadMeta = useCallback(async () => {
    try {
      const d = await api.drivers.list();
      setDrivers(d);
    } catch (e: any) { addToast(e.message, 'error'); }
  }, [addToast]);

  useEffect(() => { load(); loadMeta(); }, [load, loadMeta]);

  // Whichever driver is picked for this trip, pull their currently in-transit
  // deliveries so "Unloading Details" (and the goods it implies) comes from
  // real dispatch data instead of being typed in freehand.
  useEffect(() => {
    if (!trip.driver_id) { setDriverDeliveries([]); return; }
    api.dispatches.list({ driver_id: trip.driver_id, status: 'dispatched' })
      .then(setDriverDeliveries)
      .catch(() => setDriverDeliveries([]));
  }, [trip.driver_id]);

  const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remaining = (Number(trip.advance_amount) || 0) - totalExpense;

  const updateExpense = (i: number, field: keyof ExpenseRow, value: string) => {
    setExpenses((prev) => prev.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  };
  const updateUnloading = (i: number, field: keyof UnloadingRow, value: string) => {
    setUnloadingPoints((prev) => prev.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  };

  const dispatchOptions = driverDeliveries.map((d) => ({
    id: String(d.id),
    label: `${d.dispatch_number} — ${d.party_name || d.destination_location_name || 'Stock transfer'} — ${formatNumber(d.quantity)} ${d.product_unit} ${d.product_name}`,
    location_name: d.party_name || d.destination_location_name || d.destination_address || d.dispatch_number,
    quantity: d.quantity,
    product_id: d.product_id,
  }));

  const pickDispatch = (i: number, dispatchId: string) => {
    if (dispatchId === '__other__') {
      setUnloadingCustom((prev) => prev.map((c, j) => (j === i ? true : c)));
      setUnloadingPoints((prev) => prev.map((row, j) => (j === i ? { location_name: '', quantity: row.quantity } : row)));
      return;
    }
    const match = dispatchOptions.find((o) => o.id === dispatchId);
    setUnloadingCustom((prev) => prev.map((c, j) => (j === i ? false : c)));
    setUnloadingPoints((prev) => prev.map((row, j) => (j === i
      ? { dispatch_id: dispatchId, location_name: match?.location_name || '', quantity: match ? String(match.quantity) : row.quantity, product_id: match?.product_id }
      : row)));
  };

  const addUnloadingRow = () => {
    setUnloadingPoints((prev) => [...prev, { location_name: '', quantity: '' }]);
    setUnloadingCustom((prev) => [...prev, false]);
  };
  const removeUnloadingRow = (i: number) => {
    setUnloadingPoints((prev) => prev.filter((_, j) => j !== i));
    setUnloadingCustom((prev) => prev.filter((_, j) => j !== i));
  };

  const openNew = () => {
    setTrip(emptyTrip);
    setExpenses([{ description: '', amount: '' }]);
    setUnloadingPoints([{ location_name: '', quantity: '' }]);
    setUnloadingCustom([false]);
    setDriverDeliveries([]);
    setOpen(true);
  };

  const save = async () => {
    if (!trip.vehicle_id) return addToast('Vehicle is required', 'error');
    setSaving(true);
    try {
      const derivedProductId = unloadingPoints.find((u) => u.product_id)?.product_id;
      const derivedQuantity = unloadingPoints.reduce((s, u) => s + (Number(u.quantity) || 0), 0);
      await api.vehicleTrips.create({
        ...trip,
        driver_id: trip.driver_id || undefined,
        product_id: derivedProductId || undefined,
        quantity: derivedQuantity || undefined,
        expenses: expenses.map((e) => ({ description: e.description, amount: Number(e.amount) || 0 })),
        unloading_points: unloadingPoints.map((u) => ({ location_name: u.location_name, quantity: Number(u.quantity) || 0 })),
      });
      addToast('Trip saved');
      setOpen(false);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this trip?')) return;
    try { await api.vehicleTrips.delete(id); addToast('Deleted'); load(); }
    catch (e: any) { addToast(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Vehicle Trip &amp; Expense Ledger</h1>
          <p className="text-sm text-heading/50">Digitized version of the driver's daily form</p>
        </div>
        <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> Add Trip</button>
      </div>

      {drivers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="section-label">Driver ledgers:</span>
          {drivers.map((d) => (
            <Link
              key={d.id}
              to={`/vehicle-ledger/${d.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-heading/70 transition-colors hover:border-brand-300 hover:text-brand-600"
            >
              <Notebook className="h-3.5 w-3.5" /> {d.name}
            </Link>
          ))}
        </div>
      )}

      {loading ? <Skeleton.Table columns={6} /> : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="table-clean w-full text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur"><tr>
              <th>Trip</th><th>Driver</th><th className="!text-right">Advance</th><th className="!text-right">Expense</th><th className="!text-right">Remaining</th><th></th>
            </tr></thead>
            <tbody className="divide-y divide-card-border">
              {rows.map((r) => {
                const rem = Number(r.advance_amount) - Number(r.total_expense);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                          <Truck className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-semibold text-heading">{r.vehicle_number}</p>
                          <p className="text-xs text-heading/40">{formatDate(r.date)}{r.product_name ? ` · ${formatNumber(r.quantity)} ${r.unit} ${r.product_name}` : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-heading/70">
                      {r.driver_id ? <Link to={`/vehicle-ledger/${r.driver_id}`} className="hover:text-brand-600 hover:underline">{r.driver_name}</Link> : '—'}
                    </td>
                    <td className="text-right tabular-nums">{formatINR(r.advance_amount)}</td>
                    <td className="text-right tabular-nums">{formatINR(r.total_expense)}</td>
                    <td className={`text-right font-semibold tabular-nums ${rem < 0 ? 'text-outstanding' : 'text-profit'}`}>{formatINR(rem)}</td>
                    <td className="text-right">
                      <button onClick={() => remove(r.id)} className="text-heading/30 transition-colors hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-heading/40">No trips recorded yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Vehicle Trip & Expense" size="xl">
        <div className="space-y-6">
          <div>
            <SectionHeading n={1} label="Trip Details" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-heading/70">Date</label>
                <input type="date" className="input-field" value={trip.date} onChange={(e) => setTrip({ ...trip, date: e.target.value })} />
              </div>
              <DriverSelect
                label="Driver"
                value={trip.driver_id ? Number(trip.driver_id) : undefined}
                onChange={(driver_id) => setTrip({ ...trip, driver_id: String(driver_id) })}
              />
              <VehicleSelect
                label="Vehicle"
                required
                value={trip.vehicle_id ? Number(trip.vehicle_id) : undefined}
                onChange={(vehicle_id) => setTrip({ ...trip, vehicle_id: String(vehicle_id) })}
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-heading/70">Advance Amount (₹)</label>
                <input type="number" className="input-field" value={trip.advance_amount} onChange={(e) => setTrip({ ...trip, advance_amount: e.target.value })} />
              </div>
            </div>
          </div>

          <div>
            <SectionHeading n={2} label="Expense Details" />
            <div className="space-y-2">
              {expenses.map((row, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-card-border bg-surface/50 p-2 pl-3">
                  <input className="input-field flex-1 !border-0 !bg-transparent !shadow-none !ring-0" placeholder="Description (e.g. Diesel)" value={row.description} onChange={(e) => updateExpense(i, 'description', e.target.value)} />
                  <input type="number" className="input-field w-28 !border-0 !bg-transparent !shadow-none !ring-0 text-right" placeholder="Amount" value={row.amount} onChange={(e) => updateExpense(i, 'amount', e.target.value)} />
                  <button className="shrink-0 rounded-md p-1 text-heading/30 transition-colors hover:bg-red-500/10 hover:text-red-600" onClick={() => setExpenses((prev) => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button className="btn-secondary !py-1.5 text-xs" onClick={() => setExpenses((prev) => [...prev, { description: '', amount: '' }])}>
                <Plus className="h-3.5 w-3.5" /> Add expense row
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-gradient-to-r from-brand-500/10 to-transparent px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-heading/70"><Wallet2 className="h-4 w-4" /> Total Expense</span>
              <span className="font-bold tabular-nums text-heading">{formatINR(totalExpense)}</span>
              <span className="text-sm text-heading/70">Remaining</span>
              <span className={`font-bold tabular-nums ${remaining < 0 ? 'text-outstanding' : 'text-profit'}`}>{formatINR(remaining)}</span>
            </div>
          </div>

          <div>
            <SectionHeading n={3} label="Unloading Details" />
            {!trip.driver_id && (
              <p className="mb-2 text-xs text-heading/40">Select a driver above to pick from their in-transit deliveries.</p>
            )}
            <div className="space-y-2">
              {unloadingPoints.map((row, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-card-border bg-surface/50 p-2 pl-3">
                  {unloadingCustom[i] ? (
                    <input
                      className="input-field flex-1 !border-0 !bg-transparent !shadow-none !ring-0"
                      placeholder="Type location / party"
                      value={row.location_name}
                      onChange={(e) => updateUnloading(i, 'location_name', e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <select
                      className="input-field flex-1 !border-0 !bg-transparent !shadow-none !ring-0"
                      value={row.dispatch_id ?? ''}
                      onChange={(e) => pickDispatch(i, e.target.value)}
                    >
                      <option value="">Select delivery…</option>
                      {dispatchOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      <option value="__other__">Other (type manually)</option>
                    </select>
                  )}
                  <input
                    type="number"
                    className="input-field w-28 !border-0 !bg-transparent !shadow-none !ring-0 text-right"
                    placeholder="Quantity"
                    value={row.quantity}
                    onChange={(e) => updateUnloading(i, 'quantity', e.target.value)}
                  />
                  <button className="shrink-0 rounded-md p-1 text-heading/30 transition-colors hover:bg-red-500/10 hover:text-red-600" onClick={() => removeUnloadingRow(i)}><X className="h-4 w-4" /></button>
                </div>
              ))}
              <button className="btn-secondary !py-1.5 text-xs" onClick={addUnloadingRow}>
                <Plus className="h-3.5 w-3.5" /> Add unloading point
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Remarks</label>
            <input className="input-field" value={trip.remarks} onChange={(e) => setTrip({ ...trip, remarks: e.target.value })} />
          </div>

          <button className="btn-primary w-full justify-center" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Trip'}</button>
        </div>
      </Modal>
    </div>
  );
}
