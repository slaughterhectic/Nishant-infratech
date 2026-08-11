import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/', async (_req, res) => {
  try { res.json(await getAll('SELECT * FROM vehicles ORDER BY vehicle_number')); }
  catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { vehicle_number, kind, ownership } = req.body;
  try {
    if (!vehicle_number?.trim()) return res.status(400).json({ error: 'Vehicle number is required' });
    const row = await getOne(
      'INSERT INTO vehicles (vehicle_number, kind, ownership) VALUES ($1,$2,$3) RETURNING *',
      [vehicle_number.trim().toUpperCase(), kind || 'truck', ownership || 'owned']
    );
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { vehicle_number, kind, ownership, is_active } = req.body;
  try {
    const row = await getOne(
      'UPDATE vehicles SET vehicle_number=$1, kind=$2, ownership=$3, is_active=COALESCE($4,is_active) WHERE id=$5 RETURNING *',
      [vehicle_number?.trim().toUpperCase(), kind, ownership, is_active ?? null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const used = await getOne(
      `SELECT 1 FROM (
        SELECT vehicle_id as vid FROM dispatches WHERE vehicle_id=$1
        UNION ALL SELECT vehicle_id FROM vehicle_trips WHERE vehicle_id=$1
      ) x LIMIT 1`, [req.params.id]
    );
    if (used) return res.status(400).json({ error: 'Vehicle has transactions and cannot be deleted' });
    await query('DELETE FROM vehicles WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
