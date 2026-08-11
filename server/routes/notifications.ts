import { Router } from 'express';
import { getAll, query } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

// GET / — recent activity feed (mirrors the mockup's "Recent activity" panel)
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rows = await getAll(
      `SELECT n.*, ('DSP-' || (1000 + n.dispatch_id)) as dispatch_number
       FROM dispatch_notifications n
       ORDER BY n.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.get('/unread-count', async (_req, res) => {
  try {
    const row = await getAll(`SELECT COUNT(*)::int as c FROM dispatch_notifications WHERE read_at IS NULL`);
    res.json({ count: row[0]?.c || 0 });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/mark-read', async (_req, res) => {
  try {
    await query(`UPDATE dispatch_notifications SET read_at=NOW() WHERE read_at IS NULL`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
