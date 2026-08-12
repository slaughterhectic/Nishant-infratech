import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { initializeDatabase, getOne, getAll } from './db/database';
import { authMiddleware } from './middleware/auth';
import authRouter from './routes/auth';
import partiesRouter from './routes/parties';
import productsRouter from './routes/products';
import locationsRouter from './routes/locations';
import vehiclesRouter from './routes/vehicles';
import driversRouter from './routes/drivers';
import purchasesRouter from './routes/purchases';
import stockRouter from './routes/stock';
import dispatchesRouter from './routes/dispatches';
import orderRequestsRouter from './routes/orderRequests';
import notificationsRouter from './routes/notifications';
import vehicleTripsRouter from './routes/vehicleTrips';
import paymentsRouter from './routes/payments';
import expensesRouter from './routes/expenses';
import reportsRouter from './routes/reports';
import settingsRouter from './routes/settings';
import railRackRouter from './routes/railRack';
import driverPortalRouter from './routes/driverPortal';

const app = express();
const PORT = process.env.PORT || 3002;

// FRONTEND_URL may be a comma-separated list (e.g. prod Vercel domain + a
// custom domain). Vercel preview deploys get a fresh *.vercel.app subdomain
// per branch/PR, so those are matched by pattern rather than listed individually.
const allowedOrigins = (process.env.FRONTEND_URL ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .concat('http://localhost:5175');
const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api', authMiddleware);

app.use('/api/parties', partiesRouter);
app.use('/api/products', productsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/drivers', driversRouter);
app.use('/api/purchases', purchasesRouter);
app.use('/api/stock', stockRouter);
app.use('/api/dispatches', dispatchesRouter);
app.use('/api/order-requests', orderRequestsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/vehicle-trips', vehicleTripsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/rail-rack', railRackRouter);
app.use('/api/driver', driverPortalRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/dashboard/stats', async (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const todaySales = await getOne(
      `SELECT COALESCE(SUM(total_amount),0) as amount FROM dispatches WHERE kind='sale' AND status != 'cancelled' AND date=$1`, [today]
    );
    const todayCollection = await getOne(
      `SELECT COALESCE(SUM(amount),0) as amount FROM payments WHERE direction='receive' AND date=$1`, [today]
    );
    const todayDispatchCount = await getOne(
      `SELECT COUNT(*)::int as c FROM dispatches WHERE date=$1 AND status != 'cancelled'`, [today]
    );
    const todayPurchases = await getOne(
      `SELECT COALESCE(SUM(purchase_amount),0) as amount FROM purchases WHERE date=$1`, [today]
    );
    const pendingOtp = await getOne(
      `SELECT COUNT(*)::int as c FROM dispatches WHERE status='dispatched'`
    );
    const punchedOrders = await getOne(
      `SELECT COUNT(*)::int as c FROM dispatches WHERE status='punched'`
    );
    const outstandingReceivable = await getOne(`
      SELECT COALESCE(SUM(
        CASE WHEN COALESCE(p.opening_balance_type,'dr') = 'dr' THEN COALESCE(p.opening_balance,0) ELSE -COALESCE(p.opening_balance,0) END
        + COALESCE((SELECT SUM(d.total_amount) FROM dispatches d WHERE d.party_id = p.id AND d.kind='sale' AND d.status != 'cancelled'), 0)
        + COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'pay'), 0)
        - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'receive'), 0)
      ),0) as total FROM parties p WHERE p.type != 'supplier'
    `);

    res.json({
      todaySales: Number(todaySales.amount),
      todayCollection: Number(todayCollection.amount),
      todayDispatchCount: Number(todayDispatchCount.c),
      todayProfit: Number(todaySales.amount) - Number(todayPurchases.amount),
      pendingOtpCount: Number(pendingOtp.c),
      punchedOrderCount: Number(punchedOrders.c),
      outstandingReceivable: Number(outstandingReceivable.total),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/charts', async (_req, res) => {
  try {
    const topProducts = await getAll(`
      SELECT pr.name, pr.category, pr.unit, SUM(d.quantity) as quantity
      FROM dispatches d JOIN products pr ON pr.id = d.product_id
      WHERE d.kind='sale' AND d.status != 'cancelled' AND to_char(d.date::date,'YYYY-MM') = to_char(CURRENT_DATE,'YYYY-MM')
      GROUP BY pr.id, pr.name, pr.category, pr.unit ORDER BY quantity DESC LIMIT 6
    `);
    const topOutstanding = await getAll(`
      SELECT p.id, p.name,
        (CASE WHEN COALESCE(p.opening_balance_type,'dr') = 'dr' THEN COALESCE(p.opening_balance,0) ELSE -COALESCE(p.opening_balance,0) END
         + COALESCE((SELECT SUM(d.total_amount) FROM dispatches d WHERE d.party_id = p.id AND d.kind='sale' AND d.status != 'cancelled'), 0)
         + COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'pay'), 0)
         - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'receive'), 0)) as outstanding
      FROM parties p
      WHERE p.type != 'supplier'
      ORDER BY outstanding DESC LIMIT 5
    `);
    const pendingOtpDispatches = await getAll(`
      SELECT d.id, ('DSP-' || (1000+d.id)) as dispatch_number, p.name as party_name, pr.name as product_name, d.quantity, pr.unit, v.vehicle_number
      FROM dispatches d
      JOIN products pr ON pr.id = d.product_id
      LEFT JOIN parties p ON p.id = d.party_id
      LEFT JOIN vehicles v ON v.id = d.vehicle_id
      WHERE d.status='dispatched' ORDER BY d.otp_generated_at DESC LIMIT 10
    `);
    res.json({
      topProducts,
      topOutstanding: topOutstanding.filter((r: any) => Number(r.outstanding) > 0),
      pendingOtpDispatches,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Serve built frontend in production
const distPath = path.join(process.cwd(), 'client/dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Nishant Infratech API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
