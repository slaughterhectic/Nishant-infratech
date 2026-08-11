import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, CheckCircle2, KeyRound, MessageCircle, Smartphone, Truck, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatNumber, formatRelativeTime } from '../lib/format';
import { waLink, dispatchOtpMessage } from '../lib/whatsapp';
import { Skeleton } from '../components/ui/Skeleton';

export default function OtpConfirmations() {
  const location = useLocation();
  const addToast = useToastStore((s) => s.addToast);
  const [pending, setPending] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [otpValue, setOtpValue] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [justGenerated, setJustGenerated] = useState<any | null>((location.state as any)?.justGenerated || null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dispatched, delivered] = await Promise.all([
        api.dispatches.list({ status: 'dispatched' }),
        api.dispatches.list({ status: 'delivered' }),
      ]);
      setPending(dispatched);
      setRecent(delivered.slice(0, 8));
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const openVerify = (id: number) => {
    setActiveId(id);
    setOtpValue('');
  };

  const verify = async () => {
    if (activeId == null || !otpValue.trim()) return;
    setVerifying(true);
    try {
      await api.dispatches.verifyOtp(activeId, otpValue.trim());
      addToast('Delivery confirmed');
      setActiveId(null);
      setOtpValue('');
      setJustGenerated(null);
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setVerifying(false); }
  };

  const quickConfirm = async (d: any) => {
    setBusyId(d.id);
    try {
      await api.dispatches.verifyOtp(d.id, d.driver_submitted_otp);
      addToast('Delivery confirmed');
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const discardDriverEntry = async (id: number) => {
    setBusyId(id);
    try {
      await api.dispatches.discardDriverOtp(id);
      addToast('Discarded — driver can re-enter the OTP');
      load();
    } catch (e: any) { addToast(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-heading">OTP Confirmations</h1>
        <p className="text-sm text-heading/50">Every dispatch is locked behind an OTP the customer or driver reads back to confirm delivery</p>
      </div>

      {justGenerated && (
        <div className="fade-in rounded-2xl border border-brand-300/50 bg-brand-500/[0.06] p-6 text-center dark:border-brand-500/30">
          <p className="section-label mb-1">{justGenerated.dispatch_number} loaded &amp; on its way</p>
          <p className="mb-3 text-sm text-heading/60">Share this OTP with the customer/driver — they'll read it back once material is received</p>
          <p className="text-5xl font-black tracking-[0.25em] text-brand-600">{justGenerated.otp_code}</p>
          {justGenerated.whatsapp_sent && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600">
              <MessageCircle className="h-4 w-4" /> Sent automatically via WhatsApp
            </p>
          )}
          {!justGenerated.whatsapp_sent && justGenerated.sms_sent && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600">
              <Smartphone className="h-4 w-4" /> Sent automatically via SMS
            </p>
          )}
          {!justGenerated.whatsapp_sent && !justGenerated.sms_sent && (
            <p className="mt-3 text-sm font-medium text-amber-600 dark:text-amber-400">
              Not sent automatically — read it out or tap below to share on WhatsApp
            </p>
          )}
          <div className="mt-4 flex justify-center gap-3">
            {!justGenerated.whatsapp_sent && !justGenerated.sms_sent && waLink(justGenerated.party_phone, dispatchOtpMessage({
              dispatchNumber: justGenerated.dispatch_number, partyName: justGenerated.party_name,
              quantity: justGenerated.quantity, unit: justGenerated.product_unit, productName: justGenerated.product_name,
              vehicleNumber: justGenerated.vehicle_number, otpCode: justGenerated.otp_code,
            })) && (
              <a
                className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !shadow-emerald-600/30"
                href={waLink(justGenerated.party_phone, dispatchOtpMessage({
                  dispatchNumber: justGenerated.dispatch_number, partyName: justGenerated.party_name,
                  quantity: justGenerated.quantity, unit: justGenerated.product_unit, productName: justGenerated.product_name,
                  vehicleNumber: justGenerated.vehicle_number, otpCode: justGenerated.otp_code,
                }))!}
                target="_blank" rel="noreferrer"
              >
                <MessageCircle className="h-4 w-4" /> Send via WhatsApp
              </a>
            )}
            <button className="btn-secondary" onClick={() => setJustGenerated(null)}>Got it</button>
          </div>
        </div>
      )}

      <section>
        <h2 className="section-label mb-3">Awaiting confirmation ({pending.length})</h2>
        {loading ? <Skeleton.Table columns={4} /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((d) => (
              <div key={d.id} className="card fade-in space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-xs text-heading/40">{d.dispatch_number}</p>
                    <p className="font-semibold text-heading">{d.party_name || 'Stock transfer'}</p>
                  </div>
                  <span className="pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    <span className="pill-dot" /> Pending OTP
                  </span>
                </div>
                <p className="text-sm text-heading/60">{formatNumber(d.quantity)} {d.product_unit} {d.product_name}</p>
                <div className="flex items-center gap-1.5 text-sm text-heading/50">
                  <Truck className="h-3.5 w-3.5" /> {d.vehicle_number || '—'}
                </div>

                {d.driver_submitted_otp && (() => {
                  const matches = String(d.driver_submitted_otp) === String(d.otp_code);
                  return (
                    <div className={`rounded-lg border p-3 ${matches ? 'border-emerald-300 bg-emerald-500/10 dark:border-emerald-700' : 'border-red-300 bg-red-500/10 dark:border-red-800'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-heading/50">Driver entered {d.driver_submitted_at ? `· ${formatRelativeTime(d.driver_submitted_at)}` : ''}</p>
                          <p className="text-xl font-bold tracking-[0.2em] text-heading">{d.driver_submitted_otp}</p>
                        </div>
                        <span className={`pill shrink-0 ${matches ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                          {matches ? <><Check className="h-3.5 w-3.5" /> Matches</> : <><X className="h-3.5 w-3.5" /> No match</>}
                        </span>
                      </div>
                      <div className="mt-2.5">
                        {matches ? (
                          <button className="btn-primary w-full justify-center !py-1.5 text-sm" onClick={() => quickConfirm(d)} disabled={busyId === d.id}>
                            <Check className="h-3.5 w-3.5" /> {busyId === d.id ? 'Confirming…' : 'Confirm Delivery'}
                          </button>
                        ) : (
                          <button className="btn-secondary w-full justify-center !border-red-300 !py-1.5 text-sm !text-red-600 dark:!text-red-400" onClick={() => discardDriverEntry(d.id)} disabled={busyId === d.id}>
                            <X className="h-3.5 w-3.5" /> {busyId === d.id ? 'Discarding…' : 'Discard & let driver retry'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  {waLink(d.party_phone, dispatchOtpMessage({
                    dispatchNumber: d.dispatch_number, partyName: d.party_name, quantity: d.quantity,
                    unit: d.product_unit, productName: d.product_name, vehicleNumber: d.vehicle_number, otpCode: d.otp_code,
                  })) && (
                    <a
                      className="btn-secondary !px-3"
                      href={waLink(d.party_phone, dispatchOtpMessage({
                        dispatchNumber: d.dispatch_number, partyName: d.party_name, quantity: d.quantity,
                        unit: d.product_unit, productName: d.product_name, vehicleNumber: d.vehicle_number, otpCode: d.otp_code,
                      }))!}
                      target="_blank" rel="noreferrer" title="Send OTP via WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4 text-emerald-600" />
                    </a>
                  )}
                  <button className={`${d.driver_submitted_otp ? 'btn-secondary' : 'btn-primary'} flex-1 justify-center`} onClick={() => openVerify(d.id)}>
                    <KeyRound className="h-4 w-4" /> {d.driver_submitted_otp ? 'Enter OTP manually' : 'Enter OTP'}
                  </button>
                </div>
              </div>
            ))}
            {pending.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-heading/40">Nothing waiting on an OTP right now</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="section-label mb-3">Recently confirmed</h2>
        <div className="divide-y divide-card-border overflow-hidden rounded-xl border border-card-border bg-card">
          {recent.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-profit" />
              <span className="font-mono text-xs text-heading/40">{d.dispatch_number}</span>
              <span className="flex-1 font-medium text-heading">{d.party_name || 'Stock transfer'}</span>
              <span className="text-heading/50">{formatNumber(d.quantity)} {d.product_unit} {d.product_name}</span>
              <span className="text-xs text-heading/40">{d.otp_verified_at ? formatRelativeTime(d.otp_verified_at) : ''}</span>
            </div>
          ))}
          {recent.length === 0 && <p className="px-4 py-8 text-center text-sm text-heading/40">No confirmed deliveries yet</p>}
        </div>
      </section>

      {activeId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl">
            <KeyRound className="mx-auto mb-3 h-8 w-8 text-brand-500" />
            <p className="mb-4 text-heading">Enter the OTP given by the customer/driver</p>
            <input
              className="input-field mb-4 text-center text-3xl tracking-[0.4em] !py-3"
              maxLength={6}
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <div className="flex gap-3">
              <button className="btn-secondary flex-1 justify-center" onClick={() => setActiveId(null)}>Cancel</button>
              <button className="btn-primary flex-1 justify-center" onClick={verify} disabled={verifying}>
                {verifying ? 'Verifying…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
