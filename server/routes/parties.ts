import { Router } from 'express';
import { query, getOne, getAll } from '../db/database';
import { friendlyError } from '../lib/userError';

const router = Router();

const OUTSTANDING_SQL = `
  CASE
    WHEN p.type = 'supplier' THEN
      CASE WHEN COALESCE(p.opening_balance_type,'cr') = 'cr' THEN COALESCE(p.opening_balance,0)
           ELSE -COALESCE(p.opening_balance,0) END
      + COALESCE((SELECT SUM(pu.purchase_amount) FROM purchases pu WHERE pu.supplier_id = p.id), 0)
      + COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'receive'), 0)
      - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'pay'), 0)
    ELSE
      CASE WHEN COALESCE(p.opening_balance_type,'dr') = 'dr' THEN COALESCE(p.opening_balance,0)
           ELSE -COALESCE(p.opening_balance,0) END
      + COALESCE((SELECT SUM(d.total_amount) FROM dispatches d WHERE d.party_id = p.id AND d.kind='sale' AND d.status != 'cancelled'), 0)
      + COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'pay'), 0)
      - COALESCE((SELECT SUM(amount) FROM payments WHERE party_id = p.id AND direction = 'receive'), 0)
  END
`;

router.get('/', async (_req, res) => {
  try {
    const parties = await getAll(`
      SELECT p.*, (${OUTSTANDING_SQL}) as outstanding,
        (SELECT MAX(d) FROM (
          SELECT date as d FROM dispatches WHERE party_id = p.id
          UNION ALL SELECT date FROM payments WHERE party_id = p.id
          UNION ALL SELECT date FROM purchases WHERE supplier_id = p.id
        ) sub) as last_transaction
      FROM parties p ORDER BY p.name
    `);
    res.json(parties);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.get('/:id', async (req, res) => {
  try {
    const party = await getOne(`SELECT p.*, (${OUTSTANDING_SQL}) as outstanding FROM parties p WHERE p.id=$1`, [req.params.id]);
    if (!party) return res.status(404).json({ error: 'Party not found' });
    res.json(party);
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// GET /:id/ledger — running-balance transaction history
router.get('/:id/ledger', async (req, res) => {
  try {
    const id = req.params.id;
    const party = await getOne('SELECT * FROM parties WHERE id=$1', [id]);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const isSupplier = party.type === 'supplier';
    let rows: any[];
    if (isSupplier) {
      rows = await getAll(`
        SELECT * FROM (
          SELECT date, 'purchase' as type, purchase_amount as amount, remarks, id, created_at FROM purchases WHERE supplier_id=$1
          UNION ALL
          SELECT date, 'payment_' || direction as type, amount, remarks, id, created_at FROM payments WHERE party_id=$1
        ) sub
        ORDER BY date, (type = 'purchase') DESC, created_at
      `, [id]);
    } else {
      rows = await getAll(`
        SELECT * FROM (
          SELECT date, 'dispatch' as type, total_amount as amount, remarks, id, created_at FROM dispatches WHERE party_id=$1 AND kind='sale' AND status != 'cancelled'
          UNION ALL
          SELECT date, 'payment_' || direction as type, amount, remarks, id, created_at FROM payments WHERE party_id=$1
        ) sub
        ORDER BY date, (type = 'dispatch') DESC, created_at
      `, [id]);
    }

    let balance = party.opening_balance_type === (isSupplier ? 'cr' : 'dr') ? Number(party.opening_balance) : -Number(party.opening_balance);
    const ledger = rows.map((r) => {
      const amt = Number(r.amount);
      if (isSupplier) {
        if (r.type === 'purchase' || r.type === 'payment_receive') balance += amt;
        else balance -= amt;
      } else {
        if (r.type === 'dispatch' || r.type === 'payment_pay') balance += amt;
        else balance -= amt;
      }
      return { ...r, running_balance: balance };
    });

    res.json({ party, opening_balance: party.opening_balance, opening_balance_type: party.opening_balance_type, ledger });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

router.post('/', async (req, res) => {
  const { name, phone, address, type, opening_balance, opening_balance_type } = req.body;
  try {
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const result = await getOne(
      'INSERT INTO parties (name, phone, address, type, opening_balance, opening_balance_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name.trim(), phone || null, address || null, type || 'dealer', opening_balance || 0, opening_balance_type || 'dr']
    );
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.put('/:id', async (req, res) => {
  const { name, phone, address, type, opening_balance, opening_balance_type, is_active } = req.body;
  try {
    const result = await getOne(
      'UPDATE parties SET name=$1, phone=$2, address=$3, type=$4, opening_balance=$5, opening_balance_type=$6, is_active=COALESCE($7,is_active) WHERE id=$8 RETURNING *',
      [name, phone || null, address || null, type, opening_balance || 0, opening_balance_type || 'dr', is_active ?? null, req.params.id]
    );
    if (!result) return res.status(404).json({ error: 'Party not found' });
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: friendlyError(e) }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const used = await getOne(
      `SELECT 1 FROM (
        SELECT party_id as pid FROM dispatches WHERE party_id=$1
        UNION ALL SELECT party_id FROM payments WHERE party_id=$1
        UNION ALL SELECT supplier_id FROM purchases WHERE supplier_id=$1
      ) x LIMIT 1`,
      [req.params.id]
    );
    if (used) return res.status(400).json({ error: 'Party has transactions and cannot be deleted' });
    await query('DELETE FROM parties WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

export default router;
