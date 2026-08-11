import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/', async (_req, res) => {
  try { res.json(await getAll('SELECT * FROM locations ORDER BY type, name')); }
  catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { name, type, rented_category, address } = req.body;
  try {
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const row = await getOne(
      'INSERT INTO locations (name, type, rented_category, address) VALUES ($1,$2,$3,$4) RETURNING *',
      [name.trim(), type || 'own_godown', type === 'rented_godown' ? (rented_category || null) : null, address || null]
    );
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { name, type, rented_category, address, is_active } = req.body;
  try {
    const row = await getOne(
      'UPDATE locations SET name=$1, type=$2, rented_category=$3, address=$4, is_active=COALESCE($5,is_active) WHERE id=$6 RETURNING *',
      [name, type, type === 'rented_godown' ? (rented_category || null) : null, address || null, is_active ?? null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Location not found' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const used = await getOne(
      `SELECT 1 FROM (
        SELECT location_id as lid FROM purchases WHERE location_id=$1
        UNION ALL SELECT source_location_id FROM dispatches WHERE source_location_id=$1
        UNION ALL SELECT destination_location_id FROM dispatches WHERE destination_location_id=$1
        UNION ALL SELECT location_id FROM godown_opening_stock WHERE location_id=$1
      ) x LIMIT 1`, [req.params.id]
    );
    if (used) return res.status(400).json({ error: 'Location is in use and cannot be deleted' });
    await query('DELETE FROM locations WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
