import { Router } from 'express';
import { getAll, getOne, query } from '../db/database';
import { friendlyError } from '../lib/userError';
import { notifyEvent } from '../lib/notify';

const router = Router();

const LIST_SELECT = `
  SELECT r.*, p.name as party_name, p.phone as party_phone,
    pr.name as product_name, pr.unit as product_unit,
    u.display_name as requested_by_name,
    ('DSP-' || (1000 + r.dispatch_id)) as dispatch_number
  FROM order_requests r
  JOIN parties p ON p.id = r.party_id
  JOIN products pr ON pr.id = r.product_id
  LEFT JOIN users u ON u.id = r.requested_by
`;

router.get('/', async (req, res) => {
  try {
    const { status } = req.query as Record<string, string | undefined>;
    const where = status ? `WHERE r.status=$1` : '';
    const rows = await getAll(`${LIST_SELECT} ${where} ORDER BY r.created_at DESC, r.id DESC`, status ? [status] : []);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { date, party_id, product_id, quantity, rate, payment_type, credit_days, expected_delivery_date, destination_address, remarks } = req.body;
  try {
    if (!date || !party_id || !product_id || !quantity) {
      return res.status(400).json({ error: 'date, party_id, product_id, quantity are required' });
    }
    const row = await getOne(
      `INSERT INTO order_requests (date, party_id, product_id, quantity, rate, payment_type, credit_days, expected_delivery_date, destination_address, remarks, requested_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [date, party_id, product_id, quantity, rate || null, payment_type || 'cash', credit_days || null, expected_delivery_date || null, destination_address || null, remarks || null, req.user!.id]
    );
    const product = await getOne('SELECT name, unit FROM products WHERE id=$1', [product_id]);
    const party = await getOne('SELECT name FROM parties WHERE id=$1', [party_id]);
    await notifyEvent({
      eventType: 'order_requested',
      recipientRole: 'owner',
      message: `New order request: ${quantity} ${product?.unit || ''} ${product?.name || ''} for ${party?.name || 'a customer'} — awaiting review before it's punched.`,
    });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

// PATCH /:id/proceed — called once the reviewer has actually punched the real
// dispatch from the pre-filled Punch Order form; links the two records and
// marks the request settled so it drops out of the pending queue.
router.patch('/:id/proceed', async (req, res) => {
  const { dispatch_id } = req.body;
  try {
    if (!dispatch_id) return res.status(400).json({ error: 'dispatch_id is required' });
    const row = await getOne(
      `UPDATE order_requests SET status='proceeded', dispatch_id=$1 WHERE id=$2 AND status='pending' RETURNING *`,
      [dispatch_id, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Order request not found or already settled' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.patch('/:id/discard', async (req, res) => {
  try {
    const row = await getOne(`UPDATE order_requests SET status='discarded' WHERE id=$1 AND status='pending' RETURNING *`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Order request not found or already settled' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query(`DELETE FROM order_requests WHERE id=$1 AND status='pending'`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
