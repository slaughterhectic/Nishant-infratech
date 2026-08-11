import { useEffect, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Clock, IndianRupee, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../lib/store';
import { formatDate, formatINR, formatNumber } from '../lib/format';
import { Skeleton } from '../components/ui/Skeleton';
import { KPICard } from '../components/ui/KPICard';
import { DataTable } from '../components/ui/DataTable';

const GREEN = '#2D7A1F';
const RED = '#C0271E';
const BRAND = '#F5691F';

interface ByProduct {
  product_id: number; product_name: string; unit: string; dispatch_count: number;
  quantity: number; revenue: number; cost: number; margin: number; margin_approx: boolean;
}
interface InTransit {
  id: number; dispatch_number: string; date: string; expected_delivery_date: string | null;
  quantity: number; product_name: string; unit: string; party_name: string | null;
  days_since_punched: number; overdue_days: number | null;
}
interface DeliveryPerf {
  id: number; dispatch_number: string; date: string; expected_delivery_date: string;
  otp_verified_at: string; product_name: string; party_name: string | null; delta_days: number;
}

const pCol = createColumnHelper<ByProduct>();
const tCol = createColumnHelper<InTransit>();
const dCol = createColumnHelper<DeliveryPerf>();

export default function SalesAnalytics() {
  const addToast = useToastStore((s) => s.addToast);
  const [loading, setLoading] = useState(true);
  const [byProduct, setByProduct] = useState<ByProduct[]>([]);
  const [inTransit, setInTransit] = useState<InTransit[]>([]);
  const [deliveryPerformance, setDeliveryPerformance] = useState<DeliveryPerf[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await api.reports.salesAnalytics();
        setByProduct(data.byProduct);
        setInTransit(data.inTransit);
        setDeliveryPerformance(data.deliveryPerformance);
      } catch (e: any) { addToast(e.message, 'error'); }
      finally { setLoading(false); }
    })();
  }, [addToast]);

  const totalRevenue = byProduct.reduce((s, r) => s + Number(r.revenue), 0);
  const totalMargin = byProduct.reduce((s, r) => s + Number(r.margin), 0);
  const marginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  const anyApprox = byProduct.some((r) => r.margin_approx);
  const overdueCount = inTransit.filter((r) => r.overdue_days != null).length;
  const onTimeCount = deliveryPerformance.filter((r) => r.delta_days <= 0).length;
  const onTimeRate = deliveryPerformance.length > 0 ? (onTimeCount / deliveryPerformance.length) * 100 : null;

  const revenueChartData = useMemo(
    () => [...byProduct].sort((a, b) => b.revenue - a.revenue).map((r) => ({ name: r.product_name, revenue: Number(r.revenue) })),
    [byProduct]
  );
  const marginChartData = useMemo(
    () => [...byProduct]
      .map((r) => ({ name: r.product_name, marginPct: Number(r.revenue) > 0 ? (Number(r.margin) / Number(r.revenue)) * 100 : 0 }))
      .sort((a, b) => b.marginPct - a.marginPct),
    [byProduct]
  );

  const productColumns = useMemo(() => [
    pCol.accessor('product_name', { header: 'Product', cell: (c) => <span className="font-medium text-heading">{c.getValue()}</span> }),
    pCol.accessor('dispatch_count', { header: 'Orders', meta: { align: 'right' } }),
    pCol.accessor('quantity', { header: 'Qty', meta: { align: 'right' }, cell: (c) => `${formatNumber(c.getValue())} ${c.row.original.unit}` }),
    pCol.accessor('revenue', { header: 'Revenue', meta: { align: 'right' }, cell: (c) => <span className="font-semibold">{formatINR(c.getValue())}</span> }),
    pCol.accessor('margin', {
      header: 'Margin', meta: { align: 'right' },
      cell: (c) => <span className={`font-semibold ${Number(c.getValue()) >= 0 ? 'text-profit' : 'text-outstanding'}`}>{formatINR(c.getValue())}</span>,
    }),
    pCol.display({
      id: 'marginPct', header: 'Margin %', meta: { align: 'right' },
      cell: (c) => {
        const r = c.row.original;
        const pct = Number(r.revenue) > 0 ? (Number(r.margin) / Number(r.revenue)) * 100 : 0;
        return <span className={pct >= 0 ? 'text-profit' : 'text-outstanding'}>{pct.toFixed(1)}%{r.margin_approx && <sup className="ml-0.5 text-heading/30">~</sup>}</span>;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const transitColumns = useMemo(() => [
    tCol.accessor('dispatch_number', { header: 'Dispatch', cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
    tCol.accessor('party_name', { header: 'Party', cell: (c) => c.getValue() || <span className="text-heading/30">Stock transfer</span> }),
    tCol.accessor('product_name', {
      header: 'Product',
      cell: (c) => `${formatNumber(c.row.original.quantity)} ${c.row.original.unit} ${c.getValue()}`,
    }),
    tCol.accessor('date', { header: 'Punched', cell: (c) => formatDate(c.getValue()) }),
    tCol.accessor('expected_delivery_date', { header: 'Committed by', cell: (c) => c.getValue() ? formatDate(c.getValue()!) : <span className="text-heading/30">—</span> }),
    tCol.display({
      id: 'status', header: 'Status', meta: { align: 'right' },
      cell: (c) => {
        const r = c.row.original;
        if (r.overdue_days != null) return <span className="pill bg-outstanding/10 text-outstanding"><AlertTriangle className="h-3 w-3" /> {r.overdue_days}d overdue</span>;
        return <span className="pill bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{r.days_since_punched}d in transit</span>;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const deliveryColumns = useMemo(() => [
    dCol.accessor('dispatch_number', { header: 'Dispatch', cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
    dCol.accessor('party_name', { header: 'Party', cell: (c) => c.getValue() || <span className="text-heading/30">—</span> }),
    dCol.accessor('product_name', { header: 'Product' }),
    dCol.accessor('expected_delivery_date', { header: 'Committed', cell: (c) => formatDate(c.getValue()) }),
    dCol.accessor('otp_verified_at', { header: 'Delivered', cell: (c) => formatDate(c.getValue()) }),
    dCol.accessor('delta_days', {
      header: 'Timeliness', meta: { align: 'right' },
      cell: (c) => {
        const d = c.getValue();
        if (d === 0) return <span className="pill bg-profit/10 text-profit">On time</span>;
        if (d < 0) return <span className="pill bg-profit/10 text-profit">{Math.abs(d)}d early</span>;
        return <span className="pill bg-outstanding/10 text-outstanding">{d}d late</span>;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  if (loading) return <Skeleton.Table columns={6} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Sales Analytics</h1>
        <p className="text-sm text-heading/50">Margins, brand performance, and delivery timeliness across every sale</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Total Revenue" value={formatINR(totalRevenue)} subtitle={`${byProduct.reduce((s, r) => s + r.dispatch_count, 0)} dispatches`} icon={IndianRupee} color="sale" />
        <KPICard
          title="Total Margin"
          value={formatINR(totalMargin)}
          subtitle={`${marginPct.toFixed(1)}% blended${anyApprox ? ' · ~approx' : ''}`}
          icon={TrendingUp}
          color={totalMargin >= 0 ? 'profit' : 'outstanding'}
        />
        <KPICard title="Still In Transit" value={String(inTransit.length)} subtitle={overdueCount > 0 ? `${overdueCount} overdue` : 'none overdue'} icon={Clock} color={overdueCount > 0 ? 'outstanding' : 'brand'} />
        <KPICard title="On-Time Delivery" value={onTimeRate == null ? '—' : `${onTimeRate.toFixed(0)}%`} subtitle={`of ${deliveryPerformance.length} tracked deliveries`} icon={AlertTriangle} color={onTimeRate == null || onTimeRate >= 80 ? 'profit' : 'outstanding'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-1 text-sm font-semibold text-heading">Revenue by product</h3>
          <p className="mb-3 text-xs text-heading/40">Spot which brands are moving — and which aren't</p>
          <div style={{ height: Math.max(160, revenueChartData.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} />
                <XAxis type="number" tickFormatter={(v) => formatNumber(v)} fontSize={11} />
                <YAxis type="category" dataKey="name" width={110} fontSize={11} />
                <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="revenue" fill={BRAND} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-1 text-sm font-semibold text-heading">Margin % by product</h3>
          <p className="mb-3 text-xs text-heading/40">Where the margin is high — and where it's being given away</p>
          <div style={{ height: Math.max(160, marginChartData.length * 38) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={marginChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.15} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} fontSize={11} />
                <YAxis type="category" dataKey="name" width={110} fontSize={11} />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="marginPct" radius={[0, 4, 4, 0]}>
                  {marginChartData.map((d, i) => <Cell key={i} fill={d.marginPct >= 0 ? GREEN : RED} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <section>
        <h3 className="section-label mb-3">Margin by product {anyApprox && <span className="normal-case text-heading/30">(~ = approximate, no purchase lot pinned)</span>}</h3>
        <DataTable data={byProduct} columns={productColumns} emptyMessage="No sales yet" initialSorting={[{ id: 'revenue', desc: true }]} />
      </section>

      <section>
        <h3 className="section-label mb-3">Dispatched, not yet reached ({inTransit.length})</h3>
        <DataTable data={inTransit} columns={transitColumns} emptyMessage="Nothing currently in transit" initialSorting={[{ id: 'status', desc: true }]} />
      </section>

      <section>
        <h3 className="section-label mb-3">Delivery timeliness — commitment vs actual</h3>
        <DataTable data={deliveryPerformance} columns={deliveryColumns} emptyMessage="No deliveries with a committed date yet" initialSorting={[{ id: 'otp_verified_at', desc: true }]} />
      </section>
    </div>
  );
}
