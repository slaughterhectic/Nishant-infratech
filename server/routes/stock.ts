import { Router } from 'express';
import { getOne, getAll, query } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

// Stock is derived, never stored: opening + purchased-in + transferred-in − dispatched-out.
// A stock_transfer dispatch adds to its destination once it has left the source
// (status dispatched/delivered) — phase 1 doesn't model separate in-transit inventory.
const STOCK_SQL = `
  SELECT l.id as location_id, l.name as location_name, l.type as location_type, l.rented_category,
    pr.id as product_id, pr.name as product_name, pr.category, pr.unit,
    COALESCE(gos.quantity,0)
    + COALESCE((SELECT SUM(quantity) FROM purchases WHERE location_id=l.id AND product_id=pr.id),0)
    + COALESCE((SELECT SUM(quantity) FROM dispatches WHERE destination_location_id=l.id AND product_id=pr.id AND kind='stock_transfer' AND status IN ('dispatched','delivered')),0)
    - COALESCE((SELECT SUM(quantity) FROM dispatches WHERE source_location_id=l.id AND product_id=pr.id AND status IN ('dispatched','delivered')),0)
    as quantity
  FROM locations l
  CROSS JOIN products pr
  LEFT JOIN godown_opening_stock gos ON gos.location_id=l.id AND gos.product_id=pr.id
  WHERE l.is_active=1 AND pr.is_active=1
`;

export async function getAvailableStock(locationId: number, productId: number): Promise<number> {
  const row = await getOne(`${STOCK_SQL} AND l.id=$1 AND pr.id=$2`, [locationId, productId]);
  return row ? Number(row.quantity) : 0;
}

// GET /stock — full location x product matrix (non-zero by default)
router.get('/', async (req, res) => {
  try {
    const all = req.query.all === '1';
    const rows = await getAll(`${STOCK_SQL} ORDER BY l.name, pr.category, pr.name`);
    res.json(all ? rows : rows.filter((r: any) => Number(r.quantity) !== 0));
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// GET /stock/by-location/:locationId
router.get('/by-location/:locationId', async (req, res) => {
  try {
    const rows = await getAll(`${STOCK_SQL} AND l.id=$1 ORDER BY pr.category, pr.name`, [req.params.locationId]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// GET /stock/summary — per-location totals split by category (for dashboard/location cards)
router.get('/summary', async (_req, res) => {
  try {
    const rows = await getAll(`${STOCK_SQL}`);
    const byLocation: Record<string, any> = {};
    for (const r of rows) {
      const key = r.location_id;
      if (!byLocation[key]) {
        byLocation[key] = {
          location_id: r.location_id, location_name: r.location_name, location_type: r.location_type,
          rented_category: r.rented_category, cement_bags: 0, sariya_tons: 0,
        };
      }
      if (r.category === 'cement') byLocation[key].cement_bags += Number(r.quantity);
      else byLocation[key].sariya_tons += Number(r.quantity);
    }
    res.json(Object.values(byLocation));
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// Opening stock CRUD
router.get('/opening', async (_req, res) => {
  try {
    res.json(await getAll(`
      SELECT gos.*, l.name as location_name, p.name as product_name, p.unit
      FROM godown_opening_stock gos
      JOIN locations l ON l.id = gos.location_id
      JOIN products p ON p.id = gos.product_id
      ORDER BY l.name, p.name
    `));
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/opening', async (req, res) => {
  const { location_id, product_id, quantity, rate, as_of_date, remarks } = req.body;
  try {
    if (!location_id || !product_id) return res.status(400).json({ error: 'location_id and product_id are required' });
    const row = await getOne(
      `INSERT INTO godown_opening_stock (location_id, product_id, quantity, rate, as_of_date, remarks)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (location_id, product_id) DO UPDATE SET quantity=$3, rate=$4, as_of_date=$5, remarks=$6
       RETURNING *`,
      [location_id, product_id, quantity || 0, rate || 0, as_of_date || null, remarks || null]
    );
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/opening/:id', async (req, res) => {
  try {
    await query('DELETE FROM godown_opening_stock WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
