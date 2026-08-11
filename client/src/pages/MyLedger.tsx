import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ArrowLeft, Download, FileText, IndianRupee, Package, Plus, Trash2, Truck, Wallet2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore, useToastStore } from '../lib/store';
import { formatDate, formatDateInput, formatINR, formatNumber } from '../lib/format';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { downloadLedgerPdf, formatMoneyPdf } from '../lib/pdfLedger';

interface ExpenseRow { description: string; amount: string }
interface UnloadingRow { location_name: string; quantity: string; dispatch_id?: string; product_id?: number }

const emptyTrip = { date: formatDateInput(), vehicle_id: '', advance_amount: '', remarks: '' };

const DELIVERY_STATUS_STYLE: Record<string, string> = {
  punched: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  dispatched: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function MyLedger() {
  const addToast = useToastStore((s) => s.addToast);
  const user = useAuthStore((s) => s.user);
  // Owner/accountant reach this page as /vehicle-ledger/:driverId to view any
  // one driver's personal ledger — same page, just pointed at someone else's
  // data instead of "self" (no /driver/my-deliveries self-scoping applies).
  const { driverId } = useParams();
  const isOwnerView = !!driverId;
  const [driverName, setDriverName] = useState('');
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [trips, setTrips] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [trip, setTrip] = useState(emptyTrip);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([{ description: '', amount: '' }]);
  const [unloadingPoints, setUnloadingPoints] = useState<UnloadingRow[]>([{ location_name: '', quantity: '' }]);
  const [unloadingCustom, setUnloadingCustom] = useState<boolean[]>([false]);

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceNote, setAdvanceNote] = useState('');
  const [requestingAdvance, setRequestingAdvance] = useState(false);

  const [otpDrafts, setOtpDrafts] = useState<Record<number, string>>({});
  const [submittingOtpId, setSubmittingOtpId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t] = isOwnerView
        ? await Promise.all([api.dispatches.list({ driver_id: driverId! }), api.vehicleTrips.list({ driver_id: driverId! })])
        : await Promise.all([api.driver.myDeliveries(), api.vehicleTrips.list()]);
      setDeliveries(d);
      setTrips(t);
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast, isOwnerView, driverId]);

  const loadMeta = useCallback(async () => {
    try {
      const [v, drivers] = await Promise.all([api.vehicles.list(), api.drivers.list()]);
      setVehicles(v);
      if (isOwnerView) setDriverName(drivers.find((d: any) => String(d.id) === driverId)?.name || 'Driver');
    } catch (e: any) { addToast(e.message, 'error'); }
  }, [addToast, isOwnerView, driverId]);

  useEffect(() => { load(); loadMeta(); }, [load, loadMeta]);

  const today = formatDateInput();
  const todayTrips = deliveries.filter((d) => d.date === today).length;
  const pendingOtp = deliveries.filter((d) => d.status === 'dispatched').length;
  const completedToday = deliveries.filter((d) => d.status === 'delivered' && d.date === today).length;

  const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const remaining = (Number(trip.advance_amount) || 0) - totalExpense;

  const updateExpense = (i: number, field: keyof ExpenseRow, value: string) => {
    setExpenses((prev) => prev.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  };
  const updateUnloading = (i: number, field: keyof UnloadingRow, value: string) => {
    setUnloadingPoints((prev) => prev.map((row, j) => (j === i ? { ...row, [field]: value } : row)));
  };

  // The deliveries actually assigned to this driver (or, in owner view,
  // whichever driver's deliveries are loaded) — product & quantity are
  // already known from the dispatch itself, so "Unloading Details" picks
  // from this list instead of asking for them to be typed in again. Only
  // 'dispatched' (loaded, on the truck, awaiting delivery confirmation) makes
  // sense here — 'punched' hasn't left yet and 'delivered' has already been
  // unloaded, so both would just be stale clutter (and, over time, look like
  // duplicates of the same handful of repeat customers).
  const dispatchOptions = deliveries.filter((d) => d.status === 'dispatched').map((d) => ({
    id: String(d.id),
    label: `${d.dispatch_number} — ${d.party_name || d.destination_location_name || 'Stock transfer'} — ${formatNumber(d.quantity)} ${d.unit} ${d.product_name}`,
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
    setOpen(true);
  };

  const save = async () => {
    if (!trip.vehicle_id) return addToast('Vehicle is required', 'error');
    setSaving(true);
    try {
      // Trip-level product/quantity are derived from what's actually being
      // unloaded, not asked for separately — it's the same material already
      // pinned to each dispatch picked above.
      const derivedProductId = unloadingPoints.find((u) => u.product_id)?.product_id;
      const derivedQuantity = unloadingPoints.reduce((s, u) => s + (Number(u.quantity) || 0), 0);
      await api.vehicleTrips.create({
        ...trip,
        driver_id: isOwnerView ? Number(driverId) : undefined,
        product_id: derivedProductId || undefined,
        quantity: derivedQuantity || undefined,
        expenses: expenses.map((e) => ({ description: e.description, amount: Number(e.amount) || 0 })),
        unloading_points: unloadingPoints.map((u) => ({ location_name: u.location_name, quantity: Number(u.quantity) || 0 })),
      });
      addToast(isOwnerView ? 'Trip saved' : 'Trip saved to your ledger');
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

  const subjectName = (isOwnerView ? driverName : user?.display_name) || 'Driver';
  const fileBase = `${subjectName.replace(/[^a-z0-9]+/gi, '-')}-trip-ledger-${today}`;

  const totalAdvance = trips.reduce((s, t) => s + Number(t.advance_amount || 0), 0);
  const totalExpenseAll = trips.reduce((s, t) => s + Number(t.total_expense || 0), 0);
  const totalRemaining = totalAdvance - totalExpenseAll;

  const downloadLedger = () => {
    const rows = trips.map((t) => ({
      Date: formatDate(t.date), Vehicle: t.vehicle_number, Product: t.product_name || '', Quantity: t.quantity || '',
      'Advance (₹)': t.advance_amount, 'Expense (₹)': t.total_expense, 'Remaining (₹)': Number(t.advance_amount) - Number(t.total_expense),
      Remarks: t.remarks || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
  };

  const exportPdf = () => {
    downloadLedgerPdf({
      documentTitle: 'Driver Trip & Expense Ledger',
      subjectName,
      metaLines: [`${trips.length} trip${trips.length === 1 ? '' : 's'}`],
      summary: [
        { label: 'Total Advance', value: formatMoneyPdf(totalAdvance) },
        { label: 'Total Expense', value: formatMoneyPdf(totalExpenseAll), tone: 'red' },
        { label: 'Net Remaining', value: formatMoneyPdf(totalRemaining), tone: totalRemaining < 0 ? 'red' : 'green' },
      ],
      columns: ['Date', 'Vehicle', 'Product', 'Qty', 'Advance', 'Expense', 'Remaining', 'Remarks'],
      rows: trips.map((t) => {
        const rem = Number(t.advance_amount) - Number(t.total_expense);
        return [
          formatDate(t.date), t.vehicle_number, t.product_name || '—', t.quantity ? formatNumber(t.quantity) : '—',
          formatMoneyPdf(t.advance_amount), formatMoneyPdf(t.total_expense), formatMoneyPdf(rem), t.remarks || '—',
        ];
      }),
      footRow: ['', '', '', 'Total', formatMoneyPdf(totalAdvance), formatMoneyPdf(totalExpenseAll), formatMoneyPdf(totalRemaining), ''],
      numericColumnIndexes: [3, 4, 5, 6],
      filename: `${fileBase}.pdf`,
    });
  };

  const requestAdvance = async () => {
    if (!advanceAmount || Number(advanceAmount) <= 0) return addToast('Enter a valid amount', 'error');
    setRequestingAdvance(true);
    try {
      await api.driver.requestAdvance(Number(advanceAmount), advanceNote || undefined);
      addToast('Advance request sent to the owner');
      setAdvanceOpen(false);
      setAdvanceAmount('');
      setAdvanceNote('');
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setRequestingAdvance(false); }
  };

  const submitOtp = async (d: any) => {
    const val = (otpDrafts[d.id] ?? '').trim();
    if (!val) return addToast('Enter the OTP the customer gave you', 'error');
    setSubmittingOtpId(d.id);
    try {
      await api.driver.submitOtp(d.id, val);
      addToast('Sent to the owner for confirmation');
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSubmittingOtpId(null); }
  };

  if (loading) return <Skeleton.Card />;

  return (
    <div className="space-y-8">
      <div>
        {isOwnerView && (
          <Link to="/vehicle-ledger" className="mb-2 flex items-center gap-1 text-sm text-heading/60 hover:text-heading">
            <ArrowLeft className="h-4 w-4" /> Back to Vehicle Ledger
          </Link>
        )}
        <h1 className="text-2xl font-bold text-heading">
          {isOwnerView ? `${driverName}'s Ledger` : `${greeting()}, ${user?.display_name?.split(' ')[0]}`}
        </h1>
        <p className="text-sm text-heading/50">{formatDate(new Date().toISOString())}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="stat-figure text-2xl">{todayTrips}</p>
          <p className="text-xs text-heading/50">Today's Trips</p>
        </div>
        <div className="card text-center">
          <p className="stat-figure text-2xl text-blue-600">{pendingOtp}</p>
          <p className="text-xs text-heading/50">Pending OTP</p>
        </div>
        <div className="card text-center">
          <p className="stat-figure text-2xl text-profit">{completedToday}</p>
          <p className="text-xs text-heading/50">Completed Today</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={openNew}><Plus className="h-4 w-4" /> Add Trip Entry</button>
        <button className="btn-secondary" onClick={downloadLedger}><Download className="h-4 w-4" /> Excel</button>
        <button className="btn-secondary !border-brand-400 !text-brand-600 dark:!text-brand-400" onClick={exportPdf}><FileText className="h-4 w-4" /> Print / Export PDF</button>
        {!isOwnerView && (
          <button className="btn-secondary !border-amber-400 !text-amber-700 dark:!text-amber-400" onClick={() => setAdvanceOpen(true)}>
            <IndianRupee className="h-4 w-4" /> Request Advance
          </button>
        )}
      </div>

      {deliveries.length > 0 && (
        <section>
          <h2 className="section-label mb-3">{isOwnerView ? 'Deliveries' : 'My Deliveries'}</h2>
          <div className="divide-y divide-card-border overflow-hidden rounded-xl border border-card-border bg-card">
            {deliveries.slice(0, 8).map((d) => (
              <div key={d.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-heading/40">{d.dispatch_number}</span>
                  <span className="flex-1 font-medium text-heading">{d.party_name || d.destination_location_name || 'Stock transfer'}</span>
                  <span className="text-heading/60">{formatNumber(d.quantity)} {d.unit} {d.product_name}</span>
                  <span className={`pill ${DELIVERY_STATUS_STYLE[d.status]}`}><span className="pill-dot" />{d.status}</span>
                </div>
                {!isOwnerView && d.status === 'dispatched' && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-surface/60 p-2 pl-3">
                    <p className="flex-1 text-xs font-medium text-heading/50">
                      {d.driver_submitted_otp
                        ? <span className="text-amber-600 dark:text-amber-400">Submitted "{d.driver_submitted_otp}" — waiting for owner to confirm</span>
                        : 'Customer gave you a code? Enter it here.'}
                    </p>
                    <input
                      className="input-field w-24 !py-1.5 text-center tracking-widest"
                      placeholder="OTP"
                      maxLength={6}
                      value={otpDrafts[d.id] ?? ''}
                      onChange={(e) => setOtpDrafts((prev) => ({ ...prev, [d.id]: e.target.value.replace(/\D/g, '') }))}
                    />
                    <button className="btn-primary !py-1.5 text-xs" onClick={() => submitOtp(d)} disabled={submittingOtpId === d.id}>
                      {submittingOtpId === d.id ? 'Sending…' : d.driver_submitted_otp ? 'Resubmit' : 'Submit'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-label mb-3">{isOwnerView ? 'Trip & Expense Ledger' : 'My Trip & Expense Ledger'}</h2>
        <div className="overflow-hidden rounded-xl border border-card-border bg-card">
          <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="table-clean w-full text-sm">
            <thead className="sticky top-0 z-10 backdrop-blur"><tr><th>Trip</th><th className="!text-right">Advance</th><th className="!text-right">Expense</th><th className="!text-right">Remaining</th><th></th></tr></thead>
            <tbody className="divide-y divide-card-border">
              {trips.map((r) => {
                const rem = Number(r.advance_amount) - Number(r.total_expense);
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600"><Truck className="h-4 w-4" /></span>
                        <div>
                          <p className="font-semibold text-heading">{r.vehicle_number}</p>
                          <p className="text-xs text-heading/40">{formatDate(r.date)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{formatINR(r.advance_amount)}</td>
                    <td className="text-right tabular-nums">{formatINR(r.total_expense)}</td>
                    <td className={`text-right font-semibold tabular-nums ${rem < 0 ? 'text-outstanding' : 'text-profit'}`}>{formatINR(rem)}</td>
                    <td className="text-right"><button onClick={() => remove(r.id)} className="text-heading/30 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
              {trips.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-heading/40">No trips logged yet</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add Trip Entry" size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Date</label>
              <input type="date" className="input-field" value={trip.date} onChange={(e) => setTrip({ ...trip, date: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-heading/70">Vehicle</label>
              <select className="input-field" value={trip.vehicle_id} onChange={(e) => setTrip({ ...trip, vehicle_id: e.target.value })}>
                <option value="">Select…</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.vehicle_number}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-heading/70">Advance Amount (₹)</label>
              <input type="number" className="input-field" value={trip.advance_amount} onChange={(e) => setTrip({ ...trip, advance_amount: e.target.value })} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-heading/40">Product &amp; quantity are picked up automatically from the deliveries you select below.</p>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-heading">Expenses</h4>
            <div className="space-y-2">
              {expenses.map((row, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-card-border bg-surface/50 p-2 pl-3">
                  <input className="input-field flex-1 !border-0 !bg-transparent !shadow-none !ring-0" placeholder="Description (e.g. Diesel)" value={row.description} onChange={(e) => updateExpense(i, 'description', e.target.value)} />
                  <input type="number" className="input-field w-28 !border-0 !bg-transparent !shadow-none !ring-0 text-right" placeholder="Amount" value={row.amount} onChange={(e) => updateExpense(i, 'amount', e.target.value)} />
                  <button className="shrink-0 rounded-md p-1 text-heading/30 hover:bg-red-500/10 hover:text-red-600" onClick={() => setExpenses((prev) => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
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
            <h4 className="mb-2 text-sm font-semibold text-heading">Unloading Details</h4>
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
                  <button className="shrink-0 rounded-md p-1 text-heading/30 hover:bg-red-500/10 hover:text-red-600" onClick={() => removeUnloadingRow(i)}><X className="h-4 w-4" /></button>
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

      <Modal isOpen={advanceOpen} onClose={() => setAdvanceOpen(false)} title="Request Advance">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <Package className="h-4 w-4 shrink-0" /> This sends a notification straight to the owner.
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Amount (₹)</label>
            <input type="number" className="input-field" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-heading/70">Note (optional)</label>
            <input className="input-field" value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} placeholder="e.g. for diesel on next trip" />
          </div>
          <button className="btn-primary w-full justify-center" onClick={requestAdvance} disabled={requestingAdvance}>
            {requestingAdvance ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
