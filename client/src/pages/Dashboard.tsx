import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  CheckCircle2, IndianRupee, KeyRound, PackagePlus, ShoppingCart, TrendingUp, Warehouse, Wallet2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatINR, formatNumber, formatRelativeTime } from '../lib/format';
import { KPICard } from '../components/ui/KPICard';
import { Skeleton } from '../components/ui/Skeleton';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const PIE_COLORS = ['#F5691F', '#1E6FC0', '#2D7A1F', '#B8620A', '#8A3010', '#6B270F'];

const EVENT_META: Record<string, { label: string; icon: typeof PackagePlus; className: string }> = {
  order_punched: { label: 'Order punched', icon: PackagePlus, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  dispatch_created: { label: 'Dispatch created', icon: PackagePlus, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  otp_generated: { label: 'OTP generated', icon: KeyRound, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  otp_verified: { label: 'OTP verified', icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  payment_received: { label: 'Payment received', icon: Wallet2, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

const LOCATION_TYPE_LABEL: Record<string, string> = { own_godown: 'Own', rented_godown: 'Rented', rail_platform: 'Rail' };

export default function Dashboard() {
  const addToast = useToastStore((s) => s.addToast);
  const [stats, setStats] = useState<any | null>(null);
  const [charts, setCharts] = useState<any | null>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, c, sum, act] = await Promise.all([
        api.dashboard.stats(), api.dashboard.charts(), api.stock.summary(), api.notifications.list(10),
      ]);
      setStats(s);
      setCharts(c);
      setSummary(sum);
      setActivity(act);
    } catch (e: any) { if (!silent) addToast(e.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true), 10000);

  if (loading || !stats || !charts) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Dashboard</h1>
        <p className="text-sm text-heading/50">Overview across all locations — {formatDate(new Date().toISOString())}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Today's Sales" value={formatINR(stats.todaySales)} subtitle={`${stats.todayDispatchCount} dispatches today`} icon={TrendingUp} color="sale" />
        <KPICard title="Today's Collection" value={formatINR(stats.todayCollection)} subtitle="Received today" icon={IndianRupee} color="profit" />
        <KPICard title="Pending OTP" value={String(stats.pendingOtpCount)} subtitle={`${stats.punchedOrderCount} new orders awaiting load-out`} icon={KeyRound} color="purchase" />
        <KPICard title="Outstanding" value={formatINR(stats.outstandingReceivable)} subtitle="Receivable from customers" icon={ShoppingCart} color="outstanding" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-brand-500" />
            <h3 className="font-semibold text-heading">Godown stock by location</h3>
          </div>
          <div className="space-y-4">
            {summary.map((l) => {
              const total = summary.reduce((s, x) => s + Number(x.cement_bags) + Number(x.sariya_tons), 0) || 1;
              const share = ((Number(l.cement_bags) + Number(l.sariya_tons)) / total) * 100;
              return (
                <div key={l.location_id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-heading">
                      {l.location_name}
                      <span className="pill bg-card-border/60 px-2 py-0.5 text-[10px] text-heading/50">{LOCATION_TYPE_LABEL[l.location_type]}</span>
                    </span>
                    <span className="tabular-nums text-heading/50">{formatNumber(l.cement_bags)} bags · {formatNumber(l.sariya_tons)} ton</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-card-border">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500" style={{ width: `${Math.max(share, 2)}%` }} />
                  </div>
                </div>
              );
            })}
            {summary.length === 0 && <p className="text-sm text-heading/40">No stock yet</p>}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-2 font-semibold text-heading">Top products (this month)</h3>
          {charts.topProducts.length === 0 ? (
            <p className="text-sm text-heading/40">No dispatches yet this month</p>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={charts.topProducts} dataKey="quantity" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                    {charts.topProducts.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, _n: string, e: any) => [`${formatNumber(v)} ${e.payload.unit}`, e.payload.name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 font-semibold text-heading">Top outstanding dealers</h3>
          <div className="space-y-1">
            {charts.topOutstanding.map((p: any) => (
              <Link key={p.id} to={`/customers/${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-outstanding/10 text-xs font-bold text-outstanding">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 text-heading">{p.name}</span>
                <span className="font-semibold tabular-nums text-outstanding">{formatINR(p.outstanding)}</span>
              </Link>
            ))}
            {charts.topOutstanding.length === 0 && <p className="text-sm text-heading/40">Nothing outstanding</p>}
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3 font-semibold text-heading">Recent activity</h3>
          <div className="space-y-3">
            {activity.map((a: any) => {
              const meta = EVENT_META[a.event_type] ?? { label: a.event_type, icon: PackagePlus, className: 'bg-gray-100 text-gray-600' };
              const Icon = meta.icon;
              return (
                <div key={a.id} className="flex gap-3 text-sm">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.className}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-heading">{meta.label}</span>
                      <span className="shrink-0 text-xs text-heading/40">{formatRelativeTime(a.created_at)}</span>
                    </div>
                    <p className="truncate text-heading/60">{a.message}</p>
                  </div>
                </div>
              );
            })}
            {activity.length === 0 && <p className="text-sm text-heading/40">No activity yet</p>}
          </div>
        </div>
      </div>

      {charts.pendingOtpDispatches.length > 0 && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-heading">Pending OTP confirmations</h3>
            <Link to="/otp" className="text-xs font-semibold text-brand-600 hover:underline">View all →</Link>
          </div>
          <div className="divide-y divide-card-border">
            {charts.pendingOtpDispatches.map((d: any) => (
              <Link key={d.id} to="/otp" className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:bg-surface">
                <span className="font-mono text-xs text-heading/40">{d.dispatch_number}</span>
                <span className="text-heading">{d.party_name || '—'}</span>
                <span className="text-heading/60">{formatNumber(d.quantity)} {d.unit} {d.product_name}</span>
                <span className="text-heading/60">{d.vehicle_number || '—'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
