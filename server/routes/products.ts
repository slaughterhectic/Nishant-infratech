import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const rows = category
      ? await getAll('SELECT * FROM products WHERE category=$1 ORDER BY name', [category])
      : await getAll('SELECT * FROM products ORDER BY category, name');
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { name, category, unit, product_type, manufacturer } = req.body;
  try {
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const row = await getOne(
      'INSERT INTO products (name, category, unit, product_type, manufacturer) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name.trim(), category || 'cement', unit || (category === 'sariya' ? 'ton' : 'bag'), product_type || null, manufacturer || null]
    );
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { name, category, unit, product_type, manufacturer, is_active } = req.body;
  try {
    const row = await getOne(
      'UPDATE products SET name=$1, category=$2, unit=$3, product_type=$4, manufacturer=$5, is_active=COALESCE($6,is_active) WHERE id=$7 RETURNING *',
      [name, category, unit, product_type || null, manufacturer || null, is_active ?? null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const used = await getOne(
      `SELECT 1 FROM (
        SELECT product_id as pid FROM purchases WHERE product_id=$1
        UNION ALL SELECT product_id FROM dispatches WHERE product_id=$1
      ) x LIMIT 1`, [req.params.id]
    );
    if (used) return res.status(400).json({ error: 'Product has transactions and cannot be deleted' });
    await query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
