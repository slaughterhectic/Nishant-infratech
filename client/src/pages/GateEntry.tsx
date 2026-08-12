import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PackageOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore, useAuthStore } from '../lib/store';
import { formatNumber } from '../lib/format';
import { VehicleSelect } from '../components/VehicleSelect';
import { DriverSelect } from '../components/DriverSelect';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

// Deliberately minimal — the client's team explained gate/godown staff aren't
// comfortable with software, so this screen is just cards + a short form.
// OTP generation and confirmation live on their own dedicated page (/otp).
export default function GateEntry() {
  const navigate = useNavigate();
  const location = useLocation();
  const addToast = useToastStore((s) => s.addToast);
  const linkedLocationId = useAuthStore((s) => s.user?.linked_location_id);
  const canSeeOtp = useAuthStore((s) => s.user?.role === 'owner' || s.user?.role === 'godown_manager');
  const [allPunched, setAllPunched] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [fulfillTarget, setFulfillTarget] = useState<any | null>(null);
  const [fulfillForm, setFulfillForm] = useState({ source_location_id: '', vehicle_id: '', driver_id: '', driver_mobile: '' });
  const [saving, setSaving] = useState(false);
  const [stockRows, setStockRows] = useState<any[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setAllPunched(await api.dispatches.list({ status: 'punched' })); }
    catch (e: any) { if (!silent) addToast(e.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [addToast]);

  const loadMeta = useCallback(async () => {
    try {
      const [v, dr, l, st] = await Promise.all([api.vehicles.list(), api.drivers.list(), api.locations.list(), api.stock.list()]);
      setVehicles(v);
      setDrivers(dr);
      setLocations(l);
      setStockRows(st);
    } catch { /* ignore */ }
  }, []);

  // Only show locations that actually have this order's product in stock —
  // no picking a godown with nothing to load.
  const locationsWithStock = fulfillTarget
    ? locations
        .map((l) => ({ ...l, qty: stockRows.find((r) => r.location_id === l.id && r.product_id === fulfillTarget.product_id)?.quantity || 0 }))
        .filter((l) => l.qty > 0)
    : [];

  // Gatekeeper/godown_manager accounts tied to one godown only see that
  // godown's punched dispatches — everyone else (owner/accountant/unlinked) sees all.
  const punched = useMemo(() => {
    if (!linkedLocationId) return allPunched;
    return allPunched.filter((d) => Number(d.source_location_id) === linkedLocationId);
  }, [allPunched, linkedLocationId]);
  const linkedLocationName = linkedLocationId
    ? locations.find((l) => l.id === linkedLocationId)?.name
    : undefined;

  useEffect(() => { load(); loadMeta(); }, [load, loadMeta]);
  useAutoRefresh(() => load(true), 6000); // gate/godown staff need near-live visibility on new punches

  const openFulfill = (d: any) => {
    setFulfillTarget(d);
    setFulfillForm({ source_location_id: String(d.source_location_id || ''), vehicle_id: '', driver_id: '', driver_mobile: '' });
  };

  // Deep-linked from Sales & Dispatch's "Gate Entry" button on a specific
  // dispatch row — jump straight to its Load & Dispatch action instead of
  // making the user find it again in the list below.
  const openedDispatchIdRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const wantedId = (location.state as any)?.openDispatchId;
    if (!wantedId || openedDispatchIdRef.current === wantedId) return;
    const match = punched.find((d) => d.id === wantedId);
    if (match) {
      openedDispatchIdRef.current = wantedId;
      openFulfill(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, punched]);

  const submitFulfill = async () => {
    if (!fulfillTarget || !fulfillForm.source_location_id) return addToast('Select a location', 'error');
    setSaving(true);
    try {
      const driver = drivers.find((x) => String(x.id) === fulfillForm.driver_id);
      const row = await api.dispatches.fulfill(fulfillTarget.id, {
        ...fulfillForm,
        driver_mobile: fulfillForm.driver_mobile || driver?.phone || undefined,
      });
      setFulfillTarget(null);
      // otp_code is stripped server-side for anyone but owner/godown_manager —
      // OTP is exclusive to them, so don't reference it here, and don't send
      // a gatekeeper to /otp, which would just bounce them straight back.
      if (canSeeOtp) {
        const vehicle = vehicles.find((v) => String(v.id) === fulfillForm.vehicle_id);
        navigate('/otp', {
          state: {
            justGenerated: {
              dispatch_number: `DSP-${1000 + row.id}`,
              otp_code: row.otp_code,
              whatsapp_sent: row.whatsapp_sent,
              sms_sent: row.sms_sent,
              party_name: fulfillTarget.party_name,
              party_phone: fulfillTarget.party_phone,
              quantity: fulfillTarget.quantity,
              product_unit: fulfillTarget.product_unit,
              product_name: fulfillTarget.product_name,
              vehicle_number: vehicle?.vehicle_number,
            },
          },
        });
      } else {
        addToast('Loaded! OTP sent to customer.', 'success');
      }
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <p className="text-heading/50">Loading…</p>;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-heading">Gate Entry</h1>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-heading">New Orders ({punched.length})</h2>
        {linkedLocationName && (
          <p className="mb-3 text-sm text-heading/50">Showing orders for {linkedLocationName} only</p>
        )}
        <div className="space-y-3">
          {punched.map((d) => (
            <button
              key={d.id}
              onClick={() => openFulfill(d)}
              className="w-full rounded-xl border border-card-border bg-card p-4 text-left shadow-sm transition-transform active:scale-[0.98]"
            >
              <p className="text-lg font-bold text-heading">{formatNumber(d.quantity)} {d.product_unit} {d.product_name}</p>
              <p className="text-heading/60">{d.party_name || 'Stock transfer'}</p>
              <p className="mt-2 text-sm font-medium text-brand-600">Tap to load &amp; dispatch →</p>
            </button>
          ))}
          {punched.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-card-border px-6 py-10 text-heading/40">
              <PackageOpen className="h-8 w-8" />
              <p className="font-medium">{linkedLocationName ? `No new orders for ${linkedLocationName}` : 'No new orders'}</p>
              {linkedLocationName && <p className="text-sm">Orders punched from other godowns won't appear here.</p>}
            </div>
          )}
        </div>
      </section>

      {fulfillTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-card p-5 sm:rounded-2xl">
            <h3 className="mb-4 text-xl font-bold text-heading">Load &amp; Dispatch</h3>
            <p className="mb-4 text-lg text-heading">{formatNumber(fulfillTarget.quantity)} {fulfillTarget.product_unit} {fulfillTarget.product_name}</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-base font-medium text-heading/70">Loading from</label>
                <select className="input-field !py-3 !text-base" value={fulfillForm.source_location_id} onChange={(e) => setFulfillForm({ ...fulfillForm, source_location_id: e.target.value })}>
                  <option value="">Select…</option>
                  {locationsWithStock.map((l) => <option key={l.id} value={l.id}>{l.name} — {formatNumber(l.qty)} {fulfillTarget.product_unit} left</option>)}
                </select>
                {locationsWithStock.length === 0 && (
                  <p className="mt-1 text-sm text-outstanding">No location has this product in stock right now</p>
                )}
              </div>
              <VehicleSelect
                label="Vehicle"
                value={fulfillForm.vehicle_id ? Number(fulfillForm.vehicle_id) : undefined}
                onChange={(vehicle_id) => setFulfillForm({ ...fulfillForm, vehicle_id: String(vehicle_id) })}
              />
              <DriverSelect
                label="Driver"
                value={fulfillForm.driver_id ? Number(fulfillForm.driver_id) : undefined}
                onChange={(driver_id) => setFulfillForm({ ...fulfillForm, driver_id: String(driver_id) })}
              />
              <div className="flex gap-3">
                <button className="btn-secondary flex-1 justify-center !py-3 !text-base" onClick={() => setFulfillTarget(null)}>Cancel</button>
                <button className="btn-primary flex-1 justify-center !py-3 !text-base" onClick={submitFulfill} disabled={saving}>
                  {saving ? 'Saving…' : 'Confirm Load-out'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
