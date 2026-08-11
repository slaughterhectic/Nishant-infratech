import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { month } = req.query as Record<string, string | undefined>;
    const where = month ? `WHERE to_char(date::date,'YYYY-MM')=$1` : '';
    const params = month ? [month] : [];
    res.json(await getAll(`SELECT * FROM expenses ${where} ORDER BY date DESC, id DESC`, params));
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { date, amount, category, description, mode, bank_name } = req.body;
  try {
    if (!date || !amount || !description) return res.status(400).json({ error: 'date, amount, description are required' });
    const row = await getOne(
      `INSERT INTO expenses (date, amount, category, description, mode, bank_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [date, amount, category || null, description, mode || 'cash', bank_name || null]
    );
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { date, amount, category, description, mode, bank_name } = req.body;
  try {
    const row = await getOne(
      `UPDATE expenses SET date=$1, amount=$2, category=$3, description=$4, mode=$5, bank_name=$6 WHERE id=$7 RETURNING *`,
      [date, amount, category || null, description, mode, bank_name || null, req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Expense not found' });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM expenses WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
