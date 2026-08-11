import { Router } from 'express';
import { getAll, getOne } from '../db/database';
import { friendlyError } from '../lib/userError';
import { notifyEvent } from '../lib/notify';
import pool from '../db/database';

const router = Router();

interface AllocationInput {
  outcome: 'direct_wagon' | 'platform_dump' | 'godown_transfer' | 'exchange';
  quantity: number;
  party_id?: number;
  destination_location_id?: number;
}

router.get('/wagons', async (req, res) => {
  try {
    const wagons = await getAll(`
      SELECT w.*, pr.name as product_name, pr.unit, l.name as location_name
      FROM rail_wagons w
      JOIN products pr ON pr.id = w.product_id
      JOIN locations l ON l.id = w.location_id
      ORDER BY w.created_at DESC
    `);
    const allocations = await getAll(`
      SELECT a.*, p.name as party_name, dl.name as destination_location_name, d.status as dispatch_status,
        ('DSP-' || (1000+d.id)) as dispatch_number
      FROM rail_wagon_allocations a
      LEFT JOIN parties p ON p.id = a.party_id
      LEFT JOIN locations dl ON dl.id = a.destination_location_id
      LEFT JOIN dispatches d ON d.id = a.dispatch_id
      WHERE a.wagon_id = ANY($1::int[])
      ORDER BY a.id
    `, [wagons.map((w: any) => w.id)]);
    const byWagon: Record<number, any[]> = {};
    for (const a of allocations) (byWagon[a.wagon_id] ||= []).push(a);
    res.json(wagons.map((w: any) => ({ ...w, allocations: byWagon[w.id] || [] })));
  } catch (e: any) { res.status(500).json({ error: friendlyError(e) }); }
});

// POST /wagons — one wagon's arrival + how its quantity was split across the
// 4 outcomes from the client's mockup (Direct from wagon / Platform dump /
// Godown transfer / Exchange). A purchase lands the stock at the rail platform,
// then every non-platform-dump bucket becomes a normal dispatch that flows
// through the SAME punch -> Gate Entry -> OTP pipeline as any other order —
// no parallel workflow to maintain.
router.post('/wagons', async (req, res) => {
  const { wagon_number, product_id, quantity, rate, location_id, arrival_date, remarks, allocations } = req.body as {
    wagon_number: string; product_id: number; quantity: number; rate: number; location_id: number;
    arrival_date: string; remarks?: string; allocations: AllocationInput[];
  };
  const client = await pool.connect();
  try {
    if (!wagon_number?.trim() || !product_id || !quantity || !location_id || !arrival_date) {
      client.release();
      return res.status(400).json({ error: 'wagon_number, product_id, quantity, location_id, arrival_date are required' });
    }
    const allocated = (allocations || []).reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    if (allocated > Number(quantity)) {
      client.release();
      return res.status(400).json({ error: `Allocated (${allocated}) exceeds wagon quantity (${quantity})` });
    }

    await client.query('BEGIN');

    const purchase = (await client.query(
      `INSERT INTO purchases (date, product_id, quantity, purchase_rate, source, location_id, vehicle_number, remarks)
       VALUES ($1,$2,$3,$4,'rail_rack',$5,$6,$7) RETURNING *`,
      [arrival_date, product_id, quantity, rate || 0, location_id, wagon_number.trim(), remarks || null]
    )).rows[0];

    const wagon = (await client.query(
      `INSERT INTO rail_wagons (wagon_number, product_id, quantity, rate, location_id, arrival_date, purchase_id, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [wagon_number.trim(), product_id, quantity, rate || 0, location_id, arrival_date, purchase.id, remarks || null, req.user!.id]
    )).rows[0];

    const createdDispatches: number[] = [];
    for (const a of (allocations || []).filter((x) => Number(x.quantity) > 0)) {
      let dispatchId: number | null = null;

      if (a.outcome === 'platform_dump') {
        // Stays put — no dispatch needed, it's just unallocated stock at this location.
      } else if (a.outcome === 'direct_wagon' || a.outcome === 'exchange') {
        if (!a.party_id) throw Object.assign(new Error(`${a.outcome === 'direct_wagon' ? 'Direct from wagon' : 'Exchange'} needs a party`), { code: undefined });
        const dispatch = (await client.query(
          `INSERT INTO dispatches (date, kind, party_id, product_id, quantity, source_location_id, destination_type, status, punched_by, remarks)
           VALUES ($1,'sale',$2,$3,$4,$5,'customer_site','punched',$6,$7) RETURNING id`,
          [arrival_date, a.party_id, product_id, a.quantity, location_id, req.user!.id, a.outcome === 'exchange' ? 'Rail rack exchange' : 'Direct from wagon']
        )).rows[0];
        dispatchId = dispatch.id;
        createdDispatches.push(dispatch.id);
      } else if (a.outcome === 'godown_transfer') {
        if (!a.destination_location_id) throw new Error('Godown transfer needs a destination location');
        const destLoc = (await client.query('SELECT type FROM locations WHERE id=$1', [a.destination_location_id])).rows[0];
        const destType = destLoc?.type === 'rented_godown' ? 'rented_godown' : 'own_godown';
        const dispatch = (await client.query(
          `INSERT INTO dispatches (date, kind, product_id, quantity, source_location_id, destination_type, destination_location_id, status, punched_by, remarks)
           VALUES ($1,'stock_transfer',$2,$3,$4,$5,$6,'punched',$7,'Rail rack godown transfer') RETURNING id`,
          [arrival_date, product_id, a.quantity, location_id, destType, a.destination_location_id, req.user!.id]
        )).rows[0];
        dispatchId = dispatch.id;
        createdDispatches.push(dispatch.id);
      }

      await client.query(
        `INSERT INTO rail_wagon_allocations (wagon_id, outcome, quantity, party_id, destination_location_id, dispatch_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [wagon.id, a.outcome, a.quantity, a.party_id || null, a.destination_location_id || null, dispatchId]
      );
    }

    await client.query('COMMIT');

    for (const dispatchId of createdDispatches) {
      await notifyEvent({
        dispatchId,
        eventType: 'order_punched',
        recipientRole: 'godown_manager',
        message: `Rail wagon ${wagon.wagon_number} allocation ready — DSP-${1000 + dispatchId}. Please load and dispatch.`,
      });
    }

    res.json(wagon);
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: friendlyError(e, e.message) });
  } finally {
    client.release();
  }
});

export default router;
