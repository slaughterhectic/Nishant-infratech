import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { product_id, location_id, month } = req.query as Record<string, string | undefined>;
    const clauses: string[] = [];
    const params: any[] = [];
    if (product_id) { params.push(product_id); clauses.push(`pu.product_id=$${params.length}`); }
    if (location_id) { params.push(location_id); clauses.push(`pu.location_id=$${params.length}`); }
    if (month) { params.push(month); clauses.push(`to_char(pu.date::date,'YYYY-MM')=$${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await getAll(`
      SELECT pu.*, p.name as product_name, p.unit, l.name as location_name, s.name as supplier_name
      FROM purchases pu
      JOIN products p ON p.id = pu.product_id
      JOIN locations l ON l.id = pu.location_id
      LEFT JOIN parties s ON s.id = pu.supplier_id
      ${where}
      ORDER BY pu.date DESC, pu.id DESC
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// GET /purchases/lots?product_id=&location_id= — each purchase batch of this
// product landed at this location, with its own rate and how much of it is
// still unsold (quantity minus dispatches already attributed to that exact
// lot via source_purchase_id). Oldest first (FIFO display order). Lets the
// Punch Order form show "which batch/rate am I selling from" the same way
// cementbook's SaleForm rate picker does — buying the same product from
// multiple suppliers or the rail rack at different rates is expected.
router.get('/lots', async (req, res) => {
  try {
    const { product_id, location_id } = req.query as Record<string, string | undefined>;
    if (!product_id || !location_id) return res.status(400).json({ error: 'product_id and location_id are required' });
    const rows = await getAll(`
      SELECT * FROM (
        SELECT pu.id, pu.date, pu.purchase_rate, pu.source, pu.quantity,
          s.name as supplier_name,
          pu.quantity - COALESCE((
            SELECT SUM(d.quantity) FROM dispatches d
            WHERE d.source_purchase_id = pu.id AND d.status != 'cancelled'
          ), 0) as available
        FROM purchases pu
        LEFT JOIN parties s ON s.id = pu.supplier_id
        WHERE pu.product_id = $1 AND pu.location_id = $2
      ) lots
      WHERE available > 0
      ORDER BY date ASC, id ASC
    `, [product_id, location_id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { date, product_id, quantity, purchase_rate, source, location_id, supplier_id, vehicle_number, remarks } = req.body;
  try {
    if (!date || !product_id || !quantity || !purchase_rate || !location_id) {
      return res.status(400).json({ error: 'date, product_id, quantity, purchase_rate, location_id are required' });
    }
    const row = await getOne(
      `INSERT INTO purchases (date, product_id, quantity, purchase_rate, source, location_id, supplier_id, vehicle_number, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [date, product_id, quantity, purchase_rate, source || 'factory', location_id, supplier_id || null, vehicle_number || null, remarks || null]
    );
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { date, product_id, quantity, purchase_rate, source, location_id, supplier_id, vehicle_number, remarks } = req.body;
  try {
    const row = await getOne(
      `UPDATE purchases SET date=$1, product_id=$2, quantity=$3, purchase_rate=$4, source=$5, location_id=$6, supplier_id=$7, vehicle_number=$8, remarks=$9
       WHERE id=$10 RETURNING *`,
      [date, product_id, quantity, purchase_rate, source, location_id, supplier_id || null, vehicle_number || null, remarks || null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Purchase not found' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM purchases WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
