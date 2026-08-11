import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';
import { notifyEvent } from '../lib/notify';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { party_id } = req.query as Record<string, string | undefined>;
    const where = party_id ? 'WHERE pm.party_id=$1' : '';
    const params = party_id ? [party_id] : [];
    const rows = await getAll(`
      SELECT pm.*, p.name as party_name FROM payments pm
      JOIN parties p ON p.id = pm.party_id
      ${where}
      ORDER BY pm.date DESC, pm.id DESC
    `, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { date, party_id, amount, mode, direction, bank_name, remarks } = req.body;
  try {
    if (!date || !party_id || !amount) return res.status(400).json({ error: 'date, party_id, amount are required' });
    const row = await getOne(
      `INSERT INTO payments (date, party_id, amount, mode, direction, bank_name, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [date, party_id, amount, mode || 'bank', direction || 'receive', bank_name || null, remarks || null]
    );
    if ((direction || 'receive') === 'receive') {
      const party = await getOne(`
        SELECT p.name,
          CASE WHEN COALESCE(p.opening_balance_type,'dr') = 'dr' THEN COALESCE(p.opening_balance,0) ELSE -COALESCE(p.opening_balance,0) END
          + COALESCE((SELECT SUM(d.total_amount) FROM dispatches d WHERE d.party_id = p.id AND d.kind='sale' AND d.status != 'cancelled'), 0)
          + COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'pay'), 0)
          - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'receive'), 0)
          as outstanding
        FROM parties p WHERE p.id=$1
      `, [party_id]);
      await notifyEvent({
        eventType: 'payment_received',
        message: `Payment received: ₹${Number(amount).toLocaleString('en-IN')} from ${party?.name || 'party'}. Outstanding: ₹${Number(party?.outstanding || 0).toLocaleString('en-IN')}`,
      });
    }
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { date, party_id, amount, mode, direction, bank_name, remarks } = req.body;
  try {
    const row = await getOne(
      `UPDATE payments SET date=$1, party_id=$2, amount=$3, mode=$4, direction=$5, bank_name=$6, remarks=$7 WHERE id=$8 RETURNING *`,
      [date, party_id, amount, mode, direction, bank_name || null, remarks || null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Payment not found' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM payments WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
