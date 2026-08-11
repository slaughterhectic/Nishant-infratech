import { Router } from 'express';
import { getAll, getOne } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/sales', async (req, res) => {
  try {
    const { month } = req.query as Record<string, string | undefined>;
    const where = month ? `AND to_char(d.date::date,'YYYY-MM')=$1` : '';
    const params = month ? [month] : [];
    const rows = await getAll(`
      SELECT d.*, ('DSP-' || (1000+d.id)) as dispatch_number, p.name as party_name, pr.name as product_name, pr.unit
      FROM dispatches d
      JOIN products pr ON pr.id = d.product_id
      LEFT JOIN parties p ON p.id = d.party_id
      WHERE d.kind='sale' AND d.status != 'cancelled' ${where}
      ORDER BY d.date DESC, d.id DESC
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.get('/purchases', async (req, res) => {
  try {
    const { month } = req.query as Record<string, string | undefined>;
    const where = month ? `WHERE to_char(pu.date::date,'YYYY-MM')=$1` : '';
    const params = month ? [month] : [];
    const rows = await getAll(`
      SELECT pu.*, pr.name as product_name, pr.unit, l.name as location_name
      FROM purchases pu
      JOIN products pr ON pr.id = pu.product_id
      JOIN locations l ON l.id = pu.location_id
      ${where}
      ORDER BY pu.date DESC, pu.id DESC
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.get('/outstanding', async (_req, res) => {
  try {
    const receivable = await getAll(`
      SELECT p.id, p.name, p.phone, p.type,
        (CASE WHEN COALESCE(p.opening_balance_type,'dr') = 'dr' THEN COALESCE(p.opening_balance,0) ELSE -COALESCE(p.opening_balance,0) END
         + COALESCE((SELECT SUM(d.total_amount) FROM dispatches d WHERE d.party_id = p.id AND d.kind='sale' AND d.status != 'cancelled'), 0)
         + COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'pay'), 0)
         - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'receive'), 0)) as outstanding
      FROM parties p WHERE p.type != 'supplier'
      ORDER BY outstanding DESC
    `);
    const payable = await getAll(`
      SELECT p.id, p.name, p.phone, p.type,
        (CASE WHEN COALESCE(p.opening_balance_type,'cr') = 'cr' THEN COALESCE(p.opening_balance,0) ELSE -COALESCE(p.opening_balance,0) END
         + COALESCE((SELECT SUM(pu.purchase_amount) FROM purchases pu WHERE pu.supplier_id = p.id), 0)
         + COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'receive'), 0)
         - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'pay'), 0)) as outstanding
      FROM parties p WHERE p.type = 'supplier'
      ORDER BY outstanding DESC
    `);
    res.json({ receivable: receivable.filter((r: any) => Number(r.outstanding) !== 0), payable: payable.filter((r: any) => Number(r.outstanding) !== 0) });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// GET /sales-analytics?month= — the view-only analytical rollup behind the
// Sales & Dispatch "Analytics" tab: per-product margin (using each dispatch's
// pinned purchase lot rate where available, falling back to that product's
// average purchase rate — flagged as approximate when it does), plus
// delivery-timeliness tracking against the commitment given at punch time
// (expected_delivery_date) — both what's still in transit and how early/late
// past deliveries actually landed.
router.get('/sales-analytics', async (req, res) => {
  try {
    const { month } = req.query as Record<string, string | undefined>;
    const monthWhere = month ? `AND to_char(d.date::date,'YYYY-MM')=$1` : '';
    const params = month ? [month] : [];

    const byProduct = await getAll(`
      WITH avg_cost AS (
        SELECT product_id, AVG(purchase_rate) as avg_rate FROM purchases GROUP BY product_id
      ),
      sale_rows AS (
        SELECT d.id, d.product_id, d.quantity, d.total_amount,
          COALESCE(pu.purchase_rate, ac.avg_rate, 0) as cost_rate,
          (pu.purchase_rate IS NULL) as approx
        FROM dispatches d
        LEFT JOIN purchases pu ON pu.id = d.source_purchase_id
        LEFT JOIN avg_cost ac ON ac.product_id = d.product_id
        WHERE d.kind = 'sale' AND d.status != 'cancelled' ${monthWhere}
      )
      SELECT p.id as product_id, p.name as product_name, p.unit,
        COUNT(*)::int as dispatch_count,
        SUM(sr.quantity) as quantity,
        SUM(sr.total_amount) as revenue,
        SUM(sr.quantity * sr.cost_rate) as cost,
        SUM(sr.total_amount) - SUM(sr.quantity * sr.cost_rate) as margin,
        bool_or(sr.approx) as margin_approx
      FROM sale_rows sr
      JOIN products p ON p.id = sr.product_id
      GROUP BY p.id, p.name, p.unit
      ORDER BY revenue DESC
    `, params);

    const inTransit = await getAll(`
      SELECT d.id, ('DSP-' || (1000+d.id)) as dispatch_number, d.date, d.expected_delivery_date,
        d.quantity, pr.name as product_name, pr.unit, p.name as party_name,
        (CURRENT_DATE - d.date::date)::int as days_since_punched,
        CASE WHEN d.expected_delivery_date IS NOT NULL AND d.expected_delivery_date::date < CURRENT_DATE
          THEN (CURRENT_DATE - d.expected_delivery_date::date)::int ELSE NULL END as overdue_days
      FROM dispatches d
      JOIN products pr ON pr.id = d.product_id
      LEFT JOIN parties p ON p.id = d.party_id
      WHERE d.status = 'dispatched'
      ORDER BY overdue_days DESC NULLS LAST, days_since_punched DESC
    `);

    const deliveryPerformance = await getAll(`
      SELECT d.id, ('DSP-' || (1000+d.id)) as dispatch_number, d.date, d.expected_delivery_date,
        d.otp_verified_at, pr.name as product_name, p.name as party_name,
        (d.otp_verified_at::date - d.expected_delivery_date::date)::int as delta_days
      FROM dispatches d
      JOIN products pr ON pr.id = d.product_id
      LEFT JOIN parties p ON p.id = d.party_id
      WHERE d.status = 'delivered' AND d.expected_delivery_date IS NOT NULL AND d.otp_verified_at IS NOT NULL
        ${month ? `AND to_char(d.date::date,'YYYY-MM')=$1` : ''}
      ORDER BY d.otp_verified_at DESC
      LIMIT 200
    `, params);

    res.json({ byProduct, inTransit, deliveryPerformance });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.get('/pnl', async (req, res) => {
  try {
    const month = req.query.month as string | undefined;
    const salesWhere = month ? `AND to_char(date::date,'YYYY-MM')=$1` : '';
    const purchaseWhere = month ? `WHERE to_char(date::date,'YYYY-MM')=$1` : '';
    const expenseWhere = month ? `WHERE to_char(date::date,'YYYY-MM')=$1` : '';
    const params = month ? [month] : [];
    const sales = await getOne(`SELECT COALESCE(SUM(total_amount),0) as amount FROM dispatches WHERE kind='sale' AND status != 'cancelled' ${salesWhere}`, params);
    const purchases = await getOne(`SELECT COALESCE(SUM(purchase_amount),0) as amount FROM purchases ${purchaseWhere}`, params);
    const expenses = await getOne(`SELECT COALESCE(SUM(amount),0) as amount FROM expenses ${expenseWhere}`, params);
    const gross = Number(sales.amount) - Number(purchases.amount);
    const net = gross - Number(expenses.amount);
    res.json({ sales: Number(sales.amount), purchases: Number(purchases.amount), expenses: Number(expenses.amount), gross, net });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
