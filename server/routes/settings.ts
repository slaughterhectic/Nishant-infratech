import { Router } from 'express';
import { getAll, query } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const rows = await getAll('SELECT key, value FROM app_settings');
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json(map);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.put('/:key', async (req, res) => {
  try {
    if (req.user!.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { value } = req.body;
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [req.params.key, String(value)]
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
