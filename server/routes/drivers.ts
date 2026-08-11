import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/', async (_req, res) => {
  try { res.json(await getAll('SELECT * FROM drivers ORDER BY name')); }
  catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { name, phone } = req.body;
  try {
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const row = await getOne('INSERT INTO drivers (name, phone) VALUES ($1,$2) RETURNING *', [name.trim(), phone || null]);
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { name, phone, is_active } = req.body;
  try {
    const row = await getOne(
      'UPDATE drivers SET name=$1, phone=$2, is_active=COALESCE($3,is_active) WHERE id=$4 RETURNING *',
      [name, phone || null, is_active ?? null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Driver not found' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const used = await getOne(
      `SELECT 1 FROM (
        SELECT driver_id as did FROM dispatches WHERE driver_id=$1
        UNION ALL SELECT driver_id FROM vehicle_trips WHERE driver_id=$1
      ) x LIMIT 1`, [req.params.id]
    );
    if (used) return res.status(400).json({ error: 'Driver has transactions and cannot be deleted' });
    await query('DELETE FROM drivers WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
